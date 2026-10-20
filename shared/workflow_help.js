/* Workflow help 1.0.2. Presentation only: one local display preference, no business reads/writes. */
(function(root){
 'use strict';
 if(root.CoopWorkflowHelp)return;
 const doc=root.document,KEY='coop_workflow_help_visible_v1',CLASS='coop-workflow-help',seen=new WeakMap();
 const pages={
  admin_member:['조합원·홈페이지 관리','조합원 정보와 신청 처리는 조합원 관리에서, 공개 홈페이지의 글·사진은 홈페이지 관리에서 다룹니다. 홈페이지는 미리보기로 확인한 뒤 변경사항을 저장합니다. 가입 안내·약관은 초안 저장과 등록·적용을 구분합니다.'],
  admin_employee:['직원 관리·조합 설정','직원 관리에서는 직원·급여·휴가를, 조합 설정에서는 조합 기본정보와 업무 운영 기준을 다룹니다. 권한 설정은 권한 담당자가, 기본 업무 권한은 조합 전체 관리자가 변경합니다.'],
  accounting:['회계 관리','실제 거래에 맞는 업무별 입력을 먼저 선택하세요. 날짜·금액·계정과 증빙을 확인한 뒤 저장합니다. 자동 연동한 거래는 원래 업무의 처리 상태와 전표를 함께 확인하면 중복 입력을 줄일 수 있습니다.'],
  approval:['전자결재','결재 구분을 고르고 제목·결재선·참조·내용·첨부를 확인한 뒤 미리보기와 상신으로 진행합니다. 승인 대기에서는 처리할 문서를, 결재 이력에서는 지난 문서를 찾습니다.'],
  mypage:['마이페이지','내 정보·급여 명세서·휴가 내역·증명서와 계약서를 확인합니다. 도움말 표시는 이 화면에서 켜고 끌 수 있으며 같은 브라우저의 업무 화면에도 적용됩니다.'],
  participation:['교육·행사와 회의 참석','행사를 찾은 뒤 상세에서 참석자·교육 내용·자료와 사진을 확인합니다. 검색 조건은 목록을 찾는 데 쓰이고, 참석 기록 수정은 별도로 저장합니다.'],
  participation_analytics:['조합원 참여 현황','기간과 행사 조건에 따라 참여 내역을 비교합니다. 집계 대상과 조회 기간을 먼저 확인하면 서로 다른 기간의 수치를 혼동하지 않을 수 있습니다.'],
  governance:['회의·문서·서명','회의 준비와 의사록 작성, 자료집과 문서 관리, 전자서명 관리로 연결됩니다. 회의 꾸러미에서는 같은 회의의 자료를 순서대로 준비할 수 있습니다.'],
  meeting_workspace:['회의 꾸러미','회의 기본정보와 안건을 준비하고 자료집·의사록으로 이어갑니다. 자료집에 넣을 메모와 비공개 준비 메모를 구분하고 완료·서명 전에 문서를 확인하세요.'],
  admin_minutes:['의사록·자료집 관리','회의 기록과 자료집을 작성하고 검색합니다. 참석자와 전자서명 대상은 실제 회의 기록에 맞게 고르고, 완료·서명된 문서는 현재 잠금 상태를 확인하세요.'],
  minutes_view:['문서함','분류를 선택해 공지·공문·의사록을 찾습니다. 문서를 선택하면 본문과 첨부를 확인할 수 있으며, 문서별 열람 범위에 따라 보이는 목록이 달라집니다.'],
  employment_contracts:['근로계약서','직접 작성하거나 서명한 외부 계약서를 등록합니다. 계약의 적용일과 구조화된 급여·근로시간 조건은 이후 급여와 휴가 계산의 근거이므로 원본과 맞는지 확인하세요.'],
  hr_insurance:['4대보험 서류','직원의 취득·상실 등 신고 자료를 준비하고 공식 서식으로 출력합니다. 준비·출력한 서류와 실제 기관에 제출한 결과를 구분해 관리하세요.'],
  officials_admin:['임원 관리','임원 직책·임기·등기 여부와 종료 이력을 관리합니다. 선거 결과에서 불러온 대상도 실제 의결과 임기를 확인한 뒤 등록합니다.'],
  officials_signature_admin:['임원 전자서명','임원별 서명할 문서와 요청 상태를 확인합니다. 서명 요청 전에 대상자와 문서가 맞는지 확인하고, 요청 접수와 본인 서명 완료를 구분하세요.'],
  vote_hub:['선거·투표 관리','임원 선거와 일반 투표의 관리 화면으로 이동합니다. 선거별 선거구·후보·선거권자와 일반 투표의 선택 수·결과 공개 기준을 각각 확인하세요.'],
  admin:['선거 관리','선거구·후보·선거권자를 준비한 뒤 공고·투표 기간에 맞춰 진행합니다. 진행 중인 선거의 대상과 상태를 먼저 확인하세요.'],
  admin_setup:['선거 설정','선거 일정과 선거구별 선출 인원·투표 유형을 정합니다. 후보 등록 기간과 투표 기간이 실제 선거 공고와 일치하는지 확인하세요.'],
  poll_admin:['일반 투표 관리','투표 대상과 진행 상태를 확인합니다. 결과 공개 범위와 마감 상태를 확인한 뒤 공개·안내 절차를 진행하세요.'],
  poll_setup:['일반 투표 설정','질문·선택지·최소/최대 선택 수와 기간을 정합니다. 선택할 수 있는 수를 명확히 하면 참여자가 응답 방법을 이해하기 쉽습니다.'],
  quiz_admin:['퀴즈 관리','문제·선택지·정답·해설과 공개 상태를 관리합니다. 선택지를 바꿀 때 정답 연결도 함께 확인하고 참고 자료의 확인일을 남기면 이후 내용 검토에 도움이 됩니다.'],
  festival_receipts:['매출·재고 관리','전체 축제 매출에서는 보고 싶은 기간을 골라 조회해 보세요. 아래에서 축제를 선택하면 해당 축제의 판매·재고·현금영수증을 관리할 수 있어요. 판매·무료 사용·폐기·실사 조정을 구분하면 남은 수량을 맞추기 쉬워요.'],
  service_contracts:['이용계약·청구서','내부 초안을 준비한 뒤 검토 요청·내부 결재·대표자 서명 순서로 진행합니다. 청구서 발행과 실제 입금 확인은 다른 단계이므로 현재 상태를 확인하세요.'],
  permissions:['업무 권한 관리','조합의 기본 업무 권한과 직원별 사용 설정을 구분합니다. 기본 권한 따름은 조합의 역할·직급 기준을 사용하고, 개별 사용·사용 안 함은 해당 직원의 별도 설정입니다.'],
  initial_setup:['조합 초기 설정','한시적으로 위임받은 범위에서 홈페이지·기본정보·출자 기준·납입계좌·직인을 준비합니다. 유효기간이 끝나면 임시 설정 권한을 사용할 수 없습니다.'],
  audit_logs:['감사 로그','조합의 업무 처리와 접근 기록을 기간·조건으로 찾습니다. 현재 조회 대상과 처리 결과를 함께 확인하면 같은 업무의 반복 실행과 실패를 구분하기 쉽습니다.'],
  power_monitor_admin:['발전소 모니터링','담당 발전소와 수집 연결 상태를 확인합니다. 미연결·수집 실패는 실제 발전량 0과 다르며 공개 설정은 외부 모니터에 보이는 범위를 정합니다.'],
  village_energy_monthly:['발전·정산 현황','대상 마을·발전소와 정산 기간을 확인합니다. 실제 수집·정산 자료가 있는지 확인한 뒤 기간별 발전량과 정산 내역을 비교하세요.'],
  sun_income_village:['햇빛소득마을','담당 마을의 기본정보와 운영 현황을 관리합니다. 마을별 대상과 기간을 확인하고 조합 전체 자료와 개별 마을 자료를 구분하세요.'],
  village_company_info:['조합 기본정보','공식 명칭·연락처·로고·직인과 출자증서에 필요한 정보를 준비합니다. 납입 안내 계좌는 가입자가 입금할 공식 계좌를 사용하세요.'],
  platform_admin:['조합 생성·운영 제어','운영할 조합과 등록 도메인·사용 기능을 관리합니다. 조합별 설정이므로 대상을 먼저 확인하고 필요한 기능만 변경하세요.'],
  proposal_builder:['제안서 만들기','대상 시설과 설치 조건을 입력해 제안서 미리보기를 만듭니다. 비용·판매단가·발전시간은 수지 예상의 가정이므로 실제 검토한 값을 사용하세요.'],
  ai_connect:['AI 연결','허용된 업무 자료를 AI에서 조회하는 연결입니다. 연결 승인 화면의 범위와 만료 상태를 확인하고 더 이상 쓰지 않는 연결은 해제하세요.'],
  membermanage:['내 정보와 조합원 활동','개인·자녀·단체 프로필을 선택하면 해당 명의의 정보와 업무 신청을 확인합니다. 신청 전에 현재 프로필을 확인하고, 출자증서는 납입 반영 후 화면에서 확인·인쇄할 수 있습니다.']
 };
 // Explanations describe usage, not the field name or a guessed value.
 const fields={
  'dashboardPeriod':'보고 싶은 매출 기간을 골라 [조회]를 눌러 주세요. 누적 전체는 저장된 전체 기간을 합산하고, 기간 지정은 입력한 시작일·종료일로 조회해요.',
  'profileBankLabel':'출자금 반환·배당 등 본인에게 지급할 때 확인하는 계좌입니다. 계좌번호를 비워 다른 정보만 수정하면 기존 계좌를 유지하며, 저장된 번호는 끝 네 자리로 확인합니다.',
  'profilePhoneLabel':'본인 확인과 조합의 연락에 사용하는 번호입니다. 프로필을 바꿨다면 현재 명의의 연락처인지 확인하세요.',
  'childBankLabel':'배당 등을 자녀에게 지급할 때 확인할 자녀 본인 명의 계좌입니다. 부모 계좌와 구분해서 입력하세요.',
  'exAmount':'추가로 출자하기로 약정할 금액입니다. 신청한 뒤 안내된 조합 계좌로 납입하고 반영 상태를 확인합니다.',
  'redAmount':'감자를 통해 반환을 요청할 금액입니다. 화면의 요청 가능 범위와 승인·반환 절차를 확인하세요.',
  'wdReason':'선택한 프로필의 탈퇴 신청 사유입니다. 신청하기 전에 현재 명의와 반환 계좌를 확인하세요.',
  'ptName':'홈페이지의 함께하는 단체 영역에 표시할 단체·기업명입니다.',
  'ptDesc':'홈페이지에서 협력단체를 소개하는 짧은 문구입니다.',
  'ptLink':'홈페이지에서 이 협력단체를 선택했을 때 연결할 공식 웹사이트 주소입니다.',
  'ptLogoFile':'협력단체 소개에 표시할 로고입니다. 가로형 600×300px 또는 최소 300×150px을 권장하며, 투명 배경은 PNG를 사용하세요.',
  'newFamName':'등록할 자녀의 실제 이름입니다. 가입·납입 내역은 각 자녀별로 관리합니다.',
  'newFamId':'자녀 등록 과정에서 생성되는 조합원 번호입니다. 부모의 조합원 번호와 구분해서 사용합니다.',
  'newFamEmail':'자녀 본인의 로그인·연락에 사용할 이메일이 있을 때 입력합니다. 없다면 비워둘 수 있습니다.',
  'newFamCapital':'등록할 자녀가 납입할 출자 약정 금액입니다. 현재 조합의 최소 출자금·1좌 기준과 납입기한을 확인하세요.',
  'newFamRelSelect':'자녀 가입 동의서에 기록할 법정대리인과 자녀의 관계입니다.',
  'writeTitle':'게시판 목록에서 글을 찾을 때 보이는 제목입니다. 글쓰기 창을 닫아도 남겨둔 초안을 다시 이어 쓸 수 있습니다.',
  'writeContent':'현재 활동 프로필 명의로 게시할 글의 본문입니다. 공개할 내용과 첨부를 확인한 뒤 등록하세요.',
  'member-capital-minimum':'가입과 추가 출자 등의 금액 검사에 사용하는 조합 공통 최소 기준입니다. 정관·규약에 맞는 금액을 사용하세요.',
  'member-capital-unit':'출자 좌수 계산과 출자증서·명부에 공통으로 사용하는 1좌의 금액입니다.',
  'site-home-hero-subtitle':'메인 배너의 제목을 보충하는 문구입니다. 사진에 글자가 이미 들어 있다면 문구 표시를 끄고 사진만 보여줄 수도 있습니다.',
  'site-home-impact-title':'홈페이지의 참여 안내 영역에 표시되는 제목입니다. 메인 배너 제목과 별도로 사용합니다.',
  'site-home-impact-description':'홈페이지 참여 안내에서 가입·참여 방법을 설명하는 본문입니다.',
  'site-home-impact-visible':'켜면 홈페이지에 참여 안내 영역을 보여줍니다. 배치와 공개 상태는 저장 후 반영됩니다.',
  'site-home-contact-name':'홈페이지 문의 영역에 공개할 공식 담당자명입니다. 개인 연락처를 공개할지는 조합에서 확인하세요.',
  'site-home-contact-role':'홈페이지 문의 담당자가 어떤 일을 안내하는지 보여주는 역할명입니다.',
  'site-home-contact-phone':'홈페이지 방문자가 문의할 공식 전화번호로 표시됩니다.',
  'site-home-contact-email':'홈페이지 방문자가 문의할 공식 이메일로 표시됩니다.',
  'site-home-contact-address':'홈페이지 문의 영역에 공개되는 조합 주소입니다.',
  'doc-date':'이 문서를 시행하는 날짜로 버전 정보에 표시됩니다. 실제 적용 여부는 현재 적용 버전 설정과 함께 확인하세요.',
  'doc-current':'선택한 문서를 현재 적용 버전으로 관리합니다. 가입 안내·약관은 초안과 등록·적용을 구분해 확인하세요.',
  'doc-access-scope':'문서를 열람할 수 있는 대상을 정합니다. 외부 공개가 필요한 자료인지 확인하세요.',
  'doc-version':'같은 문서의 개정본을 구분하는 이름입니다. 시행일이나 개정 차수를 쓰면 이전 내용과 비교하기 쉽습니다.',
  'doc-revision-summary':'이전 버전에서 달라진 점을 기록해 다음 검토자가 개정 내용을 파악할 수 있게 합니다.',
  'notice-public':'선택하면 조합원용 공지를 공개 홈페이지에서도 볼 수 있게 합니다. 본문과 첨부의 공개 가능 여부를 먼저 확인하세요.',
  'activity-history-milestone':'이 소식을 홈페이지 연혁에도 함께 보여줄 때 사용합니다.',
  'activity-history-title':'연혁에 표시할 짧은 제목입니다. 소식 본문의 제목과 구분해서 정리할 수 있습니다.',
  'activity-visible':'저장한 소식을 공개 홈페이지에 표시할지 정합니다.',
  'faq-visible':'질문과 답변을 공개 홈페이지 FAQ에 보여줄지 정합니다.',
  'faq-question':'방문자가 자주 궁금해하는 질문입니다. 가입·납입·활동처럼 찾기 쉬운 표현을 사용하세요.',
  'faq-answer':'공개 홈페이지에서 질문을 펼쳤을 때 보이는 답변입니다. 필요한 방법과 문의 경로를 적으면 도움이 됩니다.',
  'pt-member-id':'협력단체를 등록된 조합원과 연결할 때 사용합니다. 실제 연결할 단체가 맞는지 확인하세요.',
  'pt-link':'홈페이지의 협력단체를 눌렀을 때 열 공식 웹사이트 주소입니다.',
  'site-certification-featured':'공식 인증 목록뿐 아니라 메인 배너에서도 대표 인증으로 보여줍니다.',
  'site-certification-visible':'선택한 인증을 공개 홈페이지에 표시합니다. 인증 내용과 유효기간을 확인하세요.',
  'site-certification-public-url':'방문자가 인증·지정 내용을 확인할 수 있는 발급기관 등의 공식 안내 주소입니다.',
  'md-preferred-name':'활동 화면에서 사용할 별칭입니다. 입금·세무 기준의 이름과 구분해서 사용합니다.',
  'md-preferred-name-position':'활동 화면에서 이름 앞이나 뒤에 별칭을 붙이는 위치입니다.',
  'md-bank-account':'본인 계좌 수정에 사용합니다. 다른 정보만 고칠 때 이 칸을 비워두면 기존 계좌를 유지합니다. 저장된 계좌는 끝 네 자리로 확인합니다.',
  'md-email':'조합원 이메일을 보완합니다. 다른 정보만 고칠 때 비워두면 기존 이메일을 유지합니다.',
  'md-memo':'담당자가 조합원 관리 업무에 참고할 메모입니다. 공개 홈페이지 문구와는 별도로 관리합니다.',
  'create-member-type':'개인과 단체의 입력 항목을 구분합니다. 실제 가입·관리할 명의에 맞게 선택하세요.',
  'create-status':'현재 확인한 가입 상태를 기록합니다. 미확인 상태라면 임의로 정조합원으로 지정하지 말고 나중에 보완하세요.',
  'create-member-id':'조합에서 관리하던 번호가 있을 때 입력합니다. 다른 조합원과 중복되지 않는지 확인하세요.',
  'member-import-file':'개인·단체를 한 파일에서 검토할 수 있습니다. 유형과 이름·단체명은 필수이며, 나머지 빈칸은 추후 보완할 수 있습니다. 형식 오류와 중복 행은 검토 목록에서 확인하세요.',
  'dn-method':'실제 입금 방식을 기록합니다. 현금·계좌 등의 구분은 관련 자금 내역과 전표 확인에 사용합니다.',
  'fund-method':'기존 자금 내역의 실제 입금 방식을 확인하는 항목입니다.',
  'fund-journal-status':'자금 내역의 전표 처리 상태입니다. 업무 메모와 구분해서 확인합니다.',
  'dividendCalculationMethod':'이 조합의 규약에 따른 출자배당 산출 기준입니다. 이미 확정한 배당의 기준과 새 회차의 기준을 구분해 확인하세요.',
  'dividendCalculationRule':'선택한 산출 기준의 규약 조문과 계산 방법을 남깁니다. 다음 배당 회차를 검토할 때 근거로 확인할 수 있습니다.',
  'withdrawalDecisionAmount':'총회에서 확정한 반환 금액입니다. 참고용 출자금 잔액과 같다고 가정하지 말고 의결 내용을 확인하세요.',
  'withdrawalDecisionCalculationNote':'총회 확정 반환액을 어떻게 산정했는지 기록하는 근거입니다.',
  'withdrawalPaymentDate':'반환금을 실제로 지급한 날짜입니다. 의결일·지급예정일과 구분해서 기록합니다.',
  'issue-cutoff-date':'이 날짜까지 반영된 출자금을 기준으로 출자증서를 확인합니다.',
  'issue-manual-amount':'출력 기준을 직접 금액으로 선택했을 때 사용할 금액입니다. 실제 확인한 발급 근거와 맞는지 확인하세요.',
  'set_memberShareUnitAmount':'출자증서·명부 등의 좌수 계산에 쓰는 조합 공통 출자 기준입니다.',
  'annualPeriod':'이 연도 기준을 적용하기 시작하는 월입니다. 급여 귀속월에 맞는 등록 기준을 사용합니다.',
  'settingTargetYear':'확인하거나 수정할 기준 연도입니다. 과거 급여에 사용한 기준과 새 연도의 기준을 구분합니다.',
  'newRole':'직원의 기본 역할입니다. 역할별 기본 업무 권한과 연결되므로 실제 담당 범위에 맞게 선택하세요.',
  'newAuthLevel':'전자결재의 결재선과 승인 단계에 사용하는 레벨입니다. 업무 메뉴 사용 권한과 구분합니다.',
  'viewAuthLevel':'전자결재의 결재선과 승인 단계에 사용하는 레벨입니다. 업무 메뉴 사용 권한과 구분합니다.',
  'salaryMonth':'이 급여가 어느 달의 근로에 대한 것인지 정합니다. 실제 지급일과 귀속월은 다를 수 있습니다.',
  'payTotalFixed':'이번 달의 고정 지급 총액입니다. 상여는 별도로 입력하며 수당 구성과 적용 계약을 함께 확인합니다.',
  'salaryContractPaidUnits':'시급·일급 계약의 지급 대상 시간이나 일수입니다. 실제 근태 시간과 구분해서 관리자가 확인합니다.',
  'salaryContractReviewed':'새 계약이 반영된 직원의 계약 조건과 이번 달 지급액·근로시간을 확인했음을 기록합니다.',
  'workHours':'급여대장에 기록할 실제 근로시간입니다. 시급·일급의 지급 대상 분량과 구분해 확인하세요.',
  'payBasic':'고정 지급액과 입력한 수당 구성에 따라 계산하는 기본급입니다. 구성액 합계가 맞는지 함께 확인하세요.',
  'extraLeaveWorkHours':'실제로 추가 근로한 시간입니다. 추가 휴가로 부여할 시간은 별도 항목에서 직접 정합니다.',
  'extraLeaveGrantHours':'이번에 부여할 추가 휴가시간입니다. 실제 추가 근로시간을 자동으로 같은 시간의 휴가로 바꾸지 않습니다.',
  'extraLeaveReason':'추가 근로의 업무 내용과 휴가 부여 근거를 기록해 나중에 조정 내역을 확인하는 데 사용합니다.',
  'salaryTaxFamilyCount':'급여의 근로소득 간이세액 계산에 사용하는 공제대상 가족 수입니다. 실제 공제 요건을 확인한 수를 사용하세요.',
  'salaryTaxWithholdingRate':'간이세액 기준의 원천징수 비율입니다. 직원의 신청·적용 기준을 확인해 선택하세요.',
  'payrollImportFile':'직원별 금액과 적용 계약을 미리 검토한 뒤 일괄 저장합니다. 확인이 필요한 행이나 오류 행은 먼저 정리하세요.',
  'uploadEffectiveDate':'확정 계약의 근로·급여 조건을 적용하기 시작하는 날짜입니다. 월 중간 변경은 기간별 조건을 확인해 급여를 입력합니다.',
  'uploadFile':'외부에서 서명한 계약 원본입니다. 파일과 일치하는 근로시간·급여 등의 조건도 입력해야 이후 계산에 사용할 수 있습니다.',
  'chkProxy':'본인이 아닌 허용된 대상의 명의로 기안할 때 사용합니다. 상신 전에 기안 대상자를 확인하세요.',
  'approvalQuickTypes':'선택한 업무에 필요한 입력과 문서 양식을 불러옵니다. 작성 중인 본문과 결재선을 확인한 뒤 상신하세요.',
  'noticeUsage':'내부용은 게시 대상 확인을, 외부용은 출력·전달 용도를 구분합니다. 외부 수신처가 있다는 이유로 홈페이지에 공개되는 것은 아닙니다.',
  'inventoryPurchaseEnabled':'해당 지출의 물품·수량을 재고 입고에 연결할 때 사용합니다.',
  'expensePrepaidDate':'결재 문서 날짜가 아니라 실제로 먼저 지출한 날입니다. 지출일과 연동 내역을 확인하는 데 사용합니다.',
  'insuranceBillingMonth':'보험료 고지와 연결할 급여 귀속월입니다. 고지서와 급여 지출결의의 대상 월이 맞는지 확인하세요.',
  'withholdingPaymentConfirmed':'원천세 신고의 근거인 급여가 실제 지급되었는지 확인하는 항목입니다.',
  'inputDesc':'나중에 전표를 검색하거나 증빙과 맞춰 볼 때 사용하는 거래 설명입니다. 거래 목적과 상대를 알아볼 수 있게 작성하세요.',
  'inputAmount':'이 거래의 합계 금액입니다. 부가세 포함 여부와 계정 구분을 함께 확인하세요.',
  'vatCheck':'입력 합계에 부가세가 포함되어 있는지 정해 공급가액·세액을 나누는 데 사용합니다.',
  'projectSelect':'같은 사업의 거래를 프로젝트별로 모아 확인할 때 사용합니다.',
  'advModeToggle':'일반 업무 입력 외의 계정 선택이 필요한 경우 사용합니다. 차변·대변과 거래 성격을 확인한 뒤 입력하세요.',
  'cashbackCardSelect':'캐시백이 발생한 카드를 연결해 입금 내역을 구분합니다.',
  'cardManageAlias':'카드번호 대신 사용 목적이나 담당을 알아볼 수 있게 붙이는 관리용 이름입니다.',
  'cardManagePaymentDay':'카드 이용일과 통장 출금일을 구분해 결제 내역을 확인하는 데 사용합니다.',
  'receivableUseMonth':'아직 받지 못한 수익이 어느 달에 해당하는지 구분합니다. 실제 회수일은 별도로 기록합니다.',
  'prepayUseMonth':'미리 지급한 금액을 실제 비용으로 반영할 대상 월입니다.',
  'closingTaxBase':'결산 참고 계산에 쓰는 예상 과세표준입니다. 확정 신고 금액은 세무 검토 결과로 확인하세요.',
  'publicToggle':'공개 모니터에서 발전소 현황을 볼 수 있는지 정합니다. 수집 업체의 비밀 설정과 공개 현황을 구분합니다.',
  'refreshSelect':'현재 화면의 갱신 간격입니다. 공급사에서 새 발전 자료를 수집하는 주기와 같다고 가정하지 마세요.',
  'plant-generation-calc-method':'조합 참여 용량·지분 등에 따라 홈페이지 발전 현황에 반영할 기준입니다.',
  'officialIsRegistered':'등기 임원 여부를 기록합니다. 임원 직책·임기와 실제 등기 상태를 함께 확인하세요.',
  'officialTermEnd':'임기 종료 예정 확인과 임원 이력 관리에 사용하는 날짜입니다.',
  'pollMinChoices':'참여자가 반드시 고를 최소 선택지 수입니다. 최대 선택 수와 선택지 개수에 맞게 정하세요.',
  'pollMaxChoices':'참여자가 한 번에 고를 수 있는 최대 선택지 수입니다.',
  'dist-quota':'이 선거구에서 선출할 인원입니다. 투표 유형과 후보 수를 함께 확인하세요.',
  'privateNotes':'회의 준비용 비공개 메모입니다. 자료집에 넣을 메모와 구분해 사용합니다.',
  'documentNotes':'회의자료에 포함할 메모입니다. 비공개 준비 내용은 별도 준비 메모에 적으세요.',
  'material-visibility':'자료집을 열람할 수 있는 대상을 정합니다. 회의 준비용 파일이 외부 공개되어도 되는지 확인하세요.',
  'signer-list':'의사록 전자서명을 요청할 실제 참석 이사를 고르는 항목입니다.',
  'sourceNumber':'퀴즈 문제를 관리·대조할 때 사용하는 번호입니다. 문제의 공개 순위나 정답을 뜻하지 않습니다.',
  'explanationInput':'참여자가 문제의 근거를 이해할 수 있게 해설합니다. 정답 선택과 해설이 일치하는지 확인하세요.',
  'sourceAsOfInput':'참고한 사실·자료를 확인한 날짜입니다. 시간이 지나 바뀔 수 있는 내용을 재검토하는 데 도움이 됩니다.',
  'siteProposalNote':'선택 대상지의 추가 제안을 출력물 5쪽에 반영합니다.',
  'expandedKw':'예상 사업비·수익을 계산할 신규 설치 용량입니다. 의무용량과 실제 제안 범위를 구분해 확인하세요.',
  'salePriceWon':'제안서 예상 매출을 계산할 전력 판매단가 가정입니다.',
  'sunHours':'예상 발전량을 계산할 하루 평균 발전시간 가정입니다.',
  'myAccount':'급여 지급에 사용할 본인 계좌입니다. 은행·계좌번호가 맞는지 확인한 뒤 정보 수정을 저장하세요.',
  'myMemberId':'직원 계정과 조합원 정보를 연결해 확인할 때 사용하는 조합원 번호입니다.',
  'humanitiesTelegramRecipient':'선택 교육의 관련 안내를 받을 담당자를 정합니다. 교육 참석자와 알림 담당자는 서로 다른 대상입니다.'
 };
 const topics=[
  [/최소 출자금|최소출자금/,fields['member-capital-minimum']],
  [/출자\s*1좌|1좌 금액/,fields['member-capital-unit']],
  [/납입기한|납입 기한/,'정관에 맞는 납입 기간을 정합니다. 0은 기한 없음, 미설정은 확인 필요로 구분하며 변경 기준은 새 신청에 적용됩니다.'],
  [/계산 기준일/,'납입기한을 어느 날부터 계산할지 정합니다. 신청 완료일과 승낙 통지일 중 조합의 실제 운영·정관에 맞는 기준을 사용하세요.'],
  [/기본 권한|기본 역할|역할별|직급별/,'역할·직급의 공통 업무 기준입니다. 직원의 개별 사용·차단 설정과 기본 권한 따름을 구분해 관리하세요.'],
  [/전체 관리자/,'조합 전체 업무와 권한 설정을 관리하는 역할입니다. 실제로 전체 관리가 필요한 담당자인지 확인하세요.'],
  [/초기 설정/,'홈페이지 완성과 기본정보 준비를 위해 최대 30일 동안 부여하는 한시 권한입니다. 부여 현황에서 만료일과 조기 회수를 관리합니다.'],
  [/개별.*권한|업무 권한|일괄.*권한/,'선택한 직원이 담당할 업무를 정합니다. 기본 권한 따름·사용·사용 안 함의 차이를 확인하고 저장하세요.'],
  [/직인/,'증명서·문서에 날인할 조합의 공식 직인입니다. 실제 사용하는 직인과 이미지 비율을 확인하세요.'],
  [/파비콘/,'브라우저 탭에 표시할 작은 심볼입니다. 글자 없는 512×512 정사각형 이미지를 권장합니다.'],
  [/가로형 로고|문서.*로고|조합 로고/,'ERP 접속 화면과 조합 문서 등에 사용할 로고입니다. 파비콘은 별도의 글자 없는 심볼로 등록할 수 있습니다.'],
  [/공식 전화번호|공식 이메일|공식 담당자/,'방문자와 조합원에게 안내할 조합 공식 연락처입니다. 공개할 수 있는 업무용 정보를 사용하세요.'],
  [/개인정보 보호책임자/,'개인정보 관련 문의를 받을 조합 책임자 정보입니다. 등록할 처리방침 본문과 일치하는지 확인하세요.'],
  [/공개 범위|열람 범위/,'이 자료를 볼 수 있는 대상을 정합니다. 본문과 첨부가 해당 대상에게 공개되어도 되는지 확인하세요.'],
  [/홈페이지에 공개/,'선택하면 저장한 자료를 공개 홈페이지에 표시합니다. 방문자에게 보여줄 내용과 사진인지 확인하세요.'],
  [/표시 순서|표시순서/,'목록과 홈페이지에서 이 항목을 배치할 때 사용하는 순서입니다. 다른 항목과 함께 확인하면 원하는 순서로 정리하기 쉽습니다.'],
  [/임기 시작|임기 종료/,'임원 활동 기간과 종료 예정 내역을 확인하는 기준입니다. 실제 선임·임기 규정과 일치하는지 확인하세요.'],
  [/전일제|시간제|1일.*근로시간|주당.*근로시간/,'계약에 따른 근로시간 기준입니다. 하루 4시간 근로자는 전일 휴가도 4시간 기준으로 사용하므로 실제 계약과 맞게 입력하세요.'],
  [/적용일|적용 시작일/,'이 조건을 적용하기 시작하는 날짜입니다. 과거에 확정한 자료와 새 조건의 적용 기간을 구분하세요.'],
  [/귀속월/,'금액이나 근로가 어느 달에 해당하는지 구분합니다. 실제 지급·출금일과 다를 수 있습니다.'],
  [/실제 지급일|실제 지출|실제 입금일/,'계획일이나 문서 작성일이 아닌 실제 거래가 일어난 날짜입니다. 통장·증빙과 맞춰 확인하세요.'],
  [/계정과목|비용 계정|수익 계정|출금 계정/,'거래를 회계 장부의 어떤 항목으로 분류할지 정합니다. 실제 거래 성격과 입출금 계정을 확인하세요.'],
  [/부가세.*포함|부가세포함/,'입력 금액에서 공급가액·세액을 구분하는 기준입니다. 증빙의 합계와 부가세 표시를 함께 확인하세요.'],
  [/적요/,'전표를 다시 찾거나 통장·증빙과 대조할 때 사용할 거래 설명입니다.'],
  [/재고.*수량|구입 수량|입고.*수량|판매 수량|사용 수량/,'재고 증감과 판매·사용량 계산에 쓰는 실제 수량입니다. 판매·무료 사용·폐기의 구분을 함께 확인하세요.'],
  [/쿠폰.*정산|쿠폰.*금액/,'현장 직접 결제와 쿠폰 발행처에서 받을 정산금을 구분하는 데 사용합니다.'],
  [/메시지 설정|카카오.*사용|카톡.*사용/,'업무별 알림 사용 여부를 정합니다. 같은 조합의 본인 텔레그램 연결을 우선 사용하고, 미연결이면 조합별 카카오 설정을 따릅니다.'],
  [/Telegram 연결|텔레그램 연결/,'같은 조합의 본인 계정 알림을 텔레그램으로 받을 수 있습니다. 봇을 열어 시작해야 연결이 완료됩니다.'],
  [/공문 용도/ ,fields.noticeUsage],
  [/원본 의사록/,'등록된 의사록과 연결해 회의 정보를 확인합니다. 실제 연결할 회의인지 제목과 날짜를 확인하세요.'],
  [/선택지와 정답/,'선택지의 문구와 정답 연결을 함께 관리합니다. 순서 변경·삭제 후에도 의도한 답이 정답인지 확인하세요.'],
  [/출자증서|출자증명서/,'납입 반영된 출자금을 화면에서 확인하고 인쇄하거나 PDF로 저장합니다. 현재 프로필·기준일·발급 금액을 확인하세요.'],
  [/보안.*PIN|다운로드 PIN/,'주민번호·계좌 등 민감한 자료의 다운로드를 보호하는 번호입니다. 다른 로그인 암호와 구분해서 관리하세요.'],
  [/참고 자료 주소/,'문제나 설명의 근거를 다시 확인할 수 있는 원문 주소입니다.'],
  [/통장.*대조/,'여러 통장 파일을 함께 불러와 장부 후보와 비교합니다. 중복 행·입출금 방향·실제 계좌를 확인한 뒤 필요한 처리만 선택하세요.']
 ];
 const pageKey=()=>{const leaf=location.pathname.replace(/\.html$/,'').replace(/\/$/,'').split('/').pop();return leaf==='erp'?'index':leaf;};
 const excluded='[contenteditable="true"],.coop-dialog,dialog[data-workflow-help-dialog],.home-preview-frame,.note-editor,.ql-editor,#viewContent,.detail-content,.post-view-content,[data-workflow-help-ignore]';
 function labelText(label){const c=label.cloneNode(true);c.querySelectorAll('button,input,select,textarea,.badge').forEach(n=>n.remove());return c.textContent.replace(/\s+/g,' ').trim().replace(/[＊*：:]\s*$/,'');}
 function message(control,label){
  const id=control?.id||'';
  if(fields[id]||fields[label.id])return fields[id]||fields[label.id];
  if(/^site-legal-.+-effective-date$/.test(id))return '등록·적용할 문서의 시행일입니다. 초안을 저장한 것과 실제 이용자에게 적용 중인 버전은 구분해서 확인하세요.';
  if(/^site-legal-.+-content$/.test(id))return '가입 화면의 동의 항목이나 홈페이지 하단 약관에 적용할 본문입니다. 초안 미리보기에서 확인한 뒤 등록·적용합니다.';
  if(/^site-legal-privacy-officer_/.test(id))return '공개 개인정보 처리방침에서 개인정보 문의와 권리행사 접수처로 사용하는 책임자 정보입니다. 본문과 연락처를 일치시켜 주세요.';
  if(/^member-org-deposit-|^set_.*[Dd]eposit|^setupDeposit/.test(id))return '가입자에게 출자금 납입을 안내할 조합의 공식 은행·계좌·예금주입니다. 실제 입금받을 계좌가 맞는지 확인하세요.';
  if(/^(?:dividendBatch)(?:Period|Capital|Usage)(?:Start|End)$/.test(id))return '결산·출자금·이용실적 중 이 항목에 해당하는 집계 기간입니다. 서로 다른 기간을 섞지 않도록 회차의 기준을 확인하세요.';
  if(/^salary.*(?:Contract|contract)|^contract.*(?:Work|work|Pay|pay|Wage|wage)/.test(id))return '확정 계약의 근로·급여 조건과 이번 지급 조건을 대조합니다. 월 중간에 조건이 바뀌었다면 기간별 내용을 확인하세요.';
  if(/^(?:withholding|insurance|durunuri)/.test(id)&&/금액|보험료|지원금|지원분|지원합계|세액/.test(labelText(label)))return '해당 귀속월의 고지·급여·지원 근거와 대조할 금액입니다. 근로자 부담분과 사업주 부담분, 지원 전 금액과 지원액을 구분해 확인하세요.';
  if(/^power-generation-.+(?:api-key|access-token|system-code)$/.test(id))return '발전 자료를 수집할 공급사 연결에 사용하는 비밀 인증값입니다. 공개 홈페이지 문구나 업무 메모에는 넣지 마세요.';
  if(/^permission-default-/.test(id))return '역할·직급의 기본 업무 권한입니다. 사용 안 함은 해당 기준의 차단이며, 미설정은 기존 기본 규칙을 따릅니다. 직원별 별도 설정과 구분하세요.';
  if(/^permission-bulk-/.test(id))return '선택한 직원의 이 업무만 일괄 변경합니다. 변경 안 함은 그대로 두고, 기본 권한 따름은 조합의 역할·직급 기준을 사용합니다.';
  const t=labelText(label);return topics.find(([pattern])=>pattern.test(t))?.[1]||'';
 }
 function read(){try{return root.localStorage.getItem(KEY)!=='0';}catch(_){return true;}}
 let enabled=read(),running=false;
 function apply(value){enabled=value;doc.documentElement.toggleAttribute('data-workflow-help-off',!value);doc.querySelectorAll('[data-workflow-help-toggle]').forEach(b=>{b.setAttribute('aria-pressed',String(value));b.textContent=value?'켜짐':'꺼짐';});}
 function children(){return [...doc.querySelectorAll('iframe')].flatMap(f=>{try{return f.contentWindow.location.origin===location.origin&&f.contentWindow.CoopWorkflowHelp?[f.contentWindow.CoopWorkflowHelp]:[];}catch(_){return [];}});}
 function sync(value){apply(value);children().forEach(api=>api.refresh(value));}
 function setVisible(value){const v=value===true;try{root.localStorage.setItem(KEY,v?'1':'0');}catch(_){void root.CoopDialog?.alert('표시 설정을 저장하지 못했습니다. 이 화면에만 적용합니다.');}sync(v);try{if(root.parent!==root&&root.parent.location.origin===location.origin)root.parent.CoopWorkflowHelp?.refresh(v);}catch(_){}root.dispatchEvent(new CustomEvent('coop-workflow-help-change',{detail:{enabled:v}}));}
 function format(text){return String(text??'').trim().replace(/([.!?])\s+(?=\S)/gu,'$1\n\n').split(/\n{2,}/u).filter(Boolean).map((line,i)=>(i===0?'💡 ':'• ')+line).join('\n\n');}
 function button(title,text){const b=doc.createElement('button');b.type='button';b.className=CLASS;b.textContent='?';b.setAttribute('aria-label',title+' 도움말');b.setAttribute('title',title+' 도움말');b.setAttribute('aria-haspopup','dialog');b.dataset.workflowHelpOptional='';b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!enabled)return;b.focus({preventScroll:true});void root.CoopDialog?.alert(format(text),{title:title+' 도움말'});});return b;}
 function decorateLabel(label){
  if(!label.isConnected||label.matches('.visually-hidden,.sr-only')||label.closest(excluded)||label.closest('a,button')||label.dataset.workflowHelpToggleLabel!==undefined)return;
  const control=label.htmlFor?doc.getElementById(label.htmlFor):label.querySelector('input,select,textarea')||(['INPUT','SELECT','TEXTAREA'].includes(label.nextElementSibling?.tagName)?label.nextElementSibling:label.nextElementSibling?.querySelector('input,select,textarea'));
  if(control?.type==='hidden'||control?.dataset.permissionTarget)return;
  const text=message(control,label),prior=seen.get(label);
  if(prior?.isConnected)return;
  if(!text||label.nextElementSibling?.matches('.home-field-help,.'+CLASS))return;
  const title=labelText(label);if(!title||title.length>90)return;
  const b=button(title,text);label.after(b);seen.set(label,b);
  // Keep the original label/input nodes and handlers. Do not move fields or invent for/id bindings.
 }
 function preference(){
  const target=pageKey()==='mypage'?doc.querySelector('#tabInfo'):pageKey()==='membermanage'?doc.querySelector('#dashboardSection'):null;
  if(!target||doc.getElementById('workflowHelpPreference'))return;
  const section=doc.createElement('section');section.id='workflowHelpPreference';section.className='coop-help-preference';section.dataset.erpQueryControl='';
  const text=doc.createElement('div'),title=doc.createElement('strong'),p=doc.createElement('p');title.textContent='도움말 표시';p.textContent='작업·설정 옆 [?]를 표시합니다. 이 브라우저에 적용됩니다.';text.append(title,p);
  const toggle=doc.createElement('button');toggle.type='button';toggle.dataset.workflowHelpToggle='';toggle.setAttribute('aria-label','도움말 전체 표시');toggle.setAttribute('aria-pressed',String(enabled));toggle.textContent=enabled?'켜짐':'꺼짐';toggle.addEventListener('click',()=>setVisible(!enabled));section.append(text,toggle);
  if(pageKey()==='membermanage'){const heading=target.querySelector('.profile-action-bar');const row=heading?.closest('.d-flex.flex-column');if(row)row.after(section);else target.append(section);}else target.prepend(section);
 }
 function decorate(container=doc){
  // The full-menu landing page is intentionally help-free; child task pages keep their help.
  if(pageKey()==='index')return;
  if(running)return;running=true;
  try{
   if(container.matches?.('label'))decorateLabel(container);
   container.querySelectorAll?.('label').forEach(decorateLabel);preference();
   const info=pages[pageKey()];if(info&&!doc.querySelector('[data-workflow-page-help]')){
    const selector=pageKey()==='minutes_view'?'.library-header-title':'h1,h2,h3,h4,h5,.page-title';
    const heading=[...doc.querySelectorAll(selector)].find(n=>!n.closest('.modal,dialog,'+excluded)&&!n.closest('#mypageLoadingScreen,#hrLoadingScreen,#adminLoadingScreen'));
    if(heading){const b=button(info[0],info[1]);b.dataset.workflowPageHelp='';heading.append(b);}
   }
  }finally{running=false;}
 }
 function start(){
  const style=doc.createElement('style');style.id='workflow-help-style';style.textContent=`
   .${CLASS}{display:inline-flex!important;align-items:center;justify-content:center;flex:0 0 24px;box-sizing:border-box;width:24px;height:24px;min-width:24px!important;max-width:24px!important;min-height:24px!important;max-height:24px!important;padding:0!important;margin:0 0 0 6px!important;border:1px solid #64748b!important;border-radius:50%;background:#fff!important;color:#334155!important;font:700 14px/1 sans-serif!important;vertical-align:middle;cursor:pointer;text-decoration:none!important;box-shadow:none!important}
   .${CLASS}:hover{background:#e2e8f0!important;color:#0f172a!important}.${CLASS}:focus-visible{outline:3px solid #2563eb!important;outline-offset:3px}
   label:has(+.${CLASS}){display:inline-flex!important;align-items:center;max-width:calc(100% - 32px);vertical-align:middle;margin-bottom:0!important}h1>.${CLASS},h2>.${CLASS},h3>.${CLASS}{font-size:14px!important}
   .coop-help-preference{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:100%;padding:14px 16px;margin:0 0 20px;border:1px solid #94a3b8;border-radius:10px;background:#f8fafc;color:#172033;font-size:14px;word-break:keep-all}.coop-help-preference p{margin:4px 0 0;color:#475569}.coop-help-preference button{flex-shrink:0;min-width:68px;min-height:36px;border:1px solid #64748b;border-radius:8px;background:#fff;color:#334155;font:inherit;cursor:pointer}.coop-help-preference button[aria-pressed=true]{background:#166534;border-color:#166534;color:#fff}.coop-help-preference button:focus-visible{outline:3px solid #2563eb;outline-offset:3px}
   [data-workflow-help-off] .${CLASS},[data-workflow-help-off] .home-field-help,[data-workflow-help-off] #site-home-task-help{display:none!important}
   @media print{.${CLASS},.home-field-help,#site-home-task-help,.coop-help-preference{display:none!important}}
  `;doc.head.append(style);apply(read());decorate();
  // Only new subtrees/changed labels; never rescan the whole business form on every keystroke.
  const pending=new Set();let queued=false;
  new MutationObserver(records=>{for(const r of records){if(r.target.closest?.('.'+CLASS+',.coop-help-preference,.coop-dialog'))continue;for(const n of r.addedNodes)if(n.nodeType===1&&!n.matches('.'+CLASS+',.coop-help-preference,.coop-dialog')&&!n.closest('.'+CLASS+',.coop-help-preference,.coop-dialog'))pending.add(n);if(r.target.matches?.('label'))pending.add(r.target);}if(!pending.size||queued)return;queued=true;queueMicrotask(()=>{queued=false;const nodes=[...pending];pending.clear();nodes.forEach(decorate);});}).observe(doc.body,{subtree:true,childList:true});
 }
 root.CoopWorkflowHelp=Object.freeze({version:'1.0.2',setVisible,refresh:sync,visible:()=>enabled,decorate,format});
 root.addEventListener('storage',e=>{if(e.key===KEY||e.key===null)sync(read());});root.addEventListener('pageshow',()=>sync(read()));
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
