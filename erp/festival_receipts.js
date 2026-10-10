/* v2.9.0 — Scoped tab reads and fresh, input-preserving workspace resume. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const client = window.supabase.createClient(
    'https://ifdqlwxgqgsvnawmhlfc.supabase.co',
    'sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h',
    {
      global: {
        headers: {
          'x-erp-host': String(window.location.hostname || '').trim().toLowerCase()
        }
      }
    }
  );
  const money = (value) => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const kstToday = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateTime = (value) => new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(value));
  const intValue = (id) => Math.max(0, Math.trunc(Number(ERPNumberInput.raw($(id)?.value || 0))));
  const movementLabels = {
    purchase: '구매 입고', sale: '판매 출고', event_use: '무료 체험·행사 사용',
    defect: '불량·폐기', adjustment_in: '실사 증가', adjustment_out: '실사 감소'
  };
  let offset = 0;
  let receipts = [];
  let receiptTotal = 0;
  let inventory = { items: [], sales: [], movements: [] };
  let eventContext = { events: [], sale_links: [], receipt_links: [] };
  let extraPaymentContext = { items: [] };
  let voucherContext = { items: [] };
  let purchaseReceiptContext = { items: [] };
  let editable = false;
  let paymentGuideBase = '';
  let operationBusy = false;
  let receiptBusy = false;
  let receiptAmountEdited = false;
  let pendingSaleRequestKey = null;
  let incomeController = null;
  let workspaceTools = null;
  let selectedEventId = '';
  let selectedSales = [];
  let salesOffset = 0, salesTotal = 0, vouchersOffset = 0, vouchersTotal = 0;
  let scopeRevision = 0, eventBusy = false;
  let inputRevision = 0, identityRevision = 0, taskUserId = '', tabsReady = false;
  const loadedPanels = new Set(), pendingPanels = new Map();
  const unassigned = 'unassigned';
  const saleDrafts = new Map();
  const saleFields = ['saleItem','saleQuantity','saleUnitPrice','saleDiscount','voucherCount','voucherUnitValue','voucherOrganizer','saleBank','saleCash','receiptIssuedCount','receiptIssuedAmount','receiptNoneCount','receiptNoneAmount','overpaymentAmount','overpaymentName','saleNote'];
  const tabButtons = Array.from(document.querySelectorAll('.festival-tabs [role="tab"]'));
  const scopeData = (id = selectedEventId) => id === unassigned ? { unassigned: true } : { event_id: id };
  const panelKind = { salesPanel:'sales', voucherPanel:'vouchers', receiptsPanel:'receipts' };
  document.addEventListener('input', () => { inputRevision++; }, true);
  document.addEventListener('change', () => { inputRevision++; }, true);
  function beginRead() {
    const scope = scopeRevision, identity = identityRevision, input = inputRevision;
    return () => scope === scopeRevision && identity === identityRevision && input === inputRevision;
  }
  function hasInlineEditor() {
    return Boolean(document.querySelector('.inline-action,.income-editor'));
  }
  async function ensurePanel(panelId, force = false) {
    const kind = panelKind[panelId];
    if (!selectedEventId || !kind) return;
    const key = `${scopeRevision}:${kind}:${kind === 'sales' ? salesOffset : kind === 'vouchers' ? vouchersOffset : offset}`;
    if (!force && loadedPanels.has(key)) return;
    if (!pendingPanels.has(key)) {
      const revision = scopeRevision;
      const loader = kind === 'sales' ? loadSales : kind === 'vouchers' ? loadVouchers : loadReceipts;
      const panel = $(panelId);
      panel.setAttribute('aria-busy', 'true');
      const request = loader(revision).then(applied => {
        if (applied && revision === scopeRevision) loadedPanels.add(key);
      }).finally(() => {
        if (pendingPanels.get(key) === request) pendingPanels.delete(key);
        if (revision === scopeRevision) panel.setAttribute('aria-busy', 'false');
      });
      pendingPanels.set(key, request);
    }
    await pendingPanels.get(key);
  }
  function activePanelId() {
    return tabButtons.find(tab => tab.getAttribute('aria-selected') === 'true')?.dataset.panel;
  }

  async function recordsRpc(action, data = {}) {
    const result = await client.rpc('festival_event_records', { p_action: action, p_data: data });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }
  async function operationsRpc(action, data = {}) {
    const result = await client.rpc('festival_operations_admin', {p_action: action, p_data: data});
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  function showTab(panelId, focus = false) {
    tabButtons.forEach((button) => {
      const active = button.dataset.panel === panelId;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      $(button.dataset.panel).hidden = !active;
      if (active && focus) button.focus();
    });
    if (tabsReady && !eventBusy) void ensurePanel(panelId).catch(error => setOperationStatus(readableError(error), true));
  }
  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => showTab(button.dataset.panel));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const available = tabButtons.filter((tab) => !tab.disabled && !tab.hidden);
      if (!available.length) return;
      const current = available.indexOf(tabButtons[index]);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length;
      showTab(available[next].dataset.panel, true);
    });
  });

  function syncEventHeading() {
    const event = eventById(selectedEventId);
    $('eventWorkspace').hidden = !selectedEventId;
    $('festivalIncomeRoot').hidden = !event;
    $('selectedEventTitle').textContent = event ? `${event.event_name} · 축제 현황` : '행사 미지정 내역';
    $('eventPosters').replaceChildren();
    $('eventPosters').hidden = !event;
    if (event) $('eventPosters').append(makePosterLink(event, 'open', '체험 안내 인쇄'), makePosterLink(event, 'closed', '체험 마감 인쇄'), makePosterLink(event, 'flow', '발전 원리 인쇄'));
    const guide = new URL(paymentGuideBase || '../festival.html', location.href);
    if (event?.public_code) guide.searchParams.set('event', event.public_code);
    $('paymentGuide').href = guide.href;
    const canSell = Boolean(event?.is_active);
    const noCash = event?.no_cash_sales === true;
    $('editEvent').hidden = !event || !editable;
    $('eventInventory').hidden = !event;
    $('tab-sale').hidden = noCash;
    $('tab-receipts').hidden = noCash && receiptTotal === 0;
    $('tab-vouchers').hidden = noCash && vouchersTotal === 0;
    $('tab-sales').hidden = noCash && salesTotal === 0;
    document.querySelector('.festival-tabs').hidden = tabButtons.every(tab => tab.hidden);
    $('tab-sale').disabled = !canSell || noCash;
    $('saleForm').querySelectorAll('input,select,button').forEach((element) => { element.disabled = !editable || !canSell || noCash; });
    const activeTab = tabButtons.find(tab => tab.getAttribute('aria-selected') === 'true');
    if (activeTab?.hidden) {
      const nextTab=tabButtons.find(tab=>!tab.hidden&&!tab.disabled);
      if(nextTab)showTab(nextTab.dataset.panel);
      else tabButtons.forEach(tab=>{$(tab.dataset.panel).hidden=true;});
    }
    else if(activeTab&&!activeTab.disabled)showTab(activeTab.dataset.panel);
    if (!canSell && $('tab-sale').getAttribute('aria-selected') === 'true') showTab('salesPanel');
    $('eventSelectionStatus').textContent = !selectedEventId ? '축제를 선택하면 재료비와 매출·정산 내역을 확인할 수 있습니다.'
      : selectedEventId === unassigned ? '행사 정보가 없는 기존 내역입니다. 다른 축제에 자동으로 연결하지 않습니다.'
      : !canSell ? '종료한 행사의 기록을 조회합니다. 새 매출 등록은 할 수 없습니다.' : '';
  }

  async function selectEvent(id, afterSettingsSave = false) {
    if (operationBusy || receiptBusy || incomeController?.isBusy() || (!afterSettingsSave && workspaceTools?.isBusy())) {
      $('saleEvent').value = selectedEventId;
      setOperationStatus('진행 중인 처리가 끝난 뒤 축제를 변경해 주세요.', true);
      return;
    }
    if (selectedEventId) saleDrafts.set(selectedEventId, {
      values: Object.fromEntries(saleFields.map((field) => [field, $(field).value])),
      receiptAmountEdited, pendingSaleRequestKey
    });
    const previousCanSell = Boolean(eventById(selectedEventId)?.is_active);
    selectedEventId = id;
    const revision = ++scopeRevision;
    loadedPanels.clear();
    eventBusy = Boolean(id); $('saleEvent').disabled = eventBusy;
    salesOffset = vouchersOffset = offset = 0;
    selectedSales = []; receipts = []; voucherContext = { items: [] };
    salesTotal = vouchersTotal = receiptTotal = 0;
    $('saleForm').reset();
    $('adminStatus').textContent = '';
    const draft = saleDrafts.get(id);
    if (draft) saleFields.forEach((field) => { $(field).value = draft.values[field]; });
    else {
      fillItemSelect($('saleItem'), (inventory.items || []).filter((item) => item.is_active));
      const guide=eventById(id)?.guide_settings;
      if(guide){$('saleUnitPrice').value=String(guide.unit_price);$('voucherUnitValue').value=String(guide.coupon_value||3000);}
    }
    if(draft && !$('saleQuantity').value){const guide=eventById(id)?.guide_settings;if(guide){$('saleUnitPrice').value=String(guide.unit_price);$('voucherUnitValue').value=String(guide.coupon_value||3000);}}
    receiptAmountEdited = draft?.receiptAmountEdited || false;
    pendingSaleRequestKey = draft?.pendingSaleRequestKey || null;
    syncCashReceived(); syncSaleReceiptAllocation(); syncEventHeading();
    if (!previousCanSell && eventById(id)?.is_active) showTab('salePanel');
    renderSales(); renderVouchers(); renderReceipts();
    if (!id) { $('eventWorkspace').setAttribute('aria-busy', 'false'); return; }
    eventBusy = true; $('saleEvent').disabled = true;
    $('eventWorkspace').setAttribute('aria-busy', 'true');
    $('eventSelectionStatus').textContent = '선택한 축제의 내역을 불러오고 있습니다.';
    try {
      const panels = eventById(id)?.no_cash_sales
        ? ['salesPanel','voucherPanel','receiptsPanel'] : [activePanelId()];
      await Promise.all([...panels.map(panel => ensurePanel(panel)), incomeController?.selectEvent(),workspaceTools?.selectEvent()]);
      if (revision === scopeRevision) syncEventHeading();
      if (revision === scopeRevision) await ensurePanel(activePanelId());
    } catch (error) {
      if (revision === scopeRevision) $('eventSelectionStatus').textContent = readableError(error);
    } finally {
      if (revision === scopeRevision) {
        eventBusy = false; $('saleEvent').disabled = false;
        $('eventWorkspace').setAttribute('aria-busy', 'false');
      }
    }
  }
  $('saleEvent').addEventListener('change', () => { void selectEvent($('saleEvent').value); });

  const eventDialog = $('eventDialog');
  $('openEventDialog').addEventListener('click', () => {
    if (!editable || operationBusy || eventDialog.open) return;
    if (eventBusy || receiptBusy || incomeController?.isBusy() || workspaceTools?.isBusy()) {
      setOperationStatus('진행 중인 처리가 끝난 뒤 행사를 등록해 주세요.', true);
      return;
    }
    $('eventStatus').textContent = '';
    eventDialog.showModal(); document.body.classList.add('event-dialog-open');
    $('newEventName').focus();
  });
  $('closeEventDialog').addEventListener('click', () => { if (!operationBusy) eventDialog.close(); });
  eventDialog.addEventListener('cancel', (event) => { if (operationBusy) event.preventDefault(); });
  eventDialog.addEventListener('close', () => { document.body.classList.remove('event-dialog-open'); });

  function setOperationStatus(message, error = false) {
    $('operationStatus').textContent = message || '';
    $('operationStatus').classList.toggle('error', error);
  }

  function readableError(error) {
    const message = String(error?.message || error || '처리하지 못했습니다.');
    if (message.includes('ADMIN_REQUIRED')) return '관리 권한이 없습니다.';
    if (message.includes('EDIT_REQUIRED')) return '회계 등록 권한이 없습니다.';
    if (message.includes('EVENT_CHANGED') || message.includes('RECEIPT_CHANGED')) return '다른 화면에서 변경된 기록입니다. 새로고침한 뒤 남은 수량과 내용을 확인해 주세요.';
    if (message.includes('REQUEST_CONFLICT')) return '이전에 보낸 요청과 내용이 다릅니다. 처리 결과를 확인한 뒤 다시 시도해 주세요.';
    if (message.includes('INVALID_EVENT_SETTINGS')) return '축제명·체험 제목·금액·쿠폰·수량 설정을 확인해 주세요.';
    if (message.includes('EVENT_NO_CASH_SALES')) return '체험비를 받지 않는 축제입니다. 무료 체험·행사 사용으로 수량만 기록해 주세요.';
    if (message.includes('INVALID_PERIOD')) return '조회 시작일과 종료일을 확인해 주세요.';
    if (message.includes('INSUFFICIENT_STOCK')) return '사용일에 확보된 재고가 부족하거나 이후 기록과 수량이 맞지 않습니다. 날짜와 수량을 확인해 주세요.';
    if (message.includes('RECEIPT_DIFFERENCE_NOTE_REQUIRED')) return '결재 수량과 다른 이유를 검수 메모에 적어 주세요.';
    if (message.includes('INVALID_RECEIPT_INPUT')) return '이번 입고 수량은 남은 수량 이내로, 수령일은 이전 검수일 이후부터 오늘까지 입력해 주세요.';
    if (message.includes('RECEIPT_NOT_FOUND') || message.includes('RECEIPT_NOT_PENDING')) return '입고 대기 상태를 다시 확인해 주세요. 취소된 결재는 입고할 수 없습니다.';
    if (message.includes('INVALID_SALE_TOTAL')) return '판매액·수납액·현금영수증 구분 합계를 다시 확인해 주세요.';
    if (message.includes('INVALID_DEPOSIT_AMOUNT')) return '입금 처리할 수 있는 현금 잔액을 초과했습니다.';
    if (message.includes('INVALID_RECEIPT_COUNT')) return '현금영수증 발급 건수는 0건부터 판매 수량까지 입력할 수 있습니다.';
    if (message.includes('INVALID_RECEIPT_AMOUNT')) return '현금영수증 발급 금액을 참가자 직접 결제액 안에서 확인해 주세요.';
    if (message.includes('VOUCHER_SETTLEMENT_EXCEEDS_BALANCE')) return '쿠폰 미정산액보다 큰 금액은 입금 처리할 수 없습니다.';
    if (message.includes('INVALID_VOUCHER_SETTLEMENT')) return '쿠폰 정산 입금일과 입금액을 확인해 주세요.';
    if (message.includes('LINKED_RECEIPT_EXCEEDS_ALLOCATION')) return '이미 발급 완료로 연결된 현금영수증보다 적게 바꿀 수 없습니다. 먼저 해당 신청을 미처리로 되돌려 주세요.';
    if (message.includes('RECEIPT_ALLOCATION_EXCEEDED')) return '해당 매출에 남아 있는 `신청 없음` 금액보다 신청액이 큽니다.';
    if (message.includes('RECEIPT_AMOUNT_NOT_MATCHED')) return '신청 금액과 해당 매출의 개당 판매가가 맞지 않습니다.';
    if (message.includes('SALE_LINK_REQUIRED') || message.includes('SALE_NOT_FOUND')) return '현금영수증을 연결할 등록 매출을 선택해 주세요.';
    if (message.includes('EVENT_MISMATCH')) return '현금영수증 신청 행사와 선택한 매출 행사가 다릅니다.';
    if (message.includes('EVENT_NOT_FOUND') || message.includes('INVALID_EVENT')) return '행사명과 날짜를 확인해 주세요.';
    if (message.includes('INVALID_REFUND_INPUT')) return '반환일과 반환 수단을 확인해 주세요.';
    if (message.includes('EXTRA_PAYMENT_NOT_REFUNDABLE')) return '추가 매출로 정리된 입금만 반환 처리할 수 있습니다.';
    if (message.includes('REFUND_RECORD_MISSING')) return '기존 반환 기록을 확인하지 못했습니다. 다시 처리하지 말고 관리자에게 확인해 주세요.';
    if (message.includes('결산에 포함')) return message;
    return '처리하지 못했습니다. 입력값과 로그인 상태를 확인하고 다시 시도해 주세요.';
  }

  async function rpc(action, data = {}) {
    const result = await client.rpc('festival_receipts_admin', { p_action: action, p_data: data });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async function adjustRpc(action, data = {}) {
    const result = await client.rpc('festival_receipts_adjust', { p_action: action, p_data: data });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async function eventRpc(action, data = {}) {
    const result = await client.rpc('festival_events_admin', { p_action: action, p_data: data });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async function registerSaleRpc(data = {}) {
    const result = await client.rpc('festival_cash_sale_register_v2', { p_data: data });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async function extraPaymentRpc(action, data = {}) {
    const result = await client.rpc('festival_extra_payment_refunds_admin', { p_action: action, p_data: data });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async function voucherRpc(action, data = {}) {
    const result = await client.rpc('festival_voucher_sales_admin', { p_action: action, p_data: data });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async function purchaseReceiptRpc(action, data = {}) {
    const result = await client.rpc('inventory_purchase_receipts_admin', { p_action: action, p_data: data });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  const receiptBaseForSale = (sale) => Math.max(0,
    Number(sale.gross_amount || 0) - Number(sale.voucher_amount || 0));

  const saleLink = (saleId) => (eventContext.sale_links || []).find((row) => row.sale_id === saleId) || null;
  const receiptLink = (receiptId) => (eventContext.receipt_links || []).find((row) => row.receipt_id === receiptId) || null;
  const eventById = (eventId) => (eventContext.events || []).find((row) => row.id === eventId) || null;
  const extraPaymentBySaleId = (saleId) => (extraPaymentContext.items || []).find((row) => row.sale_id === saleId) || null;

  function makeCell(value, className = '') {
    const cell = document.createElement('td');
    cell.textContent = value ?? '';
    if (className) cell.className = className;
    return cell;
  }

  function fillItemSelect(select, activeItems) {
    const previous = select.value;
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = activeItems.length ? '물품 선택' : '먼저 물품을 등록해 주세요';
    select.append(placeholder);
    activeItems.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.item_name} · 재고 ${Number(item.stock_quantity || 0).toLocaleString('ko-KR')}${item.unit}`;
      select.append(option);
    });
    if (activeItems.some((item) => item.id === previous)) select.value = previous;
    else if (activeItems.length === 1) select.value = activeItems[0].id;
  }

  function posterUrl(event, mode) {
    const params = new URLSearchParams({
      mode,
      event: event.public_code,
      name: event.event_name,
      date: event.event_date
    });
    const target=new URL(paymentGuideBase?'festival_print.html':'../festival_print.html',paymentGuideBase||location.href);
    target.search=params.toString();return target.href;
  }

  function makePosterLink(event, mode, label) {
    const link = document.createElement('a');
    link.className = 'button secondary compact';
    link.href = posterUrl(event, mode);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = label;
    return link;
  }

  function renderEvents(preferredId = '') {
    const events = Array.isArray(eventContext.events) ? eventContext.events : [];
    const select = $('saleEvent');
    const previous = preferredId || selectedEventId || select.value;
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = events.length ? '행사를 선택해 주세요' : '먼저 행사를 등록해 주세요';
    select.append(placeholder);
    events.forEach((event) => {
      const option = document.createElement('option');
      option.value = event.id;
      option.textContent = `${event.event_date} · ${event.event_name}${event.is_active ? '' : ' (종료)'}`;
      select.append(option);
    });
    const legacy = document.createElement('option');
    legacy.value = unassigned; legacy.textContent = '행사 미지정 내역'; select.append(legacy);
    if (previous === unassigned || events.some((event) => event.id === previous)) select.value = previous;
    else if (events.length === 1) select.value = events[0].id;
  }

  async function loadEventContext(preferredId = '') {
    eventContext = await operationsRpc('events');
    renderEvents(preferredId);
    renderSales();
    renderReceipts();
    syncEventHeading();
  }

  function renderInventory() {
    const items = Array.isArray(inventory.items) ? inventory.items : [];
    const cards = $('inventoryCards');
    cards.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = '등록된 물품이 없습니다. 아래에서 첫 물품을 등록해 주세요.';
      cards.append(empty);
    }
    items.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'summary-card';
      const title = document.createElement('h3');
      title.textContent = item.item_name;
      const stock = document.createElement('strong');
      stock.textContent = `${Number(item.stock_quantity || 0).toLocaleString('ko-KR')}${item.unit}`;
      const detail = document.createElement('p');
      detail.textContent = `입고 ${Number(item.purchased_quantity || 0).toLocaleString('ko-KR')} · 판매 ${Number(item.sold_quantity || 0).toLocaleString('ko-KR')} · 행사 사용 ${Number(item.event_use_quantity || 0).toLocaleString('ko-KR')} · 불량 ${Number(item.defect_quantity || 0).toLocaleString('ko-KR')}`;
      const pending = (purchaseReceiptContext.items || [])
        .filter((row) => row.pending && row.item_name === item.item_name)
        .reduce((sum, row) => sum + Number(row.remaining_quantity ?? row.expected_quantity ?? 0), 0);
      if (pending > 0) detail.textContent += ` · 입고 대기 ${pending.toLocaleString('ko-KR')}${item.unit}`;
      card.append(title, stock, detail);
      cards.append(card);
    });
    const active = items.filter((item) => item.is_active);
    fillItemSelect($('saleItem'), active);
    fillItemSelect($('movementItem'), active);
  }

  function beginPurchaseInspection(card, purchase) {
    if (operationBusy) return;
    const oldForm = card.querySelector('form');
    if (oldForm) { oldForm.querySelector('input')?.focus(); return; }
    const form = document.createElement('form');
    form.className = 'inline-action';
    const fields = [
      ['수령일', 'date', 'received_date', kstToday()],
      ['이번 입고 수량', 'number', 'quantity', ''],
      ['검수 메모', 'text', 'note', '']
    ];
    const inputs = {};
    fields.forEach(([text, type, name, value]) => {
      const label = document.createElement('label');
      label.className = 'small';
      label.textContent = text;
      const input = document.createElement('input');
      input.type = type;
      input.name = name;
      input.value = value;
      input.setAttribute('aria-label', `${purchase.item_name} ${text}`);
      if (name === 'quantity') {
        input.dataset.numberGroup = ''; input.min = '0'; input.max = String(purchase.remaining_quantity ?? purchase.expected_quantity); input.step = '1';
        input.inputMode = 'numeric'; input.placeholder = `남은 ${purchase.remaining_quantity ?? purchase.expected_quantity}${purchase.unit}`;
        input.required = true;
      } else if (name === 'received_date') {
        const approvedAt = Date.parse(purchase.approved_at);
        input.min = Number.isFinite(approvedAt)
          ? new Date(approvedAt + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
          : purchase.movement_date || kstToday();
        input.max = kstToday(); input.required = true;
        for(const history of purchase.inspections||[])if(history.date>input.min)input.min=history.date;
      } else {
        input.maxLength = 500; input.placeholder = '불량·누락 등';
      }
      inputs[name] = input;
      label.append(input); form.append(label);
    });
    const partialLabel=document.createElement('label');partialLabel.className='check';
    const partial=document.createElement('input');partial.type='checkbox';
    partialLabel.append(partial,document.createTextNode('부분입고 (나머지는 입고 대기로 유지)'));form.append(partialLabel);
    let inspectionRequest=null;
    const save = document.createElement('button');
    save.type = 'submit'; save.textContent = '입고 완료 확인';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'secondary'; cancel.textContent = '취소';
    cancel.addEventListener('click', () => form.remove());
    form.append(save, cancel);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (operationBusy) return;
      const quantity = Number(ERPNumberInput.raw(inputs.quantity.value));
      const note = inputs.note.value.trim();
      const remaining=Number(purchase.remaining_quantity ?? purchase.expected_quantity);
      if (inputs.quantity.value === '' || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > remaining || (partial.checked && quantity===0)) {
        setOperationStatus('이번에 실제 받은 수량을 남은 입고 수량 안에서 입력해 주세요.', true); return;
      }
      if (!partial.checked && quantity !== remaining && !note) {
        setOperationStatus('불량·누락 등 수량 차이의 이유를 검수 메모에 적어 주세요.', true); return;
      }
      if (!window.confirm(`${purchase.item_name}\n결재 수량: ${purchase.expected_quantity}${purchase.unit}\n이번 입고: ${quantity}${purchase.unit}\n${partial.checked ? `남은 입고 대기: ${remaining-quantity}${purchase.unit}` : '최종 검수: 남은 입고 대기를 종료합니다.'}\n수령일: ${inputs.received_date.value}\n${note ? `검수 메모: ${note}\n` : ''}저장할까요?`)) return;
      operationBusy = true; save.disabled = cancel.disabled = true;
      try {
        const data={id:purchase.id,quantity,received_date:inputs.received_date.value,note,partial:partial.checked,expected_received:Number(purchase.received_quantity||0)};
        const fingerprint=JSON.stringify(data);
        if(inspectionRequest?.fingerprint!==fingerprint)inspectionRequest={fingerprint,key:crypto.randomUUID()};
        const result = await purchaseReceiptRpc('confirm', {...data,request_key:inspectionRequest.key});
        setOperationStatus(`${purchase.item_name} 이번 ${result.quantity}${purchase.unit} 입고 · 누적 ${result.total_received}${purchase.unit}${result.remaining_quantity ? ` · 남은 입고 대기 ${result.remaining_quantity}${purchase.unit}` : ' · 검수 완료'}`);
        await loadInventory();
      } catch (error) {
        setOperationStatus(readableError(error), true);
      } finally {
        operationBusy = false; save.disabled = cancel.disabled = false;
      }
    });
    card.append(form); inputs.quantity.focus();
  }

  function renderPurchaseReceipts() {
    const wrap = $('purchaseReceiptRows');
    wrap.replaceChildren();
    const purchases = purchaseReceiptContext.items || [];
    if (!purchases.length) {
      const empty = document.createElement('p'); empty.className = 'small muted';
      empty.textContent = '입고 대기 중인 구매 결재가 없습니다.'; wrap.append(empty); return;
    }
    purchases.forEach((purchase) => {
      const card = document.createElement('article'); card.className = 'summary-card';
      const title = document.createElement('h3'); title.textContent = purchase.item_name;
      const detail = document.createElement('p');
      detail.textContent = `${purchase.title} · 결재 ${purchase.expected_quantity}${purchase.unit} · 입고 ${purchase.received_quantity||0}${purchase.unit}${purchase.pending ? ` · 남은 입고 대기 ${purchase.remaining_quantity ?? purchase.expected_quantity}${purchase.unit}` : ' · 검수 완료'}`;
      card.append(title, detail);
      if (purchase.pending && editable) {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = '입고 검수'; button.addEventListener('click', () => beginPurchaseInspection(card, purchase));
        card.append(button);
      } else if (purchase.receipt_note) {
        const note = document.createElement('p'); note.className = 'small';
        note.textContent = purchase.receipt_note; card.append(note);
      }
      if(purchase.inspections?.length){const history=document.createElement('details'),title=document.createElement('summary');title.textContent=`검수 기록 ${purchase.inspections.length}건`;history.append(title);purchase.inspections.forEach(h=>{const p=document.createElement('p');p.textContent=`${h.date} · ${h.quantity}${purchase.unit} · ${h.partial?'부분입고':'최종 검수'}${h.note?` · ${h.note}`:''}`;history.append(p);});card.append(history);}
      wrap.append(card);
    });
  }

  function renderMovements() {
    const rows = $('movementRows');
    rows.replaceChildren();
    const movements = Array.isArray(inventory.movements) ? inventory.movements : [];
    movements.forEach((movement) => {
      const row = document.createElement('tr');
      row.append(
        makeCell(movement.movement_date),
        makeCell(movement.item_name),
        makeCell(movementLabels[movement.movement_type] || movement.movement_type),
        makeCell(`${Number(movement.quantity_delta) > 0 ? '+' : ''}${Number(movement.quantity_delta).toLocaleString('ko-KR')}`),
        makeCell(movement.is_active ? (movement.note || '-') : '결재 취소로 입고 제외')
      );
      if (Number(movement.quantity_delta) < 0) row.classList.add('stock-out');
      if (!movement.is_active) row.classList.add('muted-row');
      rows.append(row);
    });
    if (!movements.length) {
      const row = document.createElement('tr');
      const cell = makeCell('재고 변동이 없습니다.');
      cell.colSpan = 5;
      row.append(cell);
      rows.append(row);
    }
  }

  function beginDeposit(cell, sale, remaining) {
    cell.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'inline-action';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = kstToday();
    dateInput.setAttribute('aria-label', '통장 입금일');
    const amountInput = document.createElement('input');
    amountInput.type = 'number'; amountInput.dataset.numberGroup = '';
    amountInput.min = '1';
    amountInput.max = String(remaining);
    amountInput.step = '1';
    amountInput.value = String(remaining);
    amountInput.setAttribute('aria-label', '통장 입금액');
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = '입금 확인·기록';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = '취소';
    cancel.addEventListener('click', renderSales);
    save.addEventListener('click', async () => {
      if (operationBusy) return;
      const amount = Math.trunc(Number(ERPNumberInput.raw(amountInput.value || 0)));
      if (!dateInput.value || amount <= 0 || amount > remaining) {
        setOperationStatus(`통장 입금액은 1원부터 ${money(remaining)}까지 입력할 수 있습니다.`, true);
        return;
      }
      operationBusy = true;
      save.disabled = cancel.disabled = true;
      try {
        await rpc('deposit_cash', {
          request_key: crypto.randomUUID(), sale_id: sale.id,
          deposit_date: dateInput.value, amount
        });
        setOperationStatus(`${money(amount)}을 시재금에서 보통예금으로 옮겨 기록했습니다.`);
        await loadInventory();
      } catch (error) {
        setOperationStatus(readableError(error), true);
      } finally {
        operationBusy = false;
      }
    });
    wrap.append(dateInput, amountInput, save, cancel);
    cell.append(wrap);
    dateInput.focus();
  }

  function beginReceiptAllocationEdit(cell, sale) {
    cell.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'inline-action';
    const label = document.createElement('label');
    label.className = 'small';
    label.textContent = '현금영수증 발급 건수';
    const countInput = document.createElement('input');
    countInput.type = 'number'; countInput.dataset.numberGroup = '';
    countInput.min = '0';
    countInput.max = String(Number(sale.quantity || 0));
    countInput.step = '1';
    countInput.value = String(Number(sale.receipt_issued_count || 0));
    countInput.setAttribute('aria-label', '현금영수증 발급 건수 수정');
    const amountLabel = document.createElement('label');
    amountLabel.className = 'small';
    amountLabel.textContent = '현금영수증 발급 금액';
    const amountInput = document.createElement('input');
    amountInput.type = 'number'; amountInput.dataset.numberGroup = '';
    amountInput.min = '0';
    amountInput.max = String(receiptBaseForSale(sale));
    amountInput.step = '1';
    amountInput.value = String(Number(sale.receipt_issued_amount || 0));
    amountInput.setAttribute('aria-label', '현금영수증 발급 금액 수정');
    amountLabel.append(amountInput);
    const preview = document.createElement('p');
    preview.className = 'small muted multiline';
    const updatePreview = () => {
      const quantity = Number(sale.quantity || 0);
      const issuedCount = Math.max(0, Math.min(quantity, Math.trunc(Number(ERPNumberInput.raw(countInput.value || 0)))));
      const receiptBase = receiptBaseForSale(sale);
      const issuedAmount = Math.max(0, Math.min(receiptBase, Math.trunc(Number(ERPNumberInput.raw(amountInput.value || 0)))));
      preview.textContent = `발급 ${issuedCount.toLocaleString('ko-KR')}건 · ${money(issuedAmount)}\n신청 없음 ${(quantity - issuedCount).toLocaleString('ko-KR')}건 · ${money(receiptBase - issuedAmount)}`;
    };
    countInput.addEventListener('input', () => {
      const count = Math.max(0, Math.min(Number(sale.quantity || 0), Math.trunc(Number(ERPNumberInput.raw(countInput.value || 0)))));
      amountInput.value = String(Number(sale.quantity || 0) > 0
        ? Math.round(receiptBaseForSale(sale) * count / Number(sale.quantity || 0))
        : 0);
      updatePreview();
    });
    amountInput.addEventListener('input', updatePreview);
    updatePreview();
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = '구분 저장';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = '취소';
    cancel.addEventListener('click', renderSales);
    save.addEventListener('click', async () => {
      if (operationBusy) return;
      const issuedCount = Math.trunc(Number(ERPNumberInput.raw(countInput.value || 0)));
      const issuedAmount = Math.trunc(Number(ERPNumberInput.raw(amountInput.value || 0)));
      if (issuedCount < 0 || issuedCount > Number(sale.quantity || 0)) {
        setOperationStatus('현금영수증 발급 건수를 판매 수량 안에서 입력해 주세요.', true);
        return;
      }
      if (issuedAmount < 0 || issuedAmount > receiptBaseForSale(sale)) {
        setOperationStatus('현금영수증 발급 금액을 참가자 직접 결제액 안에서 입력해 주세요.', true);
        return;
      }
      operationBusy = true;
      save.disabled = cancel.disabled = true;
      try {
        const result = await adjustRpc('update_sale_receipts', { sale_id: sale.id, issued_count: issuedCount, issued_amount: issuedAmount });
        applySaleAdjustment(result);
        setOperationStatus('현금영수증 구분과 회계전표 증빙 메모를 함께 수정했습니다.');
        await loadInventory();
      } catch (error) {
        setOperationStatus(readableError(error), true);
        renderSales();
      } finally {
        operationBusy = false;
      }
    });
    label.append(countInput);
    wrap.append(label, amountLabel, preview, save, cancel);
    cell.append(wrap);
    countInput.focus();
    countInput.select();
  }

  function beginExtraPaymentRefund(cell, sale) {
    const amount = Number(sale.overpayment_amount || 0);
    const supply = Math.round(amount / 1.1);
    const vat = amount - supply;
    cell.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'inline-action';
    const warning = document.createElement('p');
    warning.className = 'small';
    warning.textContent = `실제로 ${money(amount)}을 돌려준 뒤 처리해 주세요. 매출 ${money(supply)}과 부가세 ${money(vat)}가 함께 줄고 재고는 바뀌지 않습니다.`;
    const dateLabel = document.createElement('label');
    dateLabel.className = 'small';
    dateLabel.textContent = '실제 반환일';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = kstToday();
    dateInput.setAttribute('aria-label', '실제 반환일');
    dateLabel.append(dateInput);
    const accountLabel = document.createElement('label');
    accountLabel.className = 'small';
    accountLabel.textContent = '반환 수단';
    const accountSelect = document.createElement('select');
    accountSelect.setAttribute('aria-label', '반환 수단');
    [['보통예금', '계좌이체(보통예금)'], ['시재금', '현금 지급(시재금)']].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      accountSelect.append(option);
    });
    accountLabel.append(accountSelect);
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = '반환 완료·회계 처리';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = '취소';
    cancel.addEventListener('click', renderSales);
    save.addEventListener('click', async () => {
      if (operationBusy) return;
      if (!dateInput.value) {
        setOperationStatus('실제 반환일을 입력해 주세요.', true);
        dateInput.focus();
        return;
      }
      if (!window.confirm(`${sale.overpayment_name || '입금자'}에게 ${money(amount)}을 실제로 반환하셨나요?\n확인을 누르면 매출·부가세 반환 전표가 저장됩니다.`)) return;
      operationBusy = true;
      save.disabled = cancel.disabled = true;
      try {
        const result = await extraPaymentRpc('confirm_refund', {
          request_key: crypto.randomUUID(),
          sale_id: sale.id,
          refund_date: dateInput.value,
          refund_account: accountSelect.value
        });
        setOperationStatus(`${money(result.amount)} 반환을 확인했습니다. 매출 ${money(result.supply_amount)}과 부가세 ${money(result.vat_amount)}을 줄이는 회계전표를 저장했고 재고는 그대로 유지했습니다.`);
        await loadInventory();
      } catch (error) {
        setOperationStatus(readableError(error), true);
        renderSales();
      } finally {
        operationBusy = false;
      }
    });
    wrap.append(warning, dateLabel, accountLabel, save, cancel);
    cell.append(wrap);
    dateInput.focus();
  }

  function renderSales() {
    const rows = $('salesRows');
    rows.replaceChildren();
    const sales = selectedSales;
    sales.forEach((sale) => {
      const voucher = (voucherContext.items || []).find((item) => item.sale_id === sale.id);
      if (voucher) Object.assign(sale, voucher);
      const financial = sale;
      const listAmount = Number(financial.list_amount ?? (Number(sale.quantity || 0) * Number(sale.unit_price || 0)));
      const discountAmount = Number(financial.discount_amount || 0);
      const row = document.createElement('tr');
      const deposited = Number(sale.cash_deposited_amount || 0);
      const remaining = Math.max(0, Number(sale.cash_received || 0) - deposited);
      row.append(
        makeCell(sale.sale_date),
        makeCell(`${sale.event_name}\n${sale.item_name}`, 'multiline'),
        makeCell(`${Number(sale.quantity).toLocaleString('ko-KR')}개 × ${money(sale.unit_price)}\n정가 ${money(listAmount)}${discountAmount ? `\n할인 -${money(discountAmount)}` : ''}\n매출 ${money(sale.gross_amount)}`, 'multiline'),
        makeCell(`계좌 ${money(sale.bank_received)}\n현금 ${money(sale.cash_received)}${voucher ? `\n주관사 쿠폰 ${money(voucher.voucher_amount)}` : ''}`, 'multiline')
      );
      const receiptCell = makeCell(`발급 ${Number(sale.receipt_issued_count).toLocaleString('ko-KR')}건 · ${money(sale.receipt_issued_amount)}\n신청 없음 ${Number(sale.receipt_not_requested_count).toLocaleString('ko-KR')}건 · ${money(sale.receipt_not_requested_amount)}`, 'multiline');
      const editReceipt = document.createElement('button');
      editReceipt.type = 'button';
      editReceipt.className = 'secondary';
      editReceipt.textContent = '현금영수증 구분 수정';
      editReceipt.disabled = !editable;
      editReceipt.addEventListener('click', () => beginReceiptAllocationEdit(receiptCell, sale));
      receiptCell.append(document.createElement('br'), editReceipt);
      const extraPayment = extraPaymentBySaleId(sale.id);
      const extraPaymentCell = document.createElement('td');
      extraPaymentCell.className = 'multiline';
      if (Number(sale.overpayment_amount || 0) <= 0) {
        extraPaymentCell.textContent = '-';
      } else if (sale.overpayment_status === 'refunded') {
        extraPaymentCell.textContent = `${sale.overpayment_name}\n${money(sale.overpayment_amount)} · 반환 완료${extraPayment?.refund_date ? `\n${extraPayment.refund_date} · ${extraPayment.refund_account}` : ''}`;
        extraPaymentCell.classList.add('success-text');
      } else if (sale.overpayment_status === 'reclassified') {
        const summary = document.createElement('span');
        summary.textContent = `${sale.overpayment_name}\n${money(sale.overpayment_amount)} · 추가 매출 반영`;
        const refundButton = document.createElement('button');
        refundButton.type = 'button';
        refundButton.className = 'secondary';
        refundButton.textContent = '반환 확인';
        refundButton.disabled = !editable;
        refundButton.addEventListener('click', () => beginExtraPaymentRefund(extraPaymentCell, sale));
        extraPaymentCell.append(summary, document.createElement('br'), refundButton);
      } else {
        extraPaymentCell.textContent = `${sale.overpayment_name}\n${money(sale.overpayment_amount)} · 별도 확인 필요`;
      }
      row.append(receiptCell, extraPaymentCell);
      const actionCell = document.createElement('td');
      if (Number(sale.cash_received || 0) === 0) {
        actionCell.textContent = '현금 수납 없음';
      } else if (remaining === 0) {
        actionCell.textContent = `입금 완료 ${money(deposited)}`;
        actionCell.className = 'success-text';
      } else {
        const summary = document.createElement('p');
        summary.className = 'small';
        summary.textContent = `입금 ${money(deposited)} / 남음 ${money(remaining)}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '현금 통장입금 처리';
        button.disabled = !editable;
        button.addEventListener('click', () => beginDeposit(actionCell, sale, remaining));
        actionCell.append(summary, button);
      }
      row.append(actionCell);
      rows.append(row);
    });
    if (!sales.length) {
      const row = document.createElement('tr');
      const cell = makeCell('등록된 현금매출이 없습니다.');
      cell.colSpan = 7;
      row.append(cell);
      rows.append(row);
    }
    $('salesStatus').textContent = salesTotal ? `총 ${salesTotal.toLocaleString('ko-KR')}건 · ${(salesOffset + 1).toLocaleString('ko-KR')}–${(salesOffset + sales.length).toLocaleString('ko-KR')}건` : '';
    $('salesPrevious').hidden = salesOffset === 0;
    $('salesNext').hidden = salesOffset + sales.length >= salesTotal;
  }

  function renderVouchers() {
    const rows = $('voucherRows');
    rows.replaceChildren();
    const items = Array.isArray(voucherContext.items) ? voucherContext.items : [];
    items.forEach((item) => {
      const row = document.createElement('tr');
      row.append(
        makeCell(`${item.sale_date}\n${item.event_name}`, 'multiline'),
        makeCell(item.voucher_organizer),
        makeCell(`${Number(item.voucher_count).toLocaleString('ko-KR')}건 × ${money(item.voucher_unit_value)}\n${money(item.voucher_amount)}`, 'multiline'),
        makeCell(`입금 ${money(item.settled_amount)}\n미정산 ${money(item.outstanding_amount)}`, 'multiline')
      );
      const action = document.createElement('td');
      if (Number(item.outstanding_amount || 0) <= 0) {
        action.textContent = '정산 완료';
        action.className = 'success-text';
      } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '입금 확인';
        button.disabled = !editable;
        button.addEventListener('click', () => beginVoucherSettlement(action, item));
        action.append(button);
      }
      row.append(action);
      rows.append(row);
    });
    if (!items.length) {
      const row = document.createElement('tr');
      const cell = makeCell('쿠폰으로 등록한 매출이 없습니다.');
      cell.colSpan = 5;
      row.append(cell);
      rows.append(row);
    }
    $('vouchersStatus').textContent = vouchersTotal ? `총 ${vouchersTotal.toLocaleString('ko-KR')}건 · ${(vouchersOffset + 1).toLocaleString('ko-KR')}–${(vouchersOffset + items.length).toLocaleString('ko-KR')}건` : '';
    $('vouchersPrevious').hidden = vouchersOffset === 0;
    $('vouchersNext').hidden = vouchersOffset + items.length >= vouchersTotal;
  }

  function beginVoucherSettlement(cell, item) {
    cell.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'inline-action';
    const dateLabel = document.createElement('label');
    dateLabel.textContent = '실제 입금일';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = kstToday();
    dateLabel.append(dateInput);
    const amountLabel = document.createElement('label');
    amountLabel.textContent = '입금액';
    const amountInput = document.createElement('input');
    amountInput.type = 'number'; amountInput.dataset.numberGroup = '';
    amountInput.min = '1';
    amountInput.max = String(item.outstanding_amount);
    amountInput.step = '1';
    amountInput.value = String(item.outstanding_amount);
    amountLabel.append(amountInput);
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = '정산 입금 저장';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = '취소';
    cancel.addEventListener('click', renderVouchers);
    const requestKey = crypto.randomUUID();
    save.addEventListener('click', async () => {
      if (operationBusy) return;
      const amount = Math.trunc(Number(ERPNumberInput.raw(amountInput.value || 0)));
      if (!dateInput.value || amount <= 0 || amount > Number(item.outstanding_amount)) {
        setOperationStatus('실제 입금일과 미정산액 이하의 입금액을 확인해 주세요.', true);
        return;
      }
      if (!window.confirm(`${item.voucher_organizer}에서 ${money(amount)}을 실제로 입금했나요?\n확인을 누르면 미수금에서 보통예금으로 옮겨 기록합니다.`)) return;
      operationBusy = true;
      save.disabled = cancel.disabled = true;
      try {
        await voucherRpc('settle', {
          request_key: requestKey, sale_id: item.sale_id,
          settlement_date: dateInput.value, amount
        });
        setOperationStatus(`${money(amount)} 정산 입금을 저장했습니다. 새 매출은 만들지 않았습니다.`);
        await loadInventory();
      } catch (error) {
        setOperationStatus(readableError(error), true);
        save.disabled = cancel.disabled = false;
      } finally {
        operationBusy = false;
      }
    });
    wrap.append(dateLabel, amountLabel, save, cancel);
    cell.append(wrap);
    dateInput.focus();
  }

  function applySaleAdjustment(result) {
    if (!result?.sale_id) return;
    const sale = selectedSales.find((row) => row.id === result.sale_id);
    if (!sale) return;
    ['receipt_issued_count','receipt_issued_amount','receipt_not_requested_count','receipt_not_requested_amount'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(result, key)) sale[key] = result[key];
    });
    renderSales();
  }

  async function loadInventoryBase(preserveEdits = false) {
    const identity = identityRevision;
    const isCurrent = beginRead();
    const [nextInventory, nextExtraPayments, nextPurchases] = await Promise.all([
      rpc('bootstrap'),
      extraPaymentRpc('list'),
      purchaseReceiptRpc('list')
    ]);
    if (identity !== identityRevision || (preserveEdits && (!isCurrent() || hasInlineEditor()))) return;
    inventory = nextInventory; extraPaymentContext = nextExtraPayments; purchaseReceiptContext = nextPurchases;
    const receivingIds = new Set((purchaseReceiptContext.items || []).filter((row) => row.received_quantity === 0).map((row) => row.id));
    inventory.movements = (inventory.movements || []).filter((row) => !receivingIds.has(row.id));
    renderInventory();
    renderPurchaseReceipts();
    renderMovements();
    workspaceTools?.refreshItems();
  }

  async function loadInventory() {
    loadedPanels.clear();
    await loadInventoryBase();
    if (selectedEventId) await Promise.all([loadSales(), loadVouchers(),workspaceTools?.reloadInventory()]);
    await workspaceTools?.reloadDashboard();
  }

  async function loadSales(revision = scopeRevision) {
    if (!selectedEventId) return;
    const isCurrent = beginRead();
    const result = await recordsRpc('sales', { ...scopeData(), offset: salesOffset });
    if (revision !== scopeRevision || !isCurrent()) return false;
    selectedSales = result.items || []; salesTotal = Number(result.total || 0); renderSales();
    return true;
  }
  async function loadVouchers(revision = scopeRevision) {
    if (!selectedEventId) return;
    const isCurrent = beginRead();
    const result = await recordsRpc('vouchers', { ...scopeData(), offset: vouchersOffset });
    if (revision !== scopeRevision || !isCurrent()) return false;
    voucherContext = result; vouchersTotal = Number(result.total || 0); renderVouchers();
    return true;
  }

  function updateSaleSummary() {
    const quantity = intValue('saleQuantity');
    const unitPrice = intValue('saleUnitPrice');
    const listAmount = quantity * unitPrice;
    const discount = intValue('saleDiscount');
    const gross = Math.max(0, listAmount - discount);
    const voucherCount = intValue('voucherCount');
    const voucherUnitValue = intValue('voucherUnitValue');
    const voucherAmount = voucherCount * voucherUnitValue;
    const receiptBase = Math.max(0, gross - voucherAmount);
    const bank = intValue('saleBank');
    const cash = intValue('saleCash');
    const overpayment = intValue('overpaymentAmount');
    const issued = intValue('receiptIssuedAmount');
    const none = intValue('receiptNoneAmount');
    const discountOk = discount <= listAmount;
    const voucherOk = voucherCount <= quantity && voucherAmount <= gross
      && (voucherCount === 0 || ($('voucherOrganizer').value.trim() && voucherUnitValue > 0));
    const receivedOk = discountOk && voucherOk && bank + cash + voucherAmount === gross + overpayment;
    const receiptOk = issued + none === receiptBase;
    $('saleSummary').textContent = `정가 ${money(listAmount)} · 할인 ${money(discount)} · 매출 ${money(gross)}\n참가자 계좌 ${money(bank)} · 현장 현금 ${money(cash)}${voucherAmount ? ` · 주관사 쿠폰 미정산 ${money(voucherAmount)}` : ''}${overpayment ? ` · 추가 입금 ${money(overpayment)}` : ''}\n현금영수증 구분 ${money(issued + none)} (직접 결제액) · ${receivedOk && receiptOk ? '합계가 맞습니다.' : '합계를 확인해 주세요.'}`;
    $('saleSummary').classList.toggle('invalid', !(receivedOk && receiptOk));
    return { quantity, unitPrice, listAmount, discount, gross, bank, cash, voucherCount, voucherUnitValue, voucherAmount, overpayment, issued, none, valid: receivedOk && receiptOk };
  }

  function syncCashReceived() {
    const listAmount = intValue('saleQuantity') * intValue('saleUnitPrice');
    const discount = intValue('saleDiscount');
    const gross = Math.max(0, listAmount - discount);
    const voucherAmount = intValue('voucherCount') * intValue('voucherUnitValue');
    const totalReceived = Math.max(0, gross - voucherAmount) + intValue('overpaymentAmount');
    const bank = intValue('saleBank');
    $('saleCash').value = String(Math.max(0, totalReceived - bank));
  }

  function syncSaleReceiptAllocation(forceAmount = false) {
    const quantity = intValue('saleQuantity');
    const listAmount = quantity * intValue('saleUnitPrice');
    const gross = Math.max(0, listAmount - intValue('saleDiscount') - intValue('voucherCount') * intValue('voucherUnitValue'));
    const issuedInput = $('receiptIssuedCount');
    const enteredIssuedCount = intValue('receiptIssuedCount');
    const issuedCount = Math.min(quantity, enteredIssuedCount);
    issuedInput.max = String(quantity);
    if (enteredIssuedCount !== issuedCount) issuedInput.value = String(issuedCount);
    $('receiptIssuedAmount').max = String(gross);
    if (forceAmount || !receiptAmountEdited) {
      $('receiptIssuedAmount').value = String(quantity > 0 ? Math.round(gross * issuedCount / quantity) : 0);
    } else if (intValue('receiptIssuedAmount') > gross) {
      $('receiptIssuedAmount').value = String(gross);
    }
    $('receiptNoneCount').value = String(quantity - issuedCount);
    $('receiptNoneAmount').value = String(Math.max(0, gross - intValue('receiptIssuedAmount')));
    return updateSaleSummary();
  }

  ['saleBank','overpaymentAmount','voucherCount','voucherUnitValue'].forEach((id) => {
    $(id).addEventListener('input', () => { syncCashReceived(); syncSaleReceiptAllocation(); });
  });
  $('voucherOrganizer').addEventListener('input', updateSaleSummary);
  ['saleQuantity','saleUnitPrice','saleDiscount'].forEach((id) => {
    $(id).addEventListener('input', () => { syncCashReceived(); syncSaleReceiptAllocation(); });
  });
  $('receiptIssuedCount').addEventListener('input', () => { receiptAmountEdited = false; syncSaleReceiptAllocation(true); });
  $('receiptIssuedAmount').addEventListener('input', () => { receiptAmountEdited = true; syncSaleReceiptAllocation(); });

  $('saleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (operationBusy || eventBusy || !editable) return;
    const form = event.currentTarget;
    syncCashReceived();
    const summary = syncSaleReceiptAllocation();
    const overpaymentName = $('overpaymentName').value.trim();
    if (!summary.valid) return setOperationStatus('판매액·쿠폰 정산액·직접 수납액·현금영수증 구분 합계를 확인해 주세요.', true);
    if (summary.overpayment > 0 && !overpaymentName) return setOperationStatus('추가 입금자명을 입력해 주세요.', true);
    if (summary.overpayment === 0 && overpaymentName) return setOperationStatus('추가 입금 금액이 없으면 입금자명도 비워 주세요.', true);
    operationBusy = true;
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      if (!eventById(selectedEventId)?.is_active || eventById(selectedEventId)?.no_cash_sales) return setOperationStatus('체험비를 받는 축제를 먼저 선택해 주세요.', true);
      const data = {
        event_id: selectedEventId, item_id: $('saleItem').value,
        quantity: summary.quantity, unit_price: summary.unitPrice, discount_amount: summary.discount,
        bank_received: summary.bank, cash_received: summary.cash,
        voucher_count: summary.voucherCount, voucher_unit_value: summary.voucherCount ? summary.voucherUnitValue : 0,
        voucher_organizer: summary.voucherCount ? $('voucherOrganizer').value.trim() : '',
        receipt_issued_count: intValue('receiptIssuedCount'), receipt_issued_amount: summary.issued,
        receipt_not_requested_count: intValue('receiptNoneCount'), receipt_not_requested_amount: summary.none,
        overpayment_amount: summary.overpayment, overpayment_name: overpaymentName,
        note: $('saleNote').value.trim()
      };
      const fingerprint = JSON.stringify(data);
      if (pendingSaleRequestKey?.fingerprint !== fingerprint) pendingSaleRequestKey = { fingerprint, key: crypto.randomUUID() };
      await registerSaleRpc({ ...data, request_key: pendingSaleRequestKey.key });
      pendingSaleRequestKey = null;
      setOperationStatus('매출·회계전표·재고 출고를 함께 저장했습니다. 쿠폰 금액은 정산 입금 전까지 미수금으로 표시됩니다.');
      form.reset();
      saleDrafts.delete(selectedEventId);
      ['saleDiscount','saleBank','saleCash','voucherCount','receiptIssuedCount','receiptIssuedAmount','receiptNoneCount','receiptNoneAmount','overpaymentAmount'].forEach((id) => { $(id).value = '0'; });
      $('voucherUnitValue').value = '3000';
      receiptAmountEdited = false;
      syncSaleReceiptAllocation();
      await loadInventory();
    } catch (error) {
      setOperationStatus(readableError(error), true);
    } finally {
      operationBusy = false;
      if (button) button.disabled = false;
    }
  });

  $('eventForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (operationBusy || eventBusy || receiptBusy || incomeController?.isBusy() || !editable) return;
    operationBusy = true;
    $('closeEventDialog').disabled = true;
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const result = await eventRpc('create', {
        event_date: $('newEventDate').value,
        event_name: $('newEventName').value.trim()
      });
      const id = result?.event?.id || '';
      await loadEventContext(id);
      operationBusy = false;
      await selectEvent(id);
      $('newEventName').value = '';
      eventDialog.close();
      setOperationStatus('행사를 등록했습니다. 선택한 축제의 재료비·매출·정산을 관리할 수 있습니다.');
    } catch (error) {
      $('eventStatus').textContent = readableError(error);
      $('eventStatus').classList.add('error');
    } finally {
      operationBusy = false;
      $('closeEventDialog').disabled = false;
      if (button) button.disabled = false;
    }
  });

  $('itemForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (operationBusy || !editable) return;
    operationBusy = true;
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      await rpc('create_item', { name: $('newItemName').value.trim(), unit: $('newItemUnit').value.trim() });
      setOperationStatus('물품을 등록했습니다. 다음 지출결의부터 입고 물품으로 선택할 수 있습니다.');
      $('newItemName').value = '';
      await loadInventory();
    } catch (error) {
      setOperationStatus(readableError(error), true);
    } finally {
      operationBusy = false;
      if (button) button.disabled = false;
    }
  });

  $('movementForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (operationBusy || !editable) return;
    operationBusy = true;
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      await rpc('register_movement', {
        request_key: crypto.randomUUID(), movement_date: $('movementDate').value,
        item_id: $('movementItem').value, movement_type: $('movementType').value,
        quantity: intValue('movementQuantity'), note: $('movementNote').value.trim()
      });
      setOperationStatus('재고 변동을 저장했습니다.');
      $('movementQuantity').value = '';
      $('movementNote').value = '';
      await loadInventory();
    } catch (error) {
      setOperationStatus(readableError(error), true);
    } finally {
      operationBusy = false;
      if (button) button.disabled = false;
    }
  });

  async function receiptSaleCandidates(item) {
    const all = [];
    for (let page = 0; ; page += 100) {
      const result = await recordsRpc('receipt_candidates', { receipt_id: item.id, offset: page });
      all.push(...result.items);
      if (page + result.items.length >= result.total || !result.items.length) return all;
    }
  }

  function saleCandidateLabel(sale) {
    return `${sale.sale_date} · ${sale.event_name} · ${sale.item_name} (${money(sale.unit_price)}/개)`;
  }

  function renderReceipts() {
    const rows = $('receiptRows');
    rows.replaceChildren();
    receipts.forEach((item) => {
      const row = document.createElement('tr');
      const link = item.event_id ? item : receiptLink(item.id);
      const linkedEvent = eventById(link?.event_id);
      row.append(
        makeCell(dateTime(item.created_at)),
        makeCell(linkedEvent ? `${linkedEvent.event_date}\n${linkedEvent.event_name}` : '행사 미지정', 'multiline'),
        makeCell(item.depositor_name),
        makeCell(money(item.amount)),
        makeCell(item.phone)
      );
      const cell = document.createElement('td');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = item.issued_at ? 'secondary' : '';
      button.textContent = item.issued_at ? '발급 완료 · 되돌리기' : '발급 완료로 표시';
      button.disabled = !editable;
      button.addEventListener('click', async () => {
        if (receiptBusy || eventBusy || button.hidden) return;
        const revision = scopeRevision;
        receiptBusy = true; button.disabled = true;
        let candidates;
        try { candidates = item.issued_at ? [] : await receiptSaleCandidates(item); }
        catch (error) { $('adminStatus').textContent = readableError(error); return; }
        finally { receiptBusy = false; button.disabled = !editable; }
        if (revision !== scopeRevision || button.hidden) return;
        const confirmBox = document.createElement('div');
        const message = document.createElement('p');
        const yes = document.createElement('button');
        const no = document.createElement('button');
        let saleSelect = null;
        message.textContent = item.issued_at
          ? '미처리 상태로 되돌릴까요? 연결된 매출의 현금영수증 구분도 함께 되돌아갑니다.'
          : '실제 현금영수증 발급을 마치셨나요? 연결된 매출의 발급·미발급 금액도 함께 수정됩니다.';
        confirmBox.append(message);
        if (!item.issued_at && candidates.length === 1) {
          const linked = document.createElement('p');
          linked.className = 'small muted';
          linked.textContent = `연결할 매출: ${saleCandidateLabel(candidates[0])}`;
          confirmBox.append(linked);
        } else if (!item.issued_at && candidates.length > 1) {
          const selectLabel = document.createElement('label');
          selectLabel.className = 'small';
          selectLabel.textContent = '연결할 매출';
          saleSelect = document.createElement('select');
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = '매출을 선택해 주세요';
          saleSelect.append(placeholder);
          candidates.forEach((sale) => {
            const option = document.createElement('option');
            option.value = sale.id;
            option.textContent = saleCandidateLabel(sale);
            saleSelect.append(option);
          });
          selectLabel.append(saleSelect);
          confirmBox.append(selectLabel);
        } else if (!item.issued_at && candidates.length === 0) {
          const warning = document.createElement('p');
          warning.className = 'small error';
          warning.textContent = '신청 금액과 맞고 `신청 없음` 잔액이 남은 매출을 찾지 못했습니다. 등록된 매출을 먼저 확인해 주세요.';
          confirmBox.append(warning);
        }
        yes.type = no.type = 'button';
        yes.textContent = item.issued_at ? '예, 미처리로 되돌리기' : '예, 발급을 마쳤어요';
        no.textContent = '취소';
        no.className = 'secondary';
        no.addEventListener('click', () => { confirmBox.remove(); button.hidden = false; button.focus(); });
        if (!item.issued_at && candidates.length === 0) yes.disabled = true;
        yes.addEventListener('click', async () => {
          if (receiptBusy) return;
          const selectedSaleId = item.issued_at
            ? null
            : (candidates.length === 1 ? candidates[0].id : String(saleSelect?.value || '').trim());
          if (!item.issued_at && !selectedSaleId) {
            $('adminStatus').textContent = '현금영수증을 연결할 매출을 선택해 주세요.';
            saleSelect?.focus();
            return;
          }
          receiptBusy = true;
          yes.disabled = no.disabled = true;
          try {
            const wasIssued = Boolean(item.issued_at);
            const result = await adjustRpc(wasIssued ? 'mark_pending' : 'mark_issued', {
              id: item.id,
              ...(selectedSaleId ? { sale_id: selectedSaleId } : {})
            });
            applySaleAdjustment(result);
            item.issued_at = wasIssued ? null : new Date().toISOString();
            renderReceipts();
            $('adminStatus').textContent = wasIssued
              ? '미처리 상태와 연결 매출의 현금영수증 구분을 함께 되돌렸습니다.'
              : `발급 완료로 저장했습니다. 위 매출도 발급 ${Number(result?.receipt_issued_count || 0).toLocaleString('ko-KR')}건으로 바뀌었고 회계 증빙 메모도 함께 정리했습니다.`;
            await loadInventory();
            await loadEventContext(selectedEventId);
            await loadReceipts();
          } catch (error) {
            $('adminStatus').textContent = readableError(error);
            no.disabled = false;
            yes.disabled = !item.issued_at && candidates.length === 0;
          } finally {
            receiptBusy = false;
          }
        });
        confirmBox.append(yes, no);
        cell.append(confirmBox);
        button.hidden = true;
        yes.focus();
      });
      cell.append(button);
      row.append(cell);
      rows.append(row);
    });
    $('countTitle').textContent = `현금영수증 신청 내역 · ${receiptTotal.toLocaleString('ko-KR')}건`;
    $('previous').hidden = offset === 0;
    $('next').hidden = offset + receipts.length >= receiptTotal;
  }

  async function loadReceipts(revision = scopeRevision) {
    if (!selectedEventId) return;
    const isCurrent = beginRead();
    const result = await recordsRpc('receipts', { ...scopeData(), offset });
    if (revision !== scopeRevision || !isCurrent()) return false;
    receipts = result.items;
    receiptTotal = result.total;
    renderReceipts();
    if ($('adminStatus').textContent === '접수된 신청이 없습니다.') $('adminStatus').textContent = '';
    return true;
  }

  async function reloadReceipts() {
    if (receiptBusy || eventBusy) return;
    receiptBusy = true;
    $('refreshReceipts').disabled = true;
    try {
      $('adminStatus').textContent = '';
      await loadReceipts();
    } catch (error) {
      $('adminStatus').textContent = readableError(error);
    } finally {
      receiptBusy = false;
      $('refreshReceipts').disabled = false;
    }
  }

  $('refresh').addEventListener('click', async () => {
    if (operationBusy) return;
    operationBusy = true;
    $('refresh').disabled = true;
    try { await loadInventory(); setOperationStatus('최신 매출과 재고를 불러왔습니다.'); }
    catch (error) { setOperationStatus(readableError(error), true); }
    finally { operationBusy = false; $('refresh').disabled = false; }
  });
  $('refreshReceipts').addEventListener('click', reloadReceipts);
  async function pageReceipts(direction) {
    if (receiptBusy || eventBusy) return;
    const previousOffset = offset;
    offset = Math.max(0, offset + direction * 100);
    receiptBusy = true;
    $('previous').disabled = $('next').disabled = true;
    try { await loadReceipts(); }
    catch (error) { offset = previousOffset; $('adminStatus').textContent = readableError(error); }
    finally { receiptBusy = false; $('previous').disabled = $('next').disabled = false; }
  }
  $('previous').addEventListener('click', () => { void pageReceipts(-1); });
  $('next').addEventListener('click', () => { void pageReceipts(1); });
  function pageRecords(kind, direction) {
    if (operationBusy || receiptBusy || eventBusy) return;
    eventBusy = true; $('saleEvent').disabled = true;
    const previousOffset = kind === 'sales' ? salesOffset : vouchersOffset;
    if (kind === 'sales') salesOffset = Math.max(0, salesOffset + direction * 100);
    else vouchersOffset = Math.max(0, vouchersOffset + direction * 100);
    (kind === 'sales' ? loadSales() : loadVouchers()).catch((error) => {
      if (kind === 'sales') salesOffset = previousOffset;
      else vouchersOffset = previousOffset;
      setOperationStatus(readableError(error), true);
    })
      .finally(() => { eventBusy = false; $('saleEvent').disabled = false; });
  }
  $('salesPrevious').addEventListener('click', () => pageRecords('sales', -1));
  $('salesNext').addEventListener('click', () => pageRecords('sales', 1));
  $('vouchersPrevious').addEventListener('click', () => pageRecords('vouchers', -1));
  $('vouchersNext').addEventListener('click', () => pageRecords('vouchers', 1));
  $('exportCsv').addEventListener('click', async () => {
    if (receiptBusy || eventBusy || !selectedEventId) return;
    receiptBusy = true;
    $('exportCsv').disabled = true;
    try {
      const all = [];
      for (let page = 0; page < receiptTotal; page += 100) {
        const data = await recordsRpc('receipts', { ...scopeData(), offset: page });
        all.push(...data.items);
        if (!data.items.length) break;
      }
      const cell = (value) => `"${String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
      const lines = [['신청일시','행사일','행사명','입금자명','입금액','전화번호','발급상태'], ...all.map((item) => {
        const linkedEvent = eventById(item.event_id || receiptLink(item.id)?.event_id);
        return [dateTime(item.created_at),linkedEvent?.event_date || '',linkedEvent?.event_name || '',item.depositor_name,item.amount,`'${item.phone}`,item.issued_at ? '발급 완료' : '미처리'];
      })];
      const url = URL.createObjectURL(new Blob([`\uFEFF${lines.map((row) => row.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      const name = eventById(selectedEventId)?.event_name || '행사 미지정';
      anchor.download = `${name.replace(/[\\/:*?"<>|]/g, '_')}_현금영수증신청.csv`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('adminStatus').textContent = '다운로드한 파일에는 개인정보가 있습니다. 발급 처리 후 안전하게 삭제해 주세요.';
    } catch (error) {
      $('adminStatus').textContent = readableError(error);
    } finally {
      receiptBusy = false;
      $('exportCsv').disabled = false;
    }
  });

  $('paymentAccountForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!editable||operationBusy||!$('paymentAccountForm').reportValidity())return;
    operationBusy=true;const button=$('paymentAccountForm').querySelector('button');button.disabled=true;
    try{
      const {error}=await client.rpc('festival_payment_settings_admin',{p_action:'save',p_data:{
        bank_name:$('paymentBank').value.trim(),account_number:$('paymentAccount').value.trim(),account_holder:$('paymentHolder').value.trim()
      }});
      if(error)throw new Error(error.message);
      $('paymentAccountStatus').textContent='입금 안내 계좌를 저장했습니다.';$('paymentAccountSettings').open=false;
    }catch(error){$('paymentAccountStatus').textContent=readableError(error);}
    finally{operationBusy=false;button.disabled=!editable;}
  });
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (session?.user?.id && taskUserId && session.user.id !== taskUserId)) {
      identityRevision++; scopeRevision++; tabsReady = false; loadedPanels.clear();
      $('adminPanel').hidden = true;
      $('openEventDialog').disabled = true;
      if (eventDialog.open) eventDialog.close();
      workspaceTools?.close();
      $('accessStatus').textContent = '로그아웃되었습니다. 다시 로그인해 주세요.';
    }
  });

  (async () => {
    $('newEventDate').value = kstToday();
    $('movementDate').value = kstToday();
    syncCashReceived();
    syncSaleReceiptAllocation();
    try {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) {
        $('accessStatus').textContent = 'ERP에 로그인한 뒤 이용해 주세요.';
        $('loginLink').href = `index.html?next=${encodeURIComponent(location.href)}`;
        $('loginLink').hidden = false;
        return;
      }
      taskUserId = data.user.id;
      const initialIdentity = identityRevision;
      const access = await rpc('access');
      void window.ErpWorkspace?.connect(client);
      editable = access.editable === true;
      $('coopName').textContent=access.coop_name||'';
      document.title='매출·재고·현금영수증 관리'+(access.coop_name?' | '+access.coop_name:'');
      paymentGuideBase=access.payment_url||'';
      const [accountResult] = await Promise.all([
        client.rpc('festival_payment_settings_admin',{p_action:'get',p_data:{}}),
        loadInventoryBase(), loadEventContext()
      ]);
      if (initialIdentity !== identityRevision) return;
      if(accountResult.error)throw new Error(accountResult.error.message);
      const bank=accountResult.data||{};
      $('paymentBank').value=bank.bank_name||'';$('paymentAccount').value=bank.account_number||'';$('paymentHolder').value=bank.account_holder||'';
      $('paymentAccountForm').querySelectorAll('input,button').forEach(el=>{el.disabled=!editable;});
      $('paymentAccountStatus').textContent=bank.account_number?'':'입금 안내에 사용할 계좌를 등록해 주세요.';
      $('openEventDialog').disabled = !editable;
      $('accessStatus').textContent = editable ? '' : '조회 권한으로 열었습니다. 등록과 상태 변경은 회계 등록 권한이 필요합니다.';
      $('adminPanel').hidden = false;
      $('saleForm').querySelectorAll('input,select,button').forEach((element) => { element.disabled = !editable; });
      $('eventForm').querySelectorAll('input,button').forEach((element) => { element.disabled = !editable; });
      $('itemForm').querySelectorAll('input,button').forEach((element) => { element.disabled = !editable; });
      $('movementForm').querySelectorAll('input,select,button').forEach((element) => { element.disabled = !editable; });
      workspaceTools=window.FestivalWorkspaceTools.init({rpc:operationsRpc,getEvent:()=>eventById(selectedEventId),getItems:()=>inventory.items||[],editable,
        beginRead,
        isBusy:()=>operationBusy||eventBusy||receiptBusy||incomeController?.isBusy(),
        onChanged:async id=>{await loadEventContext(id);await selectEvent(id,true);await workspaceTools.reloadDashboard();},
        onStockChanged:loadInventory,readable:readableError,status:setOperationStatus,today:kstToday});
      incomeController = window.FestivalIncome.init({
        root: $('festivalIncomeRoot'),
        editable,
        beginRead,
        getEvents: () => eventContext.events || [],
        getSelectedEvent: () => eventById(selectedEventId),
        rpc: async (action, data) => {
          if (action === 'list') return recordsRpc('income', data);
          const result = await client.rpc('festival_income_admin', { p_action: action, p_data: data });
          if (result.error) throw new Error(result.error.message);
          await workspaceTools.reloadDashboard();
          return result.data;
        }
      });
      await incomeController.ready;
      tabsReady = true;
      await Promise.all([selectEvent($('saleEvent').value), workspaceTools.reloadDashboard()]);
      window.ErpWorkspaceResume.register({busy:()=>operationBusy||eventBusy||receiptBusy||incomeController?.isBusy()||workspaceTools?.isBusy()||hasInlineEditor(),
        authorize:async()=>{const access=await rpc('access');return access.allowed===true&&access.editable===editable;},
        refresh:async()=>{
          loadedPanels.clear();
          await Promise.all([
            loadInventoryBase(true), incomeController.refresh(), workspaceTools.reloadInventory(false,{strict:true}),
            workspaceTools.reloadDashboard({strict:true}), ensurePanel(activePanelId(),true),
            ...(eventById(selectedEventId)?.no_cash_sales ? ['salesPanel','voucherPanel','receiptsPanel'].map(panel=>ensurePanel(panel,true)) : [])
          ]);
          syncEventHeading();
        }});
    } catch (error) {
      $('accessStatus').textContent = readableError(error);
    }
  })();
})();
