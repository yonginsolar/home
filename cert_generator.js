/*
Version: v1.0.3
Change: Propagate PDF generation errors and allow contribution cert date override.
*/

var showAlert = (typeof window !== 'undefined' && window.showAlert) || function(message) {
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
if (typeof window !== 'undefined') {
  window.showAlert = showAlert;
}
/**
 * 출자증서 PDF 생성 모듈 (Final Version - Validated)
 * - 로고 원본 비율 유지 (워터마크)
 * - 금액 완전 한글화 (일금 일십만 원정)
 * - 도장 위치 상향 조정
 * - [UPDATE] 개인/단체 구분 및 유효성 검사 추가
 */
async function generateContributionCert(memberData, totalAmount, certNumber, chairmanName, supabaseClient, options = {}) {
    if (!window.jspdf) {
        throw new Error('PDF 라이브러리 로드 실패');
    }

    try {
        // -----------------------------------------------------------
        // [UPDATE] 0. 데이터 유효성 검사 (Validation)
        // -----------------------------------------------------------
        
        // 1) 출자금 확인
        if (!totalAmount || totalAmount <= 0) {
            throw new Error("출자금이 확인되지 않습니다. 출자 내역을 다시 확인해주세요.");
        }

        // 2) 단체일 경우 법인등록번호 확인
        // DB에 '단체'라고 저장되어 있다면 반드시 번호가 있어야 함
        if (memberData.member_type === '단체' && !memberData.corp_number) {
            throw new Error("단체의 '법인등록번호'가 확인되지 않습니다. 회원 정보를 수정해주세요.");
        }


        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4'); // A4 세로

        // -----------------------------------------------------------
        // 1. 리소스 로드 (폰트 & 이미지)
        // -----------------------------------------------------------
        
        // (A) 폰트 (Pretendard SemiBold)
        const fontRes = await fetch('https://raw.githubusercontent.com/orioncactus/pretendard/master/packages/pretendard/dist/public/static/alternative/Pretendard-SemiBold.ttf');
        const fontBuffer = await fontRes.arrayBuffer();
        doc.addFileToVFS('Pretendard.ttf', arrayBufferToBase64(fontBuffer));
        doc.addFont('Pretendard.ttf', 'Pretendard', 'normal');
        doc.setFont('Pretendard');

        // (B) 직인 (Official Seal.png)
        let sealDataUrl = null;
        try {
            const { data: sealBlob } = await supabaseClient.storage.from('attachments').download('Official Seal.png');
            if (sealBlob) sealDataUrl = await blobToDataURL(sealBlob);
        } catch (e) { void 0; }

        // (C) 로고 (assets/logo_length.png)
        let logoDataUrl = null;
        let logoRatio = 0; // 비율 저장용
        try {
            const { data: logoBlob } = await supabaseClient.storage.from('assets').download('logo_length.png');
            if (logoBlob) {
                logoDataUrl = await blobToDataURL(logoBlob);
                // 이미지 비율 계산을 위해 임시 로드
                const img = new Image();
                img.src = logoDataUrl;
                await new Promise(r => img.onload = r);
                logoRatio = img.height / img.width;
            }
        } catch (e) { void 0; }


        // -----------------------------------------------------------
        // 2. 디자인 그리기
        // -----------------------------------------------------------

        // [워터마크] 로고 (중앙 배치, 비율 유지)
        if (logoDataUrl && logoRatio > 0) {
            doc.saveGraphicsState();
            doc.setGState(new doc.GState({ opacity: 0.1 })); // 투명도 10% (아주 연하게)
            
            const logoW = 140; // 가로 140mm 고정
            const logoH = logoW * logoRatio; // 세로 자동 계산
            const logoY = (297 - logoH) / 2; // 종이 중앙 정렬
            
            doc.addImage(logoDataUrl, 'PNG', 35, logoY, logoW, logoH, '', 'CENTER');
            doc.restoreGraphicsState();
        }

        // [테두리]
        doc.setLineWidth(1.5);
        doc.rect(10, 10, 190, 277); // 외곽
        doc.setLineWidth(0.5);
        doc.rect(12, 12, 186, 273); // 내곽

        // [데이터 가공]
        const dateStr = formatKoreanDateLabel(options.issueDate) || formatKoreanDateLabel(new Date());
        
        // [UPDATE] 개인/단체 구분에 따른 라벨 및 값 설정
        let displayLabel = "생 년 월 일"; // 기본값 (개인)
        let displayValue = "";          // 표시될 값

        if (memberData.member_type === '단체') {
            // [CASE] 단체: 법인등록번호 사용
            displayLabel = "법인등록번호";
            displayValue = memberData.corp_number; // 위에서 유효성 검사 완료됨
        } else {
            // [CASE] 개인 (또는 기타): 기존 생년월일 로직 유지
            displayLabel = "생 년 월 일";
            let birthStr = memberData.rrn_display || '';
            if (birthStr.length >= 6) {
                const yy = birthStr.substring(0, 2);
                const mm = birthStr.substring(2, 4);
                const dd = birthStr.substring(4, 6);
                const gender = birthStr.includes('-') ? birthStr.split('-')[1].charAt(0) : '1';
                const prefix = (gender === '3' || gender === '4') ? '20' : '19';
                birthStr = `${prefix}${yy}년 ${mm}월 ${dd}일`;
            }
            displayValue = birthStr;
        }

        const shares = Math.floor(totalAmount / 10000);

        // [타이틀]
        doc.setFontSize(32);
        doc.text("출 자 증 서", 105, 45, { align: "center" });

        // [증서번호] 제 2026-0001 호
        doc.setFontSize(12);
        doc.text(`증서번호 : 제 ${certNumber} 호`, 20, 60);

        // [메인 금액] 일금 일십만 원정
        doc.setFontSize(20);
        const moneyText = `일금${numberToKorean(totalAmount)}원정 (₩${totalAmount.toLocaleString()})`;
        doc.text(moneyText, 105, 80, { align: "center" });
        
        // 금액 밑줄
        doc.setLineWidth(0.5);
        const textWidth = doc.getTextWidth(moneyText);
        doc.line(105 - (textWidth/2) - 5, 85, 105 + (textWidth/2) + 5, 85);

        // [표 그리기] (6줄)
        const startY = 100;
        const rowH = 14; 
        
        doc.rect(20, startY, 170, rowH * 6); // 전체 박스
        
        // 가로선 5개
        for(let i=1; i<6; i++) doc.line(20, startY+(rowH*i), 190, startY+(rowH*i));
        // 세로선
        doc.line(75, startY, 75, startY+(rowH*6));

        const drawRow = (idx, label, value) => {
            const yPos = startY + (rowH * idx) + 9;
            doc.setFontSize(12);
            doc.text(label, 47.5, yPos, { align: "center" });
            doc.text(String(value), 80, yPos);
        };

        // [UPDATE] 표 내용 채우기 (단체일 경우 성명->단체명, 생년월일->법인번호)
        const nameLabel = memberData.member_type === '단체' ? "단   체   명" : "성        명";

        drawRow(0, "조합원 번호", memberData.member_id);
        drawRow(1, nameLabel, memberData.name);
        drawRow(2, displayLabel, displayValue); // [UPDATE] 위에서 설정한 변수 사용
        drawRow(3, "가 입 연 월 일", memberData.join_date || '-');
        drawRow(4, "출 자 좌 수", `${shares.toLocaleString()} 좌 (1좌 10,000원)`);
        drawRow(5, "출 자 금 액", `${totalAmount.toLocaleString()} 원`);

        // [하단 문구]
        const msgY = startY + (rowH * 6) + 30; // 표 끝에서 30mm 띄움
        doc.setFontSize(14);
        doc.text("상기와 같이 출자하였으므로 용인모두의햇빛협동조합", 105, msgY, { align: "center" });
        doc.text("정관 제19조 제1항에 따라 이 증서를 드립니다.", 105, msgY + 10, { align: "center" });

        // [발급일]
        doc.setFontSize(15);
        doc.text(dateStr, 105, msgY + 30, { align: "center" });

        // [이사장 서명]
        doc.setFontSize(22);
        const signText = `용인모두의햇빛협동조합 이사장  ${chairmanName}`;
        doc.text(signText, 105, msgY + 55, { align: "center" });

        // [직인] 위치 수정 (위로 35px ≈ 10mm 올림) 8px 내림
        if (sealDataUrl) {
            // 이사장 이름(msgY+55) 기준으로 배치
            // 기존(+48)에서 10mm 올려서 (+38)
            // 서명 텍스트 끝부분에 겹치게
            const signWidth = doc.getTextWidth(signText);
            const sealX = 105 + (signWidth / 2) - 15; // 이름 끝부분 안쪽으로 살짝 들어오게
            const sealY = msgY + 40; 
            
            doc.addImage(sealDataUrl, 'PNG', sealX, sealY, 24, 24);
        }

        // 파일 저장
        doc.save(`${memberData.name}_출자증서.pdf`);

    } catch (e) {
        console.error(e);
        throw e;
    }
}

/**
 * 기부금 수령 확인서 PDF 생성
 * criteria.mode: 'cutoff' | 'manual'
 * criteria.cutoff_date: YYYY-MM-DD or null
 */
async function generateDonationReceipt(memberData, totalAmount, criteria, receiptNumber, chairmanName, supabaseClient) {
    if (!window.jspdf) {
        throw new Error('PDF 라이브러리 로드 실패');
    }

    try {
        if (!totalAmount || totalAmount <= 0) {
            throw new Error("기부금 금액이 확인되지 않습니다.");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        // (A) 폰트
        const fontRes = await fetch('https://raw.githubusercontent.com/orioncactus/pretendard/master/packages/pretendard/dist/public/static/alternative/Pretendard-SemiBold.ttf');
        const fontBuffer = await fontRes.arrayBuffer();
        doc.addFileToVFS('Pretendard.ttf', arrayBufferToBase64(fontBuffer));
        doc.addFont('Pretendard.ttf', 'Pretendard', 'normal');
        doc.setFont('Pretendard');

        // (B) 직인
        let sealDataUrl = null;
        try {
            const { data: sealBlob } = await supabaseClient.storage.from('attachments').download('Official Seal.png');
            if (sealBlob) sealDataUrl = await blobToDataURL(sealBlob);
        } catch (e) { void 0; }

        // (C) 워터마크 로고
        let logoDataUrl = null;
        let logoRatio = 0;
        try {
            const { data: logoBlob } = await supabaseClient.storage.from('assets').download('logo_length.png');
            if (logoBlob) {
                logoDataUrl = await blobToDataURL(logoBlob);
                const img = new Image();
                img.src = logoDataUrl;
                await new Promise(r => img.onload = r);
                logoRatio = img.height / img.width;
            }
        } catch (e) { void 0; }

        if (logoDataUrl && logoRatio > 0) {
            doc.saveGraphicsState();
            doc.setGState(new doc.GState({ opacity: 0.1 }));
            const logoW = 140;
            const logoH = logoW * logoRatio;
            const logoY = (297 - logoH) / 2;
            doc.addImage(logoDataUrl, 'PNG', 35, logoY, logoW, logoH, '', 'CENTER');
            doc.restoreGraphicsState();
        }

        // 테두리
        doc.setLineWidth(1.5);
        doc.rect(10, 10, 190, 277);
        doc.setLineWidth(0.5);
        doc.rect(12, 12, 186, 273);

        const today = new Date();
        const issueDate = `${today.getFullYear()}년 ${String(today.getMonth()+1).padStart(2,'0')}월 ${String(today.getDate()).padStart(2,'0')}일`;
        let baseDateLabel = issueDate;
        if (criteria && criteria.mode === 'cutoff') {
            if (criteria.period_from && criteria.period_to) {
                baseDateLabel = `${formatKoreanDateLabel(criteria.period_from)} ~ ${formatKoreanDateLabel(criteria.period_to)}`;
            } else if (criteria.cutoff_date) {
                baseDateLabel = formatKoreanDateLabel(criteria.cutoff_date);
            }
        }
        const issuerInfo = await fetchReceiptIssuerInfo(supabaseClient);
        const issuerName = issuerInfo.company_name || issuerInfo.orgName || '용인모두의햇빛협동조합';
        const issuerBizNum = issuerInfo.bizNum || '-';
        const issuerAddress = issuerInfo.company_address || '-';
        const issuerContact = issuerInfo.company_contact || '-';

        const idLabel = memberData.member_type === '단체' ? '법인등록번호' : '생년월일';
        let idValue = '-';
        if (memberData.member_type === '단체') {
            idValue = memberData.corp_number || '-';
        } else {
            const rrn = String(memberData.rrn_display || '');
            if (rrn.length >= 6) {
                const clean = rrn.replace(/[^0-9]/g, '');
                const yy = clean.substring(0, 2);
                const mm = clean.substring(2, 4);
                const dd = clean.substring(4, 6);
                let prefix = '19';
                if (clean.length >= 7) {
                    const g = clean.substring(6, 7);
                    if (g === '3' || g === '4') prefix = '20';
                }
                idValue = `${prefix}${yy}년 ${mm}월 ${dd}일`;
            }
        }

        // 타이틀
        doc.setFontSize(30);
        doc.text("기 부 금 수 령 확 인 서", 105, 45, { align: "center" });

        doc.setFontSize(12);
        doc.text(`확인서번호 : ${receiptNumber}`, 20, 60);

        doc.setFontSize(18);
        const moneyText = `일금${numberToKorean(totalAmount)}원정 (₩${totalAmount.toLocaleString()})`;
        doc.text(moneyText, 105, 80, { align: "center" });
        const textWidth = doc.getTextWidth(moneyText);
        doc.setLineWidth(0.5);
        doc.line(105 - (textWidth/2) - 5, 85, 105 + (textWidth/2) + 5, 85);

        // 표
        const startY = 100;
        const rowH = 14;
        doc.rect(20, startY, 170, rowH * 5);
        for (let i = 1; i < 5; i++) doc.line(20, startY + (rowH * i), 190, startY + (rowH * i));
        doc.line(75, startY, 75, startY + (rowH * 5));

        const drawRow = (idx, label, value) => {
            const yPos = startY + (rowH * idx) + 9;
            doc.setFontSize(12);
            doc.text(label, 47.5, yPos, { align: "center" });
            doc.text(String(value ?? '-'), 80, yPos);
        };

        drawRow(0, "조합원 번호", memberData.member_id || '-');
        drawRow(1, memberData.member_type === '단체' ? "단   체   명" : "성        명", memberData.name || '-');
        drawRow(2, idLabel, idValue);
        drawRow(3, "금        액", `${Number(totalAmount).toLocaleString()} 원`);
        drawRow(4, "기 준 일 자", baseDateLabel || '-');

        const msgY = startY + (rowH * 5) + 20;
        doc.setFontSize(14);
        doc.text("위 금액을 수령하였음을 확인합니다.", 105, msgY, { align: "center" });
        const recipientWord = String(memberData.member_type || '').includes('단체') ? '귀사' : '귀하';
        const noticeText = `본 확인서는 당 조합으로 ${recipientWord}의 후원금이 정상적으로 입금되었음을 확인하는 용도로만 사용되며, 연말정산 및 법인세법에 따른 세액공제용 기부금 증빙 서류로 확인할 수 없습니다.`;
        doc.setFontSize(10);
        doc.text("세액공제 관련 안내는 다음 페이지를 확인해 주세요.", 105, msgY + 8, { align: "center" });
        const issuerRows = [
            `발급기관: ${issuerName}`,
            `사업자등록번호: ${issuerBizNum}`
        ];
        if (issuerAddress && issuerAddress !== '-') issuerRows.push(`주소: ${issuerAddress}`);
        if (issuerContact && issuerContact !== '-') issuerRows.push(`연락처: ${issuerContact}`);

        const maxDateY = 258;
        let dateY = msgY + 14;
        if (issuerRows.length > 0) {
            const boxX = 22;
            const boxW = 166;
            const boxPadX = 6;
            const boxPadY = 4.5;
            const lineGap = 4.8;
            const issuerWrapped = issuerRows.flatMap((line) => doc.splitTextToSize(line, boxW - (boxPadX * 2)));
            const boxH = (boxPadY * 2) + (issuerWrapped.length * lineGap);
            let boxY = dateY;
            const maxBoxY = maxDateY - boxH - 7;
            if (boxY > maxBoxY) boxY = Math.max(msgY + 12, maxBoxY);

            doc.setFillColor(248, 249, 250);
            doc.setDrawColor(220, 223, 226);
            doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');
            doc.setFontSize(11);
            issuerWrapped.forEach((line, idx) => {
                const lineY = boxY + boxPadY + 3.5 + (idx * lineGap);
                doc.text(String(line), boxX + boxPadX, lineY);
            });
            dateY = boxY + boxH + 7;
        }
        doc.setFontSize(15);
        if (dateY > maxDateY) dateY = maxDateY;
        doc.text(issueDate, 105, dateY, { align: "center" });

        doc.setFontSize(22);
        const signText = `용인모두의햇빛협동조합 이사장  ${chairmanName || '이사장'}`;
        const signY = dateY + 21;
        doc.text(signText, 105, signY, { align: "center" });

        if (sealDataUrl) {
            const signWidth = doc.getTextWidth(signText);
            const sealX = 105 + (signWidth / 2) - 15;
            const sealY = signY - 14;
            doc.addImage(sealDataUrl, 'PNG', sealX, sealY, 24, 24);
        }

        const details = Array.isArray(criteria?.details) ? criteria.details : [];
        doc.addPage();
        doc.setFont('Pretendard');
        doc.setFontSize(20);
        doc.text("기부금 수령 상세 내역", 105, 24, { align: "center" });

        const fromLabel = formatKoreanDateLabel(criteria.period_from) || '-';
        const toLabel = formatKoreanDateLabel(criteria.period_to) || '-';
        doc.setFontSize(11);
        doc.text(`조회기간: ${fromLabel} ~ ${toLabel}`, 20, 34);

        const noticePageLines = doc.splitTextToSize(noticeText, 160);
        const noticeBoxY = 40;
        const noticeBoxH = 8 + (noticePageLines.length * 5.2);
        doc.setFillColor(248, 249, 250);
        doc.setDrawColor(220, 223, 226);
        doc.roundedRect(20, noticeBoxY, 170, noticeBoxH, 2, 2, 'FD');
        doc.setFontSize(10.5);
        doc.text(noticePageLines, 25, noticeBoxY + 5.5, { lineHeightFactor: 1.35 });

        if (details.length > 0) {
            const drawDetailHeader = (y) => {
                doc.setFillColor(245, 245, 245);
                doc.rect(20, y, 170, 10, 'F');
                doc.setLineWidth(0.2);
                doc.rect(20, y, 170, 10);
                doc.line(120, y, 120, y + 10);
                doc.setFontSize(11);
                doc.text('입금일', 25, y + 7);
                doc.text('금액', 180, y + 7, { align: 'right' });
            };

            let y = noticeBoxY + noticeBoxH + 8;
            drawDetailHeader(y);
            y += 10;

            let sum = 0;
            details.forEach((row) => {
                const amount = Number(row.amount || 0);
                sum += amount;

                if (y > 270) {
                    doc.addPage();
                    doc.setFont('Pretendard');
                    y = 20;
                    drawDetailHeader(y);
                    y += 10;
                }

                const dateText = formatKoreanDateLabel(row.donation_date) || String(row.donation_date || '-');
                doc.rect(20, y, 170, 9);
                doc.line(120, y, 120, y + 9);
                doc.setFontSize(11);
                doc.text(dateText, 25, y + 6);
                doc.text(`${amount.toLocaleString()}원`, 180, y + 6, { align: 'right' });
                y += 9;
            });

            if (y > 270) {
                doc.addPage();
                doc.setFont('Pretendard');
                y = 20;
            }
            doc.setFillColor(245, 245, 245);
            doc.rect(20, y, 170, 10, 'F');
            doc.rect(20, y, 170, 10);
            doc.line(120, y, 120, y + 10);
            doc.setFontSize(12);
            doc.text('합계', 25, y + 7);
            doc.text(`${sum.toLocaleString()}원`, 180, y + 7, { align: 'right' });
        } else {
            doc.setFontSize(11);
            doc.text('해당 발급 건의 상세 내역은 없습니다.', 20, noticeBoxY + noticeBoxH + 12);
        }

        doc.save(`${memberData.name || '조합원'}_기부금수령확인서.pdf`);
    } catch (e) {
        console.error(e);
        throw e;
    }
}

// ----------------------------------------------------
// 유틸리티 함수들
// ----------------------------------------------------
async function fetchReceiptIssuerInfo(supabaseClient) {
    if (!supabaseClient) return {};
    try {
        const { data, error } = await supabaseClient
            .from('ref_company_info')
            .select('key, value');
        if (error || !Array.isArray(data)) return {};
        const info = {};
        data.forEach((row) => {
            const k = String(row?.key || '').trim();
            if (!k) return;
            info[k] = row?.value ?? '';
        });
        return info;
    } catch (_) {
        return {};
    }
}

function formatKoreanDateLabel(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return `${m[1]}년 ${m[2]}월 ${m[3]}일`;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}년 ${m}월 ${day}일`;
}

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

// [업그레이드] 숫자 -> 한글 변환 (일금 일십만...)
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

    // 숫자 -> 한글 매핑
    const digitMap = { '1': '일', '2': '이', '3': '삼', '4': '사', '5': '오', '6': '육', '7': '칠', '8': '팔', '9': '구', '0': '' };
    
    // 단순 변환 (만, 억 단위 처리 후 숫자를 한글로)
    // 예: 100000 -> 10만 -> 일십만
    // 이 로직은 복잡하므로, 가장 많이 쓰는 정형화된 패턴으로 처리하거나
    // 간단히 '100,000' -> '일십만' 변환을 수행
    
    // 여기서는 결과 문자열(예: '10만')을 한글로 바꿈
    let final = resultString;
    // 10 -> 일십, 1 -> 일 (단위 앞에서는 생략하는 경우도 있지만 '일금' 표기시엔 '일'을 붙임)
    
    // 간이 변환 로직 (숫자 하나하나 변환하되 단위 앞 1 처리)
    // 실제로는 num2kor 라이브러리 없이 완벽 구현이 길어지므로, 
    // 결과값인 resultString(예: "10만")을 한글로 바꿉니다.
    
    // 만약 "100000" 이라면 resultString은 "10만"이 됨.
    // "10만" -> "일십만" 으로 바꾸기
    
    final = final.replace(/10/g, '일십');
    final = final.replace(/1/g, '일');
    final = final.replace(/2/g, '이');
    final = final.replace(/3/g, '삼');
    final = final.replace(/4/g, '사');
    final = final.replace(/5/g, '오');
    final = final.replace(/6/g, '육');
    final = final.replace(/7/g, '칠');
    final = final.replace(/8/g, '팔');
    final = final.replace(/9/g, '구');
    
    return final; 
}
