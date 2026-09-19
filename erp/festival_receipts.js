/* v2.0.0 - Cash sales, cash deposits, inventory, and receipt requests. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const client = window.supabase.createClient(
    'https://ifdqlwxgqgsvnawmhlfc.supabase.co',
    'sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h'
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
    if (message.includes('결산에 포함')) return message;
    return '처리하지 못했습니다. 입력값과 로그인 상태를 확인하고 다시 시도해 주세요.';
  }

  async function rpc(action, data = {}) {
    const result = await client.rpc('festival_receipts_admin', { p_action: action, p_data: data });
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
        makeCell(`계좌 ${money(sale.bank_received)}\n현금 ${money(sale.cash_received)}`, 'multiline'),
        makeCell(`발급 ${Number(sale.receipt_issued_count).toLocaleString('ko-KR')}건 · ${money(sale.receipt_issued_amount)}\n신청 없음 ${Number(sale.receipt_not_requested_count).toLocaleString('ko-KR')}건 · ${money(sale.receipt_not_requested_amount)}`, 'multiline'),
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

  ['saleQuantity','saleUnitPrice','saleBank','saleCash','overpaymentAmount','receiptIssuedAmount','receiptNoneAmount'].forEach((id) => {
    $(id).addEventListener('input', updateSaleSummary);
  });
  $('saleQuantity').addEventListener('input', () => {
    const count = intValue('saleQuantity');
    const issued = intValue('receiptIssuedCount');
    if (issued <= count) $('receiptNoneCount').value = String(count - issued);
  });
  $('receiptIssuedCount').addEventListener('input', () => {
    const count = intValue('saleQuantity');
    const issued = intValue('receiptIssuedCount');
    if (issued <= count) $('receiptNoneCount').value = String(count - issued);
  });

  $('saleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (operationBusy || !editable) return;
    const summary = updateSaleSummary();
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
      updateSaleSummary();
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
        message.textContent = item.issued_at ? '미처리 상태로 되돌릴까요?' : '실제 현금영수증 발급을 마치셨나요?';
        yes.type = no.type = 'button';
        yes.textContent = item.issued_at ? '예, 미처리로 되돌리기' : '예, 발급을 마쳤어요';
        no.textContent = '취소';
        no.className = 'secondary';
        no.addEventListener('click', () => { confirmBox.remove(); button.hidden = false; button.focus(); });
        yes.addEventListener('click', async () => {
          if (receiptBusy) return;
          receiptBusy = true;
          yes.disabled = no.disabled = true;
          try {
            await rpc(item.issued_at ? 'mark_pending' : 'mark_issued', { id: item.id });
            await loadReceipts();
            $('adminStatus').textContent = '처리 상태를 저장했습니다.';
          } catch (error) {
            $('adminStatus').textContent = readableError(error);
          } finally {
            receiptBusy = false;
          }
        });
        confirmBox.append(message, yes, no);
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
    updateSaleSummary();
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
