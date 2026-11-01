/* v1.0.1 — Consistent document cards in the purpose pane and summary dialog. */
(function(root){
 'use strict';
 const limit=50;
 async function read(client,c,signal){
  const scoped=q=>q.eq('coop_id',c.coop),abort=q=>signal&&q.abortSignal?q.abortSignal(signal):q;
  const scope=await abort(client.rpc('get_visible_coop_id'));if(scope.error||String(scope.data||'')!==c.coop)throw Error('DOCUMENT_SCOPE_UNCONFIRMED');
  const replies=await Promise.all([
   c.documents?abort(scoped(client.from('minutes').select('id,title,created_at,doc_type,published_at,visibility').not('published_at','is',null)).order('created_at',{ascending:false}).limit(limit+1)):Promise.resolve({data:[]}),
   c.documents?abort(scoped(client.from('site_documents').select('id,title,event_date,version,is_current,category,access_scope,updated_at').eq('category','doc')).order('event_date',{ascending:false}).limit(limit+1)):Promise.resolve({data:[]}),
   abort(scoped(client.from('coop_notices').select('id,title,category,status,is_members_only,created_at').eq('status','published').is('source_approval_id',null)).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit+1)),
   abort(client.from('coop_admins').select('id').eq('id',c.actor).maybeSingle())
  ]);
  for(const r of replies.slice(0,3))if(r.error)throw r.error;
  const official=c.role==='admin'||(!replies[3].error&&replies[3].data?.id===c.actor)||(c.officials||[]).some(k=>['executive','delegate'].includes(k));
  const visible=scope=>String(scope||'MEMBERS').toUpperCase()!=='OFFICIALS'||official;
  const items=[];const add=(row,kind,param,date)=>{const id=String(row.id??'').trim();if(!id)return;const qs=new URLSearchParams({[param]:id});if(kind==='규정')qs.set('tab','RULES');if(kind==='공지')qs.set('tab','ANNOUNCEMENTS');qs.set('portalEmbed','1');items.push({title:String(row.title||'제목 없는 문서'),kind,date:String(date||''),href:'minutes/minutes_view.html?'+qs});};
  for(const row of (replies[0].data||[]).slice(0,limit))if(row.published_at&&visible(row.visibility))add(row,row.doc_type==='NOTICE'?'공문':row.doc_type==='ASSEMBLY_MATERIAL'?'총회 자료':'의사록','minuteId',row.created_at);
  for(const row of (replies[1].data||[]).slice(0,limit)){const fallback=/정관|규약/.test(row.title||'')?'PUBLIC':'MEMBERS';if(visible(row.access_scope||fallback))add(row,'규정','libraryId',row.event_date||row.updated_at);}
  for(const row of (replies[2].data||[]).slice(0,limit))if(row.status==='published')add(row,'공지','noticeId',row.created_at);
  items.sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)||a.title.localeCompare(b.title));
  return {items,more:replies.slice(0,3).some(r=>(r.data||[]).length>limit)};
 }
 function create(o){
  const doc=root.document,host=o.container,el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};host.classList.add('portal-documents-surface');
  let active=false,key='',generation=0,flight=null,rows=[],ready=false,more=false,reader=null,frame=null,returnTo=null;
  const context=()=>o.getContext?.(),stamp=c=>c?JSON.stringify(c):'',current=(s,g)=>active&&g===generation&&s===stamp(context())&&o.isActive();
  const header=el('div',null,'portal-purpose-heading'),title=el('h3','문서함'),retry=el('button','다시 확인','btn btn-sm btn-outline-secondary');retry.type='button';header.append(title,retry);
  const controls=el('div',null,'portal-document-controls'),searchLabel=el('label','문서 제목 검색'),search=el('input');search.type='search';search.placeholder='불러온 문서에서 검색';search.dataset.erpQueryControl='';search.id='portalDocumentSearch';searchLabel.htmlFor=search.id;
  const filterLabel=el('label','문서 종류'),filter=el('select');filter.id='portalDocumentFilter';filterLabel.htmlFor=filter.id;for(const k of ['전체','공지','의사록','공문','총회 자료','규정']){const n=el('option',k);n.value=k;filter.append(n);}const searchField=el('div',null,'portal-document-field'),filterField=el('div',null,'portal-document-field');searchField.append(searchLabel,search);filterField.append(filterLabel,filter);controls.append(searchField,filterField);
  const notice=el('p',null,'text-muted small'),list=el('div',null,'portal-document-list'),footer=el('button','이전 문서·개정 이력','btn btn-sm btn-outline-secondary');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');footer.type='button';footer.onclick=()=>{if(active&&ready&&o.isActive())o.openFull?.();};host.append(header,controls,notice,list,footer);
  function paint(){list.replaceChildren();for(const row of rows.filter(r=>(filter.value==='전체'||r.kind===filter.value)&&r.title.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))){const button=el('button',null,'portal-document-row');button.type='button';button.disabled=!ready;const icon=el('i',null,'bi bi-file-earmark-text');icon.setAttribute('aria-hidden','true');const text=el('span');text.append(el('strong',row.title),el('small',row.kind+' · '+(o.formatDate?.(row.date)||row.date.slice(0,10))));button.append(icon,text);button.onclick=()=>{if(ready&&active&&o.isActive()&&key===stamp(context()))open(row,button);};list.append(button);}if(!list.childElementCount){list.append(el('p',rows.length?'검색 조건에 맞는 문서가 없습니다.':ready?'열람 가능한 문서가 없습니다.':'목록을 확인해 주세요.','text-muted mb-0'));}footer.disabled=!ready;}
  function close(restore=true){if(!reader?.open)return;const owned=reader.contains(doc.activeElement);reader.close();frame?.remove();frame=null;const target=returnTo;returnTo=null;if(restore&&target?.isConnected&&(owned||[doc.body,reader,null].includes(doc.activeElement)))target.focus({preventScroll:true});}
  function open(row,trigger){if(!reader){reader=el('dialog',null,'portal-document-reader');reader.setAttribute('aria-label','문서 본문');const head=el('div',null,'portal-dialog-heading'),heading=el('h3','문서 본문'),button=el('button','닫기','btn btn-outline-secondary');button.type='button';button.onclick=()=>close();head.append(heading,button);reader.append(head);doc.body.append(reader);reader.addEventListener('cancel',e=>{e.preventDefault();close();});reader.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const first=reader.querySelector('button');if(e.shiftKey&&doc.activeElement===first){e.preventDefault();frame?.focus();}});}
   close(false);returnTo=trigger;frame=el('iframe');frame.title=row.title;frame.src=row.href;const ownFrame=frame;frame.onload=()=>{if(frame!==ownFrame||!reader.open)return;try{ownFrame.contentWindow.addEventListener('keydown',e=>{if(frame===ownFrame&&reader.open&&e.key==='Escape'&&!e.defaultPrevented&&!ownFrame.contentDocument.querySelector('dialog[open]')){e.preventDefault();close();}});}catch(_){/* First-party reader retains its own access/error UI. */}};reader.append(frame);reader.showModal();reader.querySelector('button').focus({preventScroll:true});
  }
  function invalidate(){++generation;flight?.controller.abort();flight=null;ready=false;retry.setAttribute('aria-busy','false');retry.setAttribute('aria-disabled','false');close(false);}
  async function load(){const c=context(),s=stamp(c);if(!active||!s||!o.isActive()||flight)return;if(key!==s){rows=[];key=s;search.value='';filter.value='전체';}ready=false;paint();notice.textContent='문서 목록을 불러오고 있어요…';retry.setAttribute('aria-busy','true');retry.setAttribute('aria-disabled','true');const g=++generation,controller=new AbortController(),request={controller};flight=request;let timer;
   try{const data=await Promise.race([read(o.getClient(),c,controller.signal),new Promise((_,reject)=>{timer=root.setTimeout(()=>{controller.abort();reject(Error('DOCUMENT_READ_TIMEOUT'));},15000);})]);if(!current(s,g))return;rows=data.items;more=data.more;ready=true;notice.textContent=more?'분류별 최근 50건입니다. 이전 문서·개정 이력에서 더 확인할 수 있어요.':'';paint();}
   catch(_){if(current(s,g)){notice.textContent='문서 목록을 불러오지 못했어요. 다시 확인해 주세요.';paint();}}
   finally{root.clearTimeout(timer);if(flight===request){flight=null;retry.setAttribute('aria-busy','false');retry.setAttribute('aria-disabled','false');}}
  }
  retry.onclick=()=>load();search.oninput=filter.onchange=()=>paint();
  return Object.freeze({activate(value){if(!value){active=false;invalidate();return;}const c=stamp(context());if(!c){this.suspend();return;}active=true;if(c!==key||!ready)void load();},suspend(){active=false;invalidate();rows=[];key='';list.replaceChildren();notice.textContent='';},close});
 }
 root.MemberPortalDocuments=Object.freeze({version:'1.0.1',read,create});
})(window);
