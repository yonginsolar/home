/* 경영공시 활동상황1.0.0 · 기존 회의/의사록의 읽기 전용 연결. */
(function(root){
 'use strict';
 const columns={
  minutes:'id,coop_id,title,content,status,doc_type,meeting_outcome',
  meeting_packages:'id,coop_id,title,meeting_type,assembly_kind,fiscal_year,meeting_date,start_time,end_time,location,eligible_count,status,published_minute_id',
  meeting_package_agendas:'id,coop_id,package_id,agenda_kind,title,decision_result,sort_order'
 };
 const text=x=>typeof x==='string'?x.trim():'',validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 function plain(value){const t=root.document.createElement('template');t.innerHTML=text(value);for(const n of t.content.querySelectorAll('script,style,img,iframe,object,embed,svg,math,link,meta,base,form,input,textarea,button'))n.remove();return t;}
 const clean=value=>plain(value).content.textContent.replace(/\s+/g,' ').trim();
 function unique(values){const list=[...new Set(values.filter(v=>v!==''&&v!==null))];return list.length===1?list[0]:null;}
 function dateFrom(value){const matches=[...String(value||'').matchAll(/\b(\d{4})\s*(?:년|[.\/-])\s*(\d{1,2})\s*(?:월|[.\/-])\s*(\d{1,2})\s*일?/g)].map(m=>m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'));return unique(matches.filter(validDate))||'';}
 function countFrom(value){const m=/^\s*(\d{1,7})\s*(?:명|인)(?:\b|\s|[·,(]|$)/u.exec(String(value||''));return m&&Number.isSafeInteger(Number(m[1]))?String(Number(m[1])):'';}
 function minuteFields(html,kind='unknown'){
  const t=plain(html),fields=new Map(),add=(k,v)=>{const key=k.replace(/[\s:：]/g,'');if(!fields.has(key))fields.set(key,[]);fields.get(key).push(v.trim());};
  for(const tr of t.content.querySelectorAll('tr')){const cells=[...tr.children].filter(n=>['TH','TD'].includes(n.tagName));if(cells.length===2)add(cells[0].textContent,cells[1].textContent.replace(/\s+/g,' '));}
  for(const br of t.content.querySelectorAll('br'))br.replaceWith('\n');
  const labels='일\\s*시|회의일시|회의일|일자|장\\s*소|회의장소|재적 이사|참석 이사|재적 대의원|참석 대의원|재적 조합원|참석 조합원|조합원 수|참석자 수|결정사항|의결사항|의결 결과|결의사항|안건';
  const lines=[...t.content.querySelectorAll('p,li,div')].filter(n=>!n.querySelector('p,li,div,table')).map(n=>n.textContent).concat(t.content.childElementCount?[]:[t.content.textContent]);
  for(const line of lines.flatMap(s=>s.split('\n'))){const m=new RegExp('^\\s*(?:[0-9]+[.)]\\s*)?('+labels+')\\s*[:：]\\s*(.+)$').exec(line);if(m)add(m[1],m[2]);}
  const get=keys=>unique(keys.flatMap(k=>fields.get(k)||[]))||'',schedule=get(['일시','회의일시','회의일','일자']),date=dateFrom(schedule),clock=/\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(schedule);
  let eligible='',attended='',eligibleLabel='';
  const correctBasis=label=>kind==='board'?label==='이사':kind==='assembly'?['대의원','조합원'].includes(label):true;
  for(const[label,key]of [['이사','재적이사'],['대의원','재적대의원'],['조합원','재적조합원'],['조합원','조합원수']]){if(!correctBasis(label))continue;const n=countFrom(get([key]));if(n!==''){eligible=n;eligibleLabel=label;break;}}
  for(const[label,key]of [['이사','참석이사'],['대의원','참석대의원'],['조합원','참석조합원'],['','참석자수']]){if(label&&!correctBasis(label))continue;const n=countFrom(get([key]));if(n!==''){attended=n;break;}}
  const all=t.content.textContent.replace(/\s+/g,' ');
  // 문서에 적힌 명시 인원만 읽는다. 이름·서명자 수를 참석 인원으로 세지 않는다.
  if(!eligible){const matches=[...all.matchAll(/재적\s*(이사|대의원|조합원)\s*(\d{1,7})\s*명/g)].filter(m=>correctBasis(m[1]));const n=unique(matches.map(m=>m[1]+'|'+Number(m[2])));if(n){[eligibleLabel,eligible]=n.split('|');}}
  if(!attended){const n=unique([...all.matchAll(/참석\s*(이사|대의원|조합원)?\s*(\d{1,7})\s*명/g)].filter(m=>!m[1]||correctBasis(m[1])).map(m=>String(Number(m[2]))));if(n!==null)attended=n;}
  return{date,time:clock?clock[1].padStart(2,'0')+':'+clock[2]:'',location:get(['장소','회의장소']),eligible,eligibleLabel,attended,decision:get(['결정사항','의결사항','의결결과','결의사항']),agendas:get(['안건'])};
 }
 function summarize(data,{coop,year,today}){
  if(!Number.isInteger(year)||year<1901||year>9998||!validDate(today))throw Error('활동상황 조회연도를 확인해 주세요.');
  for(const[table,rows]of Object.entries(data)){if(!Object.hasOwn(columns,table)||!Array.isArray(rows))throw Error('회의 자료 응답을 확인하지 못했습니다.');const ids=new Set();for(const row of rows){if(!row||row.coop_id!==coop||!text(row.id)||ids.has(row.id))throw Error('회의 자료의 조합·중복을 확인해 주세요.');ids.add(row.id);}}
  if(Object.keys(data).length!==3)throw Error('회의 자료가 불완전합니다.');
  const packages=data.meeting_packages,minutes=data.minutes,agendas=data.meeting_package_agendas,linked=new Map(),used=new Set(),records=[];let excluded=0;
  for(const p of packages){if(!['BOARD','GENERAL_ASSEMBLY'].includes(p.meeting_type)||!['DRAFT','READY','FINAL','CANCELLED'].includes(p.status))throw Error('회의 구분·상태를 확인해 주세요.');if(p.published_minute_id){if(!linked.has(p.published_minute_id))linked.set(p.published_minute_id,[]);linked.get(p.published_minute_id).push(p);}}
  const finish=(m,p)=>{
   if(m?.meeting_outcome==='NOT_HELD'||p?.status==='CANCELLED'){excluded++;return;}
   const kind=m?.doc_type==='GENERAL_ASSEMBLY'?'assembly':m?.doc_type==='MINUTES'?'board':p?.meeting_type==='GENERAL_ASSEMBLY'?'assembly':p?.meeting_type==='BOARD'?'board':'unknown',f=minuteFields(m?.content||'',kind),date=f.date||text(p?.meeting_date);
   if(date&&!validDate(date))throw Error('저장된 회의일을 확인해 주세요.');
   const inYear=date&&date.slice(0,4)===String(year),following=date&&date.slice(0,4)===String(year+1)&&kind==='assembly';if(date&&(date>today||!inYear&&!following))return;
   const rows=p?agendas.filter(a=>a.package_id===p.id).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||a.id.localeCompare(b.id)):[],results=rows.filter(a=>a.agenda_kind==='DECISION'&&clean(a.decision_result)).map(a=>clean(a.title)+' · '+clean(a.decision_result)),decision=results.join('\n')||f.decision;
   const draft=!m||m.status==='DRAFT'||date>today,group=!date||kind==='unknown'?'review':draft?'draft':following?'following':kind;
   const passed=rows.filter(a=>a.agenda_kind==='DECISION'&&/^(?:원안(?:대로)?|수정)?(?:가결|승인)(?:함|됨)?[.!]?$/.test(clean(a.decision_result).replace(/\s/g,''))),hasYear=s=>new RegExp('(?:^|[^0-9])'+year+'(?:년|년도|[^0-9]|$)').test(s),roles=[];
   if(kind==='assembly'&&inYear&&passed.some(a=>/사업\s*계획/.test(clean(a.title))&&hasYear(clean(a.title))))roles.push(year+'년 사업계획 가결 기록');
   if(kind==='assembly'&&following&&passed.some(a=>/결산/.test(clean(a.title))&&(hasYear(clean(a.title))||Number(p?.fiscal_year)===year)))roles.push(year+'년 결산 가결 기록');
   let fiscal='';if(following&&!roles.length)fiscal=Number(p?.fiscal_year)===year?year+'년 결산 대상 꾸러미 · 의결 결과 확인':year+'년 결산 승인 총회인지 원문 확인';
   const time=f.time||(/^([01]\d|2[0-3]):[0-5]\d/.test(text(p?.start_time))?p.start_time.slice(0,5):''),dateSource=f.date?'의사록 본문':date?'회의 꾸러미':'회의일 미등록';
   const eligible=f.eligible!==''?f.eligible:Number.isSafeInteger(p?.eligible_count)&&p.eligible_count>=0?String(p.eligible_count):'',eligibleLabel=f.eligibleLabel||(eligible!==''?(kind==='board'?'이사':'대의원'):'');
   records.push({key:(m?'minute:':'package:')+(m?.id||p.id),title:text(m?.title||p?.title)||'제목 미등록',kind,group,date,time,dateSource,location:f.location||text(p?.location),eligible,eligibleLabel,attended:f.attended,decision,agendas:rows.map(a=>clean(a.title)).filter(Boolean).join('\n')||f.agendas,remark:[draft?(m?'의사록 초안 · 개최 여부 확인':'회의 꾸러미 · 개최 여부 확인'):'저장된 의사록',...roles,fiscal,dateSource==='회의 꾸러미'?'회의일은 연결 꾸러미 기준':''].filter(Boolean).join(' · '),href:m?'/minutes/minutes_view.html?id='+encodeURIComponent(m.id):'',source:m?'의사록 본문'+(p?'·연결 꾸러미/안건':''):'회의 꾸러미/안건'});
  };
  for(const m of minutes){if(![null,'MINUTES','GENERAL_ASSEMBLY','PAST_MINUTES'].includes(m.doc_type)||!['DRAFT','OPEN','CLOSED'].includes(m.status)||![null,undefined,'NOT_HELD'].includes(m.meeting_outcome))throw Error('의사록 구분·상태를 확인해 주세요.');const ps=linked.get(m.id)||[];if(ps.length===1){used.add(ps[0].id);finish(m,ps[0]);}else{ps.forEach(p=>used.add(p.id));finish(m,null);}}
  for(const p of packages)if(!used.has(p.id))finish(null,p);
  return{records:records.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.title.localeCompare(b.title,'ko')),excluded};
 }
 async function load(client,{coop,year,today,signal,current,verify}){
  const check=()=>{if(signal.aborted||!current())throw Error('조회 화면이 바뀌었습니다.');};await verify();check();
  const permission=await client.rpc('erp_can_access',{p_key:'minutes.manage'}).abortSignal(signal);check();if(permission.error)throw permission.error;if(permission.data!==true)throw Object.assign(Error('회의 조회 권한이 없습니다.'),{code:'42501'});
  async function pages(table){const rows=[],seen=new Set();let total;for(let start=0;start<10000;start+=250){check();let q=client.from(table).select(columns[table],{count:'exact'}).eq('coop_id',coop);if(table==='minutes')q=q.or('doc_type.is.null,doc_type.in.(MINUTES,GENERAL_ASSEMBLY,PAST_MINUTES)');const r=await q.order('id').range(start,start+249).abortSignal(signal);check();if(r.error)throw r.error;if(!Array.isArray(r.data)||!Number.isSafeInteger(r.count)||r.count<0||r.count>10000||total!==undefined&&total!==r.count)throw Error('회의 전체 자료를 확인하지 못했습니다.');total=r.count;for(const row of r.data){if(row.coop_id!==coop||!text(row.id)||seen.has(row.id))throw Error('회의 자료의 조합·중복을 확인해 주세요.');seen.add(row.id);rows.push(row);}if(rows.length===total)return rows;if(r.data.length<250||rows.length>total)break;}throw Error('회의 전체 자료를 확인하지 못했습니다.');}
  const [minutes,meeting_packages]=await Promise.all([pages('minutes'),pages('meeting_packages')]);check();
  const ids=meeting_packages.filter(p=>p.published_minute_id&&minutes.some(m=>m.id===p.published_minute_id)||!p.meeting_date||p.meeting_date.slice(0,4)===String(year)||p.meeting_type==='GENERAL_ASSEMBLY'&&p.meeting_date.slice(0,4)===String(year+1)).map(p=>p.id),meeting_package_agendas=[];
  for(let offset=0;offset<ids.length;offset+=100){const batch=ids.slice(offset,offset+100);let total;for(let start=0;start<10000;start+=250){const r=await client.from('meeting_package_agendas').select(columns.meeting_package_agendas,{count:'exact'}).eq('coop_id',coop).in('package_id',batch).order('id').range(start,start+249).abortSignal(signal);check();if(r.error)throw r.error;if(!Array.isArray(r.data)||!Number.isSafeInteger(r.count)||r.count>10000||total!==undefined&&total!==r.count)throw Error('안건 전체를 확인하지 못했습니다.');total=r.count;if(r.data.some(a=>a.coop_id!==coop||!batch.includes(a.package_id)))throw Error('안건의 회의·조합을 확인해 주세요.');meeting_package_agendas.push(...r.data);if(start+r.data.length===total)break;if(r.data.length<250||start+250>=10000)throw Error('안건 전체를 확인하지 못했습니다.');}}
  check();return summarize({minutes,meeting_packages,meeting_package_agendas},{coop,year,today});
 }
 function attach({element,client,context,authorize,year,day,current}){
  const doc=element.ownerDocument,n=(tag,value,cls)=>{const e=doc.createElement(tag);if(value)e.textContent=value;if(cls)e.className=cls;return e;},controls=n('div',null,'disclosure-finance-controls'),read=n('button','다시 조회'),status=n('p',null,'disclosure-source-status'),source=n('p',null,'disclosure-registration-note'),list=n('div',null,'disclosure-meeting-list'),notice=n('p',null,'disclosure-copy-status');read.type='button';read.id='disclosureActivityRead';status.setAttribute('role','status');notice.setAttribute('role','status');controls.append(read);element.append(controls,source,status,list,notice);
  let epoch=0,op=null,selection='',phase='idle',data=null,copyFlight=null;
  const allowed=()=>current()&&context().authorized,scope=()=>context().key+'|'+year();
  function field(card,label,value){const line=n('div',null,'disclosure-meeting-field'),term=n('strong',label),out=n('output',value||'기록 없음');line.append(term,out);if(value){const copy=n('button','복사');copy.type='button';copy.setAttribute('aria-label',label+' 복사');copy.onclick=async()=>{if(copyFlight||!allowed()||phase!=='ready')return;const e=epoch,s=selection,job={};copyFlight=job;copy.setAttribute('aria-busy','true');try{await root.navigator.clipboard.writeText(value);if(e===epoch&&s===selection&&allowed())notice.textContent=label+' 복사 완료';}catch(_){if(e===epoch&&allowed())notice.textContent='복사하지 못했습니다. 표시된 값을 직접 선택해 주세요.';}finally{if(copyFlight===job)copyFlight=null;copy.removeAttribute('aria-busy');}};line.append(copy);}card.append(line);
  }
  function render(){const end=(year()+1)+'-12-31';source.textContent='조회: '+year()+'-01-01 ~ '+(end<day()?end:day())+' · 회의 꾸러미·의사록';status.hidden=!status.textContent.trim();read.setAttribute('aria-busy',String(!!op));read.setAttribute('aria-disabled',String(!!op));read.textContent=op?'조회 중…':phase==='error'?'다시 확인':'다시 조회';list.replaceChildren();if(phase!=='ready')return;
   const labels={assembly:'총회·대의원총회',board:'이사회',following:'다음 해 총회 · 결산 승인 자료 대조',draft:'초안·예정 회의 · 개최 여부 확인',review:'날짜·회의 구분 확인'};
   for(const[group,label]of Object.entries(labels)){const rows=data.records.filter(r=>r.group===group);if(!rows.length)continue;const section=n(group==='draft'||group==='review'?'details':'section',null,'disclosure-meeting-group'),heading=n(section.tagName==='DETAILS'?'summary':'h4',label+' · '+rows.length+'건');section.append(heading);for(const r of rows){const card=n('article'),title=n('h5',r.title),origin=n('small',r.source+' · '+r.remark);card.append(title,origin);field(card,'일시',r.date?[r.date,r.time].filter(Boolean).join(' '):'');field(card,'장소',r.location);field(card,(r.eligibleLabel||'재적 인원')+(r.eligibleLabel?' 수':''),r.eligible);field(card,'참석자 수',r.attended);if(r.agendas)field(card,'안건',r.agendas);field(card,'결정사항',r.decision);if(r.href){const a=n('a','의사록 원문 보기 ↗');a.href=r.href;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}section.append(card);}list.append(section);}
  }
  function leave(){epoch++;op?.controller.abort();op=null;phase='idle';data=null;selection='';copyFlight=null;notice.textContent='';status.textContent='';list.replaceChildren();render();}
  function show(force=false){if(!allowed())return Promise.resolve();const key=scope();if(selection!==key){leave();selection=key;}if(op)return op.promise;if(!force&&phase!=='idle')return Promise.resolve();epoch++;data=null;phase='loading';notice.textContent='';const job={epoch,key,controller:new AbortController()};op=job;status.textContent='회의 기록을 불러오는 중…';render();const live=()=>op===job&&epoch===job.epoch&&scope()===job.key&&allowed()&&!job.controller.signal.aborted;
   job.promise=(async()=>{let timer;try{const value=await Promise.race([load(client,{coop:context().coop,year:year(),today:day(),signal:job.controller.signal,current:live,verify:authorize}),new Promise((_,reject)=>{timer=setTimeout(()=>{job.controller.abort();reject(Error('조회 지연'));},15000);})]);if(!live())return;data=value;phase='ready';status.textContent=value.records.length?'':'해당 기간의 회의 기록을 찾지 못했습니다.';render();}catch(e){if(op!==job||epoch!==job.epoch||scope()!==job.key||!allowed())return;data=null;phase='error';status.textContent=e.code==='42501'?'현재 조합의 회의 조회 권한이 없습니다.':'회의 기록을 불러오지 못했습니다. 다시 확인해 주세요.';render();}finally{clearTimeout(timer);if(op===job){op=null;render();}}})();return job.promise;
  }
  read.onclick=()=>{if(!op&&allowed())void show(true);};read.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.repeat)e.preventDefault();});render();return{show,leave};
 }
 root.DisclosureActivity=Object.freeze({load,summarize,minuteFields,attach,version:'1.0.0'});
})(typeof window==='undefined'?globalThis:window);
