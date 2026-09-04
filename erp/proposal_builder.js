/* Version: v1.2.0 | 2026-09-04 | Editable site notes, target-zone rotation and resident participation copy. */
(() => {
  'use strict';

  const VERSION = '1.2.0';
  const REQUEST_TIMEOUT_MS = 12000;
  const TEMPLATE_URL = 'proposal_template_parking.html?v=1.1.0';
  const DRAFT_KEY = 'yonginsolar.erp.proposal-builder.v1';
  const SUPABASE_URL = 'https://ifdqlwxgqgsvnawmhlfc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h';
  const DRAFT_FIELDS = [
    'proposalDate', 'proposalVersion', 'facilityName', 'regionFull', 'regionShort', 'siteAddress',
    'siteOverlayLabel', 'siteFeatureLines', 'siteCheckLines', 'mandatoryKw', 'hasExistingInstallation', 'existingKw', 'expandedMinKw', 'expandedKw', 'unitCostManwon', 'salePriceWon',
    'sunHours', 'operationPct', 'returnPct', 'constructionMonth', 'completionMinMonth',
    'completionMaxMonth', 'memberTotal', 'shareCapitalManwon', 'individualMembers',
    'organizationMembers', 'chairPhone', 'officePhone', 'keepNamsaOverlay'
  ];

  const state = {
    client: null,
    templateHtml: '',
    siteImageDataUrl: '',
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
          'x-erp-host': window.CoopRouteGuard?.getErpRuntimeHost(location) || String(location.hostname || '').trim().toLowerCase()
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
    const mandatoryKw = numberValue('mandatoryKw');
    const hasExistingInstallation = Boolean(el.hasExistingInstallation.checked);
    const existingKw = hasExistingInstallation ? numberValue('existingKw') : 0;
    const remainingKw = Math.max(mandatoryKw - existingKw, 0);
    const model = {
      proposalDate: textValue('proposalDate'),
      proposalVersion: textValue('proposalVersion') || 'v1.0',
      facilityName: textValue('facilityName'),
      regionFull: textValue('regionFull'),
      regionShort: textValue('regionShort'),
      siteAddress: textValue('siteAddress'),
      siteOverlayLabel: textValue('siteOverlayLabel') || '신규 설치 검토 대상지',
      siteFeatureLines: lineValues('siteFeatureLines'),
      siteCheckLines: lineValues('siteCheckLines'),
      mandatoryKw,
      hasExistingInstallation,
      existingKw,
      remainingKw,
      expandedMinKw: numberValue('expandedMinKw'),
      expandedKw: numberValue('expandedKw'),
      unitCostManwon: numberValue('unitCostManwon'),
      salePriceWon: numberValue('salePriceWon'),
      sunHours: numberValue('sunHours'),
      operationPct: numberValue('operationPct'),
      returnPct: numberValue('returnPct'),
      constructionMonth: Math.round(numberValue('constructionMonth')),
      completionMinMonth: Math.round(numberValue('completionMinMonth')),
      completionMaxMonth: Math.round(numberValue('completionMaxMonth')),
      memberTotal: Math.round(numberValue('memberTotal')),
      shareCapitalManwon: Math.round(numberValue('shareCapitalManwon')),
      individualMembers: Math.round(numberValue('individualMembers')),
      organizationMembers: Math.round(numberValue('organizationMembers')),
      chairPhone: textValue('chairPhone'),
      officePhone: textValue('officePhone'),
      keepNamsaOverlay: Boolean(el.keepNamsaOverlay.checked)
    };
    el.remainingKw.value = trimNumber(remainingKw);
    return model;
  }

  function validateModel(model) {
    if (!model.proposalDate || !model.facilityName || !model.regionFull || !model.regionShort || !model.siteAddress) {
      throw new Error('제안일, 대상 시설, 지역명과 주소를 모두 입력해 주세요.');
    }
    if (model.mandatoryKw < 0 || model.existingKw < 0 || model.expandedMinKw <= 0 || model.expandedKw <= 0) {
      throw new Error('설치 용량 값을 확인해 주세요.');
    }
    if (model.hasExistingInstallation && model.existingKw <= 0) {
      throw new Error('기존 설비가 있으면 기존 설치용량을 0보다 크게 입력해 주세요.');
    }
    if (model.expandedMinKw > model.expandedKw) {
      throw new Error('확대안 범위 시작 용량은 수지 비교 확대안 용량보다 클 수 없습니다.');
    }
    if (model.expandedKw < model.remainingKw) {
      throw new Error('수지 비교 확대안 용량은 법정 의무 이행에 필요한 용량보다 작을 수 없습니다.');
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
    const kw = (value) => `${trimNumber(value)}kW`;
    const percent = (value) => `${trimNumber(value)}%`;
    return [
      ['남사읍행정복지센터', model.facilityName],
      ['경기 용인시 처인구 남사읍 내기로 22', model.siteAddress],
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
      ['5,960만원', `${model.shareCapitalManwon.toLocaleString('ko-KR')}만원`],
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
    replaceListByHeading(siteSlide, '현장 특징', model.siteFeatureLines, '현장조사 후 내용을 입력합니다.', replaceText);
    replaceListByHeading(siteSlide, '먼저 확인할 자료', model.siteCheckLines, '현장조사에 필요한 자료를 확인합니다.', replaceText);
  }

  function applyNoExistingInstallationContext(doc, model) {
    if (model.hasExistingInstallation && model.existingKw > 0) return;
    const kw = `${trimNumber(model.mandatoryKw)}kW`;
    const remaining = `${trimNumber(model.remainingKw)}kW`;

    const siteSlide = slideAt(doc, 3);
    siteSlide?.querySelectorAll('.existing-label, .existing-zone').forEach((node) => node.remove());
    removeClosestByText(siteSlide, 'li', /(남측 )?기존 태양광|기존 .*설비의 소유|기존 .*설비/);

    const statusSlide = slideAt(doc, 4);
    const statusTitle = statusSlide?.querySelector('h2');
    if (statusTitle) statusTitle.innerHTML = `법정 최소기준은 ${kw}이며, <strong>최종 설치용량은 현장 검토로 확정</strong>합니다`;
    const formula = [...(statusSlide?.querySelectorAll('div') || [])]
      .find((node) => /grid-template-columns:\s*1fr 64px 1fr 64px 1fr/.test(node.getAttribute('style') || ''));
    if (formula) {
      const parts = [...formula.children];
      parts[1]?.remove();
      parts[2]?.remove();
      formula.style.gridTemplateColumns = '1fr 64px 1fr';
      if (parts[3]) parts[3].textContent = '→';
      const requiredBox = parts[4];
      const requiredLabels = requiredBox?.querySelectorAll('.small') || [];
      const requiredValue = requiredBox?.querySelector('.big-inline');
      if (requiredLabels[0]) requiredLabels[0].textContent = '최종 설계용량';
      if (requiredValue) {
        requiredValue.textContent = '기본설계 후 확정';
        requiredValue.style.fontSize = '30px';
      }
      if (requiredLabels[1]) requiredLabels[1].textContent = '현장·계통·주민편익을 함께 검토';
    }
    const statusCards = statusSlide?.querySelectorAll('.grid-2 > .card') || [];
    const firstCard = statusCards[0];
    const secondCard = statusCards[1];
    if (firstCard?.querySelector('h3')) firstCard.querySelector('h3').textContent = '법정 최소기준';
    const firstLead = firstCard?.querySelector('.lead');
    if (firstLead) firstLead.textContent = `${kw}는 법에서 요구하는 설치 기준입니다.`;
    const firstTexts = firstCard?.querySelectorAll('p') || [];
    if (firstTexts[1]) firstTexts[1].textContent = '현장 여건을 확인해 최소한 의무용량 이상으로 설계합니다.';
    if (secondCard?.querySelector('h3')) secondCard.querySelector('h3').textContent = '주민편익까지 함께 검토';
    const secondText = secondCard?.querySelector('p');
    if (secondText) secondText.textContent = '법정 기준만 맞추는 데서 끝내지 않고 그늘 면수, 차량 동선, 계통 여건과 사업성을 함께 비교해 최종 설계용량을 정합니다.';
    const statusBanner = statusSlide?.querySelector('.banner');
    if (statusBanner) statusBanner.innerHTML = `법정 최소기준과 전면 차양 확대안을 함께 비교해 <span>주민편익과 사업성을 균형 있게 검토</span>해 주시길 제안합니다.`;
    const source = statusSlide?.querySelector('.source');
    if (source) source.textContent = `용량 현황: 전체 의무 ${kw}(제공받은 현황 기준). 신규 설치용량은 현장조사·계통 검토와 기본설계 후 최종 확정합니다.`;

    const comparisonSlide = slideAt(doc, 6);
    const comparisonHeaders = comparisonSlide?.querySelectorAll('.table th') || [];
    if (comparisonHeaders[1]) comparisonHeaders[1].textContent = `의무 이행안 · 신규 ${remaining}`;
    if (comparisonHeaders[2]) comparisonHeaders[2].textContent = `주민복지 확대안 · 신규 약 ${trimNumber(Math.max(model.expandedMinKw, model.remainingKw))}~${trimNumber(model.expandedKw)}kW 내외`;
    [...(comparisonSlide?.querySelectorAll('td') || [])].forEach((cell) => {
      cell.textContent = String(cell.textContent || '').replace(/\s*·\s*기존 설비 인정/g, '');
    });

    const safetySlide = slideAt(doc, 12);
    [...(safetySlide?.querySelectorAll('p') || [])].forEach((paragraph) => {
      if (paragraph.textContent.includes('청사와 기존 설비에 어울리는')) {
        paragraph.textContent = paragraph.textContent.replace('청사와 기존 설비에 어울리는', '청사와 주변 환경에 어울리는');
      }
    });
    removeClosestByText(safetySlide, '.note.warning', /기존 태양광 설비와 신규 설비/);

    const scaleSlide = slideAt(doc, 13);
    const firstScaleCard = scaleSlide?.querySelector('.grid-3 > .card');
    const firstScaleLabel = firstScaleCard?.querySelector('.stat-label');
    if (firstScaleLabel) firstScaleLabel.textContent = '법정 최소기준';
    const firstScaleText = firstScaleCard?.querySelector('p');
    if (firstScaleText) firstScaleText.textContent = '현장조사·계통 검토 전의 최소 검토값';
    removeClosestByText(scaleSlide, 'tbody tr', /기존 .*자료|기존 설비|신·구 설비/);
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
    zone.append(label, handle);
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
      @media print { .proposal-zone-handle { display:none !important; } .proposal-custom-zone { outline:0 !important; } }
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
        .photo-shell.proposal-zone-draw-mode { cursor:crosshair; touch-action:none; outline:5px solid rgba(245,160,0,.75); outline-offset:4px; }
      }
      @media print { [data-proposal-editable="true"] { outline:0 !important; background:transparent !important; } }
    `;
    doc.head.appendChild(previewStyle);
  }

  function buildPreviewDocument(model) {
    const doc = new DOMParser().parseFromString(state.templateHtml, 'text/html');
    doc.querySelectorAll('script').forEach((node) => node.remove());
    doc.title = `${model.facilityName} 주차장 햇빛발전소 제안서`;
    const replaceText = createReplacer(buildReplacementEntries(model));
    replaceDocumentText(doc, replaceText);
    applySiteDetailLists(doc, model, replaceText);

    const siteImage = doc.querySelector('.photo-shell img');
    if (siteImage) {
      siteImage.setAttribute('src', state.siteImageDataUrl || 'proposal_assets/namsa-site-map.png');
      siteImage.setAttribute('alt', `${model.facilityName} 대상지 사진`);
    }
    if (!model.keepNamsaOverlay || state.siteImageDataUrl) {
      doc.querySelectorAll('.zone-label, .zone, .existing-label, .existing-zone').forEach((node) => {
        node.style.display = 'none';
      });
      const caption = doc.querySelector('.photo-caption');
      if (caption) caption.textContent = '업로드한 대상지 사진 · 설치 범위와 경계는 현장조사와 설계로 확정';
    }
    applyNoExistingInstallationContext(doc, model);
    renderCustomOverlays(doc, model);
    appendBuilderStyles(doc);
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
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
    const showSampleTarget = Boolean(el.keepNamsaOverlay.checked && !state.siteImageDataUrl && count === 0);
    const showSampleExisting = Boolean(el.keepNamsaOverlay.checked && !state.siteImageDataUrl && el.hasExistingInstallation.checked);
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
      action = {
        type: handle ? 'resize' : 'move',
        overlay,
        element: zone,
        start: point,
        origin: { x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height }
      };
      event.preventDefault();
      event.stopPropagation();
    });

    doc.addEventListener('pointermove', (event) => {
      if (!action) return;
      const point = pointerPercent(event, shell);
      const { overlay, origin, start } = action;
      if (action.type === 'draw') {
        overlay.x = roundCoordinate(Math.min(start.x, point.x));
        overlay.y = roundCoordinate(Math.min(start.y, point.y));
        overlay.width = roundCoordinate(Math.abs(point.x - start.x));
        overlay.height = roundCoordinate(Math.abs(point.y - start.y));
      } else if (action.type === 'move') {
        overlay.x = roundCoordinate(clamp(origin.x + point.x - start.x, 0, 100 - origin.width));
        overlay.y = roundCoordinate(clamp(origin.y + point.y - start.y, 0, 100 - origin.height));
      } else {
        overlay.width = roundCoordinate(clamp(origin.width + point.x - start.x, 3, 100 - origin.x));
        overlay.height = roundCoordinate(clamp(origin.height + point.y - start.y, 3, 100 - origin.y));
      }
      updateOverlayElement(action.element, overlay);
      event.preventDefault();
    });

    doc.addEventListener('pointerup', (event) => {
      if (!action) return;
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
    const id = state.selectedOverlayId;
    state.customOverlays = state.customOverlays.filter((overlay) => overlay.id !== id);
    state.selectedOverlayId = '';
    const doc = el.previewFrame.contentDocument;
    doc?.querySelector(`.proposal-custom-zone[data-overlay-id="${CSS.escape(id)}"]`)?.remove();
    refreshOverlayLabels(doc);
    updateOverlayControls(doc);
    setStatus('선택한 대상지 표시를 삭제했습니다.');
  }

  function updateSelectedOverlayAngle() {
    const overlay = overlayById(state.selectedOverlayId);
    if (!overlay) return;
    const numericAngle = Number(el.overlayAngle.value);
    overlay.angle = roundCoordinate(clamp(Number.isFinite(numericAngle) ? numericAngle : 0, -180, 180));
    el.overlayAngle.value = String(overlay.angle);
    const doc = el.previewFrame.contentDocument;
    const zone = doc?.querySelector(`.proposal-custom-zone[data-overlay-id="${CSS.escape(overlay.id)}"]`);
    if (zone) updateOverlayElement(zone, overlay);
    setStatus(`선택한 대상지 표시를 ${trimNumber(overlay.angle)}°로 회전했습니다.`);
  }

  function resetSelectedOverlayAngle() {
    if (!overlayById(state.selectedOverlayId)) return;
    el.overlayAngle.value = '0';
    updateSelectedOverlayAngle();
  }

  function clearOverlays() {
    if (!state.customOverlays.length) return;
    if (!window.confirm('사진 위에 만든 대상지 표시를 모두 지울까요?')) return;
    state.customOverlays = [];
    state.selectedOverlayId = '';
    state.overlayDrawMode = false;
    const doc = el.previewFrame.contentDocument;
    doc?.querySelectorAll('.proposal-custom-zone').forEach((node) => node.remove());
    updateOverlayControls(doc);
    setStatus('사진 위 대상지 표시를 모두 지웠습니다.');
  }

  function syncExistingInstallationUi({ restoreValue = false } = {}) {
    const hasExisting = Boolean(el.hasExistingInstallation.checked);
    const currentValue = Number(el.existingKw.value);
    if (!hasExisting) {
      if (Number.isFinite(currentValue) && currentValue > 0) state.lastExistingKw = currentValue;
      el.existingKw.value = '0';
      el.existingKw.disabled = true;
      el.existingKw.required = false;
    } else {
      el.existingKw.disabled = false;
      el.existingKw.required = true;
      if (restoreValue && (!(currentValue > 0))) el.existingKw.value = String(state.lastExistingKw || 57);
    }
  }

  function renderPreview({ force = false } = {}) {
    if (!state.templateHtml) return;
    if (state.manualDirty && force) {
      const overwrite = window.confirm('미리보기에서 직접 수정한 문구가 있습니다. 입력값 기준으로 18쪽을 다시 만들까요?');
      if (!overwrite) return;
    }
    if (!el.form.reportValidity()) return;
    try {
      const model = readModel();
      validateModel(model);
      saveDraft();
      state.manualDirty = false;
      setStatus('18쪽 미리보기를 다시 만들고 있습니다.');
      el.previewFrame.onload = () => {
        const doc = el.previewFrame.contentDocument;
        const slideCount = doc?.querySelectorAll('.slide').length || 0;
        el.pageCount.textContent = `${slideCount}쪽`;
        doc?.addEventListener('input', (event) => {
          if (!event.target?.closest?.('[data-proposal-editable="true"]')) return;
          state.manualDirty = true;
          setStatus('직접 고친 문구가 있습니다. 입력값을 다시 반영하면 이 수정은 사라집니다.', true);
        });
        bindOverlayEditor(doc);
        applyEditMode();
      };
      el.previewFrame.srcdoc = buildPreviewDocument(model);
    } catch (error) {
      console.error(`[proposal-builder ${VERSION}] render failed`, error);
      setStatus(error?.message || '제안서를 만들지 못했습니다. 입력값을 확인해 주세요.', true);
    }
  }

  function scheduleRender() {
    window.clearTimeout(state.renderTimer);
    if (state.editMode || state.manualDirty) {
      setStatus('입력값이 바뀌었습니다. 직접 고친 문구를 유지하려면 먼저 파일로 저장하고, 새로 반영하려면 위 버튼을 누르세요.', true);
      return;
    }
    state.renderTimer = window.setTimeout(() => renderPreview(), 280);
  }

  function saveDraft() {
    const draft = {};
    DRAFT_FIELDS.forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      draft[id] = input.type === 'checkbox' ? input.checked : input.value;
    });
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (error) {
      console.warn(`[proposal-builder ${VERSION}] draft save skipped`, error);
    }
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!draft || typeof draft !== 'object') return;
      DRAFT_FIELDS.forEach((id) => {
        const input = document.getElementById(id);
        if (!input || !(id in draft)) return;
        if (input.type === 'checkbox') input.checked = Boolean(draft[id]);
        else input.value = String(draft[id]);
      });
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
        console.warn(`[proposal-builder ${VERSION}] image inline skipped`, source, error);
      }
    }));
  }

  async function buildDownloadHtml() {
    const sourceDoc = el.previewFrame.contentDocument;
    if (!sourceDoc) throw new Error('미리보기가 아직 준비되지 않았습니다.');
    const doc = sourceDoc.cloneNode(true);
    doc.getElementById('proposalBuilderPreviewStyle')?.remove();
    doc.querySelectorAll('.proposal-zone-handle').forEach((node) => node.remove());
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
    el.downloadButton.disabled = true;
    setStatus('사진까지 포함한 HTML 파일을 만들고 있습니다.');
    try {
      const model = readModel();
      const html = await buildDownloadHtml();
      const datePart = model.proposalDate.replaceAll('-', '');
      const filename = `${sanitizeFilename(`${datePart}_${model.facilityName}_주차장_햇빛발전소_제안서_${model.proposalVersion}`)}.html`;
      downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), filename);
      setStatus('HTML 파일을 저장했습니다. 파일만 옮겨도 사진을 포함한 제안서가 열립니다.');
    } catch (error) {
      console.error(`[proposal-builder ${VERSION}] download failed`, error);
      setStatus(error?.message || 'HTML 파일을 만들지 못했습니다.', true);
    } finally {
      el.downloadButton.disabled = false;
    }
  }

  function printProposal() {
    const frameWindow = el.previewFrame.contentWindow;
    if (!frameWindow) {
      setStatus('미리보기가 아직 준비되지 않았습니다.', true);
      return;
    }
    frameWindow.focus();
    frameWindow.print();
  }

  async function handleSiteImageChange() {
    const file = el.siteImage.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      el.siteImage.value = '';
      setStatus('PNG, JPG 또는 WebP 사진만 사용할 수 있습니다.', true);
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      el.siteImage.value = '';
      setStatus('사진은 12MB 이하로 선택해 주세요.', true);
      return;
    }
    state.siteImageDataUrl = await dataUrlFromBlob(file);
    state.customOverlays = [];
    state.selectedOverlayId = '';
    state.overlayDrawMode = false;
    el.siteImageName.textContent = file.name;
    el.keepNamsaOverlay.checked = false;
    saveDraft();
    scheduleRender();
  }

  function resetSample() {
    if (!window.confirm('입력값과 직접 수정한 문구를 지우고 남사읍 예시로 돌아갈까요?')) return;
    el.form.reset();
    localStorage.removeItem(DRAFT_KEY);
    state.siteImageDataUrl = '';
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
  }

  function bindEvents() {
    el.form.addEventListener('submit', (event) => {
      event.preventDefault();
      renderPreview({ force: true });
    });
    el.form.addEventListener('input', (event) => {
      if (event.target === el.siteImage) return;
      if (event.target === el.overlayAngle) return;
      if (event.target === el.hasExistingInstallation) syncExistingInstallationUi({ restoreValue: true });
      if (event.target === el.existingKw && numberValue('existingKw') > 0) state.lastExistingKw = numberValue('existingKw');
      readModel();
      saveDraft();
      scheduleRender();
    });
    el.siteImage.addEventListener('change', () => {
      handleSiteImageChange().catch((error) => {
        console.error(`[proposal-builder ${VERSION}] image load failed`, error);
        setStatus('사진을 읽지 못했습니다. 다른 파일을 선택해 주세요.', true);
      });
    });
    el.addOverlayButton.addEventListener('click', toggleOverlayDrawMode);
    el.deleteOverlayButton.addEventListener('click', deleteSelectedOverlay);
    el.clearOverlayButton.addEventListener('click', clearOverlays);
    el.overlayAngle.addEventListener('input', updateSelectedOverlayAngle);
    el.resetOverlayAngleButton.addEventListener('click', resetSelectedOverlayAngle);
    el.editButton.addEventListener('click', () => {
      state.editMode = !state.editMode;
      applyEditMode();
    });
    el.printButton.addEventListener('click', printProposal);
    el.printTopButton.addEventListener('click', printProposal);
    el.downloadButton.addEventListener('click', downloadHtml);
    el.resetButton.addEventListener('click', resetSample);
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

      el.bootMessage.textContent = '18쪽 제안서 원본을 불러오고 있습니다.';
      const response = await withTimeout(fetch(TEMPLATE_URL, { credentials: 'same-origin', cache: 'no-store' }), 'TEMPLATE');
      if (!response.ok) throw new Error(`TEMPLATE_HTTP_${response.status}`);
      state.templateHtml = await response.text();
      if (!state.templateHtml.includes('class="slide')) throw new Error('TEMPLATE_INVALID');
      restoreDraft();
      syncExistingInstallationUi();
      updateOverlayControls();
      bindEvents();
      el.bootSpinner.hidden = true;
      el.bootActions.hidden = true;
      el.bootPanel.hidden = true;
      el.appShell.classList.add('ready');
      renderPreview();
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
