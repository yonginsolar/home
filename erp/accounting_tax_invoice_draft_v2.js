/* Accounting — local document composition and preview only. */
(function (global) {
  'use strict';
  const MARKUP = `
<section id="itp-tax-invoice" aria-label="전자(세금)계산서 작성">
  <header class="itp-top">
    <h2>전자(세금)계산서 작성</h2>
  </header>
  <form class="itp-content" data-editor autocomplete="off">
    <div class="itp-doc-switch" role="group" aria-label="문서 구분">
      <button type="button" data-doc="tax" aria-pressed="true">세금계산서(영세율 포함)</button>
      <button type="button" data-doc="exempt" aria-pressed="false">계산서(면세)</button>
    </div>
    <div class="itp-options">
      <fieldset class="itp-choice" data-kind-options data-tax-only><legend>종류</legend>
        <div><label><input type="radio" name="itp-kind" value="standard" checked> 일반</label>
          <label><input type="radio" name="itp-kind" value="zero"> 영세율</label>
          <label><input type="radio" name="itp-kind" value="trust"> 위수탁</label>
          <label><input type="radio" name="itp-kind" value="trust-zero"> 위수탁영세율</label>
          <button type="button" data-apply-kind aria-label="종류 선택">선택</button></div>
      </fieldset>
      <fieldset class="itp-choice"><legend>공급받는자 구분</legend>
        <div><label><input type="radio" name="itp-buyer-kind" checked> 사업자등록번호</label>
          <label><input type="radio" name="itp-buyer-kind" disabled> 주민(외국인)등록번호</label>
          <label><input type="radio" name="itp-buyer-kind" disabled> 미등록번호</label></div>
      </fieldset>
    </div>
    <div class="itp-parties" data-parties>
      <div class="itp-party itp-seller">
        <div class="itp-party-band">공급자</div>
        <table aria-label="공급자">
          <tbody>
            <tr><th scope="row">등록번호</th><td><input type="text" inputmode="numeric" maxlength="10" data-id-number data-issuer="number" aria-label="발급 조합 사업자등록번호"><input type="text" inputmode="numeric" maxlength="10" data-id-number data-supplier-entry aria-label="공급자 사업자등록번호" hidden></td>
              <th scope="row">종사업장번호</th><td><input type="text" inputmode="numeric" maxlength="4" data-issuer="branch" aria-label="발급 조합 종사업장번호"><input type="text" inputmode="numeric" maxlength="4" data-supplier-entry aria-label="공급자 종사업장번호" hidden></td></tr>
            <tr><th scope="row">상호</th><td><input type="text" data-issuer="name" aria-label="발급 조합 상호"><input type="text" data-supplier-entry aria-label="공급자 상호" hidden></td>
              <th scope="row">성명</th><td><input type="text" data-issuer="person" aria-label="발급 조합 성명"><input type="text" data-supplier-entry aria-label="공급자 성명" hidden></td></tr>
            <tr><th scope="row">사업장</th><td colspan="3"><input type="text" data-issuer="address" aria-label="발급 조합 사업장"><input type="text" data-supplier-entry aria-label="공급자 사업장" hidden></td></tr>
            <tr><th scope="row">업태</th><td><input type="text" data-issuer="business" aria-label="발급 조합 업태"><input type="text" data-supplier-entry aria-label="공급자 업태" hidden></td>
              <th scope="row">종목</th><td><input type="text" data-issuer="item" aria-label="발급 조합 종목"><input type="text" data-supplier-entry aria-label="공급자 종목" hidden></td></tr>
            <tr><th scope="row">이메일</th><td colspan="3"><span data-issuer-email-slot><input type="email" aria-label="공급자 이메일" data-issuer-email></span><input type="email" data-supplier-entry aria-label="위수탁 공급자 이메일" hidden></td></tr>
            <tr aria-hidden="true"><th></th><td colspan="3"></td></tr>
          </tbody>
        </table>
      </div>
      <div class="itp-party itp-buyer">
        <div class="itp-party-band">공급받는자</div>
        <table aria-label="공급받는자">
          <tbody>
            <tr><th scope="row">등록번호</th><td><input id="itp-bizno" type="text" inputmode="numeric" aria-label="공급받는자 사업자등록번호" maxlength="10" data-id-number aria-describedby="itp-buyer-status"><small class="d-block text-muted" id="itp-buyer-status" role="status"></small><button type="button" data-lookup-retry hidden>다시 조회</button></td><th scope="row">종사업장번호</th><td><input type="text" aria-label="공급받는자 종사업장번호" inputmode="numeric" maxlength="4" data-party></td></tr>
            <tr><th scope="row">상호</th><td><input id="itp-name" type="text" aria-label="공급받는자 상호" maxlength="120"></td><th scope="row">성명</th><td><input type="text" aria-label="공급받는자 성명" data-party></td></tr>
            <tr><th scope="row">사업장</th><td colspan="3"><input type="text" aria-label="공급받는자 사업장" data-party></td></tr>
            <tr><th scope="row">업태</th><td><input type="text" aria-label="공급받는자 업태" data-party></td><th scope="row">종목</th><td><input type="text" aria-label="공급받는자 종목" data-party></td></tr>
            <tr><th scope="row">이메일</th><td colspan="3"><input type="email" aria-label="수신 이메일" data-party></td></tr>
            <tr><th scope="row">이메일</th><td colspan="3"><input type="email" aria-label="수신 이메일 2" data-party></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <details class="itp-trustee-detail" data-trustee-editor open hidden>
      <summary>수탁사업자</summary>
      <div class="itp-trustee" data-trustee-data>
        <table aria-label="수탁사업자 기본 정보">
          <tbody>
            <tr><th scope="row">등록번호</th><td data-trustee-field="number"></td><th scope="row">종사업장번호</th><td data-trustee-field="branch"></td></tr>
            <tr><th scope="row">상호</th><td data-trustee-field="name"></td><th scope="row">성명</th><td data-trustee-field="person"></td></tr>
          </tbody>
        </table>
        <table aria-label="수탁사업자 사업장 정보">
          <tbody>
            <tr><th scope="row">사업장</th><td colspan="3" data-trustee-field="address"></td></tr>
            <tr><th scope="row">업태</th><td data-trustee-field="business"></td><th scope="row">종목</th><td data-trustee-field="item"></td></tr>
            <tr><th scope="row">이메일</th><td colspan="3" data-trustee-email-slot></td></tr>
          </tbody>
        </table>
      </div>
    </details>
    <div class="itp-meta">
      <div class="itp-pair"><label for="itp-issued-on">작성일자</label><div><input type="date" id="itp-issued-on"></div></div>
      <div class="itp-pair"><label for="itp-invoice-note">비고</label><div><input type="text" id="itp-invoice-note"></div></div>
    </div>
    <dl class="itp-totals" aria-label="금액 합계" aria-live="polite">
      <div class="itp-pair"><dt>합계금액</dt><dd><output data-total></output></dd></div>
      <div class="itp-pair"><dt>공급가액</dt><dd><output data-total-supply></output></dd></div>
      <div class="itp-pair" data-tax-only><dt>세액</dt><dd><output data-total-tax></output></dd></div>
    </dl>
    <section class="itp-items" aria-labelledby="itp-items-title">
      <div class="itp-section-head"><h2 id="itp-items-title">품목</h2><button type="button" class="itp-quiet-btn" data-add>품목 추가</button></div>
      <div class="itp-line itp-line-head" aria-hidden="true"><span>월</span><span>일</span><span>품목</span><span>규격</span><span>수량</span><span>단가</span><span>합계</span><span>공급가액</span><span data-tax-only>세액</span><span>비고</span><span>삭제</span></div>
      <div data-lines></div>
    </section>
    <section class="itp-payment" aria-label="결제 내역">
      <div class="itp-payments">
        <label>현금 <input type="text" inputmode="numeric" data-payment="cash" data-number-group min="0" max="999999999999999" step="1"></label>
        <label>수표 <input type="text" inputmode="numeric" data-payment="check" data-number-group min="0" max="999999999999999" step="1"></label>
        <label>어음 <input type="text" inputmode="numeric" data-payment="note" data-number-group min="0" max="999999999999999" step="1"></label>
        <label>외상미수금 <input type="text" inputmode="numeric" data-payment="credit" data-number-group min="0" max="999999999999999" step="1"></label>
      </div>
      <fieldset class="itp-choice itp-purpose"><legend>이 금액을</legend>
        <div><label><input type="radio" name="itp-purpose" value="청구" checked> 청구</label>
          <label><input type="radio" name="itp-purpose" value="영수"> 영수</label><span>함</span></div>
      </fieldset>
    </section>
    <footer class="itp-footer"><button type="button" class="itp-primary" data-preview aria-haspopup="dialog" aria-controls="itp-document">발급미리보기</button></footer>
  </form>
  <template data-line-template>
    <div class="itp-line" data-line>
      <label><span>월</span><input type="text" aria-label="공급월" data-month readonly></label>
      <label><span>일</span><input type="text" inputmode="numeric" aria-label="공급일" data-day maxlength="2"></label>
      <label><span>품목</span><input type="text" aria-label="품목" data-description maxlength="100"></label>
      <label><span>규격</span><input type="text" aria-label="규격" data-spec maxlength="40"></label>
      <label><span>수량</span><input type="text" inputmode="numeric" aria-label="수량" data-quantity data-number-group min="0" max="99999" step="1"></label>
      <label><span>단가</span><input type="text" inputmode="numeric" aria-label="단가" data-price data-number-group min="0" max="999999999" step="1"></label>
      <button type="button" class="itp-quiet-btn itp-calc-trigger" data-calc-open aria-haspopup="dialog" aria-controls="itp-calculator">계산</button>
      <label><span>공급가액</span><input type="text" inputmode="numeric" aria-label="공급가액" data-supply data-number-group min="0" max="999999999999999" step="1"></label>
      <label data-tax-only><span>세액</span><input type="text" inputmode="numeric" aria-label="세액" data-tax data-number-group min="0" max="999999999999999" step="1"></label>
      <label><span>비고</span><input type="text" aria-label="품목 비고" data-remark maxlength="100"></label>
      <button type="button" class="itp-quiet-btn itp-remove" data-remove>삭제</button>
    </div>
  </template>
  <dialog id="itp-document" class="itp-dialog itp-preview" aria-labelledby="itp-preview-title">
    <div class="itp-dialog-head"><h2 id="itp-preview-title">전자세금계산서</h2><span class="itp-preview-kind" data-paper-kind hidden></span><button type="button" class="itp-close" data-dismiss aria-label="미리보기 닫기">×</button></div>
    <div class="itp-dialog-body">
      <div data-paper-parties></div>
      <section class="itp-trustee-preview" data-paper-trustee hidden aria-label="수탁사업자"><h3>수탁사업자</h3><div data-paper-trustee-data></div></section>
      <dl class="itp-meta">
        <div class="itp-pair"><dt>작성일자</dt><dd data-paper="date"></dd></div>
        <div class="itp-pair"><dt>비고</dt><dd data-paper="remark"></dd></div>
      </dl>
      <dl class="itp-totals" aria-label="금액 합계">
        <div class="itp-pair"><dt>합계금액</dt><dd data-paper="total"></dd></div>
        <div class="itp-pair"><dt>공급가액</dt><dd data-paper="supply"></dd></div>
        <div class="itp-pair" data-tax-only><dt>세액</dt><dd data-paper="tax"></dd></div>
      </dl>
      <table class="itp-paper-lines" aria-label="품목 내역">
        <thead><tr><th>월</th><th>일</th><th>품목</th><th>규격</th><th>수량</th><th>단가</th><th>공급가액</th><th data-tax-only>세액</th><th>비고</th></tr></thead>
        <tbody data-paper-lines></tbody>
      </table>
      <dl class="itp-payments">
        <div><dt>현금</dt><dd data-paper="cash"></dd></div><div><dt>수표</dt><dd data-paper="check"></dd></div>
        <div><dt>어음</dt><dd data-paper="note"></dd></div><div><dt>외상미수금</dt><dd data-paper="credit"></dd></div>
      </dl>
      <p class="itp-paper-purpose">이 금액을 <strong data-paper="purpose"></strong>함</p>
    </div>
    <footer class="itp-dialog-foot"><button type="button" class="itp-quiet-btn" data-dismiss>닫기</button></footer>
  </dialog>
  <dialog id="itp-calculator" class="itp-dialog itp-calculator" aria-labelledby="itp-calc-title">
    <div class="itp-dialog-head"><h2 id="itp-calc-title">공급가액, 세액 자동계산</h2><button type="button" class="itp-close" data-dismiss aria-label="계산창 닫기">×</button></div>
    <form data-calculator autocomplete="off">
      <div class="itp-dialog-body">
        <div class="itp-calc-units">단위: 원</div>
        <div class="itp-amount-calc">
          <div class="itp-pair itp-calc-total"><label for="itp-calc-gross" data-calc-label>합계(부가세 포함)</label>
            <div><input id="itp-calc-gross" type="text" inputmode="numeric" data-number-group min="0" max="999999999999999" step="1"><button type="button" class="itp-quiet-btn" data-calculate>계산</button></div></div>
          <div class="itp-pair"><label for="itp-calc-supply">공급가액</label><div><input id="itp-calc-supply" type="text" inputmode="numeric" data-number-group min="0" max="999999999999999" step="1"></div></div>
          <div class="itp-pair" data-tax-only><label for="itp-calc-tax">세액</label><div><input id="itp-calc-tax" type="text" inputmode="numeric" data-number-group min="0" max="999999999999999" step="1"></div></div>
        </div>
        <p class="itp-error" data-calc-error role="alert" hidden>합계금액을 입력하세요.</p>
      </div>
      <footer class="itp-dialog-foot"><button type="button" class="itp-quiet-btn" data-dismiss>취소</button><button type="submit" class="itp-primary">확인</button></footer>
    </form>
  </dialog>
</section>
`;
  function mount({host, current, issuerName, today, lookupBuyer, loadIssuer}) {
    if (!current() || !global.ERPNumberInput) throw new Error('INVOICE_DRAFT_CONTEXT');
    const template = document.createElement('template');
    template.innerHTML = MARKUP;
    const root = template.content.firstElementChild;
    host.replaceChildren(root);
    const numbers = global.ERPNumberInput;
    numbers.refresh(root);
    const find = (selector) => root.querySelector(selector);
    const form = find('[data-editor]');
    const lines = find('[data-lines]');
    const date = find('#itp-issued-on');
    const biz = find('#itp-bizno');
    const buyer = find('#itp-name');
    const lookupStatus = find('#itp-buyer-status');
    const retry = find('[data-lookup-retry]');
    const doc = find('#itp-document');
    const calc = find('#itp-calculator');
    const calcForm = find('[data-calculator]');
    const calcGross = find('#itp-calc-gross');
    const calcSupply = find('#itp-calc-supply');
    const calcTax = find('#itp-calc-tax');
    const calcError = find('[data-calc-error]');
    const addButton = find('[data-add]');
    const applyKind = find('[data-apply-kind]');
    const preview = find('[data-preview]');
    const seller = find('.itp-seller');
    const trustee = find('[data-trustee-editor]');
    const issuerEmail = find('[data-issuer-email]');
    const issuerFields = new Map([...seller.querySelectorAll('[data-issuer]')].map((field) => [field.dataset.issuer, field]));
    const issuerNameField = issuerFields.get('name');
    issuerNameField.value = issuerName;
    issuerNameField.readOnly = !!issuerName;
    date.value = today;
    const issuerDefaults = new Map([...issuerFields.values(), issuerEmail].map(field=>[field,field.value]));
    const touchedIssuer = new Set();
    let issuerRequest = null, issuerLoaded = false;
    let lookupRequest = null, lookupTimer = null, lookedUp = '', editedBuyer = false;
    for (const field of issuerDefaults.keys()) field.addEventListener('input',()=>touchedIssuer.add(field));
    buyer.addEventListener('input',()=>{editedBuyer=true;});
    const states = new WeakMap();
    const numeral = new Intl.NumberFormat('ko-KR');
    const money = (value) => value === null ? '' : numeral.format(value);
    const clean = (text, limit = 50) => text.replace(/[^0-9]/g, '').slice(0, limit);
    const amount = (input) => {
      const raw = numbers.raw(input.value);
      return input.validity.valid && /^[0-9]+$/.test(raw) ? BigInt(raw) : null;
    };
    const assign = (input, value) => { input.value = value === null ? '' : String(value); };
    const control = (row, field) => row.querySelector('[data-' + field + ']');
    const selectedKind = () => find('input[name=itp-kind]:checked').value;
    const taxable = () => docType === 'tax' && (activeKind === 'standard' || activeKind === 'trust');
    const entrusted = () => docType === 'tax' && (activeKind === 'trust' || activeKind === 'trust-zero');
    const caption = () => docType === 'exempt' ? '전자계산서' : '전자세금계산서';
    const split = (gross) => {
      const tax = gross === null ? null : (taxable() ? (gross + 5n) / 11n : 0n);
      return { supply: gross === null ? null : gross - tax, tax };
    };
    let docType = 'tax';
    let activeKind = 'standard';
    let lastNumber = biz.value;
    let rowInCalc = null;
    let calcDirty = false;
    let summary = { gross: null, supply: null, tax: null };

    function applyBuyerNumber(value) {
      const next = clean(value,10);
      biz.value = next;
      if (next === lastNumber) return;
      lastNumber = next;
      pauseLookup();
      lookedUp = '';
      editedBuyer = false;
      lookupStatus.textContent = '';
      retry.hidden = true;
      buyer.value = '';
      form.querySelectorAll('[data-party]').forEach((field) => { field.value = ''; });
      queueLookup();
    }
    function pauseLookup() {
      clearTimeout(lookupTimer);
      lookupTimer = null;
      lookupRequest?.abort();
      lookupRequest = null;
    }
    function queueLookup() {
      if (!current() || !/^[0-9]{10}$/.test(biz.value) || lookedUp === biz.value || lookupRequest || lookupTimer) return;
      lookupTimer = setTimeout(()=>{lookupTimer=null;void runLookup();},250);
    }
    async function runLookup() {
      const number = biz.value;
      if (!current() || !/^[0-9]{10}$/.test(number) || lookupRequest) return;
      const ctrl = new AbortController();
      lookupRequest = ctrl;
      lookupStatus.textContent = '사업자 정보 조회 중';
      retry.hidden = true;
      const fresh = () => lookupRequest===ctrl && !ctrl.signal.aborted && biz.value===number && current();
      try {
        const result = await lookupBuyer(number,ctrl.signal);
        if (!fresh()) return;
        if (!editedBuyer && !buyer.value && typeof result?.name==='string') buyer.value=result.name.trim().slice(0,buyer.maxLength);
        const names={open:'계속사업자',paused:'휴업',closed:'폐업'};
        lookupStatus.textContent = Object.hasOwn(names,result?.state) ? names[result.state] :
          result?.name ? '사업자 상태 미확인' : '조회된 정보 없음';
        lookedUp = number;
      } catch {
        if (!fresh()) return;
        lookupStatus.textContent = '사업자 정보를 불러오지 못했습니다.';
        retry.hidden = false;
      } finally {
        if (lookupRequest===ctrl) lookupRequest=null;
      }
    }
    retry.addEventListener('click',()=>{lookedUp='';void runLookup();});
    async function hydrateIssuer() {
      if (!current() || issuerRequest || issuerLoaded) return;
      const ctrl = new AbortController();
      issuerRequest=ctrl;
      try {
        const profile = await loadIssuer(ctrl.signal);
        if (!current() || issuerRequest!==ctrl || ctrl.signal.aborted) return;
        for (const [key,field] of [...issuerFields,['email',issuerEmail]]) {
          if (!touchedIssuer.has(field) && typeof profile[key]==='string' && profile[key]) {
            field.value=profile[key];
            issuerDefaults.set(field,field.value);
          }
        }
        if (entrusted()) refreshTrustee();
        issuerLoaded=true;
      } catch {
        // Keep the editable fields as entered if the existing profile read fails.
      } finally {
        if (issuerRequest===ctrl) issuerRequest=null;
      }
    }
    function resume() { queueLookup(); void hydrateIssuer(); }
    function bindIdentifier(input, apply, limit) {
      input.addEventListener('input', () => apply(input.value));
      input.addEventListener('paste', (event) => {
        const pasted = event.clipboardData?.getData('text');
        if (!pasted) return;
        event.preventDefault();
        apply(clean(input.value.slice(0,input.selectionStart) + pasted + input.value.slice(input.selectionEnd),limit));
      });
    }
    bindIdentifier(biz,applyBuyerNumber,10);
    form.querySelectorAll('input[inputmode=numeric]:not([data-number-group]):not(#itp-bizno)').forEach((field) => {
      if (field.hasAttribute('data-day')) return;
      bindIdentifier(field,(value) => { field.value = clean(value,field.maxLength); },field.maxLength);
    });
    form.addEventListener('submit', (event) => event.preventDefault());

    function rowValues(row) {
      const data = states.get(row);
      if (data.source === 'unit') {
        const quantity = amount(control(row,'quantity')), unit = amount(control(row,'price'));
        const supply = quantity === null || unit === null ? null : quantity * unit;
        const tax = supply === null ? null : taxable() ? (supply + 5n) / 10n : 0n;
        return { gross: supply === null ? null : supply + tax, supply, tax };
      }
      return {
        gross: data.gross,
        ...(taxable() && data.adjustment ? data.adjustment : split(data.gross))
      };
    }
    function renderRow(row, refreshUnit = false, keep = null) {
      const data = rowValues(row);
      const state = states.get(row);
      if (keep !== 'supply') assign(control(row,'supply'),data.supply);
      const tax = control(row,'tax');
      tax.readOnly = !taxable();
      if (keep !== 'tax') assign(tax,data.tax);
      if (refreshUnit && state.source !== 'unit') {
        const q = amount(control(row,'quantity'));
        assign(control(row,'price'), data.supply !== null && q > 0n && data.supply % q === 0n ? data.supply / q : null);
      }
    }
    function updateForm() {
      const rows = [...lines.children];
      const month = date.value.slice(5,7);
      let supply = 0n, tax = 0n, hasAmount = false;
      rows.forEach((row,index) => {
        const data = rowValues(row);
        const started = index === 0 || data.gross !== null ||
          ['day','description','spec','quantity','price','remark'].some((field) => control(row,field).value !== '');
        control(row,'month').value = started ? month : '';
        if (data.gross !== null) {
          hasAmount = true;
          supply += data.supply ?? 0n;
          tax += data.tax ?? 0n;
        }
        row.querySelector('[data-remove]').disabled = rows.length === 1;
        row.querySelector('[data-calc-open]').setAttribute('aria-label',(index+1) + '번 품목 계산');
        row.querySelector('[data-remove]').setAttribute('aria-label',(index+1) + '번 품목 삭제');
      });
      summary = {gross:hasAmount ? supply+tax : null,supply:hasAmount ? supply : null,tax:hasAmount ? tax : null};
      find('[data-total]').textContent = money(summary.gross);
      find('[data-total-supply]').textContent = money(summary.supply);
      find('[data-total-tax]').textContent = money(summary.tax);
      addButton.disabled = rows.length >= 16;
    }
    function setControls() {
      const trust = entrusted();
      root.classList.toggle('is-exempt',docType === 'exempt');
      root.querySelectorAll('[data-doc]').forEach((button) => button.setAttribute('aria-pressed',String(button.dataset.doc === docType)));
      root.querySelectorAll('[data-tax-only]').forEach((el) => { el.hidden = docType === 'exempt'; });
      seller.querySelectorAll('[data-issuer],[data-issuer-email-slot]').forEach((el) => { el.hidden = trust; });
      seller.querySelectorAll('[data-supplier-entry]').forEach((el) => { el.hidden = !trust; });
      trustee.hidden = !trust;
      if (trust) refreshTrustee();
      const emailSlot = find(trust ? '[data-trustee-email-slot]' : '[data-issuer-email-slot]');
      if (issuerEmail.parentNode !== emailSlot) emailSlot.append(issuerEmail);
      issuerEmail.setAttribute('aria-label',trust ? '수탁사업자 이메일' : '공급자 이메일');
      calcTax.readOnly = !taxable();
      find('#itp-calc-title').textContent = docType === 'exempt' ? '공급가액 계산' : '공급가액, 세액 자동계산';
      find('[data-calc-label]').textContent = taxable() ? '합계(부가세 포함)' : '합계';
      [...lines.children].forEach((row) => renderRow(row,true));
      updateKindChoice();
      updateForm();
    }
    function updateKindChoice() {
      const pending = docType === 'tax' && selectedKind() !== activeKind;
      applyKind.toggleAttribute('data-pending',pending);
      preview.disabled = pending;
    }
    function refreshTrustee() {
      for (const element of trustee.querySelectorAll('[data-trustee-field]')) {
        const field = issuerFields.get(element.dataset.trusteeField);
        element.textContent = field ? valueOfParty(field) : '';
      }
    }
    root.querySelectorAll('[data-doc]').forEach((button) => button.addEventListener('click', () => {
      if (docType === button.dataset.doc) return;
      docType = button.dataset.doc;
      find('input[name=itp-kind][value=' + activeKind + ']').checked = true;
      setControls();
    }));
    form.querySelector('[data-kind-options]').addEventListener('change',updateKindChoice);
    applyKind.addEventListener('click', () => {
      if (docType !== 'tax' || activeKind === selectedKind()) return;
      activeKind = selectedKind();
      setControls();
    });
    date.addEventListener('input',updateForm);

    function add({description='',day='',spec='',quantity=null,gross=null,remark=''}={}) {
      const row = find('[data-line-template]').content.firstElementChild.cloneNode(true);
      numbers.refresh(row);
      control(row,'description').value = description;
      control(row,'day').value = day;
      control(row,'spec').value = spec;
      control(row,'remark').value = remark;
      assign(control(row,'quantity'),quantity);
      row.querySelector('[data-tax-only]').hidden = docType === 'exempt';
      states.set(row,{source:'gross',gross,adjustment:null});
      lines.append(row);
      renderRow(row,true);
      updateForm();
      return row;
    }
    addButton.addEventListener('click', () => { if (lines.children.length < 16) control(add(),'description').focus(); });
    for (let index = 0; index < 4; index++) add();
    setControls();

    lines.addEventListener('input', (event) => {
      const input = event.target;
      const row = input.closest('[data-line]');
      const state = states.get(row);
      if (input.matches('[data-day]')) input.value = clean(input.value,2);
      else if (input.matches('[data-quantity],[data-price]')) {
        const isUnit = input.matches('[data-price]');
        if (isUnit) state.source = 'unit';
        renderRow(row,!isUnit);
      } else if (input.matches('[data-supply],[data-tax]')) {
        const field = input.matches('[data-supply]') ? 'supply' : 'tax';
        if (field === 'tax' && !taxable()) return;
        const prev = rowValues(row);
        if (!input.validity.valid) return;
        const value = amount(input);
        const supply = field === 'supply' ? value : prev.supply;
        const tax = !taxable() ? (supply === null ? null : 0n) : field === 'tax' ? value : prev.tax;
        state.source = 'gross';
        state.gross = supply === null && tax === null ? null : (supply ?? 0n) + (tax ?? 0n);
        state.adjustment = taxable() ? {supply,tax} : null;
        renderRow(row,true,field);
      }
      updateForm();
    });
    lines.addEventListener('click', (event) => {
      const trigger = event.target.closest('button');
      if (!trigger) return;
      const row = trigger.closest('[data-line]');
      if (trigger.matches('[data-calc-open]')) openCalculator(row);
      else if (trigger.matches('[data-remove]') && lines.children.length > 1) {
        const neighbor = row.nextElementSibling || row.previousElementSibling;
        row.remove();
        updateForm();
        control(neighbor,'description').focus();
      }
    });

    function openCalculator(row) {
      if (!current()) return;
      const data = rowValues(row);
      rowInCalc = row;
      calcDirty = false;
      calcError.hidden = true;
      calcError.textContent = '';
      assign(calcGross,data.gross);
      assign(calcSupply,data.supply);
      assign(calcTax,data.tax);
      calc.showModal();
      calcGross.focus();
      calcGross.select();
    }
    function showCalcError(message) {
      calcError.textContent = message;
      calcError.hidden = !message;
    }
    function calculate() {
      if (!current() || !calcGross.reportValidity()) return false;
      const gross = amount(calcGross);
      if (gross === null) {
        showCalcError('합계금액을 입력하세요.');
        calcGross.focus();
        return false;
      }
      const result = split(gross);
      assign(calcSupply,result.supply);
      assign(calcTax,result.tax);
      calcDirty = false;
      showCalcError('');
      return true;
    }
    calcForm.addEventListener('input',(event) => {
      const input = event.target;
      if (!input.matches('#itp-calc-gross,#itp-calc-supply,#itp-calc-tax')) return;
      const value = amount(input);
      showCalcError('');
      if (input === calcGross) {
        calcDirty = true;
        assign(calcSupply,null);
        assign(calcTax,null);
        return;
      }
      const gross = amount(calcGross);
      if (gross === null) { showCalcError('합계금액을 먼저 입력하세요.'); return; }
      if (value === null || value > gross) { showCalcError('합계금액 이하로 입력하세요.'); return; }
      if (input === calcSupply && !taxable() && value !== gross) {
        assign(calcGross,value);
        assign(calcTax,0n);
      } else assign(input === calcSupply ? calcTax : calcSupply,gross-value);
      calcDirty = false;
    });
    calcForm.addEventListener('keydown',(event) => {
      if (event.key !== 'Enter' || event.isComposing || event.target !== calcGross) return;
      event.preventDefault();
      calculate();
    });
    find('[data-calculate]').addEventListener('click',calculate);
    calcForm.addEventListener('submit',(event) => {
      event.preventDefault();
      if (!current() || !rowInCalc) return;
      if (calcDirty && !calculate()) return;
      const gross = amount(calcGross), supply = amount(calcSupply), tax = taxable() ? amount(calcTax) : 0n;
      if (gross === null) { calculate(); return; }
      if (supply === null || tax === null || supply+tax !== gross) {
        showCalcError('공급가액과 세액의 합계가 맞지 않습니다.');
        return;
      }
      const row = rowInCalc;
      states.set(row,{source:'gross',gross,adjustment:taxable() ? {supply,tax} : null});
      renderRow(row,true);
      updateForm();
      calc.close();
    });
    calc.addEventListener('close',() => { if (!calc.open) rowInCalc = null; });

    function valueOfParty(input) {
      const value = input.value.trim();
      return input.hasAttribute('data-id-number') && value.length === 10
        ? value.replace(/^(\d{3})(\d{2})(\d{5})$/,'$1-$2-$3') : value;
    }
    function snapshot(source) {
      const copy = source.cloneNode(true);
      for (const key of ['data-parties','data-trustee-data']) copy.removeAttribute(key);
      const fields = [...source.querySelectorAll('input')];
      copy.querySelectorAll('input').forEach((input,index) => {
        input.replaceWith(document.createTextNode(input.hidden ? '' : valueOfParty(fields[index])));
      });
      copy.querySelectorAll('[hidden], #itp-buyer-status, [data-lookup-retry]').forEach((element) => element.remove());
      return copy;
    }
    function drawPaper() {
      find('#itp-preview-title').textContent = caption();
      const title = doc.querySelector('[data-paper-kind]');
      const kinds = {standard:'',zero:'영세율',trust:'위수탁','trust-zero':'위수탁영세율'};
      title.textContent = docType === 'exempt' ? '' : kinds[activeKind];
      title.hidden = !title.textContent;
      doc.querySelector('[data-paper-parties]').replaceChildren(snapshot(form.querySelector('[data-parties]')));
      doc.querySelector('[data-paper-trustee]').hidden = !entrusted();
      const trusteePaper = doc.querySelector('[data-paper-trustee-data]');
      if (entrusted()) trusteePaper.replaceChildren(snapshot(trustee.querySelector('[data-trustee-data]')));
      else trusteePaper.replaceChildren();
      const values = {
        date:date.value, remark:find('#itp-invoice-note').value.trim(), total:money(summary.gross),
        supply:money(summary.supply), tax:money(summary.tax),
        purpose:find('input[name=itp-purpose]:checked').value
      };
      form.querySelectorAll('[data-payment]').forEach((input) => { values[input.dataset.payment] = money(amount(input)); });
      doc.querySelectorAll('[data-paper]').forEach((element) => { element.textContent = values[element.dataset.paper] ?? ''; });
      const columns = [['month','월'],['day','일'],['description','품목'],['spec','규격'],['quantity','수량'],['price','단가'],['supply','공급가액'],['tax','세액'],['remark','비고']];
      const paperRows = [...lines.children].map((row) => {
        const tr = document.createElement('tr');
        for (const [key,label] of columns) {
          if (key === 'tax' && docType === 'exempt') continue;
          const td = document.createElement('td');
          td.textContent = control(row,key).value.trim();
          td.dataset.caption = label;
          if (['quantity','price','supply','tax'].includes(key)) td.dataset.money = '';
          tr.append(td);
        }
        return tr;
      });
      doc.querySelector('[data-paper-lines]').replaceChildren(...paperRows);
    }
    preview.addEventListener('click',() => {
      if (!current() || !form.reportValidity()) return;
      drawPaper();
      doc.showModal();
    });
    root.querySelectorAll('[data-dismiss]').forEach((button) => button.addEventListener('click',() => button.closest('dialog').close()));
    const leave = () => {
      pauseLookup();
      issuerRequest?.abort();
      issuerRequest=null;
      if (lookedUp!==biz.value) lookupStatus.textContent='';
      if (calc.open) calc.close();
      if (doc.open) doc.close();
      rowInCalc = null;
    };
    const draftFingerprint = () => JSON.stringify([docType, activeKind, [...form.querySelectorAll('input')].map((field) =>
      issuerDefaults.has(field) && field.value===issuerDefaults.get(field) ? null :
      field.type === 'radio' ? field.checked : field.hasAttribute('data-number-group') ? numbers.raw(field.value) : field.value)]);
    const baseline = draftFingerprint();
    resume();
    return {leave, resume, hasDraft: () => draftFingerprint() !== baseline, destroy() { leave(); if (root.parentNode === host) root.remove(); }};
  }
  global.CoopTaxInvoiceDraft = Object.freeze({version: '1.1.0', mount});
})(window);
