/**
 * telegram_bot.js
 * V2.0 - 라이브러리 의존성 제거 및 보안 헤더(JWT) 탑재 버전
 */
(function() {
    // 1. 설정 (보안 키 및 주소)
    // 국장님의 프로젝트 Anon Key (공개되어도 되는 클라이언트용 키)
    const _KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZHFsd3hncWdzdm5hd21obGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODQ3NDIsImV4cCI6MjA4Mjc2MDc0Mn0.UKUvMOl58KuDH24seC3oSgla7mK5lr-vXjqtpalnl6k';
    
    // 정확한 함수 전체 주소 (v1/send-telegram 포함)
    const _URL = 'https://ifdqlwxgqgsvnawmhlfc.supabase.co/functions/v1/send-telegram';

    // 2. 전역 함수 등록
    // window.sendTalk("메시지 내용", "[말머리]") 형태로 사용
    window.sendTalk = async function(text, prefix = "[시스템 알림]") {
        const finalMessage = `${prefix}\n\n${text}\n(시간: ${new Date().toLocaleString('ko-KR')})`;
        
        console.log("📨 텔레그램 발송 시도...", text);

        try {
            // 3. fetch를 이용한 독립적 전송 (Supabase 라이브러리 없이 동작)
            const response = await fetch(_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // 👇 [핵심] 이 두 줄 덕분에 'JWT 검증 스위치'를 켜도 안전하게 통과됩니다.
                    "Authorization": "Bearer " + _KEY,
                    "apikey": _KEY
                },
                body: JSON.stringify({ message: finalMessage })
            });

            // 응답 처리
            if (response.ok) {
                console.log("%c✅ 텔레그램 전송 완료", "color: green; font-weight: bold;");
                return true;
            } else {
                const errData = await response.json();
                console.warn("❌ 텔레그램 전송 실패:", response.status, errData);
                return false;
            }

        } catch (e) {
            console.error("🔥 네트워크/코드 오류:", e);
            return false;
        }
    };

    console.log("🚀 알림 모듈(V2) 로드 완료 (라이브러리 독립형)");
})();