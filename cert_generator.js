/**
 * 출자증서 PDF 생성 모듈 (cert_generator.js)
 * @param {Object} memberData - 조합원 정보 (name, member_id, rrn_display, join_date 등)
 * @param {Number} totalAmount - ref_members에서 합산한 총 출자금액
 * @param {String} chairmanName - 이사장 이름 (DB에서 조회한 값)
 * @param {Object} supabaseClient - Supabase 클라이언트 객체 (직인 로드용)
 */
async function generateContributionCert(memberData, totalAmount, chairmanName, supabaseClient) {
    if (!window.jspdf) {
        alert('PDF 생성 라이브러리(jspdf)가 로드되지 않았습니다.');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // 1. 폰트 로드 (Pretendard)
        // (주의: 실제 서비스 시에는 폰트 Base64를 변수에 담아두고 쓰는 것이 속도면에서 유리합니다)
        const fontRes = await fetch('https://raw.githubusercontent.com/orioncactus/pretendard/master/packages/pretendard/dist/public/static/alternative/Pretendard-SemiBold.ttf');
        const fontBuffer = await fontRes.arrayBuffer();
        const fontBase64 = arrayBufferToBase64(fontBuffer);
        
        doc.addFileToVFS('Pretendard.ttf', fontBase64);
        doc.addFont('Pretendard.ttf', 'Pretendard', 'normal');
        doc.setFont('Pretendard');

        // 2. 직인 이미지 가져오기
        let sealDataUrl = null;
        if (supabaseClient) {
            try {
                const { data: blob } = await supabaseClient.storage.from('attachments').download('Official Seal.png');
                if (blob) sealDataUrl = await blobToDataURL(blob);
            } catch (e) { console.warn("직인 로드 실패:", e); }
        }

        // 3. 데이터 가공
        const today = new Date();
        const dateStr = `${today.getFullYear()}년 ${String(today.getMonth()+1).padStart(2,'0')}월 ${String(today.getDate()).padStart(2,'0')}일`;
        
        // 생년월일 (840914-1... -> 1984년 09월 14일)
        let birthStr = memberData.rrn_display || '';
        if (birthStr.length >= 6) {
            const yy = birthStr.substring(0, 2);
            const mm = birthStr.substring(2, 4);
            const dd = birthStr.substring(4, 6);
            const gender = birthStr.includes('-') ? birthStr.split('-')[1].charAt(0) : '1';
            const prefix = (gender === '3' || gender === '4') ? '20' : '19';
            birthStr = `${prefix}${yy}년 ${mm}월 ${dd}일`;
        }

        // 좌수 계산
        const shares = Math.floor(totalAmount / 10000);
        // 증서 번호 (올해연도-조합원번호뒷4자리)
        const certNo = `${today.getFullYear()}-${memberData.member_id ? memberData.member_id.split('-').pop() : '0000'}`;

        // 4. 그리기 시작
        
        // [테두리] 이중선 효과
        doc.setLineWidth(1.5);
        doc.rect(10, 10, 190, 277); // 바깥 굵은 선
        doc.setLineWidth(0.5);
        doc.rect(12, 12, 186, 273); // 안쪽 얇은 선

        // [타이틀]
        doc.setFontSize(32);
        doc.text("출 자 증 서", 105, 45, { align: "center" });

        // [증서번호]
        doc.setFontSize(11);
        doc.text(`증서번호 : ${certNo}`, 20, 60);

        // [메인 금액]
        doc.setFontSize(18);
        const moneyText = `일금 ${numberToKorean(totalAmount)} 원정 (₩${totalAmount.toLocaleString()})`;
        doc.text(moneyText, 105, 80, { align: "center" });
        doc.setLineWidth(0.5);
        doc.line(30, 85, 180, 85); // 금액 밑줄

        // [표 그리기]
        const startY = 100;
        const rowH = 14; 
        const labelX = 55; // 라벨 중심축
        const valueX = 85; // 값 시작점
        
        // 박스
        doc.rect(20, startY, 170, rowH * 5); 
        
        // 가로선
        for(let i=1; i<5; i++) doc.line(20, startY+(rowH*i), 190, startY+(rowH*i));
        // 세로선
        doc.line(75, startY, 75, startY+(rowH*5));

        // 내용 채우기 함수
        const drawRow = (idx, label, value) => {
            const yPos = startY + (rowH * idx) + 9;
            doc.setFontSize(12);
            doc.text(label, 47.5, yPos, { align: "center" }); // 라벨 칸 가운데
            doc.text(String(value), 80, yPos); // 값 칸 왼쪽 정렬 (여백 줌)
        };

        drawRow(0, "조합원 번호", memberData.member_id);
        drawRow(1, "성        명", memberData.name);
        drawRow(2, "생 년 월 일", birthStr);
        drawRow(3, "가 입 연 월 일", memberData.join_date || '-');
        drawRow(4, "출 자 좌 수", `${shares.toLocaleString()} 좌 (1좌 10,000원)`);
        // 납입연월일 삭제됨

        // [하단 문구]
        const msgY = startY + (rowH * 5) + 40;
        doc.setFontSize(14);
        doc.text("상기와 같이 출자하였으므로 용인모두의햇빛협동조합", 105, msgY, { align: "center" });
        doc.text("정관 제19조 제1항에 따라 이 증서를 드립니다.", 105, msgY + 10, { align: "center" });

        // [날짜]
        doc.setFontSize(15);
        doc.text(dateStr, 105, msgY + 35, { align: "center" });

        // [서명]
        doc.setFontSize(20);
        // 이사장 이름 동적 적용
        const signText = `용인모두의햇빛협동조합 이사장  ${chairmanName}`;
        doc.text(signText, 105, msgY + 60, { align: "center" });

        // [직인]
        if (sealDataUrl) {
            // 이사장 이름 끝부분 위에 도장 찍기 (좌표 미세 조정 가능)
            // 텍스트 길이 대략 계산해서 도장 위치 잡기
            const textWidth = doc.getTextWidth(signText);
            const sealX = 105 + (textWidth / 2) - 10; 
            doc.addImage(sealDataUrl, 'PNG', sealX, msgY + 48, 24, 24);
        }

        // [Footer]
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text("Yongin Solar Power Cooperative", 105, 275, { align: "center" });

        // 파일 저장
        doc.save(`${memberData.name}_출자증서.pdf`);

    } catch (e) {
        console.error(e);
        alert("PDF 생성 중 오류가 발생했습니다.");
    }
}

// [유틸] ArrayBuffer -> Base64
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
}

// [유틸] Blob -> DataURL
function blobToDataURL(blob) {
    return new Promise((r) => { const a = new FileReader(); a.onload = () => r(a.result); a.readAsDataURL(blob); });
}

// [유틸] 숫자 -> 한글 변환 (일금 일십만...)
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
        if (unitResult > 0){
            resultArray[i] = unitResult;
        }
    }

    for (let i = 0; i < resultArray.length; i++){
        if(!resultArray[i]) continue;
        resultString = String(resultArray[i]) + unitWords[i] + resultString;
    }
    return resultString;
}
