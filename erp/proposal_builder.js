/* Version: v1.4.6 | 2026-09-07 | Facility-based PDF default filename. */
(() => {
  'use strict';

  const VERSION = '1.4.6';
  const REQUEST_TIMEOUT_MS = 12000;
  const TEMPLATE_URL = 'proposal_template_parking.html?v=1.2.1';
  const DRAFT_KEY = 'yonginsolar.erp.proposal-builder.v1';
  const SUPABASE_URL = 'https://ifdqlwxgqgsvnawmhlfc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h';
  const DRAFT_FIELDS = [
    'facilityType', 'siteProposalNote', 'mandatoryKnown', 'existingInstallationKnown', 'noMandatory', 'voluntaryBaseKw',
    'proposalDate', 'proposalVersion', 'facilityName', 'regionFull', 'regionShort', 'siteAddress',
    'siteOverlayLabel', 'siteFeatureLines', 'siteCheckLines', 'mandatoryKw', 'hasExistingInstallation', 'existingKw', 'expandedMinKw', 'expandedKw', 'unitCostManwon', 'salePriceWon',
    'sunHours', 'operationPct', 'returnPct', 'constructionMonth', 'completionMinMonth',
    'completionMaxMonth', 'memberTotal', 'shareCapitalManwon', 'individualMembers',
    'organizationMembers', 'chairPhone', 'officePhone', 'keepNamsaOverlay',
    'visitDirector', 'visitDirectorPhone', 'statsAsOf'
  ];

  const state = {
    client: null,
    coopId: '',
    directorContactRequest: null,
    directorPhoneRevision: 0,
    templateHtml: '',
    siteImageDataUrl: '',
    imageLoadPromise: Promise.resolve(),
    imageLoadError: null,
    imageSequence: 0,
    previewReady: Promise.resolve(),
    resolvePreviewReady: null,
    exportInFlight: false,
    customOverlays: [],
    selectedOverlayId: '',
    overlayDrawMode: false,
    overlaySequence: 0,
    lastExistingKw: 57,
    editMode: false,
    manualDirty: false,
    renderTimer: 0,
    bootInFlight: false,
    bootAttempt: 0
  };
  state.useSamplePhoto = true;
  state.photoName = '';
  state.library = null;
  state.loadedCopyEdits = [];
  state.draftKey = DRAFT_KEY;

  const el = {
    bootPanel: document.getElementById('bootPanel'),
    bootMessage: document.getElementById('bootMessage'),
    bootSpinner: document.getElementById('bootSpinner'),
    bootError: document.getElementById('bootError'),
    bootActions: document.getElementById('bootActions'),
    bootRetry: document.getElementById('bootRetry'),
    appShell: document.getElementById('appShell'),
    form: document.getElementById('proposalForm'),
    previewFrame: document.getElementById('previewFrame'),
    previewStatus: document.getElementById('previewStatus'),
    pageCount: document.getElementById('pageCount'),
    remainingKw: document.getElementById('remainingKw'),
    siteImage: document.getElementById('siteImage'),
    siteImageName: document.getElementById('siteImageName'),
    siteOverlayLabel: document.getElementById('siteOverlayLabel'),
    addOverlayButton: document.getElementById('addOverlayButton'),
    deleteOverlayButton: document.getElementById('deleteOverlayButton'),
    clearOverlayButton: document.getElementById('clearOverlayButton'),
    overlayCount: document.getElementById('overlayCount'),
    overlayAngle: document.getElementById('overlayAngle'),
    resetOverlayAngleButton: document.getElementById('resetOverlayAngleButton'),
    hasExistingInstallation: document.getElementById('hasExistingInstallation'),
    existingKw: document.getElementById('existingKw'),
    keepNamsaOverlay: document.getElementById('keepNamsaOverlay'),
    applyButton: document.getElementById('applyButton'),
    editButton: document.getElementById('editButton'),
    printButton: document.getElementById('printButton'),
    printTopButton: document.getElementById('printTopButton'),
    downloadButton: document.getElementById('downloadButton'),
    resetButton: document.getElementById('resetButton')
  };

  function getClient() {
    if (state.client) return state.client;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      const error = new Error('SUPABASE_LIBRARY_UNAVAILABLE');
      error.code = 'SUPABASE_LIBRARY_UNAVAILABLE';
      throw error;
    }
    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: {
        headers: {
          'x-erp-host': window.CoopRouteGuard?.getErpRuntimeHost(location) || String(location.hostname || '').trim().toLowerCase(),
          'x-public-host': window.CoopRouteGuard?.getErpRuntimeHost(location) || String(location.hostname || '').trim().toLowerCase()
        }
      }
    });
    return state.client;
  }

  async function withTimeout(task, label) {
    let timer = 0;
    try {
      return await Promise.race([
        Promise.resolve(task),
        new Promise((_, reject) => {
          timer = window.setTimeout(() => {
            const error = new Error(`${label || 'REQUEST'}_TIMEOUT`);
            error.code = 'PROPOSAL_BUILDER_REQUEST_TIMEOUT';
            reject(error);
          }, REQUEST_TIMEOUT_MS);
        })
      ]);
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function isAdminFallback(user) {
    const role = String(user?.role || '').trim().toLowerCase();
    const position = String(user?.position || '').trim();
    return role === 'admin' || role === 'admin_all' || position === '국장';
  }

  async function loadSiteAdminPermission(user) {
    const coopId = String(user?.coop_id || '').trim();
    const roleKey = String(user?.role || '').trim();
    const positionKey = String(user?.position || '').trim();
    if (!coopId || (!roleKey && !positionKey)) return { hasSiteAdmin: false, isLegacyEmpty: false };
    const roleKeys = [...new Set([roleKey, positionKey].filter(Boolean))];
    if (roleKey === 'admin') roleKeys.push('admin_all');
    if (roleKey === 'admin_all') roleKeys.push('admin');
    const { data, error } = await state.client
      .from('erp_role_permissions')
      .select('permission_key')
      .eq('coop_id', coopId)
      .in('scope', ['role', 'position'])
      .in('role_key', roleKeys)
      .eq('is_enabled', true);
    if (error) throw error;
    const permissions = new Set((Array.isArray(data) ? data : [])
      .map((row) => String(row?.permission_key || '').trim())
      .filter(Boolean));
    return {
      hasSiteAdmin: permissions.has('site.admin') || permissions.has('member.admin'),
      isLegacyEmpty: permissions.size === 0
    };
  }

  function resetBootUi(message) {
    el.bootPanel.hidden = false;
    el.appShell.classList.remove('ready');
    el.bootMessage.textContent = String(message || 'ERP 로그인과 관리자 권한을 확인하고 있습니다.');
    el.bootSpinner.hidden = false;
    el.bootError.hidden = true;
    el.bootError.textContent = '';
    el.bootActions.hidden = true;
    el.bootRetry.disabled = false;
  }

  function showBootError(message) {
    el.bootPanel.hidden = false;
    el.appShell.classList.remove('ready');
    el.bootMessage.textContent = '제안서 만들기를 열지 못했습니다.';
    el.bootSpinner.hidden = true;
    el.bootError.textContent = String(message || '권한을 확인한 뒤 다시 시도해 주세요.');
    el.bootError.hidden = false;
    el.bootActions.hidden = false;
  }

  function numberValue(id) {
    const value = Number(document.getElementById(id)?.value);
    return Number.isFinite(value) ? value : 0;
  }

  function textValue(id) {
    return String(document.getElementById(id)?.value || '').trim();
  }

  function lineValues(id) {
    return textValue(id)
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  function trimNumber(value, maximumFractionDigits = 1) {
    return Number(value).toLocaleString('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits
    });
  }

  function formatDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[1]}.${match[2]}.${match[3]}` : String(value || '').replaceAll('-', '.');
  }

  function formatProjectCost(won) {
    const manwon = Math.round(won / 10000);
    if (manwon < 10000) return `${manwon.toLocaleString('ko-KR')}만원`;
    const eok = Math.floor(manwon / 10000);
    const rest = manwon % 10000;
    return rest ? `${eok}억 ${rest.toLocaleString('ko-KR')}만원` : `${eok}억원`;
  }

  function formatApproxManwon(won, suffix = '') {
    return `약 ${Math.round(won / 10000).toLocaleString('ko-KR')}만원${suffix}`;
  }

  function calculateFinance(capacityKw, model) {
    const projectCost = capacityKw * model.unitCostManwon * 10000;
    const annualGeneration = capacityKw * model.sunHours * 365;
    const annualRevenue = annualGeneration * model.salePriceWon;
    const localReturn = annualRevenue * model.returnPct / 100;
    const operationReserve = projectCost * model.operationPct / 100;
    const annualCash = annualRevenue - localReturn - operationReserve;
    const payback = annualCash > 0 ? projectCost / annualCash : 0;
    let twentyYearCash = 0;
    for (let year = 0; year < 20; year += 1) {
      const degradedRevenue = annualRevenue * Math.pow(0.995, year);
      twentyYearCash += degradedRevenue * (1 - model.returnPct / 100) - operationReserve;
    }
    return {
      projectCost,
      annualGeneration,
      annualRevenue,
      localReturn,
      operationReserve,
      annualCash,
      payback,
      twentyYearResidual: twentyYearCash - projectCost
    };
  }

  function readModel() {
    normalizeExistingZero();
    const noMandatory = document.getElementById('noMandatory').checked;
    const mandatoryKw = !noMandatory && document.getElementById('mandatoryKnown').checked && textValue('mandatoryKw') !== '' ? numberValue('mandatoryKw') : null;
    const existingKnown = document.getElementById('existingInstallationKnown').checked;
    const hasExistingInstallation = Boolean(el.hasExistingInstallation.checked);
    const existingKw = hasExistingInstallation ? numberValue('existingKw') : 0;
    const remainingKw = noMandatory ? (textValue('voluntaryBaseKw') ? numberValue('voluntaryBaseKw') : null) : (mandatoryKw !== null && existingKnown ? Math.max(mandatoryKw - existingKw, 0) : null);
    const model = {
      proposalDate: textValue('proposalDate'),
      proposalVersion: textValue('proposalVersion') || 'v1.0',
      facilityName: textValue('facilityName'),
      regionFull: textValue('regionFull'),
      regionShort: textValue('regionShort'),
      siteAddress: textValue('siteAddress'),
      facilityType: textValue('facilityType'),
      siteProposalNote: textValue('siteProposalNote'),
      existingKnown,
      noMandatory,
      siteOverlayLabel: textValue('siteOverlayLabel') || '신규 설치 검토 대상지',
      siteFeatureLines: lineValues('siteFeatureLines'),
      siteCheckLines: lineValues('siteCheckLines'),
      mandatoryKw,
      hasExistingInstallation,
      existingKw,
      remainingKw,
      expandedMinKw: textValue('expandedMinKw') === '' ? null : numberValue('expandedMinKw'),
      expandedKw: textValue('expandedKw') === '' ? null : numberValue('expandedKw'),
      unitCostManwon: numberValue('unitCostManwon'),
      salePriceWon: numberValue('salePriceWon'),
      sunHours: numberValue('sunHours'),
      operationPct: numberValue('operationPct'),
      returnPct: numberValue('returnPct'),
      constructionMonth: Math.round(numberValue('constructionMonth')),
      completionMinMonth: Math.round(numberValue('completionMinMonth')),
      completionMaxMonth: Math.round(numberValue('completionMaxMonth')),
      memberTotal: Math.round(numberValue('memberTotal')),
      shareCapitalManwon: numberValue('shareCapitalManwon'),
      individualMembers: Math.round(numberValue('individualMembers')),
      organizationMembers: Math.round(numberValue('organizationMembers')),
      chairPhone: textValue('chairPhone'),
      officePhone: textValue('officePhone'),
      visitDirector: textValue('visitDirector'),
      visitDirectorPhone: textValue('visitDirectorPhone'),
      statsAsOf: textValue('statsAsOf'),
      keepNamsaOverlay: Boolean(el.keepNamsaOverlay.checked)
    };
    el.remainingKw.value = remainingKw === null ? '확인 필요' : trimNumber(remainingKw);
    document.querySelector('label[for="remainingKw"]').textContent = noMandatory ? '기준 설치안 용량(kW)' : '추가 의무용량(kW) · 자동 계산';
    return model;
  }

  function validateModel(model) {
    if (!model.proposalDate || !model.facilityName || !model.regionFull || !model.regionShort) {
      throw new Error('제안일, 대상 시설과 지역명을 입력해 주세요.');
    }
    if (model.mandatoryKw < 0 || model.existingKw < 0 || (model.expandedMinKw !== null && model.expandedMinKw <= 0) || (model.expandedKw !== null && model.expandedKw <= 0)) {
      throw new Error('설치 용량 값을 확인해 주세요.');
    }
    if (model.hasExistingInstallation && model.existingKw <= 0) {
      throw new Error('기존 설비가 있으면 기존 설치용량을 0보다 크게 입력해 주세요.');
    }
    if (model.noMandatory && model.remainingKw !== null && model.remainingKw <= 0) throw new Error('자발적 사업의 기준 설치용량은 0보다 크게 입력하거나 비워 주세요.');
    if (model.expandedMinKw !== null && model.expandedKw !== null && model.expandedMinKw > model.expandedKw) {
      throw new Error('확대안 범위 시작 용량은 수지 비교 확대안 용량보다 클 수 없습니다.');
    }
    if (model.expandedKw !== null && model.remainingKw !== null && model.expandedKw < model.remainingKw) {
      throw new Error('제안 신규 설치용량은 기준 설치용량보다 작을 수 없습니다.');
    }
    if (model.unitCostManwon <= 0 || model.salePriceWon <= 0 || model.sunHours <= 0) {
      throw new Error('공사비, 판매단가와 발전시간은 0보다 커야 합니다.');
    }
    if (model.returnPct < 0 || model.returnPct > 100 || model.operationPct < 0 || model.operationPct > 100) {
      throw new Error('운영·수선충당률과 지역환원율은 0~100 사이여야 합니다.');
    }
    if (model.constructionMonth <= 0 || model.completionMinMonth < model.constructionMonth || model.completionMaxMonth < model.completionMinMonth) {
      throw new Error('완공 목표는 착공 목표보다 뒤여야 하고, 완공 시작은 완공 끝보다 늦을 수 없습니다.');
    }
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function createReplacer(entries) {
    const map = new Map(entries.filter(([from]) => from).sort((a, b) => b[0].length - a[0].length));
    const pattern = new RegExp([...map.keys()].map(escapeRegExp).join('|'), 'g');
    return (value) => String(value || '').replace(pattern, (matched) => map.get(matched));
  }

  function replaceDocumentText(doc, replaceText) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parentTag = node.parentElement?.tagName;
      if (parentTag === 'STYLE' || parentTag === 'SCRIPT') return;
      node.nodeValue = replaceText(node.nodeValue);
    });
    doc.querySelectorAll('[alt], [title]').forEach((node) => {
      ['alt', 'title'].forEach((name) => {
        if (node.hasAttribute(name)) node.setAttribute(name, replaceText(node.getAttribute(name)));
      });
    });
  }

  function buildReplacementEntries(model) {
    const baseFinance = calculateFinance(model.remainingKw, model);
    const expandedFinance = calculateFinance(model.expandedKw, model);
    const effectiveExpandedMinKw = Math.max(model.expandedMinKw, model.remainingKw);
    const minExpandedGeneration = effectiveExpandedMinKw * model.sunHours * 365;
    const maxExpandedGeneration = model.expandedKw * model.sunHours * 365;
    const constructionPrepStart = Math.max(1, model.constructionMonth - 2);
    const constructionPrepEnd = Math.max(constructionPrepStart, model.constructionMonth - 1);
    const dateDisplay = formatDate(model.proposalDate);
    const kw = (value) => value === null ? '확인 필요' : `${trimNumber(value)}kW`;
    const percent = (value) => `${trimNumber(value)}%`;
    return [
      ['이동·남사읍 반도체 국가산단', '용인 반도체 국가산단'],
      ['남사에 뿌리 둔 조합', '용인에 뿌리 둔 조합'],
      ['남사읍에서 LED 조명과', '용인시 남사읍에서 LED 조명과'],
      ['경기 용인시 처인구 남사읍 상동로 28', '경기 용인시 처인구 남사읍 상동로 28'],
      ['남사읍에 기반을 둔 지역 협동조합', '용인에 기반을 둔 지역 협동조합'],
      ['용인시 남사읍', model.facilityType === 'school' ? '학교·교육청' : '시설 관리 주체'],
      ['WHY NOW, WHY NAMSA', 'WHY SOLAR, WHY NOW'],
      ['남사읍행정복지센터', model.facilityName],
      ['경기 용인시 처인구 남사읍 내기로 22', model.siteAddress || '대상지 주소 확인 필요'],
      ['100~120kW', `${trimNumber(effectiveExpandedMinKw)}~${trimNumber(model.expandedKw)}kW`],
      ['13.1~15.8만kWh', `${trimNumber(minExpandedGeneration / 10000)}~${trimNumber(maxExpandedGeneration / 10000)}만kWh`],
      ['1억 1,160만원', formatProjectCost(baseFinance.projectCost)],
      ['2억 1,600만원', formatProjectCost(expandedFinance.projectCost)],
      ['81,468kWh', `${Math.round(baseFinance.annualGeneration).toLocaleString('ko-KR')}kWh`],
      ['157,680kWh', `${Math.round(expandedFinance.annualGeneration).toLocaleString('ko-KR')}kWh`],
      ['약 1,385만원', formatApproxManwon(baseFinance.annualRevenue)],
      ['약 2,681만원', formatApproxManwon(expandedFinance.annualRevenue)],
      ['약 69만원/년', formatApproxManwon(baseFinance.localReturn, '/년')],
      ['약 134만원/년', formatApproxManwon(expandedFinance.localReturn, '/년')],
      ['약 223만원/년', formatApproxManwon(baseFinance.operationReserve, '/년')],
      ['약 432만원/년', formatApproxManwon(expandedFinance.operationReserve, '/년')],
      ['약 1,093만원', formatApproxManwon(baseFinance.annualCash)],
      ['약 2,115만원', formatApproxManwon(expandedFinance.annualCash)],
      ['약 10.2년', baseFinance.payback > 0 ? `약 ${baseFinance.payback.toFixed(1)}년` : '산정 불가'],
      ['약 0.95억원', `약 ${(baseFinance.twentyYearResidual / 100000000).toFixed(2)}억원`],
      ['약 1.83억원', `약 ${(expandedFinance.twentyYearResidual / 100000000).toFixed(2)}억원`],
      ['180만원/kW', `${trimNumber(model.unitCostManwon)}만원/kW`],
      ['일평균 3.6시간', `일평균 ${trimNumber(model.sunHours)}시간`],
      ['판매단가 170원/kWh', `판매단가 ${trimNumber(model.salePriceWon, 0)}원/kWh`],
      ['170원/kWh', `${trimNumber(model.salePriceWon, 0)}원/kWh`],
      ['사업비의 2%', `사업비의 ${percent(model.operationPct)}`],
      ['매출 5%', `매출 ${percent(model.returnPct)}`],
      ['매출의 5%', `매출의 ${percent(model.returnPct)}`],
      ['계약 후 2~3개월', `계약 후 ${constructionPrepStart}~${constructionPrepEnd}개월`],
      ['4개월 차', `${model.constructionMonth}개월 차`],
      ['6~7개월', `${model.completionMinMonth}~${model.completionMaxMonth}개월`],
      ['119kW', kw(model.mandatoryKw)],
      ['57kW', kw(model.existingKw)],
      ['62kW', kw(model.remainingKw)],
      ['120kW', kw(model.expandedKw)],
      ['제안서 v1.6', `제안서 ${model.proposalVersion}`],
      ['2026.09.03', dateDisplay],
      ['257명', `${model.memberTotal.toLocaleString('ko-KR')}명`],
      ['5,960만원', `${model.shareCapitalManwon.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}만원`],
      ['242 + 15', `${model.individualMembers.toLocaleString('ko-KR')} + ${model.organizationMembers.toLocaleString('ko-KR')}`],
      ['개인 242명', `개인 ${model.individualMembers.toLocaleString('ko-KR')}명`],
      ['단체 조합원 15곳', `단체 조합원 ${model.organizationMembers.toLocaleString('ko-KR')}곳`],
      ['010-9025-6911', model.chairPhone],
      ['010-2513-5736', model.officePhone],
      ['남사읍', model.regionFull],
      ['남사', model.regionShort]
    ];
  }

  function slideAt(doc, oneBasedPage) {
    return doc.querySelectorAll('.slide')[oneBasedPage - 1] || null;
  }

  function removeClosestByText(root, selector, pattern) {
    [...(root?.querySelectorAll(selector) || [])].forEach((node) => {
      if (pattern.test(String(node.textContent || '').replace(/\s+/g, ' ').trim())) node.remove();
    });
  }

  function replaceListByHeading(slide, headingText, lines, fallbackText, replaceText) {
    const card = [...(slide?.querySelectorAll('.card') || [])]
      .find((node) => String(node.querySelector('h3')?.textContent || '').trim() === headingText);
    const list = card?.querySelector('ul');
    if (!list) return;
    const values = lines.length ? lines : [fallbackText];
    list.replaceChildren(...values.map((value) => {
      const item = list.ownerDocument.createElement('li');
      item.textContent = replaceText(value);
      return item;
    }));
  }

  function applySiteDetailLists(doc, model, replaceText) {
    const siteSlide = slideAt(doc, 3);
    replaceListByHeading(siteSlide, '현장 특징', model.siteFeatureLines, '현장조사 후 내용을 입력합니다.', (value) => value);
    replaceListByHeading(siteSlide, '먼저 확인할 자료', model.siteCheckLines, '현장조사에 필요한 자료를 확인합니다.', (value) => value);
  }

  function applyNoExistingInstallationContext(doc, model) {
    if (model.hasExistingInstallation) return;
    const site = slideAt(doc, 3);
    site?.querySelectorAll('.existing-label, .existing-zone').forEach(node => node.remove());
    removeClosestByText(site, 'li', /(남측 )?기존 태양광|기존 .*설비의 소유|기존 .*설비/);
    removeClosestByText(slideAt(doc, 12), '.note.warning', /기존 태양광 설비와 신규 설비/);
    removeClosestByText(slideAt(doc, 13), 'tbody tr', /기존 .*자료|기존 설비|신·구 설비/);
  }

  function renderCustomOverlays(doc, model) {
    const shell = doc.querySelector('.photo-shell');
    if (!shell) return;
    state.customOverlays.forEach((overlay, index) => {
      shell.appendChild(createOverlayElement(doc, overlay, model.siteOverlayLabel, index));
    });
  }

  function createOverlayElement(doc, overlay, baseLabel, index) {
    const zone = doc.createElement('div');
    zone.className = 'proposal-custom-zone';
    zone.dataset.overlayId = overlay.id;
    updateOverlayElement(zone, overlay);
    const label = doc.createElement('span');
    label.className = 'proposal-custom-zone-label';
    label.textContent = state.customOverlays.length > 1 ? `${baseLabel} ${index + 1}` : baseLabel;
    const handle = doc.createElement('i');
    handle.className = 'proposal-zone-handle';
    handle.setAttribute('aria-hidden', 'true');
    const rotateHandle = doc.createElement('i');
    rotateHandle.className = 'proposal-zone-rotate-handle';
    rotateHandle.setAttribute('aria-hidden', 'true');
    zone.append(label, handle, rotateHandle);
    return zone;
  }

  function updateOverlayElement(zone, overlay) {
    zone.style.left = `${overlay.x}%`;
    zone.style.top = `${overlay.y}%`;
    zone.style.width = `${overlay.width}%`;
    zone.style.height = `${overlay.height}%`;
    zone.style.transform = `rotate(${Number(overlay.angle) || 0}deg)`;
    zone.style.transformOrigin = 'center center';
  }

  function appendBuilderStyles(doc) {
    const documentStyle = doc.createElement('style');
    documentStyle.id = 'proposalBuilderDocumentStyle';
    documentStyle.textContent = `
      .proposal-custom-zone { position:absolute; z-index:4; border:4px dashed #ff8a00; background:rgba(255,183,61,.20); box-shadow:0 0 0 2px rgba(255,255,255,.78) inset; }
      .proposal-custom-zone-label { position:absolute; left:8px; top:8px; max-width:calc(100% - 16px); padding:5px 9px; border-radius:7px; background:rgba(91,47,0,.88); color:#fff; font-size:15px; line-height:1.25; font-weight:850; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      @media print { .proposal-zone-handle, .proposal-zone-rotate-handle { display:none !important; } .proposal-custom-zone { outline:0 !important; } }
    `;
    doc.head.appendChild(documentStyle);

    const previewStyle = doc.createElement('style');
    previewStyle.id = 'proposalBuilderPreviewStyle';
    previewStyle.textContent = `
      .control-bar { display:none !important; }
      @media screen {
        [data-proposal-editable="true"] { cursor:text; border-radius:4px; transition:background .15s, outline-color .15s; }
        [data-proposal-editable="true"]:hover { outline:2px dashed rgba(8,127,91,.38); outline-offset:3px; }
        [data-proposal-editable="true"]:focus { outline:3px solid rgba(245,160,0,.66); outline-offset:3px; background:rgba(255,244,214,.74); }
        .proposal-custom-zone { cursor:move; touch-action:none; }
        .proposal-custom-zone.is-selected { outline:4px solid #087f5b; outline-offset:3px; }
        .proposal-zone-handle { position:absolute; right:-10px; bottom:-10px; width:22px; height:22px; border:3px solid #fff; border-radius:50%; background:#087f5b; box-shadow:0 2px 7px rgba(0,0,0,.3); cursor:nwse-resize; }
        .proposal-zone-rotate-handle { position:absolute; left:50%; top:-38px; width:28px; height:28px; transform:translateX(-50%); border:4px solid #fff; border-radius:50%; background:#f5a000; box-shadow:0 2px 8px rgba(0,0,0,.34); cursor:grab; touch-action:none; }
        .proposal-zone-rotate-handle::after { content:""; position:absolute; left:50%; top:24px; width:4px; height:14px; transform:translateX(-50%); border-radius:3px; background:#f5a000; }
        .proposal-zone-rotate-handle:active { cursor:grabbing; }
        .photo-shell.proposal-zone-draw-mode { cursor:crosshair; touch-action:none; outline:5px solid rgba(245,160,0,.75); outline-offset:4px; }
      }
      @media print { [data-proposal-editable="true"] { outline:0 !important; background:transparent !important; } }
    `;
    doc.head.appendChild(previewStyle);
  }

  function buildPreviewDocument(model) {
    const doc = new DOMParser().parseFromString(state.templateHtml, 'text/html');
    doc.querySelectorAll('script').forEach((node) => node.remove());
    const replaceText = createReplacer(buildReplacementEntries(model));
    replaceDocumentText(doc, replaceText);
    applySiteDetailLists(doc, model, replaceText);

    const siteImage = doc.querySelector('.photo-shell img');
    doc.querySelectorAll('.photo-caption').forEach((node) => node.remove());
    if (siteImage) {
      siteImage.setAttribute('src', state.siteImageDataUrl || (state.useSamplePhoto ? 'proposal_assets/namsa-site-map.png' : 'proposal_assets/site-photo-placeholder.svg'));
      siteImage.setAttribute('alt', `${model.facilityName} 대상지 사진`);
    }
    if (!model.keepNamsaOverlay || state.siteImageDataUrl) {
      doc.querySelectorAll('.zone-label, .zone, .existing-label, .existing-zone').forEach((node) => {
        node.style.display = 'none';
      });
    }
    applyNoExistingInstallationContext(doc, model);
    applySiteContext(doc, model);
    renderCustomOverlays(doc, model);
    appendBuilderStyles(doc);
    editableCandidates(doc).forEach((node, index) => {
      node.dataset.copyId = String(index);
      node.dataset.copyBase = node.textContent;
    });
    state.loadedCopyEdits.forEach((edit) => {
      let node = doc.querySelector(`[data-copy-id="${Number(edit.index)}"]`);
      if (!node || node.dataset.copyBase !== edit.baseText) {
        const matches = [...doc.querySelectorAll('[data-copy-id]')].filter(candidate => candidate.dataset.copyBase === edit.baseText);
        node = matches.length === 1 ? matches[0] : null;
      }
      if (!node || typeof edit.text !== 'string') return;
      node.textContent = edit.text;
      node.style.whiteSpace = 'pre-line';
    });
    doc.title = pdfDocumentTitle(model.facilityName);
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }

  function applySiteContext(doc, model) {
    const put = (page, selector, text) => { const node = slideAt(doc, page)?.querySelector(selector); if (node) node.textContent = text; };
    const kw = (n) => n === null ? '확인 필요' : `${trimNumber(n)}kW`;
    const unconfirmed = model.remainingKw === null || model.noMandatory;
    put(12, '.safety-grid .card:nth-child(5) p', '시설과 주변 환경에 어울리는 색상·높이·야간조명을 적용합니다.');
    // Region replacement must never move the cooperative or its officers to the target site.
    if (model.siteProposalNote) {
      const slide = slideAt(doc, 5);
      const banner = slide.querySelector('.banner');
      banner.textContent = model.siteProposalNote;
      banner.style.cssText += ';font-size:16px;line-height:1.5;padding:15px 20px;overflow-wrap:anywhere';
      slide.querySelector('h2').textContent = '대상지에 맞는 설치 범위와 함께 검토할 제안을 담았습니다';
    } else if (unconfirmed) put(5, 'h2', '필요한 설치 범위와 함께 전면 차양형도 검토해 주십시오');
    if (model.facilityType === 'school' || model.mandatoryKw === null) {
      put(2, '.grid-3 .card:nth-child(3) h3', '시설 여건에 맞는 에너지 전환');
      put(2, '.grid-3 .card:nth-child(3) p', '시설의 이용 목적과 안전 기준을 먼저 확인하고, 재생에너지 생산과 그늘·비가림을 함께 제공하는 방안을 검토합니다. 의무 적용 여부는 별도로 확인합니다.');
      put(2, '.banner', '이용자의 일상에 도움이 되는 햇빛쉼터와 지역 재생에너지 생산을 함께 제안합니다.');
    }
    if (model.facilityType === 'school') {
      put(2, '.lead', `${model.facilityName}의 주차공간을 학생·교직원의 안전과 교육활동에 지장이 없도록 검토하고, 그늘과 재생에너지를 함께 제공하는 방안을 제안합니다.`);
      put(7, '.flow .step:first-child p', '학교 부지 사용, 교육활동·안전 기준과 관계 기관 절차 협의');
      put(13, '.note', '사업비·금융조건·수익성은 조합이 검토합니다. 학교의 사업비 부담을 전제하지 않으며, 부지 사용 조건과 기본설계 확인 후 재원조달안을 별도 제시합니다.');
      put(15, 'h2', '학교 부지의 소유·관리와 사용 절차를 먼저 확인합니다');
      put(15, '.contract-callout h3', '학교·교육청과 협의해 적합한 사업 구조를 정합니다');
      put(15, '.contract-callout p', '학교시설의 사용 목적과 교육활동을 우선하고, 소유·관리 주체가 정한 절차에 따라 부지 사용과 계약 방식을 검토할 것을 제안합니다.');
      put(15, '.grid-2 .card:first-child h3', '소유·관리와 적용 규정 확인');
      put(15, '.grid-2 .card:first-child p', '시설 소유자와 재산 관리 주체, 학교시설 사용 조건, 안전 기준 및 필요한 심사·협의 절차를 확인합니다.');
      put(15, '.grid-2 .card:nth-child(2) h3', '교육활동과 장기 운영 보호');
      put(15, '.grid-2 .card:nth-child(2) p', '통학·보행 동선, 공사 일정, 유지관리 출입, 보험과 시설 복구 책임을 학교와 협의해 명확히 합니다.');
      put(15, '.note', '시 소유 공영주차장을 전제로 한 조례나 수의계약 가능성을 학교에 그대로 적용하지 않습니다. 관계 기관의 검토를 거쳐 계약 방식을 확정합니다.');
      put(15, '.source', '협의할 자료: 학교시설 소유·관리 현황, 재산 사용 기준, 설치 계획과 안전·유지관리 방안.');
      put(2, '.grid-3 .card:nth-child(3) h3', '발전소와 함께하는 에너지 교육');
      put(2, '.grid-3 .card:nth-child(3) p', '조합이 태양광·에너지 전환·기후 교육을 함께 진행할 수 있습니다. 학생 눈높이에 맞는 교육 대상·횟수·일정은 학교와 협의합니다.');
      put(7, '.participation-support .card:first-child h3', '조합과 함께하는 에너지·기후 교육');
      put(7, '.participation-support .card:first-child p', '학교 발전소를 에너지 전환을 이해하는 계기로 활용하고, 조합이 태양광 발전 원리·기후·지역 에너지 전환 교육을 함께 진행할 수 있습니다. 수업 대상·횟수·일정과 안전한 교육 방식은 학교와 협의합니다.');
      put(17, '.frame > .card.sunny h3', '학교 연계 운영 예시 · 조합과 함께하는 에너지 교육');
      put(17, '.frame > .card.sunny p', '발전소 운영 자료를 활용한 에너지·기후 교육을 함께 기획할 수 있습니다. 설비 점검·보수는 전문 인력이 맡고 학생의 설비 접근은 학교 안전 기준에 따릅니다.');
      put(17, '.frame > .card.sunny > div:first-child', '☀');
    }
    window.ProposalSections.render(doc, model, { slideAt, trimNumber, calculateFinance, formatProjectCost, formatApproxManwon });
  }

  function editableCandidates(doc) {
    const selector = 'h1, h2, h3, h4, p, li, td, th, .cover-kicker, .subtitle, .date, .banner, .note';
    return [...doc.querySelectorAll(selector)]
      .filter((node) => !node.closest('.control-bar') && !node.closest('.page') && !node.closest('.version'))
      .filter((node) => !node.parentElement?.closest(selector));
  }

  function applyEditMode() {
    const doc = el.previewFrame.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('[data-proposal-editable="true"]').forEach((node) => {
      node.removeAttribute('contenteditable');
      node.removeAttribute('spellcheck');
      node.removeAttribute('data-proposal-editable');
    });
    if (state.editMode) {
      editableCandidates(doc).forEach((node) => {
        node.setAttribute('contenteditable', 'true');
        node.setAttribute('spellcheck', 'true');
        node.setAttribute('data-proposal-editable', 'true');
      });
      el.editButton.textContent = '✅ 문구 수정 마치기';
      setStatus('수정할 문장을 미리보기에서 눌러 직접 고치세요. 수정 내용은 PDF와 HTML에 그대로 반영됩니다.', true);
    } else {
      el.editButton.textContent = '✍️ 최종 문구 수정';
      setStatus(state.manualDirty ? '직접 고친 문구가 미리보기에 남아 있습니다. PDF 또는 HTML로 저장할 수 있습니다.' : '입력값과 자동 계산을 반영했습니다.');
    }
  }

  function setStatus(message, dirty = false) {
    el.previewStatus.textContent = String(message || '');
    el.previewStatus.classList.toggle('dirty', Boolean(dirty));
  }

  function roundCoordinate(value) {
    return Math.round(value * 100) / 100;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function normalizeAngle(value) {
    let angle = Number(value) || 0;
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return roundCoordinate(angle);
  }

  function pointerAngle(event, center) {
    return Math.atan2(event.clientY - center.y, event.clientX - center.x) * 180 / Math.PI;
  }

  function overlayById(id) {
    return state.customOverlays.find((overlay) => overlay.id === id) || null;
  }

  function refreshOverlayLabels(doc) {
    const baseLabel = textValue('siteOverlayLabel') || '신규 설치 검토 대상지';
    doc?.querySelectorAll('.proposal-custom-zone').forEach((zone, index) => {
      const label = zone.querySelector('.proposal-custom-zone-label');
      if (label) label.textContent = state.customOverlays.length > 1 ? `${baseLabel} ${index + 1}` : baseLabel;
    });
  }

  function updateOverlayControls(doc = el.previewFrame.contentDocument) {
    const count = state.customOverlays.length;
    const selectedOverlay = state.selectedOverlayId ? overlayById(state.selectedOverlayId) : null;
    const hasSelection = Boolean(selectedOverlay);
    const showSampleTarget = Boolean(state.useSamplePhoto && el.keepNamsaOverlay.checked && !state.siteImageDataUrl && count === 0);
    const showSampleExisting = Boolean(state.useSamplePhoto && el.keepNamsaOverlay.checked && !state.siteImageDataUrl && el.hasExistingInstallation.checked);
    el.overlayCount.textContent = `${count}개 표시`;
    el.deleteOverlayButton.disabled = !hasSelection;
    el.clearOverlayButton.disabled = count === 0;
    el.overlayAngle.disabled = !hasSelection;
    el.resetOverlayAngleButton.disabled = !hasSelection;
    el.overlayAngle.value = String(hasSelection ? Number(selectedOverlay.angle) || 0 : 0);
    el.addOverlayButton.classList.toggle('active', state.overlayDrawMode);
    el.addOverlayButton.textContent = state.overlayDrawMode ? '영역 추가 취소' : '+ 대상지 영역 추가';
    doc?.querySelectorAll('.proposal-custom-zone').forEach((zone) => {
      zone.classList.toggle('is-selected', zone.dataset.overlayId === state.selectedOverlayId);
    });
    doc?.querySelectorAll('.zone-label, .zone').forEach((node) => {
      node.style.display = showSampleTarget ? '' : 'none';
    });
    doc?.querySelectorAll('.existing-label, .existing-zone').forEach((node) => {
      node.style.display = showSampleExisting ? '' : 'none';
    });
    doc?.querySelector('.photo-shell')?.classList.toggle('proposal-zone-draw-mode', state.overlayDrawMode);
  }

  function pointerPercent(event, shell) {
    const rect = shell.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width * 100, 0, 100),
      y: clamp((event.clientY - rect.top) / rect.height * 100, 0, 100)
    };
  }

  function bindOverlayEditor(doc) {
    const shell = doc?.querySelector('.photo-shell');
    if (!shell) return;
    let action = null;

    const selectOverlay = (id) => {
      state.selectedOverlayId = overlayById(id) ? id : '';
      updateOverlayControls(doc);
    };

    shell.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const zone = event.target.closest?.('.proposal-custom-zone');
      const handle = event.target.closest?.('.proposal-zone-handle');
      const rotateHandle = event.target.closest?.('.proposal-zone-rotate-handle');
      const point = pointerPercent(event, shell);

      if (state.overlayDrawMode) {
        const overlay = {
          id: `zone-${Date.now()}-${++state.overlaySequence}`,
          x: roundCoordinate(point.x),
          y: roundCoordinate(point.y),
          width: 0,
          height: 0,
          angle: 0
        };
        state.customOverlays.push(overlay);
        state.selectedOverlayId = overlay.id;
        const element = createOverlayElement(doc, overlay, textValue('siteOverlayLabel') || '신규 설치 검토 대상지', state.customOverlays.length - 1);
        shell.appendChild(element);
        action = { type: 'draw', overlay, element, start: point };
        refreshOverlayLabels(doc);
        updateOverlayControls(doc);
        event.preventDefault();
        return;
      }

      if (!zone) {
        selectOverlay('');
        return;
      }

      const overlay = overlayById(zone.dataset.overlayId);
      if (!overlay) return;
      selectOverlay(overlay.id);
      const shellRect = shell.getBoundingClientRect();
      const center = {
        x: shellRect.left + (overlay.x + overlay.width / 2) / 100 * shellRect.width,
        y: shellRect.top + (overlay.y + overlay.height / 2) / 100 * shellRect.height
      };
      action = {
        type: rotateHandle ? 'rotate' : handle ? 'resize' : 'move',
        overlay,
        element: zone,
        start: point,
        center,
        startPointerAngle: pointerAngle(event, center),
        origin: { x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height, angle: Number(overlay.angle) || 0 }
      };
      event.preventDefault();
      event.stopPropagation();
    });

    doc.addEventListener('pointermove', (event) => {
      if (!action) return;
      const point = pointerPercent(event, shell);
      const { overlay, origin, start } = action;
      if (action.type === 'rotate') {
        overlay.angle = normalizeAngle(origin.angle + pointerAngle(event, action.center) - action.startPointerAngle);
        el.overlayAngle.value = String(overlay.angle);
      } else if (action.type === 'draw') {
        overlay.x = roundCoordinate(Math.min(start.x, point.x));
        overlay.y = roundCoordinate(Math.min(start.y, point.y));
        overlay.width = roundCoordinate(Math.abs(point.x - start.x));
        overlay.height = roundCoordinate(Math.abs(point.y - start.y));
      } else if (action.type === 'move') {
        overlay.x = roundCoordinate(clamp(origin.x + point.x - start.x, 0, 100 - origin.width));
        overlay.y = roundCoordinate(clamp(origin.y + point.y - start.y, 0, 100 - origin.height));
      } else if (action.type === 'resize') {
        overlay.width = roundCoordinate(clamp(origin.width + point.x - start.x, 3, 100 - origin.x));
        overlay.height = roundCoordinate(clamp(origin.height + point.y - start.y, 3, 100 - origin.y));
      }
      updateOverlayElement(action.element, overlay);
      event.preventDefault();
    });

    doc.addEventListener('pointerup', (event) => {
      if (!action) return;
      state.library?.markDirty();
      const finished = action;
      action = null;
      if (finished.type === 'draw') {
        state.overlayDrawMode = false;
        if (finished.overlay.width < 3 || finished.overlay.height < 3) {
          state.customOverlays = state.customOverlays.filter((overlay) => overlay.id !== finished.overlay.id);
          state.selectedOverlayId = '';
          finished.element.remove();
          setStatus('영역이 너무 작아 추가하지 않았습니다. 대상지를 조금 더 크게 드래그해 주세요.', true);
        } else {
          setStatus('대상지 영역을 표시했습니다. 영역을 드래그해 옮기거나 오른쪽 아래 점으로 크기를 조절할 수 있습니다.');
        }
      } else if (finished.type === 'rotate') {
        setStatus(`대상지 표시를 ${trimNumber(finished.overlay.angle)}°로 돌렸습니다. PDF와 HTML에도 같은 각도로 저장됩니다.`);
      } else {
        setStatus('대상지 표시 위치를 반영했습니다. PDF와 HTML에도 같은 위치로 저장됩니다.');
      }
      refreshOverlayLabels(doc);
      updateOverlayControls(doc);
      event.preventDefault();
    });

    updateOverlayControls(doc);
  }

  function toggleOverlayDrawMode() {
    const doc = el.previewFrame.contentDocument;
    const shell = doc?.querySelector('.photo-shell');
    if (!shell) {
      setStatus('3쪽 대상지 사진이 준비된 뒤 다시 눌러 주세요.', true);
      return;
    }
    state.overlayDrawMode = !state.overlayDrawMode;
    if (state.overlayDrawMode) {
      state.selectedOverlayId = '';
      shell.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setStatus('3쪽 사진에서 설치 검토 대상지를 드래그해 표시하세요. 여러 곳이면 영역 추가를 다시 눌러 반복할 수 있습니다.');
    } else {
      setStatus('대상지 영역 추가를 취소했습니다.');
    }
    updateOverlayControls(doc);
  }

  function deleteSelectedOverlay() {
    if (!state.selectedOverlayId) return;
    state.library?.markDirty();
    const id = state.selectedOverlayId;
    state.customOverlays = state.customOverlays.filter((overlay) => overlay.id !== id);
    state.selectedOverlayId = '';
    const doc = el.previewFrame.contentDocument;
    doc?.querySelector(`.proposal-custom-zone[data-overlay-id="${CSS.escape(id)}"]`)?.remove();
    refreshOverlayLabels(doc);
    updateOverlayControls(doc);
    setStatus('선택한 대상지 표시를 삭제했습니다.');
  }

  function updateSelectedOverlayAngle({ commit = false } = {}) {
    const overlay = overlayById(state.selectedOverlayId);
    if (!overlay) return;
    const numericAngle = el.overlayAngle.valueAsNumber;
    // Do not rewrite an unfinished '-', decimal point, or trailing zero while typing.
    if (Number.isFinite(numericAngle)) {
      overlay.angle = roundCoordinate(clamp(numericAngle, -180, 180));
    } else if (!commit) {
      return;
    }
    if (commit) el.overlayAngle.value = String(overlay.angle);
    state.library?.markDirty();
    const doc = el.previewFrame.contentDocument;
    const zone = doc?.querySelector(`.proposal-custom-zone[data-overlay-id="${CSS.escape(overlay.id)}"]`);
    if (zone) updateOverlayElement(zone, overlay);
    setStatus(`선택한 대상지 표시를 ${trimNumber(overlay.angle, 2)}°로 회전했습니다.`);
  }

  function resetSelectedOverlayAngle() {
    if (!overlayById(state.selectedOverlayId)) return;
    el.overlayAngle.value = '0';
    updateSelectedOverlayAngle();
  }

  function clearOverlays() {
    if (!state.customOverlays.length) return;
    if (!window.confirm('사진 위에 만든 대상지 표시를 모두 지울까요?')) return;
    state.library?.markDirty();
    state.customOverlays = [];
    state.selectedOverlayId = '';
    state.overlayDrawMode = false;
    const doc = el.previewFrame.contentDocument;
    doc?.querySelectorAll('.proposal-custom-zone').forEach((node) => node.remove());
    updateOverlayControls(doc);
    setStatus('사진 위 대상지 표시를 모두 지웠습니다.');
  }

  function normalizeExistingZero() {
    if (document.getElementById('existingInstallationKnown').checked && el.existingKw.value.trim() !== '' && Number(el.existingKw.value) === 0) {
      el.hasExistingInstallation.checked = false;
      document.getElementById('existingInstallationStatus').value = 'none';
      el.existingKw.required = false;
      el.existingKw.disabled = true;
    }
  }

  function syncExistingInstallationUi({ restoreValue = false } = {}) {
    const noMandatory = document.getElementById('noMandatory').checked;
    document.getElementById('voluntaryCapacityField').hidden = !noMandatory;
    document.getElementById('mandatoryKnown').disabled = noMandatory;
    const known = document.getElementById('existingInstallationKnown').checked;
    el.hasExistingInstallation.disabled = !known;
    if (!known) el.hasExistingInstallation.checked = false;
    document.getElementById('mandatoryKw').disabled = noMandatory || !document.getElementById('mandatoryKnown').checked;
    const hasExisting = Boolean(el.hasExistingInstallation.checked);
    const currentValue = Number(el.existingKw.value);
    if (!hasExisting) {
      if (Number.isFinite(currentValue) && currentValue > 0) state.lastExistingKw = currentValue;
      el.existingKw.value = known ? '0' : '';
      el.existingKw.disabled = true;
      el.existingKw.required = false;
    } else {
      el.existingKw.disabled = false;
      el.existingKw.required = true;
      if (restoreValue && (!(currentValue > 0))) el.existingKw.value = state.lastExistingKw > 0 ? String(state.lastExistingKw) : '';
    }
    document.getElementById('existingInstallationStatus').value = !known ? 'unknown' : hasExisting ? 'installed' : 'none';
  }

  function renderPreview({ force = false } = {}) {
    if (!state.templateHtml) return false;
    if (state.manualDirty && force) {
      const overwrite = window.confirm('미리보기에서 직접 수정한 문구가 있습니다. 입력값 기준으로 18쪽을 다시 만들까요?');
      if (!overwrite) return false;
      state.loadedCopyEdits = [];
      state.copyRestoreMismatch = false;
    }
    if (!el.form.reportValidity()) return false;
    try {
      const model = readModel();
      validateModel(model);
      const html = buildPreviewDocument(model);
      state.previewFields = collectFields();
      saveDraft();
      state.manualDirty = state.loadedCopyEdits.length > 0;
      setStatus('18쪽 미리보기를 다시 만들고 있습니다.');
      state.resolvePreviewReady?.();
      state.previewReady = new Promise((resolve) => {
        state.resolvePreviewReady = resolve;
        el.previewFrame.onload = () => {
          const doc = el.previewFrame.contentDocument;
          const slideCount = doc?.querySelectorAll('.slide').length || 0;
          el.pageCount.textContent = `${slideCount}쪽`;
          doc?.addEventListener('input', (event) => {
            if (!event.target?.closest?.('[data-proposal-editable="true"]')) return;
            state.manualDirty = true;
            state.library?.markDirty();
            setStatus('직접 고친 문구가 있습니다. 입력값을 다시 반영하면 이 수정은 사라집니다.', true);
          });
          doc?.addEventListener('paste', (event) => {
            const target = event.target?.closest?.('[data-proposal-editable="true"]');
            if (!target) return;
            event.preventDefault();
            const selection = doc.getSelection();
            if (!selection?.rangeCount || !target.contains(selection.anchorNode)) return;
            const range = selection.getRangeAt(0);
            if (!target.contains(range.endContainer)) return;
            const text = doc.createTextNode(event.clipboardData?.getData('text/plain') || '');
            range.deleteContents(); range.insertNode(text); range.setStartAfter(text); range.collapse(true);
            selection.removeAllRanges(); selection.addRange(range);
            target.style.whiteSpace = 'pre-line';
            state.manualDirty = true; state.library?.markDirty();
          });
          bindOverlayEditor(doc);
          applyEditMode();
          resolve();
        };
        el.previewFrame.srcdoc = html;
      });
      return true;
    } catch (error) {
      console.error(`[proposal-builder ${VERSION}] render failed`, error);
      setStatus(error?.message || '제안서를 만들지 못했습니다. 입력값을 확인해 주세요.', true);
      return false;
    }
  }

  function scheduleRender() {
    window.clearTimeout(state.renderTimer);
    state.renderTimer = 0;
    if (state.editMode || state.manualDirty) {
      setStatus('입력값이 바뀌었습니다. 직접 고친 문구를 유지하려면 먼저 파일로 저장하고, 새로 반영하려면 위 버튼을 누르세요.', true);
      return;
    }
    state.renderTimer = window.setTimeout(() => {
      state.renderTimer = 0;
      renderPreview();
    }, 280);
  }

  function saveDraft() {
    const draft = {};
    DRAFT_FIELDS.forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      draft[id] = input.type === 'checkbox' ? input.checked : input.value;
    });
    try {
      localStorage.setItem(state.draftKey, JSON.stringify({ ...draft, useSamplePhoto: state.useSamplePhoto }));
    } catch (error) {
      console.warn(`[proposal-builder ${VERSION}] draft save skipped`, error);
    }
  }

  function collectFields() {
    return Object.fromEntries(DRAFT_FIELDS.map((id) => {
      const input = document.getElementById(id);
      return [id, input.type === 'checkbox' ? input.checked : input.value];
    }));
  }

  async function refreshCoopStats() {
    const button = document.getElementById('refreshCoopStatsButton');
    const status = document.getElementById('coopStatsStatus');
    if (state.statsLoading) return;
    state.statsLoading = true; button.disabled = true;
    const epoch = state.documentEpoch || 0;
    const before = JSON.stringify(collectFields());
    const manualAtStart = state.manualDirty, editAtStart = state.editMode;
    status.textContent = '홈페이지의 최신 조합 현황을 불러오고 있습니다…';
    try {
      const client = getClient();
      const timeline = await withTimeout(client.rpc('get_public_village_timeline'), 'COOP_STATS');
      const months = Array.isArray(timeline.data?.months) ? timeline.data.months.filter(month => /^\d{4}-\d{2}$/.test(month.key)).sort((a,b) => a.key.localeCompare(b.key)) : [];
      let stats = !timeline.error && months.length ? months[months.length - 1] : null;
      let asOf = stats?.cutoff_date || '';
      if (!stats) {
        const fallback = await withTimeout(client.rpc('get_public_stats'), 'COOP_STATS');
        if (fallback.error) throw fallback.error;
        stats = fallback.data;
        asOf = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
      }
      const valid = ['count','ind_count','grp_count','amount'].every(key => stats?.[key] !== null && stats?.[key] !== undefined && Number.isSafeInteger(Number(stats[key])) && Number(stats[key]) >= 0);
      if (!valid || Number(stats.count) !== Number(stats.ind_count) + Number(stats.grp_count)) throw new Error('INVALID_PUBLIC_STATS');
      if (epoch !== (state.documentEpoch || 0) || before !== JSON.stringify(collectFields()) || state.manualDirty !== manualAtStart || state.editMode !== editAtStart) {
        status.textContent = '불러오는 동안 제안서가 변경되어 최신 수치를 덮어쓰지 않았습니다. 다시 불러와 주세요.';
        return;
      }
      const imported = { memberTotal: Number(stats.count), individualMembers: Number(stats.ind_count), organizationMembers: Number(stats.grp_count), shareCapitalManwon: Number(stats.amount) / 10000, statsAsOf: /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : '' };
      // Update only the statistics on page 9; keep manually edited copy elsewhere.
      if (state.manualDirty || state.editMode) window.ProposalSections.renderStats(el.previewFrame.contentDocument, imported);
      document.getElementById('memberTotal').value = stats.count;
      document.getElementById('individualMembers').value = stats.ind_count;
      document.getElementById('organizationMembers').value = stats.grp_count;
      document.getElementById('shareCapitalManwon').value = Number(stats.amount) / 10000;
      document.getElementById('statsAsOf').value = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : '';
      state.library?.markDirty(); saveDraft();
      if (state.manualDirty || state.editMode) {
        const fields = collectFields();
        for (const key of Object.keys(imported)) if (state.previewFields) state.previewFields[key] = fields[key];
      } else renderPreview();
      status.textContent = `${asOf} 기준 · 정조합원 ${Number(stats.count).toLocaleString('ko-KR')}명 · 출자금 ${Number(stats.amount).toLocaleString('ko-KR')}원. 보관하려면 제안서를 저장해 주세요.`;
    } catch (error) {
      status.textContent = '최신 현황을 불러오지 못했습니다. 기존 입력값은 유지했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';
      console.warn('[proposal-builder] public stats unavailable', String(error?.code || 'REQUEST_FAILED'));
    } finally { state.statsLoading = false; button.disabled = false; }
  }

  function setFields(fields) {
    fields = { visitDirector: '', visitDirectorPhone: '', statsAsOf: '', ...fields };
    DRAFT_FIELDS.forEach((id) => {
      if (!(id in fields)) return;
      const input = document.getElementById(id);
      if (input.type === 'checkbox') input.checked = fields[id] === true;
      else input.value = String(fields[id] ?? '').slice(0, input.maxLength > 0 ? input.maxLength : 1000);
    });
    normalizeExistingZero();
    syncExistingInstallationUi();
    invalidateDirectorContact('보관한 연락처를 유지합니다. 최신 번호가 필요하면 다시 불러오기를 눌러 주세요.');
  }

  function invalidateDirectorContact(message = '') {
    state.directorPhoneRevision += 1;
    state.directorContactRequest = null;
    document.getElementById('refreshDirectorPhoneButton').disabled = !textValue('visitDirector');
    document.getElementById('directorPhoneStatus').textContent = message;
  }

  function syncDirectorContactPreview() {
    if (state.editMode || state.manualDirty) {
      if (!el.previewFrame.contentDocument?.querySelector('.contact')) {
        scheduleRender();
        return;
      }
      const model = readModel();
      // Only this contact changes. Do not acknowledge unrelated pending form edits.
      const displayed = state.previewFields || {};
      window.ProposalSections.renderContacts(el.previewFrame.contentDocument, {
        ...model, chairPhone: displayed.chairPhone ?? model.chairPhone, officePhone: displayed.officePhone ?? model.officePhone
      });
      if (state.previewFields) {
        state.previewFields.visitDirector = model.visitDirector;
        state.previewFields.visitDirectorPhone = model.visitDirectorPhone;
      }
    } else scheduleRender();
  }

  function refreshDirectorPhone() {
    const button = document.getElementById('refreshDirectorPhoneButton');
    const status = document.getElementById('directorPhoneStatus');
    const name = textValue('visitDirector'), coopId = state.coopId;
    if (!name) { invalidateDirectorContact('동행 이사를 선택해 주세요.'); return Promise.resolve(); }
    if (!coopId) { status.textContent = 'ERP 로그인 확인 후 연락처를 불러올 수 있습니다. 직접 입력한 번호는 유지합니다.'; return Promise.resolve(); }
    const epoch = state.documentEpoch || 0, revision = state.directorPhoneRevision;
    const previous = state.directorContactRequest;
    if (previous && previous.name === name && previous.coopId === coopId && previous.epoch === epoch && previous.revision === revision) return previous.promise;
    const phoneInput = document.getElementById('visitDirectorPhone');
    const before = phoneInput.value;
    const request = { name, coopId, epoch, revision, promise: null };
    state.directorContactRequest = request;
    const current = () => state.directorContactRequest === request && state.coopId === coopId && (state.documentEpoch || 0) === epoch && state.directorPhoneRevision === revision && textValue('visitDirector') === name && phoneInput.value === before;
    button.disabled = true; status.textContent = '선택한 이사의 등록 연락처를 불러오고 있습니다…';
    request.promise = (async () => {
      try {
        const client = getClient();
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
        const officials = await withTimeout(client.from('coop_officials').select('member_id')
          .eq('coop_id', coopId).eq('category', 'executive').eq('role', '이사').eq('status', 'active').eq('name', name)
          .lte('term_start_date', today).gte('term_end_date', today)
          .or(`real_end_date.is.null,real_end_date.gte.${today}`).limit(2), 'DIRECTOR_IDENTITY');
        if (!current()) return;
        if (officials.error) throw new Error('CONTACT_UNAVAILABLE');
        const rows = Array.isArray(officials.data) ? officials.data : [];
        if (rows.length !== 1 || !rows[0].member_id) throw new Error(rows.length > 1 ? 'CONTACT_AMBIGUOUS' : 'CONTACT_NOT_FOUND');
        const member = await withTimeout(client.from('coop_members').select('phone')
          .eq('coop_id', coopId).eq('member_id', rows[0].member_id).limit(2), 'DIRECTOR_PHONE');
        if (!current()) return;
        if (member.error) throw new Error('CONTACT_UNAVAILABLE');
        const matches = Array.isArray(member.data) ? member.data : [];
        const phone = matches.length === 1 && typeof matches[0].phone === 'string' ? matches[0].phone.trim() : '';
        if (!phone || phone.length > 30 || !/^[0-9+().\s-]+$/.test(phone)) throw new Error('CONTACT_NOT_FOUND');
        phoneInput.value = phone;
        state.library?.markDirty(); saveDraft(); syncDirectorContactPreview();
        status.textContent = '등록된 연락처를 입력했습니다. 제안서에 사용할 번호인지 확인하고 필요하면 직접 수정해 주세요.';
      } catch (error) {
        if (!current()) return;
        status.textContent = error?.message === 'CONTACT_AMBIGUOUS'
          ? '같은 이름의 현재 이사가 여러 건이어서 번호를 자동 선택하지 않았습니다. 확인 후 직접 입력해 주세요.'
          : '등록 번호가 없거나 조회할 수 없습니다. 기존 입력값은 유지했습니다. 직접 입력하거나 나중에 다시 불러와 주세요.';
        // Do not log phone numbers, member records, or server error payloads.
      } finally {
        if (state.directorContactRequest === request) {
          state.directorContactRequest = null;
          button.disabled = !textValue('visitDirector');
        }
      }
    })();
    return request.promise;
  }

  async function captureSnapshot() {
    const doc = await prepareOutput();
    const copyEdits = [...doc.querySelectorAll('[data-copy-id]')]
      .filter((node) => node.textContent !== node.dataset.copyBase)
      .map((node) => ({ index: Number(node.dataset.copyId), baseText: node.dataset.copyBase, text: node.innerText }));
    if (copyEdits.length > 400 || copyEdits.some((edit) => edit.text.length > 20000)) throw new Error('직접 수정한 문구가 저장 가능한 길이를 넘었습니다. 문장을 나누거나 길이를 줄여 주세요.');
    return { format: 1, builderVersion: VERSION, fields: collectFields(),
      photo: state.siteImageDataUrl, photoName: state.photoName,
      useSamplePhoto: state.useSamplePhoto, overlays: structuredClone(state.customOverlays), copyEdits };
  }

  async function restoreSnapshot(snapshot) {
    if (snapshot?.format !== 1 || !snapshot.fields || typeof snapshot.fields !== 'object') throw new Error('지원하지 않는 제안서 저장 형식입니다.');
    const photo = typeof snapshot.photo === 'string' ? snapshot.photo : '';
    if (photo && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 17 * 1024 * 1024)) throw new Error('저장된 사진 형식을 확인할 수 없습니다.');
    if (photo) { const image = new Image(); image.src = photo; await image.decode(); }
    const overlays = (Array.isArray(snapshot.overlays) ? snapshot.overlays : []).slice(0, 20).map((overlay, index) => ({
      id: `restored-${index + 1}`, x: clamp(Number(overlay.x) || 0, 0, 100), y: clamp(Number(overlay.y) || 0, 0, 100),
      width: clamp(Number(overlay.width) || 10, 1, 100), height: clamp(Number(overlay.height) || 10, 1, 100), angle: normalizeAngle(overlay.angle)
    }));
    const copyEdits = (Array.isArray(snapshot.copyEdits) ? snapshot.copyEdits : []).filter((edit) => Number.isInteger(edit.index) && edit.index >= 0 && typeof edit.baseText === 'string' && typeof edit.text === 'string' && edit.text.length <= 20000).slice(0, 400);
    state.documentEpoch = (state.documentEpoch || 0) + 1;
    window.clearTimeout(state.renderTimer); state.renderTimer = 0;
    state.imageSequence += 1;
    state.imageLoadError = null; state.imageLoadPromise = Promise.resolve();
    state.siteImageDataUrl = photo; state.photoName = String(snapshot.photoName || '').slice(0, 250);
    state.useSamplePhoto = snapshot.useSamplePhoto === true;
    state.customOverlays = overlays; state.selectedOverlayId = ''; state.overlayDrawMode = false;
    state.loadedCopyEdits = copyEdits; state.manualDirty = false; state.editMode = false;
    state.copyRestoreMismatch = false;
    state.lastExistingKw = Number(snapshot.fields.existingKw) || 0;
    setFields(snapshot.fields);
    el.siteImage.value = '';
    el.siteImageName.textContent = photo ? state.photoName || '저장한 대상지 사진' : state.useSamplePhoto ? '남사읍 예시 위성사진 사용 중' : '대상지 사진 미등록';
    renderPreview();
    await withTimeout(waitForPreview(), 'PREVIEW');
    updateOverlayControls();
    const restoredCount = [...el.previewFrame.contentDocument.querySelectorAll('[data-copy-id]')].filter((node) => node.textContent !== node.dataset.copyBase).length;
    if (restoredCount !== copyEdits.length) {
      state.copyRestoreMismatch = true;
      throw new Error('서식이 달라 일부 수정 문구를 적용하지 못했습니다. 보관함 원본은 유지했습니다. 덮어쓰지 말고 관리자에게 알려 주세요.');
    }
  }

  async function startSite(preset) {
    const fields = { ...collectFields(), ...(preset?.fields || window.ProposalPresets.blank()), visitDirector: '', visitDirectorPhone: '' };
    if (!fields.facilityName) fields.facilityName = '새 대상지';
    await restoreSnapshot({ format: 1, fields, photo: '', overlays: [], copyEdits: [], useSamplePhoto: false });
    await refreshCoopStats();
    document.getElementById('facilityName').focus();
  }

  function restoreDraft() {
    try {
      const legacy = /^(www\.)?yonginsolar\.kr$/.test(location.hostname) ? localStorage.getItem(DRAFT_KEY) : null;
      const draft = JSON.parse(localStorage.getItem(state.draftKey) || legacy || 'null');
      if (!draft || typeof draft !== 'object') return;
      state.useSamplePhoto = draft.useSamplePhoto ?? (draft.facilityName === '남사읍행정복지센터');
      setFields(draft);
      return true;
    } catch (error) {
      console.warn(`[proposal-builder ${VERSION}] draft restore skipped`, error);
    }
  }

  function sanitizeFilename(value) {
    return String(value || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 120) || 'proposal';
  }

  function pdfDocumentTitle(facilityName) {
    const facility = String(facilityName || '').normalize('NFC')
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').trim() || '대상 시설';
    // Keep the requested spaces; the PDF printer adds the .pdf extension.
    return `태양광 발전사업제안서_${facility}_용인모두의햇빛협동조합`;
  }

  function dataUrlFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('FILE_READ_FAILED'));
      reader.readAsDataURL(blob);
    });
  }

  async function inlineImages(doc) {
    const images = [...doc.querySelectorAll('img')];
    await Promise.all(images.map(async (image) => {
      const source = image.getAttribute('src') || '';
      if (!source || source.startsWith('data:')) return;
      try {
        const absoluteUrl = new URL(source, window.location.href).href;
        const response = await fetch(absoluteUrl, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`IMAGE_HTTP_${response.status}`);
        image.setAttribute('src', await dataUrlFromBlob(await response.blob()));
      } catch (error) {
        throw new Error('사진을 HTML 파일 안에 포함하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 저장해 주세요.');
      }
    }));
  }

  async function buildDownloadHtml(sourceDoc) {
    if (!sourceDoc) throw new Error('미리보기가 아직 준비되지 않았습니다.');
    const doc = sourceDoc.cloneNode(true);
    doc.getElementById('proposalBuilderPreviewStyle')?.remove();
    doc.querySelectorAll('.proposal-zone-handle, .proposal-zone-rotate-handle').forEach((node) => node.remove());
    doc.querySelectorAll('.proposal-custom-zone').forEach((node) => {
      node.classList.remove('is-selected');
      node.removeAttribute('data-overlay-id');
    });
    doc.querySelectorAll('.proposal-zone-draw-mode').forEach((node) => node.classList.remove('proposal-zone-draw-mode'));
    doc.querySelectorAll('script').forEach((node) => node.remove());
    doc.querySelectorAll('*').forEach((node) => {
      node.removeAttribute('contenteditable');
      node.removeAttribute('spellcheck');
      node.removeAttribute('data-proposal-editable');
      node.removeAttribute('data-copy-id');
      node.removeAttribute('data-copy-base');
      [...node.attributes].forEach((attribute) => {
        if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      });
    });
    const controlBar = doc.querySelector('.control-bar');
    if (controlBar) controlBar.innerHTML = '<button type="button" onclick="window.print()">인쇄 · PDF 저장</button>';
    await inlineImages(doc);
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function downloadHtml() {
    if (state.exportInFlight) return;
    setExportBusy(true);
    setStatus('사진까지 포함한 HTML 파일을 만들고 있습니다.');
    try {
      const model = readModel();
      const html = await buildDownloadHtml(await prepareOutput());
      const datePart = model.proposalDate.replaceAll('-', '');
      const filename = `${sanitizeFilename(`${datePart}_${model.facilityName}_주차장_햇빛발전소_제안서_${model.proposalVersion}`)}.html`;
      downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), filename);
      setStatus('HTML 파일을 저장했습니다. 파일만 옮겨도 사진을 포함한 제안서가 열립니다.');
    } catch (error) {
      console.error(`[proposal-builder ${VERSION}] download failed`, error);
      setStatus(error?.message || 'HTML 파일을 만들지 못했습니다.', true);
    } finally {
      setExportBusy(false);
    }
  }

  function setExportBusy(busy) {
    state.exportInFlight = busy;
    [el.printButton, el.printTopButton, el.downloadButton].forEach((button) => { button.disabled = busy; });
  }

  async function waitForPreview() {
    let pending;
    do {
      pending = state.previewReady;
      await pending;
    } while (pending !== state.previewReady);
  }

  async function prepareOutput() {
    state.library?.assertRestored();
    if (state.copyRestoreMismatch) throw new Error('저장된 수정 문구를 모두 복원하지 못했습니다. 원본 보호를 위해 저장·출력을 중지했습니다.');
    await state.imageLoadPromise;
    const contactRequest = state.directorContactRequest;
    if (contactRequest) await contactRequest.promise;
    if (state.directorContactRequest) throw new Error('이사 연락처를 불러오는 중입니다. 입력이 끝난 뒤 다시 저장해 주세요.');
    if (state.imageLoadError) throw state.imageLoadError;
    if (!el.form.reportValidity()) throw new Error('입력값을 확인한 뒤 다시 저장해 주세요.');
    validateModel(readModel());
    const changedFields = JSON.stringify(collectFields()) !== JSON.stringify(state.previewFields);
    if (changedFields && (state.editMode || state.manualDirty)) throw new Error('입력값이 미리보기와 다릅니다. 「입력값을 18쪽에 반영」 후 문구를 확인하고 저장해 주세요.');
    if (changedFields && !state.renderTimer) renderPreview();
    if (state.renderTimer) {
      window.clearTimeout(state.renderTimer);
      state.renderTimer = 0;
      if (!state.editMode && !state.manualDirty) renderPreview();
    }
    await withTimeout(waitForPreview(), 'PREVIEW');
    const doc = el.previewFrame.contentDocument;
    if (!doc?.querySelector('.slide')) throw new Error('미리보기가 아직 준비되지 않았습니다.');
    await withTimeout(Promise.all([...doc.images].map(async (image) => {
      try {
        await image.decode();
      } catch {
        throw new Error('제안서 사진을 불러오지 못했습니다. 사진과 인터넷 연결을 확인한 뒤 다시 출력해 주세요.');
      }
    })), 'IMAGES');
    await withTimeout(doc.fonts.ready, 'FONTS');
    return doc;
  }

  async function printProposal() {
    if (state.exportInFlight) return;
    setExportBusy(true);
    setStatus('사진과 제안서 준비가 끝나면 인쇄 창을 엽니다.');
    try {
      const doc = await prepareOutput();
      const title = pdfDocumentTitle(state.previewFields.facilityName);
      // PDF printers may use either the top-level page title or the printed frame title.
      document.title = title;
      doc.title = title;
      el.previewFrame.contentWindow.focus();
      el.previewFrame.contentWindow.print();
    } catch (error) {
      setStatus(error?.code === 'PROPOSAL_BUILDER_REQUEST_TIMEOUT'
        ? '사진과 제안서 준비에 시간이 걸리고 있습니다. 잠시 뒤 다시 출력해 주세요.'
        : error?.message || '인쇄를 준비하지 못했습니다.', true);
    } finally {
      setExportBusy(false);
    }
  }

  async function handleSiteImageChange() {
    const sequence = ++state.imageSequence;
    const file = el.siteImage.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      el.siteImage.value = '';
      throw new Error('PNG, JPG 또는 WebP 사진만 사용할 수 있습니다.');
    }
    if (file.size > 12 * 1024 * 1024) {
      el.siteImage.value = '';
      throw new Error('사진은 12MB 이하로 선택해 주세요.');
    }
    const dataUrl = await dataUrlFromBlob(file);
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    if (sequence !== state.imageSequence) return;
    state.siteImageDataUrl = dataUrl;
    state.photoName = file.name;
    state.useSamplePhoto = false;
    state.library?.markDirty();
    state.customOverlays = [];
    state.selectedOverlayId = '';
    state.overlayDrawMode = false;
    el.siteImageName.textContent = file.name;
    el.keepNamsaOverlay.checked = false;
    if (state.previewFields) state.previewFields.keepNamsaOverlay = false;
    saveDraft();
    // Replace only the photo so manual copy edits and invalid/unfinished fields cannot block it.
    await withTimeout(waitForPreview(), 'PREVIEW');
    if (sequence !== state.imageSequence) return;
    const doc = el.previewFrame.contentDocument;
    const siteImage = doc?.querySelector('.photo-shell img');
    if (!siteImage) throw new Error('대상지 사진 영역이 아직 준비되지 않았습니다.');
    siteImage.src = dataUrl;
    siteImage.alt = `${textValue('facilityName')} 대상지 사진`;
    doc.querySelectorAll('.proposal-custom-zone').forEach((zone) => zone.remove());
    doc.querySelectorAll('.photo-caption').forEach((node) => node.remove());
    updateOverlayControls(doc);
    setStatus('대상지 사진을 반영했습니다. PDF와 HTML에도 이 사진이 들어갑니다.', state.manualDirty);
  }

  async function resetSample() {
    if (!window.confirm('입력값과 직접 수정한 문구를 지우고 남사읍 예시로 돌아갈까요?')) return;
    await state.library.resetLocally(() => {
    el.form.reset();
    state.documentEpoch = (state.documentEpoch || 0) + 1;
    state.useSamplePhoto = true;
    invalidateDirectorContact('동행 이사를 선택하면 등록된 연락처를 불러옵니다.');
    state.photoName = '';
    state.loadedCopyEdits = [];
    state.copyRestoreMismatch = false;
    localStorage.removeItem(state.draftKey);
    state.siteImageDataUrl = '';
    state.imageSequence += 1;
    state.imageLoadError = null;
    state.customOverlays = [];
    state.selectedOverlayId = '';
    state.overlayDrawMode = false;
    state.editMode = false;
    state.manualDirty = false;
    el.siteImage.value = '';
    el.siteImageName.textContent = '남사읍 예시 위성사진 사용 중';
    syncExistingInstallationUi();
    updateOverlayControls();
    renderPreview();
    });
  }

  function bindEvents() {
    if (state.eventsBound) return;
    state.eventsBound = true;
    el.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void state.library?.applyLocally(() => renderPreview({ force: true }));
    });
    el.form.addEventListener('input', (event) => {
      if (event.target === el.siteImage) return;
      if (event.target === el.overlayAngle) return;
      if (event.target.closest('[data-library-controls]')) return;
      state.library?.markDirty();
      if (event.target.id === 'visitDirector') {
        invalidateDirectorContact();
        document.getElementById('visitDirectorPhone').value = '';
        syncDirectorContactPreview();
        void refreshDirectorPhone();
      }
      if (event.target.id === 'visitDirectorPhone') {
        invalidateDirectorContact('직접 입력한 번호를 사용합니다. 등록 번호로 바꾸려면 다시 불러오기를 눌러 주세요.');
        syncDirectorContactPreview();
      }
      if (event.target.id === 'existingInstallationStatus') {
        const status = event.target.value;
        document.getElementById('existingInstallationKnown').checked = status !== 'unknown';
        el.hasExistingInstallation.checked = status === 'installed';
        syncExistingInstallationUi({ restoreValue: status === 'installed' });
      }
      if (event.target === el.existingKw) normalizeExistingZero();
      if (['memberTotal','shareCapitalManwon','individualMembers','organizationMembers'].includes(event.target.id)) document.getElementById('statsAsOf').value = '';
      if ([el.hasExistingInstallation, document.getElementById('existingInstallationKnown'), document.getElementById('mandatoryKnown'), document.getElementById('noMandatory')].includes(event.target)) syncExistingInstallationUi({ restoreValue: true });
      if (event.target === el.existingKw && numberValue('existingKw') > 0) state.lastExistingKw = numberValue('existingKw');
      readModel();
      saveDraft();
      if (!['visitDirector', 'visitDirectorPhone'].includes(event.target.id)) scheduleRender();
    });
    el.siteImage.addEventListener('change', () => {
      state.imageLoadError = null;
      const sequence = state.imageSequence + 1;
      state.imageLoadPromise = handleSiteImageChange().catch((error) => {
        if (sequence !== state.imageSequence) return;
        state.imageLoadError = new Error(error?.message?.includes('사진') ? error.message : '사진을 읽지 못했습니다. 다른 파일을 선택해 주세요.');
        console.error(`[proposal-builder ${VERSION}] image load failed`, error);
        setStatus(state.imageLoadError.message, true);
      });
    });
    el.addOverlayButton.addEventListener('click', toggleOverlayDrawMode);
    el.deleteOverlayButton.addEventListener('click', deleteSelectedOverlay);
    el.clearOverlayButton.addEventListener('click', clearOverlays);
    el.overlayAngle.addEventListener('input', updateSelectedOverlayAngle);
    el.overlayAngle.addEventListener('change', () => updateSelectedOverlayAngle({ commit: true }));
    el.resetOverlayAngleButton.addEventListener('click', resetSelectedOverlayAngle);
    el.editButton.addEventListener('click', () => {
      state.editMode = !state.editMode;
      applyEditMode();
    });
    el.printButton.addEventListener('click', printProposal);
    el.printTopButton.addEventListener('click', printProposal);
    el.downloadButton.addEventListener('click', downloadHtml);
    el.resetButton.addEventListener('click', resetSample);
    document.getElementById('refreshCoopStatsButton').addEventListener('click', () => refreshCoopStats());
    document.getElementById('refreshDirectorPhoneButton').addEventListener('click', () => { void refreshDirectorPhone(); });
  }

  async function boot() {
    if (state.bootInFlight) return;
    state.bootInFlight = true;
    const attempt = ++state.bootAttempt;
    resetBootUi();
    try {
      if (!window.ErpRuntimeGuard || typeof window.ErpRuntimeGuard.requireUser !== 'function') {
        const error = new Error('ERP_RUNTIME_GUARD_UNAVAILABLE');
        error.code = 'ERP_RUNTIME_GUARD_UNAVAILABLE';
        throw error;
      }
      if (!window.ProposalPresets || !window.ProposalLibrary || !window.ProposalSections || !window.ProposalDrafts) throw new Error('PROPOSAL_LIBRARY_SCRIPT_UNAVAILABLE');
      const client = getClient();
      el.bootMessage.textContent = 'ERP 로그인 상태를 확인하고 있습니다.';
      const userGate = await withTimeout(window.ErpRuntimeGuard.requireUser(client, {
        alertFn: showBootError,
        redirectUrl: 'index.html'
      }), 'LOGIN_CHECK');
      if (attempt !== state.bootAttempt || !userGate.ok) return;

      el.bootMessage.textContent = '조합과 사용 가능한 기능을 확인하고 있습니다.';
      const runtimeGate = await withTimeout(window.ErpRuntimeGuard.enforce(client, {
        moduleKey: 'site_admin',
        moduleLabel: '제안서 만들기',
        alertFn: showBootError,
        redirectUrl: 'index.html'
      }), 'RUNTIME_CHECK');
      if (attempt !== state.bootAttempt || !runtimeGate.ok) return;

      el.bootMessage.textContent = '제안서를 만들 수 있는 관리자 권한인지 확인하고 있습니다.';
      const permission = await withTimeout(loadSiteAdminPermission(userGate.user), 'PERMISSION_CHECK');
      if (attempt !== state.bootAttempt) return;
      if (!permission.hasSiteAdmin && !(permission.isLegacyEmpty && isAdminFallback(userGate.user))) {
        showBootError('홈페이지 관리 권한이 있는 ERP 관리자만 제안서를 만들 수 있습니다.');
        return;
      }

      state.coopId = String(userGate.user.coop_id || '').trim();

      el.bootMessage.textContent = '18쪽 제안서 원본을 불러오고 있습니다.';
      const response = await withTimeout(fetch(TEMPLATE_URL, { credentials: 'same-origin', cache: 'no-store' }), 'TEMPLATE');
      if (!response.ok) throw new Error(`TEMPLATE_HTTP_${response.status}`);
      state.templateHtml = await response.text();
      if (!state.templateHtml.includes('class="slide')) throw new Error('TEMPLATE_INVALID');
      state.draftKey = `${DRAFT_KEY}.${userGate.user.coop_id}`;
      const hadDraft = restoreDraft();
      syncExistingInstallationUi();
      updateOverlayControls();
      bindEvents();
      el.bootSpinner.hidden = true;
      el.bootActions.hidden = true;
      el.bootPanel.hidden = true;
      el.appShell.classList.add('ready');
      renderPreview();
      state.library = window.ProposalLibrary.init({ client, coopId: userGate.user.coop_id,
        userId: userGate.authUser?.id || userGate.user.emp_id,
        snapshot: captureSnapshot, restore: restoreSnapshot, newSite: startSite,
        isDirty: () => state.manualDirty || Boolean(state.siteImageDataUrl), fields: DRAFT_FIELDS });
      await state.library.ready;
      if (!hadDraft && !state.library.hadSavedSession && !state.library.hadLocalDraft) void refreshCoopStats();
    } catch (error) {
      console.error(`[proposal-builder ${VERSION}] boot failed`, error);
      if (error?.code === 'PROPOSAL_BUILDER_REQUEST_TIMEOUT') {
        showBootError('권한 또는 제안서 원본 확인이 12초 안에 끝나지 않았습니다.\n인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
      } else if (error?.code === 'SUPABASE_LIBRARY_UNAVAILABLE') {
        showBootError('로그인 확인 프로그램을 불러오지 못했습니다.\n콘텐츠 차단 기능이나 인터넷 연결을 확인해 주세요.');
      } else if (error?.code === 'ERP_RUNTIME_GUARD_UNAVAILABLE') {
        showBootError('ERP 권한 확인 프로그램을 불러오지 못했습니다.\n페이지를 새로고침해 주세요.');
      } else if (/^TEMPLATE_/.test(String(error?.message || ''))) {
        showBootError('제안서 원본을 불러오지 못했습니다.\n잠시 뒤 다시 확인해 주세요.');
      } else {
        showBootError('로그인 또는 관리자 권한을 확인하지 못했습니다. ERP 메인에서 다시 열어 주세요.');
      }
    } finally {
      if (attempt === state.bootAttempt) state.bootInFlight = false;
    }
  }

  el.bootRetry.addEventListener('click', boot);
  boot();
})();
