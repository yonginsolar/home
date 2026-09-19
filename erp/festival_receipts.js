/* v2.0.3 - Auto-calculate and reconcile cash-receipt allocations. */
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
  let editable = false;
  let operationBusy = false;
  let receiptBusy = false;

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
    if (message.includes('LINKED_RECEIPT_EXCEEDS_ALLOCATION')) return '이미 발급 완료로 연결된 현금영수증보다 적게 바꿀 수 없습니다. 먼저 해당 신청을 미처리로 되돌려 주세요.';
    if (message.includes('RECEIPT_ALLOCATION_EXCEEDED')) return '해당 매출에 남아 있는 `신청 없음` 금액보다 신청액이 큽니다.';
    if (message.includes('RECEIPT_AMOUNT_NOT_MATCHED')) return '신청 금액과 해당 매출의 개당 판매가가 맞지 않습니다.';
    if (message.includes('SALE_LINK_REQUIRED') || message.includes('SALE_NOT_FOUND')) return '현금영수증을 연결할 등록 매출을 선택해 주세요.';
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
    const preview = document.createElement('p');
    preview.className = 'small muted multiline';
    const updatePreview = () => {
      const quantity = Number(sale.quantity || 0);
      const issuedCount = Math.max(0, Math.min(quantity, Math.trunc(Number(countInput.value || 0))));
      const issuedAmount = issuedCount * Number(sale.unit_price || 0);
      preview.textContent = `발급 ${issuedCount.toLocaleString('ko-KR')}건 · ${money(issuedAmount)}\n신청 없음 ${(quantity - issuedCount).toLocaleString('ko-KR')}건 · ${money(Number(sale.gross_amount || 0) - issuedAmount)}`;
    };
    countInput.addEventListener('input', updatePreview);
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
      if (issuedCount < 0 || issuedCount > Number(sale.quantity || 0)) {
        setOperationStatus('현금영수증 발급 건수를 판매 수량 안에서 입력해 주세요.', true);
        return;
      }
      operationBusy = true;
      save.disabled = cancel.disabled = true;
      try {
        await adjustRpc('update_sale_receipts', { sale_id: sale.id, issued_count: issuedCount });
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
    wrap.append(label, preview, save, cancel);
    cell.append(wrap);
    countInput.focus();
    countInput.select();
  }

  function renderSales() {
    const rows = $('salesRows');
    rows.replaceChildren();
    const sales = Array.isArray(inventory.sales) ? inventory.sales : [];
    sales.forEach((sale) => {
      const row = document.createElement('tr');
      const deposited = Number(sale.cash_deposited_amount || 0);
      const remaining = Math.max(0, Number(sale.cash_received || 0) - deposited);
      row.append(
        makeCell(sale.sale_date),
        makeCell(`${sale.event_name}\n${sale.item_name}`, 'multiline'),
        makeCell(`${Number(sale.quantity).toLocaleString('ko-KR')}개 × ${money(sale.unit_price)}\n합계 ${money(sale.gross_amount)}`, 'multiline'),
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
      row.append(
        receiptCell,
        makeCell(Number(sale.overpayment_amount || 0) > 0 ? `${sale.overpayment_name}\n${money(sale.overpayment_amount)} · 반환 대기` : '-', 'multiline')
      );
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

  async function loadInventory() {
    inventory = await rpc('bootstrap');
    renderInventory();
    renderSales();
    renderMovements();
  }

  function updateSaleSummary() {
    const quantity = intValue('saleQuantity');
    const unitPrice = intValue('saleUnitPrice');
    const gross = quantity * unitPrice;
    const bank = intValue('saleBank');
    const cash = intValue('saleCash');
    const overpayment = intValue('overpaymentAmount');
    const issued = intValue('receiptIssuedAmount');
    const none = intValue('receiptNoneAmount');
    const receivedOk = bank + cash === gross + overpayment;
    const receiptOk = issued + none === gross;
    $('saleSummary').textContent = `판매액 ${money(gross)} · 수납 ${money(bank + cash)}${overpayment ? ` (과오납 ${money(overpayment)} 포함)` : ''}\n현금영수증 구분 ${money(issued + none)} · ${receivedOk && receiptOk ? '합계가 맞습니다.' : '합계를 확인해 주세요.'}`;
    $('saleSummary').classList.toggle('invalid', !(receivedOk && receiptOk));
    return { quantity, unitPrice, gross, bank, cash, overpayment, issued, none, valid: receivedOk && receiptOk };
  }

  function syncSaleReceiptAllocation() {
    const quantity = intValue('saleQuantity');
    const unitPrice = intValue('saleUnitPrice');
    const issuedInput = $('receiptIssuedCount');
    const enteredIssuedCount = intValue('receiptIssuedCount');
    const issuedCount = Math.min(quantity, enteredIssuedCount);
    issuedInput.max = String(quantity);
    if (enteredIssuedCount !== issuedCount) issuedInput.value = String(issuedCount);
    $('receiptIssuedAmount').value = String(issuedCount * unitPrice);
    $('receiptNoneCount').value = String(quantity - issuedCount);
    $('receiptNoneAmount').value = String((quantity - issuedCount) * unitPrice);
    return updateSaleSummary();
  }

  ['saleBank','saleCash','overpaymentAmount'].forEach((id) => {
    $(id).addEventListener('input', updateSaleSummary);
  });
  ['saleQuantity','saleUnitPrice','receiptIssuedCount'].forEach((id) => {
    $(id).addEventListener('input', syncSaleReceiptAllocation);
  });

  $('saleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (operationBusy || !editable) return;
    const summary = syncSaleReceiptAllocation();
    const overpaymentName = $('overpaymentName').value.trim();
    if (!summary.valid) return setOperationStatus('판매액·수납액·현금영수증 구분 합계를 맞춰 주세요.', true);
    if (summary.overpayment > 0 && !overpaymentName) return setOperationStatus('과오납 입금자명을 입력해 주세요.', true);
    if (summary.overpayment === 0 && overpaymentName) return setOperationStatus('과오납 금액이 없으면 입금자명도 비워 주세요.', true);
    operationBusy = true;
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      await rpc('register_sale', {
        request_key: crypto.randomUUID(), sale_date: $('saleDate').value,
        event_name: $('eventName').value.trim(), item_id: $('saleItem').value,
        quantity: summary.quantity, unit_price: summary.unitPrice,
        bank_received: summary.bank, cash_received: summary.cash,
        receipt_issued_count: intValue('receiptIssuedCount'), receipt_issued_amount: summary.issued,
        receipt_not_requested_count: intValue('receiptNoneCount'), receipt_not_requested_amount: summary.none,
        overpayment_amount: summary.overpayment, overpayment_name: overpaymentName,
        note: $('saleNote').value.trim()
      });
      setOperationStatus('매출·회계전표·재고 출고를 함께 저장했습니다.');
      event.currentTarget.reset();
      $('saleDate').value = kstToday();
      ['saleBank','saleCash','receiptIssuedCount','receiptIssuedAmount','receiptNoneCount','receiptNoneAmount','overpaymentAmount'].forEach((id) => { $(id).value = '0'; });
      syncSaleReceiptAllocation();
      await loadInventory();
    } catch (error) {
      setOperationStatus(readableError(error), true);
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
    return (Array.isArray(inventory.sales) ? inventory.sales : []).filter((sale) => {
      const unitPrice = Number(sale.unit_price || 0);
      const units = unitPrice > 0 && amount % unitPrice === 0 ? amount / unitPrice : 0;
      return units > 0
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
      row.append(makeCell(dateTime(item.created_at)), makeCell(item.depositor_name), makeCell(money(item.amount)), makeCell(item.phone));
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
            await adjustRpc(item.issued_at ? 'mark_pending' : 'mark_issued', {
              id: item.id,
              ...(selectedSaleId ? { sale_id: selectedSaleId } : {})
            });
            await Promise.all([loadInventory(), loadReceipts()]);
            $('adminStatus').textContent = item.issued_at
              ? '미처리 상태와 연결 매출의 현금영수증 구분을 함께 되돌렸습니다.'
              : '발급 완료 상태와 연결 매출의 현금영수증 구분을 함께 저장했습니다.';
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
      const lines = [['신청일시','입금자명','입금액','전화번호','발급상태'], ...all.map((item) => [dateTime(item.created_at),item.depositor_name,item.amount,`'${item.phone}`,item.issued_at ? '발급 완료' : '미처리'])];
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
    $('saleDate').value = kstToday();
    $('movementDate').value = kstToday();
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
      $('itemForm').querySelectorAll('input,button').forEach((element) => { element.disabled = !editable; });
      $('movementForm').querySelectorAll('input,select,button').forEach((element) => { element.disabled = !editable; });
      await Promise.all([loadInventory(), reloadReceipts()]);
    } catch (error) {
      $('accessStatus').textContent = readableError(error);
    }
  })();
})();
