/**
 * 출자증서 PDF 생성 모듈 (업그레이드 버전)
 * - 로고 워터마크 추가 (assets/logo_length.png)
 * - DB에서 발급받은 증서 번호 사용
 */
async function generateContributionCert(memberData, totalAmount, certNumber, chairmanName, supabaseClient) {
    if (!window.jspdf) {
        alert('PDF 라이브러리 오류');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        // a4 크기, 세로 방향
        const doc = new jsPDF('p', 'mm', 'a4'); 

        // -----------------------------------------------------------
        // 1. 리소스 로드 (폰트 & 이미지)
        // -----------------------------------------------------------
        
        // (A) 폰트 로드 (Pretendard)
        const fontRes = await fetch('https://raw.githubusercontent.com/orioncactus/pretendard/master/packages/pretendard/dist/public/static/alternative/Pretendard-SemiBold.ttf');
        const fontBuffer = await fontRes.arrayBuffer();
        doc.addFileToVFS('Pretendard.ttf', arrayBufferToBase64(fontBuffer));
        doc.addFont('Pretendard.ttf', 'Pretendard', 'normal');
        doc.setFont('Pretendard');

        // (B) 직인 이미지 (attachments 버킷)
        let sealDataUrl = null;
        try {
            const { data: sealBlob } = await supabaseClient.storage.from('attachments').download('Official Seal.png');
            if (sealBlob) sealDataUrl = await blobToDataURL(sealBlob);
        } catch (e) { console.warn("직인 로드 실패:", e); }

        // (C) 로고 이미지 (assets 버킷 - logo_length.png)
        let logoDataUrl = null;
        try {
            const { data: logoBlob } = await supabaseClient.storage.from('assets').download('logo_length.png');
            if (logoBlob) logoDataUrl = await blobToDataURL(logoBlob);
        } catch (e) { console.warn("로고 로드 실패:", e); }


        // -----------------------------------------------------------
        // 2. 디자인 그리기
        // -----------------------------------------------------------

        // [배경 워터마크] 로고가 있다면 중앙에 연하게 깔기
        if (logoDataUrl) {
            doc.saveGraphicsState(); // 현재 그래픽 상태 저장
            doc.setGState(new doc.GState({ opacity: 0.15 })); // 투명도 15% 설정
            
            // 이미지 크기 계산 (가로 140mm 정도로 조정, 비율 유지)
            // A4 가로가 210mm이므로 중앙 정렬: (210 - 140) / 2 = 35
            // 높이는 비율에 맞게 자동 계산된다고 가정하거나 적당히 잡음 (예: 40mm)
            // logo_length.png가 가로형이라고 가정
            doc.addImage(logoDataUrl, 'PNG', 35, 120, 140, 40, '', 'CENTER'); 
            
            doc.restoreGraphicsState(); // 투명도 원복
        }

        // [테두리]
        doc.setLineWidth(1.5);
        doc.rect(10, 10, 190, 277);
        doc.setLineWidth(0.5);
        doc.rect(12, 12, 186, 273);

        // [데이터 가공]
        const today = new Date();
        const dateStr = `${today.getFullYear()}년 ${String(today.getMonth()+1).padStart(2,'0')}월 ${String(today.getDate()).padStart(2,'0')}일`;
        
        // 생년월일 변환
        let birthStr = memberData.rrn_display || '';
        if (birthStr.length >= 6) {
            const yy = birthStr.substring(0, 2);
            const mm = birthStr.substring(2, 4);
            const dd = birthStr.substring(4, 6);
            const gender = birthStr.includes('-') ? birthStr.split('-')[1].charAt(0) : '1';
            const prefix = (gender === '3' || gender === '4') ? '20' : '19';
            birthStr = `${prefix}${yy}년 ${mm}월 ${dd}일`;
        }

        const shares = Math.floor(totalAmount / 10000);

        // [타이틀]
        doc.setFontSize(32);
        doc.text("출 자 증 서", 105, 45, { align: "center" });

        // [증서번호] - DB에서 받은 번호 사용
        doc.setFontSize(11);
        doc.text(`증서번호 : ${certNumber}`, 20, 60);

        // [금액]
        doc.setFontSize(18);
        const moneyText = `일금 ${numberToKorean(totalAmount)} 원정 (₩${totalAmount.toLocaleString()})`;
        doc.text(moneyText, 105, 80, { align: "center" });
        doc.setLineWidth(0.5);
        doc.line(30, 85, 180, 85);

        // [표]
        const startY = 100;
        const rowH = 14; 
        
        doc.rect(20, startY, 170, rowH * 5); 
        for(let i=1; i<5; i++) doc.line(20, startY+(rowH*i), 190, startY+(rowH*i));
        doc.line(75, startY, 75, startY+(rowH*5));

        const drawRow = (idx, label, value) => {
            const yPos = startY + (rowH * idx) + 9;
            doc.setFontSize(12);
            doc.text(label, 47.5, yPos, { align: "center" });
            doc.text(String(value), 80, yPos);
        };

        drawRow(0, "조합원 번호", memberData.member_id);
        drawRow(1, "성        명", memberData.name);
        drawRow(2, "생 년 월 일", birthStr);
        drawRow(3, "가 입 연 월 일", memberData.join_date || '-');
        drawRow(4, "출 자 좌 수", `${shares.toLocaleString()} 좌`);

        // [하단]
        const msgY = startY + (rowH * 5) + 40;
        doc.setFontSize(14);
        doc.text("상기와 같이 출자하였으므로 용인모두의햇빛협동조합", 105, msgY, { align: "center" });
        doc.text("정관 제19조 제1항에 따라 이 증서를 드립니다.", 105, msgY + 10, { align: "center" });

        doc.setFontSize(15);
        doc.text(dateStr, 105, msgY + 35, { align: "center" });

        doc.setFontSize(20);
        const signText = `용인모두의햇빛협동조합 이사장  ${chairmanName}`;
        doc.text(signText, 105, msgY + 60, { align: "center" });

        if (sealDataUrl) {
            const textWidth = doc.getTextWidth(signText);
            const sealX = 105 + (textWidth / 2) - 10; 
            doc.addImage(sealDataUrl, 'PNG', sealX, msgY + 48, 24, 24);
        }

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text("Yongin Solar Power Cooperative", 105, 275, { align: "center" });

        doc.save(`${memberData.name}_출자증서.pdf`);

    } catch (e) {
        console.error(e);
        alert("생성 오류: " + e.message);
    }
}

// 유틸 함수들
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
}
function blobToDataURL(blob) {
    return new Promise((r) => { const a = new FileReader(); a.onload = () => r(a.result); a.readAsDataURL(blob); });
}
function numberToKorean(number) {
    const inputNumber  = number < 0 ? false : number;
    const unitWords    = ['', '만', '억', '조', '경'];
    const splitUnit    = 10000;
    const splitCount   = unitWords.length;
    const resultArray  = [];
    let resultString   = '';
    for (let i = 0; i < splitCount; i++){
        let unitResult = (inputNumber % Math.pow(splitUnit, i + 1)) / Math.pow(splitUnit, i);
        unitResult = Math.floor(unitResult);
        if (unitResult > 0) resultArray[i] = unitResult;
    }
    for (let i = 0; i < resultArray.length; i++){
        if(!resultArray[i]) continue;
        resultString = String(resultArray[i]) + unitWords[i] + resultString;
    }
    return resultString;
}
