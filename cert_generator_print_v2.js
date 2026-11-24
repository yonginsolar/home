/*
Version: v1.2.0
Change: Share exact certificate drawing geometry between SVG preview and vector PDF.
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

const CERT_FONT_URL = '/assets/certificate-fonts/Pretendard-SemiBold.5e1c548732af.ttf';
let certPretendardFontBase64Promise = null;
let certPdfLibraryPromise = null;
function ensureCertPdfReady() {
    if (typeof window.jspdf?.jsPDF === 'function') return Promise.resolve();
    if (!certPdfLibraryPromise) certPdfLibraryPromise = new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        const finish=error=>{clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
        const timer=setTimeout(()=>finish(new Error('PDF_NOT_READY')),15000);
        script.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.integrity='sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk';script.crossOrigin='anonymous';
        script.onload=()=>finish(typeof window.jspdf?.jsPDF==='function'?null:new Error('PDF_NOT_READY'));
        script.onerror=()=>finish(new Error('PDF_NOT_READY'));document.head.appendChild(script);
    }).catch(error=>{certPdfLibraryPromise=null;throw error;});
    return certPdfLibraryPromise;
}

function buildContributionCertificatePreview(member,totalAmount,number,profile,issueDate) {
    ensureCertCompanyPrintProfile(profile,'출자증서 발급');
    return window.CoopCertificateTemplate.previewContribution({memberData:member,totalAmount,certNumber:number,companyProfile:profile,issueDate});
}

function trimCertCompanyValue(value) {
    return String(value == null ? '' : value).trim();
} // End of trimCertCompanyValue

function resolveCertCompanyName(info) {
    return trimCertCompanyValue(info?.company_name || info?.orgName);
} // End of resolveCertCompanyName

function resolveCertChairmanName(info, fallbackChairmanName) {
    return trimCertCompanyValue(info?.chairman_name || info?.ceoName || fallbackChairmanName);
} // End of resolveCertChairmanName

function buildCertCompanyContact(info) {
    const direct = trimCertCompanyValue(info?.company_contact);
    if (direct) return direct;

    const parts = [
        trimCertCompanyValue(info?.company_contact_name),
        trimCertCompanyValue(info?.company_contact_phone)
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(' ');

    return trimCertCompanyValue(info?.email);
} // End of buildCertCompanyContact

function buildCertWrappedTextLayout(doc, text, options = {}) {
    const value = String(text == null ? '' : text).trim();
    const maxWidth = Number(options.maxWidth || 150);
    const minFontSize = Math.max(11, Number(options.minFontSize || 11));
    let fontSize = Number(options.initialFontSize || 12);

    doc.setFontSize(fontSize);
    while (fontSize > minFontSize && value && doc.getTextWidth(value) > maxWidth) {
        fontSize -= 1;
        doc.setFontSize(fontSize);
    }

    let lines = value ? [value] : [''];
    if (value && doc.getTextWidth(value) > maxWidth) {
        lines = doc.splitTextToSize(value, maxWidth);
    }
    while (fontSize > minFontSize && lines.length > Number(options.maxLines || 2)) {
        fontSize -= 1;
        doc.setFontSize(fontSize);
        lines = value ? doc.splitTextToSize(value, maxWidth) : [''];
    }

    return {
        fontSize,
        lines: lines.length ? lines : ['']
    };
} // End of buildCertWrappedTextLayout

function drawCenteredCertWrappedText(doc, text, centerX, startY, options = {}) {
    const layout = buildCertWrappedTextLayout(doc, text, options);
    const lineHeight = Number(options.lineHeight || 7);
    doc.setFontSize(layout.fontSize);
    const lineWidths = layout.lines.map((line) => doc.getTextWidth(String(line)));

    layout.lines.forEach((line, index) => {
        doc.text(String(line), centerX, startY + (index * lineHeight), { align: 'center' });
    });

    const lastLine = String(layout.lines[layout.lines.length - 1] || '');
    return {
        ...layout,
        lineHeight,
        endY: startY + ((layout.lines.length - 1) * lineHeight),
        lastLineWidth: doc.getTextWidth(lastLine),
        maxLineWidth: lineWidths.reduce((maxWidth, width) => Math.max(maxWidth, width), 0)
    };
} // End of drawCenteredCertWrappedText

function drawCertSignatureBlock(doc, companyProfile, centerX, startY, options = {}) {
    const sealWidth = Number(options.sealWidth || 24);
    const sealCenterOffset = Number(options.sealCenterOffset || 0);
    const chairmanRightReserve = Math.max(0, (sealWidth / 2) - sealCenterOffset);
    const chairmanMaxWidth = Math.max(
        90,
        Number(options.maxWidth || 150) - ((companyProfile?.sealDataUrl || options.hasSeal) ? chairmanRightReserve : 0)
    );
    const companyLayout = drawCenteredCertWrappedText(
        doc,
        trimCertCompanyValue(companyProfile?.companyName),
        centerX,
        startY,
        {
            maxWidth: options.maxWidth || 150,
            initialFontSize: options.companyFontSize || 18,
            minFontSize: options.companyMinFontSize || 13,
            maxLines: options.companyMaxLines || 3,
            lineHeight: options.companyLineHeight || 7
        }
    );

    const chairmanStartY = companyLayout.endY + Number(options.gapBeforeChairman || 7);
    const chairmanLayout = drawCenteredCertWrappedText(
        doc,
        `이사장  ${trimCertCompanyValue(companyProfile?.chairmanName)}`,
        centerX,
        chairmanStartY,
        {
            maxWidth: chairmanMaxWidth,
            initialFontSize: options.chairmanFontSize || 22,
            minFontSize: options.chairmanMinFontSize || 15,
            maxLines: options.chairmanMaxLines || 2,
            lineHeight: options.chairmanLineHeight || 9
        }
    );

    const naturalSealX = centerX + (chairmanLayout.lastLineWidth / 2) - (sealWidth / 2) + sealCenterOffset;
    const naturalSealY = chairmanLayout.endY - Number(options.sealLift || 14);
    const minSealX = Number(options.minSealX);
    const maxSealRight = Number(options.maxSealRight);
    const minSealY = Number(options.minSealY);
    const maxSealBottom = Number(options.maxSealBottom);
    const sealX = Math.max(
        Number.isFinite(minSealX) ? minSealX : -Infinity,
        Math.min(naturalSealX, Number.isFinite(maxSealRight) ? maxSealRight - sealWidth : Infinity)
    );
    const sealY = Math.max(
        Number.isFinite(minSealY) ? minSealY : -Infinity,
        Math.min(naturalSealY, Number.isFinite(maxSealBottom) ? maxSealBottom - sealWidth : Infinity)
    );

    return {
        companyLayout,
        chairmanLayout,
        sealX,
        sealY
    };
} // End of drawCertSignatureBlock

async function getCertPretendardFontBase64() {
    if (!certPretendardFontBase64Promise) {
        certPretendardFontBase64Promise = (async () => {
            const fontRes = await fetch(CERT_FONT_URL);
            if (!fontRes.ok) {
                throw new Error(`폰트 로드 실패 (${fontRes.status})`);
            }
            const fontBuffer = await fontRes.arrayBuffer();
            return arrayBufferToBase64(fontBuffer);
        })().catch((error) => {
            certPretendardFontBase64Promise = null;
            throw error;
        });
    }
    return await certPretendardFontBase64Promise;
} // End of getCertPretendardFontBase64

async function fetchCertRemoteDataUrl(sourceUrl) {
    const response = await fetch(sourceUrl, { credentials: 'omit' });
    if (!response.ok) {
        throw new Error(`이미지 로드 실패 (${response.status})`);
    }
    return blobToDataURL(await response.blob());
} // End of fetchCertRemoteDataUrl

async function downloadCertStorageAssetDataUrl(supabaseClient, bucketName, assetRef) {
    if (!supabaseClient?.storage?.from) return '';
    const { data, error } = await supabaseClient.storage.from(bucketName).download(assetRef);
    if (error || !data) {
        throw error || new Error('이미지를 불러오지 못했습니다.');
    }
    return blobToDataURL(data);
} // End of downloadCertStorageAssetDataUrl

async function measureCertImageRatio(dataUrl) {
    if (!dataUrl) return 0;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.width > 0 ? img.height / img.width : 0);
        img.onerror = () => resolve(0);
        img.src = dataUrl;
    });
} // End of measureCertImageRatio

async function loadCertCompanyImageAsset(supabaseClient, bucketName, assetRef) {
    const source = trimCertCompanyValue(assetRef);
    if (!source) return { dataUrl: '', ratio: 0 };

    try {
        const dataUrl = /^(https?:|data:)/i.test(source)
            ? await fetchCertRemoteDataUrl(source)
            : await downloadCertStorageAssetDataUrl(supabaseClient, bucketName, source);

        return {
            dataUrl,
            ratio: await measureCertImageRatio(dataUrl)
        };
    } catch (_) {
        return { dataUrl: '', ratio: 0 };
    }
} // End of loadCertCompanyImageAsset

async function buildCertCompanyPrintProfile(supabaseClient, options = {}) {
    const info = await fetchReceiptIssuerInfo(supabaseClient, options?.coopId);
    const profile = {
        companyName: resolveCertCompanyName(info),
        chairmanName: resolveCertChairmanName(info, options?.fallbackChairmanName),
        address: trimCertCompanyValue(info?.company_address),
        contact: buildCertCompanyContact(info),
        bizNum: trimCertCompanyValue(info?.bizNum),
        logoPath: trimCertCompanyValue(info?.logo_horizontal_url),
        sealPath: trimCertCompanyValue(info?.seal_url),
        shareUnitAmount: Number(info?.member_export_share_unit_amount || 10000),
        logoDataUrl: '',
        logoRatio: 0,
        sealDataUrl: ''
    };

    const [logoAsset, sealAsset] = await Promise.all([
        loadCertCompanyImageAsset(supabaseClient, 'assets', profile.logoPath),
        loadCertCompanyImageAsset(supabaseClient, 'attachments', profile.sealPath)
    ]);

    profile.logoDataUrl = logoAsset.dataUrl;
    profile.logoRatio = logoAsset.ratio;
    profile.sealDataUrl = sealAsset.dataUrl;
    return profile;
} // End of buildCertCompanyPrintProfile

async function prepareContributionCertCompanyProfile(supabaseClient, options = {}) {
    const profile = await buildCertCompanyPrintProfile(supabaseClient, options);
    ensureCertCompanyPrintProfile(profile, '출자증서 발급');
    const shareUnitAmount = Number(profile.shareUnitAmount);
    if (!Number.isSafeInteger(shareUnitAmount) || shareUnitAmount <= 0) {
        throw new Error('출자증서 발급 전에 현재 조합의 출자 1좌 금액을 등록해주세요.');
    }
    if (!profile.sealDataUrl) {
        throw new Error('출자증서 발급 전에 현재 조합의 직인을 등록하고 이미지를 확인해주세요.');
    }
    return profile;
} // End of prepareContributionCertCompanyProfile

function ensureCertCompanyPrintProfile(profile, contextLabel) {
    if (!trimCertCompanyValue(profile?.companyName)) {
        throw new Error(`${contextLabel} 전에 회사 정보의 법인명(조합명)을 먼저 확인해주세요.`);
    }
    if (!trimCertCompanyValue(profile?.chairmanName)) {
        throw new Error(`${contextLabel} 전에 회사 정보의 이사장명을 먼저 확인해주세요.`);
    }
} // End of ensureCertCompanyPrintProfile
/**
 * 출자증서 PDF 생성 모듈 (Final Version - Validated)
 * - 로고 원본 비율 유지 (워터마크)
 * - 금액 완전 한글화 (일금 일십만 원정)
 * - 도장 위치 상향 조정
 * - [UPDATE] 개인/단체 구분 및 유효성 검사 추가
 */
function getContributionCertificateOrganizationIdentity(memberData) {
    const corporate = String(memberData?.corp_number || '').trim();
    const business = String(memberData?.business_number || '').trim();
    if (corporate) {
        const digits = corporate.replace(/\D/g, '');
        if (digits.length !== 13) throw new Error('법인등록번호를 확인해주세요.');
        return {label:'법인등록번호',value:digits.slice(0,6)+'-'+digits.slice(6)};
    }
    const digits = business.replace(/\D/g, '');
    if (digits.length !== 10) throw new Error('단체의 사업자·고유번호를 확인해주세요.');
    return {label:'사업자·고유번호',value:digits.slice(0,3)+'-'+digits.slice(3,5)+'-'+digits.slice(5)};
}
async function generateContributionCert(memberData, totalAmount, certNumber, chairmanName, supabaseClient, options = {}) {
    if (!window.jspdf) {
        throw new Error('PDF 라이브러리 로드 실패');
    }

    try {
        const companyProfile = options.companyProfile || await prepareContributionCertCompanyProfile(supabaseClient, {
            coopId: options?.coopId,
            fallbackChairmanName: chairmanName
        });
        ensureCertCompanyPrintProfile(companyProfile, '출자증서 발급');
        if (!Number.isSafeInteger(Number(companyProfile.shareUnitAmount)) || Number(companyProfile.shareUnitAmount) <= 0) {
            throw new Error('출자증서 발급 전에 현재 조합의 출자 1좌 금액을 등록해주세요.');
        }
        if (!companyProfile.sealDataUrl) {
            throw new Error('출자증서 발급 전에 현재 조합의 직인을 등록하고 이미지를 확인해주세요.');
        }

        // -----------------------------------------------------------
        // [UPDATE] 0. 데이터 유효성 검사 (Validation)
        // -----------------------------------------------------------

        // 1) 출자금 확인
        if (!totalAmount || totalAmount <= 0) {
            throw new Error("출자금이 확인되지 않습니다. 출자 내역을 다시 확인해주세요.");
        }

        if (memberData.member_type === '단체') getContributionCertificateOrganizationIdentity(memberData);


        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4'); // A4 세로

        // -----------------------------------------------------------
        // 1. 리소스 로드 (폰트 & 이미지)
        // -----------------------------------------------------------

        // (A) 폰트 (Pretendard SemiBold)
        const fontBase64 = await getCertPretendardFontBase64();
        doc.addFileToVFS('Pretendard.ttf', fontBase64);
        doc.addFont('Pretendard.ttf', 'Pretendard', 'normal');
        doc.setFont('Pretendard');

        const sealDataUrl = companyProfile.sealDataUrl || null;
        if (options?.requireSeal === true && !sealDataUrl) {
            throw new Error('출자증서 발급 전에 출자증서 설정에서 조합 직인을 등록해주세요.');
        }


        // -----------------------------------------------------------
        // 2. 디자인 그리기
        // -----------------------------------------------------------

        window.CoopCertificateTemplate.paintContribution(doc, {memberData,totalAmount,certNumber,companyProfile,issueDate:options.issueDate});
        const fileName = `${String(memberData.name || '조합원').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')}_출자증서.pdf`;
        if (options.output === 'preview') return { doc, fileName };
        // Existing administrator issuance keeps its original download flow.
        doc.save(fileName);

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
async function generateDonationReceipt(memberData, totalAmount, criteria, receiptNumber, chairmanName, supabaseClient, options = {}) {
    if (!window.jspdf) {
        throw new Error('PDF 라이브러리 로드 실패');
    }

    try {
        const companyProfile = options?.companyProfile || await buildCertCompanyPrintProfile(supabaseClient, {
            coopId: criteria?.coopId,
            fallbackChairmanName: chairmanName
        });
        ensureCertCompanyPrintProfile(companyProfile, '기부금 수령 확인서 발급');

        if (!totalAmount || totalAmount <= 0) {
            throw new Error("기부금 금액이 확인되지 않습니다.");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        // (A) 폰트
        const fontBase64 = await getCertPretendardFontBase64();
        doc.addFileToVFS('Pretendard.ttf', fontBase64);
        doc.addFont('Pretendard.ttf', 'Pretendard', 'normal');
        doc.setFont('Pretendard');

        if (typeof window.CoopCertificateTemplate?.paintDonationReceipt !== 'function') {
            throw new Error('증명서 서식 템플릿이 준비되지 않았습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.');
        }

        window.CoopCertificateTemplate.paintDonationReceipt(doc, {
            memberData,
            totalAmount,
            criteria,
            receiptNumber,
            companyProfile,
            issueDate: options?.issueDate || criteria?.issueDate
        });

        const safeName = String(memberData?.name || '조합원').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
        const fileName = `${safeName}_기부금수령확인서.pdf`;
        if (options?.output === 'preview' || criteria?.output === 'preview') {
            return { doc, fileName };
        }
        doc.save(fileName);
    } catch (e) {
        console.error(e);
        throw e;
    }
}

// ----------------------------------------------------
// 유틸리티 함수들
// ----------------------------------------------------
async function fetchReceiptIssuerInfo(supabaseClient, preferredCoopId = '') {
    if (!supabaseClient) return {};
    try {
        // [2026-03-15] tenant hardening: coop_id를 확인하지 못하면 발급기관 정보를 읽지 않는다.
        let coopId = trimCertCompanyValue(preferredCoopId);
        if (!coopId && typeof window !== 'undefined' && window.localStorage) {
            try {
                const storedUser = JSON.parse(window.localStorage.getItem('erp_user') || 'null');
                coopId = trimCertCompanyValue(storedUser?.coop_id);
            } catch (_) {
                coopId = '';
            }
        }
        if (!coopId && typeof supabaseClient.rpc === 'function') {
            try {
                const { data, error } = await supabaseClient.rpc('get_my_coop_id');
                if (!error) coopId = String(data || '').trim();
            } catch (_) {
                coopId = '';
            }
        }
        if (!coopId) return {};
        let query = supabaseClient
            .from('ref_company_info')
            .select('key, value')
            .eq('coop_id', coopId);
        const { data, error } = await query;
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
    const safeNumber = Number(number);
    if (!Number.isFinite(safeNumber) || safeNumber < 0) return '';

    const integerValue = Math.floor(safeNumber);
    if (integerValue === 0) return '영';

    const digitWords = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const smallUnits = ['', '십', '백', '천'];
    const largeUnits = ['', '만', '억', '조', '경'];
    const parts = [];
    let remaining = integerValue;
    let largeUnitIndex = 0;

    while (remaining > 0 && largeUnitIndex < largeUnits.length) {
        const chunk = remaining % 10000;
        if (chunk > 0) {
            const chunkDigits = String(chunk).padStart(4, '0');
            let chunkText = '';

            for (let i = 0; i < chunkDigits.length; i += 1) {
                const digit = Number(chunkDigits[i]);
                if (digit === 0) continue;
                const unitIndex = chunkDigits.length - 1 - i;
                chunkText += `${digitWords[digit]}${smallUnits[unitIndex]}`;
            }

            parts.unshift(`${chunkText}${largeUnits[largeUnitIndex]}`);
        }

        remaining = Math.floor(remaining / 10000);
        largeUnitIndex += 1;
    }

    return parts.join('');
} // End of numberToKorean
