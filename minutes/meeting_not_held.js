/* v1.2.1 — Preserve explicit annex exclusions and agendas-only choices. */
export function createMeetingNotHeld(hooks) {
 const d=hooks.document||document, drafts=new Map();let view=null,epoch=0;
 const key=o=>JSON.stringify([o.userId,o.coopId,o.packageId]);
 const same=v=>view===v&&v.epoch===epoch&&hooks.current(v.owner)&&!hooks.hidden();
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={MEETING_NOT_HELD_CONFLICT:'회의 내용이 바뀌었습니다. 다시 불러와 확인해 주세요.',MEETING_OTHER_EDITOR_ACTIVE:'다른 담당자가 문서를 편집 중입니다. 편집이 끝난 뒤 다시 확인해 주세요.',MEETING_BUSY_RETRY:'다른 작업이 진행 중입니다. 잠시 후 다시 확인해 주세요.',MEETING_ALREADY_RECORDED:'이미 의사록이 만들어진 회의입니다. 기존 기록을 먼저 확인해 주세요.',MEETING_HAS_DECISION_RESULTS:'의결 결과가 작성되어 있습니다. 내용을 확인한 뒤 무산 처리를 진행해 주세요.',MEETING_QUORUM_INPUT_INVALID:'재적 인원과 참석 인원을 확인해 주세요. 성원이 충족된 회의는 성원 미달로 처리할 수 없습니다.',MEETING_NOT_HELD_DATE_INVALID:'회의 예정일을 확인해 주세요. 미래 회의는 무산 처리할 수 없습니다.',MEETING_CARRY_TARGET_LOCKED:'다음 회의는 아직 소집 공문이 확정되지 않은 초안을 선택해 주세요.',MEETING_NOT_HELD_ACCESS_DENIED:'현재 회의 처리 권한을 다시 확인해 주세요.',MEETING_EDIT_ACCESS_DENIED:'현재 회의 처리 권한을 다시 확인해 주세요.'};
 const root=d.createElement('div');root.className='modal meeting-not-held-modal';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','notHeldTitle');
 root.innerHTML=`<div class="modal-card"><h2 id="notHeldTitle"></h2><p id="notHeldStatus" role="status" aria-live="polite"></p><div id="notHeldMark"><div class="form-grid"><div class="field"><label for="notHeldEligible">재적 이사 수</label><input id="notHeldEligible" type="number" min="1" max="999999" inputmode="numeric"></div><div class="field"><label for="notHeldAttended">실제 참석 이사 수</label><input id="notHeldAttended" type="number" min="0" max="999999" inputmode="numeric"></div><div class="field full"><label for="notHeldReason">기록할 내용</label><textarea id="notHeldReason" maxlength="1000" placeholder="성원 미달 당시 상황 등 필요한 내용을 적어 주세요."></textarea></div></div></div><div id="notHeldCarry"><div class="field"><label for="notHeldTarget">다음 회의</label><select id="notHeldTarget"></select></div><div class="form-grid" id="notHeldNew"><div class="field"><label for="notHeldNumber">회차</label><input id="notHeldNumber" maxlength="100"></div><div class="field"><label for="notHeldNewTitle">회의 제목</label><input id="notHeldNewTitle" maxlength="200"></div></div><div class="not-held-selection"><strong>미심의 안건</strong><div class="top-actions"><button type="button" data-nh="all">전체 선택</button><button type="button" data-nh="none">전체 해제</button></div><div id="notHeldAgendas"></div></div></div><div class="bottom-actions"><button type="button" data-nh="close">닫기</button><button type="button" data-nh="reload">다시 불러오기</button><button type="button" data-nh="retry" hidden>같은 내용으로 다시 시도</button><button type="button" class="btn btn-brand" data-nh="submit">회의 무산 기록</button></div></div>`;
 root.querySelectorAll('button').forEach(b=>b.classList.add('btn'));
 d.body.append(root);const $=id=>root.querySelector('#'+id),button=action=>root.querySelector('[data-nh="'+action+'"]');
 $('notHeldCarry').insertAdjacentHTML('beforeend',`<fieldset class="not-held-annex-choice" id="notHeldAnnexChoice" hidden><legend>별첨 자료도 함께 가져올까요?</legend><label class="official-choice"><input type="radio" name="notHeldAnnexMode" id="notHeldAnnexNo" checked><span>안건만 가져오기</span></label><label class="official-choice"><input type="radio" name="notHeldAnnexMode" id="notHeldAnnexYes"><span>별첨도 선택하기</span></label><div id="notHeldAnnexSelection" hidden><p>안건에 필요한 별첨을 골라 주세요. 별첨 글은 회의자료 초안에 넣고, PDF는 원본과 연결해요.</p><div class="top-actions"><button type="button" class="btn" data-nh="annex-all">별첨 전체 선택</button><button type="button" class="btn" data-nh="annex-none">별첨 전체 해제</button></div><div id="notHeldAnnexList"></div></div></fieldset>`);
 const status=text=>{$('notHeldStatus').textContent=text;};
 function remember(){if(!view||view.row.pending)return;const r=view.row;r.eligible=$('notHeldEligible').value;r.attended=$('notHeldAttended').value;r.reason=$('notHeldReason').value;r.target=$('notHeldTarget').value;r.number=$('notHeldNumber').value;r.title=$('notHeldNewTitle').value;r.selected=[...root.querySelectorAll('[data-agenda]:checked')].map(n=>n.dataset.agenda);r.includeAnnex=$('notHeldAnnexYes').checked;r.annexSelected=[...root.querySelectorAll('[data-annex]:checked')].map(n=>n.dataset.annex);view.edits++;}
 function syncLinkedAnnexes(){
  if(!view||view.row.pending||view.busy)return;
  const selected=new Set([...root.querySelectorAll('[data-agenda]:checked')].map(n=>n.dataset.agenda));
  for(const input of root.querySelectorAll('[data-annex]')){
   const a=view.annexes.find(x=>x.id===input.dataset.annex);
   if(a?.agendaId&&a.agendaId!=='common')input.checked=selected.has(a.agendaId)&&view.row.annexChoices.get(a.id)!==false;
  }
  if(!view.row.annexModeChosen&&view.annexes.some(a=>a.agendaId&&selected.has(a.agendaId))){$('notHeldAnnexYes').checked=true;$('notHeldAnnexNo').checked=false;}
  remember();paint();
 }
 function paint(){if(!view)return;const v=view,busy=v.busy||!!v.row.pending||!!v.row.result;root.querySelectorAll('input,textarea,select,[data-nh="all"],[data-nh="none"],[data-nh^="annex-"]').forEach(n=>n.disabled=busy);
  $('notHeldAnnexSelection').hidden=!$('notHeldAnnexYes').checked;
  $('notHeldEligible').readOnly=Number(v.pack.eligible_count)>0;$('notHeldNew').hidden=!!$('notHeldTarget').value;
  button('submit').disabled=v.busy||(!v.info&&!v.row.pending&&!v.row.result);button('submit').textContent=v.row.result?'처리 결과 보기':v.row.pending?'결과 다시 확인':v.mode==='mark'?'회의 무산 기록':'다음 회의로 가져오기';button('reload').disabled=v.busy||!!v.row.pending||!!v.row.result;button('retry').hidden=!v.row.pending||!v.row.notFound;button('retry').disabled=v.busy;
 }
 function close(restore=true){const v=view;if(!v)return;remember();view=null;epoch++;root.classList.remove('show');
  const active=d.activeElement,may=active===d.body||root.contains(active);
  if(restore&&may&&hooks.current(v.owner)&&!hooks.hidden()&&v.opener?.isConnected&&!v.opener.disabled){v.opener.focus({preventScroll:true});}
 }
 async function read(){const v=view;if(!v||v.busy||v.row.pending)return;remember();const edits=v.edits;v.busy=true;v.info=null;status('회의 상태를 확인하고 있습니다…');paint();try{
  const r=await hooks.call('state',v.owner,{},null);if(r.error)throw r.error;if(!same(v))return;
  if(!r.data?.revision)throw new Error('INVALID_STATE');
  if(v.mode==='carry'&&v.sourceRevision&&v.sourceRevision!==r.data.revision)throw new Error('SOURCE_CHANGED');
  v.info=r.data;if(v.edits!==edits){v.info=null;status('입력이 바뀌었습니다. 다시 불러와 확인해 주세요.');}else status(v.mode==='mark'?'성원 미달 사실을 의사록 목록에 서명 없는 기록으로 남깁니다.':'선택한 안건을 다음 회의 초안에 추가합니다.');
 }catch(e){if(same(v))status(e.message==='SOURCE_CHANGED'?'원본 회의 자료가 바뀌었습니다. 이 창을 닫고 원본 회의를 다시 열어 주세요.':labels[e.message]||'회의 상태를 확인하지 못했습니다. 다시 불러와 주세요.');}finally{if(same(v)){v.busy=false;paint();}}}
 async function open(mode,opener){close(false);const owner=hooks.owner(),pack=hooks.pack();if(!owner?.packageId||!pack||hooks.hidden())return;
  if(hooks.dirty()){hooks.notice('작성 중인 회의 내용은 먼저 저장해 주세요.');return;}
  const k=key(owner)+':'+mode;let row=drafts.get(k);if(!row){row={eligible:String(pack.eligible_count||''),attended:'',reason:'',target:'',number:'',title:'',selected:hooks.agendas().map(x=>x.id)};drafts.set(k,row);}
  if(Number(pack.eligible_count)>0)row.eligible=String(pack.eligible_count);
  row.annexChoices ||= new Map();
  const annexes=mode==='carry'?(hooks.annexes?.()||[]).map(a=>({...a})):[];
  if(!Array.isArray(row.annexSelected)){
   const linked=annexes.some(a=>a.agendaId&&row.selected.includes(a.agendaId));
   row.annexSelected=annexes.filter(a=>linked?row.selected.includes(a.agendaId):!a.agendaId).map(a=>a.id);
   row.includeAnnex=linked;
  }
  const v={owner,pack,row,mode,opener,annexes,sourceRevision:hooks.sourceRevision?.(),epoch:++epoch,busy:false,info:null,edits:0};view=v;
  $('notHeldTitle').textContent=mode==='mark'?'회의 무산 기록':'다음 회의 준비';$('notHeldMark').hidden=mode!=='mark';$('notHeldCarry').hidden=mode!=='carry';
  $('notHeldEligible').value=row.eligible;$('notHeldAttended').value=row.attended;$('notHeldReason').value=row.reason;$('notHeldNumber').value=row.number;$('notHeldNewTitle').value=row.title;
  const choices=hooks.packages().filter(p=>p.id!==pack.id&&p.meeting_type==='BOARD'&&p.status==='DRAFT');
  $('notHeldTarget').innerHTML='<option value="">새 회의 만들기</option>'+choices.map(p=>`<option value="${escape(p.id)}">${escape(p.title)}</option>`).join('');
  if(row.target&&!choices.some(p=>p.id===row.target)){$('notHeldTarget').insertAdjacentHTML('beforeend',`<option value="${escape(row.target)}">이전 선택 · 다시 확인 필요</option>`);}
  $('notHeldTarget').value=row.target;
  $('notHeldAgendas').innerHTML=hooks.agendas().map(a=>`<label class="official-choice"><input type="checkbox" data-agenda="${escape(a.id)}"${row.selected.includes(a.id)?' checked':''}><span>${escape(a.title)}</span></label>`).join('')||'<p>가져올 안건이 없습니다.</p>';
  $('notHeldAnnexChoice').hidden=!annexes.length;$('notHeldAnnexYes').checked=!!row.includeAnnex;$('notHeldAnnexNo').checked=!row.includeAnnex;
  $('notHeldAnnexList').innerHTML=annexes.map(a=>`<label class="official-choice"><input type="checkbox" data-annex="${escape(a.id)}"${row.annexSelected.includes(a.id)?' checked':''}><span>${escape(a.title)} · ${a.kind==='TEXT'?'별첨 글':'PDF'}${a.agendaId==='common'?' · 공통 자료':a.agendaId?' · '+escape(hooks.agendas().find(x=>x.id===a.agendaId)?.title||'연결 안건 확인 필요'):''}</span></label>`).join('');
  root.classList.add('show');paint();(mode==='mark'?$('notHeldAttended'):$('notHeldTarget')).focus({preventScroll:true});
  if(row.result){status('이전에 요청한 처리가 완료되었습니다. 처리 결과를 확인해 주세요.');return;}
  if(row.pending){status('이전에 요청한 처리 결과를 먼저 확인해 주세요.');return;}
  await read();
 }
 async function complete(v,result){v.row.pending=null;v.row.notFound=false;v.row.result=result;
  if(!same(v))return;status(v.mode==='mark'?'회의 무산 기록을 남겼습니다.':'미심의 안건을 다음 회의로 가져왔습니다.');
  close();const closedEpoch=epoch;
  const stillCurrent=()=>!view&&epoch===closedEpoch&&hooks.current(v.owner)&&!hooks.hidden();
  if(await hooks.done(v.owner,result,stillCurrent,v.row.imports||[])!==false){drafts.delete(key(v.owner)+':'+v.mode);if(!view)hooks.checkpoint?.(root);}
 }
 async function send(v){const p=v.row.pending;if(!p||!same(v))return;v.busy=true;status('처리 중입니다…');paint();try{
  const r=await hooks.call(p.action,v.owner,p.data,p.key);if(r.error)throw r.error;if(!r.data?.verified)throw new Error('MEETING_OUTCOME_RESULT_UNKNOWN');v.row.result=r.data;await complete(v,r.data);
 }catch(e){if(/^(22|23|42|PT)/.test(String(e.code||''))&&!p.uncertain){v.row.pending=null;v.info=null;}else p.uncertain=true;
  if(same(v))status(labels[e.message]|| (v.row.pending?'처리 결과를 확인하지 못했습니다. 결과 다시 확인을 눌러 주세요.':'처리하지 못했습니다. 입력과 회의 상태를 다시 확인해 주세요.'));
 }finally{if(same(v)){v.busy=false;paint();}}}
 async function submit(){const v=view;if(!v||v.busy)return;
  if(v.row.result){await complete(v,v.row.result);return;}
  if(v.row.pending){v.busy=true;paint();status('처리 결과를 확인하고 있습니다…');try{const r=await hooks.call('receipt',v.owner,{},v.row.pending.key);if(r.error)throw r.error;if(r.data?.found&&r.data?.verified)await complete(v,r.data);else if(r.data?.found===false){v.row.notFound=true;if(same(v))status('아직 처리 결과가 확인되지 않았습니다. 다시 확인하거나 같은 내용으로 다시 시도해 주세요.');}else throw new Error('MEETING_OUTCOME_RESULT_UNKNOWN');}
   catch(_){if(same(v))status('처리 결과를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.');}finally{if(same(v)){v.busy=false;paint();}}return;
  }
  if(!v.info)return;
  remember();const edits=v.edits,data={revision:v.info.revision};
  const chosen=v.mode==='carry'&&v.row.includeAnnex?v.annexes.filter(a=>v.row.annexSelected.includes(a.id)):[];
  if(chosen.some(a=>a.agendaId&&a.agendaId!=='common'&&!v.row.selected.includes(a.agendaId))){status('별첨에 연결된 안건도 함께 선택해 주세요.');return;}
  if(v.mode==='carry'){data.pdf_ids=chosen.filter(a=>a.kind==='PDF').map(a=>a.pdfId);data.text_annex_ids=chosen.filter(a=>a.kind==='TEXT').map(a=>a.id);if(v.row.includeAnnex&&!chosen.length){status('가져올 별첨을 선택하거나 안건만 가져오기를 선택해 주세요.');return;}}
  if(v.mode==='mark'){data.eligible_count=v.row.eligible;data.attendee_count=v.row.attended;data.reason=v.row.reason;
   if(!/^[1-9][0-9]{0,5}$/.test(data.eligible_count)||!/^\d{1,6}$/.test(data.attendee_count)||Number(data.attendee_count)*2>Number(data.eligible_count)){status('재적 인원과 실제 참석 인원을 확인해 주세요.');return;}
  }else{data.agenda_ids=v.row.selected;if(!data.agenda_ids.length){status('가져올 안건을 선택해 주세요.');return;}if(v.row.target){
    v.busy=true;paint();try{const r=await hooks.call('state',{...v.owner,packageId:v.row.target},{},null);if(r.error)throw r.error;if(!same(v)||edits!==v.edits)return;data.target_package=v.row.target;data.target_revision=r.data.revision;}
    catch(_){if(same(v))status('다음 회의를 확인하지 못했습니다. 다시 선택해 주세요.');return;}finally{if(same(v)){v.busy=false;paint();}}
   }else{data.title=v.row.title.trim();data.meeting_number=v.row.number.trim();if(!data.title){status('새 회의 제목을 입력해 주세요.');$('notHeldNewTitle').focus();return;}}}
  let accepted;v.busy=true;paint();try{accepted=await hooks.confirm(v.mode==='mark'?'성원 미달로 회의가 무산되었다는 기록을 남길까요?':chosen.length?'선택한 안건과 별첨을 다음 회의로 가져올까요?':v.annexes.length?'별첨 없이 선택한 안건만 다음 회의로 가져올까요?':'선택한 안건을 다음 회의 초안에 가져올까요?');}catch(_){return;}finally{if(same(v)){v.busy=false;paint();}}
  if(!accepted||!same(v)||v.edits!==edits||hooks.dirty()){
   if(same(v)&&(!d.activeElement||d.activeElement===d.body||d.activeElement===button('submit')))button('submit').focus({preventScroll:true});
   return;
  }
  v.row.imports=chosen.map(a=>({...a}));v.row.pending={action:v.mode==='mark'?'mark':'carry',data,key:(hooks.uuid||(()=>crypto.randomUUID()))()};v.row.notFound=false;await send(v);
 }
 root.addEventListener('input',remember);root.addEventListener('change',event=>{if(event.target.matches('[data-agenda]'))syncLinkedAnnexes();else{
  if(view&&!view.busy&&!view.row.pending){
   if(event.target.matches('[data-annex]'))view.row.annexChoices.set(event.target.dataset.annex,event.target.checked);
   if(event.target.matches('[name="notHeldAnnexMode"]'))view.row.annexModeChosen=true;
  }
  remember();paint();
 }});
 root.addEventListener('click',event=>{const b=event.target.closest('[data-nh]');if(!b)return;const action=b.dataset.nh;if(action==='close'){close();return;}if(!view||view.busy)return;
  if(action==='all'||action==='none'){if(view.row.pending)return;root.querySelectorAll('[data-agenda]').forEach(n=>n.checked=action==='all');syncLinkedAnnexes();return;}
  if(action==='annex-all'||action==='annex-none'){if(view.row.pending)return;root.querySelectorAll('[data-annex]').forEach(n=>{n.checked=action==='annex-all';view.row.annexChoices.set(n.dataset.annex,n.checked);});remember();return;}
  if(action==='reload')void read();if(action==='submit')void submit();if(action==='retry'&&view.row.pending)void send(view);
 });
 root.addEventListener('keydown',e=>{if(!view||e.defaultPrevented||e.isComposing)return;
  const parentDialog=(()=>{try{return window.parent.document.querySelector('dialog[open]');}catch(_){return null;}})();if(parentDialog)return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}
  if(e.key==='Tab'){const list=[...root.querySelectorAll('button,input,select,textarea,a[href]')].filter(n=>!n.disabled&&!n.hidden&&!n.closest('[hidden]')&&n.getClientRects().length);if(!list.length)return;const at=list.indexOf(d.activeElement);e.preventDefault();e.stopPropagation();list[at<0?(e.shiftKey?list.length-1:0):(at+(e.shiftKey?-1:1)+list.length)%list.length].focus();}
 });
 return Object.freeze({open,close,invalidate:()=>close(false),hasDraft:()=>[...drafts.values()].some(r=>!!r.pending||r.attended!==''||r.reason!==''||r.title!==''||r.includeAnnex),root});
}
