/*
Version: v1.0.2
Change: Link to the canonical cooperative privacy policy instead of duplicating it in a modal.
*/
// footer.js
if (typeof window !== 'undefined' && typeof window.showAlert !== 'function') {
  window.showAlert = (message) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.45)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';

    const box = document.createElement('div');
    box.style.background = '#fff';
    box.style.borderRadius = '10px';
    box.style.maxWidth = '90%';
    box.style.minWidth = '260px';
    box.style.padding = '18px 20px';
    box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';

    const msg = document.createElement('div');
    msg.style.whiteSpace = 'pre-line';
    msg.style.color = '#111827';
    msg.style.fontSize = '14px';
    msg.style.lineHeight = '1.5';
    msg.textContent = String(message ?? '');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '확인';
    btn.style.marginTop = '14px';
    btn.style.padding = '8px 16px';
    btn.style.border = '1px solid #e5e7eb';
    btn.style.borderRadius = '8px';
    btn.style.background = '#111827';
    btn.style.color = '#fff';
    btn.style.cursor = 'pointer';

    const close = () => overlay.remove();
    btn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    box.appendChild(msg);
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  };
}
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
              <li><i class="bi bi-chevron-right text-success"></i> <a href="privacy.html">개인정보 처리방침</a></li>
              <li>
  <i class="bi bi-chevron-right text-success"></i> 
  <a href="javascript:void(0)" onclick="openPatchModal()">패치노트</a>
</li>
            </ul>
          </div>

<div class="col-lg-4 col-md-6 footer-newsletter">
            <h4>Contact Us</h4>
            <p class="mb-3">궁금한 점이 있으신가요? 언제든 연락주세요.</p>
            <div style="color:#ddd; font-size:14px; line-height:1.8;">
              <i class="bi bi-geo-alt me-2 text-success"></i> 경기 용인시 처인구 남사읍 상동로 28<br>
              <i class="bi bi-envelope me-2 text-success"></i> yonginsolar@gmail.com<br>
              <i class="bi bi-phone me-2 text-success"></i> 010-2513-5736 (사무국)
            </div>
          </div>

        </div>
      </div>
    </div>

    <div class="container d-md-flex py-4">
      <div class="me-md-auto text-center text-md-start">
        <div class="copyright">
          &copy; Copyright <strong><span>용인모두의햇빛협동조합</span></strong>. All Rights Reserved
        </div>
        <div class="credits">
          Designed by <a href="https://bootstrapmade.com/">BootstrapMade</a>
        </div>
      </div>
 <!--
      <div class="social-links text-center text-md-right pt-3 pt-md-0">
        <a href="#" class="facebook"><i class="bi bi-facebook"></i></a>
        <a href="#" class="instagram"><i class="bi bi-instagram"></i></a>
        <a href="#" class="youtube"><i class="bi bi-youtube"></i></a>
      </div> 
-->
     </div>
    `;

    // 2. 모달(팝업) HTML 뭉치 (이용약관)
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
