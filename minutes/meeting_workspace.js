/*
Version: v1.1.0
Change: 2026-09-18 - Make this a pre-meeting workspace with source-based board documents and a chapter editor for the assembly booklet.
*/
import { supabase } from '../shared/supabase-client.js';
import { MinutesService } from './MinutesService.js?v=1.0.49';
import { MeetingPackageService } from './MeetingPackageService.js?v=1.0.2';
import { buildPreMeetingDocuments, usesChapterEditor } from './meeting_templates.js?v=1.0.0';

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { BOARD: '이사회', GENERAL_ASSEMBLY: '대의원총회' };
const KIND_LABEL = { REPORT: '보고 안건', DECISION: '의결 안건', DISCUSSION: '논의 안건', OTHER: '기타 안건' };
const DOC_LABEL = { MATERIALS: '회의 자료', SCENARIO: '진행 시나리오' };
const STATUS_LABEL = { DRAFT: '초안', READY: '회의 전 문서 준비', FINAL: '완료' };

const state = {
  session: null,
  runtime: null,
  company: {},
  officials: [],
  meetingHistory: [],
  packages: [],
  current: null,
  agendas: [],
  documents: new Map(),
  activeDocument: 'MATERIALS',
  currentStep: 'info',
  documentDirty: false,
  chapters: [],
  activeChapterId: null,
  loading: false,
  autoDraftTimer: null
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sanitizeHtml(value) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(value || '')}</div>`, 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,form,input,button,textarea,select,link,meta,base').forEach(node => node.remove());
  doc.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const attrValue = String(attr.value || '').trim().toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || ((name === 'href' || name === 'src') && attrValue.startsWith('javascript:'))) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return doc.body.firstElementChild?.innerHTML || '';
}

function formatDate(value) {
  const raw = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return raw || '-';
  return `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

function formatDateTimeShort(row) {
  if (!row?.meeting_date) return '일정 미정';
  const time = row.start_time ? ` ${String(row.start_time).slice(0, 5)}` : '';
  return `${formatDate(row.meeting_date)}${time}`;
}

function meetingYear(row) {
  const text = `${row?.meeting_number || ''} ${row?.title || ''}`;
  const titleYear = text.match(/((?:19|20)\d{2})\s*년?/);
  if (titleYear) return Number(titleYear[1]);
  const dateValue = row?.meeting_date || row?.created_at;
  const dateYear = String(dateValue || '').match(/^((?:19|20)\d{2})/);
  return dateYear ? Number(dateYear[1]) : null;
}

function meetingSequence(row) {
  const text = `${row?.meeting_number || ''} ${row?.title || ''}`;
  const numbered = text.match(/제\s*(\d+)\s*차/);
  if (numbered) return Number(numbered[1]);
  const yearRound = text.match(/(?:19|20)\d{2}\s*[-년]\s*(\d+)\s*회/);
  return yearRound ? Number(yearRound[1]) : null;
}

function meetingTypeOf(row) {
  if (row?.meeting_type) return row.meeting_type;
  const text = String(row?.title || '');
  if (text.includes('총회')) return 'GENERAL_ASSEMBLY';
  if (text.includes('이사회')) return 'BOARD';
  return null;
}

function suggestedMeeting(type, year = new Date().getFullYear()) {
  const previous = [...state.packages, ...state.meetingHistory]
    .filter(row => meetingTypeOf(row) === type && meetingYear(row) === year)
    .map(meetingSequence)
    .filter(value => Number.isInteger(value) && value > 0);
  const sequence = (previous.length ? Math.max(...previous) : 0) + 1;
  return {
    meetingNumber: `${year}-${sequence}회`,
    title: `${year}년 제${sequence}차 ${type === 'GENERAL_ASSEMBLY' ? '대의원총회' : '이사회'}`
  };
}

function fillNewPackageSuggestion() {
  const suggestion = suggestedMeeting($('newMeetingType').value);
  $('newMeetingNumber').value = suggestion.meetingNumber;
  $('newMeetingTitle').value = suggestion.title;
}

function showToast(message, duration = 2200) {
  const toast = $('toast');
  toast.textContent = String(message || '');
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), duration);
}

function setBusy(value) {
  state.loading = value;
  document.querySelectorAll('button').forEach(button => {
    if (button.dataset.allowWhileBusy === 'true') return;
    button.disabled = value;
  });
}

function hasLocalAdminHint() {
  try {
    const user = JSON.parse(localStorage.getItem('erp_user') || 'null');
    const permissions = new Set(JSON.parse(localStorage.getItem('erp_permissions') || '[]'));
    return user?.role === 'admin' || user?.role === 'admin_all' || permissions.has('member.admin') || permissions.has('site.admin');
  } catch (_) {
    return false;
  }
}

function officialName(row) {
  return String(row?.name || '').trim() || `명단 #${row?.id || '-'}`;
}

function officialRole(row) {
  return String(row?.role || row?.position || row?.category || '').trim();
}

function officialById(id) {
  return state.officials.find(row => String(row.id) === String(id)) || null;
}

function currentTypeOfficials(type) {
  if (type === 'GENERAL_ASSEMBLY') return state.officials.filter(row => row.category === 'delegate');
  return state.officials.filter(row => row.category === 'executive' && ['이사장', '이사'].includes(officialRole(row)));
}

function chairCandidates() {
  return state.officials.filter(row => row.category === 'executive' && ['이사장', '이사'].includes(officialRole(row)));
}

function renderPackages() {
  const list = $('packageList');
  if (!state.packages.length) {
    list.innerHTML = '<div class="empty">아직 준비 중인 회의가 없습니다.<br>새 회의 준비를 눌러 시작하세요.</div>';
    return;
  }
  list.innerHTML = state.packages.map(row => `
    <button type="button" class="package-item ${state.current?.id === row.id ? 'active' : ''}" data-package-id="${escapeHtml(row.id)}">
      <span class="status ${escapeHtml(row.status)}">${escapeHtml(STATUS_LABEL[row.status] || row.status)}</span>
      <strong>${escapeHtml(row.title)}</strong>
      <small>${escapeHtml(TYPE_LABEL[row.meeting_type] || row.meeting_type)} · ${escapeHtml(formatDateTimeShort(row))}${row.location ? ` · ${escapeHtml(row.location)}` : ''}</small>
    </button>
  `).join('');
}

async function loadPackages(selectId = null) {
  const { data, error } = await MeetingPackageService.listPackages();
  if (error) throw error;
  state.packages = data;
  renderPackages();
  if (selectId) await openPackage(selectId);
}

function renderEditorHeader() {
  const row = state.current;
  $('editorTitle').textContent = row?.title || '회의 준비';
  $('editorMeta').textContent = `${TYPE_LABEL[row?.meeting_type] || '-'} · ${formatDateTimeShort(row)}${row?.location ? ` · ${row.location}` : ''}`;
  $('editorStatus').className = `status ${row?.status || 'DRAFT'}`;
  $('editorStatus').textContent = STATUS_LABEL[row?.status] || '초안';
}

function renderChairOptions(selectedId = null) {
  const options = chairCandidates();
  $('chairOfficial').innerHTML = '<option value="">선택하세요</option>' + options.map(row => `
    <option value="${row.id}" ${String(row.id) === String(selectedId || '') ? 'selected' : ''}>${escapeHtml(officialRole(row))} ${escapeHtml(officialName(row))}</option>
  `).join('');
}

function fillInfoForm() {
  const row = state.current;
  $('meetingType').value = row.meeting_type;
  $('meetingNumber').value = row.meeting_number || '';
  $('meetingTitle').value = row.title || '';
  $('noticeDate').value = row.notice_date || '';
  $('meetingDate').value = row.meeting_date || '';
  $('meetingLocation').value = row.location || '';
  $('startTime').value = row.start_time ? String(row.start_time).slice(0, 5) : '';
  $('endTime').value = row.end_time ? String(row.end_time).slice(0, 5) : '';
  $('facilitatorName').value = row.facilitator_name || '';
  $('eligibleCount').value = row.eligible_count ?? currentTypeOfficials(row.meeting_type).length;
  $('openingMessage').value = row.opening_message || '';
  $('closingMessage').value = row.closing_message || '';
  $('documentNotes').value = row.document_notes || '';
  $('privateNotes').value = row.private_notes || '';
  renderChairOptions(row.chair_official_id);
  $('eligibleCountLabel').textContent = row.meeting_type === 'GENERAL_ASSEMBLY' ? '재적 대의원 수' : '재적 이사 수';
  updateDocumentModeLabels();
}

function renderAgendaList() {
  const container = $('agendaList');
  if (!state.agendas.length) {
    container.innerHTML = '<div class="empty">등록된 안건이 없습니다.<br>보고·의결·논의할 안건을 추가해 주세요.</div>';
    return;
  }
  container.innerHTML = state.agendas.map((row, index) => `
    <article class="agenda-card" data-agenda-index="${index}" data-agenda-id="${escapeHtml(row.id || '')}">
      <div class="agenda-head">
        <span class="agenda-number">${index + 1}</span>
        <select data-field="agenda_kind">
          ${Object.entries(KIND_LABEL).map(([value, label]) => `<option value="${value}" ${row.agenda_kind === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <input data-field="title" value="${escapeHtml(row.title || '')}" placeholder="안건 제목">
        <div class="agenda-actions">
          <button type="button" data-agenda-action="up" title="위로">↑</button>
          <button type="button" data-agenda-action="down" title="아래로">↓</button>
          <button type="button" data-agenda-action="delete" title="삭제">×</button>
        </div>
      </div>
      <div class="agenda-details">
        <div class="field"><label>한눈에 보는 내용</label><textarea data-field="summary" placeholder="목차와 안건 요약에 사용할 짧은 설명">${escapeHtml(row.summary || '')}</textarea></div>
        <div class="field"><label>배경·필요성</label><textarea data-field="background" placeholder="왜 이 안건을 다루는지">${escapeHtml(row.background || '')}</textarea></div>
        <div class="field"><label>제안·보고 본문</label><textarea data-field="proposal_text" placeholder="자료집에 들어갈 핵심 내용">${escapeHtml(row.proposal_text || '')}</textarea></div>
        <div class="field"><label>사무국 설명</label><textarea data-field="office_report" placeholder="진행 시나리오의 설명 담당 문구">${escapeHtml(row.office_report || '')}</textarea></div>
        <div class="field"><label>진행 참고</label><textarea data-field="scenario_notes" placeholder="질의 순서, 소개할 사람, 주의할 점">${escapeHtml(row.scenario_notes || '')}</textarea></div>
        <div class="field"><label>의결 문구 초안</label><textarea data-field="decision_draft" placeholder="보고 안건이면 비워도 됩니다.">${escapeHtml(row.decision_draft || '')}</textarea></div>
        <div class="field" style="grid-column:1/-1;"><label>문서에 넣을 안건 메모</label><textarea data-field="document_notes" placeholder="회의자료와 시나리오에 함께 남길 보충 설명이나 메모를 적으세요.">${escapeHtml(row.document_notes || '')}</textarea></div>
        <div class="field" style="grid-column:1/-1;"><label>비공개 안건 메모</label><textarea data-field="private_notes" placeholder="확인할 일과 내부 메모. 문서에는 자동 포함되지 않습니다.">${escapeHtml(row.private_notes || '')}</textarea></div>
      </div>
    </article>
  `).join('');
}

function collectAgendasFromDom() {
  return [...document.querySelectorAll('.agenda-card')].map((card, index) => {
    const row = state.agendas[index] || {};
    const value = (name) => card.querySelector(`[data-field="${name}"]`)?.value.trim() || '';
    return {
      ...(row.id ? { id: row.id } : {}),
      agenda_kind: value('agenda_kind') || 'DECISION',
      title: value('title'),
      summary: value('summary'),
      background: value('background'),
      proposal_text: value('proposal_text'),
      office_report: value('office_report'),
      scenario_notes: value('scenario_notes'),
      decision_draft: value('decision_draft'),
      decision_result: row.decision_result || '',
      discussion_notes: row.discussion_notes || '',
      document_notes: value('document_notes'),
      private_notes: value('private_notes')
    };
  });
}

function updateDocumentModeLabels() {
  const assembly = $('meetingType').value === 'GENERAL_ASSEMBLY';
  $('materialsTab').textContent = assembly ? '📚 총회 자료집' : '📄 이사회 회의자료';
  $('documentModeNotice').textContent = assembly
    ? '기존 2026 총회 HTML 자료집 순서대로 챕터가 준비됩니다. 왼쪽에서 한 챕터씩 골라 수정하고 전체 자료집으로 저장·인쇄할 수 있습니다.'
    : '기존 제6차 이사회 문서를 기준으로 한 장짜리 회의자료와 진행 시나리오를 준비합니다.';
}

function chapterMode() {
  return Boolean(state.current && usesChapterEditor(state.current.meeting_type, state.activeDocument));
}

function parseChapters(content) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(content || '')}</div>`, 'text/html');
  return [...doc.querySelectorAll('section.meeting-chapter[data-chapter-id]')].map((section, index) => ({
    id: section.dataset.chapterId || `chapter-${index + 1}`,
    title: section.dataset.chapterTitle || `챕터 ${index + 1}`,
    className: section.className || 'meeting-chapter',
    html: section.innerHTML
  }));
}

function composeChapters() {
  return state.chapters.map((chapter) => `<section class="${escapeHtml(chapter.className || 'meeting-chapter')}" data-chapter-id="${escapeHtml(chapter.id)}" data-chapter-title="${escapeHtml(chapter.title)}">${sanitizeHtml(chapter.html)}</section>`).join('');
}

function activeChapterIndex() {
  return Math.max(0, state.chapters.findIndex(chapter => chapter.id === state.activeChapterId));
}

function rememberActiveChapter() {
  if (!chapterMode() || !state.chapters.length || !$('chapterEditor')) return;
  const index = activeChapterIndex();
  state.chapters[index] = {
    ...state.chapters[index],
    title: $('chapterTitle').value.trim() || `챕터 ${index + 1}`,
    html: sanitizeHtml($('chapterEditor').innerHTML)
  };
}

function renderChapterList() {
  $('chapterList').innerHTML = state.chapters.map((chapter, index) => `
    <button type="button" class="chapter-item ${chapter.id === state.activeChapterId ? 'active' : ''}" data-chapter-id="${escapeHtml(chapter.id)}">
      <span>${index + 1}</span><strong>${escapeHtml(chapter.title)}</strong>
    </button>`).join('');
}

function renderActiveChapter() {
  if (!state.chapters.length) {
    $('chapterTitle').value = '';
    $('chapterEditor').innerHTML = '<p>자료집 챕터가 없습니다.</p>';
    $('chapterPosition').textContent = '';
    renderChapterList();
    return;
  }
  const index = activeChapterIndex();
  const chapter = state.chapters[index];
  state.activeChapterId = chapter.id;
  $('chapterTitle').value = chapter.title;
  $('chapterEditor').innerHTML = sanitizeHtml(chapter.html);
  $('chapterPosition').textContent = `${index + 1} / ${state.chapters.length}`;
  $('previousChapterButton').disabled = index === 0;
  $('nextChapterButton').disabled = index >= state.chapters.length - 1;
  $('moveChapterUpButton').disabled = index === 0;
  $('moveChapterDownButton').disabled = index >= state.chapters.length - 1;
  renderChapterList();
}

function renderActiveDocument() {
  const doc = state.documents.get(state.activeDocument) || {};
  $('documentTitle').value = doc.title || defaultDocumentTitle(state.activeDocument);
  const useChapters = chapterMode();
  $('documentEditor').hidden = useChapters;
  $('chapterLayout').hidden = !useChapters;
  if (useChapters) {
    state.chapters = parseChapters(doc.content_html || '');
    if (!state.chapters.length) {
      const generated = generatedDocumentRows().find(row => row.type === 'MATERIALS');
      state.chapters = parseChapters(generated?.content || '');
      const legacyContent = sanitizeHtml(doc.content_html || '').trim();
      if (legacyContent) {
        state.chapters.push({
          id: `legacy-draft-${Date.now()}`,
          title: '이전 자료 초안',
          className: 'meeting-chapter chapter-legacy',
          html: `<h1>이전 자료 초안</h1>${legacyContent}`
        });
      }
    }
    if (!state.chapters.some(chapter => chapter.id === state.activeChapterId)) state.activeChapterId = state.chapters[0]?.id || null;
    renderActiveChapter();
  } else {
    state.chapters = [];
    state.activeChapterId = null;
    $('documentEditor').innerHTML = sanitizeHtml(doc.content_html || '');
  }
  state.documentDirty = false;
  document.querySelectorAll('.doc-tab').forEach(button => button.classList.toggle('active', button.dataset.document === state.activeDocument));
}

function rememberActiveDocument() {
  if (!state.current) return;
  const existing = state.documents.get(state.activeDocument) || {};
  if (chapterMode()) rememberActiveChapter();
  state.documents.set(state.activeDocument, {
    ...existing,
    document_type: state.activeDocument,
    title: $('documentTitle').value.trim() || defaultDocumentTitle(state.activeDocument),
    content_html: chapterMode() ? sanitizeHtml(composeChapters()) : sanitizeHtml($('documentEditor').innerHTML),
    manually_edited: state.documentDirty || existing.manually_edited === true
  });
}

function defaultDocumentTitle(type) {
  const title = state.current?.title || '회의';
  if (type === 'MATERIALS') return state.current?.meeting_type === 'GENERAL_ASSEMBLY' ? `${title} 자료집` : `${title} 회의자료`;
  return `${title} 진행 시나리오`;
}

function generatedDocumentRows() {
  const chair = officialById(state.current?.chair_official_id);
  const chairName = chair ? `${officialRole(chair)} ${officialName(chair)}` : '의장';
  return buildPreMeetingDocuments({
    row: state.current,
    agendas: state.agendas,
    coopName: state.runtime?.coop_name || state.company.company_name || '협동조합',
    company: state.company,
    chairName
  });
}

function collectPackageDraftPayload() {
  return {
    meeting_type: $('meetingType').value,
    meeting_number: $('meetingNumber').value.trim() || null,
    title: $('meetingTitle').value.trim() || state.current?.title || '회의',
    notice_date: $('noticeDate').value || null,
    meeting_date: $('meetingDate').value || null,
    start_time: $('startTime').value || null,
    end_time: $('endTime').value || null,
    location: $('meetingLocation').value.trim() || null,
    chair_official_id: $('chairOfficial').value ? Number($('chairOfficial').value) : null,
    facilitator_name: $('facilitatorName').value.trim() || null,
    eligible_count: $('eligibleCount').value === '' ? null : Number($('eligibleCount').value),
    opening_message: $('openingMessage').value.trim() || null,
    closing_message: $('closingMessage').value.trim() || null,
    document_notes: $('documentNotes').value.trim() || null,
    private_notes: $('privateNotes').value.trim() || null
  };
}

function syncWorkingStateFromForms() {
  if (!state.current || $('editorBody').hidden) return;
  state.current = { ...state.current, ...collectPackageDraftPayload() };
  state.agendas = collectAgendasFromDom();
  renderEditorHeader();
}

function refreshAutoDrafts({ force = false, render = true } = {}) {
  if (!state.current) return;
  const activeExisting = state.documents.get(state.activeDocument) || {};
  const activeProtected = !force && (state.documentDirty || activeExisting.manually_edited === true);
  for (const row of generatedDocumentRows()) {
    const existing = state.documents.get(row.type) || {};
    if (!force && (existing.manually_edited === true || (row.type === state.activeDocument && state.documentDirty))) continue;
    state.documents.set(row.type, {
      ...existing,
      document_type: row.type,
      title: row.title,
      content_html: sanitizeHtml(row.content),
      manually_edited: false,
      live_preview: true
    });
  }
  if (render && state.currentStep === 'documents' && !activeProtected) renderActiveDocument();
}

function scheduleAutoDraftRefresh() {
  window.clearTimeout(state.autoDraftTimer);
  state.autoDraftTimer = window.setTimeout(() => {
    syncWorkingStateFromForms();
    refreshAutoDrafts();
  }, 180);
}

function validateSchedule() {
  const notice = $('noticeDate').value;
  const meeting = $('meetingDate').value;
  if (notice && meeting) {
    const noticeTime = Date.parse(`${notice}T00:00:00Z`);
    const meetingTime = Date.parse(`${meeting}T00:00:00Z`);
    if ((meetingTime - noticeTime) / 86400000 < 7) throw new Error('회의일은 공고일로부터 최소 7일 뒤여야 합니다.');
  }
  if ($('startTime').value && $('endTime').value && $('endTime').value <= $('startTime').value) {
    throw new Error('종료 시각은 시작 시각보다 늦어야 합니다.');
  }
}

function collectPackagePayload() {
  validateSchedule();
  const payload = collectPackageDraftPayload();
  if (!$('meetingTitle').value.trim()) throw new Error('회의 제목을 입력하세요.');
  return payload;
}

async function saveInfo({ quiet = false } = {}) {
  if (!state.current) return false;
  const payload = collectPackagePayload();
  const { data, error } = await MeetingPackageService.updatePackage(state.current.id, payload);
  if (error) throw error;
  state.current = data;
  const index = state.packages.findIndex(row => row.id === data.id);
  if (index >= 0) state.packages[index] = { ...state.packages[index], ...data };
  renderPackages();
  renderEditorHeader();
  if (!quiet) showToast('기본정보를 저장했습니다.');
  return true;
}

async function saveAgendas({ quiet = false } = {}) {
  if (!state.current) return false;
  const agendas = collectAgendasFromDom();
  if (agendas.some(row => !row.title)) throw new Error('모든 안건의 제목을 입력하세요.');
  const { data, error } = await MeetingPackageService.saveAgendas(state.current.id, agendas);
  if (error) throw error;
  state.agendas = data || [];
  renderAgendaList();
  if (!quiet) showToast('안건을 저장했습니다.');
  return true;
}

async function generateAllDocuments() {
  if (!state.current) return;
  if (state.documentDirty) rememberActiveDocument();
  const hasManualDraft = [...state.documents.values()].some(doc => doc.manually_edited && doc.content_html);
  if (hasManualDraft && !window.confirm('직접 고친 초안이 있습니다. 공통정보와 안건으로 다시 만들면 현재 문구가 바뀝니다. 계속할까요?')) return;
  await saveInfo({ quiet: true });
  await saveAgendas({ quiet: true });
  const generatedAt = new Date().toISOString();
  const rows = generatedDocumentRows();
  for (const row of rows) {
    const existing = state.documents.get(row.type);
    const { data, error } = await MeetingPackageService.saveDocument(state.current.id, row.type, {
      title: row.title,
      content_html: sanitizeHtml(row.content),
      version: Number(existing?.version || 0) + 1,
      manually_edited: false,
      generated_at: generatedAt
    });
    if (error) throw error;
    state.documents.set(row.type, data);
  }
  const update = await MeetingPackageService.updatePackage(state.current.id, { status: 'READY' });
  if (update.error) throw update.error;
  state.current = update.data;
  state.activeDocument = 'MATERIALS';
  renderEditorHeader();
  renderActiveDocument();
  await loadPackages();
  renderPackages();
  showToast(state.current.meeting_type === 'GENERAL_ASSEMBLY'
    ? '총회 자료집 챕터와 진행 시나리오를 다시 만들었습니다.'
    : '이사회 회의자료와 진행 시나리오를 다시 만들었습니다.', 3200);
}

async function saveActiveDocument() {
  if (!state.current) return;
  rememberActiveDocument();
  const row = state.documents.get(state.activeDocument);
  if (!row?.content_html) throw new Error('저장할 문서 내용이 없습니다. 먼저 초안을 만들어 주세요.');
  const { data, error } = await MeetingPackageService.saveDocument(state.current.id, state.activeDocument, {
    title: row.title,
    content_html: row.content_html,
    version: Number(row.version || 1),
    manually_edited: true,
    generated_at: row.generated_at || null
  });
  if (error) throw error;
  state.documents.set(state.activeDocument, data);
  state.documentDirty = false;
  showToast(`${DOC_LABEL[state.activeDocument]}을 저장했습니다.`);
}

function printActiveDocument() {
  rememberActiveDocument();
  const row = state.documents.get(state.activeDocument);
  if (!row?.content_html) return showToast('먼저 초안을 만들어 주세요.');
  const popup = window.open('', '_blank');
  if (!popup) return showToast('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
  popup.opener = null;
  const title = escapeHtml(row.title || defaultDocumentTitle(state.activeDocument));
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title><style>
    @page{size:A4;margin:18mm 16mm 18mm;}*{box-sizing:border-box}body{margin:0;color:#111;font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;font-size:11pt;line-height:1.58}h1{font-size:24pt;line-height:1.3;margin:0 0 18pt}h2{font-size:16pt;line-height:1.4;margin:18pt 0 8pt}h3{font-size:12.5pt;margin:13pt 0 6pt}p,li,td,th{font-size:11pt}table{width:100%;border-collapse:collapse;margin:10pt 0}th,td{border:1px solid #666;padding:7pt;vertical-align:top}.speaker{border-left:3pt solid #fb923c;padding:6pt 8pt;margin:7pt 0;background:#fff7ed}.action{background:#fff7ed;color:#9a3412;padding:6pt 8pt}.source-agenda-row{display:grid;grid-template-columns:95pt 1fr;gap:3pt 9pt;padding:5pt 0;border-bottom:.5pt solid #ccc}.source-agenda-row small{grid-column:2}.board-one-paper h1{text-align:center;font-size:19pt}.board-one-paper h2{font-size:13pt;margin:10pt 0 4pt}.board-one-paper .source-agenda-row{padding:3pt 0}.meeting-chapter{min-height:245mm;page-break-after:always}.meeting-chapter:last-child{page-break-after:auto}.assembly-cover,.assembly-back{min-height:240mm;display:flex;flex-direction:column;justify-content:center}.assembly-cover .org-name{color:#ea580c;font-size:15pt;font-weight:800}.assembly-cover h1,.assembly-back h1{font-size:36pt}.assembly-cover dl{margin-top:40pt;display:grid;grid-template-columns:55pt 1fr;gap:8pt}.assembly-cover dt{font-weight:800}a{color:#111;text-decoration:none}@media print{button{display:none}}
  </style></head><body>${sanitizeHtml(row.content_html)}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`);
  popup.document.close();
}

function printCurrentChapter() {
  if (!chapterMode() || !state.chapters.length) return;
  rememberActiveChapter();
  const chapter = state.chapters[activeChapterIndex()];
  const popup = window.open('', '_blank');
  if (!popup) return showToast('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
  popup.opener = null;
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(chapter.title)}</title><style>
    @page{size:A4;margin:18mm 16mm 18mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;font-size:11pt;line-height:1.58}h1{font-size:24pt;line-height:1.3;margin:0 0 18pt}h2{font-size:16pt;margin:18pt 0 8pt}h3{font-size:12.5pt;margin:13pt 0 6pt}p,li,td,th{font-size:11pt}table{width:100%;border-collapse:collapse;margin:10pt 0}th,td{border:1px solid #666;padding:7pt;vertical-align:top}.assembly-cover,.assembly-back{min-height:240mm;display:flex;flex-direction:column;justify-content:center}.assembly-cover .org-name{color:#ea580c;font-size:15pt;font-weight:800}.assembly-cover h1,.assembly-back h1{font-size:36pt}.assembly-cover dl{margin-top:40pt;display:grid;grid-template-columns:55pt 1fr;gap:8pt}.assembly-cover dt{font-weight:800}
  </style></head><body>${sanitizeHtml(chapter.html)}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`);
  popup.document.close();
}

async function openPackage(id) {
  if (state.documentDirty && !window.confirm('저장하지 않은 문서 수정이 있습니다. 다른 회의를 열까요?')) return;
  setBusy(true);
  try {
    const { data, error } = await MeetingPackageService.getPackage(id);
    if (error) throw error;
    if (!data?.package) throw new Error('회의 준비 자료를 찾을 수 없습니다.');
    state.current = data.package;
    state.agendas = data.agendas || [];
    state.documents = new Map((data.documents || []).map(row => [row.document_type, row]));
    state.activeDocument = 'MATERIALS';
    state.documentDirty = false;
    $('editorPlaceholder').hidden = true;
    $('editorBody').hidden = false;
    renderEditorHeader();
    fillInfoForm();
    renderAgendaList();
    refreshAutoDrafts({ render: false });
    renderActiveDocument();
    renderPackages();
  } finally {
    setBusy(false);
  }
}

async function createPackage() {
  const title = $('newMeetingTitle').value.trim();
  if (!title) throw new Error('회의 제목을 입력하세요.');
  const type = $('newMeetingType').value;
  const candidates = currentTypeOfficials(type);
  const chair = chairCandidates().find(row => officialRole(row) === '이사장') || null;
  const { data, error } = await MeetingPackageService.createPackage({
    meeting_type: type,
    title,
    meeting_number: $('newMeetingNumber').value.trim() || null,
    eligible_count: candidates.length,
    chair_official_id: chair?.id || null
  });
  if (error) throw error;
  $('newPackageModal').classList.remove('show');
  $('newMeetingTitle').value = '';
  $('newMeetingNumber').value = '';
  await loadPackages(data.id);
  showToast(type === 'GENERAL_ASSEMBLY'
    ? '새 총회 준비 공간과 자료집·시나리오 초안을 만들었습니다.'
    : '새 이사회 준비 공간과 회의자료·시나리오 초안을 만들었습니다.');
}

async function deletePackage() {
  if (!state.current) return;
  if (state.current.published_minute_id) throw new Error('전자서명 문서로 넘긴 회의 꾸러미는 삭제할 수 없습니다.');
  if (!window.confirm(`「${state.current.title}」 준비 자료와 초안을 삭제할까요?`)) return;
  const { error } = await MeetingPackageService.deletePackage(state.current.id);
  if (error) throw error;
  state.current = null;
  state.agendas = [];
  state.documents.clear();
  $('editorBody').hidden = true;
  $('editorPlaceholder').hidden = false;
  await loadPackages();
  showToast('회의 준비 자료를 삭제했습니다.');
}

function switchStep(step) {
  state.currentStep = step;
  document.querySelectorAll('.step-tab').forEach(button => button.classList.toggle('active', button.dataset.step === step));
  document.querySelectorAll('.step-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === step));
  if (step === 'documents') {
    syncWorkingStateFromForms();
    refreshAutoDrafts();
  }
}

function addAgenda() {
  state.agendas = collectAgendasFromDom();
  state.agendas.push({ agenda_kind:'DECISION', title:'', summary:'', background:'', proposal_text:'', office_report:'', scenario_notes:'', decision_draft:'', decision_result:'', discussion_notes:'', document_notes:'', private_notes:'' });
  renderAgendaList();
  scheduleAutoDraftRefresh();
  document.querySelector('.agenda-card:last-child input[data-field="title"]')?.focus();
}

function handleAgendaAction(button) {
  const card = button.closest('.agenda-card');
  if (!card) return;
  state.agendas = collectAgendasFromDom();
  const index = Number(card.dataset.agendaIndex);
  const action = button.dataset.agendaAction;
  if (action === 'delete') {
    if (!window.confirm('이 안건을 목록에서 뺄까요? 저장을 누르면 삭제가 확정됩니다.')) return;
    state.agendas.splice(index, 1);
  } else if (action === 'up' && index > 0) {
    [state.agendas[index - 1], state.agendas[index]] = [state.agendas[index], state.agendas[index - 1]];
  } else if (action === 'down' && index < state.agendas.length - 1) {
    [state.agendas[index + 1], state.agendas[index]] = [state.agendas[index], state.agendas[index + 1]];
  }
  renderAgendaList();
  scheduleAutoDraftRefresh();
}

function selectChapter(id) {
  if (!chapterMode()) return;
  rememberActiveChapter();
  state.activeChapterId = id;
  renderActiveChapter();
}

function moveChapter(offset) {
  if (!chapterMode() || !state.chapters.length) return;
  rememberActiveChapter();
  const index = activeChapterIndex();
  const target = index + offset;
  if (target < 0 || target >= state.chapters.length) return;
  [state.chapters[index], state.chapters[target]] = [state.chapters[target], state.chapters[index]];
  state.documentDirty = true;
  renderActiveChapter();
}

function stepChapter(offset) {
  if (!chapterMode() || !state.chapters.length) return;
  rememberActiveChapter();
  const target = activeChapterIndex() + offset;
  if (target < 0 || target >= state.chapters.length) return;
  state.activeChapterId = state.chapters[target].id;
  renderActiveChapter();
}

function addChapter() {
  if (!chapterMode()) return;
  rememberActiveChapter();
  const id = `custom-${Date.now()}`;
  const index = activeChapterIndex();
  state.chapters.splice(index + 1, 0, {
    id,
    title: '새 챕터',
    className: 'meeting-chapter chapter-custom',
    html: '<h1>새 챕터</h1><p>내용을 입력하세요.</p>'
  });
  state.activeChapterId = id;
  state.documentDirty = true;
  renderActiveChapter();
  $('chapterTitle').select();
}

function deleteChapter() {
  if (!chapterMode() || !state.chapters.length) return;
  const index = activeChapterIndex();
  const title = state.chapters[index].title;
  if (!window.confirm(`「${title}」 챕터를 자료집에서 뺄까요? 저장하기 전까지는 새로고침하면 되돌릴 수 있습니다.`)) return;
  state.chapters.splice(index, 1);
  state.activeChapterId = state.chapters[Math.min(index, state.chapters.length - 1)]?.id || null;
  state.documentDirty = true;
  renderActiveChapter();
}

function activeRichEditor() {
  return chapterMode() ? $('chapterEditor') : $('documentEditor');
}

async function runAction(action) {
  if (state.loading) return;
  setBusy(true);
  try { await action(); }
  catch (error) {
    console.error(error);
    showToast(error?.message || '작업을 완료하지 못했습니다.', 3600);
  } finally { setBusy(false); }
}

function bindEvents() {
  $('backToDocuments').addEventListener('click', () => { location.href = '../erp/governance.html'; });
  $('newPackageButton').addEventListener('click', () => {
    fillNewPackageSuggestion();
    $('newPackageModal').classList.add('show');
  });
  $('newMeetingType').addEventListener('change', fillNewPackageSuggestion);
  $('cancelNewPackage').addEventListener('click', () => $('newPackageModal').classList.remove('show'));
  $('createPackageButton').addEventListener('click', () => runAction(createPackage));
  $('deletePackageButton').addEventListener('click', () => runAction(deletePackage));
  $('saveInfoButton').addEventListener('click', () => runAction(saveInfo));
  $('saveAgendasButton').addEventListener('click', () => runAction(saveAgendas));
  $('generateAllButton').addEventListener('click', () => runAction(generateAllDocuments));
  $('saveDocumentButton').addEventListener('click', () => runAction(saveActiveDocument));
  $('printDocumentButton').addEventListener('click', printActiveDocument);
  $('printChapterButton').addEventListener('click', printCurrentChapter);
  $('previousChapterButton').addEventListener('click', () => stepChapter(-1));
  $('nextChapterButton').addEventListener('click', () => stepChapter(1));
  $('addChapterButton').addEventListener('click', addChapter);
  $('moveChapterUpButton').addEventListener('click', () => moveChapter(-1));
  $('moveChapterDownButton').addEventListener('click', () => moveChapter(1));
  $('deleteChapterButton').addEventListener('click', deleteChapter);
  $('chapterList').addEventListener('click', event => {
    const button = event.target.closest('[data-chapter-id]');
    if (button) selectChapter(button.dataset.chapterId);
  });
  $('addAgendaButton').addEventListener('click', addAgenda);
  $('packageList').addEventListener('click', event => {
    const button = event.target.closest('[data-package-id]');
    if (button) openPackage(button.dataset.packageId).catch(error => showToast(error.message));
  });
  document.querySelectorAll('.step-tab').forEach(button => button.addEventListener('click', () => switchStep(button.dataset.step)));
  document.querySelectorAll('.doc-tab').forEach(button => button.addEventListener('click', () => {
    rememberActiveDocument();
    state.activeDocument = button.dataset.document;
    renderActiveDocument();
  }));
  $('meetingType').addEventListener('change', () => {
    const candidates = currentTypeOfficials($('meetingType').value);
    state.current = { ...state.current, meeting_type:$('meetingType').value };
    $('eligibleCount').value = candidates.length;
    $('eligibleCountLabel').textContent = $('meetingType').value === 'GENERAL_ASSEMBLY' ? '재적 대의원 수' : '재적 이사 수';
    updateDocumentModeLabels();
    scheduleAutoDraftRefresh();
  });
  $('chairOfficial').addEventListener('change', scheduleAutoDraftRefresh);
  $('agendaList').addEventListener('click', event => {
    const button = event.target.closest('[data-agenda-action]');
    if (button) handleAgendaAction(button);
  });
  $('editorBody').addEventListener('input', event => {
    if (event.target === $('documentEditor') || event.target === $('documentTitle') || event.target === $('chapterEditor') || event.target === $('chapterTitle') || event.target.closest('#documentEditor,#chapterEditor')) return;
    if (event.target.matches('input,select,textarea')) scheduleAutoDraftRefresh();
  });
  $('editorBody').addEventListener('change', event => {
    if (event.target === $('documentTitle') || event.target === $('chapterTitle')) return;
    if (event.target.matches('input,select,textarea')) scheduleAutoDraftRefresh();
  });
  $('documentEditor').addEventListener('input', () => { state.documentDirty = true; });
  $('chapterEditor').addEventListener('input', () => { state.documentDirty = true; });
  $('chapterTitle').addEventListener('input', () => {
    state.documentDirty = true;
    const index = activeChapterIndex();
    if (state.chapters[index]) state.chapters[index].title = $('chapterTitle').value;
    renderChapterList();
  });
  $('documentTitle').addEventListener('input', () => { state.documentDirty = true; });
  document.querySelectorAll('.rich-toolbar [data-command]').forEach(button => button.addEventListener('click', () => {
    activeRichEditor().focus();
    document.execCommand(button.dataset.command, false, button.dataset.value || null);
    state.documentDirty = true;
  }));
  window.addEventListener('beforeunload', event => {
    if (!state.documentDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

async function init() {
  bindEvents();
  state.session = await MinutesService.getSession();
  if (!state.session) {
    showToast('로그인이 필요합니다.');
    location.href = `/erp/?next=${encodeURIComponent(location.href)}`;
    return;
  }
  const runtimeGate = await window.ErpRuntimeGuard.enforce(supabase, {
    moduleKey:'minutes', moduleLabel:'회의 꾸러미', redirectUrl:`/erp/?next=${encodeURIComponent(location.href)}`, alertFn:showToast
  });
  if (!runtimeGate.ok) return;
  state.runtime = runtimeGate.runtime || await MeetingPackageService.getRuntime();
  const isAdmin = hasLocalAdminHint() || await MinutesService.isAdmin(state.session?.user?.id, state.session?.user?.email);
  if (!isAdmin) {
    showToast('관리자 권한이 필요합니다.');
    window.setTimeout(() => { location.href = '/erp/'; }, 1000);
    return;
  }
  const [officials, companyResult, historyResult] = await Promise.all([
    MinutesService.getOfficials(),
    MinutesService.getCompanyInfo(),
    MeetingPackageService.listMeetingHistory()
  ]);
  if (historyResult.error) throw historyResult.error;
  state.officials = officials || [];
  state.company = companyResult.data || {};
  state.meetingHistory = historyResult.data || [];
  await loadPackages();
}

init().catch(error => {
  console.error(error);
  showToast(error?.message || '회의 꾸러미를 시작하지 못했습니다.', 5000);
});
