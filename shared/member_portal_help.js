/* Member portal help 1.0.3. Contextual unlink verification and profile explanations only. */
(function(root){
 'use strict';
 if(!/^\/membermanage(?:\.html)?\/?$/.test(root.location.pathname))return;
 const doc=root.document,CLASS='coop-workflow-help';
 if(doc.querySelector('script[data-member-help-ready]'))return;
 const entries=[
  ['profile','#profileSwitcher > button','after','프로필 선택',
   '누구의 정보를 보고 있나요?\n나(개인)·자녀·단체 중 선택한 명의의 정보와 출자금, 업무 신청을 확인합니다. 신청하거나 증명서를 열기 전 상단 이름을 먼저 확인하세요.\n\n가족·단체를 추가하려면\n아래 가족/단체 계정 관리에서 자녀 등록 또는 기존 계정 연결을 이용하세요. 퀴즈·게임의 내 기록은 프로필을 바꿔도 로그인한 본인 기준입니다.'],
  ['social','.social-link-state','after','카카오·네이버 로그인 연결',
   '다음 로그인에 사용할 계정이에요\n카카오·네이버 계정을 연결하면 해당 계정으로 로그인할 수 있습니다. 연결된 서비스는 아이콘으로 표시됩니다. 「로그인 방법 관리」에서 현재 연결을 확인하고 추가하거나 해제할 수 있습니다. 「연결 해제」를 누르면 필요한 이메일 인증이 열리고, 최종 확인 뒤 해제합니다.\n\n어느 프로필에서 연결하나요?\n본인 개인 계정에서 관리합니다. 다른 조합에도 같은 연결이 있으면 해당 서비스에 해제 영향을 안내합니다. 자녀·단체의 관리자 연결은 별도로 관리합니다.'],
  ['edit','.profile-edit-actions','after','정보 수정과 저장',
   '연락처가 바뀌었다면\n정보 수정을 누르면 상세 정보의 전화번호·주소·본인 계좌 등을 고칠 수 있습니다. 단체는 대표자·담당자와 등록번호도 확인하세요. 수정한 뒤 저장하고 화면의 결과를 확인합니다.\n\n취소와 닫기는 달라요\n취소는 현재 프로필에서 수정하던 값을 원래 값으로 돌립니다. 프로필을 잠시 바꿨다 돌아오는 경우에는 작성하던 내용을 이어서 확인할 수 있습니다. 변경한 값이 없으면 저장 요청을 보내지 않습니다.'],
  ['name','#summaryNameLabel','append','이름·단체명',
   '현재 선택한 명의입니다\n신청과 출자 내역, 증명서의 대상을 확인할 때 보는 이름입니다. 자녀나 단체를 관리한다면 상단 프로필과 함께 확인하세요.\n\n이름 자체를 바로잡아야 하나요?\n아래 정보 수정은 연락처·주소·계좌 등을 고치는 기능입니다. 가입한 이름이나 단체명이 잘못되어 있다면 조합 사무국에 문의해 주세요.'],
  ['email','#summaryEmailLabel','append','이메일 확인',
   '어느 주소가 표시되나요?\n개인·자녀 프로필은 등록된 이메일을 우선 표시합니다. 등록된 주소가 없으면 현재 로그인 계정의 이메일을 대신 보여 줍니다. 자녀 화면에 부모 이메일이 보이는 경우에는 이 대체 표시와 자녀에게 등록된 주소를 구분해 주세요.\n\n단체의 이메일\n단체는 등록된 담당자 이메일을 표시하고, 등록된 주소가 없으면 -로 표시합니다.\n\n로그인 연결과는 달라요\n카카오·네이버 연결 상태는 위의 서비스 아이콘에서 별도로 확인할 수 있습니다.'],
  ['birth','#personalInfoGroup > label','after','생년월일',
   '가입한 본인 정보인지 확인하세요\n현재 선택한 개인 또는 자녀의 생년월일입니다. 가족 이름이 비슷할 때 프로필과 함께 대조하면 대상을 구분하기 쉽습니다. 생년월일이 잘못되어 있다면 조합 사무국에 정정을 요청해 주세요.'],
  ['business','#viewBizNoBox','label','사업자·고유번호',
   '단체를 구분하는 등록 정보입니다\n사업자등록증이나 고유번호증에 적힌 10자리 번호를 확인합니다. 단체의 연락 담당자나 계정 관리자의 개인 정보가 아니라, 가입한 단체 자체의 번호를 입력하세요.\n\n법인등록번호와는 달라요\n아래 법인등록번호는 별도의 13자리 번호입니다. 두 번호를 서로 바꾸어 입력하지 않도록 원본 자료와 대조하세요.'],
  ['corporation','#viewCorpNoBox','label','법인등록번호',
   '법인인 경우 확인하는 번호입니다\n법인등기 자료의 13자리 번호를 입력합니다. 사업자·고유번호와는 별도 항목이므로 사업자번호를 이 칸에 다시 적지 마세요. 해당 번호가 없는 단체는 비워 둘 수 있습니다.'],
  ['representative','#viewRepresentativeNameBox','label','단체 대표자',
   '가입한 단체의 대표자입니다\n실제 대표자 성명을 입력합니다. 조합에서 가입·연락 업무를 맡는 담당자가 대표자와 다르다면 아래 담당자명과 역할에 따로 적어 주세요. 대표자명을 적는 것과 이 홈페이지의 단체 관리 계정을 연결하는 것은 별도 절차입니다.'],
  ['contact','#viewContactNameBox','label','단체 연락 담당자',
   '조합과 연락할 담당자입니다\n가입·출자금 등 단체 관련 문의를 실제로 주고받을 분을 적습니다. 담당자 연락처·이메일도 그 업무를 확인할 수 있는 정보인지 함께 살펴보세요. 이 이름만 바꾸어 단체 계정 관리자가 변경되지는 않습니다.'],
  ['role','#viewContactPositionBox','label','담당자 직함·역할',
   '어떤 일을 맡고 있는지 알려 주세요\n대표·사무국장·회계담당 등 실제 연락 업무의 직함이나 역할을 적습니다. 조합 사무국이 단체에 연락할 때 담당 업무를 구분하는 정보이며, ERP나 단체 계정의 사용 권한을 부여하는 설정은 아닙니다.'],
  ['address','#viewAddressBox','label','주소 검색과 상세 주소',
   '주소를 옮겼다면\n정보 수정에서 주소 검색으로 도로명·지번 주소를 선택하고, 동·호수 등은 상세 주소에 이어 적습니다. 검색 결과를 고른 뒤 두 칸을 함께 확인하고 저장하세요. 다른 프로필의 주소를 수정하지 않도록 상단 이름도 확인합니다.'],
  ['telegram','#memberTelegramCard > summary','append','텔레그램 알림 연결',
   '이 조합의 본인 알림을 받으려면\n연결하기 → 텔레그램 열기 → 봇의 시작 버튼 순서로 진행하고, 돌아와 연결 확인을 눌러 주세요. 연결하기만 누른 상태와 실제 연결 완료는 다릅니다.\n\n이미 ERP에서 연결했나요?\n같은 조합의 본인 ERP 계정과 이 연결을 함께 사용합니다. 여기서 연결을 해제하면 ERP에서도 해제됩니다. 이 설정은 본인 프로필에서 제공되며 카카오·네이버 로그인 연결과는 별개입니다.'],
  ['capital','#assetSummaryRow > :first-child .count-title','append','납입 출자금과 상세 내역',
   '이미 반영된 금액입니다\n총 납입 출자금은 실제 입금이 반영된 출자금입니다. 추가 출자를 신청한 금액과는 다를 수 있으니 신청 후에는 반영 내역도 확인하세요.\n\n입금별로 확인하려면\n출자금 카드를 누르면 상세 내역이 열립니다. 입금했는데 아직 반영되지 않았다면 입금일·금액·입금자명을 확인해 조합 사무국에 문의해 주세요.'],
  ['certificate','#memberContributionCertificateTitle','append','출자 증명서',
   '출자금을 증명하는 문서입니다\n업무 신청 → 증명서 발급 → 증명서 보기에서 현재 납입이 반영된 출자금을 확인합니다. 신청만 하고 아직 납입이 반영되지 않은 금액은 증명할 수 없습니다.\n\n출력하기 전에\n미리보기에서 이름·조합원번호·금액·조합 정보를 확인한 뒤 인쇄하거나 PDF로 저장하세요. 단체의 출자 증명서는 등록된 단체 관리자만 발급할 수 있습니다.'],
  ['membership','#tabCert h6:not(#memberContributionCertificateTitle)','append','조합원 확인서',
   '출자 증명서와 무엇이 다른가요?\n조합원 확인서는 발급일 현재 해당 조합의 조합원임을 확인하는 문서입니다. 출자금액을 증명해야 한다면 위의 출자 증명서를 이용하세요.\n\n확인하고 출력하세요\n현재 선택한 프로필을 확인한 뒤 조합원 확인서 보기를 누르세요. 미리보기에서 성명·조합원번호·가입일과 조합 정보를 살핀 뒤 인쇄하거나 PDF로 저장할 수 있습니다.'],
  ['timeline','#timelineList','heading','활동·신청 처리 내역',
   '신청 후에는 여기서 확인하세요\n현재 프로필의 출자·업무 신청 등 활동과 처리 상태를 시간순으로 확인합니다. 신청이 접수된 것, 승인된 것, 실제 입금·반환이 반영된 것은 서로 다른 단계입니다.\n\n수정 버튼이 보인다면\n해당 신청에서 허용하는 내용만 수정할 수 있습니다. 이미 처리된 신청의 작성 중 초안은 원래 신청에 다시 저장하지 않고 확인하거나 버릴 수 있습니다.'],
  ['family','#memberFamilyAccountCard h5','append','가족·단체 계정 관리',
   '새로 가입시키나요, 기존 계정을 연결하나요?\n추가를 누른 뒤 미성년 자녀의 신규 가입은 자녀 등록에서, 이미 가입한 자녀·단체는 기존 계정 연결에서 찾습니다. 같은 사람을 다시 등록하지 않도록 먼저 확인하세요.\n\n연결 후에는\n관리 연결이 완료되면 상단 프로필에서 선택해 해당 명의의 정보를 확인할 수 있습니다. 성인 가족 간 계정 관리는 지원하지 않습니다.'],
  ['connect','#famTabConnect > .alert','append','기존 자녀·단체 계정 연결',
   '이미 가입한 대상을 찾습니다\n단체는 단체명이나 조합원번호로, 미성년 자녀는 이름과 생년월일을 함께 입력해 검색하세요. 결과의 이름을 확인한 뒤 그 대상에게 연결을 신청합니다.\n\n신청과 연결 완료는 달라요\n검색 결과를 선택하거나 연결을 신청한 것만으로 즉시 관리자가 되지는 않습니다. 처리 상태를 확인하고 연결이 완료된 프로필을 선택해 이용하세요.'],
  ['child-identity','#newFamRrn1','group-label','자녀 본인 정보',
   '자녀의 정보로 작성합니다\n자녀의 생년월일과 주민등록번호를 입력하고 법정대리인과의 관계를 확인하세요. 이 정보는 자녀의 가입 및 동의서 작성에 사용되므로 부모 정보와 바꾸어 적지 않도록 원자료와 대조합니다.\n\n동의서에서 한 번 더 확인하세요\n정보 확인 및 동의서 작성을 누르면 입력 내용으로 동의서를 준비합니다. 동의창에 나온 자녀 이름·관계·출자 약정금액을 살핀 뒤 진행하세요.'],
  ['modify','#modLabelAmount','after','신청 금액 수정',
   '기존 금액과 작성 금액을 비교하세요\n현재 신청에 기록된 금액과 바꾸려는 금액은 구분해서 표시됩니다. 이번에 수정하려는 신청과 금액이 맞는지 확인한 뒤 저장하세요.\n\n다시 열었을 때\n작성 중인 값은 해당 신청의 초안으로 남습니다. 그 사이 신청이 처리되어 수정할 수 없게 되면 초안을 읽기 전용으로 확인하거나 버릴 수 있습니다.']
 ];
 function anchorFor(entry){
  const node=doc.querySelector(entry[1]);
  if(entry[2]==='label')return node?.parentElement.querySelector('label');
  if(entry[2]==='group-label')return node?.parentElement.parentElement.querySelector('label');
  if(entry[2]==='heading')return node?.parentElement.querySelector('h5');
  return node;
 }
 function decorate(){
  if(!root.CoopWorkflowHelp||!root.CoopDialog)return;
  for(const entry of entries){
   const [key,,placement,title,text]=entry,anchor=anchorFor(entry);
   if(!anchor||anchor.closest('.coop-dialog')||doc.querySelector('[data-member-help="'+key+'"]'))continue;
   const b=doc.createElement('button');b.type='button';b.className=CLASS;
   b.textContent='?';b.dataset.memberHelp=key;b.dataset.workflowHelpOptional='';
   b.setAttribute('aria-label',title+' 도움말');b.setAttribute('title',title+' 도움말');b.setAttribute('aria-haspopup','dialog');
   b.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    if(!root.CoopWorkflowHelp.visible())return;
    b.focus({preventScroll:true});
    void root.CoopDialog.alert(root.CoopWorkflowHelp.format(text),{title:title+' 도움말'});
   });
   if(placement==='after'||placement==='label'||placement==='group-label')anchor.after(b);else anchor.append(b);
  }
 }
 function start(){
  const script=doc.querySelector('script[src*="/shared/member_portal_help.js"]');
  if(script)script.dataset.memberHelpReady='';
  const style=doc.createElement('style');style.id='member-portal-help-style';
  style.textContent='#profileSwitcher{white-space:nowrap}.profile-action-bar:not(:has(#btnLinkKakao:not(.hidden):not([hidden]),#btnLinkNaver:not(.hidden):not([hidden]),.social-linked-chip:not(.hidden):not([hidden]))) > [data-member-help="social"]{display:none!important}';
  doc.head.append(style);
  decorate();
  // Only labels/summary cards that the existing renderer replaces need redecorating.
  const targets=['summaryNameLabel','summaryEmailLabel','assetSummaryRow','memberContributionCertificateTitle'];
  const observer=new MutationObserver(records=>{
   if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===3||(n.nodeType===1&&!n.matches('.'+CLASS)))))decorate();
  });
  targets.forEach(id=>{const node=doc.getElementById(id);if(node)observer.observe(node,{childList:true,subtree:true});});
 }
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
