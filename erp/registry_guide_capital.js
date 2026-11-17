/* 출자 변경 사유1.0.0 · 종료연도 집계와 확인한 변경일을 구분한다. */
(function(root){
 'use strict';
 const reasons={increase:'조합원의 가입 및 추가 출자',decrease:'조합원의 탈퇴 및 출자금 반환',mixed:'조합원의 가입·추가 출자 및 탈퇴·출자금 반환',unit:'출자 1좌 금액 변경'};
 function cause(capital,reason,date=''){
  if(!capital||capital.provisional!==false||!Number.isInteger(capital.year)||capital.cutoff!==capital.year+'-12-31'||!Number.isSafeInteger(capital.total)||capital.total<0)return {text:'',need:'종료된 기준연도의 출자금을 확인하세요.'};
  if(!Object.hasOwn(reasons,reason))return {text:'',need:'출자금 변경 사유를 선택하세요.'};
  const a=capital.activity;if(reason!=='unit'&&(!a||!Number.isSafeInteger(a.increase)||!Number.isSafeInteger(a.decrease)||a.increase<0||a.decrease<0))return{text:'',need:'기준연도의 납입·반환 내역을 다시 확인하세요.'};
  if(reason==='increase'&&(!a.increase||a.decrease)||reason==='decrease'&&(!a.decrease||a.increase)||reason==='mixed'&&(!a.increase||!a.decrease))return{text:'',need:'납입·반환 내역에 맞는 변경 사유를 선택하세요.'};
  const validDate=root.CoopRegistryModel.date(date);if(reason==='unit')return{text:'',origin:'변경',date:validDate?date:'',need:'1좌 금액 변경은 의결한 내용과 변경일에 맞는 별도 등기사유를 준비하세요.'};
  const when=reason==='unit'?date:capital.cutoff,[y,m,d]=when.split('-');return{text:y+'년 '+Number(m)+'월 '+Number(d)+'일 '+reasons[reason]+(reason==='increase'?'로':'으로')+' 인하여 출자금 총액이 '+capital.total.toLocaleString('ko-KR')+'원으로 변경되었으므로 그 등기를 구함.',origin:'변경',date:validDate?date:'',need:''};
 }
 function attach({context}){
  const d=document,element=d.createElement('section');element.className='rg-cause';element.innerHTML='<label>출자금 변경 사유<select id="rgCapitalReason"><option value="">사유 선택</option>'+Object.entries(reasons).map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')+'</select></label><p>원인일자에는 이번 변경 증빙의 변경일을 입력하세요.</p><label>등기원인일자<input id="rgCapitalEffectiveDate" type="date"></label><p id="rgCauseStatus" role="status"></p><div id="rgCauseRows"></div>';
  const reason=element.querySelector('select'),date=element.querySelector('input'),status=element.querySelector('[role=status]'),rows=element.querySelector('#rgCauseRows'),drafts=new Map(),copies=new Map();let key='',topic='',year='',capital=null,epoch=0,subject='';
  const live=()=>context().authorized&&!d.hidden&&(!root.frameElement||!root.frameElement.hidden),scopeKey=()=>context().key+'|'+year;
  function row(label,value,enabled){const box=d.createElement('div');box.className='rg-info-row';const title=d.createElement('strong'),out=d.createElement('output'),button=d.createElement('button');title.textContent=label;out.textContent=value;button.type='button';button.textContent='복사';button.setAttribute('aria-label',label+' 복사');button.dataset.rgInputCopy=label;button.dataset.rgCopyReady=String(enabled);button.disabled=!enabled||copies.has(label);box.append(title,out,button);rows.append(box);button.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.repeat&&!e.isComposing)e.preventDefault();});button.onclick=async()=>{if(!live()||button.disabled||copies.has(label))return;const op={},e=epoch,k=key;copies.set(label,op);button.disabled=true;try{await navigator.clipboard.writeText(value);if(live()&&e===epoch&&k===key)status.textContent='복사했습니다.';}catch{if(live()&&e===epoch&&k===key)status.textContent='표시된 문장을 선택해 복사하세요.';}finally{if(copies.get(label)===op)copies.delete(label);if(live())for(const n of rows.querySelectorAll('button'))if(n.dataset.rgInputCopy===label)n.disabled=n.dataset.rgCopyReady!=='true'||copies.has(label);}};}
  function render(){rows.replaceChildren();if(topic!=='capital'||!live())return;const r=cause(capital,reason.value,date.value);status.textContent=r.need;row('등기의 사유',r.text,!!r.text);row('등기원인',r.origin||'',!!r.origin);row('등기원인일자',r.date||'',!!r.date);}
  function scope(t,y){const next=context().key+'|'+y;if(subject&&subject!==context().key)drafts.clear();subject=context().key;topic=t;if(next!==key){epoch++;capital=null;year=String(y);key=next;const saved=drafts.get(key)||{};reason.value=saved.reason||'';date.value=saved.date||'';}element.hidden=t!=='capital';render();}
  function setCapital(c){epoch++;capital=c&&c.year===Number(year)&&live()?c:null;if(capital&&!reason.value){const a=capital.activity;if(a?.increase>0&&a?.decrease>0)reason.value='mixed';else if(a?.increase>0&&!a?.decrease)reason.value='increase';else if(a?.decrease>0&&!a?.increase)reason.value='decrease';}render();}
  const changed=()=>{epoch++;drafts.set(scopeKey(),{reason:reason.value,date:date.value});render();};reason.onchange=changed;date.oninput=changed;const leave=()=>{epoch++;capital=null;rows.replaceChildren();status.textContent='';};return{element,scope,setCapital,leave};
 }
 root.CoopRegistryCapitalGuide=Object.freeze({cause,attach,reasons,version:'1.0.0'});
})(typeof window==='undefined'?globalThis:window);
