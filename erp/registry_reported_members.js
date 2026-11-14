/* 신고 인원 별도 기록 · 기존 ERP 집계/원장은 변경하지 않는다. */
(function(root){
 'use strict';
 const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
 function attach({field,save,check,status,context,rpc,onChange}){
  const states=new Map();let active=null,generation=0;
  const get=()=>{const c=context();return c&&c.authorized&&c.owner&&c.coop&&Number.isInteger(c.year)&&c.year>=1900&&c.year<=9998?c:null;};
  const key=c=>c.owner+'|'+c.coop+'|'+c.year;
  const current=s=>get()&&active===s&&s.key===key(get())&&get().visible;
  const dirty=s=>(/^\d+$/.test(s.value)?String(Number(s.value)):s.value)!==(s.record?String(s.record.members):'');
  function render(s,automatic=false){if(!current(s))return;save.disabled=!!s.write||!!s.read||!s.loaded||!dirty(s);check.disabled=!!s.read||!!s.write?.running;check.hidden=!s.message&&!s.write;status.textContent=s.message||'';onChange?.({automatic});}
  function activate(){const c=get();if(!c)return null;const k=key(c);if(active?.key===k)return active;
   let s=states.get(k);if(!s){s={key:k,owner:c.owner,coop:c.coop,year:c.year,value:'',record:null,loaded:false,read:null,write:null,message:''};states.set(k,s);}active=s;field.value=s.value;render(s,true);return s;
  }
  function valid(data,s){if(!data||Array.isArray(data)||data.coop_id!==s.coop||data.year!==s.year)throw Error('신고 인원 응답의 조합·연도를 확인해 주세요.');if(!Object.hasOwn(data,'current')||!Object.hasOwn(data,'receipt'))throw Error('신고 인원 응답을 확인해 주세요.');for(const r of [data.current,data.receipt])if(r!==null&&(typeof r!=='object'||Array.isArray(r)||!Number.isSafeInteger(r.members)||r.members<0||r.members>2147483647||!uuid(r.revision)))throw Error('신고 인원 응답을 확인해 주세요.');if(data.receipt&&!uuid(data.receipt.request_id))throw Error('저장 결과를 확인해 주세요.');return data;}
  function apply(data,s){const keep=dirty(s),old=s.value;let completed=false;
   if(s.write&&data.receipt?.request_id===s.write.id&&data.receipt.members===s.write.members){s.write=null;completed=true;}
   s.record=data.current;s.loaded=true;
   if(!keep){s.value=s.record?String(s.record.members):'';if(current(s)&&field.value===old&&document.activeElement!==field)field.value=s.value;else if(current(s)&&field.value!==s.value)s.value=field.value;}
   s.message=s.write?'저장 결과 미확인입니다. 다시 등록하지 않고 결과만 확인해 주세요.':completed&&data.current?.revision!==data.receipt?.revision?'저장 이후 신고 인원이 달라졌습니다. 입력은 유지했습니다.':completed&&dirty(s)?'저장했습니다. 추가 입력은 아직 저장되지 않았습니다.':completed?'저장했습니다.':dirty(s)?'입력한 값은 아직 저장되지 않았습니다.':'';
   render(s,!dirty(s));
  }
  function definitive(error){return ['42501','22023','40001','23514','22P02','PGRST202'].includes(error?.code);}
  async function refresh(){const s=activate();if(!s)return;if(s.read)return s.read.promise;const g=generation,op={controller:new AbortController()};s.read=op;render(s);
   op.promise=(async()=>{let timer;try{const result=await Promise.race([Promise.resolve(rpc({p_action:'get',p_year:s.year,p_request_id:s.write?.id||null}).abortSignal(op.controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{op.controller.abort();reject(Error('조회가 지연되고 있습니다. 다시 확인해 주세요.'));},15000);})]);if(g!==generation||!current(s)||s.read!==op)return;if(result.error)throw result.error;apply(valid(result.data,s),s);
    }catch(e){if(g===generation&&current(s)){s.loaded=false;s.message=e.code==='42501'?'신고 인원을 확인할 권한이 없습니다.':e.message||'신고 인원을 불러오지 못했습니다. 다시 확인해 주세요.';}}
    finally{clearTimeout(timer);if(s.read===op)s.read=null;render(s);}})();return op.promise;
  }
  async function submit(){const s=activate();if(!s||!current(s)||s.read)return;if(s.write)return refresh();if(!s.loaded)return refresh();if(!dirty(s))return;
   if(!/^\d+$/.test(s.value)||!Number.isInteger(Number(s.value))||Number(s.value)>2147483647){s.message='신고 인원은 0 이상의 정수로 입력해 주세요.';return render(s);}
   const op={id:root.crypto.randomUUID(),members:Number(s.value),running:true};s.write=op;s.message='저장하고 있습니다.';render(s);let timer;
   const original=Promise.resolve().then(()=>rpc({p_action:'save',p_year:s.year,p_members:op.members,p_expected_revision:s.record?.revision||null,p_request_id:op.id}));
   original.then(result=>{if(s.write!==op)return;if(result.error){if(definitive(result.error)){s.write=null;s.loaded=false;s.message=result.error.code==='40001'?'다른 저장이 먼저 반영되었습니다. 다시 확인해 주세요.':'저장하지 못했습니다. 입력을 유지했습니다. 다시 확인해 주세요.';}else{s.message='저장 결과 미확인입니다. 결과만 다시 확인해 주세요.';}render(s);return;}try{const data=valid(result.data,s);if(s.read){s.read.controller.abort();s.read=null;}apply(data,s);}catch{ s.message='저장 결과 미확인입니다. 결과만 다시 확인해 주세요.';render(s);}},()=>{if(s.write===op){s.message='저장 결과 미확인입니다. 결과만 다시 확인해 주세요.';render(s);}}).finally(()=>{op.running=false;render(s);});
   try{await Promise.race([original,new Promise(resolve=>{timer=setTimeout(()=>{if(s.write===op){op.running=false;s.message='저장 결과 미확인입니다. 결과만 다시 확인해 주세요.';render(s);}resolve();},15000);})]);}catch{}finally{clearTimeout(timer);}
  }
  field.addEventListener('input',()=>{const s=activate();if(s){s.value=field.value;s.message=dirty(s)?'입력한 값은 아직 저장되지 않았습니다.':'';render(s);}});
  save.onclick=()=>void submit();check.onclick=()=>void refresh();for(const button of [save,check])button.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.repeat)e.preventDefault();});
  function leave(clear=false){generation++;if(active?.read){active.read.controller.abort();active.read=null;}if(clear){states.clear();active=null;field.value='';}}
  function snapshot(){const s=active,c=get();if(!s||!c||s.key!==key(c))return{reportedBaseline:null,reportedBaselineState:'unloaded',reportedBaselineDirty:false};return{reportedBaseline:s.loaded?s.record&&{coopId:s.coop,year:s.year,members:s.record.members,revision:s.record.revision}:null,reportedBaselineState:s.loaded&&!s.read?'ready':'unconfirmed',reportedBaselineDirty:dirty(s)||!!s.write};}
  function resetDraft(){const s=activate();if(!s||s.write)return;s.value=s.record?String(s.record.members):'';field.value=s.value;s.message='';render(s,true);}
  return{refresh,activate,leave,snapshot,resetDraft,busy:()=>!!active?.write,version:'0.2.15'};
 }
 root.RegistryReportedMembers={attach};
})(typeof window==='undefined'?globalThis:window);
