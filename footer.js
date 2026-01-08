// footer.js - 푸터 통합 관리
document.addEventListener("DOMContentLoaded", function() {
    const footerHtml = `
    <div class="footer-top">
      <div class="container">
        <div class="row">
          <div class="col-lg-3 col-md-6 footer-contact">
            <h3>용인모두의햇빛협동조합</h3>
            <p>햇빛은 누구에게나 공평합니다.<br>시민의 힘으로 만드는<br>깨끗한 에너지 세상.</p>
          </div>
          <div class="col-lg-2 col-md-6 footer-links">
            <h4>바로가기</h4>
            <ul>
              <li><i class="bi bi-chevron-right"></i> <a href="index.html#hero">홈</a></li>
              <li><i class="bi bi-chevron-right"></i> <a href="index.html#about">조합 소개</a></li>
              <li><i class="bi bi-chevron-right"></i> <a href="index.html#progress">발전 현황</a></li>
              <li><i class="bi bi-chevron-right"></i> <a href="index.html#contact">문의하기</a></li>
            </ul>
          </div>
          <div class="col-lg-3 col-md-6 footer-links">
            <h4>정보 및 정책</h4>
            <ul>
              <li><i class="bi bi-chevron-right"></i> <a href="index.html" onclick="alert('메인 페이지 하단에서 확인해주세요.')">이용약관</a></li>
              <li><i class="bi bi-chevron-right"></i> <a href="index.html" onclick="alert('메인 페이지 하단에서 확인해주세요.')">개인정보처리방침</a></li>
            </ul>
          </div>
          <div class="col-lg-4 col-md-6 footer-newsletter">
            <h4>Contact Us</h4>
            <p>궁금한 점이 있으신가요? 언제든 연락주세요.</p>
            <div style="color:#fff; font-size:14px; line-height:2;">
              <i class="bi bi-geo-alt me-2" style="color:var(--color-secondary)"></i> 경기 용인시 처인구 남사읍 상동로 28<br>
              <i class="bi bi-envelope me-2" style="color:var(--color-secondary)"></i> yonginsolar@gmail.com<br>
              <i class="bi bi-phone me-2" style="color:var(--color-secondary)"></i> 010-2513-5736 (사무국)<br>
              <i class="bi bi-bank me-2" style="color:var(--color-secondary)"></i> 신협 131-022-855516 용인모두의햇빛협동조합
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
      </div>
    </div>
    `;

    const footerElement = document.getElementById("footer");
    if (footerElement) {
        footerElement.innerHTML = footerHtml;
    }
});
