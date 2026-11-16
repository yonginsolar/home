/* 경영공시 읽기 전용 지원. 총회·연간 마감본만 복사하고 실시간 장부는 조회로 구분한다. */
(function(root) {
 'use strict';
 function attach({client, context, authorize}) {
  const el=document.getElementById('registryDisclosure'),status=el.querySelector('#disclosureReadStatus'),retry=el.querySelector('#disclosureRetry');
  const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),yearSelect=el.querySelector('#disclosureYear');
  const currentYear=Number(day().slice(0,4)),ends=new Map();
  for(let y=currentYear;y>=currentYear-12;y--){const o=document.createElement('option');o.value=String(y);o.textContent=y+'년 실적 → '+(y+1)+'년 공시'+(y===currentYear?' · 진행 중':'');yearSelect.append(o);}
  yearSelect.value=String(currentYear-1);
  const year=()=>Number(yearSelect.value),ended=()=>day()>year()+'-12-31';
  const allowed=()=>context().authorized&&!el.hidden&&!document.hidden&&(!root.frameElement||!root.frameElement.hidden);
  const end=()=>{const key=context().key+'|'+year();return ends.has(key)?ends.get(key):year()===currentYear?day():year()+'-12-31';};
  const validEnd=()=>{const e=end();return /^\d{4}-\d{2}-\d{2}$/.test(e)&&e.slice(0,4)===String(year())&&e<=day()&&Number.isFinite(Date.parse(e))&&new Date(e).toISOString().slice(0,10)===e;};
  let epoch=0,op=null,guide=null,guideKind='',displayKey='',profile={},count=null,verified=false,finance=null,financeWanted=false,financeKey='',financeForbidden=false,activityUI=null,mode='closing';
  const phases={profile:'idle',members:'idle',finance:'idle'},financeSelection=()=>context().key+'|'+year()+'|'+mode+'|'+(mode==='live'?end():year()+'-12-31');
  function configureFinance(){
   const f=guide.finance;f.end.min=year()+'-01-01';f.end.max=year()===currentYear?day():year()+'-12-31';if(f.end.value!==end())f.end.value=end();
   f.label.hidden=mode!=='live';f.closing.setAttribute('aria-pressed',String(mode==='closing'));f.live.setAttribute('aria-pressed',String(mode==='live'));
   const select=next=>{if(mode===next||!allowed())return;leave();mode=next;void refresh();};f.closing.onclick=()=>select('closing');f.live.onclick=()=>select('live');
   f.end.onchange=()=>{ends.set(context().key+'|'+year(),f.end.value);leave();void refresh();};
   f.end.oninput=()=>{const wasVerified=verified;ends.set(context().key+'|'+year(),f.end.value);leave();verified=wasVerified;phases.finance='paused';render();};
   f.read.onclick=()=>{if(op||!allowed())return;finance=null;phases.finance='idle';financeForbidden=false;void refresh();};
   f.read.disabled=false;f.read.setAttribute('aria-disabled',String(!!op));f.read.setAttribute('aria-busy',String(!!op));f.read.textContent=op?'조회 중…':phases.finance==='error'?'다시 확인':'다시 조회';
   const revision=finance?.revision?.split(' · '),saved=revision?.[0]?new Date(revision[0]).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+(revision[1]?' · '+revision[1]:''):'';
   f.source.textContent=mode==='live'?year()+'-01-01 ~ '+(end()||'기준일 선택')+' · 실시간 장부 · 단위: 원':year()+'-01-01 ~ '+year()+'-12-31 · '+(finance?.source||'결산용 자료')+(saved?' · '+saved:'')+' · 단위: 원';
   f.notice.textContent=mode==='live'&&!validEnd()?'해당 회계연도 안에서 오늘까지의 조회기준일을 선택해 주세요.':phases.finance==='error'?financeForbidden?'현재 조합의 결산 자료 조회 권한이 없습니다.':'자료를 확인하지 못했습니다. 다시 확인해 주세요.':phases.finance==='ready'?(finance?.empty?(mode==='closing'?'결산 자료 준비 전':'조회기준일까지 등록된 전표가 없습니다.'):(mode==='live'?'실시간 재무값은 복사할 수 없습니다.':finance?.balance==='mismatch'?'자산총계가 부채총계와 자본총계의 합계와 맞지 않아 재무값 복사를 잠갔습니다. 결산 자료를 확인해 주세요.':finance?.balance==='unverified'?'자산·부채·자본 총계 중 빠진 값이 있어 합계를 확인하지 못했습니다.':finance?.missing.join(' ')||'')):phases.finance==='paused'?'기간이 바뀌었습니다. 다시 조회해 주세요.':financeWanted?'자료를 불러오는 중…':'';
  }
  function render(){
   if(!allowed())return;const p=root.CoopRules.policy(context().formalName),y=year();
   el.querySelector('#disclosureType').textContent=p.label;
   el.querySelector('#disclosurePeriod').textContent=(y===2025?'2026년 공식 작성화면 기준':(y+1)+'년 작성가이드 미확인 · 2026년 화면 참고')+(ended()?'':' · 회계연도 종료 전');
   el.querySelector('#disclosureResult').textContent=p.allDisclosure?'공시 대상':!p.known?'법인유형 확인 필요':!ended()?'회계연도 종료 후 대상 확인':count===null?'공시 대상 기준 확인':count>=200?'공시 대상 · '+y+'년 말 '+count.toLocaleString('ko-KR')+'명':y+'년 말 '+count.toLocaleString('ko-KR')+'명 · 인원 기준 미해당, 납입출자금 기준 확인 필요';
   if(!guide||guideKind!==p.kind){
    activityUI?.leave();guide?.invalidate();guide=root.RegistryDisclosureFields.mount(el.querySelector('#disclosureGuideFields'),context().formalName,{current:()=>verified&&allowed()&&displayKey===context().key+'|'+year(),onStep:i=>{financeWanted=i===1;if(i!==2)activityUI?.leave();if(financeWanted)void refresh();if(i===2)void activityUI?.show();}});guideKind=p.kind;
    activityUI=root.DisclosureActivity.attach({element:guide.activity,client,context,authorize,year,day,current:()=>verified&&allowed()&&guide?.step()===2&&displayKey===context().key+'|'+year()});
   }
   const biz=String(profile.bizNum||'').replace(/[-\s]/g,''),established=String(profile.estDate||''),validDate=/^\d{4}-\d{2}-\d{2}$/.test(established)&&Number.isFinite(Date.parse(established))&&new Date(established).toISOString().slice(0,10)===established;
   const values={year:String(y),name:context().formalName,members:count===null||!ended()?'':String(count),bizNum:/^\d{10}$/.test(biz)?biz.slice(0,3)+'-'+biz.slice(3,5)+'-'+biz.slice(5):'',estDate:validDate?established:'',address:profile.company_address||'',phone:profile.company_contact_phone||'',assemblyYears:y+'년 사업계획 승인 총회 · '+(y+1)+'년에 열린 '+y+'년 결산 승인 총회'};
   if(phases.finance==='ready'&&financeKey===financeSelection())for(const[key,n]of Object.entries(finance.values)){const loss=['gross','pretax','net'].includes(key);values[key]={copy:String(loss?Math.abs(n):n),copyable:mode==='closing'&&finance.balance!=='mismatch',display:(loss?(n<0?'손실 ':'이익 '):'')+(loss?Math.abs(n):n).toLocaleString('ko-KR')+'원'};}
   guide.update(values);configureFinance();if(guide.step()===2)void activityUI?.show();
  }
  function leave(){
   epoch++;verified=false;activityUI?.leave();guide?.invalidate();op?.controller.abort();if(op)for(const lane of op.lanes)if(phases[lane]==='loading')phases[lane]='idle';
   op=null;finance=null;financeKey='';phases.finance='idle';financeForbidden=false;financeWanted=guide?.step()===1;retry.disabled=false;
  }
  function refresh(onlyFailed=false){
   if(!allowed())return Promise.resolve();if(op)return op.promise;
   const identity=context(),p=root.CoopRules.policy(identity.formalName),nextKey=identity.key+'|'+year();
   verified=false;
   if(displayKey!==nextKey){displayKey=nextKey;profile={};count=null;finance=null;financeKey='';phases.profile=phases.members=phases.finance='idle';}
   render();
   const lanes=['profile',...(!p.federation&&p.known&&ended()?['members']:[]),...(financeWanted&&(mode==='closing'||validEnd())?['finance']:[])].filter(lane=>onlyFailed?phases[lane]==='error':!['ready','review'].includes(phases[lane]));
   const job={key:identity.key,coop:identity.coop,year:year(),end:end(),mode,epoch,lanes,controller:new AbortController()};op=job;
   for(const lane of lanes){phases[lane]='loading';if(lane==='finance'){finance=null;financeKey='';financeForbidden=false;}}
   retry.disabled=true;retry.hidden=true;status.textContent=lanes.length?'등록값 확인 중…':'권한 확인 중…';
   const current=()=>op===job&&epoch===job.epoch&&context().key===job.key&&year()===job.year&&end()===job.end&&mode===job.mode&&allowed()&&!job.controller.signal.aborted;
   render();
   async function readLane(lane){
    try{
     if(lane==='profile'){
      const r=await client.from('ref_company_info').select('coop_id,key,value').eq('coop_id',job.coop).in('key',['bizNum','estDate','company_address','company_contact_phone']).abortSignal(job.controller.signal);if(!current())return;if(r.error)throw r.error;
      if(!Array.isArray(r.data)||r.data.some(row=>row.coop_id!==job.coop||!['bizNum','estDate','company_address','company_contact_phone'].includes(row.key)||typeof row.value!=='string')||new Set(r.data.map(row=>row.key)).size!==r.data.length)throw Error('PROFILE_RESPONSE');
      profile=Object.fromEntries(r.data.map(row=>[row.key,row.value.trim()]));phases.profile='ready';
     }else if(lane==='members'){
      const r=await client.rpc('member_city_membership_year_activity',{p_year:job.year}).abortSignal(job.controller.signal);if(!current())return;if(r.error)throw r.error;
      const result=root.CoopRegistryModel.activityCounts(r.data,job.year,day());count=result.status==='confirmed'?result.after_members:null;phases.members=result.status==='confirmed'?'ready':'review';
     }else if(job.mode==='closing'){
      const value=await root.DisclosureClosing.load(client,{coop:job.coop,year:job.year,today:day(),signal:job.controller.signal});if(!current())return;finance=value;financeKey=financeSelection();phases.finance='ready';
     }else{
      const r=await client.rpc('get_accounting_closing_report_source',{p_coop_id:job.coop,p_fiscal_year:job.year,p_period_end:job.end}).abortSignal(job.controller.signal);if(!current())return;if(r.error)throw r.error;
      finance=root.DisclosureFinance.summarize(r.data,{coop:job.coop,year:job.year,end:job.end});financeKey=financeSelection();phases.finance='ready';
     }
     render();
    }catch(error){if(!current())return;phases[lane]='error';if(lane==='finance'){finance=null;financeKey='';financeForbidden=error.code==='42501';}else if(error.code==='42501'){if(lane==='profile')profile={};else count=null;}render();}
   }
   job.promise=(async()=>{let timer;try{
    const work=(async()=>{await authorize();if(current()){verified=true;await Promise.all(lanes.map(readLane));}})();
    await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{job.controller.abort();reject(Error('조회가 지연되고 있습니다. 다시 확인해 주세요.'));},15000);})]);
    if(!current())return;const failed=Object.entries(phases).filter(([,phase])=>phase==='error').map(([lane])=>({profile:'조합 기본정보',members:'기말 인원',finance:'회계값'})[lane]);
    status.textContent=failed.length?failed.join('·')+' 조회를 확인하지 못했습니다.':phases.members==='review'?'가입 이력이 불완전해 기말 인원을 자동 표시하지 않았습니다.':'';retry.hidden=!failed.length;render();
   }catch(_){if(op!==job||epoch!==job.epoch||context().key!==job.key||!allowed())return;for(const lane of lanes)if(phases[lane]==='loading')phases[lane]='error';status.textContent='조회가 지연되고 있습니다. 다시 확인해 주세요.';retry.hidden=false;render();}
   finally{clearTimeout(timer);if(op===job){op=null;retry.disabled=false;configureFinance();if(context().key!==job.key&&allowed())void refresh();else if(financeWanted&&phases.finance==='idle'&&(mode==='closing'||validEnd())&&allowed())void refresh();}}})();
   return job.promise;
  }
  retry.onclick=()=>refresh(true);yearSelect.onchange=()=>{leave();void refresh();};
  retry.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.repeat)e.preventDefault();});
  window.addEventListener('pagehide',leave);
  if(root.frameElement)new MutationObserver(records=>{if(root.frameElement.hidden||records.some(r=>r.oldValue===null))leave();if(!root.frameElement.hidden&&allowed())void refresh();}).observe(root.frameElement,{attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();else if(allowed())void refresh();});
  return {open:()=>{leave();return refresh();},leave,refresh};
 }
 root.RegistryDisclosure=Object.freeze({attach,version:'1.4.2'});
})(window);
