/* 1.1.0 · Contract and addendum proposals, including village fee conditions. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dates=s=>s?new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'';
 const names={pending:'확인 대기',accepted:'반영 완료',rejected:'미반영',superseded:'이후 수정안으로 대체'};
 const sources={existing:'기존 저장본',created:'초안 작성',review:'검토 요청본',final:'결재용 최종본',saved:'초안 저장',proposal:'상대 수정안 반영',reopened:'수정본 만들기'};
 let api=null,record=null,editorBase=null,editorProposal=null,editorBaseline='',sending=false;
 const field=(id,label,value,type='text',extra='')=>`<div><label for="${id}" class="form-label">${esc(label)}</label><input id="${id}" class="form-control" type="${type}" value="${esc(value)}" ${extra}></div>`;
 function rows(before,after){
  const changes=[],get=(obj,path)=>path.split('.').reduce((v,k)=>v?.[k],obj),add=(label,a,b)=>{if(JSON.stringify(a??null)!==JSON.stringify(b??null))changes.push({label,before:String(a??''),after:String(b??'')});};
  add('계약 제목',before.title,after.title);
  const labels={start:'유료 서비스 개시일',end:'유료 이용 종료일',annual_supply:'연간 이용료 · 부가세 별도',free_start:'무료 제공 시작일',free_end:'무료 제공 종료일',setup:'초기 설정비·범위',special:'별도 합의',privacy_finalized:'위탁 별지 확인'};
  for(const [key,label] of Object.entries(labels)){const show=v=>key==='annual_supply'?Number(v||0).toLocaleString('ko-KR')+'원':key==='privacy_finalized'?(v?'확인':'미확인'):v;add(label,show(before.terms?.[key]),show(after.terms?.[key]));}
  add('햇빛소득마을 이용',before.terms?.village_enabled?'이용':'미포함',after.terms?.village_enabled?'이용':'미포함');
  add('마을당 연간 이용료 · 부가세 별도',before.terms?.village_annual_supply,after.terms?.village_annual_supply);
  add('변경 적용일',before.terms?.change_effective_on,after.terms?.change_effective_on);
  for(const [party,label] of [['provider','제공자'],['client','이용자']])for(const [key,name] of Object.entries({name:'조합명',representative:'대표자',business_number:'사업자번호',address:'주소',contact:'담당자',phone:'전화번호',email:'이메일'}))add(label+' · '+name,get(before,'terms.'+party+'.'+key),get(after,'terms.'+party+'.'+key));
  if(before.body!==after.body){
   const a=String(before.body||'').split(/\n\s*\n/),b=String(after.body||'').split(/\n\s*\n/);
   if(a.length*b.length>250000){add('계약 본문·위탁 별지',before.body,after.body);return changes;}
   const dp=Array.from({length:a.length+1},()=>new Uint32Array(b.length+1));
   for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
   let i=0,j=0,old=[],next=[],heading='계약 본문';
   const flush=()=>{if(old.length||next.length)changes.push({label:heading,before:old.join('\n\n'),after:next.join('\n\n')});old=[];next=[];};
   while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j]){flush();if(/^제\d+조|^별지/.test(a[i]))heading=a[i];i++;j++;}else if(i<a.length&&(j===b.length||dp[i+1][j]>=dp[i][j+1]))old.push(a[i++]);else next.push(b[j++]);}flush();
   if(!changes.some(x=>x.label==='계약 본문'||/^제\d+조|^별지/.test(x.label)))add('계약 본문·위탁 별지',before.body,after.body);
  }
  return changes;
 }
 function comparison(before,after,left='변경 전',right='변경 후'){
  const diffs=rows(before,after);return diffs.length?`<table class="service-diff-table"><thead><tr><th scope="col">항목</th><th scope="col">${esc(left)}</th><th scope="col">${esc(right)}</th></tr></thead><tbody>${diffs.map(x=>`<tr><th scope="row">${esc(x.label)}</th><td data-label="${esc(left)}">${esc(x.before)||'<span class="text-muted">없음</span>'}</td><td data-label="${esc(right)}">${esc(x.after)||'<span class="text-muted">없음</span>'}</td></tr>`).join('')}</tbody></table>`:'<p>변경된 내용이 없습니다.</p>';
 }
 function html(r){const p=r.pending_proposal,history=r.proposal_history||[];return `<section class="service-section service-collaboration"><h3 class="h5">수정안과 변경 내역</h3><div class="service-toolbar">${r.can_propose?`<button type="button" class="btn btn-primary" id="writeProposal">${p?'수정안 보완':'수정안 작성'}</button>`:''}<button type="button" class="btn btn-outline-secondary" id="showDraftHistory">저장본·전후 비교</button></div>${p?`<article class="service-proposal mt-3"><h4 class="h6">수정안 ${Number(p.proposal_no)} · ${esc(p.author_name)} · 확인 대기</h4><p>제${Number(p.base_revision)}판 기준 · ${esc(dates(p.created_at))}</p>${p.note?`<p class="service-note">${esc(p.note)}</p>`:''}<div class="service-toolbar"><button type="button" id="comparePendingProposal" class="btn btn-outline-primary">수정 전후 비교</button>${r.can_manage_proposals?'<button type="button" id="acceptProposal" class="btn btn-primary">수정안 반영</button><button type="button" id="editProposal" class="btn btn-outline-primary">수정해서 반영</button><button type="button" id="rejectProposal" class="btn btn-outline-secondary">반영하지 않음</button>':''}</div></article>`:''}${history.length?`<details class="service-review-history mt-3"><summary>주고받은 수정안 (${history.length}${history.length===20?'개 이상':''})</summary><div id="proposalHistoryRows">${proposalHistoryHtml(history)}</div>${history.length===20?'<button type="button" id="olderProposals" class="btn btn-outline-secondary">이전 수정안 더 보기</button>':''}</details>`:''}</section>`;}
 function proposalHistoryHtml(history){return history.map(p=>`<article class="service-review-entry"><h4 class="h6">수정안 ${Number(p.proposal_no)} · ${esc(names[p.status])}</h4><p>${esc(p.author_name)} · ${esc(dates(p.created_at))} · 제${Number(p.base_revision)}판 기준${p.accepted_revision?' → 제'+Number(p.accepted_revision)+'판':''}</p>${p.note?`<p class="service-note">${esc(p.note)}</p>`:''}${p.resolution_note?`<p class="service-note"><strong>확인 내용</strong><br>${esc(p.resolution_note)}</p>`:''}<button type="button" class="btn btn-outline-secondary" data-proposal-compare="${esc(p.id)}">변경 내용 보기</button></article>`).join('');}
 function dirty(){return Boolean(editorBase&&$('proposalDialog')?.open&&editorBaseline!==editorState());}
 function editorState(){return JSON.stringify([...$('proposalForm').querySelectorAll('input,textarea')].map(x=>[x.id,x.type==='checkbox'?x.checked:x.value]));}
 function closeEditor(){if(sending)return;if(dirty()&&!confirm('작성 중인 수정안을 버릴까요?'))return;$('proposalDialog').close();editorBase=null;editorBaseline='';}
 function openEditor(r){editorBase=structuredClone(r);editorProposal=r.pending_proposal?.id||null;const s=r.pending_proposal?.snapshot||r,t=s.terms;
  $('proposalEditor').innerHTML=`<p>제${Number(r.revision)}판을 기준으로 수정합니다.</p><div class="service-field-grid">${field('proposalTitle','계약 제목',s.title,'text','required maxlength="200"')}${field('proposalAnnual','연간 이용료 · 부가세 별도',t.annual_supply,'number','required min="0" max="100000000" step="1"')}${field('proposalStart','유료 서비스 개시일',t.start,'date','required')}${field('proposalEnd','유료 이용 종료일',t.end,'date','required')}${field('proposalFree','무료 제공 시작일',t.free_start,'date','max="2026-12-31"')}${field('proposalSetup','초기 설정비·범위',t.setup,'text','maxlength="1000"')}</div><label for="proposalSpecial" class="form-label mt-3">별도 합의</label><textarea id="proposalSpecial" class="form-control" rows="3" maxlength="2000">${esc(t.special)}</textarea><label for="proposalBody" class="form-label mt-3">계약 본문·개인정보 처리 위탁 별지</label><textarea id="proposalBody" class="form-control service-body-editor" required minlength="100" maxlength="180000">${esc(s.body)}</textarea><label for="proposalNote" class="form-label mt-3">수정 이유·전달할 내용 · 선택</label><textarea id="proposalNote" class="form-control" rows="3" maxlength="5000">${esc(r.pending_proposal?.note||'')}</textarea>`;
  $('proposalEditor').insertAdjacentHTML('afterbegin',`<section class="service-section"><label class="form-check"><input type="checkbox" id="proposalVillageEnabled" class="form-check-input" ${t.village_enabled?'checked':''}><span class="form-check-label">햇빛소득마을 이용</span></label><div class="mt-3">${field('proposalVillageFee','마을당 연간 이용료 · 부가세 별도',t.village_annual_supply||0,'number','min="0" max="100000000" step="1"')}</div>${r.amendment?field('proposalEffective','변경 적용일',t.change_effective_on,'date',`required min="${t.start}" max="${t.end}"`):''}</section>`);
  if(r.amendment){$('proposalStart').readOnly=true;$('proposalEnd').readOnly=true;}
  const toggle=()=>{$('proposalVillageFee').parentElement.hidden=!$('proposalVillageEnabled').checked;$('proposalVillageFee').required=$('proposalVillageEnabled').checked;};$('proposalVillageEnabled').onchange=toggle;toggle();
  $('proposalError').textContent='';$('proposalDialog').showModal();editorBaseline=editorState();$('proposalTitle').focus();
 }
 function editorSnapshot(){const t=structuredClone(editorBase.pending_proposal?.snapshot?.terms||editorBase.terms);t.start=$('proposalStart').value;t.end=$('proposalEnd').value;t.annual_supply=Number($('proposalAnnual').value);t.free_start=$('proposalFree').value||null;t.free_end=t.free_start?'2026-12-31':null;t.setup=$('proposalSetup').value;t.special=$('proposalSpecial').value;t.village_enabled=$('proposalVillageEnabled').checked;t.village_annual_supply=t.village_enabled?Number($('proposalVillageFee').value):0;if(editorBase.amendment)t.change_effective_on=$('proposalEffective').value;return {title:$('proposalTitle').value.trim(),terms:t,body:$('proposalBody').value};}
 async function compareProposal(id){const data=await api.rpc('proposal_get',{proposal_id:id},record.id);showComparison(data.before,data.after,'제'+data.proposal.base_revision+'판','수정안 '+data.proposal.proposal_no);}
 function showComparison(before,after,left,right){$('comparisonTitle').textContent=left+' → '+right;$('comparisonBody').innerHTML=comparison(before,after,left,right);$('comparisonDialog').showModal();}
 function bind(r,callbacks){record=r;api=callbacks;
  if($('writeProposal'))$('writeProposal').onclick=()=>openEditor(r);
  $('cancelProposal').onclick=closeEditor;$('proposalDialog').oncancel=e=>{e.preventDefault();closeEditor();};
  $('proposalForm').onsubmit=async e=>{e.preventDefault();if(sending||!$('proposalForm').reportValidity())return;sending=true;
   const controls=[...$('proposalForm').querySelectorAll('input,textarea,button')];controls.forEach(x=>x.disabled=true);
   try{await api.rpc('proposal_submit',{...editorSnapshot(),revision:editorBase.revision,review_id:editorBase.draft_reviews.find(x=>!x.superseded)?.id,expected_proposal_id:editorProposal,note:$('proposalNote').value.trim()},editorBase.id);
    const id=editorBase.id;editorBase=null;editorBaseline='';$('proposalDialog').close();await api.open(id,{discard:true});api.message('수정안을 보냈습니다. 제공자가 변경 내용을 확인해 반영합니다.','success');
   }catch(err){$('proposalError').textContent=api.errorText(err);}finally{sending=false;controls.forEach(x=>x.disabled=false);}
  };
  $('previewProposal').onclick=()=>{if($('proposalForm').reportValidity())showComparison(editorBase,editorSnapshot(),'현재 저장본','작성 중인 수정안');};
  $('closeComparison').onclick=()=>$('comparisonDialog').close();$('closeDraftHistory').onclick=()=>$('draftHistoryDialog').close();
  const compareButtons=()=>document.querySelectorAll('[data-proposal-compare]').forEach(b=>b.onclick=()=>api.task(()=>compareProposal(b.dataset.proposalCompare)));compareButtons();
  if($('olderProposals')){let cursor=r.proposal_history.at(-1).proposal_no;$('olderProposals').onclick=()=>api.task(async()=>{const older=await api.rpc('proposal_list',{before_no:cursor},r.id);$('proposalHistoryRows').insertAdjacentHTML('beforeend',proposalHistoryHtml(older));compareButtons();if(older.length)cursor=older.at(-1).proposal_no;if(older.length<20)$('olderProposals').hidden=true;});}
  if($('comparePendingProposal'))$('comparePendingProposal').onclick=()=>api.task(()=>compareProposal(r.pending_proposal.id));
  if($('acceptProposal'))$('acceptProposal').onclick=()=>api.task(async()=>{if(!api.allowDiscard())return;if(!confirm('이 수정안 전체를 새 계약 초안으로 반영할까요? 최신본은 다시 검토받아야 합니다.'))return;await api.rpc('proposal_resolve',{proposal_id:r.pending_proposal.id,revision:r.revision,decision:'accepted'},r.id);await api.open(r.id,{discard:true});api.message('수정안을 반영해 새 판으로 저장했습니다. 상대 담당자에게 최신본 검토를 요청해 주세요.','success');});
  if($('editProposal'))$('editProposal').onclick=()=>{if(api.allowDiscard()){api.useProposal(r.pending_proposal.snapshot);api.message('수정안을 편집 화면에 불러왔습니다. 내용을 조정한 뒤 초안을 저장해 주세요.');}};
  if($('rejectProposal'))$('rejectProposal').onclick=()=>{$('resolutionNote').value='';$('resolutionError').textContent='';$('resolutionDialog').showModal();};
  $('cancelResolution').onclick=()=>$('resolutionDialog').close();
  $('resolutionForm').onsubmit=e=>{e.preventDefault();api.task(async()=>{try{await api.rpc('proposal_resolve',{proposal_id:r.pending_proposal.id,revision:r.revision,decision:'rejected',note:$('resolutionNote').value.trim()},r.id);$('resolutionDialog').close();await api.open(r.id);api.message('미반영 의견을 보냈습니다. 수정안과 확인 내용은 내역에 남아 있습니다.','success');}catch(err){$('resolutionError').textContent=api.errorText(err);}});};
  $('showDraftHistory').onclick=()=>api.task(async()=>{
   let history=[...(r.draft_history||[])];const renderHistory=()=>{
    $('draftHistoryRows').innerHTML=history.map(v=>`<tr><th scope="row">제${Number(v.revision)}판</th><td>${esc(v.actor_name||'기존 저장본')}<br>${esc(dates(v.created_at))}<br>${esc(sources[v.source]||'저장본')}</td><td><button type="button" class="btn btn-outline-secondary" data-version="${Number(v.revision)}">현재 판과 비교</button></td></tr>`).join('');
    $('historyBefore').innerHTML=history.map(v=>`<option value="${Number(v.revision)}">제${Number(v.revision)}판</option>`).join('');if(history.length>1)$('historyBefore').value=history[1].revision;
    $('draftHistoryRows').querySelectorAll('[data-version]').forEach(b=>b.onclick=()=>api.task(async()=>showComparison(await api.rpc('history_get',{revision:Number(b.dataset.version)},r.id),r,'제'+b.dataset.version+'판','현재 제'+r.revision+'판')));
   };renderHistory();$('olderDrafts').hidden=history.length<20;$('draftHistoryDialog').showModal();
   $('compareDraftVersions').onclick=()=>api.task(async()=>showComparison(await api.rpc('history_get',{revision:Number($('historyBefore').value)},r.id),r,'제'+$('historyBefore').value+'판','현재 제'+r.revision+'판'));
   $('olderDrafts').onclick=()=>api.task(async()=>{const older=await api.rpc('history_list',{before_revision:history.at(-1).revision},r.id);history.push(...older);renderHistory();$('olderDrafts').hidden=older.length<20;});
  });
 }
 window.ServiceContractCollaboration={html,bind,dirty,comparison,rows};
})();
