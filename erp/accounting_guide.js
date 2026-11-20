/* 신고·결산 매뉴얼 1.4.3. 현재 가이드 칸에서 확인한 값만 복사한다. */
(function (host) {
    'use strict';
    const completed = ['완료', '실물결재완료'];
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const money = value => Number(value).toLocaleString('ko-KR') + '원';
    function period(month) {
        if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(month))) throw new Error('MONTH_REQUIRED');
        const [y, m] = month.split('-').map(Number);
        const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
        return {start: month + '-01', end: next + '-01', next};
    }
    function previousMonth(now = new Date()) {
        const kst = new Date(now.getTime() + 9 * 3600000);
        const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 1));
        return d.toISOString().slice(0, 7);
    }
    function amount(value, optional = false) {
        if (optional && (value === undefined || value === null || value === '')) return 0;
        if (!['string', 'number'].includes(typeof value) || String(value).trim() === '' || !/^-?\d+$/.test(String(value))) throw new Error('AMOUNT_INVALID');
        const n = Number(value);
        if (!Number.isSafeInteger(n)) throw new Error('AMOUNT_INVALID');
        return n;
    }
    function sum(a, b) { const n = a + b; if (!Number.isSafeInteger(n)) throw new Error('AMOUNT_INVALID'); return n; }
    const payrollAllowances = [['pay_meal','식대'],['pay_car','차량비'],['pay_child','보육수당']];
    function buildWithholdingFields(model, excluded) {
        if (!model || model.sources.length===0 || model.warnings.length || model.employeeCount===null) return null;
        const origins=[...new Set(model.sources.map(s=>s.salaryMonth))];
        if(origins.length!==1) return null;
        const n=enteredWon(excluded);
        if(n===null||n>=model.totals.gross)return null;
        return [
            ['② 귀속연월',origins[0],'승인 급여대장의 귀속월'],['③ 지급연월',model.month,'대조한 실제 지급 전표월'],
            ['A01 ④ 인원',model.employeeCount,'해당 귀속·지급월의 근로자 수'],
            ['A01 ⑤ 총지급액',model.totals.gross-n,'급여대장 지급계 − 증빙으로 확인한 서식 제외액'],
            ['A01 ⑥ 소득세 등',model.totals.income,'급여대장의 국세 원천징수액'],
            ['위택스 ⑦ 근로소득 인원',model.employeeCount,'같은 신고의 근로소득 인원'],
            ['위택스 ⑦ 근로소득 과세표준',model.totals.income,'근로소득이 A01뿐인 월의 국세 원천징수 기준액'],
            ['위택스 ⑦ 근로소득 지방소득세',model.totals.local,'급여대장의 지방소득세 공제 합계']
        ];
    }
    function enteredWon(v) {
        const s=String(v??'').trim();
        if(!/^\d+$|^\d{1,3}(?:,\d{3})+$/.test(s))return null;
        const n=Number(s.replaceAll(',',''));
        return Number.isSafeInteger(n)?n:null;
    }
    function analyze(month, coopId, journals, docs, taxDocs) {
        const {start, end} = period(month);
        const warnings = new Set();
        const payments = new Map();
        for (const row of journals) {
            if (row.coop_id !== coopId) throw new Error('TENANT_MISMATCH');
            if (row.Account !== '보통예금' || row.Date < start || row.Date >= end) throw new Error('PAYMENT_SCOPE');
            const match = String(row.Trans_ID).match(/^APR-(\d+)$/);
            if (!match) continue;
            const credit = amount(row.Credit);
            if (credit <= 0) continue;
            const p = payments.get(match[1]) || {credit:0, dates:new Set()};
            p.credit = sum(p.credit, credit); p.dates.add(row.Date); payments.set(match[1], p);
        }
        const sources = [], seen = new Set(), employeeIds = new Set();
        const allowances=Object.fromEntries(payrollAllowances.map(([key])=>[key,{sum:0,complete:true}]));
        let hasAdjustments=false;
        const totals = {gross:0, income:0, local:0, adjustmentIncome:0, adjustmentLocal:0};
        for (const doc of docs) {
            if (doc.coop_id !== coopId) throw new Error('TENANT_MISMATCH');
            const id = String(doc.id), p = payments.get(id);
            if (!p || seen.has(id)) continue;
            seen.add(id);
            if (doc.doc_type !== '지출결의(급여)' || !completed.includes(doc.status)) continue;
            const snap = doc.salary_ledger_snapshot;
            const rows = snap?.state?.rows;
            const salaryMonth = String(snap?.year_month || snap?.state?.yearMonth || '');
            if (!Array.isArray(rows) || !rows.length || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(salaryMonth)) {
                warnings.add('급여 완료본의 인원·금액 또는 귀속월이 빠져 있습니다. 해당 결재와 급여대장을 확인해 주세요.'); continue;
            }
            const t = {gross:0,income:0,local:0,adjustmentIncome:0,adjustmentLocal:0,net:0};
            let adjusted=false;
            try {
                for (const r of rows) {
                    for (const [key, field] of Object.entries({gross:'pay_total',income:'ded_income',local:'ded_local',net:'net_pay'})) {
                        const n = amount(r[field]); if (n < 0) throw new Error('AMOUNT_INVALID'); t[key] = sum(t[key], n);
                    }
                    const income=amount(r.payroll_tax_adjustment_income,true),local=amount(r.payroll_tax_adjustment_local,true);
                    adjusted=adjusted||income!==0||local!==0||Boolean(String(r.payroll_tax_adjustment_note??'').trim());
                    if(r.year_month&&r.year_month!==salaryMonth)warnings.add('급여 완료본 안에 다른 귀속월의 급여가 있습니다. 원본 급여대장을 확인해 주세요.');
                    t.adjustmentIncome = sum(t.adjustmentIncome,income);
                    t.adjustmentLocal = sum(t.adjustmentLocal,local);
                }
            } catch (_) { warnings.add('일부 급여 금액을 확인할 수 없어 그 완료본은 합계에서 제외했습니다. 급여대장을 확인해 주세요.'); continue; }
            if (t.net !== p.credit) {
                warnings.add('급여 실지급액과 지급 전표가 다른 완료본은 합계에서 제외했습니다. 부분 지급·추가 전표·지급일을 확인해 주세요.'); continue;
            }
            if(p.dates.size>1)warnings.add('지급일이 여러 개인 급여가 있습니다. 통장·급여대장에서 분할 지급 내역을 확인해 주세요.');
            hasAdjustments=hasAdjustments||adjusted;
            for (const r of rows) {
                if (r.emp_id) {
                    const employee=String(r.emp_id);
                    if(employeeIds.has(employee))warnings.add('같은 직원의 급여 기록이 여러 건입니다. 중복 결재·추가 지급 여부를 확인해 주세요.');
                    employeeIds.add(employee);
                }
                else warnings.add('직원 연결 정보가 없는 급여가 있어 인원 합계는 확인이 필요합니다.');
                for(const [key] of payrollAllowances){
                    const v=enteredWon(r[key]);
                    if(v===null)allowances[key].complete=false;else allowances[key].sum=sum(allowances[key].sum,v);
                }
            }
            for (const key of Object.keys(totals)) totals[key] = sum(totals[key], t[key]);
            sources.push({approvalId:id,title:doc.title || '급여 지출결의', salaryMonth, dates:[...p.dates].sort(), count:rows.length, ...t});
        }
        if ([...payments.keys()].some(id => !seen.has(id))) warnings.add('일부 지급 전표의 결재 원문을 조회하지 못했습니다. 급여 누락 여부와 열람 권한을 확인해 주세요.');
        const confirmed = [];
        for (const doc of taxDocs) {
            if (doc.coop_id !== coopId) throw new Error('TENANT_MISMATCH');
            if (!completed.includes(doc.status)) continue;
            const t = doc.expense_snapshot?.withholding_tax;
            if (!t || t.payment_month !== month || t.payment_confirmed !== true) continue;
            try {
                const national = amount(t.actual_national_tax), local = amount(t.actual_local_tax);
                if (national < 0 || local < 0 || sum(national,local) !== amount(doc.amount)) throw new Error('AMOUNT_INVALID');
                confirmed.push({title:doc.title || '원천세 지출결의', national, local});
            } catch (_) { warnings.add('원천세 결재의 국세·지방세 합계가 맞지 않습니다. 신고서와 결재를 확인해 주세요.'); }
        }
        if (confirmed.length > 1) warnings.add('같은 지급월의 원천세 완료 결재가 여러 건입니다. 중복·분할 여부를 확인하기 전에는 합산하지 마세요.');
        if (hasAdjustments) warnings.add('급여 세액 정산이 있습니다. 연말정산·중도퇴사·환급 내역을 구분하고 간이세액(A01)은 정산과 별도로 확인하세요.');
        if (new Set(sources.map(s => s.salaryMonth)).size > 1) warnings.add('여러 귀속월의 급여가 함께 지급됐습니다. 홈택스의 귀속연월 입력 기준을 확인해 주세요.');
        return {month, sources, totals, allowances, employeeCount:warnings.has('직원 연결 정보가 없는 급여가 있어 인원 합계는 확인이 필요합니다.') ? null : employeeIds.size, confirmed, warnings:[...warnings]};
    }
    function withSignal(query, signal) {
        if (signal?.aborted) throw new Error('READ_CANCELLED');
        return signal && typeof query.abortSignal === 'function' ? query.abortSignal(signal) : query;
    }
    async function allPages(makeQuery, signal, cap = 10000) {
        const rows = [], size = 500;
        for (let start = 0; start < cap; start += size) {
            const {data, error} = await withSignal(makeQuery().range(start, start + size - 1), signal);
            if (signal?.aborted) throw new Error('READ_CANCELLED');
            if (error) throw new Error('READ_FAILED');
            if (!Array.isArray(data)) throw new Error('READ_FAILED');
            rows.push(...data);
            if (data.length < size) return rows;
        }
        throw new Error('RESULT_TOO_LARGE'); // Never return a truncated tax total.
    }
    async function load(client, coopId, month, signal) {
        if (!client || !/^[a-f0-9-]{36}$/i.test(String(coopId || ''))) throw new Error('COOP_REQUIRED');
        const p = period(month);
        const journals = await allPages(() => client.from('ac_journal')
            .select('coop_id,Trans_ID,Date,Account,Credit').eq('coop_id',coopId)
            .eq('Account','보통예금').gt('Credit',0).gte('Date',p.start).lt('Date',p.end)
            .order('Trans_ID').order('Date').order('Credit'),signal);
        const ids = [...new Set(journals.map(r => String(r.Trans_ID).match(/^APR-(\d+)$/)?.[1]).filter(Boolean))];
        const docs = [];
        for (let i = 0; i < ids.length; i += 100) {
            docs.push(...await allPages(() => client.from('ref_approval')
                .select('id,coop_id,title,doc_type,status,salary_ledger_snapshot').eq('coop_id',coopId)
                .in('id',ids.slice(i,i+100)).order('id'),signal));
        }
        const taxDocs = await allPages(() => client.from('ref_approval')
            .select('id,coop_id,title,status,amount,expense_snapshot').eq('coop_id',coopId)
            .in('status',completed).contains('expense_snapshot',{withholding_tax:{payment_month:month}}).order('id'),signal);
        return analyze(month,coopId,journals,docs,taxDocs);
    }
    async function loadA01(client,coopId,month,signal) {
        const model=await load(client,coopId,month,signal), p=period(month);
        if (!model.sources.length || model.warnings.length) return model;
        const ids=model.sources.map(s=>'APR-'+s.approvalId);
        // Partial or duplicate payments may also have a bank entry in another month.
        // Check just these approvals, without changing the existing ledger totals.
        try {
            for(let i=0;i<ids.length;i+=100){
                const batch=ids.slice(i,i+100), scoped=async edge=>{
                    let q=client.from('ac_journal').select('coop_id,Trans_ID,Date').eq('coop_id',coopId)
                        .eq('Account','보통예금').in('Trans_ID',batch).gt('Credit',0);
                    q=edge==='before'?q.lt('Date',p.start):q.gte('Date',p.end);
                    const {data,error}=await withSignal(q.range(0,0),signal);
                    if(signal?.aborted||error||!Array.isArray(data)||data.some(x=>x.coop_id!==coopId||!batch.includes(x.Trans_ID)
                        ||!/^\d{4}-\d{2}-\d{2}$/.test(x.Date) || !(edge==='before'?x.Date<p.start:x.Date>=p.end))) throw Error('READ_FAILED');
                    return data.length>0;
                };
                if(await scoped('before') || await scoped('after')){
                    model.warnings.push('같은 급여 결재에 다른 지급월의 전표가 연결되어 있습니다. 통장과 지급 일정을 다시 확인해 주세요.');break;
                }
            }
        } catch (e) {
            if(signal?.aborted)throw e;
            model.warnings.push('다른 지급월에 연결된 전표가 있는지 확인하지 못했습니다. 지급월을 다시 조회해 주세요.');
        }
        return model;
    }
    const vatPeriods = Object.freeze({q1:[1,4],q2:[4,7],q3:[7,10],q4:[10,13],h1:[1,7],h2:[7,13]});
    function vatPeriod(year, key) {
        if (!/^20\d{2}$/.test(String(year)) || !Object.hasOwn(vatPeriods,key)) throw new Error('VAT_PERIOD_REQUIRED');
        const format=m=>m===13?`${Number(year)+1}-01-01`:`${year}-${String(m).padStart(2,'0')}-01`;
        const [a,b]=vatPeriods[key], end=format(b);
        return {start:format(a),end,last:new Date(Date.parse(end+'T00:00:00Z')-86400000).toISOString().slice(0,10)};
    }
    const vatAccounts=['부가세예수금','부가세대급금'];
    function analyzeVat(rows, coopId, p) {
        const values=Object.fromEntries(vatAccounts.map(k=>[k,{debit:0,credit:0,count:0}]));
        for (const row of rows) {
            if (row.coop_id!==coopId) throw new Error('TENANT_MISMATCH');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(row.Date) || row.Date<p.start || row.Date>=p.end || !Object.hasOwn(values,row.Account)) throw new Error('VAT_SCOPE');
            const value=values[row.Account], debit=amount(row.Debit), credit=amount(row.Credit);
            if (debit<0 || credit<0 || debit>0&&credit>0) throw new Error('AMOUNT_INVALID');
            value.debit=sum(value.debit,debit);value.credit=sum(value.credit,credit);value.count++;
        }
        return {period:p,values,count:rows.length};
    }
    async function loadVat(client,coopId,year,key,signal) {
        if (!client || !/^[a-f0-9-]{36}$/i.test(String(coopId||''))) throw new Error('COOP_REQUIRED');
        const p=vatPeriod(year,key);
        // 운영 장부에는 단일 행 키가 없으므로 순서가 흔들리는 여러 페이지를 합치지 않는다.
        // 한 조회의 반환 행 수를 서버의 전체 수와 대조한다. 같은 내용의 실제 두 행은 유지한다.
        const {data,count,error}=await withSignal(client.from('ac_journal')
            .select('coop_id,Date,Account,Debit,Credit',{count:'exact'}).eq('coop_id',coopId)
            .in('Account',vatAccounts).gte('Date',p.start).lt('Date',p.end).limit(1000),signal);
        if(signal?.aborted)throw new Error('READ_CANCELLED');
        if(error||!Array.isArray(data)||!Number.isSafeInteger(count))throw new Error('READ_FAILED');
        if(count!==data.length)throw new Error('RESULT_TOO_LARGE');
        return analyzeVat(data,coopId,p);
    }
    function vatResult(m) {
        const row=label=>{const v=m.values[label];return `<tr><th scope="row">${label}</th><td>${v.count?money(v.debit):'기록 없음'}</td><td>${v.count?money(v.credit):'기록 없음'}</td></tr>`;};
        return `<p class="ag-result-title">${esc(m.period.start)} ~ ${esc(m.period.last)} · 전표 대조</p>${m.count?`<div class="ag-table-wrap"><table><caption>예수금·대급금 장부 증감 · 대조용</caption><thead><tr><th>ERP 계정</th><th>차변</th><th>대변</th></tr></thead><tbody>${vatAccounts.map(row).join('')}</tbody></table></div><p>장부 대조값입니다. ERP 전표의 거래일·증빙을 홈택스 합계표와 대조하세요.</p>`:'<p class="ag-notice">이 기간에 두 세금 계정의 기록을 확인하지 못했습니다. 매출·매입 전표와 증빙을 확인하세요.</p>'}${vatReviewHtml()}`;
    }
    const vatFields=Object.freeze({
        1:['(1) 매출 세금계산서 발급분','매출처별 세금계산서합계표의 10% 과세 발급분. 전자·종이 중복과 수정발급을 확인하세요.'],
        3:['(3) 매출 신용카드·현금영수증 발행분','발행금액 집계표의 과세 매출 공급가액·세액. 세금계산서를 발급한 동일 거래는 (1)에만 넣으세요.'],
        4:['(4) 매출 기타(정규영수증 외)','앞 항목에 포함되지 않은 과세 매출. 공급일·대가·세액 구분 근거가 있는 매출 전표를 확인하세요.'],
        10:['(10) 세금계산서 수취분 일반매입','매입처별 세금계산서합계표에서 고정자산 등 별도 칸을 뺀 일반매입. 불공제 세금계산서는 (17)의 (53) 등에도 반영하세요.'],
        12:['(12) 세금계산서 수취분 고정자산','매입처별 세금계산서합계표와 고정자산 취득명세서. 감가상각비나 지급 잔액이 아니라 그 증빙의 공급가액·세액입니다.'],
        44:['(15) 명세 (44) 카드 등 일반매입','공제 대상 신용카드·현금영수증 수취명세서의 일반매입. 같은 매입의 세금계산서가 있으면 중복 공제하지 않아요.'],
        45:['(15) 명세 (45) 카드 등 고정자산매입','공제 대상 카드 등 수취명세서와 고정자산 취득명세서. (12)에 포함했는지 확인하세요.'],
        53:['(17) 명세 (53) 공제받지 못할 세금계산서','제22호 공제받지 못할 매입세액 명세서의 해당 공급가액·세액. 합계에서 차감되는 항목입니다.']
    });
    function reviewedRows(rows,label='담당자 확인값') {
        return `<div class="ag-checked-values"><h4>${esc(label)}</h4><dl>${rows.map(([title,value,why])=>`<div><dt>${esc(title)}</dt><dd><strong>${typeof value==='number'?value.toLocaleString('ko-KR'):esc(value)}</strong><button type="button" class="ag-copy" data-copy="${esc(value)}" aria-label="${esc(title)} 복사">복사</button></dd><dd class="ag-field-source">${esc(why)}</dd></div>`).join('')}</dl></div>`;
    }
    const screenPending = fields => `<p class="ag-screen-pending">화면 준비 중: ${esc(fields)}</p>`;
    function sourceGuide(rows) {
        return `<div class="ag-input-guide" role="group" aria-label="입력칸과 값의 출처"><div class="ag-input-legend" aria-hidden="true"><strong>입력칸</strong><span>가져올 값</span><small>출처</small></div>${rows.map(([field,value,source])=>`<div><strong>${esc(field)}</strong><span>${esc(value)}</span><small>${esc(source)}</small></div>`).join('')}</div>`;
    }
    function vatReviewHtml() {
        return `<section class="ag-field-review" data-ag-review="vat"><h4>부가가치세 신고 칸 확인</h4><label for="agVatBox">신고서 칸</label><select id="agVatBox" data-ag-input="box"><option value="">선택하세요</option>${Object.entries(vatFields).map(([k,[name]])=>`<option value="${k}">${esc(name)}</option>`).join('')}</select><p class="ag-field-source" data-ag-source>칸을 고르면 확인할 증빙을 보여줍니다.</p><div class="ag-amount-inputs"><label>공급가액 (원)<input type="text" inputmode="numeric" data-ag-input="supply" autocomplete="off"></label><label>세액 (원)<input type="text" inputmode="numeric" data-ag-input="tax" autocomplete="off"></label></div><label class="ag-review-check"><input type="checkbox" data-ag-input="checked"> 선택한 기간의 증빙, 중복·취소와 공제 여부를 확인했습니다.</label><button type="button" data-ag-confirm class="btn btn-outline-primary">이 칸 확인</button><div data-ag-output aria-live="polite"></div></section>`;
    }
    function buildVatFields(box,supply,tax) {
        if(!Object.hasOwn(vatFields,box))return null;
        const s=enteredWon(supply),v=enteredWon(tax);
        if(s===null||v===null||(s===0&&v!==0))return null;
        const [name,why]=vatFields[box];
        return [[name+' 공급가액',s,why],[name+' 세액',v,'공급가액과 구분해 증빙에서 확인한 세액']];
    }
    const link = (url, text) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text} ↗</a>`;
    const nts = 'https://www.nts.go.kr';
    const payPeriodSlots=[
        ['origin','② 귀속연월','승인 급여대장의 귀속월'],['paid','③ 지급연월','연결 지급 전표일 · 실제 이체와 대조']
    ];
    const a01Slots=[
        ['people','A01 ④ 인원수','같은 귀속·지급월의 근로자 수'],['gross','A01 ⑤ 총지급금액','승인 급여대장 지급계에서 확인한 서식 제외액만 차감'],
        ['income','A01 ⑥ 소득세 등','급여대장의 국세 소득세 공제액']
    ];
    const localPaySlots=[['localPeople','⑦ 근로소득 · 인원','같은 관할에 신고하는 인원'],['localBase','⑦ 근로소득 · 과세표준','같은 신고의 국세 원천징수액'],['localTax','⑦ 근로소득 · 지방소득세','급여대장 지방소득세 공제 합계']];
    function fieldSlots(rows,label='신고 입력칸과 ERP 확인값') {
        return `<div class="ag-slots" role="group" aria-label="${esc(label)}">${rows.map(([id,title,source])=>`<div class="ag-slot" id="ag-slot-${esc(id)}" data-ag-slot="${esc(id)}" tabindex="-1"><strong>${esc(title)}</strong><div class="ag-slot-value"><output aria-label="${esc(title)} 확인값"></output><span data-ag-empty>확인 필요</span><button type="button" class="ag-copy" data-ag-live-copy aria-label="${esc(title)} 복사" hidden disabled>복사</button></div><small>${esc(source)}</small></div>`).join('')}</div>`;
    }
    const withholdingShots={
        'tax-menu':['tax-filing-menu.jpg',71,33],
        'withholding-menu':['withholding-menu.jpg',103,36],
        'general-menu':['withholding-general-menu.jpg',151,100],
        'regular-menu':['regular-filing.jpg',258,77],
        period:['payment-month-confirmation.jpg',344,92,'캡처의 2026년 11월은 예시입니다.'],
        'business-check':['business-number-confirm-button.png',234,58,'사업자등록번호 칸의 이름과 확인 버튼입니다.'],
        'income-type':['employment-income-checkbox.jpg',113,28],
        'intro-next':['basic-information-save-next.jpg',132,26],
        'a01-current':['a01-guide-full.png',743,138,'A01 ④~⑧의 제목과 빈 입력칸입니다.'],
        a99:['a99-guide.png',525,91,'자동 합계의 제목과 항목 일부입니다.'],
        'a01-next':['a01-save-next.jpg',136,25],
        'a01-confirm':['a01-save-dialog.jpg',266,19,'변경 확인창의 둘째 줄입니다.'],
        'annex-type':['annex-income-select.jpg',198,35],
        'annex-warning':['annex-warning.jpg',239,22,'선택하지 않은 내용은 삭제된다는 안내입니다.'],
        'annex-empty':['annex-empty.jpg',180,27],
        'annex-confirm':['annex-next-dialog.jpg',286,21]
    };
    function withholdingShot(id,title) {
        const slot=`withholding-${id}`;
        const pending=`<div class="ag-proof-place"><h4>${esc(title)}</h4><small>화면 준비 중</small></div>`;
        const capture=Object.hasOwn(withholdingShots,id)?withholdingShots[id]:null;
        if(!capture)return `<div data-ag-capture-slot="${slot}">${pending}</div>`;
        const [file,width,height,note]=capture;
        return `<div data-ag-capture-slot="${slot}"><figure class="ag-screen ag-screen-inline ag-withholding-shot"><img src="accounting-guide/hometax-${file}" width="${width}" height="${height}" alt="${esc(title)}" loading="lazy" decoding="async"><figcaption><span>홈택스 화면 일부${note?' · '+esc(note):''}</span><button type="button" class="ag-screen-action" data-ag-screen-open aria-haspopup="dialog" aria-label="${esc(title)} 화면 크게 보기">크게 보기</button></figcaption></figure><div data-ag-capture-fallback hidden>${pending}</div></div>`;
    }
    const withholdingStep=(id,title,body)=>[title,`<p>${body}</p>${withholdingShot(id,title)}`];
    const a01ReviewPrompt='승인 급여와 지급 전표를 불러와 확인해 주세요.';
    const checkPay= '<button type="button" class="ag-screen-action" data-ag-flow-go="0">ERP 값 확인 단계로 이동</button>';
    const a01Walk=`<p>원천징수이행상황신고서의 <b>근로소득 · 간이세액 A01</b> 행과 ERP 확인값을 대조하세요.</p><div class="ag-walk-grid">${withholdingShot('a01-current','간이세액 A01 · ④ 인원수, ⑤ 총지급금액, ⑥ 소득세 등')}<div>${fieldSlots(a01Slots,'간이세액 A01 입력칸과 ERP 확인값')}${checkPay}</div></div><p>⑦ 농어촌특별세·⑧ 가산세는 해당 근거가 있을 때만 확인하세요. 이 일반 급여 예시는 환급이 없어 <b>승계명세서</b>와 <b>환급 조정</b>을 열지 않습니다.</p><p>${link('https://www.law.go.kr/LSW/flDownload.do?flSeq=164443683','2026년 원천징수이행상황신고서')}</p>`;
    const steps = {
        withholding: [
            ['ERP에서 지급월과 신고 입력값 확인', `<p>정산·환급이 없는 일반 급여 정기신고 예시입니다. 다른 소득, 정산·환급, 별도 부표의 절차는 이 예시에서 확인하지 않았습니다.</p><div class="ag-loader"><label for="agPaymentMonth">급여 지급월</label><input type="month" id="agPaymentMonth"><button type="button" id="agLoad" class="btn btn-primary">ERP 금액 불러오기</button></div><div id="agResult" aria-live="polite">지급월을 선택하고 승인된 급여와 지급 전표를 대조하세요.</div><div id="agA01Review" aria-live="polite">${a01ReviewPrompt}</div><p>${link('https://www.law.go.kr/법령/소득세법시행령/제214조','신고서 제외 근거')}</p>`],
            withholdingStep('tax-menu','세금신고',`${link('https://www.hometax.go.kr','홈택스')}에 조합 사업자로 로그인하고 <b>세금신고</b>를 엽니다.`),
            withholdingStep('withholding-menu','원천세 신고','<b>원천세 신고</b>를 선택합니다.'),
            withholdingStep('general-menu','일반신고','<b>일반신고</b>를 선택합니다.'),
            withholdingStep('regular-menu','정기신고','<b>정기신고</b>를 엽니다.'),
            ['신고할 지급연월 확인',`<p>‘… 지급분을 신고하는 작성화면 입니다.’에 표시된 월이 이번 신고의 지급월과 같으면 <b>확인</b>을 누릅니다. ② 귀속연월과 ③ 지급연월은 확인한 ERP 값과 각각 대조합니다.</p><div class="ag-walk-grid">${withholdingShot('period','신고할 지급연월 안내와 확인 버튼')}<div>${fieldSlots(payPeriodSlots,'귀속·지급연월과 ERP 확인값')}${checkPay}</div></div>`],
            withholdingStep('business-check','사업자등록번호 옆 확인','신고할 조합의 사업자등록번호가 맞는지 보고 번호 옆 <b>확인</b>을 누릅니다.'),
            withholdingStep('business-result','조회가 완료되었습니다','조회가 완료되면 신고할 조합의 정보가 맞는지 확인합니다.'),
            withholdingStep('income-type','근로소득 선택','일반 급여 신고 예시에서는 <b>근로소득</b>을 선택합니다.'),
            withholdingStep('intro-next','기본정보 저장 후 다음이동','기본정보와 소득 구분을 확인하고 <b>저장 후 다음이동</b>을 누릅니다.'),
            withholdingStep('intro-confirm','저장 후 다음화면으로 이동하시겠습니까?','신고할 조합·지급연월·소득 구분이 맞으면 <b>예</b>를 누릅니다.'),
            ['간이세액 A01 입력칸 확인',a01Walk],
            withholdingStep('a99','A99 총합계 대조','<b>A99 총합계</b>는 홈택스의 자동 집계입니다. 직접 입력하지 말고 입력한 신고 내용과 맞는지 비교하세요.'),
            withholdingStep('a01-next','원천징수이행상황신고서 저장 후 다음이동','A01 입력 내용과 A99 총합계를 대조한 뒤 <b>저장 후 다음이동</b>을 누릅니다.'),
            withholdingStep('a01-confirm','변경내용 확인','‘변동된 내용이 존재합니다.’가 표시되면 입력한 내용을 확인한 뒤 <b>예</b>를 누릅니다. 다시 확인하려면 <b>아니오</b>를 누르세요.'),
            withholdingStep('annex-type','신고서 소득 종류 선택','이 일반 급여 예시는 해당 부표를 선택하지 않습니다. 제출할 별도 부표가 있는 신고에는 이 예시를 그대로 적용하지 마세요.'),
            withholdingStep('annex-warning','작성 중인 부표 삭제 안내','선택하지 않은 기존 부표 내용은 삭제될 수 있습니다. 실제로 작성할 부표가 없을 때만 아무것도 선택하지 않고 이동하세요. 기존 부표가 있거나 확실하지 않으면 진행하지 말고 내용을 확인하세요.'),
            withholdingStep('annex-empty','신고서 부표 작성','빈 예시에서는 <b>작성할 내역 없음</b>으로 표시됩니다.'),
            withholdingStep('annex-next','부표 화면에서 저장 후 다음이동','작성할 내역이 없는 이 예시에서는 <b>저장 후 다음이동</b>을 누릅니다.'),
            withholdingStep('annex-confirm','부표 화면 이동 안내','별도 작성 내용이 없음을 확인했으면 이동 안내에서 <b>예</b>를 누릅니다.'),
            withholdingStep('tax-due','납부(환급신청)할 세액','홈택스에 표시된 최종 세액을 신고서의 집계 및 증빙과 대조합니다.'),
            withholdingStep('validate','작성완료','<b>작성완료</b>를 누르면 신고서를 검증합니다.'),
            withholdingStep('validation-error','검증 오류가 표시되는 경우','입력 없이 A01의 전항목이 0인 상태에서는 검증 오류가 납니다. 오류가 나면 실제 증빙과 입력 내역을 확인하세요.'),
            withholdingStep('submission','제출 전 마지막 확인','마지막 화면에 <b>이에 동의합니다.</b>와 <b>신고서 제출하기</b>가 표시됩니다. 이 예시에서는 두 항목을 누르지 않았습니다.'),
            ['신고를 마친 뒤 국세 납부', '<p>실제 신고를 제출했다면 접수증과 납부서를 확인하세요. <b>납부·고지·환급 → 세금납부 → 납부할 세액 조회/납부</b>에서 납부 내역을 확인합니다.</p><p>일반적인 매월 신고는 지급월의 다음 달 10일까지입니다. 휴일·기한 연장·반기납부 등은 실제 신고 안내의 기한을 확인하세요.</p>'],
            ['위택스에서 지방소득세 특별징수', `<p>${link('https://www.wetax.go.kr','위택스')}의 <b>지방소득세 → 특별징수</b>에서 해당 국세 신고와 같은 귀속·지급연월 및 관할을 확인하세요.</p><dl class="ag-fields"><dt>⑦ 근로소득 · 인원</dt><dd>동일 신고의 해당 관할 근로소득 인원. A01만 있으면 확인한 A01 ④를 사용합니다.</dd><dt>⑦ 근로소득 · 과세표준</dt><dd>확정된 근로소득의 국세 원천징수 기준액. A01만 있는 신고라면 확인한 A01 ⑥입니다.</dd><dt>⑦ 근로소득 · 지방소득세</dt><dd>급여대장의 지방소득세 공제 합계. 국세 납부 총액에 일괄 비율을 곱하지 말고, 직원별 세액·가감세액·환급을 해당 신고와 대조하세요.</dd></dl>${screenPending('위택스 지방소득세 특별징수의 근로소득 입력칸')}<p>${link('https://www.law.go.kr/flDownload.do?bylClsCd=110202&flSeq=157508863&gubun=','지방소득세 특별징수 납부서')}</p>${fieldSlots(localPaySlots,'위택스 · 확인한 단일 관할 입력칸')}`],
            ['간이지급명세서·연간 지급명세서 확인', `<p>원천세 신고와 별도로 홈택스 <b>지급명세·자료·공익법인 → 일용·간이지급명세서</b>에서 <b>간이지급명세서(근로소득)</b>를 선택해 직원별 자료를 제출하세요. 상용근로소득은 2026년 지급분까지 반기별, 2027년 1월 지급분부터 월별 제출입니다. 일용·사업·기타소득은 각자 다른 제출 경로와 기한을 확인합니다.</p><p>연간 지급명세서도 해당 연도 안내와 제출 내역을 별도로 확인하세요. ${link('https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=239032&mi=40678','국세청 간이지급명세서 제출 안내')}</p>`],
            ['ERP에 납부 증빙과 실제 납부일 기록', '<p><b>전자결재 → 지출결의 → 원천세</b>에서 국세·지방세를 구분해 확인하고 신고서·납부서를 첨부하세요. 이미 납부했다면 선지출과 실제 납부일을 입력합니다. 결재 완료 후 회계의 <b>자동연동</b> 탭에서 <b>전자결재 연동 → 실행</b>을 눌러 전표를 반영합니다.</p><p>신고서 제출, 실제 납부, 결재 승인, 회계 반영은 서로 다른 단계입니다. 이전에 입력한 전표가 있는지도 확인해 중복 반영하지 마세요.</p>']
        ],
        vat: [
            ['홈택스 신고 대상 확인·장부 대조', `<p>홈택스 <b>부가가치세 신고 → 신고도움자료조회 → 예정고지 세액 조회</b>에서 예정신고·예정고지 여부를 먼저 확인합니다. 확정신고는 화면이 표시하는 거래 기간을 확인하고 이미 신고한 예정분을 다시 넣지 마세요.</p><p>공급일 기준 세금계산서·카드·현금영수증·기타 과세매출과 매입 증빙을 준비합니다. 아래 장부 기간은 홈택스와 같게 선택하세요.</p><div class="ag-loader"><label for="agVatYear">거래 연도</label><input id="agVatYear" type="number" min="2000" max="2099" step="1"><label for="agVatPeriod">거래 기간</label><select id="agVatPeriod"><option value="q1">1~3월</option><option value="q2">4~6월</option><option value="q3">7~9월</option><option value="q4">10~12월</option><option value="h1">1~6월</option><option value="h2">7~12월</option></select><button type="button" id="agVatLoad" class="btn btn-primary">장부 대조</button></div><div id="agVatResult" role="status">신고 대상 거래 기간을 선택하고 장부 대조를 누르세요.</div><p>${link(nts+'/nts/cm/cntnts/cntntsView.do?cntntsId=7693&mi=2225','국세청 부가가치세 신고·납부기한')}</p>`],
            ['카드 매입세액 공제 여부 확인', `<p>홈택스의 <b>계산서·영수증·카드 → 신용카드 매입 → 사업용신용카드 사용내역 → 매입세액 공제 확인/변경</b>을 엽니다. 상단 검색창에 <b>매입세액 공제 확인</b>을 입력해도 됩니다.</p><p>조회 기간을 선택하고 각 건의 공제·불공제를 확인합니다. 업무와 무관한 지출, 기업업무추진비, 비영업용 소형승용차 관련 등 공제 제한 거래는 제외합니다. 면세 거래에는 공제할 부가세가 없습니다.</p><p>취소분을 반영하고 같은 거래를 세금계산서와 카드로 중복 공제하지 마세요. 법인 명의 카드는 통상 별도 등록 없이 조회됩니다. 누락된 카드는 원자료를 확인합니다.</p><details class="ag-screen"><summary>홈택스 카드 매입 메뉴 화면 보기</summary><figure><img src="accounting-guide/hometax-card-vat.jpg" alt="홈택스 매입세액 공제 확인 검색 결과" loading="lazy"><figcaption>국세청 홈택스 공개 메뉴 · 2026-10-08 확인.</figcaption></figure></details>`],
            ['홈택스 부가가치세 정기신고 열기', `<p>${link('https://www.hometax.go.kr','홈택스')}의 <b>세금신고 → 부가가치세 신고 → 일반과세자 신고 → 정기신고</b>로 이동하세요. 조합의 사업자등록번호와 예정·확정 신고 기간을 확인합니다.</p>${screenPending('홈택스 일반과세자 부가가치세 신고의 매출·매입 입력칸')}<p>${link(nts+'/nts/na/ntt/selectNttInfo.do?mi=2409&nttSn=1353101','국세청 2026년 전자신고 화면 안내')}</p>`],
            ['과세표준 및 매출세액 작성', `${sourceGuide([['(1) 세금계산서 발급분','공급가액·세액','매출처별 세금계산서합계표'],['(3) 카드·현금영수증 발행분','취소·(1) 중복 제외 후 공급가액·세액','신용카드매출전표 등 발행금액 집계표'],['(4) 기타','위 칸에 포함하지 않은 과세 공급','공급일과 과세 여부가 확인된 원거래 증빙']])}<p>${link('https://www.law.go.kr/LSW/flDownload.do?flSeq=162624807','2026년 일반과세자 부가가치세 신고서·작성방법')}</p>`],
            ['매입세액과 불공제 반영', `${sourceGuide([['(10) 일반매입 · (12) 고정자산매입','해당 공급가액·세액을 구분','매입처별 세금계산서합계표·취득명세'],['(44) 일반매입 · (45) 고정자산매입','공제 대상 카드 등 수령명세의 금액·세액','신용카드매출전표 등 수령명세서 · (15) 세부명세'],['(53) 공제받지 못할 매입세액','불공제 공급가액·세액','별지 제22호 불공제 명세 · (17) 세부명세']])}<p>같은 매입을 세금계산서와 카드에 두 번 넣지 마세요.</p>${vatReviewHtml()}`],
            ['제출·접수·납부 대조', '<p>예정고지·기납부·가산세와 최종 납부/환급액을 검토한 뒤 제출합니다. 홈택스의 신고내역에서 실제 접수번호를 확인하고 신고서와 부속명세를 보관하세요. 납부내역과 통장 출금을 대조한 뒤 ERP 전표에 실제 거래일과 증빙을 연결합니다.</p>']
        ],
        closing: [
            ['결산 연도 선택·자료 정리', '<p>회계 조회 연도를 결산할 연도로 바꾸고 미반영 결재와 미분류 거래, 증빙 누락을 정리합니다. 전년도 마감 자료를 확인하려면 그 연도를 선택하세요.</p><p>통장 잔액, 현금, 카드 미결제액, 매출채권, 대출·미지급금과 장부를 대조합니다. 연말 전후 거래는 거래일과 공급 시기가 올바른 연도에 기록됐는지 확인합니다.</p>'],
            ['재고·자산·부채 확인', '<p><b>자산·재고</b> 탭에서 실제 보유 수량과 원가, 미입고 주문을 확인합니다. 검수되지 않은 물량을 보유 재고로 잘못 넣지 마세요. 판매·무료 사용·불량·폐기 내역도 대조합니다.</p><p>발전소 등 고정자산과 감가상각, 선급·미수·미지급, 선수수익, 출자금 반환채무를 확인합니다. 필요한 조정 전표는 근거를 남겨 등록합니다.</p>'],
            ['결산보고서 생성·확인', '<p>회계 화면 상단에서 연도를 선택한 뒤 <b>결산 보고서 생성</b>을 누르세요. 재무상태표·손익계산서·이익잉여금처분계산서의 자산과 부채·자본 합계, 당기손익과 잉여금 연결을 검토합니다.</p><p>법정·임의 적립금과 배당·결손금 처리는 해당 조합의 유형, 정관, 총회 의결에 맞춥니다. 일반협동조합과 사회적협동조합의 기준을 혼용하지 마세요. ERP의 법인세 계산은 실제 세무조정을 대신하지 않습니다.</p>'],
            ['감사 검토·총회 자료 연결', '<p>확인한 결산보고서를 감사에게 제공하고 <b>회의 꾸러미 → 감사보고서</b>에서 검토와 전자서명을 요청합니다. 정기총회 자료에는 승인 대상 결산 연도를 선택해 확정 자료를 연결하세요.</p><p>수정이 필요하면 먼저 장부와 결산 자료를 바로잡고 감사·의결 절차에 맞춰 다시 확인합니다. 서명한 보고서의 내용을 임의로 바꾸지 마세요.</p>'],
            ['법인세·법인지방소득세 신고', `<p>회계사무실에 맡기면 결산보고서, 장부, 증빙과 조정 근거를 전달하세요. 직접 신고하는 경우 홈택스 <b>세금신고 → 법인세 → 신고도움 서비스</b>에서 신고 자료를 확인하고 신고서·세무조정을 준비합니다.</p><p>일반적인 법인세 신고는 사업연도 종료월 말일부터 3개월 이내입니다. 법인지방소득세는 별도 신고이며, 실제 적용 기한과 대상은 국세청·위택스에서 확인하세요.</p><p>${link('https://g.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7970&mi=2374','국세청 법인세 신고 안내·공식 영상')} · ${link('https://www.wetax.go.kr','위택스')}</p>`],
            ['마감·보관', '<p>결산 검토와 필요한 수정을 반영한 뒤 <b>자동연동 → 연말결산(손익마감) → 실행</b>에서 연도와 마감 금액을 확인합니다. 최종 신고 후 추가 조정이 필요하면 기존 마감·재개방 절차를 이용하고 변경 근거를 남기세요.</p><p>최종 장부, 재무제표, 신고서·접수증과 증빙을 함께 보관합니다. ERP 마감은 홈택스 신고 완료나 총회 승인 그 자체가 아닙니다.</p>']
        ]
    };
    function payrollReviewHtml(model) {
        if(!buildWithholdingFields(model,'0'))return '';
        const allow=payrollAllowances.map(([key,label])=>{const value=model.allowances?.[key];return `${label} ${value?.complete?money(value.sum):'급여명세 확인'}`;}).join(' · ');
        return `<section class="ag-field-review" data-ag-review="pay"><h4>A01 입력값 확인</h4><p class="ag-field-source">급여대장 수당: ${esc(allow)}. 직원별 급여명세에서 신고 제외 여부를 확인하세요.</p><label for="agA01Excluded">총지급액에서 제외할 금액 (원)</label><input id="agA01Excluded" type="text" inputmode="numeric" autocomplete="off" data-ag-input="excluded" aria-describedby="agA01ReviewHelp"><p class="ag-field-source" id="agA01ReviewHelp">직원별 비과세 코드·지급 근거로 확인한 서식 제외액의 합계. 제외할 금액이 없는 것을 확인했다면 0을 입력하세요.</p><label class="ag-review-check"><input type="checkbox" data-ag-input="checked"> 정산 없는 매월 신고입니다. 통장에서 실제 지급월과 금액을 대조했고, 급여명세에서 서식 제외액을 확인했습니다.</label><label class="ag-review-check"><input type="checkbox" data-ag-input="localScope"> 위택스 신고도 같은 한 관할에 전체 인원과 금액을 신고합니다.</label><button type="button" data-ag-confirm class="btn btn-outline-primary">신고 칸 확인</button><div data-ag-output aria-live="polite"></div></section>`;
    }
    function resultHtml(model) {
        const rows = [
            ['급여 인원', model.employeeCount, '명', '같은 직원의 여러 지급은 한 명으로 집계'],
            ['급여대장 지급계',model.totals.gross,'원','신고 ⑤ 총지급액은 과세급여와 신고 대상 비과세로 다시 대조'],
            ['급여 공제 소득세',model.totals.income,'원','근로소득 국세 · 정산 반영 전'],
            ['급여 공제 지방소득세',model.totals.local,'원','특별징수 지방세 · 정산 반영 전'],
            ['급여 소득세 정산',model.totals.adjustmentIncome,'원','환급·추가징수 내역을 구분해 신고'],
            ['급여 지방소득세 정산',model.totals.adjustmentLocal,'원','지방세 정산 내역 별도 확인']
        ];
        const table = model.sources.length ? `<div class="ag-table-wrap"><table><caption>${esc(model.month)} 지급 · 승인 급여와 지급 전표 대조</caption><thead><tr><th>ERP 항목</th><th>금액·인원</th><th>확인할 내용</th></tr></thead><tbody>${rows.map(([label,n,unit,note])=>`<tr><th scope="row">${label}</th><td>${n===null?'확인 필요':n.toLocaleString('ko-KR')+unit}</td><td>${note}</td></tr>`).join('')}</tbody></table></div><details class="ag-source"><summary>근거 급여와 지급일</summary><ul>${model.sources.map(s=>`<li>${esc(s.title)} · 귀속 ${esc(s.salaryMonth)} · 지급 전표일 ${s.dates.map(esc).join(', ')} · ${s.count}명</li>`).join('')}</ul></details>` : '<p class="ag-notice">이 지급월에 금액까지 대조된 급여 완료본이 없습니다. 급여 승인·회계 연동·지급 전표일을 확인해 주세요.</p>';
        const confirmed = model.confirmed.length ? `<div class="ag-confirmed"><h4>원천세 완료 결재에 기록된 금액</h4>${model.confirmed.map(t=>`<p>${esc(t.title)}<br>국세 <b>${money(t.national)}</b> · 지방세 <b>${money(t.local)}</b></p>`).join('')}<p>결재 금액입니다. 실제 신고서·납부 결과와 대조하세요.</p></div>` : '';
        return `<p class="ag-result-title">${esc(model.month)} 급여 지급분 · 일반 매월 신고라면 ${period(model.month).next} 신고·납부</p>${table}${confirmed}${model.warnings.length?`<div class="ag-notice"><b>확인이 필요한 자료</b><ul>${model.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:''}<p class="ag-footnote">수기로 지급한 급여와 배당·강사료 등 다른 소득은 별도 증빙과 대조하세요.</p>`;
    }
    function stepHtml(list) {
        return list.map(([title,html],i)=>`<details class="ag-step"${i===0?' open':''}><summary><span class="ag-number">${i+1}</span>${title}</summary><div class="ag-step-body">${html}<div class="ag-step-nav"><span>${i+1} / ${list.length}</span>${i?`<button type="button" data-step="${i-1}">이전</button>`:''}${i<list.length-1?`<button type="button" data-step="${i+1}">다음</button>`:''}</div></div></details>`).join('');
    }
    function withholdingFlowHtml(list) {
        return `<section class="ag-withholding-flow" aria-label="원천세 정기신고 순서"><header class="ag-flow-head"><div><p class="ag-flow-position" id="agWithholdingPosition">1 / ${list.length}</p><h4 id="agWithholdingTitle" tabindex="-1">${esc(list[0][0])}</h4></div><label class="ag-flow-picker" for="agWithholdingSelect">단계 바로가기<select id="agWithholdingSelect">${list.map(([title],i)=>`<option value="${i}">${i+1}. ${esc(title)}</option>`).join('')}</select></label></header><div class="ag-flow-body">${list.map(([,html],i)=>`<div data-ag-flow-panel${i?' hidden':''}>${html}</div>`).join('')}</div><nav class="ag-flow-nav" aria-label="원천세 단계 이동"><button type="button" data-ag-flow-move="-1" disabled>이전</button><button type="button" data-ag-flow-move="1">다음</button></nav></section>`;
    }
    function bindWithholdingFlow(container,list,active) {
        const doc=container.ownerDocument;
        for(const img of container.querySelectorAll('.ag-withholding-shot img')){
            img.addEventListener('error',()=>{
                const shot=img.closest('figure');shot.hidden=true;
                shot.nextElementSibling.hidden=false;
            },{once:true});
        }
        const panels=[...container.querySelectorAll('[data-ag-flow-panel]')];
        const title=container.querySelector('#agWithholdingTitle'), position=container.querySelector('#agWithholdingPosition');
        const select=container.querySelector('#agWithholdingSelect');
        const prev=container.querySelector('[data-ag-flow-move="-1"]'), next=container.querySelector('[data-ag-flow-move="1"]');
        let index=0;
        function move(target,origin,heading) {
            if(!active()||!container.isConnected||!Number.isInteger(target)||target===index||!panels[target])return;
            const focused=doc.activeElement===origin;
            const inOldPanel=panels[index].contains(doc.activeElement);
            panels[index].hidden=true;index=target;panels[index].hidden=false;
            position.textContent=`${index+1} / ${list.length}`;title.textContent=list[index][0];select.value=String(index);
            prev.disabled=index===0;next.disabled=index===list.length-1;
            if(inOldPanel||heading&&(focused||doc.activeElement===doc.body)){
                title.focus({preventScroll:true});title.scrollIntoView?.({block:'nearest'});
            }
        }
        select.addEventListener('change',()=>move(Number(select.value),select,false));
        container.addEventListener('keydown',event=>{
            if(event.key==='Enter'&&event.repeat&&!event.isComposing&&event.target.closest('[data-ag-flow-move],[data-ag-flow-go]'))event.preventDefault();
        });
        container.addEventListener('click',event=>{
            const button=event.target.closest('[data-ag-flow-move],[data-ag-flow-go]');
            if(!button||button.disabled||button.closest('[data-ag-flow-panel]')?.hidden)return;
            move(button.hasAttribute('data-ag-flow-go')?Number(button.dataset.agFlowGo):index+Number(button.dataset.agFlowMove),button,true);
        });
    }
    function bindRead({input,extra,button,out,active,load,render,error,loading,changed,timeout=12000,onReset=()=>{},onResult}) {
        let pending=null;
        const label=button.textContent;
        const setIdle=()=>{button.disabled=false;button.textContent=label;};
        function clear(note) {
            const job=pending;pending=null;
            if (job) {host.clearTimeout(job.timer);job.cancel?.();job.controller.abort();}
            setIdle();out.textContent=note||changed;onReset();
        }
        function refreshSelection(){clear(changed);}
        input.addEventListener('input',refreshSelection);
        extra?.addEventListener('change',refreshSelection);
        button.addEventListener('click',async()=>{
            if (pending||!active()) return;
            const controller=new host.AbortController(),job={controller},value=input.value,more=extra?.value;
            pending=job;button.disabled=true;button.textContent='불러오는 중…';out.textContent=loading;onReset();
            const match=()=>pending===job&&active()&&out.isConnected&&(!onResult||input.value===value&&extra?.value===more);
            try {
                const limit=new Promise((_,reject)=>{
                    job.cancel=()=>reject(new Error('READ_CANCELLED'));
                    job.timer=host.setTimeout(()=>{reject(new Error('READ_TIMEOUT'));controller.abort();},timeout);
                });
                const model=await Promise.race([load(value,more,controller.signal),limit]);
                if(match()){out.innerHTML=render(model);onResult?.(model);}
            } catch (e) {if(match())out.textContent=error(e);}
            finally {
                host.clearTimeout(job.timer);
                if (pending===job) {pending=null;setIdle();}
            }
        });
        return {clear};
    }
    function mount({root, client, coopId, active=()=>true}) {
        if (!root || root.dataset.mounted === '1') return null;
        root.dataset.mounted='1';
        root.innerHTML = `<div class="ag-heading"><h3>신고·결산 매뉴얼</h3><p class="ag-field-source">공식 서식 확인: 2026. 11. 19.</p></div><div class="ag-topics" role="group" aria-label="회계 안내 선택"><button type="button" data-topic="withholding" aria-pressed="true">원천세</button><button type="button" data-topic="vat" aria-pressed="false">부가가치세</button><button type="button" data-topic="closing" aria-pressed="false">연말결산</button><button type="button" data-topic="smarta" aria-pressed="false">법인세</button></div><div id="agSteps"></div>`;
        let selected='', read=null, payroll=null;
        const choices=root.querySelector('#agSteps'), remembered=new Map();
        const liveCopies=new WeakMap();
        function putValues(ids,values={},current=()=>false) {
            for(const id of ids){
                const slot=choices.querySelector(`#ag-slot-${id}`);if(!slot)continue;
                const out=slot.querySelector('output'),empty=slot.querySelector('[data-ag-empty]'),b=slot.querySelector('[data-ag-live-copy]');
                const val=values[id],ok=current()&&(typeof val==='number'?Number.isSafeInteger(val):typeof val==='string'&&!!val.trim());
                out.textContent=ok?(typeof val==='number'?val.toLocaleString('ko-KR'):val):'';
                empty.hidden=ok;b.hidden=!ok;b.disabled=!ok;b.textContent='복사';
                liveCopies.set(b,ok?{value:String(val),current}:null);
            }
        }
        const payrollIds=[...payPeriodSlots,...a01Slots,...localPaySlots].map(r=>r[0]);
        const resetPayroll=()=>{payroll=null;putValues(payrollIds);const review=choices.querySelector('#agA01Review');if(review)review.textContent=a01ReviewPrompt;};
        const viewer=root.ownerDocument.createElement('dialog');
        viewer.className='ag-screen-dialog';viewer.setAttribute('aria-labelledby','agScreenTitle');
        viewer.innerHTML='<div class="ag-screen-head"><h4 id="agScreenTitle">매뉴얼 화면</h4><button type="button" data-ag-screen-size aria-pressed="false">원래 크기</button><button type="button" data-ag-screen-close>닫기</button></div><div class="ag-screen-viewport" tabindex="0" aria-label="확대 이미지 영역"><img alt=""></div>';
        root.append(viewer);
        const photo=viewer.querySelector('img'),scroll=viewer.querySelector('.ag-screen-viewport');
        const size=viewer.querySelector('[data-ag-screen-size]'),dismiss=viewer.querySelector('[data-ag-screen-close]');
        const zoom=inFullSize=>{size.setAttribute('aria-pressed',String(inFullSize));size.textContent=inFullSize?'창에 맞추기':viewer.classList.contains('ag-withholding-image')?'더 확대':'원래 크기';scroll.classList.toggle('ag-screen-actual',inFullSize);scroll.scrollTop=0;scroll.scrollLeft=0;};
        size.addEventListener('click',()=>zoom(size.getAttribute('aria-pressed')!=='true'));
        dismiss.addEventListener('click',()=>viewer.close());
        viewer.addEventListener('close',()=>{if(!viewer.open){photo.removeAttribute('src');photo.alt='';}});
        const reviewInput=(box,id)=>box.querySelector(`[data-ag-input="${id}"]`);
        const changedReview=event=>{
            const input=event.target;
            if(input.matches('[data-ag-standard-confirm]')){
                input.closest('.ag-standard').querySelectorAll('[data-ag-standard-copy]').forEach(button=>{button.hidden=!input.checked;button.textContent='복사';});
                return;
            }
            const box=input.closest('[data-ag-review]');
            if(!box||!input.dataset.agInput)return;
            box.querySelector('[data-ag-output]').replaceChildren();
            if(box.dataset.agReview==='pay')putValues(payrollIds);
            if(!['checked','localScope'].includes(input.dataset.agInput)){
                reviewInput(box,'checked').checked=false;
                const jurisdiction=reviewInput(box,'localScope');if(jurisdiction)jurisdiction.checked=false;
            }
            if(input.dataset.agInput==='box'){
                reviewInput(box,'supply').value='';reviewInput(box,'tax').value='';
                box.querySelector('[data-ag-source]').textContent=Object.hasOwn(vatFields,input.value)?vatFields[input.value][1]:'칸을 고르면 확인할 증빙을 보여줍니다.';
            }
        };
        choices.addEventListener('input',changedReview);
        const generic=e=>e?.message==='READ_TIMEOUT'?'조회가 지연되고 있습니다. 같은 버튼을 눌러 다시 확인하세요.':'자료를 불러오지 못했습니다. 열람 권한을 확인하고 다시 불러오세요.';
        function leave() { if(viewer.open)viewer.close();read?.clear('자료를 보려면 다시 불러오세요.');resetPayroll(); }
        const shown=()=>{if(selected==='withholding'&&root.ownerDocument.visibilityState==='hidden')leave();};
        root.ownerDocument.addEventListener('visibilitychange',shown);
        const draw = topic => {
            if (topic===selected || !active()) return;
            if(selected)remembered.set(selected,[...choices.querySelectorAll('.ag-loader input,.ag-loader select')].map(el=>el.value));
            leave();read=null;selected=topic;
            root.querySelectorAll('[data-topic]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.topic===topic)));
            const current=()=>selected===topic&&active()&&root.isConnected;
            if (topic==='smarta') {
                if(host.CoopSmartaGuide)read=host.CoopSmartaGuide.mount({root:choices,client,coopId,active:current,bindRead,stepHtml,generic});
                else choices.textContent='신고 안내를 불러오지 못했습니다. 회계 메뉴를 다시 열어 주세요.';
            } else {
                choices.innerHTML = topic==='withholding'?withholdingFlowHtml(steps.withholding):stepHtml(steps[topic]);
                const q=s=>choices.querySelector(s);
                if (topic==='withholding') {
                    bindWithholdingFlow(q('.ag-withholding-flow'),steps.withholding,current);
                    const input=q('#agPaymentMonth');
                    input.value=previousMonth();
                    read=bindRead({input,button:q('#agLoad'),out:q('#agResult'),active:current,load:(m,_,s)=>loadA01(client,coopId,m,s),render:resultHtml,onReset:resetPayroll,
                        onResult:model=>{payroll=model;const box=q('#agA01Review');box.innerHTML=payrollReviewHtml(model)||'<p class="ag-notice">이 지급월의 A01 값은 급여·지급 증빙을 더 확인해야 합니다.</p>';},
                        loading:'승인 급여와 지급 전표를 확인하고 있습니다.', changed:'선택한 지급월의 ERP 금액을 불러오세요.',
                        error:e=>e.message==='MONTH_REQUIRED'?'급여 지급월을 선택해 주세요.':e.message==='RESULT_TOO_LARGE'?'전체 범위를 읽지 못했습니다. 전표와 급여대장을 직접 대조하세요.':generic(e)});
                } else if(topic==='vat') {
                    const input=q('#agVatYear'),extra=q('#agVatPeriod'),recent=previousMonth();
                    input.value=recent.slice(0,4);extra.value=Number(recent.slice(5))<=6?'h1':'h2';
                    read=bindRead({input,extra,button:q('#agVatLoad'),out:q('#agVatResult'),active:current,load:(y,p,s)=>loadVat(client,coopId,y,p,s),render:vatResult,
                        loading:'선택한 기간의 세금 계정을 확인하고 있습니다.', changed:'선택한 기간의 장부를 대조하세요.',
                        error:e=>e.message==='VAT_PERIOD_REQUIRED'?'거래 연도와 기간을 확인하세요.':e.message==='RESULT_TOO_LARGE'?'전표가 많습니다. 기간을 분기로 좁히거나 장부에서 직접 대조하세요.':generic(e)});
                }
            }
            const values=remembered.get(topic);
            if(values)choices.querySelectorAll('.ag-loader input,.ag-loader select').forEach((el,i)=>{el.value=values[i];});
        };
        root.onclick=async event=>{
            if (!active()) {if(selected==='withholding')leave();return;}
            const enlarge=event.target.closest('[data-ag-screen-open]');
            if(enlarge&&(selected==='smarta'||selected==='withholding')&&choices.contains(enlarge)&&!viewer.open&&!enlarge.closest('[data-ag-flow-panel]')?.hidden){
                const figure=enlarge.closest('figure');
                const picture=figure&&!figure.hidden?figure.querySelector('img'):null;
                if(picture){
                    const withholding=figure.classList.contains('ag-withholding-shot');
                    viewer.classList.toggle('ag-withholding-image',withholding);
                    if(withholding)photo.style.setProperty('--ag-zoom-width',String(2*Number(picture.getAttribute('width')))+'px');
                    viewer.querySelector('#agScreenTitle').textContent=picture.alt;
                    photo.src=picture.src;photo.alt=picture.alt;zoom(false);
                    viewer.showModal();dismiss.focus({preventScroll:true});
                }
                return;
            }
            const tab=event.target.closest('[data-topic]');
            if(tab&&root.contains(tab)){draw(tab.dataset.topic);return;}
            const move=event.target.closest('[data-step]');
            if(move&&choices.contains(move)){
                const list=[...choices.children].filter(el=>el.classList.contains('ag-step'));
                const next=list[Number(move.dataset.step)];
                if(next){for(const el of list)el.open=el===next;next.querySelector('summary').focus();}
                return;
            }
            const verify=event.target.closest('[data-ag-confirm]');
            if(verify&&choices.contains(verify)){
                const box=verify.closest('[data-ag-review]'),out=box.querySelector('[data-ag-output]');
                if(box.closest('.ag-step')?.open===false||box.closest('[data-ag-flow-panel]')?.hidden)return;
                if(!reviewInput(box,'checked').checked){out.textContent='증빙을 대조한 뒤 확인란에 체크해 주세요.';return;}
                if(box.dataset.agReview==='pay'){
                    const model=payroll,excluded=reviewInput(box,'excluded').value,local=reviewInput(box,'localScope').checked;
                    const current=()=>active()&&selected==='withholding'&&model&&payroll===model&&box.isConnected&&choices.querySelector('#agPaymentMonth')?.value===model.month
                        &&reviewInput(box,'excluded').value===excluded&&reviewInput(box,'checked').checked&&reviewInput(box,'localScope').checked===local;
                    const rows=current()?buildWithholdingFields(model,excluded):null;
                    if(!rows){putValues(payrollIds);out.textContent='확인한 제외액을 급여대장 지급계보다 작은 원 단위 금액으로 입력하세요.';return;}
                    putValues(payrollIds,Object.fromEntries(payrollIds.slice(0,local?8:5).map((k,i)=>[k,rows[i][1]])),current);
                    out.textContent=local?'지급연월·A01·위택스 단계에서 확인값을 복사할 수 있습니다.':'지급연월·A01 단계에서 확인값을 복사할 수 있습니다.';return;
                }
                const boxNo=reviewInput(box,'box').value;
                const f=buildVatFields(boxNo,reviewInput(box,'supply').value,reviewInput(box,'tax').value);
                if(f){
                    out.innerHTML=reviewedRows(f);
                }else out.textContent='신고 칸을 고르고 증빙의 0 이상 원 단위 금액 두 개를 입력해 주세요. 차감·환급 등 음수 신고는 공식 명세에서 직접 확인하세요.';
                return;
            }
            const b=event.target.closest('[data-copy],[data-ag-live-copy]');if(!b||b.hidden||b.disabled||!choices.contains(b)||b.dataset.copying||b.closest('.ag-step')?.open===false||b.closest('[data-ag-flow-panel]')?.hidden)return;
            const entry=liveCopies.get(b);
            if(b.hasAttribute('data-ag-live-copy')&&(!entry||!entry.current()))return;
            const topic=selected;b.dataset.copying='1';
            const current=()=>active()&&selected===topic&&!b.hidden&&b.isConnected&&choices.contains(b)&&b.closest('.ag-step')?.open!==false&&!b.closest('[data-ag-flow-panel]')?.hidden&&(!entry||liveCopies.get(b)===entry&&entry.current());
            try {await host.navigator.clipboard.writeText(entry?entry.value:b.dataset.copy);if(current())b.textContent='복사됨';}
            catch(_){if(current())b.textContent='복사 실패';}
            finally{delete b.dataset.copying;}
        };
        draw('withholding');
        return {leave,destroy(){leave();root.onclick=null;choices.removeEventListener('input',changedReview);root.ownerDocument.removeEventListener('visibilitychange',shown);delete root.dataset.mounted;root.replaceChildren();}};
    }
    const api={version:'1.4.3',mount,load,loadA01,analyze,period,previousMonth,resultHtml,vatPeriod,analyzeVat,loadVat,vatResult,bindRead,buildWithholdingFields,buildVatFields,enteredWon};
    if (typeof module !== 'undefined' && module.exports) module.exports=api;
    if (host) host.CoopAccountingGuide=api;
})(typeof window !== 'undefined' ? window : null);
