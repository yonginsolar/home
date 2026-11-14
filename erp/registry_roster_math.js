/* 0.2.13 · 기존 시청용 명부 계산14함수·미가입 승인대기 서버판정 호환. */
(function(root){'use strict';
function normalizeMemberExportShareUnitAmount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return Math.round(numeric);
}

function formatMemberExportRatio(ratio) {
    const numeric = Number(ratio);
    if (!Number.isFinite(numeric)) return 0;
    return Number(numeric.toFixed(2));
}

function formatMemberExportShareCount(capitalAmount, shareUnitAmount) {
    const capital = Number(capitalAmount || 0);
    const unit = normalizeMemberExportShareUnitAmount(shareUnitAmount);
    if (!unit) return '';
    return Number((capital / unit).toFixed(3));
}

function formatMemberExportBirthDateText(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g, '.') + '.';
    if (/^\d{4}\.\d{2}\.\d{2}\.?$/.test(raw)) return raw.endsWith('.') ? raw : `${raw}.`;
    return '-';
}

function formatMemberExportBirthDateFromRrnDisplay(rrnDisplay) {
    const raw = String(rrnDisplay || '').trim();
    const match = raw.match(/^(\d{2})(\d{2})(\d{2})-(\d)/);
    if (!match) return '-';
    const [, yy, mm, dd, centuryCode] = match;
    const centuryMap = {
        '1': '19',
        '2': '19',
        '5': '19',
        '6': '19',
        '3': '20',
        '4': '20',
        '7': '20',
        '8': '20',
        '9': '18',
        '0': '18'
    };
    const century = centuryMap[centuryCode];
    if (!century) return '-';
    return `${century}${yy}.${mm}.${dd}.`;
}

function formatMemberExportAmountDisplay(value) {
    const normalized = String(value ?? '').replace(/,/g, '').trim();
    const amount = Number(normalized || 0);
    if (!Number.isFinite(amount)) return '0';
    return amount.toLocaleString('ko-KR');
}

function formatMemberExportIdentityValue(record) {
    const memberType = String(record?.member_type || '').trim();
    if (memberType === '단체') {
        return String(record?.corp_number || record?.business_number || '-').trim() || '-';
    }
    const birthDateText = formatMemberExportBirthDateText(record?.birth_date);
    if (birthDateText !== '-') return birthDateText;
    return formatMemberExportBirthDateFromRrnDisplay(record?.rrn_display);
}

function normalizeMemberExportDateValue(value) {
    const safeValue = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(safeValue) ? safeValue : '';
}

function isTestMemberExport(record, confirmedTestNumbers) {
    // Confirmed election rehearsal identities only; never infer from names, blanks or capital.
    const identities = [
        ['07e99e55-bc64-432c-828d-66817d80c0d6', 'QA-ELECT-20261019-C'],
        ['e4a11490-7c88-43ff-9c6b-b010a98f65dc', 'QA-ELECT-20261019-B']
    ];
    const id = String(record?.id || '').trim().toLowerCase();
    if (id) return identities.some(([testId]) => id === testId);
    // Use current numbers from the already-authorized UUID roster, including an empty set.
    if (confirmedTestNumbers && typeof confirmedTestNumbers.has === 'function') return confirmedTestNumbers.has(String(record?.member_id || '').trim());
    // The existing PIN-protected export returns member numbers, not UUIDs.
    const coopId = String(record?.coop_id || (typeof g_adminMemberRuntime === 'object' ? g_adminMemberRuntime?.coop_id : '') || '').trim();
    return coopId === 'a4e65bb0-aa8e-4cef-a895-cd7865a67fef'
        && identities.some(([, number]) => String(record?.member_id || '').trim() === number);
}

function isWithdrawnMemberExport(record) {
    return ['탈퇴','탈퇴완료','withdrawn','withdrawal_completed'].includes(String(record?.status || '').trim().toLowerCase());
}

function filterMemberExportRecordsByCutoffDate(records, cutoffDate, confirmedTestNumbers) {
    const safeRecords = (Array.isArray(records) ? records : []).filter(record => !isWithdrawnMemberExport(record)
        && !isTestMemberExport(record, confirmedTestNumbers) && String(record?.status || '').trim() !== '승인대기');
    const safeCutoffDate = normalizeMemberExportDateValue(cutoffDate);
    if (!safeCutoffDate) return safeRecords.slice();
    return safeRecords.filter((record) => {
        const joinDate = normalizeMemberExportDateValue(record?.join_date);
        return !joinDate || joinDate <= safeCutoffDate;
    });
}

function validateCityReportMembership(records, membership, cutoffDate, coopId) {
    if (!/^\d{4}-12-31$/.test(cutoffDate) || !Array.isArray(membership) || records.length !== membership.length) {
        throw new Error('MEMBER_EXPORT_READ_INCOMPLETE');
    }
    const byId = new Map(membership.map(row => [String(row?.member_uid || ''), row]));
    if (byId.size !== membership.length || byId.has('')) throw new Error('MEMBER_EXPORT_LIST_CHANGED');
    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
        && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
    const ids = new Set(), review = [];
    for (const record of records) {
        const id = String(record?.id || '');
        const proof = byId.get(id);
        if (!id || ids.has(id) || !proof || (coopId && record.coop_id !== coopId)
            || !Array.isArray(proof.review_codes) || proof.review_codes.some(code => typeof code !== 'string')
            || ![true, false, null].includes(proof.is_member_on_cutoff)
            || !record.updated_at || !proof.member_updated_at
            || !Number.isFinite(Date.parse(record.updated_at))
            || Date.parse(record.updated_at) !== Date.parse(proof.member_updated_at)) throw new Error('MEMBER_EXPORT_LIST_CHANGED');
        ids.add(id);
        if (isTestMemberExport(record)) continue;
        // 시청용 서버가 명시한 미가입 승인대기만 제외한다. 과거 가입일만 있는 불명확 이력은 유지한다.
        if (String(record.status || '').trim().toLowerCase() === '승인대기'
            && (record.join_date === null || (validDate(record.join_date) && record.join_date > cutoffDate))
            && proof.is_member_on_cutoff === false && proof.joined_on === null
            && proof.ended_on === null && proof.review_codes.length === 0) continue;
        if (proof.is_member_on_cutoff === null || proof.review_codes.length) {
            review.push({ record, codes: proof.review_codes.length ? proof.review_codes : ['MEMBERSHIP_PERIOD_UNCONFIRMED'] });
        } else if (!validDate(proof.joined_on)
            || (proof.ended_on !== null && (!validDate(proof.ended_on) || proof.ended_on < proof.joined_on))
            || proof.is_member_on_cutoff !== (proof.joined_on <= cutoffDate && (!proof.ended_on || proof.ended_on > cutoffDate))) {
            throw new Error('MEMBER_EXPORT_READ_INCOMPLETE');
        }
    }
    if (review.length) {
        const error = new Error('CITY_ROSTER_REVIEW_REQUIRED');
        error.cityReview = review;
        throw error;
    }
    return byId;
}

function filterCityReportMembersByMembership(records, cutoffDate, membership) {
    const byId = validateCityReportMembership(records, membership, cutoffDate);
    return records.filter(record => !isTestMemberExport(record) && byId.get(String(record.id)).is_member_on_cutoff === true);
}

function buildMemberExportRows(records, options = {}) {
    const safeRecords = Array.isArray(records) ? records : [];
    const cutoffDate = String(options.cutoffDate || '').trim();
    const shareUnitAmount = normalizeMemberExportShareUnitAmount(options.shareUnitAmount);
    const snapshotMap = options.snapshotMap || {};
    const exportType = String(options.exportType || 'public');
    const eligibleRecords = exportType === 'city-report'
        ? filterCityReportMembersByMembership(safeRecords, cutoffDate, options.cityMembership)
        : filterMemberExportRecordsByCutoffDate(safeRecords, cutoffDate, options.confirmedTestNumbers);

    const normalizedRecords = eligibleRecords.map((record) => {
        const memberId = String(record.member_id || '').trim();
        const capitalAmount = Number(normalizeMemberExportDateValue(cutoffDate)
            ? (snapshotMap[memberId] ?? 0) : (record.total_capital ?? 0));
        return {
            ...record,
            member_id: memberId,
            capitalAmount
        };
    });

    const totalCapital = normalizedRecords.reduce((sum, record) => sum + Number(record.capitalAmount || 0), 0);
    const overLimitMembers = [];

    // Allocate hundredths of a percent by largest remainder, not independent rounding.
    // Decimal integer weights avoid floating-point drift; equal remainders use stable IDs.
    const decimalWeights = normalizedRecords.map(record => {
        const amount = record.capitalAmount;
        if (!Number.isFinite(amount)) throw new Error('출자금액을 확인한 뒤 다시 다운로드해 주세요.');
        const [coefficient, exponent = '0'] = String(amount).toLowerCase().split('e');
        const fractionLength = (coefficient.split('.')[1] || '').length;
        return { units: BigInt(coefficient.replace('.', '')), scale: fractionLength - Number(exponent) };
    });
    const commonScale = decimalWeights.reduce((scale, weight) => Math.max(scale, weight.scale), 0);
    const weights = decimalWeights.map(weight => weight.units * (10n ** BigInt(commonScale - weight.scale)));
    const exactTotal = weights.reduce((sum, amount) => sum + amount, 0n);
    const ratioUnits = normalizedRecords.map(() => 0);
    if (exactTotal > 0n) {
        const remainders = weights.map((amount, index) => {
            const numerator = amount * 10000n;
            const remainder = ((numerator % exactTotal) + exactTotal) % exactTotal;
            ratioUnits[index] = Number((numerator - remainder) / exactTotal);
            if (!Number.isSafeInteger(ratioUnits[index])) throw new Error('출자금액을 확인한 뒤 다시 다운로드해 주세요.');
            const record = normalizedRecords[index];
            return { index, remainder, key: String(record.id || record.member_id || '') };
        });
        const remaining = 10000 - ratioUnits.reduce((sum, units) => sum + units, 0);
        remainders.sort((a, b) => a.remainder !== b.remainder
            ? (a.remainder > b.remainder ? -1 : 1)
            : (a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index));
        for (let index = 0; index < remaining; index++) ratioUnits[remainders[index].index]++;
    }

    const rows = normalizedRecords.map((record, index) => {
        const ratio = totalCapital > 0 ? (Number(record.capitalAmount || 0) / totalCapital) * 100 : 0;
        const normalizedRatio = ratioUnits[index] / 100;
        const overLimit = formatMemberExportRatio(ratio) > 30;
        if (overLimit) {
            overLimitMembers.push({ name: record.name || '-', ratio: normalizedRatio });
        }

        const commonFields = {
            "순번": index + 1,
            "조합원번호": record.member_id || '-',
            "이름": record.name || '-',
            "유형": record.member_type || '-',
            "상태": record.status || '-',
            "가입일": record.join_date || '',
            "출자좌수": formatMemberExportShareCount(record.capitalAmount, shareUnitAmount),
            "출자금액": formatMemberExportAmountDisplay(record.capitalAmount),
            "비율(%)": normalizedRatio,
            "30% 초과 여부": overLimit ? '주의' : ''
        };

        if (exportType === 'secret') {
            return {
                ...commonFields,
                "연락처": record.phone || '-',
                "주소": record.address || '-',
                "주민/사업자번호(전체)": record.decrypted_rrn || '-',
                "은행명": record.bank_name || '-',
                "예금주": record.account_holder || '-',
                "계좌번호(전체)": record.decrypted_account || '-'
            };
        }

        if (exportType === 'city-report') {
            return {
                "연번": 0,
                "성명(법인명)": record.name || '-',
                "생년월일(법인등록번호)": formatMemberExportIdentityValue(record),
                "출자좌수": formatMemberExportShareCount(record.capitalAmount, shareUnitAmount),
                "출자금액": formatMemberExportAmountDisplay(record.capitalAmount),
                "비율": normalizedRatio,
                "30% 초과 여부": overLimit ? '주의' : ''
            };
        }

        return {
            ...commonFields,
            "연락처": record.phone || '-',
            "주소": record.address || '-'
        };
    });

    if (exportType === 'city-report') {
        rows.forEach((row, index) => {
            row['연번'] = index + 1;
        });
    }

    const missingJoinDateCount = normalizedRecords.filter(record => !normalizeMemberExportDateValue(record.join_date)).length;
    return { rows, overLimitMembers, totalCapital, missingJoinDateCount };
}
root.CoopRegistryRosterMath=Object.freeze({build:buildMemberExportRows,validate:validateCityReportMembership});
})(typeof window==='undefined'?globalThis:window);
