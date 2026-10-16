/* v1.1.0 — Capital-settings entry, with parent form and policy drafts retained. */
(function(root){
 'use strict';
 let binding=null,dialog=null,fields=null,baseline=null,revision=null,loaded=false,busy=false,pending=null,serial=0,opener=null,noticeTarget=null;
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const identity=o=>{const c=o?.context();return c?.actor&&c?.coop_id?c.actor+'|'+c.coop_id:'';};
 const valid=b=>!!b&&b===binding&&b.owner===identity(b)&&!!b.owner&&b.current()&&!root.frameElement?.hidden;
 const values=()=>noticeTarget?{member_uid:noticeTarget.id,notified_on:fields.date.value}:{payment_days:fields.mode.value==='unset'?null:fields.mode.value==='none'?0:Number(fields.days.value),basis_kind:fields.basis.value,basis_reference:fields.reference.value.trim()};
 const dirty=()=>!!fields&&!!baseline&&JSON.stringify(values())!==JSON.stringify(baseline);
 function status(text){if(fields)fields.status.textContent=text;}
 function update(){if(!fields)return;for(const e of dialog.querySelectorAll('input,select,textarea'))e.disabled=busy||!!pending||!loaded||!valid(binding);
  fields.save.disabled=busy||!!pending||!loaded||!valid(binding)||!dirty();fields.retry.disabled=busy||!!pending||!valid(binding);fields.discard.disabled=busy||!!pending||!dirty();fields.receipt.hidden=!pending;fields.receipt.disabled=busy||!valid(binding);fields.close.disabled=busy&&!!pending;
  if(!noticeTarget){fields.daysWrap.hidden=fields.mode.value!=='days';fields.basisWrap.hidden=fields.mode.value!=='days';}
  fields.dirty.textContent=pending?'처리 결과 확인 필요':dirty()?'미저장 변경 있음':'';
 }
 function checkpoint(){if(!dialog)return;for(const e of dialog.querySelectorAll('input,textarea'))e.defaultValue=e.value;for(const e of dialog.querySelectorAll('select option'))e.defaultSelected=e.selected;root.ErpWorkspaceResume?.checkpoint(dialog);}
 function launchers(){for(const button of document.querySelectorAll('[data-admission-policy-launcher]'))button.hidden=!valid(binding);}
 function clear(){++serial;dialog?.remove();binding=null;dialog=fields=baseline=revision=pending=noticeTarget=null;loaded=busy=false;launchers();}
 function bind(options){const key=identity(options);if(!key)return;if(binding?.owner!==key)clear();if(binding)Object.assign(binding,options);else binding={...options,owner:key};update();launchers();}
 async function call(b,action,payload={},expected=null,id=null){let timer;const controller=new AbortController();
  try{let q=b.client.rpc('erp_member_admission_policy',{p_action:action,p_payload:payload,p_expected_revision:expected,p_request_id:id});
   const reading=action==='get'||action==='receipt';if(reading&&q.abortSignal)q=q.abortSignal(controller.signal);
   const r=reading?await Promise.race([q,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'));},15000);})]):await q;
   if(!valid(b))throw Error('CONTEXT_CHANGED');if(r.error)throw r.error;if(r.data?.coop_id!==b.context().coop_id)throw Error('CONTEXT_CHANGED');return r.data;
  }finally{clearTimeout(timer);}
 }
 function fill(data){if(noticeTarget){fields.date.value=data.notified_on||'';}else{fields.mode.value=data.payment_days===null?'unset':data.payment_days===0?'none':'days';fields.days.value=data.payment_days>0?String(data.payment_days):'10';fields.basis.value=data.basis_kind;fields.reference.value=data.basis_reference;}
  revision=data.revision;baseline=values();loaded=true;checkpoint();update();
 }
 function good(data){return Number.isSafeInteger(data.revision)&&data.revision>=0&&(noticeTarget?data.member_uid===noticeTarget.id:((data.payment_days===null||Number.isInteger(data.payment_days)&&data.payment_days>=0&&data.payment_days<=365)&&['application_completed','acceptance_notified'].includes(data.basis_kind)&&typeof data.basis_reference==='string'));}
 async function read(){const b=binding;if(!valid(b)||busy||pending||noticeTarget)return;const id=++serial;busy=true;update();status('불러오는 중입니다…');
  try{const r=await call(b,'get');if(id!==serial||!valid(b))return;if(!good(r))throw Error('RESPONSE_INVALID');
   if(dirty()){status('현재 기준을 확인했습니다. 입력은 유지됩니다. 다른 변경이 있으면 입력 취소 후 다시 확인해 주세요.');}
   else{fill(r);status('');}
  }catch(_){if(id===serial&&valid(b))status('불러오지 못했습니다. 입력을 유지했습니다. 다시 확인해 주세요.');}
  finally{if(id===serial&&b===binding){busy=false;update();}}
 }
 function finish(result){if(!good(result))throw Error('RESPONSE_INVALID');pending=null;fill(result);status('저장했습니다.');if(noticeTarget)binding.refresh?.();}
 async function save(){const b=binding;if(!valid(b)||busy||pending||!loaded||!dirty())return;
  if(!noticeTarget&&fields.mode.value==='days'&&(!fields.days.value||!fields.days.checkValidity()))return fields.days.reportValidity();
  const payload=values();if(noticeTarget&&(!fields.date.value||!fields.date.checkValidity()))return fields.date.reportValidity();
  if(!noticeTarget&&payload.payment_days!==null&&!payload.basis_reference)return status('정관 조항 또는 근거를 입력해 주세요.');
  pending={id:root.crypto.randomUUID(),action:noticeTarget?'set_notice':'save',payload,revision};busy=true;update();status('저장 중입니다…');
  try{const r=await call(b,pending.action,pending.payload,pending.revision,pending.id);if(valid(b))finish(r);}
  catch(e){if(valid(b)){if(e?.code==='PT409'||e?.code==='42501'||String(e?.code||'').startsWith('22')){pending=null;status(e.code==='PT409'?'다른 변경이 있어 저장하지 않았습니다. 입력을 보존했습니다. 입력 취소 후 다시 확인해 주세요.':e.code==='42501'?'저장 권한을 확인해 주세요. 입력은 유지됩니다.':'날짜·기한·정관 근거를 확인해 주세요. 입력은 유지됩니다.');}else status('저장 결과를 확인하지 못했습니다. 처리 결과 확인을 눌러 주세요.');}}
  finally{if(b===binding){busy=false;update();}}
 }
 async function receipt(){const b=binding,request=pending;if(!valid(b)||busy||!request)return;busy=true;update();
  try{const r=await call(b,'receipt',{},null,request.id);if(pending!==request)return;if(r.found)finish(r.result);else status('완료 기록이 아직 없습니다. 잠시 후 다시 결과를 확인해 주세요.');}
  catch(_){if(valid(b))status('결과를 확인하지 못했습니다. 기존 요청을 유지합니다.');}finally{if(b===binding){busy=false;update();}}
 }
 function close(){if(busy&&pending)return;++serial;busy=false;dialog?.close();if(opener?.isConnected)opener.focus({preventScroll:true});update();}
 async function help(){await root.CoopDialog.alert('정관에 따른 납입기한을 표시하고, 기한이 지난 미납 신청을 확인할 때 사용합니다.\n\n0은 기한 없음이며 미설정과 구분합니다. 변경한 기준은 이후 새 신청부터 적용되고 기존 신청의 기한은 유지됩니다.',{title:'납입기한을 설정하는 이유'});}
 function build(){const d=node('dialog','border rounded-3 p-4 bg-white text-dark');dialog=d;d.id='memberAdmissionPolicyDialog';d.style.cssText='width:min(560px,calc(100% - 32px));max-height:85vh;overflow:auto;word-break:keep-all;color-scheme:light';
  const heading=node('h2','h5',noticeTarget?'가입 승낙 통지일':'출자금 납입기한 설정');heading.id='admissionPolicyTitle';d.setAttribute('aria-labelledby',heading.id);d.append(heading);fields={};
  const field=(label,id,tag='input',parent=d)=>{const wrap=node('div','my-3'),l=node('label','form-label',label),e=node(tag,'form-control');e.id=id;l.htmlFor=id;wrap.append(l,e);parent.append(wrap);return [e,wrap];};
  if(noticeTarget){[fields.date]=field('실제 가입 승낙 통지일','admissionNotificationDate');fields.date.type='date';fields.date.required=true;fields.date.min=noticeTarget.submitted;fields.date.max=new Date(Date.now()+9*3600000).toISOString().slice(0,10);}
  else{
   const h=node('button','btn btn-link btn-sm p-0','왜 설정하나요?');h.type='button';h.onclick=()=>void help();d.append(h);
   [fields.mode]=field('납입기한','admissionPolicyMode','select');for(const [v,t]of [['unset','미설정'],['none','기한 없음 (0일)'],['days','기한 있음']]){const o=node('option','',t);o.value=v;fields.mode.append(o);}
   [fields.days,fields.daysWrap]=field('납입기한 일수','admissionPolicyDays');fields.days.type='number';fields.days.min='1';fields.days.max='365';fields.days.step='1';fields.days.value='10';fields.days.required=true;
   [fields.basis,fields.basisWrap]=field('계산 기준일','admissionPolicyBasis','select');for(const [v,t]of [['application_completed','신청 완료일'],['acceptance_notified','가입 승낙 통지일']]){const o=node('option','',t);o.value=v;fields.basis.append(o);}
   [fields.reference]=field('정관 조항·근거','admissionPolicyReference','textarea');fields.reference.maxLength=1000;fields.reference.rows=3;
  }
  fields.dirty=node('div','small text-warning-emphasis');fields.status=node('p','small my-3');fields.status.setAttribute('role','status');d.append(fields.dirty,fields.status);
  const actions=node('div','d-flex gap-2 flex-wrap justify-content-end');for(const [k,text]of [['retry','다시 확인'],['discard','입력 취소'],['receipt','처리 결과 확인'],['close','닫기'],['save','저장']]){const b=node('button','btn '+(k==='save'?'btn-primary':'btn-outline-secondary'),text);b.type='button';fields[k]=b;actions.append(b);}
  fields.retry.hidden=!!noticeTarget;fields.retry.onclick=()=>void read();fields.save.onclick=()=>void save();fields.receipt.onclick=()=>void receipt();fields.close.onclick=close;
  fields.discard.onclick=async()=>{const b=binding,captured=serial;if(busy||pending||!dirty())return;if(await root.CoopDialog.confirm('입력한 변경을 취소할까요?',{title:'입력 취소'})&&valid(b)&&captured===serial&&!busy&&!pending){fill({...baseline,revision});status('입력을 취소했습니다.');}};
  d.addEventListener('input',update);d.addEventListener('change',update);d.addEventListener('cancel',e=>{e.preventDefault();close();});d.append(actions);document.body.append(d);update();
 }
 function attachLauncher(parent){if(parent?.id!=='memberCapitalSettingsModal')return;let b=parent.querySelector('[data-admission-policy-launcher]');if(!b){b=node('button','btn btn-outline-primary mt-3','납입기한 설정');b.type='button';b.dataset.admissionPolicyLauncher='';b.onclick=()=>void open({parent});parent.querySelector('.modal-body')?.append(b);}launchers();}
 async function open(options={}){if(!valid(binding)||busy)return false;
  const parent=options.parent,allowed=parent?.isConnected&&['settingsModal','memberCapitalSettingsModal'].includes(parent.id);
  if([...document.querySelectorAll('.modal.show')].some(m=>!allowed||m!==parent))return root.CoopDialog.alert('열린 편집창을 먼저 닫아 주세요.');
  const mount=()=>{if(dialog&&dialog.parentElement!==(allowed?parent:document.body))(allowed?parent:document.body).append(dialog);};
  if(noticeTarget&&(dirty()||pending)){opener=document.activeElement;mount();if(!dialog.open)dialog.showModal();update();return true;}
  if(noticeTarget){dialog?.remove();dialog=fields=baseline=null;noticeTarget=null;loaded=false;}
  opener=document.activeElement;if(!dialog)build();mount();if(!dialog.open)dialog.showModal();if(!loaded)await read();else update();return true;
 }
 async function openNotice(options,person,row){bind(options);if(!valid(binding)||busy||pending)return false;
  if(dialog&&(dirty()||pending)){if(!dialog.open)dialog.showModal();update();if(noticeTarget?.id===row.member_uid)return true;return root.CoopDialog.alert('작성 중인 변경을 먼저 저장하거나 입력 취소해 주세요.');}
  if(!['acceptance_notified'].includes(row.basis_kind)||!(row.payment_days>0))return false;
  dialog?.remove();dialog=fields=baseline=null;noticeTarget={id:row.member_uid,submitted:row.submitted_on};loaded=false;opener=document.activeElement;build();
  fill({member_uid:row.member_uid,notified_on:row.basis_on,revision:row.revision});dialog.showModal();return true;
 }
 document.addEventListener('click',e=>{if(!e.target.closest?.('#member-admission-policy-button'))return;e.preventDefault();void open();});
 root.addEventListener('beforeunload',e=>{if(dirty()||pending){e.preventDefault();e.returnValue='';}});
 root.addEventListener('pagehide',clear);root.MemberAdmissionPolicy=Object.freeze({bind,open,openNotice,clear,attachLauncher,isDirty:dirty});
})(window);
