/**
 * [공통 함수] 텔레그램 봇에게 메시지를 발송하는 함수
 * @param {string} text - 보낼 메시지 내용
 * @param {string} prefix - (선택) 메시지 앞머리 말머리 (기본값: [시스템 알림])
 */
async function sendAlert(text, prefix = "[시스템 알림]") {
  // 1. 메시지 구성
  // 가독성을 위해 날짜와 시간을 함께 찍어주는 것이 좋습니다.
  const now = new Date().toLocaleString('ko-KR');
  const finalMessage = `${prefix}\n\nUser: ${text}\nTime: ${now}`;

  console.log("텔레그램 발송 시도:", finalMessage);

  try {
    // 2. Supabase Edge Function 호출 ('send-telegram'은 국장님이 배포한 함수 이름)
    const { data, error } = await supabase.functions.invoke('send-telegram', {
      body: { message: finalMessage }
    });

    if (error) {
      console.error("텔레그램 발송 실패(Supabase Error):", error);
      // 필요 시 여기에 '재시도 로직' 등을 추가할 수 있음
    } else {
      console.log("텔레그램 발송 성공!");
    }
  } catch (err) {
    // 네트워크 오류 등 예외 처리
    console.error("텔레그램 발송 중 치명적 오류:", err);
  }
} // End of sendAlert
