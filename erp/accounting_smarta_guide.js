/* Smart A guide v1.0.0 — NTS 2026 manual; read-only closing report references. */
(function (host) {
    'use strict';
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const manual = 'https://hometax.speedycdn.net/dn_dir/webdown/1.20260227_%EB%B2%95%EC%9D%B8%EC%84%B8%20%EB%AC%B4%EB%A3%8C%EC%9E%91%EC%84%B1%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8(SMART-A)%EC%82%AC%EC%9A%A9%EB%B2%95_2026.zip';
    const link = (u,t) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t} ↗</a>`;
    const screen = (file,title,page) => `<details class="ag-screen"><summary>${title} 화면 보기</summary><figure><a href="accounting-guide/smarta-${file}.jpg" target="_blank" rel="noopener noreferrer"><img src="accounting-guide/smarta-${file}.jpg" alt="국세청 Smart A 일반법인 사용설명서의 ${title} 예시 화면" loading="lazy"></a><figcaption>국세청 2026년 일반법인 사용설명서 ${page}쪽 · 설명서의 예시이며 우리 조합의 자료가 아닙니다. 이미지를 누르면 크게 볼 수 있습니다.</figcaption></figure></details>`;
    const groups = [['assets','자산'],['liabilities','부채'],['equity','자본계정'],['revenue','매출'],['expenses','비용'],['other_revenue','영업외수익']];
    const totals = [['total_assets','자산계정 합계'],['total_liabilities','부채계정 합계'],['total_revenue','매출 합계'],['total_expenses','비용 합계'],['total_other_revenue','영업외수익 합계'],['net_income','당기순손익']];
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
        const items={}; for(const [k] of groups) {
            if (!Array.isArray(s[k]) || s[k].length>2000) throw new Error('REPORT_INVALID');
            items[k]=s[k].map(r=>{
                if(typeof r.name!=='string' || !r.name.trim() || r.name.length>200) throw new Error('REPORT_INVALID');
                return {name:r.name,amount:number(r.amount)};
            });
        }
        return {year,start:row.period_start,end:row.period_end,closed:s.is_closed,fullYear:row.period_start===`${year}-01-01`&&row.period_end===`${year}-12-31`,generated:typeof row.generated_at==='string'?row.generated_at.slice(0,10):'',values,items};
    }
    async function load(client,coopId,year) {
        year=yearValue(year);
        if(!client || !/^[a-f0-9-]{36}$/i.test(String(coopId||''))) throw new Error('COOP_REQUIRED');
        // Existing table SELECT + RLS remains authoritative; no privileged client or write.
        const {data,error}=await client.from('accounting_closing_report_snapshots')
            .select('coop_id,fiscal_year,period_start,period_end,generated_at,summary:report_payload->summary')
            .eq('coop_id',coopId).eq('fiscal_year',year).limit(2);
        if(error || !Array.isArray(data)) throw new Error('READ_FAILED');
        if(data.length>1) throw new Error('REPORT_INVALID');
        return analyze(data[0],coopId,year);
    }
    function copy(v,name,enabled) {return enabled?`<button type="button" class="ag-copy" data-copy="${v}" aria-label="${esc(name)} 숫자 복사">복사</button>`:'';}
    function resultHtml(m) {
        if(!m) return '<p class="ag-notice">선택한 연도의 결산보고서를 조회하지 못했습니다. 회계의 「결산 보고서 생성」에서 해당 연도를 선택해 보고서를 생성했는지, 열람 권한이 있는지 확인하세요. 조회되지 않은 자료를 0원으로 입력하지 마세요.</p>';
        const ready=m.fullYear&&m.closed;
        const table=(rows,caption)=>`<div class="ag-table-wrap"><table><caption>${caption}</caption><thead><tr><th>ERP 항목</th><th>금액</th></tr></thead><tbody>${rows.map(([name,v])=>`<tr><th scope="row">${esc(name)}</th><td>${v.toLocaleString('ko-KR')}원 ${copy(v,name,ready)}</td></tr>`).join('')}</tbody></table></div>`;
        return `<p class="ag-result-title">${m.year}년 결산보고서 · ${esc(m.start)} ~ ${esc(m.end)}</p><p>보고서 생성일 ${esc(m.generated)||'확인 필요'} · ${m.closed?'손익마감 반영':'손익마감 전'}</p>${!ready?'<p class="ag-notice">연간 결산이 마감된 보고서가 아닙니다. 금액 복사는 제공하지 않습니다. 결산 기간과 마감 상태를 확인하고 최종 보고서를 다시 생성하세요.</p>':''}${table(totals.map(([k,n])=>[n,m.values[k]]),'ERP 결산보고서에 기록된 금액')}${groups.map(([k,n])=>`<details class="ag-source"><summary>${n} 세부 금액</summary>${m.items[k].length?table(m.items[k].map(r=>[r.name,r.amount]),esc(n)+' 계정별 금액'):'<p>해당 보고서에 표시된 계정이 없습니다.</p>'}</details>`).join('')}<p class="ag-footnote">장부의 참고 금액입니다. Smart A 표준 계정에 항목별로 분류해 입력해야 하며 자동 전송되지 않습니다. 당기순손익을 과세표준에 그대로 넣지 마세요. 총회 의결·세무조정·신고 완료 여부는 별도로 확인합니다.</p>`;
    }
    const steps=[
        ['신고 연도와 프로그램 준비',`<p>먼저 <b>어느 사업연도의 법인세를 신고하는지</b> 확인하세요. 2025년 1~12월 결산을 2026년에 신고한다면 국세청용 Smart A 2026 버전을 사용합니다.</p><p>${link('https://www.hometax.go.kr','홈택스')} 상단 검색창에서 <b>SmartA</b>를 검색하고 자료실의 최신 「법인세 무료작성프로그램」 게시글을 엽니다. ${link(manual,'2026년 공식 사용설명서 내려받기(압축파일)')}</p><p>설치파일의 압축을 풀어 Windows PC에 설치하고, 실행할 때마다 로그인 화면의 <b>최신버전확인</b>을 누르세요. 기존 자료가 있다면 재설치 전에 백업합니다.</p><div class="ag-notice">이 안내는 2026년 국세청 배포본 기준입니다. 적용 대상은 <b>2025년 12월~2026년 11월 결산 법인</b>입니다. 2026년 12월 결산은 다음 신고용 버전을 확인해야 합니다. 무료판은 소규모 영세사업자용이며 일반법인·비영리법인의 신고 경로는 구분됩니다.</div>`],
        ['ERP 결산보고서 준비',`<p>회계 화면 상단의 <b>결산 보고서 생성</b>에서 결산 연도를 선택해 재무상태표·손익계산서·이익잉여금처분계산서를 준비하세요. 아래에는 이미 생성해 저장한 보고서만 불러옵니다.</p><div class="ag-loader"><label for="agClosingYear">결산 연도</label><input id="agClosingYear" type="number" min="1900" max="2100" step="1"><button type="button" id="agClosingLoad" class="btn btn-primary">결산보고서 불러오기</button></div><div id="agClosingResult" role="status" aria-live="polite">결산 연도를 선택해 보고서를 불러오세요.</div><p>전기 금액이 필요한 항목은 전년도 보고서도 준비합니다. 장부를 수정했다면 해당 연도의 보고서를 다시 생성한 뒤 불러오세요.</p>`],
        ['회사 기본정보 등록',`<p>Smart A 로그인 화면에서 <b>회사등록</b>을 열고 조합의 회사명·회계기간을 등록합니다. 다음에는 회사 선택 칸에서 <b>F2</b>를 눌러 등록한 조합을 선택할 수 있습니다.</p><p><b>기초사항검토 → 회사기본사항등록(회사등록)</b>에서 사업자등록번호·법인등록번호·대표자·주소·업종과 사업연도를 사업자등록증·등기 자료에 맞춥니다. <b>추가사항</b> 탭의 법인구분과 중소기업 여부도 확인하세요. 협동조합이라는 이유만으로 비영리나 감면 대상을 선택하지 마세요.</p>${screen('company','회사등록',27)}<p><b>끝내기 전 확인:</b> 조합 이름과 사업연도가 맞는지 확인하고 저장하세요. ERP의 조합 선택과 Smart A의 회사 선택은 서로 별개입니다.</p>`],
        ['작성할 서식과 순서 확인',`<p><b>기초사항검토 → 작성순서/flow chart(2)</b>를 엽니다. 서식명을 더블클릭하면 해당 입력 화면으로 이동합니다.</p><p>먼저 표준재무제표를 입력하고, 해당하는 세무조정 서식, 세액조정계산서, 최종 신고서 순으로 진행합니다. 모든 서식을 채우는 것이 아니라 조합의 실제 거래와 신고 요건에 해당하는 서식을 확인합니다.</p>${screen('flow','작성순서',30)}`],
        ['표준재무제표에 장부 금액 입력',`<p><b>표준재무제표</b>에서 <b>표준재무상태표</b>를 열고 상단 <b>편집(F3)</b>을 누릅니다. ERP 재무상태표의 각 계정을 같은 성격의 표준 항목에 나누어 입력합니다. 세부 금액을 입력하고 <b>Enter</b>를 눌러 합계를 반영한 뒤 저장하세요.</p><p>예를 들어 보통예금은 현금·예금 항목을 확인하고, 재고·발전설비·부채는 각각의 표준 항목을 확인합니다. <b>유동자산처럼 자동 합계 칸에는 총액을 억지로 입력하지 않습니다.</b> ERP 계정코드와 신고서의 표준 코드는 같다고 가정하지 마세요.</p>${screen('statements','표준재무상태표',31)}<p><b>표준손익계산서</b>에는 매출, 비용, 영업외수익 등을 구분해 넣고 ERP 당기순손익과 대조합니다. 매출은 공급가액 기준을 확인합니다. <b>표준원가명세서</b>는 해당 원가 유형과 작성 필요 여부를 검토합니다.</p><p><b>이익잉여금처분(결손금)계산서</b>는 <b>편집(F3)</b>으로 작성하고 <b>처분일(F4)</b>에 실제 처분 확정일을 입력합니다. 보고서를 만든 날짜로 대신하지 마세요. 전기이월 금액과 적립금·배당·차기이월 금액은 실제 의결 내용에 맞춥니다.</p><p><b>끝내기 전 확인:</b> 표준재무상태표의 자산과 부채·자본, 표준손익계산서의 당기순손익이 ERP 최종 보고서와 맞는지 확인합니다. ERP CSV가 Smart A에 통째로 자동 입력되는 기능은 아닙니다.</p>`],
        ['장부 이익과 세법상 소득의 차이 검토',`<p>수입금액조정, 감가상각, 재고, 기부금, 기업업무추진비 등 해당 서식을 확인합니다. 회계 비용이라도 세법상 공제되지 않는 금액이 있고, 이월결손금·기납부세액도 별도 근거가 필요합니다.</p><div class="ag-notice"><b>여기부터는 단순 복사가 아닙니다.</b> 당기순이익에 세율만 곱해 신고하거나, 오류를 없애기 위해 모르는 항목을 0으로 넣지 마세요. 외부조정 대상 여부와 조합에 적용되는 과세 방식·공제·감면은 국세청 안내 또는 세무전문가에게 확인합니다.</div><p>표준재무제표나 조정 서식을 수정했다면 뒤의 세액 계산 화면에서 <b>새로불러오기</b>를 눌러 변경 사항을 다시 반영합니다.</p>`],
        ['세액조정계산서와 최종 신고서 확인',`<p><b>법인세 과세표준 및 세액조정계산서</b>를 열어 작성한 재무제표·조정 자료를 불러오고, 원천납부·중간예납 등 실제 기납부세액을 근거와 대조합니다.</p>${screen('tax-adjustment','세액조정계산서',77)}<p>다음으로 <b>법인세 과세표준 및 세액신고서</b>에서 <b>새로불러오기</b>를 누릅니다. 수입금액·세액을 이 화면에 임의로 덮어쓰지 말고 원래 연결된 서식을 수정하세요. 결산 확정일은 총회 등에서 실제 결산이 확정된 날, 신고일은 실제 신고 예정일을 입력합니다.</p>${screen('return','최종 신고서',75)}<p><b>끝내기 전 확인:</b> 사업연도, 조합 정보, 과세표준, 공제·감면, 기납부세액, 최종 납부·환급액과 필요한 첨부 서식을 검토한 뒤 Smart A에서 <b>마감</b>합니다. Smart A 마감과 ERP 손익마감은 별개입니다.</p>`],
        ['전자신고 파일 만들기·오류 검사',`<p><b>전자신고/일괄출력 → 법인세전자신고</b>를 열어 직접 신고라면 <b>일반업체</b>를 선택하고 <b>제출자 등록</b>에 실제 홈택스 제출자 ID를 입력합니다. 이 인증정보나 파일 암호는 ERP 안내에 입력하지 않습니다.</p>${screen('efile','법인세전자신고',118)}<p><b>전자신고제작</b> 탭에서 저장할 드라이브·조합을 선택하고 마감된 서식 목록을 확인한 뒤 <b>제작</b>을 누릅니다. 파일 저장 위치와 파일 암호를 안전하게 보관하세요.</p><p><b>신고데이터 오류검증</b> 탭에서 제작한 자료를 검사합니다. 오류가 있으면 해당 서식의 마감을 취소하고 수정·재마감·재제작합니다. 파일 생성이나 오류검사 통과만으로 신고가 접수되지는 않습니다.</p>`],
        ['홈택스 파일변환·제출·접수증 확인',`<p>파일 생성 때 입력한 제출자 ID로 ${link('https://www.hometax.go.kr','홈택스')}에 로그인합니다. <b>세금신고 → 법인세 신고 → 법인세신고(정기,중간예납,경정청구) → 파일변환신고</b>에서 해당 신고를 선택합니다.</p><p><b>찾아보기</b>로 생성한 파일 선택 → <b>파일형식검증하기</b> → <b>검증결과확인</b> → <b>내용검증하기</b> 순서로 진행합니다. 오류가 있으면 Smart A 원서식을 수정하고 파일을 다시 제작합니다.</p>${screen('hometax-convert','홈택스 파일변환',126)}<p>정상 검증 뒤 <b>전자파일제출 이동</b>에서 내용을 최종 확인하고 직접 제출합니다. <b>신고내역</b>에서 접수번호·접수증·제출서식 목록을 확인하고 보관하세요. 별도 부속서류가 있으면 해당 제출 메뉴에서 확인합니다.</p><p>국세 납부와 법인지방소득세 신고·납부는 별도로 확인합니다. 이 안내는 홈택스 제출·납부를 자동 실행하지 않습니다.</p>`],
        ['신고자료 보관',`<p>Smart A의 <b>시스템관리 → 데이터백업</b>에서 신고자료를 백업합니다. 백업 파일과 복구 암호는 안전하게 보관하고, 신고서 PDF·접수증·납부 증빙도 함께 보관하세요.</p><p>ERP에는 최종 장부와 결산보고서, 신고·납부 증빙을 남깁니다. 신고 과정에서 장부 수정이 생겼다면 근거와 기존 마감 상태를 확인하고 결산보고서도 다시 생성합니다.</p>`]
    ];
    function mount({root,client,coopId}) {
        let generation=0;
        root.innerHTML=`<p class="ag-footnote">국세청용 Smart A · 2026년 공식 사용설명서 기준</p>`+steps.map(([title,html],i)=>`<details class="ag-step"${i===0?' open':''}><summary><span class="ag-number">${i+1}</span>${title}</summary><div class="ag-step-body">${html}</div></details>`).join('');
        const input=root.querySelector('#agClosingYear'),button=root.querySelector('#agClosingLoad'),out=root.querySelector('#agClosingResult');
        const kst=new Date(Date.now()+9*3600000); input.value=kst.getUTCFullYear()-1;
        input.addEventListener('input',()=>{generation++;button.disabled=false;button.textContent='결산보고서 불러오기';out.textContent='결산 연도가 변경됐습니다. 보고서를 다시 불러오세요.';});
        button.addEventListener('click',async()=>{
            const ticket=++generation;button.disabled=true;button.textContent='불러오는 중…';out.textContent='저장한 결산보고서를 확인하고 있습니다.';
            try {const model=await load(client,coopId,input.value); if(ticket===generation&&out.isConnected)out.innerHTML=resultHtml(model);}
            catch(e){if(ticket===generation&&out.isConnected)out.textContent=e.message==='YEAR_REQUIRED'?'결산 연도를 네 자리 숫자로 입력해 주세요.':'보고서를 불러오지 못했습니다. 로그인·같은 조합의 결산자료 열람 권한과 보고서 상태를 확인해 주세요.';}
            finally {if(ticket===generation&&button.isConnected){button.disabled=false;button.textContent='결산보고서 불러오기';}}
        });
    }
    const api={mount,load,analyze,resultHtml};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    if(host)host.CoopSmartaGuide=api;
})(typeof window!=='undefined'?window:null);
