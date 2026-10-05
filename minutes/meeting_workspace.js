/*
Version: v1.10.2
Change: 2026-10-05 - Protect unsaved packet edits and offer tenant-scoped writing guidance.
*/
import { supabase } from '../shared/supabase-client.js';
import { MinutesService } from './MinutesService.js?v=1.0.53';
import { MeetingPackageService } from './MeetingPackageService.js?v=1.5.1';
import { buildAuditReportDraft, buildBoardTextAnnex, buildPreMeetingDocuments, getAssemblyChapterEditLock, usesChapterEditor } from './meeting_templates.js?v=1.7.5';
import { SIGNATURE_PREVIEW_BUCKET } from './signature_preview.js?v=1.0.0';
import { inspectPdfFile, renderPdfUrlToImages } from '../shared/pdf-page-renderer.js?v=1.0.1';

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { BOARD: '이사회', GENERAL_ASSEMBLY: '대의원총회' };
const KIND_LABEL = { REPORT: '보고 안건', DECISION: '의결 안건', DISCUSSION: '논의 안건', OTHER: '기타 안건' };
const DOC_LABEL = { MATERIALS: '회의 자료', SCENARIO: '의장용 진행 시나리오', SCENARIO_SECRETARIAT: '사무국장용 진행 시나리오' };
const STATUS_LABEL = { DRAFT: '초안', READY: '회의자료 완성', FINAL: '완료' };

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
  inheritedChairStyle: null,
  pdfAttachments: [],
  sourceContext: null,
  auditChangeRequests: [],
  activeDocument: 'MATERIALS',
  currentStep: 'info',
  documentDirty: false,
  infoDirty: false,
  agendaDirty: false,
  pendingDocuments: new Set(),
  auditDraftDirty: false,
  chapters: [],
  activeChapterId: null,
  loading: false,
  autoDraftTimer: null
};

function numberFromMoney(value) {
  const digits = String(value ?? '').replace(/[^0-9-]/g, '');
  const parsed = Number(digits || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function displayMoney(value) {
  const amount = numberFromMoney(value);
  return amount ? amount.toLocaleString('ko-KR') : '';
}

function defaultAssemblyBookletData() {
  return {
    business_report_intro: '', business_report_highlights: '',
    business_plan_goal: '', business_plan_details: '',
    income_budget: [], expense_budget: [], borrowing_limit: 0,
    borrowing_rule: '', borrowing_purpose: '', other_agenda_text: ''
  };
}
function normalizedAssemblyBookletData(row = state.current) {
  const raw = row?.assembly_booklet_data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.keys(raw).length) {
    return defaultAssemblyBookletData(row);
  }
  const defaults = defaultAssemblyBookletData(row);
  return {
    ...defaults,
    ...raw,
    income_budget: Array.isArray(raw.income_budget) ? raw.income_budget : defaults.income_budget,
    expense_budget: Array.isArray(raw.expense_budget) ? raw.expense_budget : defaults.expense_budget
  };
}

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

function stripEphemeralSignaturePreviewUrls(value) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(value || '')}</div>`, 'text/html');
  doc.querySelectorAll('[data-signature-preview-path] img').forEach((image) => image.remove());
  doc.querySelectorAll('[data-signature-preview-path]').forEach((slot) => slot.classList.remove('is-loaded'));
  return doc.body.firstElementChild?.innerHTML || '';
}

function validSignaturePreviewPath(value) {
  const path = String(value || '').trim();
  return /^[0-9a-f-]{36}\/\d+\/[0-9a-f-]{36}\.png$/i.test(path) ? path : '';
}

async function hydrateSignaturePreviews(root, expiresIn = 900) {
  if (!root?.querySelectorAll) return;
  const slots = [...root.querySelectorAll('[data-signature-preview-path]')];
  await Promise.all(slots.map(async (slot) => {
    const path = validSignaturePreviewPath(slot.dataset.signaturePreviewPath);
    if (!path || slot.querySelector('img')) return;
    const { data, error } = await MinutesService.createSignedUrl(SIGNATURE_PREVIEW_BUCKET, path, expiresIn);
    if (error || !data?.signedUrl) return;
    const image = document.createElement('img');
    image.src = data.signedUrl;
    image.alt = '전자서명 열람본';
    image.draggable = false;
    slot.prepend(image);
    slot.classList.add('is-loaded');
  }));
}

async function injectPdfAttachmentPages(wrapper, attachments = state.pdfAttachments) {
  const rows = Array.isArray(attachments) ? attachments : [];
  const insertionPoints = new Map();
  for (const attachment of rows) {
    const chapterId = String(attachment.insert_after_chapter_id || '');
    const anchor = insertionPoints.get(chapterId)
      || wrapper.querySelector(`[data-chapter-id="${CSS.escape(chapterId)}"]`);
    if (!anchor) continue;
    const signed = await MeetingPackageService.createPdfAttachmentSignedUrl(attachment.storage_path, 1800);
    if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error(`「${attachment.title}」 PDF를 열 수 없습니다.`);
    const images = await renderPdfUrlToImages(signed.data.signedUrl, {
      onProgress: (page, total) => showToast(`「${attachment.title}」 ${page}/${total}쪽을 인쇄용으로 준비하고 있습니다.`)
    });
    let insertionPoint = anchor;
    images.forEach((image, index) => {
      const section = document.createElement('section');
      section.className = 'meeting-chapter chapter-pdf-attachment';
      section.dataset.pdfAttachmentId = attachment.id;
      section.dataset.pdfPage = String(index + 1);
      const pageImage = document.createElement('img');
      pageImage.src = image.dataUrl;
      pageImage.alt = `${attachment.title} ${index + 1}쪽`;
      pageImage.className = 'pdf-attachment-page-image';
      section.append(pageImage);
      insertionPoint.insertAdjacentElement('afterend', section);
      insertionPoint = section;
    });
    insertionPoints.set(chapterId, insertionPoint);
  }
}

function createBindingBlank(position, index) {
  const section = document.createElement('section');
  section.className = `meeting-chapter chapter-book-blank chapter-${position}-blank`;
  section.dataset.chapterId = `${position}-blank-${index}`;
  section.dataset.chapterTitle = `${position === 'front' ? '표지 뒤' : '뒷표지 앞'} 여백 ${index}`;
  section.innerHTML = `<div class="assembly-book-blank" aria-label="${escapeHtml(section.dataset.chapterTitle)}"></div>`;
  return section;
}

function normalizeBindingSkeleton(wrapper) {
  const cover = wrapper.querySelector('.chapter-cover');
  const back = wrapper.querySelector('.chapter-back');
  if (!cover || !back) return false;
  wrapper.querySelectorAll('.chapter-inside-cover,.chapter-book-blank').forEach((node) => node.remove());
  let frontAnchor = cover;
  for (let index = 1; index <= 3; index += 1) {
    const blank = createBindingBlank('front', index);
    frontAnchor.insertAdjacentElement('afterend', blank);
    frontAnchor = blank;
  }
  for (let index = 1; index <= 2; index += 1) {
    back.insertAdjacentElement('beforebegin', createBindingBlank('rear', index));
  }
  return true;
}

function ensureEvenPhysicalPageCount(wrapper) {
  const back = wrapper.querySelector('.chapter-back');
  if (!back) return;
  wrapper.querySelectorAll('.chapter-rear-blank[data-parity-blank="true"]').forEach((node) => node.remove());
  const embeddedExtraPages = [...wrapper.querySelectorAll('[data-book-page-count]')]
    .reduce((total, node) => total + Math.max(0, Number(node.dataset.bookPageCount || 1) - 1), 0);
  const physicalPages = wrapper.querySelectorAll('.meeting-chapter').length + embeddedExtraPages;
  if (physicalPages % 2 === 1) {
    const blank = createBindingBlank('rear', 3);
    blank.dataset.parityBlank = 'true';
    back.insertAdjacentElement('beforebegin', blank);
  }
}

async function preparePrintableHtml(value, attachments = state.pdfAttachments) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeHtml(stripEphemeralSignaturePreviewUrls(value));
  const bookMode = normalizeBindingSkeleton(wrapper);
  await hydrateSignaturePreviews(wrapper, 1800);
  await injectPdfAttachmentPages(wrapper, attachments);
  if (bookMode) ensureEvenPhysicalPageCount(wrapper);
  return wrapper.innerHTML;
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

function assemblyKindOf(row) {
  if (row?.meeting_type !== 'GENERAL_ASSEMBLY' && meetingTypeOf(row) !== 'GENERAL_ASSEMBLY') return null;
  if (row?.assembly_kind === 'EXTRAORDINARY') return 'EXTRAORDINARY';
  return String(row?.title || '').includes('임시') ? 'EXTRAORDINARY' : 'REGULAR';
}

function suggestedMeeting(type, year = new Date().getFullYear(), assemblyKind = 'REGULAR') {
  const previous = [...state.packages, ...state.meetingHistory]
    .filter(row => meetingTypeOf(row) === type && meetingYear(row) === year)
    .filter(row => type !== 'GENERAL_ASSEMBLY' || assemblyKindOf(row) === assemblyKind)
    .map(meetingSequence)
    .filter(value => Number.isInteger(value) && value > 0);
  const sequence = (previous.length ? Math.max(...previous) : 0) + 1;
  return {
    meetingNumber: `${year}-${sequence}회`,
    title: `${year}년 제${sequence}차 ${type === 'GENERAL_ASSEMBLY' ? (assemblyKind === 'EXTRAORDINARY' ? '임시 대의원총회' : '정기 대의원총회') : '이사회'}`
  };
}

function fillNewPackageSuggestion() {
  const assembly = $('newMeetingType').value === 'GENERAL_ASSEMBLY';
  $('newAssemblyKindField').hidden = !assembly;
  const suggestion = suggestedMeeting($('newMeetingType').value, new Date().getFullYear(), $('newAssemblyKind').value);
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
  if (value) window.clearTimeout(state.autoDraftTimer);
  $('editorBody').inert = value;
  document.querySelectorAll('button').forEach(button => {
    if (button.dataset.allowWhileBusy === 'true') return;
    button.disabled = value;
  });
  if (!value) {
    renderAuditStep({ preserveDraft: true });
    renderBookletSourceOptions();
    if (chapterMode()) renderChapterEditState();
  }
}

function hasUnsavedPacketChanges() {
  return state.infoDirty || state.agendaDirty || state.documentDirty || state.auditDraftDirty || state.pendingDocuments.size > 0;
}

function markFormDirty(target) {
  if (target?.closest('[data-panel="info"]')) state.infoDirty = true;
  if (target?.closest('[data-panel="agendas"]')) state.agendaDirty = true;
}

function resetPacketDirty() {
  state.infoDirty = false;
  state.agendaDirty = false;
  state.documentDirty = false;
  state.pendingDocuments.clear();
}

function hasLocalAdminHint() {
  try {
    const user = JSON.parse(localStorage.getItem('erp_user') || 'null');
    const permissions = new Set(JSON.parse(localStorage.getItem('erp_permissions') || '[]'));
    return user?.role === 'admin'
      || user?.role === 'admin_all'
      || permissions.has('member.admin')
      || permissions.has('site.admin')
      || permissions.has('minutes.manage');
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

function todayInSeoul(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const part = (type) => parts.find(row => row.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isPastPackage(row, today = todayInSeoul()) {
  return ['READY', 'FINAL'].includes(row?.status)
    && /^\d{4}-\d{2}-\d{2}$/.test(String(row?.meeting_date || ''))
    && row.meeting_date < today;
}

function packageItemHtml(row) {
  return `<button type="button" class="package-item ${state.current?.id === row.id ? 'active' : ''}" data-package-id="${escapeHtml(row.id)}">
    <span class="status ${escapeHtml(row.status)}">${escapeHtml(STATUS_LABEL[row.status] || row.status)}</span>
    <strong>${escapeHtml(row.title)}</strong>
    <small>${escapeHtml(TYPE_LABEL[row.meeting_type] || row.meeting_type)} · ${escapeHtml(formatDateTimeShort(row))}${row.location ? ` · ${escapeHtml(row.location)}` : ''}</small>
  </button>`;
}

function renderPackages() {
  const past = state.packages.filter(row => isPastPackage(row))
    .sort((a, b) => String(b.meeting_date).localeCompare(String(a.meeting_date))
      || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const preparing = state.packages.filter(row => !isPastPackage(row));
  $('packageList').innerHTML = preparing.length
    ? preparing.map(packageItemHtml).join('')
    : '<div class="empty">준비 중인 회의가 없습니다.<br>새 회의 준비를 눌러 시작하세요.</div>';
  $('pastPackageList').innerHTML = past.length
    ? past.map(packageItemHtml).join('')
    : '<div class="empty">종료된 회의가 없습니다.</div>';
  $('pastMeetingCount').textContent = String(past.length);
}

async function loadPackages(selectId = null) {
  const { data, error } = await MeetingPackageService.listPackages();
  if (error) throw error;
  state.packages = data;
  renderPackages();
  if (selectId) await openPackage(selectId, { internal: true });
}

function renderEditorHeader() {
  const row = state.current;
  $('editorTitle').textContent = row?.title || '회의 준비';
  const typeLabel = row?.meeting_type === 'GENERAL_ASSEMBLY'
    ? (row?.assembly_kind === 'EXTRAORDINARY' ? '임시총회' : '정기총회')
    : (TYPE_LABEL[row?.meeting_type] || '-');
  $('editorMeta').textContent = `${typeLabel} · ${formatDateTimeShort(row)}${row?.location ? ` · ${row.location}` : ''}`;
  $('editorStatus').className = `status ${row?.status || 'DRAFT'}`;
  $('editorStatus').textContent = STATUS_LABEL[row?.status] || '초안';
  $('completeMaterialsButton').hidden = state.currentStep !== 'documents' || row?.status === 'FINAL';
}

function renderChairOptions(selectedId = null) {
  const options = chairCandidates();
  $('chairOfficial').innerHTML = '<option value="">선택하세요</option>' + options.map(row => `
    <option value="${row.id}" ${String(row.id) === String(selectedId || '') ? 'selected' : ''}>${escapeHtml(officialRole(row))} ${escapeHtml(officialName(row))}</option>
  `).join('');
}

function renderBudgetRows(kind, rows) {
  const container = $(kind === 'income' ? 'incomeBudgetRows' : 'expenseBudgetRows');
  if (!container) return;
  const list = Array.isArray(rows) ? rows : [];
  container.innerHTML = list.length ? list.map((row, index) => `
    <div class="budget-row" data-budget-kind="${kind}" data-budget-index="${index}">
      <input data-budget-field="name" value="${escapeHtml(row?.name || '')}" placeholder="항목">
      <input data-budget-field="basis" value="${escapeHtml(row?.basis || '')}" placeholder="산출 근거">
      <input data-budget-field="amount" class="budget-amount" inputmode="numeric" value="${escapeHtml(displayMoney(row?.amount))}" placeholder="금액">
      <button type="button" data-budget-remove title="이 항목 삭제">×</button>
    </div>`).join('') : '<div class="empty">등록된 예산 항목이 없습니다.</div>';
}

function collectBudgetRows(kind) {
  const container = $(kind === 'income' ? 'incomeBudgetRows' : 'expenseBudgetRows');
  if (!container) return [];
  return [...container.querySelectorAll('.budget-row')].map((row) => ({
    name: row.querySelector('[data-budget-field="name"]')?.value.trim() || '',
    basis: row.querySelector('[data-budget-field="basis"]')?.value.trim() || '',
    amount: numberFromMoney(row.querySelector('[data-budget-field="amount"]')?.value)
  })).filter((row) => row.name || row.basis || row.amount);
}

function collectAssemblyBookletData() {
  if (!$('assemblyBookletPanel')) return state.current?.assembly_booklet_data || {};
  return {
    business_report_intro: $('businessReportIntro').value.trim(),
    business_report_highlights: $('businessReportHighlights').value.trim(),
    business_plan_goal: $('businessPlanGoal').value.trim(),
    business_plan_details: $('businessPlanDetails').value.trim(),
    income_budget: collectBudgetRows('income'),
    expense_budget: collectBudgetRows('expense'),
    borrowing_limit: numberFromMoney($('borrowingLimit').value),
    borrowing_rule: $('borrowingRule').value.trim(),
    borrowing_purpose: $('borrowingPurpose').value.trim(),
    other_agenda_text: $('otherAgendaText').value.trim()
  };
}

function updateBudgetSummary() {
  if (!$('budgetSummary')) return;
  const income = collectBudgetRows('income').reduce((sum, row) => sum + row.amount, 0);
  const expense = collectBudgetRows('expense').reduce((sum, row) => sum + row.amount, 0);
  const difference = income - expense;
  const differenceText = difference === 0
    ? ''
    : `${difference > 0 ? '수입이 지출보다' : '지출이 수입보다'} ${Math.abs(difference).toLocaleString('ko-KR')}원 많습니다.`;
  $('budgetSummary').innerHTML = `<span>수입 ${income.toLocaleString('ko-KR')}원</span><span>지출 ${expense.toLocaleString('ko-KR')}원</span>${differenceText ? `<span class="difference warn">${escapeHtml(differenceText)}</span>` : ''}`;
}

function renderAssemblyBookletInputs() {
  const data = normalizedAssemblyBookletData(state.current);
  $('businessReportIntro').value = data.business_report_intro || '';
  $('businessReportHighlights').value = data.business_report_highlights || '';
  $('businessPlanGoal').value = data.business_plan_goal || '';
  $('businessPlanDetails').value = data.business_plan_details || '';
  $('borrowingLimit').value = displayMoney(data.borrowing_limit);
  $('borrowingRule').value = data.borrowing_rule || '';
  $('borrowingPurpose').value = data.borrowing_purpose || '';
  $('otherAgendaText').value = data.other_agenda_text || '';
  renderBudgetRows('income', data.income_budget);
  renderBudgetRows('expense', data.expense_budget);
  updateBudgetSummary();
  renderBookletSourceOptions();
}

function renderBookletSourceOptions() {
  const select = $('bookletPreviousSource');
  if (!select) return;
  const rows = state.packages.filter(row => row.id !== state.current?.id && row.meeting_type === 'GENERAL_ASSEMBLY');
  select.replaceChildren(new Option('지난 총회를 선택해 주세요', ''));
  rows.forEach(row => select.add(new Option(row.title, row.id)));
  $('loadPreviousBooklet').disabled = !rows.length;
}

async function loadPreviousBooklet() {
  const id = $('bookletPreviousSource').value;
  if (!id) throw new Error('지난 총회를 선택해 주세요.');
  if (!state.packages.some(row => row.id === id && row.id !== state.current?.id && row.meeting_type === 'GENERAL_ASSEMBLY')) throw new Error('이 조합의 지난 총회를 선택해 주세요.');
  const { data, error } = await MeetingPackageService.getPackage(id);
  if (error) throw error;
  const raw = data?.package?.assembly_booklet_data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.keys(raw).length) throw new Error('선택한 총회에는 저장된 자료집 입력이 없습니다. 작성 예시를 참고해 직접 입력해 주세요.');
  if (!window.confirm('사업보고·계획·예산·차입금 입력을 선택한 지난 자료로 바꿀까요? 현재 입력은 바뀝니다. 새 연도에 맞게 내용과 금액을 확인해야 합니다. 결산자료·서명 문서는 가져오지 않습니다.')) return;
  state.current = { ...state.current, assembly_booklet_data: normalizedAssemblyBookletData(data.package) };
  renderAssemblyBookletInputs();
  scheduleAutoDraftRefresh('agendas');
  showToast('지난 자료의 입력을 불러왔습니다. 사업 기간·내용·금액을 확인한 뒤 저장해 주세요.', 5000);
}

function fillInfoForm() {
  const row = state.current;
  $('meetingType').value = row.meeting_type;
  $('assemblyKind').value = row.assembly_kind || 'REGULAR';
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
  renderFiscalYearOptions(row.fiscal_year || defaultFiscalYear(row));
  renderChairOptions(row.chair_official_id);
  renderAssemblyBookletInputs();
  $('eligibleCountLabel').textContent = row.meeting_type === 'GENERAL_ASSEMBLY' ? '재적 대의원 수' : '재적 이사 수';
  updateDocumentModeLabels();
}

function renderAgendaList() {
  const container = $('agendaList');
  const board = state.current?.meeting_type === 'BOARD';
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
        <div class="field" ${board ? 'style="grid-column:1/-1;"' : ''}><label>${board ? '짧은 안건 설명' : '한눈에 보는 내용'}</label><textarea data-field="summary" placeholder="${board ? '회의자료 초안에 넣을 핵심만 적어 주세요. 자세한 내용은 회의 전 문서에서 편집할 수 있습니다.' : '목차와 안건 요약에 사용할 짧은 설명'}">${escapeHtml(row.summary || '')}</textarea></div>
        ${board ? '' : `
        <div class="field"><label>배경·필요성</label><textarea data-field="background" placeholder="왜 이 안건을 다루는지">${escapeHtml(row.background || '')}</textarea></div>
        <div class="field"><label>제안·보고 본문</label><textarea data-field="proposal_text" placeholder="자료집에 들어갈 핵심 내용">${escapeHtml(row.proposal_text || '')}</textarea></div>
        <div class="field"><label>사무국 설명</label><textarea data-field="office_report" placeholder="진행 시나리오의 설명 담당 문구">${escapeHtml(row.office_report || '')}</textarea></div>
        <div class="field"><label>진행 참고</label><textarea data-field="scenario_notes" placeholder="질의 순서, 소개할 사람, 주의할 점">${escapeHtml(row.scenario_notes || '')}</textarea></div>
        <div class="field"><label>의결 문구 초안</label><textarea data-field="decision_draft" placeholder="보고 안건이면 비워도 됩니다.">${escapeHtml(row.decision_draft || '')}</textarea></div>
        <div class="field" style="grid-column:1/-1;"><label>문서에 넣을 안건 메모</label><textarea data-field="document_notes" placeholder="회의자료와 시나리오에 함께 남길 보충 설명이나 메모를 적으세요.">${escapeHtml(row.document_notes || '')}</textarea></div>
        <label class="comparison-option" ${state.current?.meeting_type === 'GENERAL_ASSEMBLY' ? '' : 'hidden'}>
          <input type="checkbox" data-field="requires_article_comparison" ${row.requires_article_comparison === true ? 'checked' : ''}>
          <span><strong>신구조문 대비표 포함</strong><small>정관·규약·규정을 바꾸는 안건일 때만 선택하세요. 기본값은 사용하지 않음입니다.</small></span>
        </label>
        <div class="field" style="grid-column:1/-1;"><label>비공개 안건 메모</label><textarea data-field="private_notes" placeholder="확인할 일과 내부 메모. 문서에는 자동 포함되지 않습니다.">${escapeHtml(row.private_notes || '')}</textarea></div>
        `}
      </div>
    </article>
  `).join('');
}

function collectAgendasFromDom() {
  return [...document.querySelectorAll('.agenda-card')].map((card, index) => {
    const row = state.agendas[index] || {};
    const value = (name) => card.querySelector(`[data-field="${name}"]`)?.value.trim() ?? String(row[name] || '');
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
      private_notes: value('private_notes'),
      requires_article_comparison: card.querySelector('[data-field="requires_article_comparison"]')?.checked ?? row.requires_article_comparison === true
    };
  });
}

function updateDocumentModeLabels() {
  const assembly = $('meetingType').value === 'GENERAL_ASSEMBLY';
  if (assembly && state.activeDocument === 'SCENARIO_SECRETARIAT') state.activeDocument = 'SCENARIO';
  const regularAssembly = assembly && $('assemblyKind').value !== 'EXTRAORDINARY';
  $('assemblyKindField').hidden = !assembly;
  $('fiscalYearField').hidden = !regularAssembly;
  $('auditStepTab').hidden = !regularAssembly;
  $('auditStepPanel').hidden = !regularAssembly;
  $('documentsStepTab').textContent = regularAssembly ? '4. 회의 전 문서' : '3. 회의 전 문서';
  $('assemblySourcePanel').hidden = !regularAssembly;
  $('assemblyBookletPanel').hidden = !regularAssembly;
  $('bookPrintHelp').hidden = !assembly;
  $('materialsTab').textContent = assembly ? '📚 총회 자료집' : '📄 이사회 회의자료';
  $('scenarioTab').textContent = assembly ? '🎙️ 총회 진행 시나리오' : '🎙️ 의장용 시나리오';
  $('secretariatScenarioTab').hidden = assembly;
  $('agendaModeNotice').textContent = assembly
    ? (regularAssembly
      ? '정기총회는 전차 의사록·감사·사업보고 및 결산·조건부 배당·조건부 출자금 반환·사업계획·차입금 한도·기타안건을 기본 순서로 구성합니다. 위 자료집 입력을 먼저 확인하고, 아래에는 그 밖에 추가로 심의할 의안만 적으세요.'
      : '임시총회에는 감사·결산·배당·사업계획을 자동으로 넣지 않습니다. 이번 임시총회에서 실제로 심의할 의안만 순서대로 적으세요.')
    : '보고·의결·논의할 안건을 적으면 한 장짜리 이사회 회의자료와 진행 시나리오에 반영됩니다.';
  $('documentModeNotice').textContent = assembly
    ? (regularAssembly
      ? '정기총회 기본 순서는 전차 의사록 확인 → 감사보고서 → 사업보고 및 결산 → 배당·이익처분(있을 때) → 감자·탈퇴 출자금 반환(있을 때) → 사업계획·예산 → 차입금 한도 → 추가 의안 → 기타안건입니다.'
      : '임시총회 자료집과 시나리오는 등록한 의안만으로 구성합니다.')
    : '한 장짜리 회의자료와 두 시나리오를 준비합니다. 지난 이사회가 있으면 의장 발언을 참고하고, 없으면 기본 문구로 시작합니다.';
  if (!regularAssembly && state.currentStep === 'audit') switchStep('documents');
  if (regularAssembly) {
    renderAssemblySourceStatus();
    renderAuditStep({ preserveDraft: true });
  }
}

function defaultFiscalYear(row = state.current) {
  const meetingDateYear = Number(String(row?.meeting_date || '').slice(0, 4));
  if (meetingDateYear >= 1901) return meetingDateYear - 1;
  const titleYear = Number(String(row?.title || '').match(/(?:19|20)\d{2}/)?.[0]);
  return titleYear >= 1901 ? titleYear - 1 : new Date().getFullYear() - 1;
}

function renderFiscalYearOptions(selectedYear = defaultFiscalYear()) {
  const selected = Number(selectedYear || defaultFiscalYear());
  const currentYear = new Date().getFullYear();
  const years = new Set([selected, defaultFiscalYear()]);
  for (let year = currentYear; year >= currentYear - 12; year -= 1) years.add(year);
  $('fiscalYear').innerHTML = [...years]
    .filter((year) => year >= 1900 && year <= 2100)
    .sort((a, b) => b - a)
    .map((year) => `<option value="${year}" ${year === selected ? 'selected' : ''}>${year}년도${year === defaultFiscalYear() ? ' · 총회 개최연도 기준 전년도' : ''}</option>`)
    .join('');
}

function renderAssemblySourceStatus() {
  const panel = $('assemblySourcePanel');
  if (!panel || panel.hidden) return;
  const source = state.sourceContext;
  if (!source) {
    $('assemblySourceStatus').innerHTML = '<div class="source-empty">총회 연동 자료를 확인하는 중입니다.</div>';
    return;
  }
  const closing = source.closing || {};
  const closingReport = source.closing_report;
  const audit = source.audit_report;
  const prior = source.previous_minute;
  const dividends = Array.isArray(source.dividend_batches) ? source.dividend_batches : [];
  const returns = Array.isArray(source.capital_returns) ? source.capital_returns : [];
  const auditorNames = state.officials
    .filter(row => officialRole(row) === '감사')
    .map(officialName)
    .filter(Boolean);
  const auditSigned = Number(audit?.signature_count || 0);
  const auditTotal = Array.isArray(audit?.signer_ids) ? audit.signer_ids.length : auditorNames.length;
  const cards = [
    ['전차 총회 의사록', prior ? `연결됨 · ${prior.title || '전차 의사록'}` : '확인 필요 · 문서함에서 찾지 못함', !!prior],
    [`${source.fiscal_year}년도 결산`, closingReport
      ? (closing.is_closed ? '회계관리 생성본 연결 · 결산 완료' : '회계관리 생성본 연결 · 결산 완료 전')
      : '연결 필요 · 회계관리에서 결산보고서 생성', !!closingReport && !!closing.is_closed],
    ['감사보고서', audit ? `${audit.status === 'CLOSED' ? '서명 완료' : '검토·서명 중'} · ${auditSigned}/${auditTotal}명` : `작성 전 · 감사 ${auditorNames.length}명`, audit?.status === 'CLOSED'],
    ['배당·이익처분', dividends.length ? `${dividends.length}개 배당안 자동 포함` : '해당 자료 없음 · 의안 자동 제외', true],
    ['감자·탈퇴 반환', returns.length ? `${returns.length}건 자동 포함` : '총회 의결 대기 없음 · 의안 자동 제외', true]
  ];
  $('assemblySourceStatus').innerHTML = cards.map(([label, detail, ok]) => `
    <div class="source-status-card"><span class="source-status-icon ${ok ? 'ok' : 'wait'}">${ok ? '✓' : '!'}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div></div>
  `).join('');
}

function auditReportLocked(audit = state.sourceContext?.audit_report) {
  return Number(audit?.signature_count || 0) > 0 || audit?.status === 'CLOSED';
}

function generatedAuditDraft(source = state.sourceContext) {
  if (!source?.closing_report || !source?.closing?.is_closed) return '';
  return sanitizeHtml(buildAuditReportDraft({
    row: state.current,
    coopName: state.runtime?.coop_name || state.company.company_name || '협동조합',
    officials: state.officials,
    sourceContext: source
  }));
}

function activeAuditors() {
  return state.officials.filter(row => row.status !== 'inactive' && officialRole(row) === '감사');
}

function auditChangeMethodLabel(value) {
  return ({ PHONE:'전화', IN_PERSON:'대면', MESSENGER:'메신저', OTHER:'기타' })[value] || '기타';
}

function toDateTimeLocalValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatAuditChangeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    timeZone:'Asia/Seoul', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit'
  });
}

function renderAuditChangePanel() {
  const panel = $('auditChangePanel');
  if (!panel) return;
  const audit = state.sourceContext?.audit_report;
  panel.hidden = !audit?.id;
  if (panel.hidden) return;

  const auditors = activeAuditors();
  const auditorSelect = $('auditChangeAuditor');
  const selectedAuditor = auditorSelect.value;
  auditorSelect.innerHTML = auditors.length
    ? auditors.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(officialName(row))}</option>`).join('')
    : '<option value="">활성 감사를 확인해 주세요</option>';
  if (auditors.some(row => String(row.id) === selectedAuditor)) auditorSelect.value = selectedAuditor;
  if (!$('auditChangeRequestedAt').value) $('auditChangeRequestedAt').value = toDateTimeLocalValue();

  const locked = auditReportLocked(audit);
  $('recordAuditChangeButton').disabled = auditors.length === 0;
  $('recordAuditChangeButton').textContent = locked ? '요청 기록·개정본 만들기' : '수정 요청 기록';
  $('auditChangeWarning').hidden = !locked;
  $('auditChangeWarning').textContent = locked
    ? '이미 전자서명이 시작된 보고서입니다. 기록을 저장하면 기존 서명본은 그대로 보존하고 수정할 수 있는 개정본을 새로 만듭니다. 개정본은 감사 전원의 전자서명을 다시 받아야 합니다.'
    : '';

  const rows = Array.isArray(state.auditChangeRequests) ? state.auditChangeRequests : [];
  $('auditChangeHistorySummary').textContent = `이전 수정 요청 ${rows.length}건`;
  $('auditChangeHistory').innerHTML = rows.length
    ? rows.map(row => `<article class="audit-change-item">
        <div class="audit-change-item-head">
          <strong>${escapeHtml(row.auditor_name || `감사 명단 #${row.requested_auditor_official_id || '-'}`)}</strong>
          <span class="audit-change-chip">${escapeHtml(auditChangeMethodLabel(row.request_method))}</span>
          <span class="audit-change-chip">${escapeHtml(formatAuditChangeTime(row.requested_at))}</span>
          ${row.resulting_report_minute_id ? '<span class="audit-change-chip revision">개정본 생성</span>' : ''}
        </div>
        <p>${escapeHtml(row.request_summary || '')}</p>
      </article>`).join('')
    : '<div class="audit-change-empty">기록된 수정 요청이 없습니다.</div>';
}

function renderAuditStep({ preserveDraft = false } = {}) {
  const panel = $('auditStepPanel');
  const editor = $('auditDraftEditor');
  if (!panel || panel.hidden || !editor) return;
  const source = state.sourceContext;
  if (!source) {
    $('auditSourceStatus').innerHTML = '<div class="source-empty">감사보고서 자료를 확인하는 중입니다.</div>';
    if (!preserveDraft || !state.auditDraftDirty) {
      editor.innerHTML = '<div class="audit-draft-empty">결산자료와 감사 명단을 확인하면 감사보고서 초안이 표시됩니다.</div>';
      editor.classList.add('is-empty');
    }
    editor.contentEditable = 'false';
    $('auditDraftState').className = 'audit-draft-state';
    $('auditDraftState').textContent = '자료 확인 중';
    $('resetAuditDraftButton').disabled = true;
    $('requestAuditReviewButton').disabled = true;
    $('openAuditButton').hidden = true;
    $('auditChangePanel').hidden = true;
    return;
  }

  const closing = source.closing || {};
  const closingReport = source.closing_report;
  const audit = source.audit_report;
  const auditors = state.officials
    .filter(row => officialRole(row) === '감사')
    .map(officialName)
    .filter(Boolean);
  const signedCount = Number(audit?.signature_count || 0);
  const signerCount = Array.isArray(audit?.signer_ids) ? audit.signer_ids.length : auditors.length;
  const closingReady = Boolean(closingReport && closing.is_closed);
  const locked = auditReportLocked(audit);
  const cards = [
    [`${source.fiscal_year}년도 결산`, closingReport
      ? (closing.is_closed ? '결산 완료 · 감사보고서 작성 가능' : '결산 완료 전 · 회계관리에서 먼저 마감 필요')
      : '결산보고서 없음 · 회계관리에서 먼저 생성 필요', closingReady],
    ['감사 대상', auditors.length ? `${auditors.join(', ')} · ${auditors.length}명` : '활성 감사 계정을 확인해 주세요.', auditors.length > 0],
    ['전자검토', audit
      ? `${audit.status === 'CLOSED' ? '서명 완료' : (signedCount > 0 ? '서명 진행 중' : '검토 문서 준비됨')} · ${signedCount}/${signerCount}명`
      : '아직 요청하지 않음', Boolean(audit)]
  ];
  $('auditSourceStatus').innerHTML = cards.map(([label, detail, ok]) => `
    <div class="source-status-card"><span class="source-status-icon ${ok ? 'ok' : 'wait'}">${ok ? '✓' : '!'}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div></div>
  `).join('');

  if (!preserveDraft || !state.auditDraftDirty) {
    const content = sanitizeHtml(audit?.content || generatedAuditDraft(source));
    if (content) {
      editor.innerHTML = content;
      editor.classList.remove('is-empty');
    } else {
      editor.innerHTML = '<div class="audit-draft-empty">결산을 완료하고 결산보고서를 생성하면 이곳에서 감사보고서 초안을 작성할 수 있습니다.</div>';
      editor.classList.add('is-empty');
    }
    state.auditDraftDirty = false;
  }

  editor.contentEditable = closingReady && !locked ? 'true' : 'false';
  editor.setAttribute('aria-readonly', closingReady && !locked ? 'false' : 'true');
  editor.classList.toggle('is-locked', locked);
  $('resetAuditDraftButton').disabled = !closingReady || locked;
  $('resetAuditDraftButton').textContent = audit ? '결산자료로 초안 다시 만들기' : '결산자료로 초안 만들기';
  $('requestAuditReviewButton').disabled = !closingReady || locked || auditors.length === 0;
  $('requestAuditReviewButton').textContent = audit ? '수정 내용 반영·전자검토 요청' : '수정 내용으로 전자검토 요청';
  $('openAuditButton').hidden = !audit?.id;

  const stateBadge = $('auditDraftState');
  stateBadge.className = `audit-draft-state ${audit?.status === 'CLOSED' ? 'signed' : (audit ? 'ready' : '')}`;
  stateBadge.textContent = audit?.status === 'CLOSED'
    ? '전자서명 완료'
    : (signedCount > 0 ? `전자서명 진행 중 · ${signedCount}/${signerCount}명` : (audit ? '전자검토 문서 있음' : '전자검토 요청 전'));
  $('auditDraftHelp').textContent = locked
    ? '감사의 전자서명이 시작되어 보고서 내용이 잠겼습니다. 전자검토 화면에서 진행 상태를 확인할 수 있습니다.'
    : (closingReady
      ? '보고서 본문을 직접 고친 뒤 전자검토 요청을 누르면 현재 내용이 저장되고 감사에게 검토·서명을 요청합니다.'
      : '회계관리에서 해당 연도 결산을 완료하고 결산보고서를 생성해 주세요.');
  renderAuditChangePanel();
}

async function loadAssemblySources({ render = true } = {}) {
  if (!state.current || state.current.meeting_type !== 'GENERAL_ASSEMBLY' || state.current.assembly_kind === 'EXTRAORDINARY') {
    state.sourceContext = null;
    state.auditChangeRequests = [];
    if (render) {
      renderAssemblySourceStatus();
      renderAuditStep({ preserveDraft: true });
    }
    return null;
  }
  const [sourceResult, requestResult] = await Promise.all([
    MeetingPackageService.getAssemblySources(state.current.id),
    MeetingPackageService.listAuditChangeRequests(state.current.id)
  ]);
  if (sourceResult.error) throw sourceResult.error;
  if (requestResult.error) throw requestResult.error;
  state.sourceContext = sourceResult.data || null;
  state.auditChangeRequests = requestResult.data || [];
  if (render) {
    renderAssemblySourceStatus();
    renderAuditStep({ preserveDraft: true });
  }
  return state.sourceContext;
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

function activeChapterLock() {
  const chapter = state.chapters[activeChapterIndex()];
  return getAssemblyChapterEditLock(chapter?.id || '', state.sourceContext);
}

function renderChapterEditState() {
  const lock = activeChapterLock();
  const editor = $('chapterEditor');
  const title = $('chapterTitle');
  const notice = $('chapterLockNotice');
  editor.contentEditable = lock.locked ? 'false' : 'true';
  editor.setAttribute('aria-readonly', lock.locked ? 'true' : 'false');
  editor.classList.toggle('is-locked', lock.locked);
  title.readOnly = lock.locked;
  title.setAttribute('aria-readonly', lock.locked ? 'true' : 'false');
  notice.hidden = !lock.locked;
  notice.textContent = lock.reason;
  document.querySelectorAll('.rich-toolbar [data-command]').forEach((button) => {
    button.disabled = lock.locked;
  });
  return lock;
}

function rememberActiveChapter() {
  if (!chapterMode() || !state.chapters.length || !$('chapterEditor')) return;
  if (activeChapterLock().locked) return;
  const index = activeChapterIndex();
  state.chapters[index] = {
    ...state.chapters[index],
    title: $('chapterTitle').value.trim() || `챕터 ${index + 1}`,
    html: sanitizeHtml(stripEphemeralSignaturePreviewUrls($('chapterEditor').innerHTML))
  };
}

function renderChapterList() {
  $('chapterList').innerHTML = state.chapters.map((chapter, index) => `
    <button type="button" class="chapter-item ${chapter.id === state.activeChapterId ? 'active' : ''}" data-chapter-id="${escapeHtml(chapter.id)}">
      <span>${index + 1}</span><strong>${escapeHtml(chapter.title)}</strong>
    </button>`).join('');
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

function activeChapterPdfAttachments() {
  return state.pdfAttachments.filter(row => row.insert_after_chapter_id === activePdfAttachmentAnchor());
}

function activePdfAttachmentAnchor() {
  if (chapterMode() && state.activeChapterId) return state.activeChapterId;
  if (state.current?.meeting_type === 'BOARD' && state.activeDocument === 'MATERIALS') return 'board-materials';
  return '';
}

function renderPdfAttachmentList() {
  if (!$('pdfAttachmentPanel') || !$('pdfAttachmentList')) return;
  const available = state.current?.meeting_type === 'GENERAL_ASSEMBLY'
    && state.activeDocument === 'MATERIALS' && Boolean(activePdfAttachmentAnchor());
  $('pdfAttachmentPanel').hidden = !available;
  if (!available) {
    $('pdfAttachmentList').replaceChildren();
    return;
  }
  $('pdfAttachmentHeading').textContent = '이 챕터 뒤에 PDF 자료 붙이기';
  $('pdfAttachmentHelp').textContent = '별도로 만든 PDF를 붙이면 자료집 인쇄 시 현재 챕터 바로 뒤에 합쳐집니다.';
  const rows = activeChapterPdfAttachments();
  $('pdfAttachmentList').innerHTML = rows.length
    ? rows.map(row => `<div class="pdf-attachment-row" data-pdf-attachment-id="${escapeHtml(row.id)}">
        <span class="pdf-icon">📎</span>
        <span class="pdf-meta"><strong>${escapeHtml(row.title)}</strong><small>${Number(row.page_count || 0)}쪽 · ${formatFileSize(row.file_size)}</small></span>
        <button type="button" class="btn btn-small btn-danger" data-pdf-action="delete">삭제</button>
      </div>`).join('')
    : '<div class="pdf-attachment-empty">첨부한 PDF가 없습니다. 자동 자료가 없는 항목은 그대로 비워 두어도 됩니다.</div>';
}

function renderBoardAnnexPanel() {
  $('boardAnnexPanel').hidden = state.current?.meeting_type !== 'BOARD' || state.activeDocument !== 'MATERIALS';
}

function normalizeBoardMaterialsHtml(value) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeHtml(value);
  const paper = wrapper.querySelector('.board-one-paper');
  if (!paper) return wrapper.innerHTML;
  paper.querySelector(':scope > .meeting-org-info')?.remove();
  const memoHeading = [...paper.querySelectorAll(':scope > h2')]
    .find(node => node.textContent.trim().replace(/[\[\]]/g, '') === '메모');
  if (memoHeading && !paper.querySelector(':scope > .board-memo-space')) {
    const space = document.createElement('div');
    space.className = 'board-memo-space';
    space.setAttribute('aria-label', '회의 중 메모할 공간');
    space.innerHTML = '<div class="board-memo-line"></div>'.repeat(6);
    const following = memoHeading.nextElementSibling;
    (following?.matches('p') ? following : memoHeading).insertAdjacentElement('afterend', space);
  }
  return wrapper.innerHTML;
}

function decorateBoardAnnexes({ expandLast = false } = {}) {
  if (state.current?.meeting_type !== 'BOARD' || state.activeDocument !== 'MATERIALS') return;
  const sections = [...$('documentEditor').querySelectorAll('.board-text-annex')];
  sections.forEach((section, index) => {
    const header = section.querySelector('.board-annex-heading');
    if (!header || header.querySelector('.board-annex-toggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'board-annex-toggle';
    button.contentEditable = 'false';
    const expanded = expandLast && index === sections.length - 1;
    section.classList.toggle('is-collapsed', !expanded);
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', `${header.querySelector('h1')?.textContent.trim() || '별첨'} ${expanded ? '접기' : '펼치기'}`);
    button.textContent = expanded ? '접기' : '펼치기';
    header.append(button);
  });
}

function currentBoardEditorHtml() {
  const copy = $('documentEditor').cloneNode(true);
  copy.querySelectorAll('.board-annex-toggle').forEach(button => button.remove());
  copy.querySelectorAll('.board-text-annex.is-collapsed').forEach(section => section.classList.remove('is-collapsed'));
  const html = sanitizeHtml(copy.innerHTML);
  return state.current?.meeting_type === 'BOARD' && state.activeDocument === 'MATERIALS'
    ? normalizeBoardMaterialsHtml(html)
    : html;
}

async function addBoardTextAnnex() {
  if (state.current?.meeting_type !== 'BOARD' || state.activeDocument !== 'MATERIALS') return;
  const editor = $('documentEditor');
  const title = $('boardAnnexTitle').value.trim();
  const body = $('boardAnnexBody').value.trim();
  const number = Math.max(0, ...[...editor.querySelectorAll('.board-text-annex')]
    .map(section => Number(section.dataset.boardAnnexNumber) || 0)) + 1;
  const html = buildBoardTextAnnex({ title, body, kind: $('boardAnnexKind').value, number });
  editor.insertAdjacentHTML('beforeend', sanitizeHtml(html));
  decorateBoardAnnexes({ expandLast: true });
  state.documentDirty = true;
  $('boardAnnexTitle').value = '';
  $('boardAnnexBody').value = '';
  editor.querySelector('.board-text-annex:last-child')?.scrollIntoView({ block: 'nearest' });
  try {
    await saveActiveDocument({ quiet: true });
  } catch (error) {
    throw new Error('별첨은 화면에 추가됐지만 저장되지 않았습니다. 회의 전 자료 전체 저장을 다시 눌러 주세요.', { cause: error });
  }
  showToast('별첨을 회의자료에 넣고 저장했습니다.');
}

function renderActiveChapter() {
  if (!state.chapters.length) {
    $('chapterTitle').value = '';
    $('chapterEditor').className = 'rich-editor chapter-preview';
    $('chapterEditor').innerHTML = '<p>자료집 챕터가 없습니다.</p>';
    $('chapterPosition').textContent = '';
    $('chapterLockNotice').hidden = true;
    $('chapterEditor').contentEditable = 'false';
    renderChapterList();
    renderPdfAttachmentList();
    return;
  }
  const index = activeChapterIndex();
  const chapter = state.chapters[index];
  state.activeChapterId = chapter.id;
  $('chapterTitle').value = chapter.title;
  const chapterClasses = String(chapter.className || '')
    .split(/\s+/)
    .filter(name => /^chapter-[a-z0-9-]+$/i.test(name));
  $('chapterEditor').className = ['rich-editor', 'chapter-preview', ...chapterClasses].join(' ');
  $('chapterEditor').innerHTML = sanitizeHtml(chapter.html);
  void hydrateSignaturePreviews($('chapterEditor'));
  $('chapterPosition').textContent = `${index + 1} / ${state.chapters.length}`;
  $('previousChapterButton').disabled = index === 0;
  $('nextChapterButton').disabled = index >= state.chapters.length - 1;
  const lock = renderChapterEditState();
  $('moveChapterUpButton').disabled = lock.locked || index === 0;
  $('moveChapterDownButton').disabled = lock.locked || index >= state.chapters.length - 1;
  $('deleteChapterButton').disabled = lock.locked;
  renderChapterList();
  renderPdfAttachmentList();
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
    $('chapterList').replaceChildren();
    $('chapterTitle').value = '';
    $('chapterEditor').className = 'rich-editor chapter-preview';
    $('chapterEditor').replaceChildren();
    $('chapterLockNotice').hidden = true;
    $('chapterTitle').readOnly = false;
    document.querySelectorAll('.rich-toolbar [data-command]').forEach((button) => { button.disabled = false; });
    $('chapterPosition').textContent = '';
    renderPdfAttachmentList();
    $('documentEditor').innerHTML = state.current?.meeting_type === 'BOARD' && state.activeDocument === 'MATERIALS'
      ? normalizeBoardMaterialsHtml(doc.content_html || '')
      : sanitizeHtml(doc.content_html || '');
    decorateBoardAnnexes();
  }
  state.documentDirty = false;
  document.querySelectorAll('.doc-tab').forEach(button => button.classList.toggle('active', button.dataset.document === state.activeDocument));
  renderBoardAnnexPanel();
}

function rememberActiveDocument() {
  if (!state.current) return;
  if (state.documentDirty) state.pendingDocuments.add(state.activeDocument);
  const existing = state.documents.get(state.activeDocument) || {};
  if (chapterMode()) rememberActiveChapter();
  state.documents.set(state.activeDocument, {
    ...existing,
    document_type: state.activeDocument,
    title: $('documentTitle').value.trim() || defaultDocumentTitle(state.activeDocument),
    content_html: chapterMode() ? sanitizeHtml(composeChapters()) : currentBoardEditorHtml(),
    manually_edited: state.documentDirty || existing.manually_edited === true
  });
}

function defaultDocumentTitle(type) {
  const title = state.current?.title || '회의';
  if (type === 'MATERIALS') return state.current?.meeting_type === 'GENERAL_ASSEMBLY' ? `${title} 자료집` : `${title} 회의자료`;
  if (type === 'SCENARIO_SECRETARIAT') return `${title} 사무국장용 진행 시나리오`;
  return state.current?.meeting_type === 'GENERAL_ASSEMBLY' ? `${title} 진행 시나리오` : `${title} 의장용 진행 시나리오`;
}

function scenarioChairGroups(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeHtml(html || '');
  const groups = new Map();
  for (const heading of wrapper.querySelectorAll('.board-scenario > h2')) {
    const label = heading.textContent.trim();
    let kind = label === '개회 선언' ? 'OPENING' : label === '폐회 선언' ? 'CLOSING' : '';
    if (!kind) kind = /^\[보고\s/.test(label) ? 'REPORT'
      : /^\[의결\s/.test(label) ? 'DECISION'
      : /^\[토의\s/.test(label) ? 'DISCUSSION'
      : /^\[기타\s/.test(label) ? 'OTHER' : '';
    if (!kind) continue;
    const lines = [];
    for (let node = heading.nextElementSibling; node && node.tagName !== 'H2'; node = node.nextElementSibling) {
      if (node.matches('p.speaker') && node.querySelector(':scope > strong')?.textContent.trim() === '의장') lines.push(node);
    }
    const key = kind === 'OPENING' || kind === 'CLOSING' ? kind : `${kind}:${groups.get(kind)?.length || 0}`;
    if (kind === 'OPENING' || kind === 'CLOSING') groups.set(key, lines);
    else groups.set(kind, [...(groups.get(kind) || []), lines]);
  }
  return { wrapper, groups };
}

function reusableChairStyle(html, row) {
  const { wrapper, groups } = scenarioChairGroups(html);
  let inherited = null;
  try { inherited = JSON.parse(wrapper.querySelector('.board-scenario')?.getAttribute('data-inherited-chair-style') || 'null'); }
  catch (_) { inherited = null; }
  const entries = inherited?.entries && typeof inherited.entries === 'object' ? { ...inherited.entries } : {};
  for (const kind of ['OPENING', 'CLOSING', 'REPORT', 'DECISION', 'DISCUSSION', 'OTHER']) {
    const lines = kind === 'OPENING' || kind === 'CLOSING' ? groups.get(kind) : groups.get(kind)?.[0];
    if (!lines) continue;
    lines.forEach((line, index) => { entries[`${kind}:${index}`] = line.innerHTML; });
  }
  return Object.keys(entries).length ? { entries, title: row?.title || inherited?.title || '', eligibleCount: row?.eligible_count } : null;
}

function applyReusableChairStyle(html, style, row, agendas = []) {
  if (!style?.entries) return html;
  const { wrapper, groups } = scenarioChairGroups(html);
  wrapper.querySelector('.board-scenario')?.setAttribute('data-inherited-chair-style', JSON.stringify(style));
  for (const kind of ['OPENING', 'CLOSING', 'REPORT', 'DECISION', 'DISCUSSION', 'OTHER']) {
    const sets = kind === 'OPENING' || kind === 'CLOSING' ? [groups.get(kind) || []] : groups.get(kind) || [];
    for (const [setIndex, lines] of sets.entries()) lines.forEach((line, index) => {
      // The introduction names a particular agenda. Always regenerate it from this meeting.
      if (['REPORT', 'DECISION', 'DISCUSSION', 'OTHER'].includes(kind) && index === 0) return;
      if (kind === 'DECISION' && index === 2
        && agendas.filter(agenda => agenda.agenda_kind === 'DECISION')[setIndex]?.decision_draft?.trim()) return;
      const previous = style.entries[`${kind}:${index}`];
      if (!previous) return;
      const scratch = document.createElement('p');
      scratch.innerHTML = sanitizeHtml(previous);
      if (scratch.querySelector(':scope > strong')?.textContent.trim() !== '의장') return;
      if (style.title && row?.title) scratch.innerHTML = scratch.innerHTML.replaceAll(escapeHtml(style.title), escapeHtml(row.title));
      if (kind === 'OPENING' && index === 0 && Number.isInteger(Number(row?.eligible_count))) {
        scratch.innerHTML = scratch.innerHTML.replace(/(재적\s*이사\s*)\d+(\s*명)/g, `$1${Number(row.eligible_count)}$2`);
      }
      line.innerHTML = scratch.innerHTML;
    });
  }
  return sanitizeHtml(wrapper.innerHTML);
}

function synchronizeChairSpeech(sourceHtml, targetHtml) {
  const source = scenarioChairGroups(sourceHtml);
  const target = scenarioChairGroups(targetHtml);
  const shape = ({ wrapper }) => [...wrapper.querySelectorAll('.board-scenario > h2')].map(heading => {
    const label = heading.textContent.trim();
    const kind = /^\[([^\s]+)\s/.exec(label)?.[1] || label;
    let count = 0;
    for (let node = heading.nextElementSibling; node && node.tagName !== 'H2'; node = node.nextElementSibling) {
      if (node.matches('p.speaker') && node.querySelector(':scope > strong')?.textContent.trim() === '의장') count++;
    }
    return `${kind}:${count}`;
  });
  if (JSON.stringify(shape(source)) !== JSON.stringify(shape(target))) {
    throw new Error('두 시나리오의 안건 순서나 의장 발언 구조가 다릅니다. 문서를 확인한 뒤 다시 저장해 주세요.');
  }
  const sourceLines = [...source.wrapper.querySelectorAll('.board-scenario p.speaker')]
    .filter(node => node.querySelector(':scope > strong')?.textContent.trim() === '의장');
  const targetLines = [...target.wrapper.querySelectorAll('.board-scenario p.speaker')]
    .filter(node => node.querySelector(':scope > strong')?.textContent.trim() === '의장');
  if (!sourceLines.length || sourceLines.length !== targetLines.length) {
    throw new Error('두 시나리오의 의장 발언 수가 달라 자동으로 맞출 수 없습니다. 안건을 확인하고 준비문서를 다시 만든 뒤 수정해 주세요.');
  }
  sourceLines.forEach((line, index) => { targetLines[index].innerHTML = line.innerHTML; });
  return sanitizeHtml(target.wrapper.innerHTML);
}

function synchronizeActiveBoardScenario() {
  if (state.current?.meeting_type !== 'BOARD' || !['SCENARIO', 'SCENARIO_SECRETARIAT'].includes(state.activeDocument)) return;
  const source = state.documents.get(state.activeDocument);
  const otherType = state.activeDocument === 'SCENARIO' ? 'SCENARIO_SECRETARIAT' : 'SCENARIO';
  const target = state.documents.get(otherType);
  if (!source?.content_html || !target?.content_html) throw new Error('두 시나리오를 먼저 준비해 주세요.');
  state.documents.set(otherType, {
    ...target,
    content_html: synchronizeChairSpeech(source.content_html, target.content_html),
    manually_edited: true
  });
}

function generatedDocumentRows() {
  const chair = officialById(state.current?.chair_official_id);
  const chairName = chair ? `${officialRole(chair)} ${officialName(chair)}` : '의장';
  const rows = buildPreMeetingDocuments({
    row: state.current,
    agendas: state.agendas,
    coopName: state.runtime?.coop_name || state.company.company_name || '협동조합',
    company: state.company,
    chairName,
    officials: state.officials,
    sourceContext: state.sourceContext
  });
  if (state.current?.meeting_type === 'BOARD' && state.inheritedChairStyle) {
    rows.forEach(row => {
      if (['SCENARIO', 'SCENARIO_SECRETARIAT'].includes(row.type)) {
        row.content = applyReusableChairStyle(row.content, state.inheritedChairStyle, state.current, state.agendas);
      }
    });
  }
  return rows;
}

function collectPackageDraftPayload() {
  const existingBookletData = state.current?.assembly_booklet_data || {};
  const regularAssembly = $('meetingType').value === 'GENERAL_ASSEMBLY' && $('assemblyKind').value !== 'EXTRAORDINARY';
  return {
    meeting_type: $('meetingType').value,
    assembly_kind: $('meetingType').value === 'GENERAL_ASSEMBLY' ? $('assemblyKind').value : null,
    fiscal_year: $('meetingType').value === 'GENERAL_ASSEMBLY' && $('assemblyKind').value !== 'EXTRAORDINARY'
      ? Number($('fiscalYear').value || defaultFiscalYear())
      : null,
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
    private_notes: $('privateNotes').value.trim() || null,
    assembly_booklet_data: regularAssembly ? collectAssemblyBookletData() : existingBookletData
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

function scheduleAutoDraftRefresh(section = 'info') {
  if (typeof section === 'object') markFormDirty(section.target);
  else if (section === 'agendas') state.agendaDirty = true;
  else state.infoDirty = true;
  window.clearTimeout(state.autoDraftTimer);
  const packageId = state.current?.id;
  state.autoDraftTimer = window.setTimeout(() => {
    if (state.current?.id !== packageId || state.loading) return;
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
  state.infoDirty = false;
  const index = state.packages.findIndex(row => row.id === data.id);
  if (index >= 0) state.packages[index] = { ...state.packages[index], ...data };
  renderPackages();
  renderEditorHeader();
  await loadAssemblySources();
  refreshAutoDrafts({ render: state.currentStep === 'documents' });
  if (!quiet) showToast('기본정보를 저장했습니다.');
  return true;
}

async function notifyAuditReportSigners(minuteId) {
  const safeMinuteId = String(minuteId || '').trim();
  if (!safeMinuteId) return { ok: false, error: 'MINUTE_ID_REQUIRED' };
  const response = await supabase.functions.invoke('signature-telegram-dm', {
    body: {
      minuteId: safeMinuteId,
      signBaseUrl: new URL('/minutes/minutes_sign.html', window.location.origin).toString()
    }
  });
  if (response.error) throw response.error;
  return response.data || {};
}

async function resetAuditDraft() {
  if (!state.current || state.current.meeting_type !== 'GENERAL_ASSEMBLY' || state.current.assembly_kind === 'EXTRAORDINARY') {
    throw new Error('감사보고서 연동은 정기총회에서만 사용합니다.');
  }
  if (state.auditDraftDirty && !window.confirm('현재 고친 감사보고서 내용을 결산자료 기준 초안으로 다시 만들까요?')) return;
  await saveInfo({ quiet: true });
  const source = await loadAssemblySources();
  if (!source?.closing_report) {
    throw new Error(`${source?.fiscal_year || $('fiscalYear').value}년도 결산보고서를 회계관리에서 먼저 생성해 주세요.`);
  }
  if (!source?.closing?.is_closed) {
    throw new Error(`${source?.fiscal_year || $('fiscalYear').value}년도 결산을 완료하고 회계관리에서 결산보고서를 다시 생성한 뒤 감사에게 보내 주세요.`);
  }
  if (auditReportLocked(source.audit_report)) throw new Error('감사의 전자서명이 시작되어 감사보고서를 다시 만들 수 없습니다.');
  const content = generatedAuditDraft(source);
  if (!content) throw new Error('감사보고서 초안을 만들 결산자료가 없습니다.');
  $('auditDraftEditor').innerHTML = content;
  $('auditDraftEditor').classList.remove('is-empty');
  state.auditDraftDirty = true;
  renderAuditStep({ preserveDraft: true });
  showToast('결산자료로 감사보고서 초안을 만들었습니다. 내용을 확인하고 전자검토를 요청해 주세요.', 4200);
}

async function saveAuditReportForReview() {
  if (!state.current || state.current.meeting_type !== 'GENERAL_ASSEMBLY' || state.current.assembly_kind === 'EXTRAORDINARY') {
    throw new Error('감사보고서 연동은 정기총회에서만 사용합니다.');
  }
  await saveInfo({ quiet: true });
  const source = await loadAssemblySources();
  if (!source?.closing_report) {
    throw new Error(`${source?.fiscal_year || $('fiscalYear').value}년도 결산보고서를 회계관리에서 먼저 생성해 주세요.`);
  }
  if (!source?.closing?.is_closed) {
    throw new Error(`${source?.fiscal_year || $('fiscalYear').value}년도 결산을 완료하고 회계관리에서 결산보고서를 다시 생성한 뒤 감사에게 보내 주세요.`);
  }
  if (auditReportLocked(source.audit_report)) {
    throw new Error('감사의 전자서명이 시작되어 감사보고서 내용을 바꿀 수 없습니다.');
  }
  const editor = $('auditDraftEditor');
  const content = sanitizeHtml(editor.innerHTML);
  if (!String(editor.textContent || '').trim()) throw new Error('감사보고서 내용을 먼저 작성해 주세요.');
  const title = `${source.fiscal_year}년도 감사보고서`;
  const { data, error } = await MeetingPackageService.prepareAuditReport(state.current.id, { title, content });
  if (error) throw error;
  state.auditDraftDirty = false;
  await loadAssemblySources();
  const savedAudit = state.sourceContext?.audit_report;
  if (auditReportLocked(savedAudit) && sanitizeHtml(savedAudit?.content || '') !== content) {
    throw new Error('감사의 전자서명이 시작되어 방금 수정한 내용은 저장하지 않았습니다. 전자검토 화면에서 확정 내용을 확인해 주세요.');
  }
  refreshAutoDrafts({ render: state.currentStep === 'documents' });
  renderAuditStep();
  return data?.id || state.sourceContext?.audit_report?.id || null;
}

async function requestAuditReview() {
  const minuteId = await saveAuditReportForReview();
  if (!minuteId) throw new Error('전자검토를 요청할 감사보고서를 찾지 못했습니다.');
  let notification = null;
  let notificationError = null;
  if (minuteId) {
    try {
      notification = await notifyAuditReportSigners(minuteId);
    } catch (error) {
      notificationError = error;
      console.warn('notifyAuditReportSigners failed:', error?.message || error);
    }
  }
  if (minuteId) window.open(`/minutes/minutes_sign.html?minuteId=${encodeURIComponent(minuteId)}`, '_blank', 'noopener');
  const sentCount = Number(notification?.sentCount || 0);
  const pendingKakaoCount = Number(notification?.kakaoTemplatePendingCount || 0);
  const failedCount = Number(notification?.failedCount || 0);
  if (sentCount > 0) {
    showToast(`감사보고서를 준비하고 서명 요청 ${sentCount}건을 보냈습니다.`, 4200);
  } else if (pendingKakaoCount > 0) {
    showToast('감사보고서를 준비했습니다. 알림톡 검수 완료 뒤 문서함에서 서명 요청을 다시 보내 주세요.', 5200);
  } else if (notificationError || failedCount > 0) {
    showToast('감사보고서는 준비됐지만 서명 요청 알림은 다시 보내 주세요.', 4600);
  } else {
    showToast('감사보고서를 감사 전자검토·서명 문서로 준비했습니다.', 3600);
  }
}

function openAuditReport() {
  const minuteId = state.sourceContext?.audit_report?.id;
  if (!minuteId) return showToast('먼저 감사보고서를 준비해 주세요.');
  window.open(`/minutes/minutes_sign.html?minuteId=${encodeURIComponent(minuteId)}`, '_blank', 'noopener');
}

async function recordAuditChangeRequest() {
  const audit = state.sourceContext?.audit_report;
  if (!state.current || !audit?.id) throw new Error('전자검토 중인 감사보고서를 먼저 준비해 주세요.');
  const auditorId = Number($('auditChangeAuditor').value || 0);
  const method = $('auditChangeMethod').value;
  const requestedAtValue = $('auditChangeRequestedAt').value;
  const summary = $('auditChangeSummary').value.trim();
  if (!auditorId) throw new Error('수정을 요청한 감사를 선택해 주세요.');
  if (!requestedAtValue) throw new Error('수정 요청을 받은 일시를 입력해 주세요.');
  if (!summary) throw new Error('수정 요청 내용을 입력해 주세요.');
  const requestedAt = new Date(requestedAtValue);
  if (Number.isNaN(requestedAt.getTime())) throw new Error('수정 요청 일시를 확인해 주세요.');

  const createRevision = auditReportLocked(audit);
  if (createRevision && !window.confirm('기존 전자서명본은 그대로 보존하고, 감사 전원이 다시 확인할 개정본을 만들까요?')) return;
  const { data, error } = await MeetingPackageService.recordAuditChangeRequest(state.current.id, {
    request_key: crypto.randomUUID(),
    requested_auditor_official_id: auditorId,
    request_method: method,
    requested_at: requestedAt.toISOString(),
    request_summary: summary,
    create_revision: createRevision
  });
  if (error) throw error;

  if (data?.revision_minute_id) state.auditDraftDirty = false;
  await loadAssemblySources();
  if (data?.revision_minute_id) refreshAutoDrafts({ render: state.currentStep === 'documents' });
  $('auditChangeSummary').value = '';
  $('auditChangeRequestedAt').value = toDateTimeLocalValue();
  $('auditChangeFormDetails').open = false;
  $('auditChangeHistoryDetails').open = true;
  renderAuditStep();
  showToast(data?.revision_minute_id
    ? '수정 요청을 내부 이력에 저장하고 개정본을 만들었습니다. 내용을 고친 뒤 전자검토를 다시 요청해 주세요.'
    : '수정 요청을 내부 이력에 저장했습니다. 보고서 내용을 고친 뒤 전자검토를 다시 요청할 수 있습니다.', 5200);
}

async function saveAgendas({ quiet = false } = {}) {
  if (!state.current) return false;
  const agendas = collectAgendasFromDom();
  if (agendas.some(row => !row.title)) throw new Error('모든 안건의 제목을 입력하세요.');
  const { data, error } = await MeetingPackageService.saveAgendas(state.current.id, agendas);
  if (error) throw error;
  state.agendas = data || [];
  if (state.current.meeting_type === 'GENERAL_ASSEMBLY' && state.current.assembly_kind !== 'EXTRAORDINARY') {
    const bookletData = collectAssemblyBookletData();
    const update = await MeetingPackageService.updatePackage(state.current.id, { assembly_booklet_data: bookletData });
    if (update.error) throw update.error;
    state.current = update.data;
  }
  renderAgendaList();
  if (!quiet) showToast(state.current.meeting_type === 'GENERAL_ASSEMBLY' && state.current.assembly_kind !== 'EXTRAORDINARY' ? '안건과 자료집 입력을 저장했습니다.' : '안건을 저장했습니다.');
  state.agendaDirty = false;
  return true;
}

async function generateAllDocuments() {
  if (!state.current) return;
  if (state.current.status === 'FINAL') throw new Error('의사록으로 확정된 회의의 준비문서는 다시 만들 수 없습니다.');
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
  state.activeDocument = 'MATERIALS';
  state.pendingDocuments.clear();
  renderEditorHeader();
  renderActiveDocument();
  await loadPackages();
  renderPackages();
  showToast(state.current.meeting_type === 'GENERAL_ASSEMBLY'
    ? '총회 자료집과 시나리오를 다시 만들었습니다. 확인한 뒤 회의자료 완성을 눌러 주세요.'
    : '이사회 회의자료와 두 시나리오를 다시 만들었습니다. 확인한 뒤 회의자료 완성을 눌러 주세요.', 4200);
}

async function saveWholeMeetingDraft({ quiet = false } = {}) {
  if (!state.current) return;
  if (state.current.status === 'FINAL') throw new Error('이미 의사록으로 확정된 회의입니다.');
  const editedType = state.activeDocument;
  const wasDirty = state.documentDirty;
  if (wasDirty) {
    rememberActiveDocument();
    if (['SCENARIO', 'SCENARIO_SECRETARIAT'].includes(editedType)) synchronizeActiveBoardScenario();
  }
  await saveInfo({ quiet: true });
  await saveAgendas({ quiet: true });
  refreshAutoDrafts({ render: false });
  const generated = generatedDocumentRows();
  const rows = generated.map(item => {
    const existing = state.documents.get(item.type);
    return {
      document_type: item.type,
      title: existing?.title || item.title,
      content_html: existing?.content_html ?? sanitizeHtml(item.content),
      version: Number(existing?.version || 1),
      manually_edited: existing?.manually_edited === true,
      generated_at: existing?.generated_at || new Date().toISOString()
    };
  });
  const { data, error } = await MeetingPackageService.saveDocuments(state.current.id, rows);
  if (error) throw error;
  (data || []).forEach(row => state.documents.set(row.document_type, row));
  state.documentDirty = false;
  if (!quiet) showToast('기본정보·안건·회의자료·시나리오를 모두 저장했습니다.');
  state.pendingDocuments.clear();
}

async function completeMeetingMaterials() {
  if (!state.current) return;
  if (!$('meetingDate').value) throw new Error('회의일을 입력한 뒤 회의자료를 완성해 주세요.');
  await saveWholeMeetingDraft({ quiet: true });
  const updated = await MeetingPackageService.updatePackage(state.current.id, { status: 'READY' });
  if (updated.error) throw updated.error;
  state.current = updated.data;
  renderEditorHeader();
  await loadPackages();
  if (isPastPackage(state.current)) $('pastMeetings').open = true;
  showToast('회의자료를 완성했습니다. 회의일이 지나면 종료된 회의에서 볼 수 있습니다.', 3800);
}

async function saveActiveDocument({ quiet = false } = {}) {
  if (!state.current) return;
  const wasDirty = state.documentDirty;
  rememberActiveDocument();
  const row = state.documents.get(state.activeDocument);
  if (!row?.content_html) throw new Error('저장할 문서 내용이 없습니다. 먼저 초안을 만들어 주세요.');
  if (state.current.meeting_type === 'BOARD' && ['SCENARIO', 'SCENARIO_SECRETARIAT'].includes(state.activeDocument)) {
    if (wasDirty) synchronizeActiveBoardScenario();
    const otherType = state.activeDocument === 'SCENARIO' ? 'SCENARIO_SECRETARIAT' : 'SCENARIO';
    const other = state.documents.get(otherType);
    if (!other?.content_html) throw new Error('함께 저장할 다른 시나리오가 없습니다. 준비문서를 먼저 만들어 주세요.');
    const payloads = [row, other].map(item => ({
      document_type: item.document_type,
      title: item.title,
      content_html: item.content_html,
      version: Number(item.version || 1),
      manually_edited: item.manually_edited === true,
      generated_at: item.generated_at || null
    }));
    const saved = await MeetingPackageService.saveDocuments(state.current.id, payloads);
    if (saved.error) throw saved.error;
    (saved.data || []).forEach(item => state.documents.set(item.document_type, item));
    state.documentDirty = false;
    state.pendingDocuments.delete('SCENARIO');
    state.pendingDocuments.delete('SCENARIO_SECRETARIAT');
    if (!quiet) showToast('의장 발언을 두 시나리오에 함께 저장했습니다.');
    return;
  }
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
  state.pendingDocuments.delete(state.activeDocument);
  if (!quiet) showToast(`${DOC_LABEL[state.activeDocument]}을 저장했습니다.`);
}

const BOOK_PRINT_CSS = `
  @page { size:A4; margin:18mm 18mm 20mm; }
  @page cover { size:A4; margin:0; counter-reset:folio 0; @bottom-center { content:none; } }
  @page inside-cover { size:A4; margin:0; @bottom-center { content:none; } }
  @page book-blank { size:A4; margin:0; @bottom-center { content:none; } }
  @page book { size:A4; margin:18mm 18mm 20mm; counter-increment:folio 1; @bottom-center { content:counter(folio); font-size:11pt; font-weight:700; color:#64748b; } }
  @page book:left { margin-left:18mm; margin-right:22mm; }
  @page book:right { margin-left:22mm; margin-right:18mm; }
  @page back-cover { size:A4; margin:0; @bottom-center { content:none; } }
  @page :blank { @bottom-center { content:none; } }
  *{box-sizing:border-box}
  html,body{margin:0;color:#172033;background:#fff;font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;font-size:11pt;line-height:1.62;word-break:keep-all;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1{font-size:23pt;line-height:1.3;margin:0 0 18pt;padding-bottom:10pt;border-bottom:3pt solid #f97316;letter-spacing:-.025em}
  h2{font-size:16pt;line-height:1.4;margin:18pt 0 8pt;color:#9a3412}
  h3{font-size:12.5pt;margin:13pt 0 6pt;color:#334155}
  h4,p,li,td,th,div,span,small{font-size:11pt}p,li,td,dd{word-break:keep-all;overflow-wrap:break-word}
  p,li{orphans:3;widows:3}
  table{width:100%;border-collapse:collapse;margin:10pt 0;break-inside:auto}
  tr{break-inside:avoid;break-after:auto}
  th,td{border:1px solid #94a3b8;padding:7pt;vertical-align:top}
  th{background:#fff7ed;color:#7c2d12;font-weight:800}
  thead{display:table-header-group}tfoot{display:table-footer-group}
  .amount,.rpt-amt{text-align:right;font-variant-numeric:tabular-nums}
  .speaker{border-left:3pt solid #fb923c;padding:6pt 8pt;margin:7pt 0;background:#fff7ed}
  .action{background:#fff7ed;color:#9a3412;padding:6pt 8pt}
  .source-caption{margin:-8pt 0 18pt;padding:8pt 10pt;border-left:4pt solid #fb923c;background:#fff7ed;color:#64748b}
  .source-agenda-row{display:grid;grid-template-columns:95pt 1fr;gap:3pt 9pt;padding:5pt 0;border-bottom:.5pt solid #cbd5e1}
  .source-agenda-row small{grid-column:2}
  .board-one-paper h1{text-align:center;font-size:19pt}.board-one-paper h2{font-size:13pt;margin:10pt 0 4pt}.board-one-paper .source-agenda-row{padding:3pt 0}
  .board-memo-space{margin-top:7pt;break-inside:avoid}.board-memo-line{height:8mm;border-bottom:1pt solid #cbd5e1}
  .board-text-annex{break-before:page;page-break-before:always;color:#172033;line-height:1.75}
  .board-annex-heading{margin:0 0 17pt;padding:12pt 13pt;border-top:4pt solid #f97316;border-bottom:1pt solid #fdba74;background:#fff7ed;break-inside:avoid}
  .board-annex-heading span{display:block;margin:0 0 5pt;color:#9a3412;font-weight:900}
  .board-annex-heading h1{margin:0;padding:0;border:0;font-size:19pt;color:#172033}
  .board-annex-body h2{margin:19pt 0 8pt;padding:0 0 5pt;border-bottom:1pt solid #fdba74;color:#9a3412;font-size:15pt;break-after:avoid}
  .board-annex-body h3{margin:15pt 0 5pt;color:#172033;font-size:12.5pt;break-after:avoid}
  .board-annex-body p{margin:5pt 0;font-size:11pt;line-height:1.75;orphans:3;widows:3}
  .meeting-org-info{margin:14pt 0 0;padding:9pt 10pt;border:1pt solid #cbd5e1;border-radius:7pt;background:#f8fafc;text-align:left;break-inside:avoid}
  .meeting-org-info>div{display:grid;grid-template-columns:58pt minmax(0,1fr);gap:5pt 8pt;padding:2pt 0}
  .meeting-org-info dt,.meeting-org-info dd{font-size:11pt}.meeting-org-info dt{color:#9a3412;font-weight:900}.meeting-org-info dd{margin:0;overflow-wrap:anywhere}
  .assembly-back .meeting-org-info{width:155mm;margin:16pt auto 0}
  .meeting-chapter{page:book;min-height:259mm;break-after:page;position:relative}
  .meeting-chapter:last-child{break-after:auto}
  .chapter-pdf-attachment{display:flex;align-items:center;justify-content:center;overflow:hidden}
  .pdf-attachment-page-image{display:block;max-width:100%;max-height:252mm;width:auto;height:auto;object-fit:contain}
  .chapter-cover{page:cover;width:210mm;min-height:297mm;padding:26mm 22mm;break-after:page}
  .chapter-inside-cover{page:inside-cover;width:210mm;min-height:297mm;break-after:page}
  .chapter-book-blank{page:book-blank;width:210mm;min-height:297mm;break-after:page}
  .chapter-back{page:back-cover;width:210mm;min-height:297mm;padding:26mm 22mm;break-before:left;page-break-before:left;break-after:auto}
  .assembly-cover{min-height:245mm;display:grid;grid-template-rows:auto 1fr auto auto;align-items:start}
  .assembly-cover .org-name{margin:0;padding-bottom:14pt;border-bottom:5pt solid #f97316;color:#ea580c;font-size:15pt;font-weight:900}
  .assembly-cover>p:nth-of-type(2){align-self:end;margin:0 0 8pt;color:#475569;font-size:14pt;font-weight:800}
  .assembly-cover h1{font-size:38pt;line-height:1.2;margin:0;padding-bottom:18pt;border-bottom:2pt solid #fdba74}
  .assembly-cover dl{margin:110pt 0 0;padding-top:14pt;border-top:1pt solid #cbd5e1;display:grid;grid-template-columns:55pt 1fr;gap:8pt 12pt}
  .assembly-cover dt{color:#ea580c;font-weight:900}.assembly-cover dd{margin:0;font-weight:700}
  .assembly-inside-cover{width:100%;min-height:297mm;background:#fff}
  .assembly-book-blank{width:100%;min-height:297mm;background:#fff}
  .assembly-back{min-height:245mm;display:flex;flex-direction:column;justify-content:center;text-align:center}
  .assembly-back h1{font-size:34pt;line-height:1.35;border:0}.assembly-back hr{width:42mm;border:0;border-top:3pt solid #f97316;margin:24pt auto}
  .chapter-bill>h1{color:#ea580c;font-size:18pt}.chapter-bill>h2{font-size:23pt;color:#172033;margin-top:4pt}
  .bill-content-card{margin:16pt 0;overflow:hidden;border:1pt solid #cbd5e1;border-radius:9pt;background:#fff;box-shadow:0 3pt 8pt rgba(15,23,42,.04);break-inside:avoid}
  .bill-content-card>h3{display:flex;align-items:center;gap:7pt;margin:0;padding:9pt 11pt;border-bottom:1pt solid #fed7aa;background:#fff7ed;color:#7c2d12}
  .bill-content-card>h3>span{width:21pt;height:21pt;display:inline-grid;place-items:center;border-radius:50%;background:#ea580c;color:#fff;font-weight:900}
  .bill-content-body{padding:12pt 14pt}.bill-content-body>:first-child{margin-top:0}.bill-content-body>:last-child{margin-bottom:0}
  .bill-major-content{display:grid;grid-template-columns:88pt 1fr;border:1pt solid #fed7aa;border-radius:7pt;overflow:hidden;margin:0}.bill-major-content dt,.bill-major-content dd{margin:0;padding:10pt;border-bottom:1pt solid #fed7aa}.bill-major-content dt{font-weight:900;color:#9a3412;background:#fff7ed}.bill-major-content dd{background:#fff}.bill-major-content dt:last-of-type,.bill-major-content dd:last-of-type{border-bottom:0}
  .business-report-overview{margin:0 0 15pt;padding:14pt 16pt;border:1pt solid #fed7aa;border-left:5pt solid #f97316;border-radius:8pt;background:#fff7ed;break-inside:avoid}.business-report-overview>span{display:inline-block;margin-bottom:5pt;color:#9a3412;font-weight:900}.business-report-overview .chapter-lead{margin:0;font-weight:700;line-height:1.7}
  .business-report-list{list-style:none;padding:0;margin:0;counter-reset:business-item;display:grid;gap:8pt}.business-report-list li{counter-increment:business-item;position:relative;margin:0;padding:10pt 12pt 10pt 42pt;border:1pt solid #e2e8f0;border-radius:8pt;background:#f8fafc;break-inside:avoid}.business-report-list li::before{content:counter(business-item);position:absolute;left:11pt;top:9pt;width:23pt;height:23pt;display:grid;place-items:center;border-radius:50%;background:#ffedd5;color:#9a3412;font-weight:900}
  .budget-balance{padding:8pt 10pt;border-radius:7pt;font-weight:800}.budget-balance.is-unbalanced{background:#fef2f2;color:#b91c1c}
  .chapter-financial>h1,.chapter-minutes>h1,.chapter-audit>h1{border-bottom-color:#fb923c}
  .audit-report-document,.business-plan-document{color:#1e293b}
  .audit-document-heading,.business-plan-heading{text-align:center;margin-bottom:18pt;padding:18pt 14pt 15pt;border-top:5pt solid #f97316;border-bottom:1pt solid #fdba74;background:#fffaf5;break-inside:avoid}
  .audit-document-heading>span,.business-plan-heading>span{display:inline-block;padding:4pt 9pt;border-radius:999pt;background:#ffedd5;color:#9a3412;font-weight:900}
  .audit-document-heading h1,.business-plan-heading h1{margin:8pt 0 4pt;padding:0;border:0;font-size:23pt;line-height:1.3;letter-spacing:-.025em;color:#172033}
  .audit-document-heading h1{letter-spacing:.2em}
  .audit-document-heading p,.business-plan-heading p{margin:0;color:#475569;font-weight:800}
  .audit-meta-table{margin:0 0 14pt;border:1pt solid #cbd5e1}
  .audit-meta-table th,.audit-meta-table td{padding:8pt 9pt}.audit-meta-table th{width:86pt;text-align:left;background:#fff7ed;color:#9a3412}
  .audit-purpose{margin:0 0 17pt;padding:10pt 12pt;border:1pt solid #fed7aa;border-left:5pt solid #fb923c;border-radius:7pt;background:#fffaf5}
  .audit-section-title,.business-plan-section>h2{display:flex;align-items:center;gap:8pt;margin:20pt 0 9pt;padding:0 0 7pt;border-bottom:2pt solid #fed7aa;color:#7c2d12;break-after:avoid}
  .audit-section-title>span,.business-plan-section>h2>span{width:25pt;height:25pt;display:inline-grid;place-items:center;border-radius:7pt;background:#ea580c;color:#fff;font-weight:900}
  .audit-result-block{margin:9pt 0;padding:0;overflow:hidden;border:1pt solid #e2e8f0;border-radius:8pt;background:#fff;break-inside:avoid}
  .audit-result-block>h3{display:flex;align-items:center;gap:7pt;margin:0;padding:8pt 10pt;border-bottom:1pt solid #e2e8f0;background:#f8fafc;color:#334155}
  .audit-result-block>h3>span{width:21pt;height:21pt;display:inline-grid;place-items:center;border-radius:50%;background:#ffedd5;color:#9a3412;font-weight:900}
  .audit-result-block>ul{margin:10pt 13pt;padding-left:18pt}
  .audit-writing-box{margin:10pt 12pt 12pt;padding:9pt 11pt;border:1pt solid #fdba74;border-radius:7pt;background:#fffaf5;break-inside:avoid}
  .audit-writing-box>strong{display:block;margin-bottom:5pt;color:#9a3412}
  .audit-writing-box p{min-height:18pt;margin:0;white-space:pre-wrap}
  .audit-writing-box-required{border-width:2pt;background:#fffaf5}
  .audit-overall-opinion{font-weight:800}
  .audit-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7pt;margin:10pt 0}
  .audit-summary-grid>div{position:relative;overflow:hidden;padding:9pt 10pt 9pt 14pt;border:1pt solid #e2e8f0;border-radius:7pt;background:#f8fafc;break-inside:avoid}
  .audit-summary-grid>div:before{content:'';position:absolute;inset:0 auto 0 0;width:4pt;background:#fb923c}
  .audit-summary-grid span{display:block;color:#64748b}.audit-summary-grid strong{display:block;margin-top:4pt;font-variant-numeric:tabular-nums}
  .audit-signature-panel{margin-top:20pt;padding:13pt 15pt;border-top:2pt solid #fdba74;background:#fffaf5;break-inside:avoid}.audit-signature-date{margin:0 0 10pt;text-align:center;font-weight:800}.audit-signers{width:260pt;margin-left:auto;text-align:right;break-inside:avoid}.audit-signers>strong{display:block;margin-bottom:7pt;color:#7c2d12}
  .business-plan-section{margin:0 0 18pt}.business-plan-goal blockquote{margin:0;padding:13pt 15pt;border:1pt solid #fdba74;border-left:6pt solid #f97316;border-radius:8pt;background:#fff7ed;color:#7c2d12;line-height:1.7;break-inside:avoid}
  .business-plan-list{list-style:none;margin:0;padding:0;counter-reset:plan-item;display:grid;gap:7pt}.business-plan-list li{counter-increment:plan-item;position:relative;padding:10pt 11pt 10pt 40pt;border:1pt solid #e2e8f0;border-radius:8pt;background:#f8fafc;break-inside:avoid}.business-plan-list li:before{content:counter(plan-item);position:absolute;left:10pt;top:8pt;width:22pt;height:22pt;display:grid;place-items:center;border-radius:7pt;background:#ffedd5;color:#9a3412;font-weight:900}
  .business-plan-empty{padding:10pt 12pt;border:1pt dashed #cbd5e1;border-radius:7pt;background:#f8fafc;color:#64748b}
  .budget-panel{margin:11pt 0;overflow:hidden;border:1pt solid #cbd5e1;border-radius:8pt;background:#fff;break-inside:avoid}.budget-panel>h3{display:flex;align-items:center;gap:7pt;margin:0;padding:8pt 10pt;border-bottom:1pt solid #fed7aa;background:#fff7ed;color:#7c2d12}.budget-panel>h3>span{width:21pt;height:21pt;display:inline-grid;place-items:center;border-radius:50%;background:#ea580c;color:#fff;font-weight:900}
  .budget-data-table{margin:0;border:0}.budget-data-table th,.budget-data-table td{padding:7pt 8pt}.budget-data-table thead th{background:#f8fafc;color:#334155}.budget-data-table tbody tr:nth-child(even){background:#f8fafc}.budget-data-table tfoot th{border-top:2pt solid #fb923c;background:#fff7ed;color:#7c2d12}
  .business-plan-note{margin:12pt 0 0;padding:9pt 11pt;border:1pt solid #93c5fd;border-radius:7pt;background:#eff6ff;color:#1e3a8a;break-inside:avoid}
  .financial-statement-page{color:#1e293b}
  .financial-statement-heading{text-align:center;margin-bottom:20pt;padding:18pt 14pt 15pt;border-top:5pt solid #f97316;border-bottom:1pt solid #fdba74;background:#fffaf5;break-inside:avoid}
  .financial-statement-heading>span{display:inline-block;padding:4pt 9pt;border-radius:999pt;background:#ffedd5;color:#9a3412;font-weight:900}
  .financial-statement-heading h1{margin:9pt 0 4pt;padding:0;border:0;font-size:21pt;line-height:1.3;letter-spacing:-.035em;color:#172033;word-break:keep-all}
  .financial-statement-heading p{margin:0;font-weight:800;color:#475569}
  .financial-statement-heading small{display:block;margin-top:8pt;text-align:right;color:#64748b}
  .financial-statement-section{margin:0 0 18pt;break-inside:avoid}.financial-statement-card{overflow:hidden;border:1.5pt solid #cbd5e1;border-radius:8pt;background:#fff}
  .financial-balance-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11pt;align-items:start}
  .financial-balance-grid .financial-statement-section{margin-bottom:11pt}
  .financial-balance-grid th,.financial-balance-grid td{padding:6pt}
  .financial-statement-section h2{display:flex;align-items:center;gap:8pt;margin:0;padding:8pt 10pt;border-left:5pt solid #fb923c;border-bottom:1pt solid #fdba74;background:#fff7ed;color:#7c2d12}
  .financial-statement-section table{margin:0;border:0}.financial-data-table thead th{background:#f8fafc;color:#334155}.financial-data-table th,.financial-data-table td{padding:7pt 8pt}.financial-statement-section tbody tr:nth-child(even){background:#f8fafc}
  .financial-statement-section tfoot th{border-top:2pt solid #fb923c;background:#fff7ed;color:#7c2d12}
  .financial-result{margin-top:22pt;padding-top:12pt;border-top:2pt solid #fb923c}
  .linked-minute img{max-width:100%;height:auto}
  .book-signature-section{margin-top:22pt;padding-top:14pt;border-top:2pt solid #fdba74;break-inside:avoid}
  .book-signature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9pt}
  .book-signature-card{display:flex;align-items:center;gap:10pt;padding:10pt;border:1pt solid #fed7aa;border-radius:8pt;background:#fffaf5;break-inside:avoid}
  .book-signature-card small{display:block;margin-top:3pt;color:#64748b}
  .book-signature-preview{flex:0 0 96px;width:96px;min-height:48px;display:grid;place-items:center;color:#64748b;border:1pt dashed #cbd5e1;background:#fff}
  .book-signature-preview img{width:96px;height:48px;object-fit:contain}.book-signature-preview.is-loaded>span{display:none}
  .book-source-required{padding:18pt;border:2pt solid #fb923c;border-radius:10pt;background:#fff7ed}.book-source-required strong{font-size:14pt;color:#9a3412}
  .closing-report-snapshot .rpt-title{text-align:center;font-size:20pt;font-weight:900;margin:12pt 0 18pt;text-decoration:underline}
  .closing-report-snapshot .rpt-header-tbl,.closing-report-snapshot .rpt-tbl{width:100%;border-collapse:collapse;border:2pt solid #475569;margin-bottom:15pt}
  .closing-report-snapshot .rpt-header-tbl th,.closing-report-snapshot .rpt-header-tbl td,.closing-report-snapshot .rpt-tbl th,.closing-report-snapshot .rpt-tbl td{font-size:11pt!important;padding:7pt;border:1pt solid #94a3b8}
  .closing-report-snapshot .rpt-sec{font-size:15pt!important;font-weight:900;margin:12pt 0 8pt;padding-bottom:5pt;border-bottom:2pt solid #fb923c;color:#9a3412}
  .closing-report-snapshot .small,.closing-report-snapshot .text-small{font-size:11pt!important}
  .closing-report-snapshot .d-flex{display:flex}.closing-report-snapshot .justify-content-between{justify-content:space-between}.closing-report-snapshot .text-end{text-align:right}.closing-report-snapshot .text-center{text-align:center}.closing-report-snapshot .text-muted{color:#64748b}.closing-report-snapshot .text-primary{color:#1d4ed8}.closing-report-snapshot .text-danger{color:#b91c1c}.closing-report-snapshot .fw-bold{font-weight:800}.closing-report-snapshot .border-top{border-top:1pt solid #94a3b8}.closing-report-snapshot .mt-2{margin-top:7pt}.closing-report-snapshot .mt-3,.closing-report-snapshot .mt-4{margin-top:12pt}.closing-report-snapshot .mb-1{margin-bottom:4pt}.closing-report-snapshot .pt-2{padding-top:7pt}.closing-report-snapshot .p-2{padding:7pt}.closing-report-snapshot .bg-light{background:#f8fafc}.closing-report-snapshot .alert{padding:9pt 11pt;border:1pt solid #fdba74;border-radius:7pt;background:#fff7ed}.closing-report-snapshot .alert-info{border-color:#93c5fd;background:#eff6ff}.closing-report-snapshot .alert-warning{border-color:#fbbf24;background:#fffbeb}
  a{color:#172033;text-decoration:none}
  @media print{button,.no-print{display:none!important}}
`;

function printLoadScript() {
  return `<script>window.addEventListener('load',()=>{const waits=[...document.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true})}));Promise.all(waits).then(()=>setTimeout(()=>window.print(),300));});<\/script>`;
}

async function printActiveDocument() {
  rememberActiveDocument();
  const row = state.documents.get(state.activeDocument);
  if (!row?.content_html) return showToast('먼저 초안을 만들어 주세요.');
  const popup = window.open('', '_blank');
  if (!popup) return showToast('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
  popup.opener = null;
  const title = escapeHtml(row.title || defaultDocumentTitle(state.activeDocument));
  const printableHtml = await preparePrintableHtml(row.content_html);
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title><style>${BOOK_PRINT_CSS}</style></head><body>${printableHtml}${printLoadScript()}</body></html>`);
  popup.document.close();
}

async function printCurrentChapter() {
  if (!chapterMode() || !state.chapters.length) return;
  rememberActiveChapter();
  const chapter = state.chapters[activeChapterIndex()];
  const popup = window.open('', '_blank');
  if (!popup) return showToast('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
  popup.opener = null;
  const chapterAttachments = state.pdfAttachments.filter(row => row.insert_after_chapter_id === chapter.id);
  const printableHtml = await preparePrintableHtml(`<section class="${escapeHtml(chapter.className || 'meeting-chapter')}" data-chapter-id="${escapeHtml(chapter.id)}">${chapter.html}</section>`, chapterAttachments);
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(chapter.title)}</title><style>${BOOK_PRINT_CSS}</style></head><body>${printableHtml}${printLoadScript()}</body></html>`);
  popup.document.close();
}

async function openPackage(id, { internal = false } = {}) {
  if (state.loading && !internal) return;
  if (hasUnsavedPacketChanges() && !window.confirm('저장하지 않은 회의 입력·문서 수정이 있습니다. 저장하지 않고 다른 회의를 열까요?')) return;
  window.clearTimeout(state.autoDraftTimer);
  setBusy(true);
  try {
    const { data, error } = await MeetingPackageService.getPackage(id);
    if (error) throw error;
    if (!data?.package) throw new Error('회의 준비 자료를 찾을 수 없습니다.');
    state.current = data.package;
    state.agendas = data.agendas || [];
    state.documents = new Map((data.documents || []).map(row => [row.document_type, row]));
    state.inheritedChairStyle = data.package.meeting_type === 'BOARD'
      ? reusableChairStyle(state.documents.get('SCENARIO')?.content_html || state.documents.get('SCENARIO_SECRETARIAT')?.content_html, data.package)
      : null;
    state.pdfAttachments = data.pdfAttachments || [];
    state.sourceContext = null;
    state.auditChangeRequests = [];
    state.activeDocument = 'MATERIALS';
    resetPacketDirty();
    state.auditDraftDirty = false;
    $('editorPlaceholder').hidden = true;
    $('editorBody').hidden = false;
    renderEditorHeader();
    fillInfoForm();
    renderAgendaList();
    await loadAssemblySources();
    refreshAutoDrafts({ render: false });
    renderActiveDocument();
    renderAuditStep();
    renderPackages();
    if (isPastPackage(state.current)) $('pastMeetings').open = true;
  } finally {
    setBusy(false);
  }
}

async function createPackage() {
  const title = $('newMeetingTitle').value.trim();
  if (!title) throw new Error('회의 제목을 입력하세요.');
  const type = $('newMeetingType').value;
  const sources = type === 'BOARD' ? state.packages.filter(row => row.meeting_type === 'BOARD' && isPastPackage(row))
    .sort((a, b) => String(b.meeting_date).localeCompare(String(a.meeting_date))
      || String(b.updated_at || '').localeCompare(String(a.updated_at || ''))) : [];
  let sourceStyle = null;
  for (const source of sources) {
    const previous = await MeetingPackageService.getPackage(source.id);
    if (previous.error) throw previous.error;
    const sourceDocument = previous.data?.documents?.find(row => row.document_type === 'SCENARIO')
      || previous.data?.documents?.find(row => row.document_type === 'SCENARIO_SECRETARIAT');
    sourceStyle = reusableChairStyle(sourceDocument?.content_html, previous.data?.package);
    if (sourceStyle) break;
  }
  const candidates = currentTypeOfficials(type);
  const chair = chairCandidates().find(row => officialRole(row) === '이사장') || null;
  const { data, error } = await MeetingPackageService.createPackage({
    meeting_type: type,
    assembly_kind: type === 'GENERAL_ASSEMBLY' ? $('newAssemblyKind').value : null,
    title,
    meeting_number: $('newMeetingNumber').value.trim() || null,
    fiscal_year: type === 'GENERAL_ASSEMBLY' && $('newAssemblyKind').value !== 'EXTRAORDINARY' ? new Date().getFullYear() - 1 : null,
    eligible_count: candidates.length,
    chair_official_id: chair?.id || null
  });
  if (error) throw error;
  if (sourceStyle) {
    const chairName = chair ? `${officialRole(chair)} ${officialName(chair)}` : '의장';
    const seeds = buildPreMeetingDocuments({
      row: data, agendas: [], coopName: state.runtime?.coop_name || state.company.company_name || '협동조합',
      company: state.company, chairName, officials: state.officials, sourceContext: null
    }).filter(row => ['SCENARIO', 'SCENARIO_SECRETARIAT'].includes(row.type))
      .map(row => ({
        document_type: row.type, title: row.title,
        content_html: applyReusableChairStyle(row.content, sourceStyle, data),
        version: 1, manually_edited: false, generated_at: new Date().toISOString()
      }));
    const seeded = await MeetingPackageService.saveDocuments(data.id, seeds);
    if (seeded.error) {
      await loadPackages(data.id);
      throw new Error('새 회의는 만들었지만 지난 시나리오를 불러오지 못했습니다. 중복으로 새 회의를 만들지 말고 현재 회의를 확인해 주세요.');
    }
  }
  $('newPackageModal').classList.remove('show');
  $('newMeetingTitle').value = '';
  $('newMeetingNumber').value = '';
  await loadPackages(data.id);
  showToast(type === 'GENERAL_ASSEMBLY'
    ? '새 총회 준비 공간과 자료집·시나리오 초안을 만들었습니다.'
    : sourceStyle ? '지난 이사회의 의장 말투를 가져왔습니다. 새 안건과 날짜를 확인해 주세요.' : '새 이사회 준비 공간을 만들었습니다. 기본 시나리오가 적용됩니다.');
}

async function deletePackage() {
  if (!state.current) return;
  if (state.current.published_minute_id) throw new Error('전자서명 문서로 넘긴 회의 꾸러미는 삭제할 수 없습니다.');
  if (!window.confirm(`「${state.current.title}」 준비 자료와 초안을 삭제할까요?`)) return;
  const { error } = await MeetingPackageService.deletePackage(state.current.id);
  if (error) throw error;
  state.current = null;
  resetPacketDirty();
  state.agendas = [];
  state.documents.clear();
  state.inheritedChairStyle = null;
  state.pdfAttachments = [];
  state.sourceContext = null;
  state.auditChangeRequests = [];
  state.auditDraftDirty = false;
  $('editorBody').hidden = true;
  $('editorPlaceholder').hidden = false;
  await loadPackages();
  showToast('회의 준비 자료를 삭제했습니다.');
}

function switchStep(step) {
  if (step === 'audit' && $('auditStepTab').hidden) step = 'documents';
  state.currentStep = step;
  $('completeMaterialsButton').hidden = step !== 'documents' || state.current?.status === 'FINAL';
  document.querySelectorAll('.step-tab').forEach(button => button.classList.toggle('active', button.dataset.step === step));
  document.querySelectorAll('.step-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === step));
  if (step === 'audit') {
    syncWorkingStateFromForms();
    renderAuditStep({ preserveDraft: true });
  }
  if (step === 'documents') {
    syncWorkingStateFromForms();
    refreshAutoDrafts();
  }
}

function addAgenda() {
  state.agendas = collectAgendasFromDom();
  state.agendas.push({ agenda_kind:'DECISION', title:'', summary:'', background:'', proposal_text:'', office_report:'', scenario_notes:'', decision_draft:'', decision_result:'', discussion_notes:'', document_notes:'', private_notes:'', requires_article_comparison:false });
  renderAgendaList();
  scheduleAutoDraftRefresh('agendas');
  document.querySelector('.agenda-card:last-child input[data-field="title"]')?.focus();
}

function addBudgetRow(kind) {
  const rows = collectBudgetRows(kind);
  rows.push({ name:'', basis:'', amount:0 });
  renderBudgetRows(kind, rows);
  updateBudgetSummary();
  const container = $(kind === 'income' ? 'incomeBudgetRows' : 'expenseBudgetRows');
  container.querySelector('.budget-row:last-child [data-budget-field="name"]')?.focus();
  scheduleAutoDraftRefresh('agendas');
}

function removeBudgetRow(button) {
  const row = button.closest('.budget-row');
  const kind = row?.dataset.budgetKind;
  if (!row || !kind) return;
  const index = Number(row.dataset.budgetIndex);
  const rows = collectBudgetRows(kind);
  rows.splice(index, 1);
  renderBudgetRows(kind, rows);
  updateBudgetSummary();
  scheduleAutoDraftRefresh('agendas');
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
  scheduleAutoDraftRefresh('agendas');
}

function selectChapter(id) {
  if (!chapterMode()) return;
  rememberActiveChapter();
  state.activeChapterId = id;
  renderActiveChapter();
}

function moveChapter(offset) {
  if (!chapterMode() || !state.chapters.length) return;
  if (activeChapterLock().locked) return showToast('연결된 확정 자료는 순서를 바꾸거나 수정할 수 없습니다.');
  rememberActiveChapter();
  const index = activeChapterIndex();
  const target = index + offset;
  if (target < 0 || target >= state.chapters.length) return;
  const targetLock = getAssemblyChapterEditLock(state.chapters[target]?.id || '', state.sourceContext);
  if (targetLock.locked) return showToast('연결된 확정 자료의 앞뒤 순서는 바꿀 수 없습니다.');
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
  if (activeChapterLock().locked) return showToast('연결된 확정 자료는 자료집에서 수정하거나 삭제할 수 없습니다.');
  const index = activeChapterIndex();
  const title = state.chapters[index].title;
  if (activeChapterPdfAttachments().length) {
    showToast('이 챕터 뒤에 붙인 PDF를 먼저 삭제해 주세요.');
    return;
  }
  if (!window.confirm(`「${title}」 챕터를 자료집에서 뺄까요? 저장하기 전까지는 새로고침하면 되돌릴 수 있습니다.`)) return;
  state.chapters.splice(index, 1);
  state.activeChapterId = state.chapters[Math.min(index, state.chapters.length - 1)]?.id || null;
  state.documentDirty = true;
  renderActiveChapter();
}

async function addPdfAttachment(file) {
  const anchor = activePdfAttachmentAnchor();
  if (!state.current || !anchor) throw new Error('PDF를 붙일 회의자료나 챕터를 먼저 선택해 주세요.');
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) throw new Error('PDF 파일은 20MB 이하만 첨부할 수 있습니다.');
  const inspected = await inspectPdfFile(file);
  if (state.documentDirty) await saveActiveDocument();
  const title = String(file.name || '첨부 자료').replace(/\.pdf$/i, '').trim() || '첨부 자료';
  const existing = activeChapterPdfAttachments();
  const { data, error } = await MeetingPackageService.uploadPdfAttachment(state.current.id, file, {
    title,
    insert_after_chapter_id: anchor,
    page_count: inspected.pageCount,
    sort_order: existing.length ? Math.max(...existing.map(row => Number(row.sort_order || 0))) + 1 : 0
  });
  if (error) throw error;
  state.pdfAttachments.push(data);
  state.pdfAttachments.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  renderPdfAttachmentList();
  showToast(`「${title}」 ${inspected.pageCount}쪽을 ${anchor === 'board-materials' ? '이사회 회의자료' : '이 챕터'} 뒤에 붙였습니다.`);
}

async function deletePdfAttachment(id) {
  const row = state.pdfAttachments.find(item => item.id === id);
  if (!row) return;
  if (!window.confirm(`「${row.title}」 PDF를 자료집과 비공개 저장소에서 삭제할까요?`)) return;
  const { error } = await MeetingPackageService.deletePdfAttachment(id);
  if (error) throw error;
  state.pdfAttachments = state.pdfAttachments.filter(item => item.id !== id);
  renderPdfAttachmentList();
  showToast('첨부 PDF를 삭제했습니다.');
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
  $('newAssemblyKind').addEventListener('change', fillNewPackageSuggestion);
  $('cancelNewPackage').addEventListener('click', () => $('newPackageModal').classList.remove('show'));
  $('createPackageButton').addEventListener('click', () => runAction(createPackage));
  $('deletePackageButton').addEventListener('click', () => runAction(deletePackage));
  $('saveInfoButton').addEventListener('click', () => runAction(saveInfo));
  $('saveAgendasButton').addEventListener('click', () => runAction(saveAgendas));
  $('loadPreviousBooklet').addEventListener('click', () => runAction(loadPreviousBooklet));
  $('generateAllButton').addEventListener('click', () => runAction(generateAllDocuments));
  $('completeMaterialsButton').addEventListener('click', () => runAction(completeMeetingMaterials));
  $('refreshAssemblySourcesButton').addEventListener('click', () => runAction(async () => {
    await loadAssemblySources();
    refreshAutoDrafts({ render: state.currentStep === 'documents' });
    showToast('총회 연동 자료를 다시 확인했습니다.');
  }));
  $('refreshAuditSourcesButton').addEventListener('click', () => runAction(async () => {
    await loadAssemblySources();
    renderAuditStep({ preserveDraft: true });
    showToast('결산자료와 감사 진행 상태를 다시 확인했습니다.');
  }));
  $('resetAuditDraftButton').addEventListener('click', () => runAction(resetAuditDraft));
  $('requestAuditReviewButton').addEventListener('click', () => runAction(requestAuditReview));
  $('openAuditButton').addEventListener('click', openAuditReport);
  $('recordAuditChangeButton').addEventListener('click', () => runAction(recordAuditChangeRequest));
  $('saveDocumentButton').addEventListener('click', () => runAction(saveWholeMeetingDraft));
  $('printDocumentButton').addEventListener('click', () => runAction(printActiveDocument));
  $('printChapterButton').addEventListener('click', () => runAction(printCurrentChapter));
  $('previousChapterButton').addEventListener('click', () => stepChapter(-1));
  $('nextChapterButton').addEventListener('click', () => stepChapter(1));
  $('addChapterButton').addEventListener('click', addChapter);
  $('moveChapterUpButton').addEventListener('click', () => moveChapter(-1));
  $('moveChapterDownButton').addEventListener('click', () => moveChapter(1));
  $('deleteChapterButton').addEventListener('click', deleteChapter);
  $('addBoardAnnexButton').addEventListener('click', () => runAction(addBoardTextAnnex));
  $('addPdfAttachmentButton').addEventListener('click', () => $('pdfAttachmentInput').click());
  $('pdfAttachmentInput').addEventListener('change', () => {
    const file = $('pdfAttachmentInput').files?.[0] || null;
    $('pdfAttachmentInput').value = '';
    if (file) runAction(() => addPdfAttachment(file));
  });
  $('pdfAttachmentList').addEventListener('click', event => {
    const button = event.target.closest('[data-pdf-action="delete"]');
    const row = button?.closest('[data-pdf-attachment-id]');
    if (button && row) runAction(() => deletePdfAttachment(row.dataset.pdfAttachmentId));
  });
  $('chapterList').addEventListener('click', event => {
    const button = event.target.closest('[data-chapter-id]');
    if (button) selectChapter(button.dataset.chapterId);
  });
  $('addAgendaButton').addEventListener('click', addAgenda);
  $('packageList').addEventListener('click', event => {
    const button = event.target.closest('[data-package-id]');
    if (button) openPackage(button.dataset.packageId).catch(error => showToast(error.message));
  });
  $('pastPackageList').addEventListener('click', event => {
    const button = event.target.closest('[data-package-id]');
    if (button) openPackage(button.dataset.packageId).catch(error => showToast(error.message));
  });
  document.querySelectorAll('.step-tab').forEach(button => button.addEventListener('click', () => switchStep(button.dataset.step)));
  document.querySelectorAll('.doc-tab').forEach(button => button.addEventListener('click', () => {
    const wasDirty = state.documentDirty;
    rememberActiveDocument();
    if (wasDirty) {
      try { synchronizeActiveBoardScenario(); }
      catch (error) { showToast(error.message, 5000); return; }
    }
    state.activeDocument = button.dataset.document;
    renderActiveDocument();
  }));
  $('meetingType').addEventListener('change', () => {
    const candidates = currentTypeOfficials($('meetingType').value);
    state.current = { ...state.current, meeting_type:$('meetingType').value, assembly_kind:$('meetingType').value === 'GENERAL_ASSEMBLY' ? $('assemblyKind').value : null };
    $('eligibleCount').value = candidates.length;
    $('eligibleCountLabel').textContent = $('meetingType').value === 'GENERAL_ASSEMBLY' ? '재적 대의원 수' : '재적 이사 수';
    updateDocumentModeLabels();
    state.sourceContext = null;
    renderAgendaList();
    scheduleAutoDraftRefresh();
  });
  $('assemblyKind').addEventListener('change', () => {
    if (!state.current || $('meetingType').value !== 'GENERAL_ASSEMBLY') return;
    state.current = { ...state.current, assembly_kind:$('assemblyKind').value };
    if ($('assemblyKind').value === 'REGULAR' && !$('fiscalYear').value) renderFiscalYearOptions(defaultFiscalYear());
    state.sourceContext = null;
    updateDocumentModeLabels();
    if ($('assemblyKind').value === 'REGULAR') renderAssemblyBookletInputs();
    renderAgendaList();
    scheduleAutoDraftRefresh();
  });
  $('chairOfficial').addEventListener('change', scheduleAutoDraftRefresh);
  $('agendaList').addEventListener('click', event => {
    const button = event.target.closest('[data-agenda-action]');
    if (button) handleAgendaAction(button);
  });
  $('assemblyBookletPanel').addEventListener('click', event => {
    const addButton = event.target.closest('[data-budget-add]');
    if (addButton) return addBudgetRow(addButton.dataset.budgetAdd);
    const removeButton = event.target.closest('[data-budget-remove]');
    if (removeButton) removeBudgetRow(removeButton);
  });
  $('assemblyBookletPanel').addEventListener('input', event => {
    if (event.target.matches('.budget-amount,.money-input')) {
      const amount = numberFromMoney(event.target.value);
      event.target.value = amount ? amount.toLocaleString('ko-KR') : '';
    }
    if (event.target.closest('.budget-row')) updateBudgetSummary();
  });
  $('editorBody').addEventListener('input', event => {
    if (event.target === $('documentEditor') || event.target === $('documentTitle') || event.target === $('chapterEditor') || event.target === $('chapterTitle') || event.target.closest('#documentEditor,#chapterEditor')) return;
    if (event.target.matches('input,select,textarea')) scheduleAutoDraftRefresh(event);
  });
  $('editorBody').addEventListener('change', event => {
    if (event.target === $('documentTitle') || event.target === $('chapterTitle')) return;
    if (event.target.matches('input,select,textarea')) scheduleAutoDraftRefresh(event);
  });
  $('documentEditor').addEventListener('input', () => { state.documentDirty = true; });
  $('documentEditor').addEventListener('click', event => {
    const button = event.target.closest('.board-annex-toggle');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const section = button.closest('.board-text-annex');
    const expanded = section.classList.toggle('is-collapsed') === false;
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', `${section.querySelector('.board-annex-heading h1')?.textContent.trim() || '별첨'} ${expanded ? '접기' : '펼치기'}`);
    button.textContent = expanded ? '접기' : '펼치기';
  });
  $('auditDraftEditor').addEventListener('input', () => {
    if (auditReportLocked()) return;
    state.auditDraftDirty = true;
    $('auditDraftEditor').classList.remove('is-empty');
    $('auditDraftState').className = 'audit-draft-state';
    $('auditDraftState').textContent = '수정 중 · 요청 전';
  });
  $('chapterEditor').addEventListener('input', () => {
    if (!activeChapterLock().locked) state.documentDirty = true;
  });
  $('chapterTitle').addEventListener('input', () => {
    if (activeChapterLock().locked) return;
    state.documentDirty = true;
    const index = activeChapterIndex();
    if (state.chapters[index]) state.chapters[index].title = $('chapterTitle').value;
    renderChapterList();
  });
  $('documentTitle').addEventListener('input', () => { state.documentDirty = true; });
  document.querySelectorAll('.rich-toolbar [data-command]').forEach(button => button.addEventListener('click', () => {
    if (chapterMode() && activeChapterLock().locked) return showToast('이 챕터는 연결된 확정 자료이므로 수정할 수 없습니다.');
    activeRichEditor().focus();
    document.execCommand(button.dataset.command, false, button.dataset.value || null);
    state.documentDirty = true;
  }));
  window.addEventListener('beforeunload', event => {
    if (!hasUnsavedPacketChanges()) return;
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
  window.setInterval(renderPackages, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderPackages(); });
}

init().catch(error => {
  console.error(error);
  showToast(error?.message || '회의 꾸러미를 시작하지 못했습니다.', 5000);
});
