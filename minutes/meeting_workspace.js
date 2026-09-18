/*
Version: v1.0.3
Change: 2026-09-18 - Suggest editable meeting sequences, move attendance to the minutes stage, and keep live document drafts.
*/
import { supabase } from '../shared/supabase-client.js';
import { MinutesService } from './MinutesService.js?v=1.0.49';
import { MeetingPackageService } from './MeetingPackageService.js?v=1.0.2';

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { BOARD: '이사회', GENERAL_ASSEMBLY: '대의원총회' };
const KIND_LABEL = { REPORT: '보고 안건', DECISION: '의결 안건', DISCUSSION: '논의 안건', OTHER: '기타 안건' };
const DOC_LABEL = { MATERIALS: '회의 자료', SCENARIO: '진행 시나리오', MINUTES: '의사록 초안' };
const STATUS_LABEL = { DRAFT: '초안', READY: '문서 준비', FINAL: '전자서명 연결' };

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

function textBlocks(value) {
  return escapeHtml(String(value || '').trim()).replace(/\n/g, '<br>');
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

function namesByIds(ids) {
  return (Array.isArray(ids) ? ids : []).map(officialById).filter(Boolean).map(officialName);
}

function selectedIds(containerId) {
  return [...document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)]
    .map(input => Number(input.value))
    .filter(Number.isFinite);
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

function renderOfficialChecks() {
  const type = $('meetingType').value;
  const candidates = currentTypeOfficials(type);
  const attendeeSet = new Set((state.current?.attendee_official_ids || []).map(Number));
  const signerSet = new Set((state.current?.signer_official_ids || []).map(Number));
  const chairId = Number(state.current?.chair_official_id || 0);
  if (chairId) signerSet.add(chairId);
  const choice = (row, set, kind) => `
    <label class="official-choice">
      <input type="checkbox" name="${kind}" value="${row.id}" ${set.has(Number(row.id)) ? 'checked' : ''}>
      <span><strong>${escapeHtml(officialName(row))}</strong><small>${escapeHtml(officialRole(row))}</small></span>
    </label>`;
  $('attendeeOfficials').innerHTML = candidates.length ? candidates.map(row => choice(row, attendeeSet, 'attendee')).join('') : '<div class="help">등록된 현직 명단이 없습니다.</div>';
  $('signerOfficials').innerHTML = candidates.length ? candidates.map(row => choice(row, signerSet, 'signer')).join('') : '<div class="help">등록된 현직 명단이 없습니다.</div>';
  const isAssembly = type === 'GENERAL_ASSEMBLY';
  $('eligibleCountLabel').textContent = isAssembly ? '재적 대의원 수' : '재적 이사 수';
  $('attendeeLabel').textContent = isAssembly ? '참석 대의원' : '참석 이사';
  $('signerLabel').textContent = isAssembly ? '기명날인인·전자서명 대상' : '전자서명 대상';
  $('signerHelp').textContent = isAssembly
    ? '참석 대의원과 별개로 이사장과 기명날인인을 선택하세요. 이사장은 기본 포함합니다.'
    : '참석한 이사를 기본 서명 대상으로 사용하되 필요하면 따로 조정할 수 있습니다.';
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
  $('observers').value = row.observers || '';
  $('openingMessage').value = row.opening_message || '';
  $('closingMessage').value = row.closing_message || '';
  $('documentNotes').value = row.document_notes || '';
  $('privateNotes').value = row.private_notes || '';
  renderChairOptions(row.chair_official_id);
  renderOfficialChecks();
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
        <div class="field"><label>실제 의결·처리 결과</label><textarea data-field="decision_result" placeholder="회의 후 채워 의사록에 반영합니다.">${escapeHtml(row.decision_result || '')}</textarea></div>
        <div class="field"><label>주요 질의·논의</label><textarea data-field="discussion_notes" placeholder="회의 후 핵심 논의 내용을 정리합니다.">${escapeHtml(row.discussion_notes || '')}</textarea></div>
        <div class="field" style="grid-column:1/-1;"><label>문서에 넣을 안건 메모</label><textarea data-field="document_notes" placeholder="세 문서에 함께 남길 보충 설명이나 메모를 적으세요.">${escapeHtml(row.document_notes || '')}</textarea></div>
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
      decision_result: value('decision_result'),
      discussion_notes: value('discussion_notes'),
      document_notes: value('document_notes'),
      private_notes: value('private_notes')
    };
  });
}

function renderActiveDocument() {
  const doc = state.documents.get(state.activeDocument) || {};
  $('documentTitle').value = doc.title || defaultDocumentTitle(state.activeDocument);
  $('documentEditor').innerHTML = sanitizeHtml(doc.content_html || '');
  state.documentDirty = false;
  document.querySelectorAll('.doc-tab').forEach(button => button.classList.toggle('active', button.dataset.document === state.activeDocument));
  $('publicationBox').style.display = state.activeDocument === 'MINUTES' ? '' : 'none';
}

function rememberActiveDocument() {
  if (!state.current) return;
  const existing = state.documents.get(state.activeDocument) || {};
  state.documents.set(state.activeDocument, {
    ...existing,
    document_type: state.activeDocument,
    title: $('documentTitle').value.trim() || defaultDocumentTitle(state.activeDocument),
    content_html: sanitizeHtml($('documentEditor').innerHTML),
    manually_edited: state.documentDirty || existing.manually_edited === true
  });
}

function defaultDocumentTitle(type) {
  const title = state.current?.title || '회의';
  if (type === 'MATERIALS') return `${title} 자료`;
  if (type === 'SCENARIO') return `${title} 진행 시나리오`;
  return `${title} 의사록`;
}

function meetingMetaTable(row, { includeAttendance = false } = {}) {
  const attendeeNames = namesByIds(row.attendee_official_ids);
  const membershipLabel = row.meeting_type === 'GENERAL_ASSEMBLY' ? '대의원' : '이사';
  return `<table><tbody>
    ${row.meeting_number ? `<tr><th style="width:22%;">회차</th><td>${escapeHtml(row.meeting_number)}</td></tr>` : ''}
    <tr><th style="width:22%;">일시</th><td>${escapeHtml(formatDate(row.meeting_date))} ${escapeHtml(String(row.start_time || '').slice(0,5))}${row.end_time ? ` ~ ${escapeHtml(String(row.end_time).slice(0,5))}` : ''}</td></tr>
    <tr><th>장소</th><td>${escapeHtml(row.location || '-')}</td></tr>
    <tr><th>재적 ${membershipLabel}</th><td>${Number(row.eligible_count || 0)}명</td></tr>
    ${includeAttendance ? `<tr><th>참석 ${membershipLabel}</th><td>${attendeeNames.length ? `${attendeeNames.length}명 (${escapeHtml(attendeeNames.join(', '))})` : '회의 후 입력'}</td></tr>` : ''}
    ${includeAttendance && row.observers ? `<tr><th>배석</th><td>${textBlocks(row.observers)}</td></tr>` : ''}
  </tbody></table>`;
}

function agendaOrdinal(row, index) {
  if (row.agenda_kind === 'REPORT') return `보고 제${index + 1}호`;
  if (row.agenda_kind === 'DECISION') return `의결 제${index + 1}호`;
  if (row.agenda_kind === 'DISCUSSION') return `논의 제${index + 1}호`;
  return `기타 제${index + 1}호`;
}

function buildMaterials() {
  const row = state.current;
  const coopName = state.runtime?.coop_name || state.company.company_name || '협동조합';
  const agendaList = state.agendas.map((agenda, index) => `<li><strong>${escapeHtml(agendaOrdinal(agenda, index))}</strong> ${escapeHtml(agenda.title)}</li>`).join('');
  const detail = state.agendas.map((agenda, index) => `
    <section class="agenda-section">
      <h2>${escapeHtml(agendaOrdinal(agenda, index))}. ${escapeHtml(agenda.title)}</h2>
      ${agenda.summary ? `<p><strong>주요 내용</strong><br>${textBlocks(agenda.summary)}</p>` : ''}
      ${agenda.background ? `<h3>제안 배경</h3><p>${textBlocks(agenda.background)}</p>` : ''}
      ${agenda.proposal_text ? `<h3>${agenda.agenda_kind === 'REPORT' ? '보고 내용' : '제안 내용'}</h3><p>${textBlocks(agenda.proposal_text)}</p>` : ''}
      ${agenda.decision_draft ? `<h3>의결 문구(안)</h3><p>${textBlocks(agenda.decision_draft)}</p>` : ''}
      ${agenda.document_notes ? `<h3>안건 메모</h3><p>${textBlocks(agenda.document_notes)}</p>` : ''}
    </section><div class="page-break"></div>`).join('');
  return `<div class="doc-cover">
    <div class="accent" style="font-size:1.15em;font-weight:800;">${escapeHtml(coopName)}</div>
    <h1>${escapeHtml(row.title)}</h1>
    <p style="font-size:1.12em;"><strong>일시</strong> ${escapeHtml(formatDate(row.meeting_date))} ${escapeHtml(String(row.start_time || '').slice(0,5))}<br><strong>장소</strong> ${escapeHtml(row.location || '-')}</p>
  </div>
  <h2>회의 개요</h2>${meetingMetaTable(row)}
  ${row.document_notes ? `<h2>회의 메모</h2><p>${textBlocks(row.document_notes)}</p>` : ''}
  <h2>회의 순서</h2><ol>${agendaList || '<li>등록된 안건이 없습니다.</li>'}</ol>
  <div class="page-break"></div>${detail}`;
}

function buildScenario() {
  const row = state.current;
  const chair = officialById(row.chair_official_id);
  const chairName = chair ? `${officialRole(chair)} ${officialName(chair)}` : '의장';
  const facilitator = row.facilitator_name || '사무국';
  const attendeeCount = (row.attendee_official_ids || []).length;
  const agendaBlocks = state.agendas.map((agenda, index) => {
    const ordinal = agendaOrdinal(agenda, index);
    if (agenda.agenda_kind === 'REPORT') {
      return `<h2>${escapeHtml(ordinal)}. ${escapeHtml(agenda.title)}</h2>
        <p class="speaker"><strong>의장</strong> ${escapeHtml(agenda.title)} 보고를 진행하겠습니다. ${escapeHtml(facilitator)}께서 설명해 주시기 바랍니다.</p>
        <p class="speaker"><strong>${escapeHtml(facilitator)}</strong> ${textBlocks(agenda.office_report || agenda.proposal_text || agenda.summary || '자료에 따라 보고드리겠습니다.')}</p>
        <p class="speaker"><strong>의장</strong> 보고 내용에 대해 질문이나 의견 있으십니까?</p>
        ${agenda.scenario_notes ? `<p><strong>진행 참고</strong><br>${textBlocks(agenda.scenario_notes)}</p>` : ''}
        ${agenda.document_notes ? `<p><strong>안건 메모</strong><br>${textBlocks(agenda.document_notes)}</p>` : ''}`;
    }
    return `<h2>${escapeHtml(ordinal)}. ${escapeHtml(agenda.title)}</h2>
      <p class="speaker"><strong>의장</strong> ${escapeHtml(ordinal)} 「${escapeHtml(agenda.title)}」을 상정합니다.</p>
      <p class="speaker"><strong>${escapeHtml(facilitator)}</strong> ${textBlocks(agenda.office_report || agenda.proposal_text || agenda.summary || '자료에 따라 제안 설명을 드리겠습니다.')}</p>
      <p class="speaker"><strong>의장</strong> 설명 잘 들었습니다. 질문이나 의견 있으십니까?</p>
      <p class="speaker"><strong>의장</strong> 더 이상 의견이 없으시면 ${escapeHtml(agenda.title)}을 의결하도록 하겠습니다.</p>
      <p class="speaker"><strong>의장</strong> ${textBlocks(agenda.decision_draft || '원안대로 승인하는 데 이의 없으십니까?')}</p>
      ${agenda.scenario_notes ? `<p><strong>진행 참고</strong><br>${textBlocks(agenda.scenario_notes)}</p>` : ''}
      ${agenda.document_notes ? `<p><strong>안건 메모</strong><br>${textBlocks(agenda.document_notes)}</p>` : ''}`;
  }).join('<div class="page-break"></div>');
  return `<h1>${escapeHtml(row.title)} 진행 시나리오</h1>
    ${meetingMetaTable(row)}
    <p><strong>진행</strong> ${escapeHtml(chairName)}</p>
    ${row.document_notes ? `<p><strong>회의 메모</strong><br>${textBlocks(row.document_notes)}</p>` : ''}
    <h2>개회 선언</h2>
    <p class="speaker"><strong>의장</strong> ${textBlocks(row.opening_message || (attendeeCount > 0 ? `바쁘신 일정에도 참석해 주신 여러분께 감사드립니다. 재적 ${Number(row.eligible_count || 0)}명 중 ${attendeeCount}명이 참석하여 성원이 충족되었습니다. 지금부터 ${row.title}를 개회하겠습니다.` : `바쁘신 일정에도 참석해 주신 여러분께 감사드립니다. 재적 ${Number(row.eligible_count || 0)}명 중 참석 인원을 확인하여 성원 여부를 보고한 뒤 ${row.title}를 개회하겠습니다.`))}</p>
    ${agendaBlocks || '<p>등록된 안건이 없습니다.</p>'}
    <div class="page-break"></div><h2>폐회 선언</h2>
    <p class="speaker"><strong>의장</strong> ${textBlocks(row.closing_message || '이상으로 모든 안건 처리를 마쳤습니다. 참석해 주신 여러분께 감사드리며 폐회를 선언합니다.')}</p>`;
}

function buildMinutes() {
  const row = state.current;
  const coopName = state.runtime?.coop_name || state.company.company_name || '협동조합';
  const signerNames = namesByIds(row.signer_official_ids);
  const agendaBlocks = state.agendas.map((agenda, index) => `
    <h2>${escapeHtml(agendaOrdinal(agenda, index))}. ${escapeHtml(agenda.title)}</h2>
    ${agenda.summary || agenda.proposal_text ? `<p><strong>제안·보고 내용</strong><br>${textBlocks(agenda.summary || agenda.proposal_text)}</p>` : ''}
    <p><strong>주요 질의·논의</strong><br>${textBlocks(agenda.discussion_notes || '회의 후 주요 논의 내용을 입력하세요.')}</p>
    <p><strong>${agenda.agenda_kind === 'REPORT' ? '처리 결과' : '의결 결과'}</strong><br>${textBlocks(agenda.decision_result || (agenda.agenda_kind === 'REPORT' ? '보고를 마침.' : '회의 후 실제 의결 결과를 입력하세요.'))}</p>
    ${agenda.document_notes ? `<p><strong>안건 메모</strong><br>${textBlocks(agenda.document_notes)}</p>` : ''}
  `).join('');
  return `<h1>${escapeHtml(row.title)} 의사록</h1>
    ${meetingMetaTable(row, { includeAttendance: true })}
    <p><strong>의장</strong> ${escapeHtml((officialById(row.chair_official_id) && `${officialRole(officialById(row.chair_official_id))} ${officialName(officialById(row.chair_official_id))}`) || '-')}</p>
    ${row.document_notes ? `<p><strong>회의 메모</strong><br>${textBlocks(row.document_notes)}</p>` : ''}
    <h2>개회 및 성원 보고</h2><p>${textBlocks(row.opening_message || ((row.attendee_official_ids || []).length > 0 ? `재적 ${Number(row.eligible_count || 0)}명 중 ${(row.attendee_official_ids || []).length}명이 참석하여 성원이 충족되었음을 확인하고 개회를 선언하다.` : '회의 후 참석자를 입력하면 성원 보고 문구가 완성됩니다.'))}</p>
    ${agendaBlocks || '<p>등록된 안건이 없습니다.</p>'}
    <h2>폐회</h2><p>${textBlocks(row.closing_message || '모든 안건의 심의를 마치고 폐회를 선언하다.')}</p>
    <p style="text-align:center;margin-top:3em;">${escapeHtml(formatDate(row.meeting_date))}</p>
    <p style="text-align:center;font-weight:800;font-size:1.15em;">${escapeHtml(coopName)}</p>
    <div style="margin:2em 0 0 auto;max-width:430px;">
      <h3>전자서명 대상</h3>
      ${signerNames.map(name => `<p style="display:flex;justify-content:space-between;"><span>${escapeHtml(name)}</span><span>(전자서명)</span></p>`).join('') || '<p>서명 대상을 선택하세요.</p>'}
    </div>`;
}

function generatedDocumentRows() {
  return [
    { type:'MATERIALS', title:defaultDocumentTitle('MATERIALS'), content:buildMaterials() },
    { type:'SCENARIO', title:defaultDocumentTitle('SCENARIO'), content:buildScenario() },
    { type:'MINUTES', title:defaultDocumentTitle('MINUTES'), content:buildMinutes() }
  ];
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
    attendee_official_ids: selectedIds('attendeeOfficials'),
    signer_official_ids: selectedIds('signerOfficials'),
    observers: $('observers').value.trim() || null,
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
  showToast('세 문서 초안을 만들었습니다. 문구를 확인하고 필요하면 바로 고치세요.', 3200);
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
    @page{size:A4;margin:18mm 16mm 18mm;}*{box-sizing:border-box}body{margin:0;color:#111;font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;font-size:11pt;line-height:1.65}h1{font-size:24pt;line-height:1.3;margin:0 0 18pt}h2{font-size:16pt;line-height:1.4;margin:18pt 0 8pt}h3{font-size:12.5pt;margin:13pt 0 6pt}p,li,td,th{font-size:11pt}table{width:100%;border-collapse:collapse;margin:10pt 0}th,td{border:1px solid #666;padding:7pt;vertical-align:top}.doc-cover{min-height:245mm;display:flex;flex-direction:column;justify-content:center;page-break-after:always;border-bottom:2pt solid #f97316}.accent{color:#ea580c}.speaker{border-left:3pt solid #fb923c;padding:6pt 8pt;margin:7pt 0;background:#fff7ed}.page-break{page-break-after:always;border:0;height:0;margin:0}.agenda-section{break-inside:avoid}a{color:#111;text-decoration:none}@media print{button{display:none}}
  </style></head><body>${sanitizeHtml(row.content_html)}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`);
  popup.document.close();
}

async function publishMinute() {
  if (!state.current) return;
  await saveInfo({ quiet: true });
  rememberActiveDocument();
  const doc = state.documents.get('MINUTES');
  if (!doc?.content_html) throw new Error('먼저 의사록 초안을 만들어 주세요.');
  if (!state.current.signer_official_ids?.length) throw new Error('회의 후 의사록 정보에서 전자서명 대상을 선택하세요.');
  if (!window.confirm('현재 의사록을 기존 전자서명 문서로 넘길까요? 넘긴 뒤에는 서명자 화면에서 서명이 시작됩니다.')) return;
  const { data, error } = await MeetingPackageService.createMinuteFromPackage(state.current.id, {
    title: doc.title || defaultDocumentTitle('MINUTES'),
    content: sanitizeHtml(doc.content_html)
  });
  if (error) throw error;
  state.current.published_minute_id = data.id;
  state.current.status = 'FINAL';
  renderEditorHeader();
  await loadPackages();
  renderPackages();
  showToast(data.already_created ? '이미 전자서명 문서로 연결되어 있습니다.' : '전자서명 문서를 만들었습니다.', 3000);
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
    chair_official_id: chair?.id || null,
    signer_official_ids: chair ? [Number(chair.id)] : []
  });
  if (error) throw error;
  $('newPackageModal').classList.remove('show');
  $('newMeetingTitle').value = '';
  $('newMeetingNumber').value = '';
  await loadPackages(data.id);
  showToast('새 회의 준비 공간과 세 문서 초안을 만들었습니다.');
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
  $('saveAttendanceButton').addEventListener('click', () => runAction(async () => {
    await saveInfo({ quiet: true });
    refreshAutoDrafts();
    showToast('참석·서명 정보를 저장하고 의사록 초안에 반영했습니다.');
  }));
  $('saveAgendasButton').addEventListener('click', () => runAction(saveAgendas));
  $('generateAllButton').addEventListener('click', () => runAction(generateAllDocuments));
  $('saveDocumentButton').addEventListener('click', () => runAction(saveActiveDocument));
  $('printDocumentButton').addEventListener('click', printActiveDocument);
  $('publishMinuteButton').addEventListener('click', () => runAction(publishMinute));
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
    const chairId = $('chairOfficial').value ? Number($('chairOfficial').value) : null;
    state.current = { ...state.current, meeting_type:$('meetingType').value, attendee_official_ids:[], signer_official_ids:chairId ? [chairId] : [] };
    $('eligibleCount').value = candidates.length;
    renderOfficialChecks();
    scheduleAutoDraftRefresh();
  });
  $('chairOfficial').addEventListener('change', () => {
    const target = document.querySelector(`#signerOfficials input[value="${CSS.escape($('chairOfficial').value)}"]`);
    if (target) target.checked = true;
    scheduleAutoDraftRefresh();
  });
  $('agendaList').addEventListener('click', event => {
    const button = event.target.closest('[data-agenda-action]');
    if (button) handleAgendaAction(button);
  });
  $('editorBody').addEventListener('input', event => {
    if (event.target === $('documentEditor') || event.target === $('documentTitle') || event.target.closest('#documentEditor')) return;
    if (event.target.matches('input,select,textarea')) scheduleAutoDraftRefresh();
  });
  $('editorBody').addEventListener('change', event => {
    if (event.target === $('documentTitle')) return;
    if (event.target.matches('input,select,textarea')) scheduleAutoDraftRefresh();
  });
  $('documentEditor').addEventListener('input', () => { state.documentDirty = true; });
  $('documentTitle').addEventListener('input', () => { state.documentDirty = true; });
  document.querySelectorAll('.rich-toolbar [data-command]').forEach(button => button.addEventListener('click', () => {
    $('documentEditor').focus();
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
