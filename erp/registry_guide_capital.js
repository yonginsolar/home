/* 출자 변경 사유2.0.0 · 연말 현황의 사유와 실제 변경일 입력을 분리한다. */
(function(root){
 'use strict';
 function cause(capital,date=''){
  if(!capital||capital.provisional!==false||!Number.isInteger(capital.year)||capital.cutoff!==capital.year+'-12-31'||!Number.isSafeInteger(capital.total)||capital.total<0)return {text:'',need:'종료된 기준연도의 출자금을 확인하세요.'};
  return {text:capital.year+'년 12월 31일 기준 조합원 출자 내역의 변동사항을 반영하여 출자총좌수 및 납입출자금 총액의 변경등기를 신청함. 납입출자금 총액은 '+capital.total.toLocaleString('ko-KR')+'원임.',origin:'변경',date:root.CoopRegistryModel.date(date)?date:'',need:''};
 }
 function attach({context}){
  const d=document,element=d.createElement('section'),entryElement=d.createElement('section');
  element.className='rg-cause';element.innerHTML='<p id="rgCauseStatus" role="status"></p><div id="rgCauseRows"></div>';
  entryElement.className='rg-cause';entryElement.innerHTML='<p>등기원인: <strong>변경</strong></p><label>등기원인일자<input id="rgCapitalEffectiveDate" type="date"></label><p class="rg-note">이번 변경 증빙에 기재된 날짜를 입력하세요.</p><div id="rgCapitalEntryRows"></div>';
  const date=entryElement.querySelector('input'),status=element.querySelector('[role=status]'),rows=element.querySelector('#rgCauseRows'),entryRows=entryElement.querySelector('#rgCapitalEntryRows'),drafts=new Map(),copies=new Map();let key='',topic='',year='',capital=null,epoch=0,subject='';
  const live=()=>context().authorized&&!d.hidden&&(!root.frameElement||!root.frameElement.hidden),scopeKey=()=>context().key+'|'+year;
  function row(host,label,value,enabled){
   const box=d.createElement('div'),title=d.createElement('strong'),out=d.createElement('output'),button=d.createElement('button');box.className='rg-info-row';title.textContent=label;out.textContent=value;button.type='button';button.textContent='복사';button.setAttribute('aria-label',label+' 복사');button.dataset.rgInputCopy=label;button.dataset.rgCopyReady=String(enabled);button.disabled=!enabled||copies.has(label);box.append(title,out,button);host.append(box);
   button.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.repeat&&!e.isComposing)e.preventDefault();});
   button.onclick=async()=>{if(!live()||!button.isConnected||button.disabled||copies.has(label))return;const op={},e=epoch,k=key;copies.set(label,op);button.disabled=true;try{await navigator.clipboard.writeText(value);if(live()&&e===epoch&&k===key)status.textContent='복사했습니다.';}catch{if(live()&&e===epoch&&k===key)status.textContent='표시된 내용을 선택해 복사하세요.';}finally{if(copies.get(label)===op)copies.delete(label);if(live())for(const n of [...rows.querySelectorAll('button'),...entryRows.querySelectorAll('button')])if(n.dataset.rgInputCopy===label)n.disabled=n.dataset.rgCopyReady!=='true'||copies.has(label);}};
  }
  function render(){rows.replaceChildren();entryRows.replaceChildren();if(topic!=='capital'||!live())return;const r=cause(capital,date.value);status.textContent=r.need;row(rows,'등기의 사유',r.text,!!r.text);row(entryRows,'등기원인',r.origin||'',!!r.origin);row(entryRows,'등기원인일자',r.date||'',!!r.date);}
  function scope(t,y){const next=context().key+'|'+y;if(subject&&subject!==context().key)drafts.clear();subject=context().key;topic=t;if(next!==key){epoch++;capital=null;year=String(y);key=next;date.value=drafts.get(key)?.date||'';}element.hidden=t!=='capital';entryElement.hidden=t!=='capital';render();}
  function setCapital(c){epoch++;capital=c&&c.year===Number(year)&&live()?c:null;render();}
  date.oninput=()=>{epoch++;drafts.set(scopeKey(),{date:date.value});render();};
  const leave=()=>{epoch++;capital=null;rows.replaceChildren();entryRows.replaceChildren();status.textContent='';};
  return {element,entryElement,scope,setCapital,leave};
 }
 root.CoopRegistryCapitalGuide=Object.freeze({cause,attach,version:'2.0.0'});
})(typeof window==='undefined'?globalThis:window);
