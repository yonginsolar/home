/* 경영공시 작성가이드. 기존 읽기만 사용하며 공시 입력·저장·제출은 하지 않는다. */
(function(root) {
 'use strict';
 function attach({client, context, authorize}) {
  const el=document.getElementById('registryDisclosure');
  const status=el.querySelector('#disclosureReadStatus'), retry=el.querySelector('#disclosureRetry');
  const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  const yearSelect=el.querySelector('#disclosureYear');
  const currentYear=Number(day().slice(0,4));
  for(let y=currentYear;y>=currentYear-12;y--){const option=document.createElement('option');option.value=String(y);option.textContent=y+'년 실적 → '+(y+1)+'년 공시'+(y===currentYear?' · 진행 중':'');yearSelect.append(option);}
  yearSelect.value=String(currentYear-1);
  const year=()=>Number(yearSelect.value);
  const ended=()=>day()>year()+'-12-31';
  const allowed=()=>context().authorized&&!el.hidden&&!document.hidden&&(!root.frameElement||!root.frameElement.hidden);
  let epoch=0, op=null, guide=null, guideKind='', displayKey='', profile={}, count=null,verified=false;
  const phases={profile:'idle',members:'idle'};

  function render() {
   if(!allowed())return;
   const p=root.CoopRules.policy(context().formalName), y=year();
   el.querySelector('#disclosureType').textContent=p.label;
   el.querySelector('#disclosurePeriod').textContent=(y===2025?'2026년 공식 작성화면 기준':(y+1)+'년 작성가이드 미확인 · 2026년 화면 참고')+(ended()?'':' · 회계연도 종료 전');
   el.querySelector('#disclosureResult').textContent=p.allDisclosure?'공시 대상':!p.known?'법인유형 확인 필요':!ended()?'회계연도 종료 후 대상 확인':count===null?'공시 대상 기준 확인':count>=200?'공시 대상 · '+y+'년 말 '+count.toLocaleString('ko-KR')+'명':y+'년 말 '+count.toLocaleString('ko-KR')+'명 · 인원 기준 미해당, 승인 결산의 납입출자금 확인 필요';
   if(!guide||guideKind!==p.kind) {
    guide?.invalidate();
    guide=root.RegistryDisclosureFields.mount(el.querySelector('#disclosureGuideFields'),context().formalName,{current:()=>verified&&allowed()&&displayKey===context().key+'|'+year()});
    guideKind=p.kind;
   }
   const biz=String(profile.bizNum||'').replace(/[-\s]/g,''), established=String(profile.estDate||'');
   const validDate=/^\d{4}-\d{2}-\d{2}$/.test(established)&&Number.isFinite(Date.parse(established))&&new Date(established).toISOString().slice(0,10)===established;
   guide.update({
    year:String(y),name:context().formalName,
    members:count===null||!ended()?'':String(count),
    bizNum:/^\d{10}$/.test(biz)?biz.slice(0,3)+'-'+biz.slice(3,5)+'-'+biz.slice(5):'',
    estDate:validDate?established:'',
    address:profile.company_address||'',phone:profile.company_contact_phone||'',
    assemblyYears:y+'년 사업계획 승인 총회 · '+(y+1)+'년에 열린 '+y+'년 결산 승인 총회'
   });
  }

  function leave() {
   epoch++; verified=false;guide?.invalidate();op?.controller.abort();
   if(op)for(const lane of op.lanes)if(phases[lane]==='loading')phases[lane]='idle';
   op=null; retry.disabled=false;
  }

  function refresh(onlyFailed=false) {
   if(!allowed())return Promise.resolve();
   if(op)return op.promise;
   const identity=context(), p=root.CoopRules.policy(identity.formalName), nextKey=identity.key+'|'+year();
   if(displayKey!==nextKey) {
    displayKey=nextKey; profile={}; count=null;
    phases.profile=phases.members='idle';
   }
   render();
   const lanes=['profile',...(!p.federation&&p.known&&ended()?['members']:[])].filter(lane=>onlyFailed?phases[lane]==='error':!['ready','review'].includes(phases[lane]));
   const job={key:identity.key,coop:identity.coop,year:year(),epoch,lanes,controller:new AbortController()};
   op=job;
   for(const lane of lanes)phases[lane]='loading';
   retry.disabled=true; retry.hidden=true;
   status.textContent='등록값 확인 중…';
   const current=()=>op===job&&epoch===job.epoch&&context().key===job.key&&year()===job.year&&allowed()&&!job.controller.signal.aborted;

   async function readLane(lane) {
    try {
     if(lane==='profile') {
      const r=await client.from('ref_company_info').select('coop_id,key,value').eq('coop_id',job.coop).in('key',['bizNum','estDate','company_address','company_contact_phone']).abortSignal(job.controller.signal);
      if(!current())return;
      if(r.error)throw r.error;
      if(!Array.isArray(r.data)||r.data.some(row=>row.coop_id!==job.coop||!['bizNum','estDate','company_address','company_contact_phone'].includes(row.key)||typeof row.value!=='string')||new Set(r.data.map(row=>row.key)).size!==r.data.length)throw Error('조합 기본정보 응답을 확인하지 못했습니다.');
      profile=Object.fromEntries(r.data.map(row=>[row.key,row.value.trim()]));
      phases.profile='ready';
     } else {
      const r=await client.rpc('member_city_membership_year_activity',{p_year:job.year}).abortSignal(job.controller.signal);
      if(!current())return;
      if(r.error)throw r.error;
      const result=root.CoopRegistryModel.activityCounts(r.data,job.year,day());
      count=result.status==='confirmed'?result.after_members:null;
      phases.members=result.status==='confirmed'?'ready':'review';
     }
     render();
    } catch(error) {
     if(!current())return;
     phases[lane]='error';
     if(error.code==='42501') {
      if(lane==='profile')profile={};else count=null;
      render();
     }
    }
   }

   job.promise=(async()=>{
    let timer;
    try {
     const work=(async()=>{await authorize();if(current()){verified=true;await Promise.all(lanes.map(readLane));}})();
     await Promise.race([work,new Promise((_,reject)=>{
      timer=setTimeout(()=>{job.controller.abort();reject(Error('조회가 지연되고 있습니다. 다시 확인해 주세요.'));},15000);
     })]);
     if(!current())return;
     const failed=Object.entries(phases).filter(([,phase])=>phase==='error').map(([lane])=>lane==='profile'?'조합 기본정보':'기말 인원');
     status.textContent=failed.length?failed.join('·')+' 조회를 확인하지 못했습니다.':phases.members==='review'?'가입 이력이 불완전해 기말 인원을 자동 표시하지 않았습니다.':'';
     retry.hidden=!failed.length;
     render();
    } catch(error) {
     if(op!==job||epoch!==job.epoch||context().key!==job.key||!allowed())return;
     for(const lane of lanes)if(phases[lane]==='loading')phases[lane]='error';
     status.textContent=error.message||'ERP 값을 확인하지 못했습니다.';
     retry.hidden=false;
    } finally {
     clearTimeout(timer);
     if(op===job){op=null;retry.disabled=false;if(context().key!==job.key&&allowed())void refresh();}
    }
   })();
   return job.promise;
  }

  retry.onclick=()=>refresh(true);
  yearSelect.onchange=()=>{leave();void refresh();};
  retry.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.repeat)e.preventDefault();});
  window.addEventListener('pagehide',leave);
  if(root.frameElement)new MutationObserver(records=>{if(root.frameElement.hidden||records.some(r=>r.oldValue===null))leave();if(!root.frameElement.hidden&&allowed())void refresh();}).observe(root.frameElement,{attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();else if(allowed())void refresh();});
  return {open:()=>{leave();return refresh();},leave,refresh};
 }
 root.RegistryDisclosure=Object.freeze({attach,version:'1.1.0'});
})(window);
