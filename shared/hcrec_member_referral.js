/* Hwaseong only. Code and proof are held in this view's memory; only a request UUID can survive reload. */
(function(root){
 'use strict';
 const id='4e2b5e2a-79b1-4beb-a4ec-8797ebe23028';
 const isPublic=(coop,where=root.location)=>String(coop||'')===id&&where.protocol==='https:'&&!where.port
   &&['hcrec.kr','www.hcrec.kr'].includes(where.hostname.toLowerCase().replace(/\.$/,''));
 const uid=v=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(v||''));
 const $=name=>document.getElementById(name);
 const timeout=(client,name,args)=>{
  const controller=new AbortController();let timer;
  const request=Promise.resolve().then(()=>{
   const rpc=client.rpc(name,args);return typeof rpc?.abortSignal==='function'?rpc.abortSignal(controller.signal):rpc;
  });
  return Promise.race([request,new Promise((_r,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'));},10000);})]).finally(()=>clearTimeout(timer));
 };
 function bindSignup(client,getScope){
  const box=$('hcrec-referral-signup'),name=$('recommender'),code=$('hcrec-referral-code');
  const action=$('hcrec-referral-verify'),status=$('hcrec-referral-status'),receipt=$('hcrec-referral-receipt');
  if(!box||!name||!code||!action||!status||!receipt)return null;
  let epoch=0,proof=null,working=false,currentOwner='',onReceipt,retryId=null;
  const scope=()=>{const value=getScope();return value?.actor&&uid(value.actor)&&isPublic(value.coop)?value:null;};
  const owner=()=>scope()?.actor||'';
  const slot=actor=>'hcrec-referral-receipt/1/'+actor;
  const memory=new Map();
  function read(actor=owner()){
   if(!actor)return null;const live=memory.get(actor);if(uid(live))return live;
   try{const value=root.sessionStorage.getItem(slot(actor));return uid(value)?value:null;}catch(_){return null;}
  }
  function remember(actor,value){
   if(!actor)return;if(value)memory.set(actor,value);else memory.delete(actor);
   try{if(value)root.sessionStorage.setItem(slot(actor),value);else root.sessionStorage.removeItem(slot(actor));}catch(_){}
  }
  const note=text=>{status.textContent=text;};
  const snapshot=()=>JSON.stringify([name.value,code.value.trim()]);
  const same=(actor,at,values)=>owner()===actor&&epoch===at&&snapshot()===values;
  function paint(){const active=!!owner(),pending=read();box.hidden=!active;action.disabled=working||!active||!!pending;
   receipt.hidden=!active||!pending;receipt.disabled=working;}
  function invalidate(clear=false){++epoch;proof=null;working=false;if(clear)code.value='';note('');paint();}
  function sync(){const actor=owner();if(actor!==currentOwner){currentOwner=actor;retryId=null;invalidate(true);}paint();}
  async function verify(){
   sync();const actor=owner();if(!actor||working||read())return false;
   if(!name.value.trim()||!code.value.trim()){note('이름과 공유받은 추천 코드를 입력해 주세요.');return false;}
   if(!/^(?:[a-f0-9]{24}|(?:[a-f0-9]{6}-){3}[a-f0-9]{6})$/i.test(code.value.trim())){note('추천 코드 형식을 확인해 주세요.');return false;}
   const at=++epoch,values=snapshot();proof=null;working=true;note('추천인을 확인하는 중입니다.');paint();
   try{
    const {data,error}=await timeout(client,'hcrec_verify_referral_code',{p_name:name.value,p_code:code.value.trim()});
    if(!same(actor,at,values))return false;if(error)throw error;
    if(data?.status==='verified'&&uid(data.proof)&&Date.parse(data.valid_until)>Date.now()&&/^••••(?: [0-9]{4})?$/.test(data.masked_member_number)){
     proof={actor,values,value:data.proof,until:Date.parse(data.valid_until)};note('추천인 확인 완료 · 조합원번호 '+data.masked_member_number);return true;
    }
    note(data?.status==='rate_limited'?'확인 횟수를 초과했습니다. 잠시 후 다시 시도하거나 코드를 비워 주세요.':'추천인을 확인할 수 없습니다. 이름과 코드를 확인해 주세요.');
   }catch(_){if(same(actor,at,values))note('확인 결과를 받지 못했습니다. 입력을 유지한 채 다시 확인할 수 있습니다.');}
   finally{if(same(actor,at,values)){working=false;paint();}}
   return false;
  }
  function prepare(recommender){
   sync();const actor=owner();if(!actor)return {route:false};
   if(read())return {blocked:'이전 접수 여부를 먼저 확인해 주세요.'};
   if(!String(recommender||'').trim())return code.value.trim()?{blocked:'추천인 이름을 입력하거나 코드를 비워 주세요.'}:{route:false};
   if(Array.from(String(recommender).trim()).length>80||/[\u0000-\u001f\u007f]/.test(recommender))return {blocked:'추천인 이름을 80자 이내로 확인해 주세요.'};
   if(code.value.trim()&&(!proof||proof.actor!==actor||proof.values!==snapshot()||proof.until<=Date.now()))
    return {blocked:'추천인과 코드를 확인하거나, 코드를 비워 이름만 접수해 주세요.'};
   const req=retryId||root.crypto?.randomUUID?.();if(!uid(req))return {blocked:'신청 접수 확인을 준비하지 못했습니다. 화면을 다시 열어 주세요.'};
   return {route:true,actor,request:req,proof:code.value.trim()?proof.value:null};
  }
  async function recover(){
   sync();const actor=owner(),request=read(actor);if(!actor||!request||working)return null;
   const at=++epoch;working=true;paint();note('이전 신청의 접수 여부를 확인하는 중입니다.');
   try{
    const {data,error}=await timeout(client,'hcrec_referral_signup_receipt',{p_request_id:request});
    if(actor!==owner()||at!==epoch)return null;if(error)throw error;
    if(data?.status==='received'){
     remember(actor,null);note('이전 가입 신청이 이미 접수되었습니다.');onReceipt?.(data);return data;
    }
    if(data?.status==='not_found'){
     remember(actor,null);retryId=request;note('접수 기록이 없습니다. 내용을 확인한 뒤 가입 신청을 다시 눌러 주세요.');return data;
    }
    note('아직 접수 결과를 확인할 수 없습니다. 잠시 뒤 다시 확인해 주세요.');
   }catch(_){if(actor===owner()&&at===epoch)note('접수 여부를 확인하지 못했습니다. 다시 확인해 주세요.');}
   finally{if(actor===owner()&&at===epoch){working=false;paint();}}
   return null;
  }
  name.addEventListener('input',()=>invalidate());code.addEventListener('input',()=>invalidate());
  action.addEventListener('click',()=>void verify());receipt.addEventListener('click',()=>void recover());sync();
  return Object.freeze({sync,invalidate,prepare,verify,recover,started(req){remember(req.actor,req.request);paint();},
   finished(req,{unknown=false}={}){if(!unknown&&read(req.actor)===req.request){remember(req.actor,null);if(req.actor===owner())retryId=null;}paint();},
   hasPending(){return !!read();},onReceipt(fn){onReceipt=fn;}});
 }
 function bindProfile(client,getScope){
  const box=$('hcrec-referral-share'),create=$('hcrec-referral-issue'),rotate=$('hcrec-referral-rotate');
  const output=$('hcrec-referral-own-code'),copy=$('hcrec-referral-copy'),status=$('hcrec-referral-share-status');
  if(!box||!create||!rotate||!output||!copy||!status)return null;
  const active=()=>{const v=getScope();return v?.actor&&v.profile&&isPublic(v.coop)&&v.allowed===true?JSON.stringify([v.actor,v.coop,v.profile]):'';};
  let previous='',pending=null,message='',raw='',revision=0;
  function paint(){const scope=active(),busy=!!pending;box.hidden=!scope;create.disabled=busy;
   rotate.disabled=busy;copy.disabled=busy||!raw;copy.hidden=!raw;output.hidden=!raw;output.textContent=raw;status.textContent=message;}
  function sync(){const scope=active();if(scope!==previous){++revision;previous=scope;raw='';message='';}paint();}
  function clear(){++revision;previous='';raw='';message='';box.hidden=true;output.textContent='';copy.hidden=true;}
  async function issue(replace){
   sync();const scope=active(),at=revision;if(!scope||pending)return false;
   if(replace){const confirmed=await root.CoopDialog?.confirm('새 코드를 만들면 아직 쓰지 않은 이전 코드를 사용할 수 없어요. 바꿀까요?');
    if(confirmed!==true||scope!==active()||at!==revision||pending)return false;}
   const task={scope};pending=task;message='추천 코드를 준비하는 중입니다.';paint();
   try{
    const {data,error}=await client.rpc('hcrec_issue_referral_code',{p_replace:replace});
    if(scope!==active()||previous!==scope||at!==revision)return false;if(error)throw error;
    if(data?.status==='issued'&&/^(?:[A-F0-9]{6}-){3}[A-F0-9]{6}$/.test(data.code)){
     raw=data.code;message='한 사람에게만 공유해 주세요. 7일 이내에 한 번 사용할 수 있어요.';return true;
    }
    message=data?.status==='already_issued'?'아직 쓸 수 있는 코드가 있습니다. 코드를 잃어버렸다면 새로 만들 수 있어요.':'잠시 후 다시 눌러 주세요.';
   }catch(_){if(scope===active()&&previous===scope&&at===revision)message='발급 결과를 확인하지 못했습니다. 다시 누르면 새로 발급하기 전에 기존 코드를 확인합니다.';}
   finally{if(pending===task)pending=null;sync();}
   return false;
  }
  create.addEventListener('click',()=>void issue(false));rotate.addEventListener('click',()=>void issue(true));
  copy.addEventListener('click',async()=>{const scope=active(),visible=raw;if(!scope||!visible)return;try{
   await root.navigator.clipboard.writeText(visible);if(scope===active()&&raw===visible){message='추천 코드를 복사했습니다.';paint();}
  }catch(_){if(scope===active()&&raw===visible){message='자동 복사를 할 수 없습니다. 화면의 코드를 직접 복사해 주세요.';paint();}}});
  sync();return Object.freeze({sync,clear,issue});
 }
 root.CoopHcrecMemberReferral=Object.freeze({coopId:id,isPublic,bindSignup,bindProfile});
})(window);
