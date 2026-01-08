// footer.js
document.addEventListener("DOMContentLoaded", function() {
    
    // 1. 푸터 HTML
    const footerHtml = `
    <div class="footer-top">
      <div class="container">
        <div class="row">
          
          <div class="col-lg-3 col-md-6 footer-contact">
            <h3>용인모두의햇빛협동조합</h3>
            <p>
              햇빛은 누구에게나 공평합니다.<br>
              시민의 힘으로 만드는<br>
              깨끗한 에너지 세상.
            </p>
          </div>

          <div class="col-lg-2 col-md-6 footer-links">
        <h4>바로가기</h4>
            <ul>
              <li><i class="bi bi-chevron-right text-success"></i> <a href="index.html#hero">홈</a></li>
              <li><i class="bi bi-chevron-right text-success"></i> <a href="index.html#about">조합 소개</a></li>
              <li><i class="bi bi-chevron-right text-success"></i> <a href="index.html#progress">건립 현황</a></li>
              <li><i class="bi bi-chevron-right text-success"></i> <a href="index.html#contact">문의하기</a></li>
            </ul>
          </div>

          <div class="col-lg-3 col-md-6 footer-links">
            <h4>정보 및 정책</h4>
            <ul>
              <li><i class="bi bi-chevron-right text-success"></i> <a href="#" data-bs-toggle="modal" data-bs-target="#termsModal">이용약관</a></li>
              <li><i class="bi bi-chevron-right text-success"></i> <a href="#" data-bs-toggle="modal" data-bs-target="#privacyModal">개인정보처리방침</a></li>
              <li><i class="bi bi-chevron-right text-success"></i> <a href="#" data-bs-toggle="modal" data-bs-target="#patchNoteModal">패치노트</a></li>
            </ul>
          </div>

<div class="col-lg-4 col-md-6 footer-newsletter">
            <h4>Contact Us</h4>
            <p class="mb-3">궁금한 점이 있으신가요? 언제든 연락주세요.</p>
            <div style="color:#ddd; font-size:14px; line-height:1.8;">
              <i class="bi bi-geo-alt me-2 text-success"></i> 경기 용인시 처인구 남사읍 상동로 28<br>
              <i class="bi bi-envelope me-2 text-success"></i> yonginsolar@gmail.com<br>
              <i class="bi bi-phone me-2 text-success"></i> 010-2513-5736 (사무국)<br>
              <i class="bi bi-bank me-2 text-success"></i> 신협 131-022-855516 용인모두의햇빛협동조합
            </div>
          </div>

        </div>
      </div>
    </div>

    <div class="container d-md-flex py-4">
      <div class="me-md-auto text-center text-md-start w-100">
        <div class="copyright text-center">
          &copy; Copyright <strong><span>용인모두의햇빛협동조합</span></strong>. All Rights Reserved
        </div>
      </div>
    </div>
    `;

    // 2. 모달(팝업) HTML 뭉치 (이용약관 + 개인정보 + 패치노트)
    // 따옴표(`) 안에 기존 HTML을 그대로 넣어서 모든 페이지에 주입합니다.
    const modalsHtml = `
  <div class="modal fade" id="termsModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-scrollable modal-lg"> <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title fw-bold">서비스 이용약관</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
<h6>제1조(목적)</h6>
<p class="text-muted small">
  이 약관은 용인모두의햇빛협동조합(이하 "협동조합")이 운영하는 홈페이지를 통하여 제공하는 온라인 서비스의 이용과 관련하여 협동조합과 이용자 사이의 권리와 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
</p>

<h6>제2조(용어의 정의)</h6>
<p class="text-muted small">
  1. "홈페이지"란 협동조합이 정보 제공, 조합원 가입 신청 접수, 조합원 정보 조회 등을 위하여 운영하는 인터넷 사이트를 말합니다.<br>
  2. "이용자"란 홈페이지에 접속하여 이 약관에 따라 협동조합이 제공하는 서비스를 이용하는 자를 말합니다.<br>
  3. "조합원"이란 협동조합기본법과 협동조합 정관에서 정한 절차에 따라 조합원 자격을 취득한 자를 말합니다.<br>
  4. "조합원 가입 신청자"란 홈페이지를 통하여 조합원 가입을 신청하는 자를 말합니다.
</p>

<h6>제3조(약관의 효력 및 변경)</h6>
<p class="text-muted small">
  1. 이 약관은 홈페이지 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.<br>
  2. 협동조합은 관련 법령의 개정이나 서비스 내용의 변경 등을 위하여 필요한 경우 이 약관을 개정할 수 있습니다.<br>
  3. 협동조합이 약관을 개정하는 경우 개정 약관의 적용일자 및 개정 사유를 명시하여 현행 약관과 함께 홈페이지에 적용일자 7일 전까지 공지합니다. 다만 이용자에게 불리하게 변경되는 경우에는 상당한 기간을 두고 공지합니다.<br>
  4. 이용자는 변경된 약관에 동의하지 않을 권리가 있으며, 변경된 약관에 동의하지 않는 경우 홈페이지 서비스를 더 이상 이용하지 않을 수 있습니다.<br>
  5. 이 약관의 제정 또는 변경만으로 조합원 자격의 취득, 유지, 상실 및 출자금의 변동 등 조합원 권리·의무에 관한 사항이 변경되지는 않으며, 그러한 사항은 협동조합기본법과 협동조합 정관, 총회 및 이사회 결의에 따릅니다.
</p>

<h6>제4조(서비스의 내용)</h6>
<p class="text-muted small">
  협동조합이 홈페이지를 통하여 제공하는 서비스는 다음 각 호와 같습니다.<br>
  1. 협동조합 및 사업에 관한 정보 제공<br>
  2. 조합원 가입 신청 및 관련 문의 접수<br>
  3. 조합원 및 조합원 가입 신청자의 본인 확인 절차 제공<br>
  4. 조합원이 자신의 기본 정보, 출자 내역 등을 조회·확인할 수 있는 기능<br>
  5. 조합원 정보 수정 요청, 출자금 추가 요청, 출자금 감소(감자) 요청, 조합원 탈퇴 요청 등 온라인 신청 접수 기능<br>
  6. 공지사항 등 협동조합 운영에 관한 알림 제공<br>
  7. 기타 협동조합이 정하는 온라인 서비스
</p>

<h6>제5조(홈페이지를 통한 신청과 조합원 자격 변동 등)</h6>
<p class="text-muted small">
  1. 이 홈페이지를 통하여 이루어지는 조합원 가입 신청, 정보 수정 요청, 출자금 추가·감소(감자) 요청, 조합원 탈퇴 요청 등은 조합원 또는 신청자의 의사를 접수하기 위한 절차에 해당합니다.<br>
  2. 이 중 조합원 자격의 취득·상실, 출자좌수의 감소(감자) 등 협동조합기본법과 협동조합 정관상 총회 또는 이사회 의결을 요하는 사항은, 해당 의결기관이 별도로 심의·의결한 때에 비로소 효력이 확정됩니다.<br>
  3. 출자금 추가 납부, 연락처·주소 등 기본 정보 변경 등 협동조합 정관상 별도의 의결을 요하지 않는 사항은, 협동조합이 정한 절차에 따라 입금 확인 또는 전산 반영 시 효력이 발생합니다.<br>
  4. 협동조합은 정관과 내부 규정에 따라 각종 신청과 요청을 처리하며, 필요한 경우 승인 여부 및 처리 결과를 신청자에게 통지합니다.
</p>

<h6>제6조(이용자의 의무)</h6>
<p class="text-muted small">
  1. 이용자는 서비스를 이용함에 있어 다음 각 호의 행위를 하여서는 아니 됩니다.<br>
  &nbsp;&nbsp;가. 가입 신청 또는 정보 변경 시 허위 내용의 기재 또는 타인의 정보 도용<br>
  &nbsp;&nbsp;나. 홈페이지 운영을 고의로 방해하는 행위<br>
  &nbsp;&nbsp;다. 법령, 협동조합 정관, 이 약관 또는 공서양속에 위반되는 행위<br>
  2. 이용자는 이 약관 및 홈페이지에 게시된 이용안내, 협동조합이 공지하는 사항을 준수하여야 합니다.<br>
  3. 조합원은 홈페이지를 통하여 타인의 개인정보 또는 조합원 명부를 무단으로 열람·수집·이용하려 하여서는 아니 됩니다.
</p>

<h6>제7조(협동조합의 의무)</h6>
<p class="text-muted small">
  1. 협동조합은 관련 법령과 이 약관이 정하는 바에 따라 안정적으로 서비스를 제공하기 위하여 노력합니다.<br>
  2. 협동조합은 이용자의 개인정보를 개인정보 보호 관련 법령과 협동조합의 개인정보 처리방침이 정하는 바에 따라 안전하게 관리합니다.<br>
  3. 협동조합은 서비스의 제공과 관련하여 알고 있는 이용자의 정보를 본인의 동의 없이 목적 외로 사용하지 아니하며, 관련 법령에 따른 경우를 제외하고 제3자에게 제공하지 않습니다.
</p>

<h6>제8조(개인정보 보호)</h6>
<p class="text-muted small">
  1. 협동조합은 서비스 제공을 위하여 필요한 범위에서 최소한의 개인정보를 수집하며, 수집된 개인정보의 처리에 관하여는 별도로 게시하는 "개인정보 처리방침"을 따릅니다.<br>
  2. 개인정보 처리방침은 홈페이지 하단의 링크를 통하여 언제든지 확인할 수 있습니다.
</p>

<h6>제9조(저작권 등)</h6>
<p class="text-muted small">
  1. 홈페이지에 게시된 텍스트, 이미지, 로고, 디자인 등 모든 콘텐츠에 대한 저작권 및 기타 권리는 별도의 표시가 없는 한 협동조합에 귀속됩니다.<br>
  2. 이용자는 협동조합의 사전 동의 없이 홈페이지의 콘텐츠를 무단으로 복제, 배포, 출판, 전송, 변조 등 할 수 없습니다. 다만 비영리 목적의 인용인 경우에는 출처를 명확히 밝힌 경우에 한하여 허용될 수 있습니다.
</p>

<h6>제10조(서비스의 변경 및 중단)</h6>
<p class="text-muted small">
  1. 협동조합은 운영상, 기술상의 필요에 따라 제공 중인 서비스의 전부 또는 일부를 변경하거나 중단할 수 있습니다.<br>
  2. 협동조합은 서비스의 내용을 변경하거나 중단하는 경우 그 사유와 내용을 홈페이지에 사전에 공지하기 위하여 노력합니다. 다만 불가피한 사유로 사전 공지가 어려운 경우에는 사후에 공지할 수 있습니다.
</p>

<h6>제11조(면책)</h6>
<p class="text-muted small">
  1. 협동조합은 천재지변, 정전, 통신망 장애, 시스템 오류 등 불가항력적인 사유로 인하여 서비스를 제공할 수 없는 경우 그로 인한 책임을 지지 않습니다.<br>
  2. 협동조합은 이용자의 귀책사유로 인하여 발생한 손해에 대하여 책임을 지지 않습니다.<br>
  3. 협동조합은 이용자가 홈페이지에 게재한 정보, 자료, 사실의 신뢰도 및 정확성에 대하여 책임을 지지 않으며, 이를 근거로 한 이용자의 판단 또는 선택에 대하여 책임을 지지 않습니다.
</p>

<h6>제12조(분쟁의 해결)</h6>
<p class="text-muted small">
  1. 이 약관과 관련하여 협동조합과 이용자 사이에 분쟁이 발생한 경우 당사자는 성실한 협의를 통하여 원만히 해결하기 위하여 노력합니다.<br>
  2. 협의로 해결되지 아니하는 분쟁에 관하여는 협동조합의 주된 사무소 소재지를 관할하는 법원을 제1심 관할 법원으로 합니다.
</p>

<h6>제13조(준거법)</h6>
<p class="text-muted small">
  이 약관에 관한 해석과 적용은 대한민국 법령을 준거법으로 합니다.
</p>

<h6>부칙</h6>
<p class="text-muted small">
  1. 이 약관은 용인모두의햇빛협동조합 사무국의 검토와 승인을 거쳐 2025년 12월 8일부터 한시적으로 적용합니다.<br>
  2. 이 약관은 용인모두의햇빛협동조합 이사회 의결을 거쳐 확정되며, 이사회에서 정하는 날부터 최종 시행됩니다.
</p>

        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" data-bs-dismiss="modal">확인</button>
        </div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="privacyModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-scrollable modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title fw-bold">개인정보 처리방침</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="alert alert-secondary">
             본 조합은 개인정보보호법에 따라 이용자의 개인정보를 소중히 다루고 있습니다.
          </div>
          <p class="text-muted small">
  용인모두의햇빛협동조합(이하 "협동조합")은 개인정보 보호법과 정보통신망 이용촉진 및 정보보호 등에 관한 법률 등 관련 법령을 준수하며,
  홈페이지를 통하여 수집·이용하는 개인정보를 다음과 같은 방침에 따라 안전하게 관리합니다.
  이 개인정보 처리방침은 협동조합이 운영하는 홈페이지에서 조합원 가입 신청, 조합원 정보 조회와 변경 등 온라인 서비스를 이용하는 경우에 적용됩니다.
</p>

<p class="text-muted small">
  협동조합은 조합원 명부를 인터넷을 통하여 일반에 공개하지 않으며, 협동조합기본법이 정하는 범위에서 조합원과 채권자의 열람 요청에 응합니다.
</p>

<h6>제1조(개인정보의 처리 목적)</h6>
<p class="text-muted small">
  협동조합은 다음 각 호의 목적을 위하여 필요한 범위에서 최소한의 개인정보를 처리합니다.
</p>
<ul class="text-muted small">
  <li>조합원 가입 신청 접수와 가입 자격 심사</li>
  <li>조합원 관리, 조합원과의 연락, 공지사항 전달</li>
  <li>협동조합 사업 안내, 회의와 행사 안내</li>
  <li>출자금 관리, 배당금 지급, 세무 신고 등 법령상 의무 이행</li>
  <li>조합원 문의 및 민원 응대</li>
  <li>홈페이지 서비스 개선과 이용 통계 분석</li>
</ul>

<h6>제2조(처리하는 개인정보의 항목과 수집 방법)</h6>
<p class="text-muted small">
  ① 협동조합은 조합원 가입과 서비스 제공을 위하여 다음과 같은 개인정보를 처리할 수 있습니다.
  실제 수집 항목은 조합원 가입 신청서, 조합원 정보 변경 신청서 등에 명시된 범위 안에서 이루어집니다.
</p>

<h6>1. 수집할 수 있는 개인정보 항목</h6>
<ul class="text-muted small">
  <li>성명</li>
  <li>주민등록번호</li>
  <li>주소</li>
  <li>연락처(전화번호, 휴대전화번호)</li>
  <li>이메일 주소</li>
  <li>조합원 구분과 출자 관련 정보</li>
  <li>출자금 납부와 반환, 배당금 지급을 위한 계좌번호 등 금융거래 정보</li>
</ul>

<p class="text-muted small">
  ② 협동조합은 세법 등 관련 법령에서 요구하는 경우에 한하여 주민등록번호와 같은 고유식별정보를 수집할 수 있으며,
  세무 신고 등 법령상 의무 이행 목적 외 용도로는 사용하지 않습니다.
</p>

<h6>2. 개인정보 수집 방법</h6>
<ul class="text-muted small">
  <li>협동조합 홈페이지의 온라인 조합원 가입 신청서 작성</li>
  <li>홈페이지의 조합원 정보 조회·변경 화면에서 본인이 직접 입력하는 정보</li>
  <li>협동조합 사무국에 제출하는 서면 신청서와 계약 문서</li>
  <li>협동조합 사무국으로의 전화 또는 이메일 문의, 상담 과정에서 정보주체가 자발적으로 제공하는 정보</li>
</ul>

<p class="text-muted small">
  ④ 협동조합은 만 14세 미만 아동의 개인정보를 홈페이지를 통하여 수집하지 않습니다.
  만 14세 미만 아동이 조합원으로 가입하고자 하는 경우에는 법정대리인(부모 등)의 동의를 받아야 하며,
  협동조합 사무국에 문의하여 별도로 제공하는 서면 신청서와 동의서를 통하여 가입 절차를 진행합니다.
</p>

<h6>제3조(개인정보의 처리 및 보유 기간)</h6>
<ul class="text-muted small">
  <li>협동조합은 개인정보 수집 시점에 동의 받은 보유·이용 기간 안에서 개인정보를 처리·보유합니다.</li>
  <li>조합원 가입 신청자의 개인정보는 가입 심사와 승인 여부 통지를 위하여 필요한 기간 동안 보유하며, 조합원으로 승인된 경우에는 조합원 자격이 유지되는 기간 동안 보관합니다.</li>
  <li>조합원 탈퇴, 출자금 반환, 감자 등으로 거래 관계가 끝난 뒤에도 세법, 상법, 국세기본법 등 관련 법령에서 정한 기간 동안 의무 이행과 분쟁 대비, 회계 증빙을 위하여 필요한 최소한의 개인정보를 보관할 수 있으며, 그 기간이 지나면 지체 없이 파기합니다.</li>
</ul>

<h6>제4조(개인정보의 제3자 제공)</h6>
<p class="text-muted small">
  ① 협동조합은 원칙적으로 정보주체의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.
</p>
<p class="text-muted small">
  ② 다만 다음 각 호의 어느 하나에 해당하는 경우에는 정보주체의 동의 없이 개인정보를 제3자에게 제공할 수 있습니다.
</p>
<ul class="text-muted small">
  <li>세법 기타 관련 법령에 따라 국세청, 지방자치단체 등 관계 행정기관에 신고·제출하는 경우</li>
  <li>정보주체가 사전에 특정 제3자 제공에 대하여 명시적으로 동의한 경우</li>
  <li>급박한 생명, 신체, 재산의 이익을 위하여 명백히 필요한 경우</li>
</ul>
<p class="text-muted small">
  ③ 제2항 각 호에 해당하지 않는 목적으로 개인정보를 제3자에게 제공할 필요가 있는 경우 협동조합은 제공받는 자, 제공 목적,
  제공 항목, 보유·이용 기간 등을 알리고 별도의 동의를 받습니다.
</p>

<h6>제5조(개인정보 처리의 위탁)</h6>
<ul class="text-muted small">
  <li>협동조합은 서비스 제공과 시스템 운영을 위하여 필요한 경우 개인정보 처리를 외부 기관에 위탁할 수 있습니다.</li>
  <li>협동조합은 구글 워크스페이스, 구글 드라이브, 구글 스프레드시트 등 클라우드 서비스를 이용하여 조합원 명부와 출자 내역 등 일부 개인정보를 보관하고 있으며,
      이를 위하여 Google LLC 등 클라우드 서비스 제공자에게 개인정보 처리 업무를 위탁할 수 있습니다.</li>
  <li>위탁이 이루어지는 경우 협동조합은 위탁받는 자와 위탁 업무 내용, 위탁 기간 등을 명시한 계약을 체결하고,
      개인정보 보호법 등 관련 법령을 준수하도록 관리·감독합니다.</li>
  <li>위탁 기관이 변경되거나 추가되는 경우 협동조합은 홈페이지에 그 내역을 공개합니다.</li>
</ul>

<h6>제5조의2(개인정보의 국외 이전)</h6>
<p class="text-muted small">
  협동조합은 서비스 운영을 위해 다음과 같이 개인정보를 국외로 이전(보관)하고 있습니다.
</p>
<ul class="text-muted small">
  <li>이전되는 개인정보 항목: 이메일, 이름, 연락처 등 구글 서비스 이용 시 저장되는 데이터</li>
  <li>이전되는 국가, 시기, 방법: 미국 등 전 세계 구글 데이터센터, 서비스 이용 시 수시로 네트워크를 통해 전송</li>
  <li>이전받는 자: Google LLC (googlekrsupport@google.com)</li>
  <li>이전받는 자의 이용 목적 및 보유 기간: 클라우드 서비스 제공 및 데이터 보관, 위탁 계약 종료 시까지</li>
</ul>

<h6>제6조(정보주체의 권리와 행사 방법)</h6>
<p class="text-muted small">
  ① 이용자와 조합원은 개인정보 보호법 등 관련 법령이 허용하는 범위 안에서 언제든지 본인의 개인정보에 대하여 다음 각 호의 권리를 행사할 수 있습니다.
</p>
<ul class="text-muted small">
  <li>본인에 관한 개인정보 열람 요구</li>
  <li>개인정보의 정정 또는 삭제 요구</li>
  <li>개인정보 처리 정지 요구</li>
  <li>동의 철회</li>
</ul>
<ul class="text-muted small">
  <li>다만 다른 법령에서 그 개인정보가 수집·보관 대상으로 명시되어 있거나 협동조합의 법적 의무 이행 및 권리 행사·방어를 위하여 불가피하게 필요한 경우에는 삭제 또는 처리 정지가 제한될 수 있습니다.</li>
  <li>위 권리 행사는 협동조합에 서면, 전화, 이메일 등으로 요청할 수 있으며, 협동조합은 본인 여부를 확인한 뒤 가능한 한 신속하게 조치합니다.</li>
  <li>협동조합이 홈페이지를 통하여 개인정보 열람·정정 기능을 제공하는 경우, 정보주체 본인에 한하여 본인 인증 절차를 거친 뒤 해당 기능을 이용할 수 있도록 하며, 타인의 개인정보는 열람이나 수정이 불가능합니다.</li>
  <li>만 14세 미만 아동의 경우 개인정보 열람, 정정, 삭제 등에 관한 권리 행사는 법정대리인이 아동을 대신하여 또는 함께 할 수 있습니다.</li>
  <li>개인정보 처리 정지 요구 또는 동의 철회는 출자금 관리, 세무 신고 등 법령과 협동조합 정관에서 정한 필수 업무에 필요한 최소한의 개인정보 처리까지 즉시 중단한다는 뜻은 아니며,
      조합원 자격의 취득·유지·상실 및 출자금의 변동 등 조합원 권리·의무에 관한 사항은 협동조합기본법과 협동조합 정관, 총회 및 이사회 결의에 따릅니다.</li>
</ul>

<h6>제7조(개인정보의 파기)</h6>
<ul class="text-muted small">
  <li>협동조합은 개인정보 보유 기간이 경과하거나 처리 목적이 달성되는 등 개인정보가 더 이상 필요하지 않게 된 경우 지체 없이 해당 개인정보를 파기합니다.</li>
  <li>전자 파일 형태인 개인정보는 복구나 재생이 되지 않도록 안전한 방법으로 삭제하며, 종이 문서에 기록된 개인정보는 분쇄 또는 소각 등의 방법으로 파기합니다.</li>
</ul>

<h6>제8조(개인정보의 안전성 확보 조치)</h6>
<p class="text-muted small">
  협동조합은 개인정보가 분실, 도난, 유출, 위조, 변조, 훼손되지 않도록 다음과 같은 안전성 확보 조치를 취합니다.
</p>

<h6>1. 접근 권한 관리</h6>
<p class="text-muted small">
  협동조합은 개인정보에 접근할 수 있는 계정과 권한을 최소한으로 부여하고, 비밀번호 관리와 계정 관리를 통하여 접근 권한을 엄격히 통제합니다.
</p>

<h6>2. 암호화 조치</h6>
<p class="text-muted small">
  협동조합은 주민등록번호, 계좌번호 등 고유식별정보와 금융정보를 구글 앱스크립트와 CryptoJS를 활용한 안전한 암호 알고리즘으로 추가 암호화하여 저장하며,
  암호키는 권한이 제한된 별도 영역에 보관합니다.
</p>

<h6>3. 클라우드 보안 기능 활용</h6>
<p class="text-muted small">
  협동조합은 구글 워크스페이스와 구글 드라이브, 구글 스프레드시트 등 클라우드 서비스가 제공하는 전송 구간 암호화와 데이터센터 보안 기능을 이용하며,
  정기적으로 보안 설정을 점검합니다.
</p>

<h6>4. 내부 관리계획 수립·시행</h6>
<p class="text-muted small">
  협동조합은 개인정보를 취급하는 임직원에 대하여 개인정보 보호 교육을 실시하고, 개인정보 처리 내역과 권한을 정기적으로 점검합니다.
</p>

<h6>제9조(쿠키의 사용)</h6>
<ul class="text-muted small">
  <li>협동조합은 이용자 편의와 서비스 개선을 위하여 쿠키를 사용할 수 있습니다. 쿠키는 홈페이지를 운영하는 서버가 이용자의 브라우저에 보내는 작은 정보 파일로, 이용자의 컴퓨터에 저장될 수 있습니다.</li>
  <li>이용자는 웹 브라우저의 설정을 통하여 쿠키 저장을 거부하거나 삭제할 수 있습니다.</li>
  <li>쿠키 사용을 제한하는 경우 일부 서비스 이용에 어려움이 있을 수 있습니다.</li>
</ul>

<h6>제10조(자동화된 의사결정의 부재)</h6>
<p class="text-muted small">
  협동조합은 개인정보를 이용하여 조합원에게 법적 효과나 이에 준하는 중대한 영향을 미치는 자동화된 의사결정이나 프로파일링을 수행하지 않습니다.
</p>

<h6>제11조(개인정보 보호책임자)</h6>
<ul class="text-muted small">
  <li>성명: 김민호</li>
  <li>직책: 사무국장</li>
  <li>연락처: 010-2513-5736</li>
  <li>이메일: yonginsolar@gmail.com</li>
</ul>
<p class="text-muted small">
  이용자는 협동조합의 서비스 이용과 관련한 모든 개인정보 보호 문의와 불만 제기, 피해 구제 요청을 개인정보 보호책임자에게 할 수 있으며,
  협동조합은 이에 신속하고 성실하게 답변하고 처리합니다.
</p>

<h6>제12조(권익침해에 대한 구제 방법)</h6>
<p class="text-muted small">
  이용자는 개인정보 침해에 대한 상담이나 분쟁 조정을 위하여 개인정보 분쟁조정위원회, 한국인터넷진흥원 개인정보침해신고센터 등 관계 기관에 도움을 요청할 수 있습니다.
  각 기관의 연락처와 이용 방법은 해당 기관에서 제공하는 안내를 따릅니다.
</p>

<h6>제13조(개인정보 처리방침의 변경)</h6>
<p class="text-muted small">
  이 개인정보 처리방침은 법령의 개정이나 서비스 내용의 변경 등으로 수정될 수 있습니다.
  협동조합이 개인정보 처리방침을 변경하는 경우 변경 내용과 시행 일자를 명시하여 홈페이지에 게시합니다.
</p>

<h6>부칙</h6>
<ul class="text-muted small">
  <li>이 개인정보 처리방침은 용인모두의햇빛협동조합 사무국의 검토와 승인을 거쳐 2025년 12월 8일부터 한시적으로 적용합니다.</li>
  <li>이 개인정보 처리방침은 용인모두의햇빛협동조합 이사회의 의결을 거쳐 확정하며, 이사회에서 정하는 날부터 시행합니다.</li>
</ul>

        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" data-bs-dismiss="modal">확인</button>
        </div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="patchNoteModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header" style="background:var(--color-primary); color:#fff;">
          <h5 class="modal-title fw-bold"><i class="bi bi-tools"></i> 사이트 업데이트 내역</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-0">
          <div class="list-group list-group-flush">
            
            <div class="list-group-item p-3">
              <div class="d-flex w-100 justify-content-between">
                <h6 class="mb-1 fw-bold text-success">v1.0.0 정식 오픈</h6>
                <small class="text-muted">2026.01.05</small>
              </div>
              <p class="mb-1 small">용인모두의햇빛협동조합 공식 홈페이지가 오픈되었습니다.</p>
              <ul class="small text-muted ps-3 mb-0">
                <li>비밀번호 없는 간편 가입 시스템 적용</li>
                <li>실시간 발전 현황 대시보드 구축</li>
                <li>예상 배당금 계산기 기능 추가</li>
              </ul>
            </div>

            <div class="list-group-item p-3 bg-light">
              <div class="d-flex w-100 justify-content-between">
                <h6 class="mb-1 fw-bold text-secondary">v0.9.0 베타 테스트</h6>
                <small class="text-muted">2025.12.25</small>
              </div>
              <p class="mb-1 small">초기 디자인 및 기능 테스트 진행</p>
            </div>

          </div>
        </div>
        <div class="modal-footer">
          <small class="text-muted me-auto">버그 제보: yonginsolar@gmail.com</small>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button>
        </div>
      </div>
    </div>
  </div>
    `;

    // 3. 화면에 HTML 주입
    // (1) 푸터 넣기
    const footerElement = document.getElementById("footer");
    if (footerElement) {
        footerElement.innerHTML = footerHtml;
    }

    // (2) 모달 넣기 (body 맨 끝에 추가)
    document.body.insertAdjacentHTML('beforeend', modalsHtml);
});
