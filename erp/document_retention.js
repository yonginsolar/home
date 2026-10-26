/* Retention review v1.0.0. Same-coop manager RPCs; no document/Storage mutation or notifications. */
(()=>{'use strict';
const $=id=>document.getElementById(id),R=window.CoopRetentionRules;
const client=window.supabase.createClient('https://ifdqlwxgqgsvnawmhlfc.supabase.co','sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h',{global:{headers:{'x-erp-host':window.CoopRouteGuard?.getErpRuntimeHost(location)||location.hostname}}});
let owner='',epoch=0,dialogEpoch=0,closing=null,rows=[],after='',more=false,pending=null,active=null,booting=null,bootWanted=false;
const drafts=new Map(),modal=bootstrap.Modal.getOrCreateInstance($('retentionModal'));
const key=(kind,id)=>JSON.stringify([owner,kind,id]);
const status=text=>$('retentionStatus').textContent=text;
function form(){return {rules:Array.from($('retentionRuleFields').children).map(node=>({policy:node.querySelector('select').value,basis_date:node.querySelector('select').value==='permanent'?null:node.querySelector('input').value||null})),hold_reason:$('retentionHold').value.trim(),review_decision:$('retentionDecision').value};}
function snapshot(value){return JSON.stringify({rules:value.rules||[],hold_reason:value.hold_reason||'',review_decision:value.review_decision||'pending'});}
function capture(){if(active&&active.owner===owner){active.value=form();$('retentionReviewStatus').textContent=active.unknown?'저장 결과 확인이 필요합니다.':snapshot(active.value)!==active.baseline?'작성 중 · 아직 저장하지 않음':'';}}
function safeMessage(error){return error?.code==='PT409'?'문서 또는 검토 내용이 변경되었습니다. 다시 확인해 주세요.':error?.code==='42501'?'현재 문서 관리 권한을 다시 확인해 주세요.':'처리 결과를 확인하지 못했습니다. 다시 확인해 주세요.';}
function current(context){return context.owner===owner&&context.epoch===epoch&&!document.hidden;}
function modalCurrent(draft,context){return current(context)&&active===draft&&context.dialog===dialogEpoch&&$('retentionModal').classList.contains('show');}
function stop(){epoch++;if(pending){pending.controller.abort();pending.release?.({cancelled:true});pending=null;} $('retentionMore').disabled=false;}
async function read(name,args,context){const controller=context.controller||new AbortController();let timer;try{
 const result=await Promise.race([client.rpc(name,args).abortSignal(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('READ_TIMEOUT'));controller.abort();},15000);})]);
 if(result.error)throw result.error;return result.data;
}finally{clearTimeout(timer);}}
async function boot(){if(booting){bootWanted=true;return booting;}const generation=epoch;booting=(async()=>{status('조회 권한을 확인하고 있습니다…');try{
 const context={controller:new AbortController()};
 const [user,runtime]=await Promise.all([Promise.race([client.auth.getUser(),new Promise((_,reject)=>setTimeout(()=>reject(Error('AUTH_TIMEOUT')),15000))]),read('get_my_erp_runtime',{},context)]);
 if(generation!==epoch)return;
 if(user.error||!user.data?.user||!runtime?.coop_id||runtime.is_active===false)throw Error('AUTH_REQUIRED');
 const next=JSON.stringify([user.data.user.id,runtime.coop_id]);
 if(next!==owner){capture();modal.hide();owner=next;rows=[];render();}
 const options=Array.from($('retentionKind').options),allowed=await Promise.all(options.map(o=>read('erp_retention_can_manage',{p_kind:o.value},context)));
 if(generation!==epoch)return;
 options.forEach((option,i)=>{option.disabled=allowed[i]!==true;});const selected=$('retentionKind').selectedOptions[0];if(selected?.disabled)$('retentionKind').value=options.find((o,i)=>allowed[i]===true)?.value||'';
 $('retentionKind').disabled=!allowed.some(Boolean);
 if($('retentionKind').disabled){status('이 화면을 이용할 문서 관리 권한이 없습니다.');return;}
 await load(true);
 }catch(_){if(generation===epoch)status('문서 관리 권한을 확인하지 못했습니다. 다시 확인해 주세요.');}finally{booting=null;if(bootWanted){bootWanted=false;setTimeout(()=>void boot(),0);}}})();return booting;}
function render(){const body=$('retentionRows');body.replaceChildren();const search=$('retentionSearch').value.trim().toLocaleLowerCase(),filter=$('retentionFilter').value;
 const visible=rows.filter(row=>{const value=R.evaluate(row);return (!search||String(row.title||'').toLocaleLowerCase().includes(search))&&(filter==='all'||value.state===filter);});
 for(const row of visible){const state=R.evaluate(row),tr=document.createElement('tr');const texts=[`${row.title||'제목 없음'}\n${row.document_type||''}${row.has_attachment?' · 첨부 있음':''}`,row.rules?.map(rule=>R.policies[rule.policy]?.name||'기준 확인').join('\n')||'미설정',state.until||'확인 필요',state.label];
 for(const text of texts){const td=document.createElement('td');td.textContent=text;td.style.whiteSpace='pre-line';tr.append(td);}const td=document.createElement('td'),button=document.createElement('button');button.type='button';button.dataset.retentionDocument=row.document_id;button.className='btn btn-outline-primary btn-sm';button.textContent='보존·파기 검토';button.addEventListener('click',()=>open(row,button));td.append(button);tr.append(td);body.append(tr);}
 if(!visible.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent=rows.length?'현재 불러온 문서 중 조건에 맞는 문서가 없습니다.':'표시할 문서가 없습니다.';tr.append(td);body.append(tr);}
 $('retentionMore').hidden=!more;
}
function load(reset=true){if(!owner)return boot();if(pending)return pending.promise;const context={owner,epoch,kind:$('retentionKind').value,controller:new AbortController(),release:null,promise:null};if(!context.kind)return Promise.resolve();pending=context;status('문서를 불러오는 중입니다…');$('retentionMore').disabled=true;
 context.promise=(async()=>{try{const data=await Promise.race([read('erp_retention_list',{p_kind:context.kind,p_after:reset?'':after,p_limit:51},context),new Promise(resolve=>{context.release=resolve;})]);
 if(!current(context)||data?.cancelled||context.kind!==$('retentionKind').value)return;
 if(!Array.isArray(data))throw Error('INVALID_LIST');const chunk=data.slice(0,50);rows=reset?chunk:rows.concat(chunk.filter(d=>!rows.some(r=>r.document_id===d.document_id)));after=rows.at(-1)?.document_id||'';more=data.length>50;render();status(`${rows.length.toLocaleString('ko-KR')}건 불러옴${more?' · 더 보기로 이어서 확인해 주세요.':''}`);
 }catch(error){if(current(context))status('목록을 불러오지 못했습니다. 다시 확인해 주세요.');}finally{if(pending===context){pending=null;$('retentionMore').disabled=false;}}})();return context.promise;}
function ruleField(value={policy:'tax5',basis_date:null}){const node=document.createElement('div');node.className='retention-rule';
 const label=document.createElement('label');label.textContent='보존 기준';const select=document.createElement('select');select.className='form-select';for(const [key,p]of Object.entries(R.policies)){const option=document.createElement('option');option.value=key;option.textContent=p.name;select.append(option);}select.value=value.policy;label.append(select);
 const baseLabel=document.createElement('label');baseLabel.textContent='기산일';const input=document.createElement('input');input.type='date';input.className='form-control';input.value=value.basis_date||'';input.min='1900-01-01';input.max='2200-12-31';baseLabel.append(input);
 const remove=document.createElement('button');remove.type='button';remove.className='btn btn-outline-secondary';remove.textContent='기준 빼기';remove.addEventListener('click',()=>{node.remove();capture();$('retentionAddRule').focus({preventScroll:true});});
 const help=document.createElement('small');help.className='text-muted';function update(){const p=R.policies[select.value];input.disabled=p.years===null;help.textContent=p.basis+' · '+p.law;}select.addEventListener('change',update);node.append(label,baseLabel,remove,help);$('retentionRuleFields').append(node);update();}
function open(row,trigger){capture();dialogEpoch++;const kind=$('retentionKind').value,k=key(kind,row.document_id);let draft=drafts.get(k);if(!draft){draft={owner,kind,row,value:{rules:row.rules||[{policy:kind==='employment'?'employment3':kind==='approval'&&row.document_type==='지출결의'?'tax5':'important10',basis_date:null}],hold_reason:row.hold_reason||'',review_decision:row.review_decision||'pending'},unknown:null};draft.baseline=snapshot(draft.value);drafts.set(k,draft);}active=draft;draft.trigger=trigger;
 $('retentionDocumentTitle').textContent=row.title||'제목 없음';$('retentionReviewHint').textContent=row.source_confirmed?'현재 저장된 보존 기준입니다.':'이 문서의 보존 기준과 기산일을 확인해 주세요.';
 $('retentionRuleFields').replaceChildren();draft.value.rules.forEach(ruleField);$('retentionHold').value=draft.value.hold_reason;$('retentionDecision').value=draft.value.review_decision;sync();modal.show();}
function sync(){if(!active)return;const busy=!!active.pending; $('retentionSave').disabled=busy||!!active.unknown;$('retentionLatest').disabled=busy||!!active.unknown;$('retentionResult').hidden=!active.unknown;$('retentionResult').disabled=busy;capture();}
async function latest(){const draft=active;if(!draft||draft.pending||draft.unknown||draft.owner!==owner)return;capture();const original=snapshot(form()),context={owner,epoch,dialog:dialogEpoch};draft.pending=true;sync();try{
 const row=await read('erp_retention_get',{p_kind:draft.kind,p_document_id:draft.row.document_id},{});
 if(!modalCurrent(draft,context))return;
 if(!row){$('retentionReviewStatus').textContent='문서를 찾을 수 없거나 조회할 수 없습니다.';return;}
 if(row.source_token!==draft.row.source_token||row.revision!==draft.row.revision){const yes=await window.CoopDialog.confirm('문서 또는 검토 내용이 변경되었습니다. 작성 중인 검토 내용을 유지하고 최신 문서를 기준으로 이어갈까요?');
 if(!yes||!modalCurrent(draft,context)||snapshot(form())!==original)return;}
 draft.row=row;draft.baseline=snapshot(row);$('retentionReviewStatus').textContent='최신 문서를 확인했습니다. 작성한 보존 기준을 확인한 뒤 저장해 주세요.';
 }catch(error){if(modalCurrent(draft,context))$('retentionReviewStatus').textContent=safeMessage(error);}finally{draft.pending=false;if(active===draft&&draft.owner===owner){$('retentionSave').disabled=!!draft.unknown;$('retentionLatest').disabled=!!draft.unknown;}}}
async function result(){const draft=active;if(!draft?.unknown||draft.owner!==owner||draft.pending)return;draft.pending=true;sync();const context={owner,epoch,dialog:dialogEpoch};try{
 const row=await read('erp_retention_get',{p_kind:draft.kind,p_document_id:draft.row.document_id},{});
 if(!modalCurrent(draft,context))return;
 if(row&&row.source_confirmed&&row.revision===Number(draft.unknown.expected||0)+1&&snapshot(row)===snapshot(draft.unknown.value)){
 draft.row=row;draft.baseline=snapshot(row);draft.unknown=null;rows=rows.map(r=>r.document_id===row.document_id?row:r);render();$('retentionReviewStatus').textContent=snapshot(form())===draft.baseline?'저장했습니다.':'저장했습니다. 추가 입력은 아직 저장되지 않았습니다.';
 }else if(row&&row.revision===(draft.unknown.expected??null)&&row.source_token===draft.unknown.token){draft.unknown=null;$('retentionReviewStatus').textContent='저장되지 않은 것을 확인했습니다. 내용을 확인한 뒤 저장해 주세요.';}
 else $('retentionReviewStatus').textContent='저장 결과가 현재 문서와 다릅니다. 목록을 다시 확인해 주세요.';
 }catch(error){if(modalCurrent(draft,context))$('retentionReviewStatus').textContent=safeMessage(error);}finally{draft.pending=false;if(active===draft&&draft.owner===owner){$('retentionSave').disabled=!!draft.unknown;$('retentionLatest').disabled=!!draft.unknown;$('retentionResult').hidden=!draft.unknown;$('retentionResult').disabled=false;}}}
async function save(event){event.preventDefault();const draft=active;if(!draft||draft.owner!==owner||draft.pending||draft.unknown)return;capture();const value=form();if(!value.rules.length||value.rules.some(rule=>!R.policies[rule.policy]||(rule.policy!=='permanent'&&!R.date(rule.basis_date)))){$('retentionReviewStatus').textContent='보존 기준과 기산일을 확인해 주세요.';return;}
 const verdict=R.evaluate({...draft.row,source_confirmed:true},value);if(value.review_decision==='propose_disposal'&&verdict.state!=='expired'){$('retentionReviewStatus').textContent='기한·문서 처리 상태와 별도 보존 사유를 확인해 주세요.';return;}
 draft.pending=true;draft.unknown={value:JSON.parse(JSON.stringify(value)),expected:draft.row.revision??null,token:draft.row.source_token};sync();const context={owner,epoch,dialog:dialogEpoch};let timer;
 try{const result=await Promise.race([client.rpc('erp_retention_review',{p_kind:draft.kind,p_document_id:draft.row.document_id,p_source_token:draft.row.source_token,p_revision:draft.row.revision??null,p_rules:value.rules,p_hold_reason:value.hold_reason,p_decision:value.review_decision}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RESULT_UNKNOWN')),15000);})]);
 if(result.error){if(result.error.code==='PT409'||result.error.code==='22023'||result.error.code==='42501')draft.unknown=null;throw result.error;}
 if(!result.data?.ok)throw Error('RESULT_UNKNOWN');draft.row={...draft.row,...value,...result.data,source_confirmed:true};draft.baseline=snapshot(value);draft.unknown=null;
 if(current(context)){rows=rows.map(row=>row.document_id===draft.row.document_id?draft.row:row);render();if(modalCurrent(draft,context))$('retentionReviewStatus').textContent=snapshot(form())===draft.baseline?'저장했습니다.':'저장했습니다. 추가 입력은 아직 저장되지 않았습니다.';}
 }catch(error){if(modalCurrent(draft,context))$('retentionReviewStatus').textContent=draft.unknown?'저장 결과를 확인하지 못했습니다. 저장 결과 확인을 눌러 주세요.':safeMessage(error);}
 finally{clearTimeout(timer);draft.pending=false;if(draft.owner===owner&&active===draft){$('retentionSave').disabled=!!draft.unknown;$('retentionLatest').disabled=!!draft.unknown;$('retentionResult').hidden=!draft.unknown;$('retentionResult').disabled=false;}}
}
$('retentionFilters').addEventListener('submit',event=>{event.preventDefault();if(!owner||$('retentionKind').disabled)void boot();else{stop();void load(true);}});
$('retentionKind').addEventListener('change',()=>{capture();modal.hide();stop();rows=[];after='';render();void load(true);});
for(const id of ['retentionSearch','retentionFilter'])$(id).addEventListener('input',render);
$('retentionMore').addEventListener('click',()=>load(false));$('retentionAddRule').addEventListener('click',()=>{if($('retentionRuleFields').children.length<5){ruleField();capture();}});
$('retentionReviewForm').addEventListener('input',capture);$('retentionReviewForm').addEventListener('change',capture);$('retentionReviewForm').addEventListener('submit',save);$('retentionResult').addEventListener('click',result);$('retentionLatest').addEventListener('click',latest);
$('retentionModal').addEventListener('keydown',event=>{if(event.key!=='Tab'||document.querySelector('dialog[open]'))return;const controls=Array.from($('retentionModal').querySelectorAll('button,input,select,textarea,a[href],[tabindex]')).filter(node=>!node.disabled&&node.tabIndex>=0&&node.getClientRects().length);const first=controls[0],last=controls.at(-1);if(first&&((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last))){event.preventDefault();event.stopPropagation();(event.shiftKey?last:first).focus({preventScroll:true});}});
$('retentionModal').addEventListener('hide.bs.modal',()=>{capture();closing={draft:active,epoch:++dialogEpoch};});$('retentionModal').addEventListener('hidden.bs.modal',()=>{if(!active||active.owner!==owner||closing?.draft!==active||closing.epoch!==dialogEpoch)return;const trigger=active.trigger?.isConnected?active.trigger:Array.from(document.querySelectorAll('[data-retention-document]')).find(button=>button.dataset.retentionDocument===active.row.document_id);if(trigger&&(!document.activeElement||document.activeElement===document.body||$('retentionModal').contains(document.activeElement)))trigger.focus({preventScroll:true});});
window.addEventListener('beforeunload',event=>{capture();if(Array.from(drafts.values()).some(d=>d.owner===owner&&(d.pending||d.unknown||snapshot(d.value)!==d.baseline))){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){capture();stop();}else void boot();});
client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'||event==='USER_UPDATED')setTimeout(()=>{capture();modal.hide();stop();owner='';rows=[];render();void boot();},0);});
const initialKind=new URL(location.href).searchParams.get('kind');if(Array.from($('retentionKind').options).some(option=>option.value===initialKind))$('retentionKind').value=initialKind;
void boot();
})();
