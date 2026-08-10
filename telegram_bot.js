/**
 * telegram_bot.js
 * V2.2 - 비활성화된 레거시 자유문 Telegram 중계의 클라이언트 호출 제거
 */
(function() {
    // 선거 재개 전까지 서버의 send-telegram 중계와 함께 비활성화한다.
    // 새 구현은 로그인 사용자·후보 신청 소유권을 서버에서 검증하는 전용 함수로 교체한다.
    window.sendTalk = async function() {
        console.info('ℹ️ 레거시 Telegram 알림 중계는 현재 비활성화되어 있습니다.');
        return false;
    };

    console.log('🚫 레거시 Telegram 알림 모듈(V2.2) 비활성 상태');
})();
