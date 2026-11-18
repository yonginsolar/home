/* 법인세 따라 하기 1.3.0. 확인한 ERP 결산 계정을 표준재무제표 칸에 연결한다. */
(function (host) {
    'use strict';
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const manual = 'https://hometax.speedycdn.net/dn_dir/webdown/1.20260227_%EB%B2%95%EC%9D%B8%EC%84%B8%20%EB%AC%B4%EB%A3%8C%EC%9E%91%EC%84%B1%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8(SMART-A)%EC%82%AC%EC%9A%A9%EB%B2%95_2026.zip';
    const link = (u,t) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t} ↗</a>`;
    const screen = (file,title,page,{kind='일반법인 사용설명서',ext='jpg',note=''}={}) => `<details class="ag-screen"><summary>${esc(title)} 화면 보기</summary><figure><a href="accounting-guide/smarta-${file}.${ext}" target="_blank" rel="noopener noreferrer"><img src="accounting-guide/smarta-${file}.${ext}" alt="국세청 Smart A ${esc(kind)}의 ${esc(title)} 예시 화면" loading="lazy" decoding="async"></a><figcaption>국세청 2026년 배포본 · ${esc(kind)} ${page}쪽 예시.${note?' '+esc(note):''}</figcaption></figure></details>`;
    const groups = [['assets','자산'],['liabilities','부채'],['equity','자본계정'],['revenue','매출'],['expenses','비용'],['other_revenue','영업외수익']];
    const totals = [['total_assets','자산계정 합계'],['total_liabilities','부채계정 합계'],['total_revenue','매출 합계'],['total_expenses','비용 합계'],['total_other_revenue','영업외수익 합계'],['net_income','당기순손익']];
    const standardFields = [
        ['재무상태표','3','현금 및 현금성자산','assets',['현금','보통예금','현금및현금성자산'],'보통예금은 요구불예금인지 확인하고 정기예금은 만기·성격에 따라 별도 분류하세요.'],
        ['재무상태표','10','외상매출금','assets',['외상매출금'],'단기 외상매출금입니다. 대손충당금은 해당 별도 칸을 확인하세요.'],
        ['재무상태표','69','선급비용','assets',['선급비용'],'결산일 현재 남은 선급비용입니다. 선급금과 구분하세요.'],
        ['재무상태표','73','부가가치세대급금','assets',['부가세대급금','부가가치세대급금'],'결산일 잔액을 적습니다. 부가가치세 신고서의 공제세액으로 옮기지 마세요.'],
        ['재무상태표','247','부가가치세예수금','liabilities',['부가세예수금','부가가치세예수금'],'결산일 잔액입니다. 부가가치세 신고서의 매출세액과는 다릅니다.'],
        ['재무상태표','248','제세예수금','liabilities',['제세예수금'],'국세·지방세 등 원천 공제 잔액입니다. 4대보험 예수금은 따로 분류하세요.'],
        ['손익계산서','131','이자수익','other_revenue',['이자수익'],'그 사업연도의 영업외 이자수익입니다. 은행의 세후 입금액이 아니라 장부 수익을 대조하세요.'],
        ['손익계산서','161','자산수증이익','other_revenue',['자산수증이익'],'장부에 이 이름으로 분류한 영업외수익만 사용하세요. 기부금·보조금을 이름만 보고 합치지 않습니다.'],
        ['손익계산서','218','법인세비용','expenses',['법인세비용'],'최종 손익계산서의 회계 비용입니다. 국세 납부액은 별도 세액조정계산서에서 확인하세요.']
    ];
    const standardSource='https://www.law.go.kr/LSW/flDownload.do?flSeq=168513621';
    const incomeSource='https://www.law.go.kr/LSW/flDownload.do?bylClsCd=110202&flSeq=160257571&gubun=';
    const readyReport=m=>m.fullYear&&m.closed&&m.balanced===true;
    function mapStandardFields(m) {
        if(!m||!readyReport(m))return [];
        const normalize=name=>name.replace(/\s/g,'');
        const rows=[];
        for(const [form,code,label,group,names,why] of standardFields){
            const source=m.items[group].filter(row=>names.includes(normalize(row.name)));
            if(!source.length||new Set(source.map(r=>normalize(r.name))).size!==source.length)continue;
            // '현금 및 현금성자산' 집계와 구성 계정을 다시 더하지 않는다.
            if(code==='3'&&source.length>1&&source.some(r=>normalize(r.name)==='현금및현금성자산'))continue;
            if(source.some(r=>r.amount<0))continue;
            const n=source.reduce((total,r)=>total+BigInt(r.amount),0n);
            if(n<=0n||n>BigInt(Number.MAX_SAFE_INTEGER))continue;
            rows.push({form,code,label,amount:Number(n),source:source.map(r=>r.name).join(' + '),why});
        }
        return rows;
    }
    function standardHtml(m) {
        const rows=mapStandardFields(m);
        if(!rows.length)return '<p class="ag-notice">일반법인 표준 칸으로 바로 대조할 계정을 찾지 못했습니다. 해당 연도의 마감본, 계정의 성격과 세부명세를 확인하세요.</p>';
        return `<section class="ag-field-review ag-standard"><h4>일반법인 표준재무제표에 넣을 계정</h4><p>아래 금액은 해당 연도 ERP 결산보고서의 장부 금액입니다. 일반법인용 양식, 실제 확정 결산본, 같은 표준 칸에 합쳐야 할 다른 계정이 없는지를 대조한 뒤 복사하세요.</p><label class="ag-review-check"><input type="checkbox" data-ag-standard-confirm> 일반법인용 양식과 확정 결산본의 분류를 대조했습니다.</label><dl class="ag-standard-fields">${rows.map(r=>`<div><dt>${r.form} · ${r.code} ${r.label}</dt><dd><strong>${r.amount.toLocaleString('ko-KR')}원</strong> <button type="button" class="ag-copy" data-ag-standard-copy data-copy="${r.amount}" aria-label="${r.label} 복사" hidden>복사</button></dd><dd class="ag-field-source">ERP 결산보고서: ${esc(r.source)}. ${r.why}</dd></div>`).join('')}</dl><p>${link(standardSource,'일반법인 표준재무상태표')} · ${link(incomeSource,'일반법인 표준손익계산서')}</p></section>`;
    }
    function yearValue(v) {
        if (!/^\d{4}$/.test(String(v)) || Number(v)<1900 || Number(v)>2100) throw new Error('YEAR_REQUIRED');
        return Number(v);
    }
    function number(v) {
        if (!['number','string'].includes(typeof v) || !/^-?\d+$/.test(String(v)) || !Number.isSafeInteger(Number(v))) throw new Error('REPORT_INVALID');
        return Number(v);
    }
    function analyze(row,coopId,year) {
        year=yearValue(year);
        if (!row) return null;
        if (row.coop_id!==coopId) throw new Error('TENANT_MISMATCH');
        const s=row.summary;
        if (number(row.fiscal_year)!==year || !s || number(s.fiscal_year)!==year || s.period_start!==row.period_start || s.period_end!==row.period_end) throw new Error('REPORT_INVALID');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(row.period_end) || row.period_start>row.period_end || !row.period_end.startsWith(String(year))) throw new Error('REPORT_INVALID');
        if (typeof s.is_closed!=='boolean') throw new Error('REPORT_INVALID');
        const values={}; for(const [k] of totals) values[k]=number(s[k]);
        values.total_equity=s.total_equity==null?null:number(s.total_equity);
        const balanced=values.total_equity==null?null:BigInt(values.total_assets)===BigInt(values.total_liabilities)+BigInt(values.total_equity);
        const items={}; for(const [k] of groups) {
            if (!Array.isArray(s[k]) || s[k].length>2000) throw new Error('REPORT_INVALID');
            items[k]=s[k].map(r=>{
                if(typeof r.name!=='string' || !r.name.trim() || r.name.length>200) throw new Error('REPORT_INVALID');
                return {name:r.name,amount:number(r.amount)};
            });
        }
        return {year,start:row.period_start,end:row.period_end,closed:s.is_closed,balanced,fullYear:row.period_start===`${year}-01-01`&&row.period_end===`${year}-12-31`,generated:typeof row.generated_at==='string'?row.generated_at.slice(0,10):'',values,items};
    }
    async function load(client,coopId,year,signal) {
        year=yearValue(year);
        if(!client || !/^[a-f0-9-]{36}$/i.test(String(coopId||''))) throw new Error('COOP_REQUIRED');
        // Existing table SELECT + RLS remains authoritative; no privileged client or write.
        let query=client.from('accounting_closing_report_snapshots')
            .select('coop_id,fiscal_year,period_start,period_end,generated_at,summary:report_payload->summary')
            .eq('coop_id',coopId).eq('fiscal_year',year).limit(2);
        if(signal?.aborted)throw new Error('READ_CANCELLED');
        if(signal&&typeof query.abortSignal==='function')query=query.abortSignal(signal);
        const {data,error}=await query;
        if(signal?.aborted)throw new Error('READ_CANCELLED');
        if(error || !Array.isArray(data)) throw new Error('READ_FAILED');
        if(data.length>1) throw new Error('REPORT_INVALID');
        return analyze(data[0],coopId,year);
    }
    function copyDate(v,name) {return `<span>${name} <b>${esc(v)}</b> <button type="button" class="ag-copy" data-copy="${esc(v)}" aria-label="${name} 복사">복사</button></span>`;}
    function resultHtml(m) {
        if(!m) return '<p class="ag-notice">선택한 연도의 결산보고서를 찾지 못했습니다. 회계의 「결산 보고서 생성」에서 해당 연도와 열람 권한을 확인하세요.</p>';
        const ready=readyReport(m);
        const note=!m.fullYear||!m.closed?'신고에 사용할 사업연도와 최종 마감본을 확인하세요.':m.balanced===false?'자산과 부채·자본 합계가 다릅니다. 최종 결산을 확인하세요.':m.balanced===null?'자본 합계가 빠져 있습니다. 최종 결산을 확인하세요.':'';
        const table=(rows,caption)=>`<div class="ag-table-wrap"><table><caption>${caption}</caption><thead><tr><th>ERP 항목</th><th>금액</th></tr></thead><tbody>${rows.map(([name,v])=>`<tr><th scope="row">${esc(name)}</th><td>${v===null?'확인 필요':v.toLocaleString('ko-KR')+'원'}</td></tr>`).join('')}</tbody></table></div>`;
        return `<p class="ag-result-title">${m.year}년 결산보고서 · ${esc(m.start)} ~ ${esc(m.end)}</p><p>보고서 생성일 ${esc(m.generated)||'확인 필요'} · ${m.closed?'손익마감 반영':'손익마감 전'}</p>${note?`<p class="ag-notice">${note}</p>`:''}${ready?`<div class="ag-confirmed ag-verified">${copyDate(m.start,'사업연도 시작일')}${copyDate(m.end,'사업연도 종료일')}</div>${standardHtml(m)}`:''}${table([...totals.slice(0,2),['total_equity','자본 합계'],...totals.slice(2)].map(([k,n])=>[n,m.values[k]]),'ERP 결산보고서 대조 금액')}${groups.map(([k,n])=>`<details class="ag-source"><summary>${n} 세부 금액</summary>${m.items[k].length?table(m.items[k].map(r=>[r.name,r.amount]),esc(n)+' 계정별 금액'):'<p>해당 보고서에 표시된 계정이 없습니다.</p>'}</details>`).join('')}<p>과세표준·공제감면·기납부세액은 조정 서식과 증빙에서 확인하세요.</p>`;
    }
    const steps=[
        ['신고 연도와 프로그램 준비',`<p>먼저 <b>어느 사업연도의 법인세를 신고하는지</b> 확인하세요. 2025년 1~12월 결산을 2026년에 신고한다면 국세청용 Smart A 2026 버전을 사용합니다.</p><p>${link('https://www.hometax.go.kr','홈택스')} 상단 검색창에서 <b>SmartA</b>를 검색하고 자료실의 최신 「법인세 무료작성프로그램」 게시글을 엽니다. ${link(manual,'2026년 공식 사용설명서 내려받기(압축파일)')}</p><p>설치파일의 압축을 풀어 Windows PC에 설치하고, 로그인 화면에서 버전과 <b>최신버전확인</b>을 확인하세요. 기존 자료가 있다면 재설치 전에 백업합니다.</p><div class="ag-notice">이 안내는 2026년 국세청 배포본 기준입니다. 적용 대상은 <b>2025년 12월~2026년 11월 결산 법인</b>입니다. 2026년 12월 결산은 다음 신고용 버전을 확인해야 합니다. 무료판은 소규모 영세사업자용이며 일반법인·비영리법인의 신고 경로는 구분됩니다.</div>${screen('login-2026','로그인과 회사등록',22)}`],
        ['ERP 결산보고서 준비',`<p>회계 화면 상단의 <b>결산 보고서 생성</b>에서 결산 연도를 선택해 재무상태표·손익계산서·이익잉여금처분계산서를 준비하세요. 아래에는 이미 생성해 저장한 보고서만 불러옵니다.</p><div class="ag-loader"><label for="agClosingYear">결산 연도</label><input id="agClosingYear" type="number" min="1900" max="2100" step="1"><button type="button" id="agClosingLoad" class="btn btn-primary">결산보고서 불러오기</button></div><div id="agClosingResult" role="status" aria-live="polite">결산 연도를 선택해 보고서를 불러오세요.</div><p>전기 금액이 필요한 항목은 전년도 보고서도 준비합니다. 장부를 수정했다면 해당 연도의 보고서를 다시 생성한 뒤 불러오세요.</p>`],
        ['법인 유형과 직접 신고 가능 여부 확인',`<p>설립·등기 자료에서 <b>일반협동조합</b>인지 <b>사회적협동조합</b>인지 먼저 확인하세요. 일반협동조합이 이름만으로 조합법인 과세특례 대상이 되는 것은 아닙니다. 사회적협동조합은 비영리법인으로 수익사업 해당 여부와 고유목적사업의 구분경리를 확인하세요. 발전·판매가 있다는 이유만으로 전부 면세 또는 전부 비과세로 처리하지 마세요.</p><p>홈택스 법인세 <b>신고도움 서비스</b>에서 대상 유형을 확인합니다. 외부조정 대상이면 결산자료와 전기 신고서, 감가상각·조정 명세, 중간예납 및 원천징수 자료를 세무대리인에게 전달하세요.</p>${screen('nonprofit-interest','이자소득만 있는 비영리법인 신고서',18,{kind:'비영리법인 사용설명서',ext:'png',note:'해당 신고 대상임을 확인한 경우에만 참고하세요.'})}<p>${link('https://www.law.go.kr/법령/협동조합기본법/제4조','협동조합 유형') } · ${link('https://www.law.go.kr/법령/법인세법/제113조','수익사업 구분경리')} · ${link('https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7975&mi=6549','국세청 신고절차·외부조정')}</p>`],
        ['회사 기본정보 등록',`<p>Smart A 로그인 화면에서 <b>회사등록</b>을 열고 조합명과 회계기간을 등록합니다. 이미 등록했다면 회사 선택 칸에서 <b>F2</b>를 눌러 해당 조합을 선택하세요.</p><p><b>기초사항검토 → 회사기본사항등록(회사등록)</b>에서 다음 자료와 맞춥니다.</p><dl class="ag-fields"><dt>사업자번호·주업종코드</dt><dd>사업자등록증의 사업자번호와 해당 사업연도의 실제 주업종을 확인하세요.</dd><dt>법인등록번호·대표자·주소</dt><dd>등기 자료와 사업자등록증의 해당 항목을 대조하세요.</dd><dt>회계기간</dt><dd>신고할 사업연도의 시작일과 종료일을 적습니다. 보고서를 만든 날이 아닙니다.</dd></dl>${screen('company','회사등록',27)}<p><b>추가사항</b>의 <b>법인구분</b>은 내국·외국 등 해당 구분입니다. 일반법인·비영리법인 신고 경로와 구별하세요. <b>중소기업여부·종류별구분</b>은 해당 연도 판정과 근거 자료를 확인한 후 고릅니다. <b>정상사업기간</b>은 화면 예시가 아닌 실제 적용 기간을 확인하세요.</p>${screen('company-extra','회사 추가사항',28,{ext:'png',note:'입력 항목 부분.'})}<p><b>저장 전:</b> 회사명과 사업연도를 다시 확인하세요.</p>`],
        ['작성할 서식과 순서 확인',`<p><b>기초사항검토 → 작성순서/flow chart(2)</b>를 엽니다. 서식명을 더블클릭하면 해당 입력 화면으로 이동합니다.</p><p>먼저 표준재무제표를 입력하고, 해당하는 세무조정 서식, 세액조정계산서, 최종 신고서 순으로 진행합니다. 조합의 실제 거래와 신고 요건에 해당하는 서식을 확인하세요.</p>${screen('menu-overview','법인세 전체 메뉴',2,{kind:'설치 및 기본 사용설명서',ext:'png'})}${screen('flow','작성순서',30)}`],
        ['표준재무제표에 장부 금액 입력',`<p><b>표준재무제표</b>에서 <b>표준재무상태표</b>를 열고 상단 <b>편집(F3)</b>을 누릅니다. ERP 재무상태표의 각 계정을 같은 성격의 표준 항목에 나누어 입력합니다. 세부 금액을 입력하고 <b>Enter</b>를 눌러 합계를 반영한 뒤 저장하세요.</p><p>예를 들어 보통예금은 현금·예금 항목을 확인하고, 재고·발전설비·부채는 각각의 표준 항목을 확인합니다. <b>유동자산처럼 자동 합계 칸에는 총액을 억지로 입력하지 않습니다.</b> ERP 계정코드와 신고서의 표준 코드는 같다고 가정하지 마세요.</p>${screen('statements','표준재무상태표',31)}<p><b>표준손익계산서</b>에는 매출, 비용, 영업외수익 등을 구분해 넣고 ERP 당기순손익과 대조합니다. 매출은 공급가액 기준을 확인합니다. <b>표준원가명세서</b>는 해당 원가 유형과 작성 필요 여부를 검토합니다.</p><p><b>이익잉여금처분(결손금)계산서</b>는 <b>편집(F3)</b>으로 작성하고 <b>처분일(F4)</b>에 실제 처분 확정일을 입력합니다. 보고서를 만든 날짜로 대신하지 마세요. 전기이월 금액과 적립금·배당·차기이월 금액은 실제 의결 내용에 맞춥니다.</p><p><b>끝내기 전 확인:</b> 표준재무상태표의 자산과 부채·자본, 표준손익계산서의 당기순손익이 ERP 최종 보고서와 맞는지 확인합니다. ERP CSV가 Smart A에 통째로 자동 입력되는 기능은 아닙니다.</p>`],
        ['장부 이익과 세법상 소득의 차이 검토',`<p>수입금액조정, 감가상각, 재고, 기부금, 기업업무추진비 중 해당하는 서식을 엽니다. 감가상각은 자산대장·감가상각 명세, 재고는 기말 재고 명세를 준비하세요.</p><dl class="ag-fields"><dt>결산서상 수입금액</dt><dd>확정 결산의 손익계산서에서 이 서식에 들어가는 해당 계정 금액을 찾아 대조하세요.</dd><dt>조정 가산·차감</dt><dd>확인한 세무조정 명세의 금액을 구분해 적습니다. 조정 대상이나 금액이 미확정이면 먼저 근거를 확인하세요.</dd><dt>조정 후 수입금액</dt><dd>결산서상 수입금액에 가산을 더하고 차감을 뺀 결과인지 대조하세요.</dd><dt>부가가치세 과세표준 대조</dt><dd>해당 기간에 신고한 공급가액과 비교하세요. 부가세 세액이나 장부와의 단순 차이를 조정 칸에 옮기지 마세요.</dd></dl>${screen('revenue-adjustment','수입금액조정명세서',33,{ext:'png'})}${screen('revenue-final','조정후수입금액명세서',35,{ext:'png'})}<div class="ag-notice">공제·감면, 이월결손금과 기납부세액은 해당 근거를 확인하세요. 모르는 항목을 0으로 입력하지 마세요.</div><p>표준재무제표나 조정 서식을 수정했다면 세액 계산 화면에서 <b>새로불러오기</b>로 다시 반영하세요.</p>`],
        ['세액조정계산서와 최종 신고서 확인',`<p><b>법인세 과세표준 및 세액조정계산서</b>를 열어 작성한 재무제표·조정 자료를 불러옵니다.</p><dl class="ag-fields"><dt>신고서 수입금액</dt><dd>회계상 매출과 신고용 수입금액의 차이를 세무조정 자료에서 확인하세요.</dd><dt>과세표준</dt><dd>익금·손금 조정과 공제 가능한 이월결손금 등을 반영한 세액조정계산서의 과세표준입니다. ERP 당기순손익과 구분하세요.</dd><dt>기납부세액</dt><dd>해당 사업연도의 중간예납 신고·영수증과 은행 원천징수영수증 등의 국세 납부액을 대조합니다.</dd><dt>결산확정일</dt><dd>총회의사록 등에서 결산을 실제 확정한 날을 확인합니다.</dd></dl>${screen('tax-adjustment','세액조정계산서',77)}<p><b>법인세 과세표준 및 세액신고서</b>에서 <b>새로불러오기</b>로 위 조정 서식의 금액을 반영합니다. 최종 납부·환급액은 공제·감면·가산세·기납부가 반영된 결과와 대조한 뒤 Smart A에서 마감합니다.</p>${screen('return','최종 신고서',75)}`],
        ['전자신고 파일 만들기·오류 검사',`<p><b>전자신고/일괄출력 → 법인세전자신고</b>를 열어 직접 신고라면 <b>일반업체</b>를 선택하고 <b>제출자 등록</b>에 실제 홈택스 제출자 ID를 입력합니다. 이 인증정보나 파일 암호는 ERP 안내에 입력하지 않습니다.</p>${screen('efile','법인세전자신고',118)}<p><b>전자신고제작</b> 탭에서 저장할 드라이브·조합을 선택하고 마감된 서식 목록을 확인한 뒤 <b>제작</b>을 누릅니다. 파일 저장 위치와 파일 암호를 안전하게 보관하세요.</p><p><b>신고데이터 오류검증</b> 탭에서 제작한 자료를 검사합니다. 오류가 있으면 해당 서식의 마감을 취소하고 수정·재마감·재제작합니다. 파일 생성이나 오류검사 통과만으로 신고가 접수되지는 않습니다.</p>`],
        ['홈택스 파일변환·제출·접수증 확인',`<p>파일 생성 때 입력한 제출자 ID로 ${link('https://www.hometax.go.kr','홈택스')}에 로그인합니다. <b>세금신고 → 법인세 신고 → 법인세신고(정기,중간예납,경정청구) → 파일변환신고</b>에서 해당 신고를 선택합니다.</p><p>생성한 파일을 선택한 뒤 <b>형식 검증 → 결과 확인 → 내용 검증</b>을 진행합니다. 오류가 있으면 Smart A의 원서식을 수정하고 파일을 다시 제작하세요.</p>${screen('hometax-convert','홈택스 파일변환 옛 예시',126,{note:'변환 순서를 참고하고 버튼 위치는 현재 홈택스에서 확인하세요.'})}<p>검증 뒤 신고 내용을 최종 확인하고 제출하세요. <b>신고내역</b>에서 접수번호·접수증·제출서식 목록을 확인해 보관합니다. 별도 부속서류가 있으면 해당 제출 메뉴에서 확인하세요.</p><p>국세 납부와 법인지방소득세 신고·납부는 별도로 확인하세요.</p>`],
        ['위택스에서 법인지방소득세 별도 신고',`<p>${link('https://www.wetax.go.kr','위택스')}의 <b>법인지방소득세 확정신고</b>에서 같은 사업연도와 실제 결산확정일을 확인하세요. 사업연도 종료월 말일부터 일반적으로 법인세는 3개월, 법인지방소득세는 4개월입니다.</p><dl class="ag-fields"><dt>㉙ 과세표준</dt><dd>지방세 세액조정계산서(제43호의2)에서 각 사업연도 소득분의 ⑦을 사용합니다. 확정 국세 자료에서 출발하되 지방세 양식에서 필요한 조정을 확인하세요.</dd><dt>㉚ 표준산출세액</dt><dd>같은 지방세 계산서의 일반 소득분 ⑳. 납부할 국세에 10%를 곱한 금액이 아닙니다. 다른 과세 유형의 열은 해당 명세에서 확인하세요.</dd><dt>㉜ 기납부세액</dt><dd>같은 지방세 계산서의 일반 소득분 ㉜과 지방세 특별징수 등 증빙을 대조합니다. 국세 중간예납 영수증을 이 칸에 넣지 마세요.</dd><dt>㉝ 차감납부할세액</dt><dd>지방세 계산서의 일반 소득분 ㉟을 확인합니다. 사업장이 여러 지자체에 있으면 안분명세와 납세지별 신고·납부액도 대조하세요.</dd></dl><p>${link('https://www.law.go.kr/flDownload.do?bylClsCd=110202&flSeq=160800139&gubun=','법인지방소득세 신고서와 작성방법')} · ${link('https://www.gg.go.kr/bbs/boardView.do?bIdx=225916193&bsIdx=570&menuId=1590','경기도 신고 안내')}</p>`],
        ['신고자료 보관',`<p>Smart A의 <b>시스템관리 → 데이터백업</b>에서 신고자료를 백업합니다. 백업 파일과 복구 암호는 안전하게 보관하고, 신고서 PDF·접수증·납부 증빙도 함께 보관하세요.</p><p>ERP에는 최종 장부와 결산보고서, 신고·납부 증빙을 남깁니다. 신고 과정에서 장부 수정이 생겼다면 근거와 기존 마감 상태를 확인하고 결산보고서도 다시 생성합니다.</p>`]
    ];
    function mount({root,client,coopId,active,bindRead,stepHtml,generic}) {
        root.innerHTML=stepHtml(steps)+`<p class="ag-sources">${link('https://douzoneon.com/page/proposal/smarta_proposal.pdf','더존 Smart A 모듈 안내')}</p>`;
        const input=root.querySelector('#agClosingYear'),button=root.querySelector('#agClosingLoad'),out=root.querySelector('#agClosingResult');
        const kst=new Date(Date.now()+9*3600000); input.value=kst.getUTCFullYear()-1;
        return bindRead({input,button,out,active,load:(y,_,signal)=>load(client,coopId,y,signal),render:resultHtml,
            error:e=>e.message==='YEAR_REQUIRED'?'결산 연도를 네 자리 숫자로 입력해 주세요.':e.message==='REPORT_INVALID'?'선택한 연도의 최종 결산보고서를 확인하세요.':generic(e),
            loading:'저장한 결산보고서를 확인하고 있습니다.',changed:'선택한 연도의 결산보고서를 불러오세요.'});
    }
    const api={version:'1.3.0',mount,load,analyze,resultHtml,mapStandardFields};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    if(host)host.CoopSmartaGuide=api;
})(typeof window!=='undefined'?window:null);
