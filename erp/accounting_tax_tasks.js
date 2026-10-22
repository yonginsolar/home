/* Tax tasks 1.1.1. Simple reminders; old drafts/evidence are preserved separately. */
(function(root){
 'use strict';
 const names={vat:'부가세 신고·납부',vat_notice:'부가세 예정고지 납부',withholding:'원천세 신고·납부',local_withholding:'지방소득세 특별징수'};
 const period=r=>{const a=String(r.period_from||'').slice(0,7),b=String(r.period_end||'').slice(0,7);return '귀속연월 '+a+(a===b?'':' ~ '+b);};
 const modes={unset:'미설정',none:'대상 아님',quarterly:'분기별 예정·확정 신고',notice:'반기별 확정 신고 + 예정고지 납부',halfyear:'반기별 신고·납부',monthly:'매월 신고·납부'};
 const make=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const key=r=>r.kind+'|'+r.period_end;
 const filing=r=>!r.filing_required?'신고 대상 아님':r.state?.filed_date?'신고 완료 · '+r.state.filed_date:'신고 전';
 const payment=r=>({paid:'납부 완료',none:'납부할 세액 없음',refund:'환급 대상'}[r.state?.settlement]||'납부 확인 전')+(r.state?.paid_date?' · '+r.state.paid_date:'');
 const completed=r=>typeof r.state?.reminder_done==='boolean'?r.state.reminder_done:(!r.filing_required||!!r.state?.filed_date)&&['paid','none','refund'].includes(r.state?.settlement);
 const taskInput=r=>({filed_date:r.state?.filed_date||'',settlement:r.state?.settlement||'pending',paid_date:r.state?.paid_date||'',filing_due:r.filing_due,payment_due:r.payment_due,receipt:r.state?.receipt||'',memo:r.state?.memo||'',due_reason:r.state?.due_reason||''});
 function create({element,client,getContext}){
  let owner='',rows=[],settings=null,settingsDraft=null,year=Number(today().slice(0,4)),seq=0,editorSeq=0,active=null,modal=null,status,list,orphanList,outcomes,yearControl,filter='pending',settingsButton,reloadButton,pending=null,pendingYear=null;
  const drafts=new Map(),reminders=new Map(),controllers=new Set(),dialogs=new Set();let canEdit=false,serverToday=today(),message='',routeHandled=false,loadedYear=null,listFresh=false,navigationClose=false,modalClosing=false,closeAfterShow=false,queuedOpen=null;
  const fingerprint=d=>JSON.stringify([d.data,d.approval?.id||null]);
  const ctx=()=>getContext()||{},valid=()=>!!owner&&owner===ctx().owner&&ctx().allowed===true;
  const visible=()=>ctx().visible!==false&&!root.frameElement?.hidden;
  const editable=()=>valid()&&canEdit&&ctx().edit===true;
  const hasDraft=()=>!!settingsDraft?.dirty||!!settingsDraft?.attempt||[...drafts.values()].some(d=>d.dirty||d.attempt)||[...reminders.values()].some(d=>d.attempt);
  const current=(ticket,who)=>ticket===seq&&who===owner&&valid()&&visible();
  const rowYear=r=>r?.due_month?Number(r.due_month.slice(0,4)):Number(r?.period_end?.slice(0,4))+(r?.period_end?.slice(5,7)==='12'?1:0);
  const isOrphan=d=>!!d?.row&&listFresh&&loadedYear===rowYear(d.row)&&!rows.some(r=>key(r)===key(d.row));
  const blocked=d=>!!d?.saving||!!d?.attempt;
  function dialog(kind,message,options){const ticket={owner};dialogs.add(ticket);return Promise.resolve(root.CoopDialog[kind](message,options)).finally(()=>dialogs.delete(ticket));}
  function reset(){pause();rows=[];settings=null;drafts.clear();reminders.clear();settingsDraft=null;active=null;canEdit=false;routeHandled=false;loadedYear=null;listFresh=false;}
  async function read(action,data,ticket=seq){
   const who=owner,c=new AbortController();controllers.add(c);let timer;
   try{const q=client.rpc('accounting_tax_tasks',{p_action:action,p_coop_id:ctx().coopId,p_data:data,p_request_key:null});
    const request=q.abortSignal?q.abortSignal(c.signal):q;
    const r=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>{c.abort();reject(Error('조회 시간이 길어졌습니다. 다시 확인해 주세요.'));},15000);})]);
    if(!current(ticket,who))throw Error('STALE_READ');if(r.error)throw r.error;return r.data;
   }finally{clearTimeout(timer);controllers.delete(c);}
  }
  function button(text,fn,cls='btn btn-outline-secondary btn-sm'){const b=make('button',cls,text);b.type='button';b.onclick=fn;if(text==='?')b.setAttribute('aria-label','세무 할 일 도움말');return b;}
  function build(){
   element.classList.add('tax-tasks');const bar=make('div','d-flex gap-2 flex-wrap align-items-center mb-3');
   bar.append(make('h2','h5 m-0 me-auto','세무 할 일'));
   const label=make('label','small','기한 연도');yearControl=make('select','form-select form-select-sm');yearControl.id='taxTaskYear';yearControl.dataset.erpQueryControl='';label.htmlFor=yearControl.id;
   yearControl.style.width='auto';for(let y=Number(today().slice(0,4))+2;y>=2024;y--){const o=make('option','',y+'년');o.value=y;yearControl.append(o);}yearControl.value=String(year);
   yearControl.onchange=()=>{year=Number(yearControl.value);void load();};
   settingsButton=button('신고 주기 설정',()=>openSettings());reloadButton=button('다시 확인',()=>void load());
   const scope=make('select','form-select form-select-sm');scope.id='taxTaskFilter';scope.style.width='auto';scope.dataset.erpQueryControl='';scope.setAttribute('aria-label','세무 할 일 상태');for(const [v,t]of [['pending','진행 중'],['completed','완료 이력'],['all','전체']]){const o=make('option','',t);o.value=v;scope.append(o);}scope.onchange=()=>{filter=scope.value;render();};
   bar.append(label,yearControl,settingsButton,reloadButton,button('?',()=>void dialog('alert','🌱 신고 주기에 맞춰 해야 할 일을 알려드려요. 업무를 마쳤다면 완료를 누르세요. 결재 승인만으로 자동 완료되지는 않아요. 실제 기한은 홈택스·위택스의 고지와 함께 확인해 주세요.',{title:'세무 할 일 도움말'}),'btn btn-outline-secondary btn-sm coop-workflow-help'));
   bar.append(scope);status=make('p','small');status.setAttribute('role','status');list=make('div','d-grid gap-3');orphanList=make('div','d-grid gap-3 mt-3');orphanList.dataset.taxOrphans='';outcomes=make('div','d-grid gap-2 mb-3');outcomes.dataset.taxOutcomes='';element.replaceChildren(bar,status,outcomes,list,orphanList);
   root.addEventListener('beforeunload',e=>{if(hasDraft()){e.preventDefault();e.returnValue='';}});
   if(root.frameElement)new MutationObserver(()=>{if(root.frameElement.hidden)pause();}).observe(root.frameElement,{attributes:true,attributeFilter:['hidden']});
   const pane=element.closest('.tab-pane');
   if(pane)new MutationObserver(()=>{if(!visible())pause();}).observe(pane,{attributes:true,attributeFilter:['class','hidden']});
   document.addEventListener('hide.bs.tab',e=>{if(pane?.id&&[e.target?.getAttribute('data-bs-target'),e.target?.getAttribute('href')].includes('#'+pane.id))pause();else if(!visible())pause();});
   document.addEventListener('shown.bs.tab',()=>{if(!visible())pause();});
  }
  function renderAux(){
   if(!orphanList)return;orphanList.replaceChildren();outcomes.replaceChildren();if(!valid())return;
   for(const d of drafts.values())if((d.dirty||d.attempt)&&isOrphan(d)){
    const card=make('section','border rounded p-3 bg-white');card.dataset.taxOrphan=key(d.row);
    card.append(make('h3','h6','현재 주기에서 빠진 초안'),make('p','small mb-2',(names[d.row.kind]||'세무 업무')+' · '+period(d.row)),button('초안 확인',()=>openOrphan(d)));
    const discard=button('초안 버리기',e=>void discardDraft(d,e.currentTarget),'btn btn-outline-danger btn-sm ms-2');discard.disabled=blocked(d)||!!d.discarding;card.append(discard);
    if(d.attempt)card.append(make('p','small mt-2 mb-0','저장 결과 확인이 필요합니다. 다시 확인으로 목록을 불러와 주세요.'));
    orphanList.append(card);
   }
   for(const d of [settingsDraft,...drafts.values()])if(d?.notice){
    const card=make('section','border rounded p-3');card.dataset.taxOutcome=d.row?key(d.row):'settings';
    const p=make('p','small mb-2',(d.row?(names[d.row.kind]+' · '+d.row.period_end):'신고 주기 설정')+' — '+d.notice);p.setAttribute('role','status');card.append(p);
    const view=button(d.attempt?'결과 확인':'내용 확인',()=>{if(d.row){const row=rows.find(r=>key(r)===key(d.row));if(row)openTask(row);else if(isOrphan(d))openOrphan(d);}else openSettings();});view.disabled=!!pending||(d.row&&!rows.some(r=>key(r)===key(d.row))&&!isOrphan(d));
    const dismiss=button('안내 닫기',()=>{d.notice=null;renderAux();syncEditor();reloadButton?.focus({preventScroll:true});});card.append(view,dismiss);outcomes.append(card);
   }
  }
  function render(){
   status.textContent=message;list.replaceChildren();settingsButton.disabled=!valid();reloadButton.disabled=!!pending;renderAux();
   if(!settings){list.append(make('p','text-muted','신고 주기를 설정하면 해당 기간의 할 일이 표시됩니다.'));return;}
   const shown=rows.filter(r=>drafts.get(key(r))?.dirty||filter==='all'||completed(r)===(filter==='completed'));
   if(!shown.length){list.append(make('p','text-muted',rows.length?'선택한 상태에 해당하는 세무 할 일이 없습니다.':'선택한 연도에 표시할 세무 할 일이 없습니다.'));return;}
   for(const r of shown){const card=make('section','border rounded p-3 bg-white'),head=make('div','d-flex gap-2 flex-wrap align-items-center');card.dataset.taxTask=key(r);
    const pendingReminder=reminders.get(key(r));
    const done=button(pendingReminder?.attempt?'같은 요청 다시 확인':completed(r)?'다시 할 일로':'완료했어요',()=>void markDone(r));
    const future=String(r.period_end)>serverToday;
    done.disabled=!editable()||!listFresh||!!pending||!!pendingReminder?.busy||future;if(future)done.title='귀속 기간이 끝난 뒤 완료로 표시할 수 있어요.';head.append(make('h3','h6 mb-0 me-auto',names[r.kind]||'세무 업무'),done);
    const held=drafts.get(key(r));
    if(held?.dirty||held?.attempt||Object.keys(r.state||{}).some(k=>k!=='reminder_done'))head.append(button(held?.dirty?'작성 중 · 이어 쓰기':'기존 기록 보기',()=>openTask(r)));
    card.append(head,make('p','small text-muted mt-2 mb-2',period(r)),make('p','mb-1',completed(r)?'✅ 마쳤어요':'🗓️ 해야 할 일이에요'),make('p','small mb-1','기한 '+r.payment_due));
    if(pendingReminder?.notice)card.append(make('p','small mb-1',pendingReminder.notice));
    if(!r.calendar_checked)card.append(make('p','small text-warning mb-1','공식 고지·신고 화면에서 기한을 확인해 주세요.'));
    if(r.approval)card.append(make('p','small mb-0','연결 결재: '+r.approval.title+' · '+r.approval.status));
    else if(r.link_unavailable)card.append(make('p','small text-muted mb-0','연결 결재를 현재 권한으로 확인할 수 없습니다.'));
    list.append(card);
   }
  }
  async function markDone(row){
   if(!editable()||!visible()||pending||!listFresh||!rows.includes(row))return;
   const k=key(row),who=owner,revision=row.expected;let d=reminders.get(k);
   if(d?.busy)return;
   if(!d){d={};reminders.set(k,d);}
   d.busy=true;render();
   try{
    if(!d.attempt){
     const done=!completed(row);
     const yes=await dialog('confirm',done?'이 세무 할 일을 마쳤나요?':'다시 해야 할 일로 표시할까요?');
     if(!yes||who!==owner||!editable()||!visible()||!rows.includes(row)||row.expected!==revision)return;
     d.attempt={key:root.crypto.randomUUID(),data:{kind:row.kind,period_end:row.period_end,expected:revision,done}};
    }
    const attempt=d.attempt;let timer;
    try{
     const r=await Promise.race([client.rpc('accounting_tax_tasks',{p_action:'reminder',p_coop_id:ctx().coopId,p_data:attempt.data,p_request_key:attempt.key}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('WRITE_RESULT_UNKNOWN')),20000);})]);
     if(r.error)throw r.error;if(r.data?.outcome!=='saved')throw Error('UNCONFIRMED');
     if(who!==owner)return;d.attempt=null;d.notice='반영했습니다.';
     const held=drafts.get(k);if(held&&!held.attempt)held.expected=r.data.revision;
     if(valid()&&visible()){const refreshed=await load();if(!refreshed)d.notice='반영했습니다. 목록을 다시 확인해 주세요.';}
    }catch(error){if(who!==owner)return;if(['PT409','42501','22023'].includes(error.code)){d.attempt=null;d.notice=error.code==='PT409'?'내용이 바뀌었습니다. 다시 확인해 주세요.':'현재 권한과 상태를 다시 확인해 주세요.';}else d.notice='결과를 확인하지 못했습니다. 같은 요청 다시 확인을 눌러 주세요.';}
    finally{clearTimeout(timer);}
   }finally{d.busy=false;if(who===owner&&valid()&&visible()){render();(list.querySelector('section[data-tax-task="'+k+'"] button')||reloadButton)?.focus({preventScroll:true});}}
  }
  async function load(){
   if(!ctx().owner||!ctx().allowed)return false;
   if(owner!==ctx().owner){reset();owner=ctx().owner;}
   if(!visible())return false;if(pending&&pendingYear===year)return pending;
   if(pending){++seq;controllers.forEach(c=>c.abort());pending=null;rows=[];}
   pendingYear=year;listFresh=false;
   const ticket=++seq,who=owner;message='세무 할 일을 불러오는 중입니다…';render();
   const p=(async()=>{try{const r=await read('list',{year},ticket);if(!Array.isArray(r?.items)||typeof r.can_edit!=='boolean')throw Error('조회 결과를 확인하지 못했습니다.');
    rows=r.items;settings=r.settings;canEdit=r.can_edit;serverToday=r.today||today();loadedYear=year;listFresh=true;message='';render();syncEditor();return true;
   }catch(e){if(current(ticket,who)&&e.message!=='STALE_READ'){message='세무 할 일을 불러오지 못했습니다. 다시 확인해 주세요.';canEdit=false;render();syncEditor();}return false;
   }finally{if(pending===p){pending=null;reloadButton.disabled=false;settingsButton.disabled=!valid();render();}}})();pending=p;reloadButton.disabled=true;settingsButton.disabled=true;return p;
  }
  function ensureModal(){
   if(modal)return;modal=make('div','modal fade');modal.id='accountingTaxModal';modal.tabIndex=-1;modal.setAttribute('aria-labelledby','accountingTaxTitle');
   modal.innerHTML='<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5" id="accountingTaxTitle"></h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button></div><div class="modal-body"></div><div class="modal-footer"><span class="small me-auto" data-tax-dirty></span><button type="button" class="btn btn-outline-danger" data-tax-discard hidden>초안 버리기</button><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button><button type="button" class="btn btn-primary" data-tax-save>저장</button></div></div></div>';
   document.body.append(modal);modal.addEventListener('hide.bs.modal',e=>{if(active?.draft?.saving&&!navigationClose){e.preventDefault();return;}modalClosing=true;++editorSeq;});
   modal.addEventListener('shown.bs.modal',()=>{if(closeAfterShow||!visible())pause();});
   modal.addEventListener('hidden.bs.modal',()=>{const closing=active,queued=queuedOpen;queuedOpen=null;active=null;modalClosing=false;closeAfterShow=false;render();if(queued&&queued.owner===owner&&valid()&&visible()){queued.run();return;}if(visible())(closing?.row?(list.querySelector('section[data-tax-task="'+key(closing.row)+'"] button')||orphanList.querySelector('section[data-tax-orphan="'+key(closing.row)+'"] button')||reloadButton):settingsButton)?.focus({preventScroll:true});});
   modal.querySelector('[data-tax-save]').onclick=()=>void save();
   modal.querySelector('[data-tax-discard]').onclick=e=>void discardDraft(active?.draft,e.currentTarget);
  }
  function dirty(d){d.dirty=fingerprint(d)!==d.baseline;if(d.dirty)d.notice=null;syncEditor();renderAux();}
  function deferOpen(run){if(!modalClosing)return false;queuedOpen={owner,run};return true;}
  function field(body,d,name,label,type='text',options){
   const box=make('div','mb-3'),l=make('label','form-label',label),n=make(options?'select':type==='textarea'?'textarea':'input','form-control');n.id='tax-'+name;l.htmlFor=n.id;
   if(options){n.className='form-select';for(const [v,t]of options){const o=make('option','',t);o.value=v;n.append(o);}}
   else if(type!=='textarea')n.type=type;
   if(type==='date')n.max=/due$/.test(name)?'2199-12-31':serverToday;
   n.value=d.data[name]??'';n.dataset.taxField=name;if(type==='textarea')n.rows=3;
   if(['memo','receipt','due_reason'].includes(name))n.maxLength={memo:500,receipt:100,due_reason:300}[name];
   const update=()=>{d.data[name]=n.value;dirty(d);if(name==='settlement'){const date=modal.querySelector('[data-tax-field=paid_date]');date.disabled=n.value!=='paid'||!editable()||!!d.attempt;if(n.value!=='paid'){date.value='';d.data.paid_date='';dirty(d);}}};
   n.addEventListener('input',update);n.addEventListener('change',update);box.append(l,n);body.append(box);return n;
  }
  function start(title,draft,type,row){
   ensureModal();if(active?.draft?.saving)return null;
   const opener=document.activeElement;++editorSeq;active={draft,type,row,opener,epoch:editorSeq};
   modal.querySelector('h2').textContent=title;const body=modal.querySelector('.modal-body');body.replaceChildren();
   const result=make('p','small text-secondary');result.dataset.taxResult='';result.setAttribute('role','status');body.append(result);
   root.bootstrap.Modal.getOrCreateInstance(modal).show();return body;
  }
  function openSettings(){
   if(!valid()||!visible()||pending||deferOpen(openSettings))return;
   if(!settingsDraft||(!settingsDraft.dirty&&!settingsDraft.attempt)){const data={effective_month:(settings?.effective_month||serverToday.slice(0,7)+'-01').slice(0,7),vat:settings?.vat||'unset',withholding:settings?.withholding||'unset',local_withholding:settings?.local_withholding||'unset'};
    settingsDraft={data,expected:settings?.revision||null,dirty:false,notice:settingsDraft?.notice};settingsDraft.baseline=fingerprint(settingsDraft);}
   const d=settingsDraft,body=start('조합별 신고 주기',d,'settings');if(!body)return;
   field(body,d,'effective_month','할 일 시작월','month');
   field(body,d,'vat','부가세','select',['unset','quarterly','notice','halfyear','none'].map(v=>[v,modes[v]]));
   field(body,d,'withholding','원천세','select',['unset','monthly','halfyear','none'].map(v=>[v,modes[v]]));
   field(body,d,'local_withholding','지방소득세 특별징수','select',['unset','monthly','halfyear','none'].map(v=>[v,modes[v]]));
   body.append(button('설정 도움말',()=>void dialog('alert','홈택스·위택스의 실제 신고 유형에 맞춰 선택하세요. 반기납부는 승인받은 경우에 선택합니다. 시작월은 신고·납부 기한이 속한 달이에요. 변경된 주기는 아직 기록하지 않은 업무에 적용하며 이미 확인·저장한 업무는 유지합니다.',{title:'신고 주기 선택'})));
   body.append(button('현재 설정과 비교',()=>void compareCurrent()));syncEditor();
  }
  function openTask(row){
   if(!valid()||!visible()||pending||!rows.includes(row)||deferOpen(()=>{const live=rows.find(r=>key(r)===key(row));if(live)openTask(live);}))return;const k=key(row);let d=drafts.get(k);
   if(!d||(!d.dirty&&!d.attempt)){const data=taskInput(row);d={data,expected:row.expected,approval:row.approval,dirty:false,row,notice:d?.notice};d.baseline=fingerprint(d);drafts.set(k,d);}
   const body=start(names[row.kind],d,'task',row);if(!body)return;
   body.append(make('p','text-muted',period(row)));
   if(row.filing_required)field(body,d,'filed_date','신고 완료일','date');
   field(body,d,'settlement','납부 상태','select',[['pending','납부 확인 전'],['paid','납부 완료'],['none','납부할 세액 없음'],['refund','환급 대상']]);
   field(body,d,'paid_date','실제 납부일','date');
   if(row.filing_required)field(body,d,'receipt','신고 접수번호 (선택)');
   if(row.filing_required)field(body,d,'filing_due','신고기한','date');
   field(body,d,'payment_due','납부기한','date');field(body,d,'due_reason','기한 조정 근거 (조정한 경우)');field(body,d,'memo','업무 메모','textarea');
   const linked=make('div','border rounded p-3 mb-3');linked.dataset.taxLink='';body.append(linked);renderLink();
   const search=make('div','input-group mb-2'),query=make('input','form-control');query.placeholder='지출결의 제목 검색';query.setAttribute('aria-label','연결할 지출결의 제목');query.dataset.erpQueryControl='';query.value=d.query||'';
   query.oninput=()=>{d.query=query.value;d.docSeq=(d.docSeq||0)+1;};
   const results=make('div','d-grid gap-2');results.dataset.taxDocuments='';
   const run=()=>void findDocuments(query.value,results);query.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();run();}};
   search.append(query,button('검색',run));body.append(search,results);
   const create=make('a','btn btn-outline-secondary btn-sm mt-2','전자결재 작성');create.href='approval.html?tab=draft';body.append(create,button('현재 저장값과 비교',()=>void compareCurrent()));syncEditor();
  }
  function openOrphan(d){
   if(!valid()||!visible()||pending||!isOrphan(d)||drafts.get(key(d.row))!==d||deferOpen(()=>openOrphan(d)))return;
   const body=start('현재 주기에서 빠진 초안',d,'orphan',d.row);if(!body)return;
   body.append(make('p','text-muted',(names[d.row.kind]||'세무 업무')+' · '+d.row.period_from+' ~ '+d.row.period_end),make('p','small','현재 신고 주기에 포함되지 않아 읽기 전용으로 표시합니다.'));
   const values=[['신고 완료일',d.data.filed_date||'미확인'],['납부 상태',payment({state:d.data})],['신고기한',d.data.filing_due],['납부기한',d.data.payment_due],['기한 조정 근거',d.data.due_reason||'없음'],['신고 접수번호',d.data.receipt||'없음'],['업무 메모',d.data.memo||'없음'],['결재 연결',d.approval?'있음':'없음']];
   const dl=make('dl','mb-0');for(const [label,value]of values){const dd=make('dd','mb-3',value||'없음');dd.style.whiteSpace='pre-wrap';dl.append(make('dt','small text-muted',label),dd);}body.append(dl);syncEditor();
  }
  async function discardDraft(d,opener){
   if(!d?.row||!valid()||!visible()||!isOrphan(d)||blocked(d)||d.discarding)return;
   const who=owner,epoch=editorSeq,before=fingerprint(d);d.discarding=true;opener.disabled=true;
   const yes=await dialog('confirm','이 초안을 버릴까요?');d.discarding=false;
   if(owner!==who||!valid()||!visible()||editorSeq!==epoch||drafts.get(key(d.row))!==d||!isOrphan(d)||blocked(d)||fingerprint(d)!==before)return;
   if(!yes){opener.disabled=false;opener.focus({preventScroll:true});return;}
   drafts.delete(key(d.row));if(active?.draft===d)root.bootstrap.Modal.getInstance(modal)?.hide();render();reloadButton.focus({preventScroll:true});
  }
  function renderLink(){const n=modal.querySelector('[data-tax-link]');if(!n||!active)return;n.replaceChildren();const d=active.draft;
    if(d.approval){const a=make('a','d-block',d.approval.title+' · '+d.approval.status);a.href='approval.html?doc='+encodeURIComponent(d.approval.id);n.append(a,button('연결 해제',()=>{if(!editable()||d.attempt)return;d.approval=null;dirty(d);renderLink();}));}
   else n.textContent=active.row?.link_unavailable?'연결 결재를 현재 권한으로 확인할 수 없습니다.':'연결한 전자결재가 없습니다.';
  }
  async function findDocuments(query,area){
   if(!active||!valid())return;const a=active;if(a.docPending?.query===query&&a.docPending.serial===a.draft.docSeq)return;
   const serial=(a.draft.docSeq||0)+1;a.draft.docSeq=serial;const epoch=editorSeq,attempt=a.docPending={query,serial};area.textContent='지출결의를 찾는 중입니다…';
   try{const r=await read('documents',{query});if(active!==a||editorSeq!==epoch||a.draft.docSeq!==serial||!modal.classList.contains('show'))return;
    area.replaceChildren();if(!r.items?.length)area.textContent='검색 조건에 맞는 지출결의가 없습니다.';
    for(const doc of (r.items||[]).slice(0,20)){const b=button(doc.title+' · '+doc.status,()=>{if(active!==a||a.draft.docSeq!==serial||!editable()||a.draft.attempt)return;a.draft.approval=doc;dirty(a.draft);renderLink();});b.disabled=!editable();area.append(b);}
    if(r.items?.length>20)area.append(make('p','small text-muted','최근 20건입니다. 제목을 더 입력해 좁혀 주세요.'));
   }catch(e){if(active===a&&editorSeq===epoch&&a.draft.docSeq===serial){area.textContent='지출결의를 불러오지 못했습니다. 권한을 확인하거나 다시 검색해 주세요.';}}finally{if(a.docPending===attempt)a.docPending=null;}
  }
  function syncEditor(){
   if(!modal||!active)return;const d=active.draft,orphan=active.type==='orphan'||isOrphan(d),locked=orphan||!editable()||!!d.attempt||d.saving;
   modal.querySelectorAll('[data-tax-field]').forEach(n=>{n.disabled=locked||(n.dataset.taxField==='paid_date'&&d.data.settlement!=='paid');});
   const b=modal.querySelector('[data-tax-save]');b.hidden=orphan;b.disabled=orphan||!editable()||d.saving||(!d.dirty&&!d.attempt);b.textContent=d.attempt?'같은 요청 다시 확인':'저장';
   const discard=modal.querySelector('[data-tax-discard]');discard.hidden=!orphan;discard.disabled=blocked(d)||!!d.discarding;
   modal.querySelector('[data-tax-dirty]').textContent=d.saving?'저장 중…':d.attempt?'저장 결과 확인 필요':orphan?'읽기 전용':d.dirty?'작성 중':'';
   const result=modal.querySelector('[data-tax-result]');result.textContent=d.notice||'';result.hidden=!d.notice;
  }
  async function compareCurrent(){
   const a=active;if(!a||a.type==='orphan'||isOrphan(a.draft)||a.draft.saving||a.draft.attempt||!editable())return;const epoch=editorSeq;if(!await load()||active!==a||editorSeq!==epoch)return;
   const latest=a.type==='settings'?settings:rows.find(r=>key(r)===key(a.row));if(!latest)return;
   const content=a.type==='settings'?'현재 설정 ('+latest.effective_month.slice(0,7)+')\n부가세: '+modes[latest.vat]+'\n원천세: '+modes[latest.withholding]+'\n지방소득세: '+modes[latest.local_withholding]+'\n\n작성한 설정 ('+a.draft.data.effective_month+')\n부가세: '+modes[a.draft.data.vat]+'\n원천세: '+modes[a.draft.data.withholding]+'\n지방소득세: '+modes[a.draft.data.local_withholding]:
    '현재 저장값\n'+filing(latest)+'\n'+payment(latest)+'\n신고기한 '+latest.filing_due+' · 납부기한 '+latest.payment_due+'\n접수번호: '+(latest.state?.receipt||'없음')+'\n메모: '+(latest.state?.memo||'없음')+'\n결재: '+(latest.approval?.title||'확인 가능한 연결 없음')+
    '\n\n작성한 내용\n신고일: '+(a.draft.data.filed_date||'미확인')+'\n납부 상태: '+payment({state:a.draft.data})+'\n신고기한 '+a.draft.data.filing_due+' · 납부기한 '+a.draft.data.payment_due+'\n접수번호: '+(a.draft.data.receipt||'없음')+'\n메모: '+(a.draft.data.memo||'없음')+'\n결재: '+(a.draft.approval?.title||'연결 없음');
   if(!await dialog('confirm',content+'\n\n현재 저장값을 확인하고 작성한 내용으로 이어갈까요?'))return;
   if(active!==a||editorSeq!==epoch||!editable())return;a.draft.expected=a.type==='settings'?latest.revision:latest.expected;
   if(a.type==='task'&&a.draft.approval?.id===latest.approval?.id)a.draft.approval=latest.approval;
   a.draft.dirty=true;syncEditor();
  }
  async function save(){
   const a=active;if(!a||a.type==='orphan'||isOrphan(a.draft)||!visible()||!editable()||a.draft.saving||(!a.draft.dirty&&!a.draft.attempt))return;const d=a.draft,epoch=editorSeq,who=owner;
   if(!d.attempt){
    const data=a.type==='settings'?{...d.data,effective_month:d.data.effective_month+'-01',expected:d.expected}:{kind:a.row.kind,period_end:a.row.period_end,expected:d.expected,state:{...d.data},approval_id:d.approval?.id||null,approval_revision:d.approval?.revision||null};
    if(a.type==='settings'&&!/^\d{4}-\d{2}$/.test(d.data.effective_month))return void dialog('alert','할 일 시작월을 선택해 주세요.');
    if(a.type==='task'&&d.data.settlement==='paid'&&!d.data.paid_date)return void dialog('alert','실제 납부일을 입력해 주세요.');
    d.attempt={key:root.crypto.randomUUID(),data,action:a.type==='settings'?'settings':'save'};
   }
   d.saving=true;syncEditor();const attempt=d.attempt;
   const yes=await dialog('confirm',a.type==='settings'?'신고 주기 설정을 저장할까요?':'신고·납부 확인 내용을 저장할까요?');
   if(active!==a||editorSeq!==epoch||!editable()||!visible()){d.saving=false;if(!attempt.unknown)d.attempt=null;syncEditor();return;}
   if(!yes){d.saving=false;if(!attempt.unknown)d.attempt=null;syncEditor();modal.querySelector('[data-tax-save]')?.focus({preventScroll:true});return;}
   let timer;
   try{const r=await Promise.race([client.rpc('accounting_tax_tasks',{p_action:attempt.action,p_coop_id:ctx().coopId,p_data:attempt.data,p_request_key:attempt.key}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('WRITE_RESULT_UNKNOWN')),20000);})]);
    if(r.error)throw r.error;if(r.data?.outcome!=='saved')throw Error('UNCONFIRMED');
    if(owner!==who)return;d.expected=r.data.revision;d.baseline=fingerprint(d);d.dirty=false;d.attempt=null;d.saving=false;d.notice='저장했습니다.';
    if(active===a&&editorSeq===epoch&&valid()&&visible())root.ErpWorkspaceResume?.checkpoint(modal);syncEditor();renderAux();
    if(valid()&&visible()){const refreshed=await load();if(owner===who&&valid()&&visible()&&!refreshed)d.notice='저장했습니다. 목록은 다시 불러와 주세요.';}
    if(owner===who&&valid()){renderAux();syncEditor();if(active===a&&editorSeq===epoch&&visible())await dialog('alert',d.notice);}
   }catch(e){if(owner!==who)return;d.saving=false;
    if(['PT409','42501','22023','22007','22008'].includes(e.code)){d.attempt=null;d.notice=e.code==='42501'?'현재 권한으로 저장할 수 없습니다.':String(e.message||'').includes('TAX_NEW_EFFECTIVE_MONTH_REQUIRED')?'시작월은 현재 설정의 시작월과 같거나 이후로 선택해 주세요.':e.code==='PT409'?'저장된 내용이나 연결 문서가 바뀌었습니다. 현재 저장값과 비교한 뒤 다시 확인해 주세요.':'날짜와 신고 주기를 확인해 주세요. 기한을 조정했다면 근거도 입력해 주세요.';}
    else{attempt.unknown=true;d.notice='저장 결과를 확인하지 못했습니다. 같은 요청 다시 확인을 눌러 주세요.';}
    if(valid()){syncEditor();renderAux();if(active===a&&editorSeq===epoch&&visible())await dialog('alert',d.notice);}
   }finally{clearTimeout(timer);}
  }
  function pause(){++seq;++editorSeq;pending=null;queuedOpen=null;controllers.forEach(c=>c.abort());controllers.clear();if(dialogs.size)root.CoopDialog.cancelAll?.(root);if(modal?.classList.contains('show')){navigationClose=true;modalClosing=true;closeAfterShow=true;try{root.bootstrap.Modal.getInstance(modal)?.hide();}finally{navigationClose=false;}}}
  async function open(){const p=new URLSearchParams(root.location.search);if(!routeHandled&&/^\d{4}-\d{2}-\d{2}$/.test(p.get('period')||''))year=Number(p.get('period').slice(0,4))+(p.get('period').slice(5,7)==='12'?1:0);if(!status)build();yearControl.value=String(year);const result=await load();if(result&&!routeHandled&&p.get('tax')&&p.get('period')){routeHandled=true;const r=rows.find(r=>r.kind===p.get('tax')&&r.period_end===p.get('period'));if(r&&!active)openTask(r);}return result;}
  return Object.freeze({open,pause,hasDraft,reset});
 }
 async function approvalLink({element,client,coopId,documentId,isCurrent}){
  if(!isCurrent())return;let timer;const ctl=new AbortController();
  try{let q=client.rpc('accounting_tax_tasks',{p_action:'document_tasks',p_coop_id:coopId,p_data:{document_id:documentId},p_request_key:null});if(q.abortSignal)q=q.abortSignal(ctl.signal);
   const r=await Promise.race([q,new Promise((_,reject)=>{timer=setTimeout(()=>{ctl.abort();reject(Error('TIMEOUT'));},15000);})]);
   if(!isCurrent())return;if(r.error?.code==='42501')return;if(r.error)throw r.error;if(!r.data?.items?.length)return;
   const section=make('section','border rounded p-3 mt-3');section.append(make('h3','h6','연결된 세무 할 일'));
   for(const row of r.data.items){const a=make('a','d-block mb-2',(names[row.kind]||'세무 업무')+' · '+filing(row)+' / '+payment(row));a.href='accounting.html?work=taxes&tax='+encodeURIComponent(row.kind)+'&period='+encodeURIComponent(row.period_end);section.append(a);}element.append(section);
  }catch(_){if(isCurrent()){const notice=make('p','small mt-3','세무 할 일 연결을 확인하지 못했습니다. '),retry=make('button','btn btn-outline-secondary btn-sm','다시 확인');retry.type='button';retry.onclick=()=>{if(!isCurrent())return;notice.remove();void approvalLink({element,client,coopId,documentId,isCurrent});};notice.append(retry);element.append(notice);}}finally{clearTimeout(timer);}
 }
 root.AccountingTaxTasks=Object.freeze({version:'1.1.1',create,approvalLink,filing,payment,period,completed});
})(window);
