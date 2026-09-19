/*
Version: v1.5.2
Change: 2026-09-19 - Print concise closing statements and keep two-page audit reports in even-page booklets.
*/
import { supabase } from '../shared/supabase-client.js';
import { MinutesService } from './MinutesService.js?v=1.0.50';
import { MeetingPackageService } from './MeetingPackageService.js?v=1.4.0';
import { buildAuditReportDraft, buildPreMeetingDocuments, usesChapterEditor } from './meeting_templates.js?v=1.5.1';
import { SIGNATURE_PREVIEW_BUCKET } from './signature_preview.js?v=1.0.0';
import { inspectPdfFile, renderPdfUrlToImages } from '../shared/pdf-page-renderer.js?v=1.0.1';

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
  pdfAttachments: [],
  sourceContext: null,
  activeDocument: 'MATERIALS',
  currentStep: 'info',
  documentDirty: false,
  chapters: [],
  activeChapterId: null,
  loading: false,
  autoDraftTimer: null
};

const REFERENCE_2026_INCOME_BUDGET = [
  { name:'금융차입금', basis:'시설자금 대출', amount:280000000 },
  { name:'증좌·차입', basis:'부족 사업비 조달', amount:65800000 },
  { name:'출자금', basis:'신규 조합원 출자', amount:25000000 },
  { name:'후원금수익', basis:'협력 사업 재원', amount:30000000 },
  { name:'회비수익', basis:'임원 운영 지원금', amount:18000000 },
  { name:'사업수익', basis:'발전 및 사업 수익', amount:7200000 }
];

const REFERENCE_2026_EXPENSE_BUDGET = [
  { name:'시설구축비', basis:'태양광발전소 건립', amount:350000000 },
  { name:'일반사업비', basis:'인허가, 설계, 감리비', amount:15000000 },
  { name:'인건비', basis:'사무국 인건비 및 4대보험', amount:36000000 },
  { name:'운영비', basis:'이자, 통신, 회의, 사무용품', amount:9500000 },
  { name:'조합원 교육비', basis:'기후위기 및 에너지 교육', amount:5000000 },
  { name:'예비비', basis:'공사비·물가 변동 대응', amount:10500000 }
];

function numberFromMoney(value) {
  const digits = String(value ?? '').replace(/[^0-9-]/g, '');
  const parsed = Number(digits || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function displayMoney(value) {
  const amount = numberFromMoney(value);
  return amount ? amount.toLocaleString('ko-KR') : '';
}

function defaultAssemblyBookletData(row = state.current) {
  const fiscalYear = Number(row?.fiscal_year || defaultFiscalYear(row));
  const planYear = Number(String(row?.meeting_date || row?.title || '').match(/(?:19|20)\d{2}/)?.[0] || fiscalYear + 1);
  const isReferencePeriod = fiscalYear === 2025 && planYear === 2026;
  return {
    business_report_intro: isReferencePeriod ? '2025년은 조합의 성공적인 출범과 조직 내실 확보를 위한 준비의 해였습니다.' : '',
    business_report_highlights: isReferencePeriod ? [
      '11월 14일 창립총회 개최',
      '11월 19일 제1차 이사회 개최',
      '12월 15일 제2차 이사회 개최',
      '12월 17일 법인설립 등기 완료',
      '12월 23일 사업자등록 완료',
      '12월 26일 조합 공식 계좌 개설 완료',
      '조합 공식 홈페이지와 운영 기반 구축',
      '태양광 부지 확보 지원 및 용인시 관련 부서 기술 검토',
      '경기시민발전협동조합협의회 가입을 통한 정책 협업'
    ].join('\n') : '',
    business_plan_goal: planYear === 2026 ? '시민과 함께 만드는 용인의 햇빛, 에너지 자립의 첫걸음' : '',
    business_plan_details: planYear === 2026 ? [
      '공공부지·공영주차장·유휴부지의 햇빛발전소 후보지 발굴과 인허가 추진',
      '시민 출자와 정책자금을 활용한 발전소 건립 재원 마련',
      '신규 조합원 확대와 기후위기·에너지전환 교육 운영',
      '조합 운영 시스템 고도화와 지역기관·협동조합 공동사업 확대'
    ].join('\n') : '',
    income_budget: planYear === 2026 ? REFERENCE_2026_INCOME_BUDGET.map(row => ({ ...row })) : [],
    expense_budget: planYear === 2026 ? REFERENCE_2026_EXPENSE_BUDGET.map(row => ({ ...row })) : [],
    borrowing_limit: 0,
    borrowing_rule: planYear === 2026 ? '출자금 납입 총액의 5배' : '',
    borrowing_purpose: planYear === 2026 ? '태양광 발전소 건립에 필요한 초기 시설자금 조달' : '',
    other_agenda_text: ''
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
  const typeLabel = row?.meeting_type === 'GENERAL_ASSEMBLY'
    ? (row?.assembly_kind === 'EXTRAORDINARY' ? '임시총회' : '정기총회')
    : (TYPE_LABEL[row?.meeting_type] || '-');
  $('editorMeta').textContent = `${typeLabel} · ${formatDateTimeShort(row)}${row?.location ? ` · ${row.location}` : ''}`;
  $('editorStatus').className = `status ${row?.status || 'DRAFT'}`;
  $('editorStatus').textContent = STATUS_LABEL[row?.status] || '초안';
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
    ? '수입과 지출 합계가 일치합니다.'
    : `${difference > 0 ? '수입이 지출보다' : '지출이 수입보다'} ${Math.abs(difference).toLocaleString('ko-KR')}원 많습니다.`;
  $('budgetSummary').innerHTML = `<span>수입 ${income.toLocaleString('ko-KR')}원</span><span>지출 ${expense.toLocaleString('ko-KR')}원</span><span class="difference ${difference === 0 ? 'ok' : 'warn'}">${escapeHtml(differenceText)}</span>`;
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
        <label class="comparison-option" ${state.current?.meeting_type === 'GENERAL_ASSEMBLY' ? '' : 'hidden'}>
          <input type="checkbox" data-field="requires_article_comparison" ${row.requires_article_comparison === true ? 'checked' : ''}>
          <span><strong>신구조문 대비표 포함</strong><small>정관·규약·규정을 바꾸는 안건일 때만 선택하세요. 기본값은 사용하지 않음입니다.</small></span>
        </label>
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
      private_notes: value('private_notes'),
      requires_article_comparison: card.querySelector('[data-field="requires_article_comparison"]')?.checked === true
    };
  });
}

function updateDocumentModeLabels() {
  const assembly = $('meetingType').value === 'GENERAL_ASSEMBLY';
  const regularAssembly = assembly && $('assemblyKind').value !== 'EXTRAORDINARY';
  $('assemblyKindField').hidden = !assembly;
  $('fiscalYearField').hidden = !regularAssembly;
  $('assemblySourcePanel').hidden = !regularAssembly;
  $('assemblyBookletPanel').hidden = !regularAssembly;
  $('bookPrintHelp').hidden = !assembly;
  $('materialsTab').textContent = assembly ? '📚 총회 자료집' : '📄 이사회 회의자료';
  $('agendaModeNotice').textContent = assembly
    ? (regularAssembly
      ? '정기총회는 전차 의사록·감사·사업보고 및 결산·조건부 배당·조건부 출자금 반환·사업계획·차입금 한도·기타안건을 기본 순서로 구성합니다. 위 자료집 입력을 먼저 확인하고, 아래에는 그 밖에 추가로 심의할 의안만 적으세요.'
      : '임시총회에는 감사·결산·배당·사업계획을 자동으로 넣지 않습니다. 이번 임시총회에서 실제로 심의할 의안만 순서대로 적으세요.')
    : '보고·의결·논의할 안건을 적으면 한 장짜리 이사회 회의자료와 진행 시나리오에 반영됩니다.';
  $('documentModeNotice').textContent = assembly
    ? (regularAssembly
      ? '정기총회 기본 순서는 전차 의사록 확인 → 감사보고서 → 사업보고 및 결산 → 배당·이익처분(있을 때) → 감자·탈퇴 출자금 반환(있을 때) → 사업계획·예산 → 차입금 한도 → 추가 의안 → 기타안건입니다.'
      : '임시총회 자료집과 시나리오는 등록한 의안만으로 구성합니다.')
    : '기존 제6차 이사회 문서를 기준으로 한 장짜리 회의자료와 진행 시나리오를 준비합니다.';
  if (regularAssembly) renderAssemblySourceStatus();
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
    $('prepareAuditButton').disabled = true;
    $('openAuditButton').hidden = true;
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
  $('prepareAuditButton').disabled = !closingReport || !closing.is_closed;
  $('prepareAuditButton').textContent = audit ? '감사보고서 초안 갱신·서명 화면 열기' : '감사보고서 작성·전자검토 요청';
  $('openAuditButton').hidden = !audit?.id;
}

async function loadAssemblySources({ render = true } = {}) {
  if (!state.current || state.current.meeting_type !== 'GENERAL_ASSEMBLY' || state.current.assembly_kind === 'EXTRAORDINARY') {
    state.sourceContext = null;
    if (render) renderAssemblySourceStatus();
    return null;
  }
  const { data, error } = await MeetingPackageService.getAssemblySources(state.current.id);
  if (error) throw error;
  state.sourceContext = data || null;
  if (render) renderAssemblySourceStatus();
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

function rememberActiveChapter() {
  if (!chapterMode() || !state.chapters.length || !$('chapterEditor')) return;
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
  return state.pdfAttachments.filter(row => row.insert_after_chapter_id === state.activeChapterId);
}

function renderPdfAttachmentList() {
  if (!$('pdfAttachmentPanel') || !$('pdfAttachmentList')) return;
  const available = chapterMode() && state.activeDocument === 'MATERIALS' && Boolean(state.activeChapterId);
  $('pdfAttachmentPanel').hidden = !available;
  if (!available) {
    $('pdfAttachmentList').replaceChildren();
    return;
  }
  const rows = activeChapterPdfAttachments();
  $('pdfAttachmentList').innerHTML = rows.length
    ? rows.map(row => `<div class="pdf-attachment-row" data-pdf-attachment-id="${escapeHtml(row.id)}">
        <span class="pdf-icon">📎</span>
        <span class="pdf-meta"><strong>${escapeHtml(row.title)}</strong><small>${Number(row.page_count || 0)}쪽 · ${formatFileSize(row.file_size)}</small></span>
        <button type="button" class="btn btn-small btn-danger" data-pdf-action="delete">삭제</button>
      </div>`).join('')
    : '<div class="pdf-attachment-empty">첨부한 PDF가 없습니다. 자동 자료가 없는 항목은 그대로 비워 두어도 됩니다.</div>';
}

function renderActiveChapter() {
  if (!state.chapters.length) {
    $('chapterTitle').value = '';
    $('chapterEditor').className = 'rich-editor chapter-preview';
    $('chapterEditor').innerHTML = '<p>자료집 챕터가 없습니다.</p>';
    $('chapterPosition').textContent = '';
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
  $('moveChapterUpButton').disabled = index === 0;
  $('moveChapterDownButton').disabled = index >= state.chapters.length - 1;
  renderChapterList();
  renderPdfAttachmentList();
}

function renderActiveDocument() {
  const doc = state.documents.get(state.activeDocument) || {};
  $('documentTitle').value = doc.title || defaultDocumentTitle(state.activeDocument);
  const useChapters = chapterMode();
  $('documentEditor').hidden = useChapters;
  $('chapterLayout').hidden = !useChapters;
  $('pdfAttachmentPanel').hidden = !useChapters;
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
    $('chapterPosition').textContent = '';
    renderPdfAttachmentList();
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
    chairName,
    officials: state.officials,
    sourceContext: state.sourceContext
  });
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
  await loadAssemblySources();
  refreshAutoDrafts({ render: state.currentStep === 'documents' });
  if (!quiet) showToast('기본정보를 저장했습니다.');
  return true;
}

async function prepareAuditReport() {
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
  const title = `${source.fiscal_year}년도 감사보고서`;
  const content = sanitizeHtml(buildAuditReportDraft({
    row: state.current,
    coopName: state.runtime?.coop_name || state.company.company_name || '협동조합',
    officials: state.officials,
    sourceContext: source
  }));
  const { data, error } = await MeetingPackageService.prepareAuditReport(state.current.id, { title, content });
  if (error) throw error;
  await loadAssemblySources();
  refreshAutoDrafts({ render: state.currentStep === 'documents' });
  const minuteId = data?.id || state.sourceContext?.audit_report?.id;
  if (minuteId) window.open(`/minutes/minutes_sign.html?minuteId=${encodeURIComponent(minuteId)}`, '_blank', 'noopener');
  showToast('감사보고서를 감사 전자검토·서명 문서로 준비했습니다.', 3600);
}

function openAuditReport() {
  const minuteId = state.sourceContext?.audit_report?.id;
  if (!minuteId) return showToast('먼저 감사보고서를 준비해 주세요.');
  window.open(`/minutes/minutes_sign.html?minuteId=${encodeURIComponent(minuteId)}`, '_blank', 'noopener');
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
  html,body{margin:0;color:#172033;background:#fff;font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;font-size:11pt;line-height:1.62;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1{font-size:23pt;line-height:1.3;margin:0 0 18pt;padding-bottom:10pt;border-bottom:3pt solid #f97316;letter-spacing:-.025em}
  h2{font-size:16pt;line-height:1.4;margin:18pt 0 8pt;color:#9a3412}
  h3{font-size:12.5pt;margin:13pt 0 6pt;color:#334155}
  h4,p,li,td,th,div,span,small{font-size:11pt}
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
  .bill-major-content{display:grid;grid-template-columns:88pt 1fr;border-top:2pt solid #fb923c;border-bottom:1pt solid #fed7aa;margin:10pt 0}.bill-major-content dt,.bill-major-content dd{margin:0;padding:10pt;border-bottom:1pt solid #fed7aa}.bill-major-content dt{font-weight:900;color:#9a3412;background:#fff7ed}.bill-major-content dd{background:#fff}.budget-balance{padding:8pt 10pt;border-radius:7pt;font-weight:800}.budget-balance.is-balanced{background:#ecfdf5;color:#047857}.budget-balance.is-unbalanced{background:#fef2f2;color:#b91c1c}
  .chapter-financial>h1,.chapter-minutes>h1,.chapter-audit>h1{border-bottom-color:#fb923c}
  .audit-report-document{color:#1e293b}
  .audit-document-heading{text-align:center;margin-bottom:20pt;padding-bottom:14pt;border-bottom:4pt solid #f97316}
  .audit-document-heading>span{display:inline-block;margin-bottom:6pt;color:#c2410c;font-weight:900}
  .audit-document-heading h1{margin:0;padding:0;border:0;font-size:27pt;letter-spacing:.22em}
  .audit-document-heading p{margin:7pt 0 0;color:#475569;font-weight:800}
  .audit-meta-table{margin:0 0 14pt}
  .audit-meta-table th{width:86pt;text-align:left}
  .audit-purpose{margin:12pt 0 18pt;padding:10pt 12pt;border-left:5pt solid #fb923c;background:#fffaf5}
  .audit-result-block{margin:10pt 0;padding:12pt 14pt;border:1pt solid #e2e8f0;border-radius:8pt;background:#f8fafc;break-inside:avoid}
  .audit-result-block h3{margin-top:0;color:#1e293b}
  .audit-writing-box{margin-top:10pt;padding:10pt 12pt;border:1pt solid #fdba74;border-radius:7pt;background:#fff;break-inside:avoid}
  .audit-writing-box>strong{display:block;margin-bottom:5pt;color:#9a3412}
  .audit-writing-box p{min-height:18pt;margin:0;white-space:pre-wrap}
  .audit-writing-box-required{border-width:2pt;background:#fffaf5}
  .audit-overall-opinion{font-weight:800}
  .audit-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7pt;margin:10pt 0}
  .audit-summary-grid>div{padding:9pt 10pt;border:1pt solid #e2e8f0;border-radius:7pt;background:#f8fafc;break-inside:avoid}
  .audit-summary-grid span{display:block;color:#64748b}.audit-summary-grid strong{display:block;margin-top:4pt;font-variant-numeric:tabular-nums}
  .audit-signature-date{margin-top:24pt;text-align:center}.audit-signers{width:260pt;margin-left:auto;text-align:right;break-inside:avoid}.audit-signers>strong{display:block;margin-bottom:7pt}
  .financial-statement-page{color:#1e293b}
  .financial-statement-heading{text-align:center;margin-bottom:20pt;padding:18pt 14pt 15pt;border-top:5pt solid #f97316;border-bottom:1pt solid #fdba74;background:#fffaf5;break-inside:avoid}
  .financial-statement-heading>span{display:inline-block;padding:4pt 9pt;border-radius:999pt;background:#ffedd5;color:#9a3412;font-weight:900}
  .financial-statement-heading h1{margin:9pt 0 4pt;padding:0;border:0;font-size:21pt;line-height:1.3;letter-spacing:-.035em;color:#172033;word-break:keep-all}
  .financial-statement-heading p{margin:0;font-weight:800;color:#475569}
  .financial-statement-heading small{display:block;margin-top:8pt;text-align:right;color:#64748b}
  .financial-statement-section{margin:0 0 18pt;break-inside:avoid}
  .financial-balance-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11pt;align-items:start}
  .financial-balance-grid .financial-statement-section{margin-bottom:11pt}
  .financial-balance-grid th,.financial-balance-grid td{padding:6pt}
  .financial-statement-section h2{display:flex;align-items:center;gap:8pt;margin:0 0 7pt;padding:7pt 10pt;border-left:5pt solid #fb923c;background:#fff7ed;color:#7c2d12}
  .financial-statement-section table{margin:0;border:1.5pt solid #64748b}
  .financial-statement-section th{background:#ffedd5}.financial-statement-section tbody tr:nth-child(even){background:#f8fafc}
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
    state.pdfAttachments = data.pdfAttachments || [];
    state.sourceContext = null;
    state.activeDocument = 'MATERIALS';
    state.documentDirty = false;
    $('editorPlaceholder').hidden = true;
    $('editorBody').hidden = false;
    renderEditorHeader();
    fillInfoForm();
    renderAgendaList();
    await loadAssemblySources();
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
    assembly_kind: type === 'GENERAL_ASSEMBLY' ? $('newAssemblyKind').value : null,
    title,
    meeting_number: $('newMeetingNumber').value.trim() || null,
    fiscal_year: type === 'GENERAL_ASSEMBLY' && $('newAssemblyKind').value !== 'EXTRAORDINARY' ? new Date().getFullYear() - 1 : null,
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
  state.pdfAttachments = [];
  state.sourceContext = null;
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
  state.agendas.push({ agenda_kind:'DECISION', title:'', summary:'', background:'', proposal_text:'', office_report:'', scenario_notes:'', decision_draft:'', decision_result:'', discussion_notes:'', document_notes:'', private_notes:'', requires_article_comparison:false });
  renderAgendaList();
  scheduleAutoDraftRefresh();
  document.querySelector('.agenda-card:last-child input[data-field="title"]')?.focus();
}

function addBudgetRow(kind) {
  const rows = collectBudgetRows(kind);
  rows.push({ name:'', basis:'', amount:0 });
  renderBudgetRows(kind, rows);
  updateBudgetSummary();
  const container = $(kind === 'income' ? 'incomeBudgetRows' : 'expenseBudgetRows');
  container.querySelector('.budget-row:last-child [data-budget-field="name"]')?.focus();
  scheduleAutoDraftRefresh();
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
  scheduleAutoDraftRefresh();
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
  if (!state.current || !chapterMode() || !state.activeChapterId) throw new Error('PDF를 붙일 챕터를 먼저 선택해 주세요.');
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) throw new Error('PDF 파일은 20MB 이하만 첨부할 수 있습니다.');
  const inspected = await inspectPdfFile(file);
  if (state.documentDirty) await saveActiveDocument();
  const title = String(file.name || '첨부 자료').replace(/\.pdf$/i, '').trim() || '첨부 자료';
  const existing = activeChapterPdfAttachments();
  const { data, error } = await MeetingPackageService.uploadPdfAttachment(state.current.id, file, {
    title,
    insert_after_chapter_id: state.activeChapterId,
    page_count: inspected.pageCount,
    sort_order: existing.length ? Math.max(...existing.map(row => Number(row.sort_order || 0))) + 1 : 0
  });
  if (error) throw error;
  state.pdfAttachments.push(data);
  state.pdfAttachments.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  renderPdfAttachmentList();
  showToast(`「${title}」 ${inspected.pageCount}쪽을 이 챕터 뒤에 붙였습니다.`);
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
  $('generateAllButton').addEventListener('click', () => runAction(generateAllDocuments));
  $('refreshAssemblySourcesButton').addEventListener('click', () => runAction(async () => {
    await loadAssemblySources();
    refreshAutoDrafts({ render: state.currentStep === 'documents' });
    showToast('총회 연동 자료를 다시 확인했습니다.');
  }));
  $('prepareAuditButton').addEventListener('click', () => runAction(prepareAuditReport));
  $('openAuditButton').addEventListener('click', openAuditReport);
  $('saveDocumentButton').addEventListener('click', () => runAction(saveActiveDocument));
  $('printDocumentButton').addEventListener('click', () => runAction(printActiveDocument));
  $('printChapterButton').addEventListener('click', () => runAction(printCurrentChapter));
  $('previousChapterButton').addEventListener('click', () => stepChapter(-1));
  $('nextChapterButton').addEventListener('click', () => stepChapter(1));
  $('addChapterButton').addEventListener('click', addChapter);
  $('moveChapterUpButton').addEventListener('click', () => moveChapter(-1));
  $('moveChapterDownButton').addEventListener('click', () => moveChapter(1));
  $('deleteChapterButton').addEventListener('click', deleteChapter);
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
  document.querySelectorAll('.step-tab').forEach(button => button.addEventListener('click', () => switchStep(button.dataset.step)));
  document.querySelectorAll('.doc-tab').forEach(button => button.addEventListener('click', () => {
    rememberActiveDocument();
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
