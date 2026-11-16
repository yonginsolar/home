/* 2026 공식 작성가이드(2025 회계연도) 20~33쪽. 안내·복사만 제공하며 저장·제출하지 않는다. */
(function(root){
 'use strict';
 const steps=[
  ['협동조합 기본정보',[
   ['회계연도','year','실적이 발생한 회계연도'],
   ['협동조합명','name','인가증·신고확인증의 정식 명칭'],
   ['회계연도 기간','period','정관의 회계연도 시작일·종료일'],
   ['설립연월일','estDate','법인등기부의 회사성립연월일'],
   ['업종·업태','','사업자등록증의 업종·업태'],
   ['인가번호','','설립인가증·신고확인증의 번호'],
   ['사업자등록번호','bizNum','사업자등록증·고유번호증'],
   ['카테고리 분류','','포털의 해당 분류 선택'],
   ['주소','address','주사무소 주소'],
   ['제1지사무소','','실제 설치한 지사무소 주소'],
   ['제2지사무소','','실제 설치한 지사무소 주소'],
   ['연락처','phone','조합 공식 연락처'],
   ['홈페이지','','조합 공개 홈페이지 주소'],
   ['설립목적','','유효한 정관의 목적 조항'],
   ['조직연혁','','날짜·주요 내용, 최대 5개'],
   ['의사결정기구','','정관과 설치 의결: 총회·대의원총회·이사회 등'],
   ['임원현황','','회계연도 말 재임 임원: 직위·성명·경력·의결권'],
   ['조합원 현황','members','회계연도 말 전체 인원. 사업자·소비자·직원·자원봉사자·후원자별 구분은 가입 유형 확인'],
   ['직원현황','','회계연도 말 4대보험 가입자: 성별·고용형태·취약계층 구분'],
   ['배당금','','총회 승인 잉여금처분계산서의 배당금','ordinary'],
   ['첨부: 정관·규약·규정','','현재 유효한 날인본의 공개용 사본']
  ]],
  ['재정 및 성과',[
   ['자산총계','assets','회계관리 재무상태표 → 자산총계'],
   ['부채총계','liabilities','회계관리 재무상태표 → 부채총계'],
   ['자본총계','equity','자본 계정 잔액과 아직 마감하지 않은 당기순손익'],
   ['조합원출자금','capital','출자금 계정의 납입 잔액'],
   ['누적 법정적립금 총액','reserveBalance','법정적립금 계정 잔액'],
   ['누적 미처분이익잉여금·미처리결손금','retained','이월·미처분 잉여금 계정 잔액과 미마감 당기순손익'],
   ['매출액','revenue','회계관리 손익계산서 → 매출액'],
   ['매출총손익','gross','이익·손실 구분과 금액. 현재 원천에는 별도 구분 없음'],
   ['판매비와 관리비','selling','회계관리 결산보고서의 판매비와관리비(비용 합계)'],
   ['영업손익','operating','회계관리 결산보고서 → 영업손익'],
   ['영업외수익','otherRevenue','회계관리 손익계산서 → 영업외수익'],
   ['영업외비용','otherExpense','현재 결산보고서 원천에는 별도 구분 없음'],
   ['법인세차감전손익','pretax','당기순손익 + 원장에 기록된 법인세비용'],
   ['법인세 등','tax','조회기간에 원장에 기록된 법인세비용'],
   ['당기순손익','net','회계관리 결산보고서 → 당기순손익'],
   ['법정적립금 처분액','reserveDisposition','조회기간의 법정적립금 처분 기록. 위 누적 잔액과 구분'],
   ['첨부 1: 사업결산보고서','','총회 승인본: 일반·일반연합회 별지 제9호, 사회적·사회적연합회·이종연합회 별지 제23호'],
   ['첨부 2: 재무제표','','전기·당기 비교식 재무상태표·손익계산서·잉여금처분계산서 또는 결손금처리계산서']
  ]],
  ['활동상황',[
   ['활동기구','','총회·대의원총회·이사회·기타 중 실제 활동한 기구'],
   ['총회 활동상황','','일시·장소·조합원·참석자·결정사항·비고'],
   ['이사회 활동상황','','일시·장소·이사·참석자·결정사항·비고. 무산 회의 제외'],
   ['기타 활동상황','','해당 기구의 실제 활동 기록'],
   ['첨부 1: 총회·대의원총회 의사록','','대상연도 사업계획 승인 총회와 다음 해 결산 승인 총회 두 종류. 의장·선출 조합원 3명 이상 서명·날인본'],
   ['첨부 2: 이사회 의사록','','대상연도 활동상황에 대응하는 확정·날인본']
  ]],
  ['사업결과',[
   ['사업계획','','대상연도 총회가 승인한 사업계획','plan'],
   ['사업결과','','계획 대비 실제 사업실적. 상담·교육·협력·지역사회 등 필수사업 포함','plan'],
   ['지역사회 기여실적','','주사업과 중복되지 않는 별도 기여실적. 없으면 공란','social_group'],
   ['인가 부처 감독상황과 조치 결과','','대상연도 감독·행정조치가 있을 때 작성','social_group'],
   ['주사업유형·주사업·기타사업','','인가 정관의 주사업유형·사업명과 대조','social'],
   ['지역사업형·기타 공익증진형','','사업비(원) 또는 서비스(명·시간·회): 계획과 실적을 같은 단위로 작성','social'],
   ['취약계층 사회서비스 제공형','','명·시간·회 중 한 단위. 취약계층·기타 대상별 계획과 실적','social'],
   ['취약계층 고용형','','인건비(원) 또는 직원 수(명). 취약계층·기타별 계획과 실적','social'],
   ['위탁사업형','','국가·지방자치단체 위탁계약의 사업명·사업비. 공공기관·학교 계약과 구분','social'],
   ['미이행 사유','','대상연도 주사업 미이행 시 실제 사유','social'],
   ['소액대출 및 상호부조 사업 실시 여부','','실시한 경우 별지 제25호 결과보고서 첨부','social'],
   ['첨부: 사업결과 증빙서류','','기간·필수 내용이 맞는 기존 사업보고서·총회자료집·주사업 증빙 재사용 가능','social'],
   ['제출 전 확인','','첨부의 주민번호·개인 주소·휴대전화 등은 가린 사본 사용. 포털 마지막 단계에서 제출하면 공개']
  ]]
 ];
 function mount(element,formalName,{current=()=>true,onStep=()=>{}}={}){
  const doc=element.ownerDocument,p=root.CoopRules.policy(formalName),outputs=new Map(),pages=[],tabs=[];
  let active=0,generation=0,finance=null;
  const node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const allowed=type=>!type||!p.known&&p.kind!=='mixed_federation'||type==='ordinary'&&p.dividends||type==='social'&&p.kind==='social'||type==='social_group'&&['social','social_federation','mixed_federation'].includes(p.kind)||type==='plan'&&p.kind!=='social';
  element.replaceChildren();const nav=node('nav',null,'disclosure-steps');nav.setAttribute('aria-label','공시 작성 순서');
  const message=node('p',null,'disclosure-copy-status');message.setAttribute('role','status');
  const footer=node('div',null,'disclosure-paging'),prev=node('button','이전'),position=node('span'),next=node('button','다음');prev.type=next.type='button';footer.append(prev,position,next);
  function show(index,focus=false){active=Math.max(0,Math.min(3,index));pages.forEach((page,i)=>{page.hidden=i!==active;tabs[i].setAttribute('aria-current',i===active?'step':'false');});prev.disabled=active===0;next.disabled=active===3;position.textContent=(active+1)+' / 4';if(focus){pages[active].querySelector('h3').focus();}onStep(active);}
  steps.forEach(([title,fields],index)=>{
   const tab=node('button',(index+1)+'. '+title);tab.type='button';tab.onclick=()=>show(index,true);nav.append(tab);tabs.push(tab);
   const page=node('section',null,'disclosure-step-panel'),heading=node('h3',(index+1)+'. '+title);heading.tabIndex=-1;page.append(heading);
   if(index===1){const controls=node('div',null,'disclosure-finance-controls'),label=node('label','조회기준일'),end=node('input'),read=node('button','다시 조회'),notice=node('p',null,'disclosure-source-status'),source=node('p',null,'disclosure-registration-note');end.type='date';end.id='disclosureFinanceEnd';end.dataset.erpQueryControl='';label.htmlFor=end.id;label.append(end);read.type='button';read.id='disclosureFinanceRead';notice.dataset.disclosureFinanceStatus='';notice.setAttribute('role','status');controls.append(label,read);page.append(controls,source,notice);finance={end,read,notice,source};}
   if(index===2){const n=node('p',null,'disclosure-source-status');n.dataset.disclosureAssembly='';page.append(n);}
   const grid=node('div',null,'disclosure-field-grid');page.append(grid);
   for(const[field,key,source,type]of fields){
    if(!allowed(type))continue;
    const card=node('article'),h=node('h4',field),origin=node('small',source);card.append(h);
    if(key){const line=node('div',null,'disclosure-value-line'),output=node('output'),copy=node('button','복사');output.dataset.disclosureValue=key;copy.type='button';copy.dataset.disclosureCopy=key;copy.setAttribute('aria-label',field+' 복사');copy.hidden=true;line.append(output,copy);card.append(line);const item={output,copy,value:'',busy:false};outputs.set(key,item);
     copy.onclick=async()=>{if(item.busy||!item.value||!current()||page.hidden)return;const value=item.value,token=generation;item.busy=true;copy.disabled=true;message.textContent='';try{await root.navigator.clipboard.writeText(value);if(token===generation&&current()&&item.value===value)message.textContent=field+' 복사 완료';}catch(_){if(token===generation&&current()&&item.value===value)message.textContent='복사하지 못했습니다. 표시된 값을 직접 선택해 주세요.';}finally{item.busy=false;copy.disabled=false;}};
    }
    card.append(origin);grid.append(card);
   }
   pages.push(page);
  });
  element.append(nav,...pages,message,footer);prev.onclick=()=>show(active-1,true);next.onclick=()=>show(active+1,true);
  element.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.repeat&&e.target.matches('button'))e.preventDefault();});show(0);
  return Object.freeze({update(values){generation++;message.textContent='';for(const[key,item]of outputs){const value=values[key];item.value=typeof value==='string'?value:typeof value?.copy==='string'?value.copy:'';item.output.textContent=typeof value?.display==='string'?value.display:item.value;item.copy.hidden=!item.value;}const a=element.querySelector('[data-disclosure-assembly]');a.textContent=values.assemblyYears||'';},invalidate(){generation++;message.textContent='';},step:()=>active,finance});
 }
 root.RegistryDisclosureFields=Object.freeze({mount,version:'1.2.0'});
})(window);
