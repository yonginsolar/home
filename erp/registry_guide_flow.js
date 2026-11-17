/* 변경등기 순서 1.7.0 · 준비와 제출 전 확인을 분리한다. */
(function(root){
 'use strict';
 function documents(topics){
  const li=rows=>'<ul>'+rows.map(s=>'<li>'+s+'</li>').join('')+'</ul>';
  const proof={
   capital:li(['출자금 및 출자좌수 변동내역 확인서','현물출자가 있으면 현물 출자재산인계서 등','출자감소 의결에 따른 변경이면 채권자 보호절차 증빙','1좌 금액을 줄이면 감소를 의결한 총회의사록(인증)','사회적협동조합의 정관 변경이 있으면 정관변경 인가 공문'])+ '<p>변동내역 확인서·신청서의 전체 좌수와 납입총액을 대조하세요. 신고확인증이 있으면 함께 확인하고, 경정 이력이 있으면 경정 후 등기부를 확인하세요.</p>',
   officers:li(['사임: 인감날인한 사임서·사임 임원의 인감증명서','임기만료 퇴임: 정관 사본. 사망·결격에 따른 퇴임: 해당 사실의 증명서류','해임: 해임을 증명하는 총회의사록(인증)','취임: 총회의사록(인증)·인감날인한 취임승낙서·인감증명서·주민등록등본 또는 초본','중임: 총회의사록(인증)·중임승낙서·인감증명서·주민등록등본 또는 초본','인감신고 대상이면 인감신고서·인감대지']),
   chair:li(['선임 총회의사록(인증)·취임승낙서·인감증명서·주민등록등본 또는 초본','이사장 인감신고서·인감대지','일반 협동조합은 변경신고확인증','종전 이사장이 사임하면 인감날인한 사임서·인감증명서, 임기만료면 정관 사본']),
   name:li(['정관 변경을 의결한 총회의사록(인증)·변경 정관','일반 협동조합은 변경신고확인증, 사회적협동조합은 정관변경 인가 공문']),
   purpose:li(['정관 변경을 의결한 총회의사록(인증)·변경 정관','일반 협동조합은 정관 변경신고, 사회적협동조합은 정관변경 인가 절차를 마친 자료']),
   office:li(['이전을 의결한 이사회의사록(인증)','일반 협동조합의 주사무소 변경신고확인증','정관 변경이 있으면 총회의사록(인증)·변경 정관 및 해당 신고·인가 자료','법인 인감증명서·등기사항전부증명서·주소 변경 증빙(임대차계약서 등)'])
  },labels={capital:'출자금',officers:'임원',chair:'이사장',name:'명칭',purpose:'목적',office:'주소'};
  const office=topics.length===1&&topics[0]==='office';
  return '<h3>공통</h3>'+li([office?'주사무소 이전 등기신청서':'변경등기신청서','등록면허세 영수필확인서','등기신청수수료 납부 영수증','이사장이 아닌 대리인이 신청하면 위임장'])+(topics.length===1&&topics[0]==='capital'?'<p>출자금만 변경하고 기존 대표자·등기소 제출 인감을 유지하면 별도 법인인감증명서는 필요 없습니다.</p>':'')+topics.map(t=>'<h3>'+labels[t]+' 변경</h3>'+proof[t]).join('')+'<p class="rg-sources"><a href="https://coop.go.kr/home/boardView.do?brd_mgrno=6&amp;brd_no=14292&amp;menu_no=2042" target="_blank" rel="noopener noreferrer">진흥원 등기 안내 21~23쪽</a> · <a href="https://www.law.go.kr/법령/협동조합기본법/제'+(office?'63':'64')+'조" target="_blank" rel="noopener noreferrer">협동조합 기본법 제'+(office?'63':'64')+'조</a></p>';
 }
 function attach({context,types,draw,onSelection=()=>{},onRender=()=>{}}){
  const d=document,$=id=>d.getElementById(id),host=$('registryGuide'),subject=context().key;
  let single='capital',batch=false,selected=['capital','officers'],index=0,list=[];
  const positions=new Map(),live=()=>context().authorized&&context().key===subject&&!d.hidden&&(!root.frameElement||!root.frameElement.hidden);
  const button=d.createElement('button');button.type='button';button.id='rgBatchMode';button.textContent='여러 항목 함께 변경';button.setAttribute('aria-pressed','false');$('rgTopics').append(button);
  const picker=d.createElement('fieldset');picker.id='rgBatchChoices';picker.hidden=true;picker.innerHTML='<legend>함께 변경할 항목 · 2개 이상 선택</legend>';
  for(const key of ['capital','officers','chair','name','purpose']){const label=d.createElement('label'),input=d.createElement('input');input.type='checkbox';input.value=key;input.checked=selected.includes(key);label.append(input,d.createTextNode(types[key].label));picker.append(label);input.onchange=()=>{if(!live())return;remember();selected=[...picker.querySelectorAll('input:checked')].map(n=>n.value);rebuild();};}
  $('rgTopics').after(picker);
  const batchStatus=d.createElement('p');batchStatus.id='rgBatchStatus';batchStatus.setAttribute('role','status');batchStatus.textContent='함께 변경할 항목을 2개 이상 선택하세요.';picker.append(batchStatus);
  const prepare=d.createElement('section');prepare.id='rgPrepareList';prepare.className='rg-stage-card';prepare.innerHTML='<div id="rgPreparationContext"></div><div id="rgDocuments"></div>';picker.after(prepare);
  const preparation=d.createElement('section');preparation.id='rgPreparation';preparation.innerHTML='<h2>제출 전 서류 확인</h2><label class="registry-checklist-mode">제출 방법<select id="rgChecklistProxy"><option value="chair">이사장 직접 제출</option><option value="proxy">대리 제출</option><option value="employee">조합 직원 대리 제출</option></select></label><div id="rgChecklist"></div>';picker.after(preparation);
  preparation.className='rg-stage-card';preparation.querySelector('h2').className='rg-visually-hidden';
  const route=d.createElement('details');route.id='rgStagePicker';route.className='rg-stage-picker';route.innerHTML='<summary>단계 바로가기</summary><ol id="rgFlowProgress" class="rg-flow-progress"></ol>';picker.after(route);
  const progress=route.querySelector('ol'),title=d.createElement('h2');title.id='rgFlowTitle';title.className='rg-current-stage';title.tabIndex=-1;route.after(title);
  const nav=d.createElement('nav');nav.className='rg-flow-nav';nav.setAttribute('aria-label','안내 단계 이동');nav.innerHTML='<button type="button" id="rgPrevious">이전</button><button type="button" id="rgNext">다음</button>';$('rgContent').append(nav);
  const officeRoute=$('rgOfficeRoute'),batchItems=$('rgBatchItems');
  const checklist=root.CoopRegistryChecklist?.attach({element:$('rgChecklist'),context});
  function checklistSync(){const topics=choices(),mode=$('rgChecklistProxy').value,markup=documents(topics);checklist?.sync(root.CoopRegistryChecklist.guideRows(markup,mode),JSON.stringify([topics.slice().sort(),mode,topics.includes('capital')?$('rgInputYear')?.value||'':'']));if($('rgDocuments').dataset.topics!==topics.join(',')){$('rgDocuments').innerHTML=markup;$('rgDocuments').dataset.topics=topics.join(',');const notes=[...new Set(topics.map(t=>types[t].deadline))];if(topics.some(t=>t==='name'||t==='purpose'))notes.push('정관 변경은 일반 협동조합은 변경신고, 사회적협동조합은 정관변경 인가를 먼저 진행하세요.');$('rgPreparationContext').replaceChildren(...notes.map(text=>{const note=d.createElement('p');note.textContent=text;return note;}));}}
  $('rgChecklistProxy').onchange=checklistSync;
  $('rgInputYear')?.addEventListener('input',checklistSync);
  const choices=()=>batch?selected:[single],key=()=>context().key+'|'+(batch?'batch:'+selected.join(','):single);
  function remember(){if(list[index])positions.set(key(),list[index].id);}
  function rebuild(){
   const topics=choices();onSelection(topics,batch);
   const office=!batch&&single==='office';
   list=[{id:'prepare',label:'준비서류',node:prepare}];
   if(office)list.push({id:'office-route',label:'주사무소 이전 · 관할 확인',node:officeRoute});
   else {
    list.push(...[...$('rgCommon').children].filter(n=>n.tagName==='DETAILS').map((node,i)=>({id:'common'+i,label:node.querySelector('summary').textContent,node,common:true})));
    if(batch)list.push({id:'batch-items',label:'일괄 변경 항목 선택',node:batchItems});
   }
   for(const topic of topics)list.push({id:topic+':entry',label:topic==='capital'?'기타사항 · 출자에관한사항':types[topic].label+(office?' · 입력 참고':' · 입력'),topic,part:1});
   if(!office)list.push(...[...$('rgAfterFields').children].filter(n=>n.tagName==='DETAILS').map((node,i)=>({id:'after'+i,label:node.querySelector('summary').textContent.replace(/^\d+\s*/,''),node,after:true})));
   list.push({id:'checklist',label:'제출 전 서류 확인',node:preparation});
   const old=positions.get(key());index=Math.max(0,list.findIndex(n=>n.id===old));
   const active=list[index];draw(active.topic||topics[0]||single);checklistSync();
   progress.replaceChildren(...list.map((step,i)=>{const item=d.createElement('li'),b=d.createElement('button');b.type='button';b.textContent=(i+1)+'. '+step.label;b.onclick=()=>move(i,b);repeat(b);item.append(b);return item;}));
   paint();
  }
  function paint(){
   const current=list[index],topics=choices();if(!current)return;
   if(current.topic)draw(current.topic);
   picker.hidden=!batch;button.setAttribute('aria-pressed',String(batch));host.dataset.rgSelectionMode=batch?'batch':'single';for(const n of $('rgTopics').querySelectorAll('[data-topic]'))n.setAttribute('aria-pressed',String(!batch&&n.dataset.topic===single));for(const n of picker.querySelectorAll('label'))n.toggleAttribute('data-selected',n.querySelector('input').checked);
   $('rgCommon').hidden=!current.common;$('rgTopicTitle').hidden=true;$('rgSteps').hidden=!current.topic;$('rgAfterFields').hidden=!current.after;
   for(const node of [prepare,preparation,officeRoute,batchItems])node.hidden=current.node!==node;
   for(const node of $('rgCommon').children)if(node.tagName==='DETAILS'){node.hidden=current.node!==node;if(!node.hidden)node.open=true;}
   for(const node of $('rgAfterFields').children)if(node.tagName==='DETAILS'){node.hidden=current.node!==node;if(!node.hidden)node.open=true;}
   for(const node of $('rgSteps').children){node.hidden=!current.topic||Number(node.dataset.step)!==current.part;if(!node.hidden)node.open=true;}
   $('rgBatch').hidden=!(batch&&current.id==='common1');$('rgBatch').open=true;
   $('rgSelectedItem').textContent=topics.map(t=>({capital:'기타사항(출자금)',officers:'임원/출자항목',chair:'임원/출자항목(이사장)',name:'명칭',purpose:'목적'})[t]||types[t].label).join(' · ');
   $('rgSingleChoice').hidden=batch;
   const other=host.querySelector('[data-rg-other-single]');other.hidden=batch||['capital','office'].includes(single);
   const invalid=batch&&topics.length<2;batchStatus.hidden=!invalid;$('rgPrevious').disabled=index===0;$('rgNext').disabled=index===list.length-1||invalid;
   title.textContent=(index+1)+' / '+list.length+' · '+current.label;
   [...progress.querySelectorAll('button')].forEach((b,i)=>{b.setAttribute('aria-current',i===index?'step':'false');b.disabled=invalid&&i>0;});onRender();
  }
  function repeat(node){node.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.repeat&&!e.isComposing)e.preventDefault();});}
  function move(next,origin){if(!live()||next<0||next>=list.length||batch&&selected.length<2)return;const focused=d.activeElement===origin,scroll=focused||d.activeElement===d.body;if(progress.contains(origin))route.open=false;index=next;remember();paint();if(focused)title.focus({preventScroll:true});if(scroll)title.scrollIntoView({block:'start'});}
  $('rgPrevious').onclick=e=>move(index-1,e.currentTarget);$('rgNext').onclick=e=>move(index+1,e.currentTarget);for(const n of [button,$('rgPrevious'),$('rgNext')])repeat(n);
  button.onclick=()=>{if(!live())return;remember();batch=!batch;rebuild();};
  function select(topic){if(!live()||!types[topic])return;remember();batch=false;single=topic;rebuild();}
  rebuild();return{select,sync:paint,selection:choices,batch:()=>batch};
 }
 root.CoopRegistryGuideFlow=Object.freeze({attach,documents,version:'1.7.0'});
})(typeof window==='undefined'?globalThis:window);
