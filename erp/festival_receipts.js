/* v2.2.0 - Extra-payment sale reclassification and idempotent refund confirmation. */
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
  const intValue = (id) => Math.max(0, Math.trunc(Number($(id)?.value || 0)));
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
  let editable = false;
  let operationBusy = false;
  let receiptBusy = false;
  let receiptAmountEdited = false;

  function setOperationStatus(message, error = false) {
    $('operationStatus').textContent = message || '';
    $('operationStatus').classList.toggle('error', error);
  }

  function readableError(error) {
    const message = String(error?.message || error || '처리하지 못했습니다.');
    if (message.includes('ADMIN_REQUIRED')) return '관리 권한이 없습니다.';
    if (message.includes('EDIT_REQUIRED')) return '회계 등록 권한이 없습니다.';
    if (message.includes('INSUFFICIENT_STOCK')) return '현재 재고보다 많은 수량을 출고할 수 없습니다.';
    if (message.includes('INVALID_SALE_TOTAL')) return '판매액·수납액·현금영수증 구분 합계를 다시 확인해 주세요.';
    if (message.includes('INVALID_DEPOSIT_AMOUNT')) return '입금 처리할 수 있는 현금 잔액을 초과했습니다.';
    if (message.includes('INVALID_RECEIPT_COUNT')) return '현금영수증 발급 건수는 0건부터 판매 수량까지 입력할 수 있습니다.';
    if (message.includes('INVALID_RECEIPT_AMOUNT')) return '현금영수증 발급 금액을 실제 매출액 안에서 확인해 주세요.';
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
    return `../festival_print.html?${params.toString()}`;
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
    const rows = $('eventRows');
    rows.replaceChildren();
    events.forEach((event) => {
      const row = document.createElement('tr');
      const links = document.createElement('td');
      const toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      toolbar.append(
        makePosterLink(event, 'open', '체험 안내'),
        makePosterLink(event, 'closed', '체험 마감'),
        makePosterLink(event, 'flow', '발전 원리')
      );
      links.append(toolbar);
      row.append(makeCell(event.event_date), makeCell(event.event_name), links);
      rows.append(row);
    });
    if (!events.length) {
      const row = document.createElement('tr');
      const cell = makeCell('등록된 행사가 없습니다. 위에서 행사명과 날짜를 먼저 등록해 주세요.');
      cell.colSpan = 3;
      row.append(cell);
      rows.append(row);
    }

    const select = $('saleEvent');
    const previous = preferredId || select.value;
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = events.length ? '행사를 선택해 주세요' : '먼저 행사를 등록해 주세요';
    select.append(placeholder);
    events.filter((event) => event.is_active).forEach((event) => {
      const option = document.createElement('option');
      option.value = event.id;
      option.textContent = `${event.event_date} · ${event.event_name}`;
      select.append(option);
    });
    if (events.some((event) => event.id === previous && event.is_active)) select.value = previous;
    else if (events.length === 1 && events[0].is_active) select.value = events[0].id;
  }

  async function loadEventContext(preferredId = '') {
    eventContext = await eventRpc('bootstrap');
    renderEvents(preferredId);
    renderSales();
    renderReceipts();
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
      card.append(title, stock, detail);
      cards.append(card);
    });
    const active = items.filter((item) => item.is_active);
    fillItemSelect($('saleItem'), active);
    fillItemSelect($('movementItem'), active);
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
    amountInput.type = 'number';
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
      const amount = Math.trunc(Number(amountInput.value || 0));
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
    countInput.type = 'number';
    countInput.min = '0';
    countInput.max = String(Number(sale.quantity || 0));
    countInput.step = '1';
    countInput.value = String(Number(sale.receipt_issued_count || 0));
    countInput.setAttribute('aria-label', '현금영수증 발급 건수 수정');
    const amountLabel = document.createElement('label');
    amountLabel.className = 'small';
    amountLabel.textContent = '현금영수증 발급 금액';
    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.min = '0';
    amountInput.max = String(Number(sale.gross_amount || 0));
    amountInput.step = '1';
    amountInput.value = String(Number(sale.receipt_issued_amount || 0));
    amountInput.setAttribute('aria-label', '현금영수증 발급 금액 수정');
    amountLabel.append(amountInput);
    const preview = document.createElement('p');
    preview.className = 'small muted multiline';
    const updatePreview = () => {
      const quantity = Number(sale.quantity || 0);
      const issuedCount = Math.max(0, Math.min(quantity, Math.trunc(Number(countInput.value || 0))));
      const issuedAmount = Math.max(0, Math.min(Number(sale.gross_amount || 0), Math.trunc(Number(amountInput.value || 0))));
      preview.textContent = `발급 ${issuedCount.toLocaleString('ko-KR')}건 · ${money(issuedAmount)}\n신청 없음 ${(quantity - issuedCount).toLocaleString('ko-KR')}건 · ${money(Number(sale.gross_amount || 0) - issuedAmount)}`;
    };
    countInput.addEventListener('input', () => {
      const count = Math.max(0, Math.min(Number(sale.quantity || 0), Math.trunc(Number(countInput.value || 0))));
      amountInput.value = String(Number(sale.quantity || 0) > 0
        ? Math.round(Number(sale.gross_amount || 0) * count / Number(sale.quantity || 0))
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
      const issuedCount = Math.trunc(Number(countInput.value || 0));
      const issuedAmount = Math.trunc(Number(amountInput.value || 0));
      if (issuedCount < 0 || issuedCount > Number(sale.quantity || 0)) {
        setOperationStatus('현금영수증 발급 건수를 판매 수량 안에서 입력해 주세요.', true);
        return;
      }
      if (issuedAmount < 0 || issuedAmount > Number(sale.gross_amount || 0)) {
        setOperationStatus('현금영수증 발급 금액을 실제 매출액 안에서 입력해 주세요.', true);
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
    const sales = Array.isArray(inventory.sales) ? inventory.sales : [];
    sales.forEach((sale) => {
      const financial = saleLink(sale.id) || {};
      const listAmount = Number(financial.list_amount ?? (Number(sale.quantity || 0) * Number(sale.unit_price || 0)));
      const discountAmount = Number(financial.discount_amount || 0);
      const row = document.createElement('tr');
      const deposited = Number(sale.cash_deposited_amount || 0);
      const remaining = Math.max(0, Number(sale.cash_received || 0) - deposited);
      row.append(
        makeCell(sale.sale_date),
        makeCell(`${sale.event_name}\n${sale.item_name}`, 'multiline'),
        makeCell(`${Number(sale.quantity).toLocaleString('ko-KR')}개 × ${money(sale.unit_price)}\n정가 ${money(listAmount)}${discountAmount ? `\n할인 -${money(discountAmount)}` : ''}\n매출 ${money(sale.gross_amount)}`, 'multiline'),
        makeCell(`계좌 ${money(sale.bank_received)}\n현금 ${money(sale.cash_received)}`, 'multiline')
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
  }

  function applySaleAdjustment(result) {
    if (!result?.sale_id) return;
    const sale = (inventory.sales || []).find((row) => row.id === result.sale_id);
    if (!sale) return;
    ['receipt_issued_count','receipt_issued_amount','receipt_not_requested_count','receipt_not_requested_amount'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(result, key)) sale[key] = result[key];
    });
    renderSales();
  }

  async function loadInventory() {
    [inventory, extraPaymentContext] = await Promise.all([
      rpc('bootstrap'),
      extraPaymentRpc('list')
    ]);
    renderInventory();
    renderSales();
    renderMovements();
  }

  function updateSaleSummary() {
    const quantity = intValue('saleQuantity');
    const unitPrice = intValue('saleUnitPrice');
    const listAmount = quantity * unitPrice;
    const discount = intValue('saleDiscount');
    const gross = Math.max(0, listAmount - discount);
    const bank = intValue('saleBank');
    const cash = intValue('saleCash');
    const overpayment = intValue('overpaymentAmount');
    const issued = intValue('receiptIssuedAmount');
    const none = intValue('receiptNoneAmount');
    const discountOk = discount <= listAmount;
    const receivedOk = discountOk && bank + cash === gross + overpayment;
    const receiptOk = issued + none === gross;
    $('saleSummary').textContent = `정가 ${money(listAmount)} · 할인 ${money(discount)} · 실제 매출 ${money(gross)}\n계좌 ${money(bank)} · 현장 현금 ${money(cash)}${overpayment ? ` · 추가 입금 ${money(overpayment)}` : ''}\n현금영수증 구분 ${money(issued + none)} · ${receivedOk && receiptOk ? '합계가 맞습니다.' : '합계를 확인해 주세요.'}`;
    $('saleSummary').classList.toggle('invalid', !(receivedOk && receiptOk));
    return { quantity, unitPrice, listAmount, discount, gross, bank, cash, overpayment, issued, none, valid: receivedOk && receiptOk };
  }

  function syncCashReceived() {
    const listAmount = intValue('saleQuantity') * intValue('saleUnitPrice');
    const discount = intValue('saleDiscount');
    const gross = Math.max(0, listAmount - discount);
    const totalReceived = gross + intValue('overpaymentAmount');
    const bank = intValue('saleBank');
    $('saleCash').value = String(Math.max(0, totalReceived - bank));
  }

  function syncSaleReceiptAllocation(forceAmount = false) {
    const quantity = intValue('saleQuantity');
    const listAmount = quantity * intValue('saleUnitPrice');
    const gross = Math.max(0, listAmount - intValue('saleDiscount'));
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

  ['saleBank','overpaymentAmount'].forEach((id) => {
    $(id).addEventListener('input', () => { syncCashReceived(); syncSaleReceiptAllocation(); });
  });
  ['saleQuantity','saleUnitPrice','saleDiscount'].forEach((id) => {
    $(id).addEventListener('input', () => { syncCashReceived(); syncSaleReceiptAllocation(); });
  });
  $('receiptIssuedCount').addEventListener('input', () => { receiptAmountEdited = false; syncSaleReceiptAllocation(true); });
  $('receiptIssuedAmount').addEventListener('input', () => { receiptAmountEdited = true; syncSaleReceiptAllocation(); });

  $('saleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (operationBusy || !editable) return;
    syncCashReceived();
    const summary = syncSaleReceiptAllocation();
    const overpaymentName = $('overpaymentName').value.trim();
    if (!summary.valid) return setOperationStatus('판매액·수납액·현금영수증 구분 합계를 맞춰 주세요.', true);
    if (summary.overpayment > 0 && !overpaymentName) return setOperationStatus('추가 입금자명을 입력해 주세요.', true);
    if (summary.overpayment === 0 && overpaymentName) return setOperationStatus('추가 입금 금액이 없으면 입금자명도 비워 주세요.', true);
    operationBusy = true;
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const selectedEventId = $('saleEvent').value;
      if (!selectedEventId) return setOperationStatus('행사를 먼저 선택해 주세요.', true);
      await registerSaleRpc({
        request_key: crypto.randomUUID(), event_id: selectedEventId, item_id: $('saleItem').value,
        quantity: summary.quantity, unit_price: summary.unitPrice, discount_amount: summary.discount,
        bank_received: summary.bank, cash_received: summary.cash,
        receipt_issued_count: intValue('receiptIssuedCount'), receipt_issued_amount: summary.issued,
        receipt_not_requested_count: intValue('receiptNoneCount'), receipt_not_requested_amount: summary.none,
        overpayment_amount: summary.overpayment, overpayment_name: overpaymentName,
        note: $('saleNote').value.trim()
      });
      setOperationStatus('매출·회계전표·재고 출고를 함께 저장했습니다.');
      event.currentTarget.reset();
      $('saleEvent').value = selectedEventId;
      ['saleDiscount','saleBank','saleCash','receiptIssuedCount','receiptIssuedAmount','receiptNoneCount','receiptNoneAmount','overpaymentAmount'].forEach((id) => { $(id).value = '0'; });
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
    if (operationBusy || !editable) return;
    operationBusy = true;
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const result = await eventRpc('create', {
        event_date: $('newEventDate').value,
        event_name: $('newEventName').value.trim()
      });
      $('eventStatus').classList.remove('error');
      $('eventStatus').textContent = '행사를 등록했습니다. 매출 입력과 행사별 인쇄물에서 선택할 수 있습니다.';
      $('newEventName').value = '';
      await loadEventContext(result?.event?.id || '');
    } catch (error) {
      $('eventStatus').textContent = readableError(error);
      $('eventStatus').classList.add('error');
    } finally {
      operationBusy = false;
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

  function receiptSaleCandidates(item) {
    const amount = Number(item.amount || 0);
    const link = receiptLink(item.id);
    const eventId = link?.event_id || null;
    const requestedQuantity = Number(link?.item_quantity || 0);
    return (Array.isArray(inventory.sales) ? inventory.sales : []).filter((sale) => {
      const unitPrice = Number(sale.unit_price || 0);
      const units = requestedQuantity > 0
        ? requestedQuantity
        : (unitPrice > 0 && amount % unitPrice === 0 ? amount / unitPrice : 0);
      const saleEventId = saleLink(sale.id)?.event_id || null;
      return units > 0
        && (!eventId || saleEventId === eventId)
        && Number(sale.receipt_not_requested_count || 0) >= units
        && Number(sale.receipt_not_requested_amount || 0) >= amount;
    });
  }

  function saleCandidateLabel(sale) {
    return `${sale.sale_date} · ${sale.event_name} · ${sale.item_name} (${money(sale.unit_price)}/개)`;
  }

  function renderReceipts() {
    const rows = $('receiptRows');
    rows.replaceChildren();
    receipts.forEach((item) => {
      const row = document.createElement('tr');
      const link = receiptLink(item.id);
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
      button.addEventListener('click', () => {
        if (receiptBusy || button.hidden) return;
        const confirmBox = document.createElement('div');
        const message = document.createElement('p');
        const yes = document.createElement('button');
        const no = document.createElement('button');
        const candidates = item.issued_at ? [] : receiptSaleCandidates(item);
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
            const selectedEventId = $('saleEvent').value;
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
    if (!receipts.length) $('adminStatus').textContent = '접수된 신청이 없습니다.';
  }

  async function loadReceipts() {
    const result = await rpc('list', { offset });
    receipts = result.items;
    receiptTotal = result.total;
    renderReceipts();
  }

  async function reloadReceipts() {
    if (receiptBusy) return;
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
  $('previous').addEventListener('click', () => { if (!receiptBusy) { offset = Math.max(0, offset - 100); void reloadReceipts(); } });
  $('next').addEventListener('click', () => { if (!receiptBusy) { offset += 100; void reloadReceipts(); } });
  $('exportCsv').addEventListener('click', async () => {
    if (receiptBusy) return;
    receiptBusy = true;
    $('exportCsv').disabled = true;
    try {
      const all = [];
      for (let page = 0; page < receiptTotal; page += 100) {
        const data = await rpc('list', { offset: page });
        all.push(...data.items);
      }
      const cell = (value) => `"${String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
      const lines = [['신청일시','행사일','행사명','입금자명','입금액','전화번호','발급상태'], ...all.map((item) => {
        const linkedEvent = eventById(receiptLink(item.id)?.event_id);
        return [dateTime(item.created_at),linkedEvent?.event_date || '',linkedEvent?.event_name || '',item.depositor_name,item.amount,`'${item.phone}`,item.issued_at ? '발급 완료' : '미처리'];
      })];
      const url = URL.createObjectURL(new Blob([`\uFEFF${lines.map((row) => row.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = '태양광선풍기_현금영수증신청.csv';
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

  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      $('adminPanel').hidden = true;
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
      const access = await rpc('access');
      editable = access.editable === true;
      $('accessStatus').textContent = editable ? '' : '조회 권한으로 열었습니다. 등록과 상태 변경은 회계 등록 권한이 필요합니다.';
      $('adminPanel').hidden = false;
      $('saleForm').querySelectorAll('input,select,button').forEach((element) => { element.disabled = !editable; });
      $('eventForm').querySelectorAll('input,button').forEach((element) => { element.disabled = !editable; });
      $('itemForm').querySelectorAll('input,button').forEach((element) => { element.disabled = !editable; });
      $('movementForm').querySelectorAll('input,select,button').forEach((element) => { element.disabled = !editable; });
      await loadInventory();
      await loadEventContext();
      await reloadReceipts();
    } catch (error) {
      $('accessStatus').textContent = readableError(error);
    }
  })();
})();
