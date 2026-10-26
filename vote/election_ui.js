/* Election UI 1.0.5. Static contextual help only: no Auth/data requests, voting, storage of drafts or edits. */
(function(root){
 'use strict';
 if(root.CoopElectionUI)return;
 const doc=root.document,page=doc.documentElement.dataset.electionUi,role=doc.documentElement.dataset.electionRole;
 const KEY='coop_workflow_help_visible_v1',fieldHelp=new WeakMap(),mobile=root.matchMedia?.('(max-width:767.98px)');
 const context={
  hub:[['.panel h1','선거·투표 관리','사람을 선출한다면 선거, 의견을 모으는 질문이라면 선호도 투표를 선택하세요. 설정 화면에서 일정·대상을 준비하고 관리 화면에서 진행·결과를 확인합니다. 관리 권한과 본인의 참여 자격은 구분되므로 선택한 선거·투표의 대상과 기간을 먼저 살펴보세요.']],
  admin_setup:[['#dashboard-section h2','선거 현황','기존 선거를 선택하면 저장한 일정·선거구·임기 설정을 이어서 확인할 수 있습니다. 새 선거를 만들기 전에 같은 회차가 이미 있는지 제목과 기간을 확인하세요. 정기선거·결선·보궐은 임기를 연결하는 방식이 다르므로 목적에 맞게 구분합니다.'],['#setup-section h2','선거 설정','기본 일정 → 선거구·선출 인원 → 선거인 명부 순서로 준비합니다. 실제 선거 공고의 대상·기간·정원과 비교하며 입력하세요. 선거인 배정은 지역구와 공통 선거구를 구분하고, 저장한 임기는 후보 신청에도 표시되므로 날짜를 함께 확인합니다.']],
  admin:[['#header-election-title','선거 진행 관리','현재 선거의 후보 승인·기호·선거인 명부를 확인하고 각 진행 단계를 처리합니다. 상단 선거명과 회차를 확인한 뒤 작업하세요. 투표 종료·개표·당선 결과 공포는 다른 단계이며, 안내 발송과 임원 명부 반영도 별도 확인을 거칩니다.']],
  poll_setup:[['.hero h1','선호도 투표 설정','질문·설명·선택지와 참여 기간을 작성합니다. 한 가지만 선택하게 할지 여러 의견을 받을지에 맞춰 최소·최대 선택 수를 정하세요. 초안의 내용을 검토한 뒤 대상자 확정·공개로 참여 대상을 준비합니다.']],
  poll_admin:[['.hero h1','선호도 투표 관리','목록에서 질문을 선택해 대상자·제출 현황·결과를 확인합니다. 이름이 비슷한 투표는 기간과 상태를 함께 보고 고르세요. 결과를 조회하는 것과 참여자에게 공개·안내하는 것은 별도이므로 설정된 공개 범위를 먼저 확인합니다.']],
  index:[['.hero h1','선거·투표 포털','참여할 선거 또는 선호도 투표를 고르는 입구입니다. 화면에 표시된 제목·기간·본인의 참여 상태를 확인하세요. 후보를 알아보려면 선거 안내로, 본인에게 허용된 기표를 하려면 해당 투표 화면으로 이동합니다.']],
  vote_login:[['#election-title','선거 안내','현재 선거와 선거구를 선택해 후보의 경력·공약을 비교할 수 있습니다. 동명이인이나 단체 후보가 있다면 표기명과 대표자도 함께 확인하세요. 투표하려면 본인의 선거권과 참여 기간을 확인한 뒤 투표소로 이동합니다.']],
  candidate_apply:[['#page-title','후보자 등록 신청','먼저 현재 프로필의 출마 선거·선거구·임기를 확인하세요. 후보 소개·공약·사진은 선거권자의 판단 자료가 되고 이력 증빙은 비공개 검토 자료로 사용됩니다. 입력과 첨부를 미리 본 뒤 각 동의 원문을 확인해 신청하며 접수와 최종 승인은 구분해 확인합니다.']],
  vote:[['#vote-container #election-title','투표 방법','상단의 선거·선거구와 이번에 선택할 수 있는 규칙을 먼저 확인하세요. 인물 투표는 후보를, 찬반 투표는 해당 의견을 고릅니다. 후보 선택만으로 제출이 끝난 것은 아니므로 마지막 확인창에서 기표 내용을 다시 확인한 뒤 제출 완료 안내를 확인하세요.']],
  poll_vote:[['#pollTitle','선호도 투표 방법','질문·설명을 읽고 화면의 최소·최대 선택 수에 맞춰 고르세요. 선택할 수 있는 수는 질문마다 다를 수 있습니다. 제출 후에는 완료 안내를 확인하고, 다시 제출이 허용된 투표라면 마지막 제출 내용이 반영된다는 점을 확인하세요.']],
  monitor:[['header h1','투표·개표 현황','투표 진행 중 참여 현황과 개표 후 결과를 구분해 보는 화면입니다. 선거명·회차·현재 상태를 먼저 확인하세요. 총 유권자와 참여 인원은 중복 없는 인원 기준으로 보고, 선거구별 수치를 단순히 더한 값과 구분합니다. 최종 당선 여부는 공포된 결과에서 확인합니다.']]
 };
 if(!context[page]||!['admin','member'].includes(role))return;
 const common={
  'announcement-date':["선거 공고일","선거 공고의 기준 날짜입니다. 실제 게시한 공고와 맞춰 입력하고 후보 등록·투표 시작보다 일정이 앞뒤로 어긋나지 않았는지 확인하세요. 후보자와 선거권자가 안내받는 일정의 근거가 됩니다."],
  'candidacy-start':["후보 등록 기간","후보 신청을 받을 시작·마감 시각입니다. 후보가 서류를 준비·제출할 수 있는 기간이므로 실제 공고한 일정과 일치하게 정하세요. 투표 기간과는 다른 단계이며 시작일뿐 아니라 마감 시각도 함께 확인합니다."],
  'vote-start':["투표 기간","선거권자가 실제 기표할 수 있는 시작·마감 시각입니다. 공고된 일정과 화면의 진행 상태를 함께 확인하세요. 후보 등록 기간을 입력하는 항목과 구분하고 선거구·명부 준비가 끝났는지도 살펴봅니다."],
  'dist-quota':["선출 인원","해당 선거구에서 선출할 정원입니다. 후보 수가 아니라 당선시킬 인원을 입력하세요. 공고한 인원·투표 유형과 함께 확인해야 후보 확정과 결과 검토의 기준을 맞출 수 있습니다."],
  'dist-type':["투표 유형","후보를 선택하는 인물 투표 또는 찬성·반대를 고르는 투표 중 공고한 방식을 선택합니다. 참여자가 보는 기표 방식에 영향을 주므로 선거구의 실제 운영과 맞춰 정하세요. 선출 인원과 후보 등록 대상도 함께 확인합니다."],
  'dist-is-common':["비례대표 선거구","지역구 선거인과 함께 참여할 공통·비례대표 선거구를 구분하는 설정입니다. 공통 선거구의 명부는 지역구와 중첩될 수 있습니다. 같은 사람을 별도 유권자로 더한 것으로 판단하지 말고 배정 대상을 대조하세요."],
  'target-district-select':["작업할 선거구","이후 추가·제외할 선거인 명부의 작업 대상을 고릅니다. 여러 선거구를 오갈 때는 현재 선택된 이름을 먼저 확인하세요. 명부에 추가할 사람과 공통 선거구 여부를 함께 대조한 뒤 작업합니다."],
  'detail-district-select':["선거구 변경","현재 선택한 선거인을 어느 선거구에 배정할지 정합니다. 변경할 사람의 이름·번호와 새 선거구를 함께 확인하세요. 지역구와 공통 선거구의 배정 성격이 다르므로 단순 중복으로 판단하지 않도록 구분합니다."],
  'add-voter-district-select':["배정 선거구","고른 조합원을 실제로 등록할 선거구입니다. 조합원을 선택하는 단계와 선거인 명부에 추가하는 단계는 다릅니다. 대상자와 선거구를 확인한 뒤 등록 결과의 명부를 대조하세요."],
  'add-new-district-type':["지역구 투표 유형","새 지역구에서 사용할 기표 방식을 정합니다. 후보를 고르는 인물 투표인지 찬성·반대를 고르는 투표인지 실제 공고와 맞춰 선택하세요. 정원과 후보 접수 대상도 함께 확인합니다."],
  'add-new-district-quota':["지역구 선출 인원","새 지역구에서 당선시킬 인원입니다. 현재 후보 수나 등록할 선거인 수를 입력하는 칸이 아닙니다. 공고한 정원과 투표 유형이 같은 기준인지 확인한 뒤 추가하세요."],
  'add-new-district-is-common':["공통 선거구 등록","지역구와 함께 참여할 수 있는 공통 선거구로 등록할 때 선택합니다. 비례대표 등 공고한 선거구의 성격에 맞춰 사용하세요. 명부를 동기화할 때 지역구와 겹치는 참여 대상을 함께 확인합니다."],
  'new-cand-district':["출마 선거구","후보가 실제 출마하는 선거구입니다. 선거인으로 투표할 지역구와 후보로 등록할 대상을 혼동하지 않도록 확인하세요. 선거명·후보 명의·선거구를 맞춘 뒤 나머지 후보 정보를 작성합니다."],
  'new-cand-name':["후보자 표기명","선거권자가 후보 목록과 기표 화면에서 확인할 이름·단체명입니다. 실제 후보를 알아볼 수 있는 표기인지 확인하세요. 단체 후보라면 단체명과 대표자명을 구분해 입력합니다."],
  'new-cand-representative-name':["단체 대표자","단체 후보를 대표하는 사람의 이름입니다. 투표 화면의 단체 표기명과는 다른 정보입니다. 단체의 실제 대표자와 일치하는지 확인하고 필요할 때 연결한 조합원 정보도 함께 대조하세요."],
  'new-cand-photo':["후보 사진","후보 소개에 공개할 사진입니다. 선거권자가 후보를 알아볼 수 있고 공개해도 되는 사진을 선택하세요. 비공개 이력 증빙과는 별도 자료이므로 두 첨부를 혼동하지 않도록 확인합니다."],
  'new-cand-proof':["이력 증빙","후보의 이력을 확인할 검토용 서류입니다. 공개할 사진·공약과 구분해 원래 증빙을 준비하세요. 제출할 내용과 서류의 대상자가 같은지 확인한 뒤 첨부합니다."],
  'pollDescription':["투표 설명","참여자가 판단하기 전에 읽을 질문의 배경과 기준입니다. 선택지만으로 뜻을 알기 어렵다면 대상·기간·질문의 목적을 짧게 설명하세요. 특정 응답을 오해하게 하지 않도록 선택지와 함께 읽어 보고 작성합니다."],
  'pollStartAt':["투표 시작 시각","투표에 참여할 수 있는 기간의 시작 시각입니다. 실제 안내할 일정과 종료 시각을 함께 확인하세요. 초안을 저장한 상태와 대상자를 확정해 공개한 상태도 구분합니다."],
  'pollEndAt':["투표 종료 시각","선호도 투표에 참여·재제출할 수 있는 마감 시각입니다. 시작 시각보다 뒤인지와 참여자에게 안내한 시간이 맞는지 확인하세요. 종료 후의 결과 조회와 공개 범위는 관리자 화면에서 확인합니다."],
  'pollMinChoices':["최소 선택 수","제출하려면 반드시 골라야 하는 최소 선택지 수입니다. 한 가지 이상을 요구하면 1, 두 가지를 요구하면 2처럼 질문 목적에 맞게 정하세요. 최대 선택 수와 선택지 개수보다 크지 않은지 확인합니다."],
  'pollMaxChoices':["최대 선택 수","한 번에 고를 수 있는 선택지 수의 상한입니다. 한 가지만 받는 질문이라면 최소·최대 모두 1로, 여러 의견을 받는 질문이라면 허용할 수로 정하세요. 참여자가 선택 방법을 이해할 수 있도록 설명과도 맞춥니다."],
  'election-select':["출마할 선거","본인이 후보로 출마할 선거를 고릅니다. 등록 가능한 기간과 현재 프로필을 확인하세요. 선거를 바꾸면 그 선거의 선거구·임기·기존 신청을 다시 확인한 뒤 작성합니다."],
  'rep-member-id':["단체 대표자 연결","단체 대표자가 등록된 조합원이면 조합원번호로 찾아 연결할 때 사용합니다. 같은 이름만 보고 고르지 말고 검색 결과가 실제 대표자인지 확인하세요. 단체 후보의 표기명과 대표 개인의 명의는 구분해 확인합니다."],
  'rep-name':["대표자 이름","단체 후보를 대표하는 사람의 실제 이름입니다. 선거권자에게 표시할 단체명과는 별도로 사용합니다. 대표자 연결을 했다면 검색한 정보와 입력한 이름이 일치하는지 대조하세요."],
  'cand-name':["후보자 표기명","선거권자가 후보 소개·투표 화면에서 확인할 이름·단체명입니다. 등록 명의와 다른 표현을 쓰더라도 누구인지 알아볼 수 있게 작성하세요. 단체 후보는 대표 개인의 이름을 단체명 대신 넣지 않도록 확인합니다."],
  'cand-photo':["프로필 사진","선택하면 선거권자에게 공개할 프로필 사진입니다. 최대 10MB이며 공개해도 되는 사진을 사용하세요. 제출용 이력 증빙과는 다른 자료이므로 미리보기에서 사진이 맞게 보이는지 확인합니다."],
  'cand-career':["대표 이력","후보 검토와 선거권자의 판단에 사용할 주요 경력입니다. 증빙 가능한 경력·활동을 중심으로 작성하세요. 제출할 이력 증빙과 내용이 일치하는지 확인하면 보완 요청을 줄이는 데 도움이 됩니다."],
  'cand-proof':["이력 증빙 서류","후보 자격·이력을 비공개로 검토하기 위한 필수 증빙입니다. 최대 10MB이며 공개 사진·공약과 별도로 선택합니다. 이력에 적은 대상·기간이 서류와 일치하는지 확인한 뒤 제출하세요."],
  'cand-manifesto':["공약 및 출마의 변","선거권자에게 공개할 공약과 출마 이유입니다. 하려는 일과 추진 방향을 알아보기 쉽게 정리하세요. 비공개 증빙의 내용이나 불필요한 연락처·개인정보가 본문에 섞이지 않았는지 미리보기에서 확인합니다."]
 };
 const actions={
  admin:[['[onclick="finalizeNomination()"]','후보 확정','후보별 승인 상태와 기호가 공고한 내용에 맞는지 확인한 뒤 후보 등록 단계를 마무리합니다. 보완 중인 신청이 있다면 먼저 확인하세요. 후보 확정과 실제 투표 시작은 다른 처리이므로 현재 선거의 단계를 대조한 뒤 진행합니다.'],['[onclick="openBallotBox()"]','개표함 열기','투표를 마친 뒤 선거구별 집계 결과를 확인하는 단계입니다. 현재 선거·회차와 종료 상태를 먼저 확인하세요. 개표 결과를 검토한 뒤 최종 당선 결과를 공포하는 절차와 구분해 진행합니다.'],['[onclick="previewAndSaveElectedOfficials()"]','당선자 등록','개표 결과의 당선자를 임원 관리에 반영할 때 사용합니다. 미리보기에서 대상자·직책·임기가 실제 선임 내용과 일치하는지 확인하세요. 결과 공포와 임원 명부 등록은 구분되므로 기존 명부와 중복되는 대상도 함께 살펴봅니다.'],['[data-business-event="vote_open"]','투표 시작 안내','현재 선거의 시작을 안내할 때 사용합니다. 발송 전 선거명·기간·수신 대상을 확인하세요. 선거 상태를 여는 처리와는 별도이며, 발송업체의 접수 상태와 조합원이 실제 확인한 상태도 구분해 살펴봅니다.'],['[data-business-event="vote_reminder"]','마감 안내','현재 선거에서 아직 투표하지 않은 대상자에게 마감을 안내합니다. 마감 시각과 현재 미투표 대상을 확인한 뒤 진행하세요. 이미 투표한 사람까지 같은 안내를 반복하지 않도록 최신 참여 현황을 함께 확인합니다.'],['[data-business-event="vote_published"]','결과 공개 안내','공개된 선거 결과를 대상자에게 안내할 때 사용합니다. 먼저 당선 결과가 공포된 상태인지와 안내할 선거·회차를 확인하세요. 결과를 공포하는 처리와 안내 발송은 별도이므로 최종 확인창의 대상도 함께 살펴봅니다.']],
  poll_setup:[['#btnPublish','대상자 확정·공개','현재 조합의 정상 조합원을 투표 대상으로 확정하고 참여할 내용을 공개하는 단계입니다. 질문·선택지·최소/최대 선택 수와 기간을 미리 검토하세요. 초안을 저장하는 단계와 다르므로 실제 참여 대상으로 삼을 명부가 맞는지도 확인합니다.']],
  candidate_apply:[['#agree-fact','사실 확인 서약','후보 이력과 제출 증빙이 실제 사실과 일치함을 확인하는 서약입니다. 경력·기간·대상자 정보를 증빙과 대조한 뒤 선택하세요. 체크하기 전에 아래 원문에서 확인해야 할 내용과 책임을 읽어 보세요.'],['#agree-privacy','개인정보 수집·이용','후보 접수·자격 확인·선거 운영을 위해 어떤 정보를 사용할지 확인하는 동의입니다. 아래 원문에서 수집 항목·목적·보유기간을 읽어 주세요. 공개되는 후보 정보의 동의와는 항목이 다르므로 각각 확인한 뒤 선택합니다.'],['#agree-publication','후보 정보 공개','선거권자가 후보를 판단할 수 있도록 소개·공약·제출한 사진 등 원문에 적힌 정보를 공개하는 동의입니다. 아래 공개 항목과 비공개 항목을 구분해 확인하세요. 공개할 본문·사진에 불필요한 개인정보가 섞이지 않았는지도 살펴봅니다.'],['#agree-conflict','이해충돌 방지 서약','후보 등록에 필요한 이해충돌 방지 기준을 확인하는 서약입니다. 아래 원문을 읽고 본인에게 해당하는 제한이나 확인 사항이 있는지 살펴보세요. 이력의 사실 확인·개인정보 동의와는 별도 내용이므로 각각 검토합니다.']]
 };
 function storedVisible(){try{const value=root.localStorage.getItem(KEY);if(value==='0'||value==='1')return value==='1';}catch{}return !mobile?.matches;}
 function read(){try{return root.CoopWorkflowHelp?root.CoopWorkflowHelp.visible():storedVisible();}catch{return storedVisible();}}
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
 root.CoopElectionUI=Object.freeze({version:'1.0.5',refresh,decorate});
 // Member pages share the existing display preference without loading ERP-specific page help.
 if(!root.CoopWorkflowHelp)root.CoopWorkflowHelp=Object.freeze({version:'election-1.0.5',visible:storedVisible,refresh});
 root.addEventListener('storage',e=>{if(e.key===KEY||e.key===null)refresh();});
 mobile?.addEventListener?.('change',()=>refresh());
 root.addEventListener('pageshow',()=>refresh());
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
