/* Election UI 1.0.3. Static contextual help only: no Auth/data requests, voting, storage of drafts or edits. */
(function(root){
 'use strict';
 if(root.CoopElectionUI)return;
 const doc=root.document,page=doc.documentElement.dataset.electionUi,role=doc.documentElement.dataset.electionRole;
 const KEY='coop_workflow_help_visible_v1',fieldHelp=new WeakMap();
 const context={
  hub:[['.panel h1','선거·투표 관리','임원·대의원을 선출하는 선거와 의견을 모으는 선호도 투표를 구분해 선택합니다. 설정 화면에서 준비하고 관리 화면에서 진행 상태를 확인합니다.']],
  admin_setup:[['#dashboard-section h2','선거 현황','진행 중인 선거를 골라 기존 설정을 이어서 확인하거나 새 선거를 준비합니다.'],['#setup-section h2','선거 설정','기본 일정 → 선거구·선출 인원 → 선거인 명부 순서로 준비합니다. 각 단계에서 저장한 내용과 실제 공고를 대조하세요.']],
  admin:[['#header-election-title','선거 진행 관리','선택한 선거의 후보·선거인 명부와 진행 단계를 확인합니다. 투표 시작·종료, 개표와 결과 공포는 서로 다른 처리입니다.']],
  poll_setup:[['.hero h1','선호도 투표 설정','질문과 선택지·선택 가능한 수·기간을 준비합니다. 초안을 저장한 뒤 대상자 확정·공개를 진행합니다.']],
  poll_admin:[['.hero h1','선호도 투표 관리','목록에서 투표를 골라 대상자·제출 현황·결과를 확인합니다. 결과 조회와 조합원 안내 발송은 별도 작업입니다.']],
  index:[['.hero h1','선거·투표 포털','참여할 선거 또는 선호도 투표를 선택합니다. 표시되는 기간·참여 상태를 확인하고 해당 화면으로 이동하세요.']],
  vote_login:[['#election-title','선거 안내','선거구를 선택해 후보의 경력·공약을 확인합니다. 투표 기간과 본인의 참여 자격을 확인한 뒤 투표소에 입장합니다.']],
  candidate_apply:[['#page-title','후보자 등록 신청','출마할 선거와 선거구를 확인하고 이력·증빙·공약과 동의 항목을 작성합니다. 공개할 정보와 비공개 증빙을 구분해 확인하세요.']],
  vote:[['#vote-container #election-title','투표 방법','현재 선거구와 화면에 표시된 선택 규칙을 확인한 뒤 후보 또는 찬반을 선택합니다. 마지막 확인창에서 기표 내용을 다시 확인하고 제출하세요.']],
  poll_vote:[['#pollTitle','선호도 투표 방법','화면에 표시된 최소·최대 선택 수와 기간에 맞춰 선택한 뒤 제출합니다. 다시 제출할 수 있는 투표는 마지막 제출 내용이 반영됩니다.']],
  monitor:[['header h1','투표·개표 현황','투표율과 개표 결과를 구분해 표시합니다. 표시 중인 선거·회차·상태를 먼저 확인하세요. 공개 여부는 해당 선거의 기존 권한과 진행 상태를 따릅니다.']]
 };
 if(!context[page]||!['admin','member'].includes(role))return;
 const common={
  'announcement-date':['선거 공고일','선거 공고에 게시할 기준 날짜입니다. 후보 등록·투표 기간과 함께 실제 공고 내용에 맞춰 설정하세요.'],
  'candidacy-start':['후보 등록 기간','후보자가 신청할 수 있는 시작·마감 시각입니다. 투표 기간과 구분하고 공고한 일정과 맞춰 주세요.'],
  'vote-start':['투표 기간','선거권자가 실제 투표에 참여할 기간입니다. 시작·마감 시각과 진행 상태를 함께 확인하세요.'],
  'dist-quota':['선출 인원','이 선거구에서 선출할 인원입니다. 후보 수와 투표 유형을 함께 확인하세요.'],
  'dist-type':['투표 유형','인물 투표는 후보를 선택하고 찬반 투표는 찬성·반대를 선택합니다. 해당 선거구의 공고와 맞게 선택하세요.'],
  'dist-is-common':['비례대표 선거구','지역구에 배정된 조합원을 공통 선거구에도 포함할 수 있는 설정입니다. 일반 지역구의 중복 배정과 구분합니다.'],
  'target-district-select':['작업할 선거구','이후 추가·제외할 선거인 명부의 대상입니다. 작업 전에 현재 선거구를 확인하세요.'],
  'detail-district-select':['선거구 변경','선택한 선거인의 배정 대상을 변경합니다. 저장 전에 대상 선거인과 선거구를 확인하세요.'],
  'add-voter-district-select':['배정 선거구','선택한 조합원을 등록할 선거구입니다. 조합원 선택만 한 상태와 명부에 등록한 상태는 다릅니다.'],
  'add-new-district-type':['지역구 투표 유형','추가할 지역구에서 후보 선택 또는 찬반 중 어떤 방식으로 투표할지 정합니다.'],
  'add-new-district-quota':['지역구 선출 인원','추가할 지역구에서 선출할 인원입니다. 공고한 인원과 일치하는지 확인하세요.'],
  'add-new-district-is-common':['공통 선거구 등록','지역구와 함께 참여할 수 있는 공통 선거구로 설정합니다. 명부 동기화 전에 대상을 확인하세요.'],
  'new-cand-district':['출마 선거구','등록할 후보가 출마하는 선거구입니다. 조합원의 선거권 배정과 후보의 출마 대상을 구분해 확인하세요.'],
  'new-cand-name':['후보자 표기명','투표 화면에서 선거권자가 확인할 후보 이름·단체명입니다. 실제 후보와 일치하게 입력하세요.'],
  'new-cand-representative-name':['단체 대표자','단체 후보의 대표자 이름입니다. 후보로 표시할 단체명과 구분합니다.'],
  'new-cand-photo':['후보 사진','선거권자에게 공개될 후보 사진입니다. 공개해도 되는 사진을 선택하세요.'],
  'new-cand-proof':['이력 증빙','후보 이력을 검토할 서류입니다. 공개 사진·공약과 구분하여 준비하세요.'],
  'pollDescription':['투표 설명','참여자가 선택 전에 확인할 질문의 배경·판단 기준입니다. 선택지와 함께 읽어도 뜻이 명확하도록 작성하세요.'],
  'pollStartAt':['투표 시작 시각','참여 가능한 기간의 시작입니다. 종료 시각과 함께 확인하고 초안 저장·공개를 구분하세요.'],
  'pollEndAt':['투표 종료 시각','참여·재제출이 가능한 마감 시각입니다. 결과는 종료 후 관리자 화면에서 확인합니다.'],
  'pollMinChoices':['최소 선택 수','제출하려면 적어도 골라야 하는 선택지 수입니다. 최대 선택 수와 전체 선택지 수를 함께 확인하세요.'],
  'pollMaxChoices':['최대 선택 수','한 번에 고를 수 있는 선택지 수입니다. 최소 선택 수보다 작지 않게 설정하세요.'],
  'election-select':['출마할 선거','등록 기간인 선거를 선택해 본인의 선거구와 기존 신청을 확인합니다.'],
  'rep-member-id':['단체 대표자 연결','대표자가 조합원이면 조합원 번호로 찾아 연결합니다. 검색 결과의 본인 여부를 확인하세요.'],
  'rep-name':['대표자 이름','단체 후보를 대표하는 사람의 이름입니다. 단체의 후보 표기명과 구분합니다.'],
  'cand-name':['후보자 표기명','선거권자가 투표 화면에서 확인할 이름·단체명입니다. 등록 명의와 다른 표현을 쓸 때에는 알아보기 쉽게 작성하세요.'],
  'cand-photo':['프로필 사진','선택 사항이며 제출하면 선거권자에게 공개됩니다. 최대 10MB이며 이력 증빙과 별도로 선택합니다.'],
  'cand-career':['대표 이력','후보 검토와 선거권자의 판단에 사용할 주요 경력입니다. 증빙할 수 있는 내용을 중심으로 작성하세요.'],
  'cand-proof':['이력 증빙 서류','비공개 검토용 필수 서류입니다. 최대 10MB이며 공개 프로필 사진과 구분합니다.'],
  'cand-manifesto':['공약 및 출마의 변','선거권자에게 공개할 공약과 출마 이유입니다. 공개 전에 연락처 등 불필요한 개인정보가 포함되지 않았는지 확인하세요.']
 };
 const actions={
  admin:[['[onclick="finalizeNomination()"]','후보 확정','후보 승인과 기호를 확인한 뒤 등록 단계를 마무리합니다. 투표 시작 처리와는 별도입니다.'],['[onclick="openBallotBox()"]','개표함 열기','투표 종료 후 집계 결과를 확인하는 단계입니다. 개표 결과 확인과 최종 공포를 구분하세요.'],['[onclick="previewAndSaveElectedOfficials()"]','당선자 등록','개표 결과의 당선자를 임원 관리에 반영하기 전에 대상·직책·임기를 확인합니다.'],['[data-business-event="vote_open"]','투표 시작 안내','현재 선거의 시작 안내를 대상자에게 발송하는 작업입니다. 선거 상태 변경과 별도로 확인 후 진행합니다.'],['[data-business-event="vote_reminder"]','마감 안내','현재 선거의 미투표자를 대상으로 마감 안내를 발송하는 작업입니다.'],['[data-business-event="vote_published"]','결과 공개 안내','결과 공개 후 대상자에게 안내를 발송하는 작업입니다. 결과 공포 처리와 구분합니다.']],
  poll_setup:[['#btnPublish','대상자 확정·공개','현재 조합의 정상 조합원을 투표 대상으로 확정해 공개합니다. 초안 저장만 한 상태와 구분하세요.']],
  candidate_apply:[['#agree-fact','사실 확인 서약','입력한 후보 이력과 제출 증빙의 사실 여부를 확인하는 동의입니다. 서약 원문을 읽고 선택하세요.'],['#agree-privacy','개인정보 수집·이용','후보 등록을 위해 수집·이용하는 정보와 목적을 확인합니다. 아래 동의 원문의 항목을 읽고 선택하세요.'],['#agree-publication','후보 정보 공개','선거권자에게 공개할 후보 정보의 범위를 확인하는 동의입니다. 비공개 증빙 제출 동의와 구분합니다.'],['#agree-conflict','이해충돌 방지 서약','후보 등록에 필요한 이해충돌 방지 서약의 내용을 확인합니다. 원문을 읽고 선택하세요.']]
 };
 function storedVisible(){try{return root.localStorage.getItem(KEY)!=='0';}catch{return true;}}
 function read(){try{return root.CoopWorkflowHelp?root.CoopWorkflowHelp.visible():storedVisible();}catch{return true;}}
 function refresh(value){doc.documentElement.toggleAttribute('data-workflow-help-off',typeof value==='boolean'?!value:!read());}
 function format(text){return root.CoopWorkflowHelp?.format?root.CoopWorkflowHelp.format(text):String(text??'').trim().replace(/([.!?])\s+(?=\S)/gu,'$1\n\n').split(/\n{2,}/u).filter(Boolean).map((line,i)=>(i===0?'💡 ':'• ')+line).join('\n\n');}
 function help(key,title,text){
  const b=doc.createElement('button');b.type='button';b.className='coop-workflow-help election-help';b.textContent='?';
  b.dataset.electionHelp=key;b.dataset.workflowHelpOptional='';b.dataset.erpQueryControl='';
  b.setAttribute('aria-label',title+' 도움말');b.title=title+' 도움말';b.setAttribute('aria-haspopup','dialog');
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(!read())return;b.focus({preventScroll:true});void root.CoopDialog?.alert(format(text),{title:title+' 도움말'});});return b;
 }
 function adjacent(node,key,title,text){
  if(!node||node.type==='hidden'||node.parentElement?.closest('button,a'))return;
  if(node.matches('input[type="checkbox"],input[type="radio"]')&&node.closest('label'))node=node.closest('label');
  if(node.nextElementSibling?.matches('.coop-workflow-help,.home-field-help'))return node.nextElementSibling;
  const b=help(key,title,text);node.after(b);return b;
 }
 function decorate(){
  context[page].forEach(([selector,title,text],i)=>{
   const heading=doc.querySelector(selector);if(!heading||heading.closest('.election-heading-row'))return;
   const row=doc.createElement('div');row.className='election-heading-row';row.dataset.electionContext=String(i);
   heading.before(row);row.append(heading,help('page-'+i,title,text));
  });
  Object.entries(common).forEach(([id,[title,text]])=>{
   const control=doc.getElementById(id);if(!control?.matches('input,select,textarea')||control.type==='hidden')return;
   if(fieldHelp.get(control)?.isConnected)return;
   let label=Array.from(control.labels||[])[0]||control.closest('label');
   if(!label){const group=control.closest('.form-group');label=group?.querySelector('label');}
   let previous=control.previousElementSibling;
   while(previous?.matches('.coop-workflow-help,.home-field-help'))previous=previous.previousElementSibling;
   if(!label&&previous?.matches('label'))label=previous;
   const b=adjacent(label||control,'field-'+id,title,text);if(b)fieldHelp.set(control,b);
  });
  (actions[page]||[]).forEach(([selector,title,text],i)=>adjacent(doc.querySelector(selector),'action-'+i,title,text));
 }
 function start(){
  refresh();decorate();let queued=false;
  new MutationObserver(records=>{
   if(queued||!records.some(r=>!r.target.closest?.('.election-heading-row,.election-help,.coop-dialog')&&Array.from(r.addedNodes).some(n=>n.nodeType===1&&!n.matches('.election-heading-row,.election-help,.coop-dialog'))))return;
   queued=true;root.queueMicrotask(()=>{queued=false;decorate();});
  }).observe(doc.body,{childList:true,subtree:true});
 }
 root.CoopElectionUI=Object.freeze({version:'1.0.3',refresh,decorate});
 // Member pages share the existing display preference without loading ERP-specific page help.
 if(!root.CoopWorkflowHelp)root.CoopWorkflowHelp=Object.freeze({version:'election-1.0.3',visible:storedVisible,refresh});
 root.addEventListener('storage',e=>{if(e.key===KEY||e.key===null)refresh(e.newValue!=='0');});
 root.addEventListener('pageshow',()=>refresh());
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
