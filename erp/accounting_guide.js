/* Accounting guide v1.0.2. Read-only; the existing authenticated client and RLS apply. */
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
            try {
                for (const r of rows) {
                    for (const [key, field] of Object.entries({gross:'pay_total',income:'ded_income',local:'ded_local',net:'net_pay'})) {
                        const n = amount(r[field]); if (n < 0) throw new Error('AMOUNT_INVALID'); t[key] = sum(t[key], n);
                    }
                    t.adjustmentIncome = sum(t.adjustmentIncome, amount(r.payroll_tax_adjustment_income, true));
                    t.adjustmentLocal = sum(t.adjustmentLocal, amount(r.payroll_tax_adjustment_local, true));
                }
            } catch (_) { warnings.add('일부 급여 금액을 확인할 수 없어 그 완료본은 합계에서 제외했습니다. 급여대장을 확인해 주세요.'); continue; }
            if (t.net !== p.credit) {
                warnings.add('급여 실지급액과 지급 전표가 다른 완료본은 합계에서 제외했습니다. 부분 지급·추가 전표·지급일을 확인해 주세요.'); continue;
            }
            for (const r of rows) {
                if (r.emp_id) employeeIds.add(String(r.emp_id));
                else warnings.add('직원 연결 정보가 없는 급여가 있어 인원 합계는 확인이 필요합니다.');
            }
            for (const key of Object.keys(totals)) totals[key] = sum(totals[key], t[key]);
            sources.push({title:doc.title || '급여 지출결의', salaryMonth, dates:[...p.dates].sort(), count:rows.length, ...t});
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
        if (totals.adjustmentIncome || totals.adjustmentLocal) warnings.add('급여 세액 정산이 있습니다. 연말정산·중도퇴사·환급 내역을 구분해 신고하고, 차감한 금액을 간이세액(A01)에 그대로 입력하지 마세요.');
        if (new Set(sources.map(s => s.salaryMonth)).size > 1) warnings.add('여러 귀속월의 급여가 함께 지급됐습니다. 홈택스의 귀속연월 입력 기준을 확인해 주세요.');
        return {month, sources, totals, employeeCount:warnings.has('직원 연결 정보가 없는 급여가 있어 인원 합계는 확인이 필요합니다.') ? null : employeeIds.size, confirmed, warnings:[...warnings]};
    }
    async function allPages(makeQuery, cap = 10000) {
        const rows = [], size = 500;
        for (let start = 0; start < cap; start += size) {
            const {data, error} = await makeQuery().range(start, start + size - 1);
            if (error) throw new Error('READ_FAILED');
            if (!Array.isArray(data)) throw new Error('READ_FAILED');
            rows.push(...data);
            if (data.length < size) return rows;
        }
        throw new Error('RESULT_TOO_LARGE'); // Never return a truncated tax total.
    }
    async function load(client, coopId, month) {
        if (!client || !/^[a-f0-9-]{36}$/i.test(String(coopId || ''))) throw new Error('COOP_REQUIRED');
        const p = period(month);
        const journals = await allPages(() => client.from('ac_journal')
            .select('coop_id,Trans_ID,Date,Account,Credit').eq('coop_id',coopId)
            .eq('Account','보통예금').gt('Credit',0).gte('Date',p.start).lt('Date',p.end)
            .order('Trans_ID').order('Date').order('Credit'));
        const ids = [...new Set(journals.map(r => String(r.Trans_ID).match(/^APR-(\d+)$/)?.[1]).filter(Boolean))];
        const docs = [];
        for (let i = 0; i < ids.length; i += 100) {
            docs.push(...await allPages(() => client.from('ref_approval')
                .select('id,coop_id,title,doc_type,status,salary_ledger_snapshot').eq('coop_id',coopId)
                .in('id',ids.slice(i,i+100)).order('id')));
        }
        const taxDocs = await allPages(() => client.from('ref_approval')
            .select('id,coop_id,title,status,amount,expense_snapshot').eq('coop_id',coopId)
            .in('status',completed).contains('expense_snapshot',{withholding_tax:{payment_month:month}}).order('id'));
        return analyze(month,coopId,journals,docs,taxDocs);
    }
    const link = (url, text) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text} ↗</a>`;
    const nts = 'https://www.nts.go.kr';
    const steps = {
        withholding: [
            ['급여 지급월과 금액 확인', '<p>급여를 실제로 지급한 달을 선택하고 <b>ERP 금액 불러오기</b>를 누르세요. 급여 귀속월과 지급월은 다를 수 있습니다.</p><div class="ag-loader"><label for="agPaymentMonth">급여 지급월</label><input type="month" id="agPaymentMonth"><button type="button" id="agLoad" class="btn btn-primary">ERP 금액 불러오기</button></div><div id="agResult" role="status" aria-live="polite">지급월을 선택하면 승인된 급여와 지급 전표를 대조할 수 있습니다.</div>'],
            ['홈택스에서 원천세 정기신고 열기', `<p>${link('https://www.hometax.go.kr','홈택스')}에 조합 사업자로 로그인하세요. 상단 <b>세금신고 → 원천세 신고 → 일반신고 → 정기신고</b>로 이동합니다. 메뉴를 찾기 어렵다면 상단 검색창에 <b>원천세</b>를 입력하고 ‘일반신고’를 선택하세요.</p><p>사업자등록번호와 신고구분을 확인하고 귀속연월·지급연월을 입력합니다. 매월 납부인지 반기별 납부 승인 대상인지도 확인하세요.</p><details class="ag-screen"><summary>홈택스 메뉴 화면 보기</summary><figure><img src="accounting-guide/hometax-withholding.jpg" alt="홈택스 원천세 검색 결과의 세금신고 원천세 신고 일반신고 메뉴" loading="lazy"><figcaption>국세청 홈택스 공개 메뉴 · 2026-10-08 확인. 로그인 뒤의 신고 화면은 조합의 신고 유형에 따라 다릅니다.</figcaption></figure></details>`],
            ['급여분 인원·지급액·소득세 입력', '<p>근로소득의 <b>간이세액(A01)</b> 등 해당 소득 구분에서 인원, 총지급액, 소득세를 입력하세요. 위 ERP 표의 <b>급여 공제 소득세</b>는 지방소득세를 제외한 국세입니다.</p><p>총지급액은 급여 합계를 참고하되 신고대상 비과세 포함 범위를 확인합니다. 같은 직원에게 여러 번 지급한 경우 인원을 중복 입력하지 마세요. 연말정산·중도퇴사 정산은 해당 칸과 환급세액 조정에 구분해 반영합니다.</p><p>강사료·사업소득·배당·퇴직소득이 있다면 해당 소득 항목도 별도로 입력합니다. 이 안내의 자동 합계는 <b>급여분만</b>입니다.</p>'],
            ['신고서 제출 후 국세 납부', '<p>오류 검사를 하고 신고서의 납부세액을 ERP 내역과 대조한 뒤 제출하세요. 접수증과 납부서를 저장합니다. <b>납부·고지·환급 → 세금납부 → 납부할 세액 조회/납부</b>에서 납부할 수 있습니다.</p><p>일반적인 매월 신고는 지급월의 다음 달 10일까지입니다. 휴일·기한 연장·반기납부 등은 실제 신고 안내의 기한을 확인하세요. 10일은 기한이지, 납부를 시작할 수 있는 날짜가 아닙니다.</p>'],
            ['위택스에서 지방소득세 신고·납부', `<p>${link('https://www.wetax.go.kr','위택스')}에 조합 사업자로 로그인하고 <b>신고 → 지방소득세 → 특별징수</b>에서 신고합니다. 홈택스의 지방소득세 신고이동을 이용한 경우에도 지방세 접수 완료를 따로 확인하세요.</p><p>지급연월·귀속연월, 관할 지방자치단체, 인원, 소득세와 특별징수세액을 확인합니다. ERP의 <b>급여 공제 지방소득세</b>와 실제 지방세 납부액을 대조하고 접수증·납부서를 저장하세요. 국세 납부만으로 지방세까지 납부되는 것은 아닙니다.</p>`],
            ['ERP에 납부 증빙과 실제 납부일 기록', '<p><b>전자결재 → 지출결의 → 원천세</b>에서 국세·지방세를 구분해 확인하고 신고서·납부서를 첨부하세요. 이미 납부했다면 선지출과 실제 납부일을 입력합니다. 결재 완료 후 회계의 <b>자동연동</b> 탭에서 <b>전자결재 연동 → 실행</b>을 눌러 전표를 반영합니다.</p><p>신고서 제출, 실제 납부, 결재 승인, 회계 반영은 서로 다른 단계입니다. 이전에 입력한 전표가 있는지도 확인해 중복 반영하지 마세요.</p>']
        ],
        vat: [
            ['신고 기간과 ERP 매출·매입 확인', '<p>회계 화면의 조회 연도와 <b>부가세 반기/분기</b>를 신고 기간에 맞춥니다. 전자세금계산서·카드·현금영수증·기타 매출, 매입 증빙을 준비하세요.</p><p>법인 일반과세자는 통상 예정·확정 신고가 있지만, 소규모 법인 예정고지 등 예외가 있습니다. ERP에서 반기로 본다는 이유만으로 신고 횟수가 정해지는 것은 아닙니다. 홈택스의 신고 대상 기간과 예정고지를 확인하세요.</p>'],
            ['카드 매입세액 공제 여부 확인', `<p>홈택스의 <b>계산서·영수증·카드 → 신용카드 매입 → 사업용신용카드 사용내역 → 매입세액 공제 확인/변경</b>을 엽니다. 상단 검색창에 <b>매입세액 공제 확인</b>을 입력해도 됩니다.</p><p>조회 기간을 선택하고 각 건의 공제·불공제를 확인합니다. 업무와 무관한 지출, 기업업무추진비, 비영업용 소형승용차 관련 등 공제 제한 거래는 제외합니다. 면세 거래에는 공제할 부가세가 없습니다.</p><p>취소분을 반영하고 같은 거래를 세금계산서와 카드로 중복 공제하지 마세요. 법인 명의 카드는 통상 별도 등록 없이 조회됩니다. 누락된 카드는 원자료를 확인합니다.</p><details class="ag-screen"><summary>홈택스 카드 매입 메뉴 화면 보기</summary><figure><img src="accounting-guide/hometax-card-vat.jpg" alt="홈택스 매입세액 공제 확인 검색 결과" loading="lazy"><figcaption>국세청 홈택스 공개 메뉴 · 2026-10-08 확인.</figcaption></figure></details>`],
            ['홈택스 부가가치세 정기신고 열기', `<p>${link('https://www.hometax.go.kr','홈택스')}의 <b>세금신고 → 부가가치세 신고 → 일반과세자 신고 → 정기신고</b>로 이동하세요. 조합의 사업자등록번호와 예정·확정 신고 기간을 확인합니다.</p><p>신고서 작성 화면에서 제공하는 매출·매입 자료 조회와 미리채움을 이용하세요. 업종·사업자 유형에 따라 화면 구성이 달라질 수 있습니다.</p><p>${link(nts+'/nts/na/ntt/selectNttInfo.do?mi=2409&nttSn=1353101','국세청 2026년 전자신고 화면 안내')}</p>`],
            ['매출 입력·누락 대조', '<p>세금계산서, 카드, 현금영수증 매출의 집계액을 불러온 뒤 ERP와 대조합니다. 홈택스에 자동 집계되지 않는 현금·계좌 입금 매출은 해당 기타 매출 항목에 반영하세요.</p><p>공급가액과 부가세를 구분합니다. 현금영수증을 발급한 거래를 기타 매출에도 다시 넣지 않도록 확인하고, 환불·취소·쿠폰 정산과 재료비 수입의 처리도 장부와 맞춥니다.</p>'],
            ['매입·공제액 확인 후 신고·납부', '<p>세금계산서 수취분과 카드·현금영수증 등 매입을 확인하고 공제 가능한 세액을 반영하세요. ERP의 부가세대급금과 차이가 있으면 누락·취소·불공제·기간 차이를 확인합니다.</p><p>홈택스가 계산한 최종 납부·환급액과 예정고지·기납부액을 검토하고 제출합니다. 신고서·접수증·납부서를 저장하고 실제 납부 후 ERP에 반영하세요. <b>자동 계산은 자료의 누락이나 공제 여부까지 보장하지 않습니다.</b></p>']
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
    function resultHtml(model) {
        const rows = [
            ['급여 인원', model.employeeCount, '명', '같은 직원의 여러 지급은 한 명으로 집계'],
            ['급여 총액',model.totals.gross,'원','신고 총지급액의 비과세 포함 범위 확인'],
            ['급여 공제 소득세',model.totals.income,'원','근로소득 국세 · 정산 반영 전'],
            ['급여 공제 지방소득세',model.totals.local,'원','특별징수 지방세 · 정산 반영 전'],
            ['급여 소득세 정산',model.totals.adjustmentIncome,'원','환급·추가징수 내역을 구분해 신고'],
            ['급여 지방소득세 정산',model.totals.adjustmentLocal,'원','지방세 정산 내역 별도 확인']
        ];
        const table = model.sources.length ? `<div class="ag-table-wrap"><table><caption>${esc(model.month)} 지급 · 승인 급여와 지급 전표가 일치한 금액</caption><thead><tr><th>ERP 항목</th><th>금액·인원</th><th>확인할 내용</th></tr></thead><tbody>${rows.map(([label,n,unit,note])=>`<tr><th scope="row">${label}</th><td>${n===null?'확인 필요':n.toLocaleString('ko-KR')+unit} ${unit==='원'&&label.startsWith('급여 공제')?`<button type="button" class="ag-copy" data-copy="${n}" aria-label="${label} 숫자 복사">복사</button>`:''}</td><td>${note}</td></tr>`).join('')}</tbody></table></div><details class="ag-source"><summary>근거 급여와 지급일</summary><ul>${model.sources.map(s=>`<li>${esc(s.title)} · 귀속 ${esc(s.salaryMonth)} · 지급 전표일 ${s.dates.map(esc).join(', ')} · ${s.count}명</li>`).join('')}</ul></details>` : '<p class="ag-notice">이 지급월에 금액까지 대조된 급여 완료본이 없습니다. 급여 승인·회계 연동·지급 전표일을 확인해 주세요. 조회되지 않은 금액을 0원으로 보지 마세요.</p>';
        const confirmed = model.confirmed.length ? `<div class="ag-confirmed"><h4>원천세 완료 결재에 기록된 금액</h4>${model.confirmed.map(t=>`<p>${esc(t.title)}<br>국세 <b>${money(t.national)}</b> · 지방세 <b>${money(t.local)}</b></p>`).join('')}<p>결재 금액입니다. 실제 신고서·납부 결과와 대조하세요.</p></div>` : '';
        return `<p class="ag-result-title">${esc(model.month)} 급여 지급분 · 일반 매월 신고라면 ${period(model.month).next} 신고·납부</p>${table}${confirmed}${model.warnings.length?`<div class="ag-notice"><b>확인이 필요한 자료</b><ul>${model.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:''}<p class="ag-footnote">이 표에는 조회 권한이 있는 급여분만 포함됩니다. 누락 급여·수기 지급과 다른 소득의 원천세는 별도로 확인하세요.</p>`;
    }
    function mount({root, client, coopId}) {
        if (!root || root.dataset.mounted === '1') return;
        root.dataset.mounted='1';
        root.innerHTML = `<div class="ag-heading"><h3>신고·결산 따라 하기</h3><span>공식 메뉴 확인: 2026-10-08</span></div><div class="ag-topics" role="group" aria-label="회계 안내 선택"><button type="button" data-topic="withholding" aria-pressed="true">원천세 신고·납부</button><button type="button" data-topic="vat" aria-pressed="false">부가세·카드 매입</button><button type="button" data-topic="closing" aria-pressed="false">연말결산</button><button type="button" data-topic="smarta" aria-pressed="false">법인세 신고(Smart A)</button></div><div id="agSteps"></div>`;
        let generation = 0;
        const draw = topic => {
            generation++;
            root.querySelectorAll('[data-topic]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.topic===topic)));
            if(topic==='smarta') {
                const target=root.querySelector('#agSteps');
                if(host.CoopSmartaGuide)host.CoopSmartaGuide.mount({root:target,client,coopId});
                else target.textContent='신고 안내를 불러오지 못했습니다. 새로고침 후 다시 열어 주세요.';
                return;
            }
            root.querySelector('#agSteps').innerHTML = steps[topic].map(([title,html],i)=>`<details class="ag-step"${i===0?' open':''}><summary><span class="ag-number">${i+1}</span>${title}</summary><div class="ag-step-body">${html}</div></details>`).join('') + `<p class="ag-sources">공식 확인: ${link(nts+'/nts/cm/cntnts/cntntsView.do?cntntsId=7701&mi=2289','원천징수')} · ${link('https://d.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7693&mi=2401','부가가치세')} · ${link('https://g.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7799&mi=2475','카드 매입 공제')} · ${link('https://g.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7975&mi=6549','법인세')}</p>`;
            if (topic !== 'withholding') return;
            const input=root.querySelector('#agPaymentMonth'), btn=root.querySelector('#agLoad'), out=root.querySelector('#agResult');
            input.value=previousMonth();
            input.addEventListener('input',()=>{generation++;btn.disabled=false;btn.textContent='ERP 금액 불러오기';out.textContent='지급월이 변경됐습니다. ERP 금액 불러오기를 눌러 주세요.';});
            btn.addEventListener('click',async()=>{
                const ticket=++generation, month=input.value;
                btn.disabled=true;btn.textContent='불러오는 중…';out.textContent='승인된 급여와 지급 전표를 확인하고 있습니다.';
                try { const model=await load(client,coopId,month);if(ticket===generation)out.innerHTML=resultHtml(model); }
                catch(error){if(ticket===generation)out.textContent=error.message==='MONTH_REQUIRED'?'급여 지급월을 선택해 주세요.':error.message==='RESULT_TOO_LARGE'?'자료가 많아 전체 금액을 확인하지 못했습니다. 합계를 표시하지 않습니다.':'자료를 불러오지 못했습니다. 로그인·같은 조합의 회계 및 급여 열람 권한을 확인하고 다시 불러와 주세요.';}
                finally {if(ticket===generation){btn.disabled=false;btn.textContent='ERP 금액 불러오기';}}
            });
        };
        root.querySelectorAll('[data-topic]').forEach(b=>b.addEventListener('click',()=>draw(b.dataset.topic)));
        root.addEventListener('click',async event=>{
            const b=event.target.closest('[data-copy]');if(!b||!root.contains(b))return;
            try {await host.navigator.clipboard.writeText(b.dataset.copy);b.textContent='복사됨';}
            catch(_){b.textContent='복사 실패';}
        });
        draw('withholding');
    }
    const api={mount,load,analyze,period,previousMonth,resultHtml};
    if (typeof module !== 'undefined' && module.exports) module.exports=api;
    if (host) host.CoopAccountingGuide=api;
})(typeof window !== 'undefined' ? window : null);
