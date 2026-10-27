/* v1.0.0 — Exact existing member import normalization, no Auth/data access. */
(function(root){'use strict';
const getAdminMemberKstDateString=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function normalizeRrnDisplay(value) {
const digits = String(value || '').replace(/[^0-9]/g, '');
if (!digits) return '';
if (digits.length !== 13) return '';
return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

function normalizeBusinessNumberDisplay(value) {
const digits = String(value || '').replace(/[^0-9]/g, '');
if (!digits) return '';
if (digits.length !== 10) return '';
return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function normalizeCorpNumberDisplay(value) {
const digits = String(value || '').replace(/[^0-9]/g, '');
if (!digits) return '';
if (digits.length !== 13) return '';
return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

function maskRrnDisplay(rrnDisplay) {
const normalized = normalizeRrnDisplay(rrnDisplay);
if (!normalized) return '-';
return `${normalized.slice(0, 8)}******`;
}

function normalizeMemberImportDate(value) {
if (value === null || value === undefined || value === '') return null;

if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
  const parsed = XLSX.SSF.parse_date_code(value);
  if (parsed && parsed.y && parsed.m && parsed.d) {
    return normalizeMemberImportDate(`${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`);
  }
}

if (value instanceof Date && !isNaN(value.getTime())) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

const raw = String(value).trim();
if (!raw) return null;
const normalized = raw.replace(/\./g, '-').replace(/\//g, '-');
const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
if (match) {
  const [, year, month, day] = match.map(Number);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day); parsed.setUTCHours(0,0,0,0);
  if (year >= 1 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) {
    return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
}
return null;
}

function normalizeMemberImportPhone(value) {
const digits = String(value ?? '').replace(/\D/g, '');
if (!digits) return '';
const fixed = digits.length === 10 && !digits.startsWith('0') ? `0${digits}` : digits;
if (fixed.length === 11) return `${fixed.slice(0,3)}-${fixed.slice(3,7)}-${fixed.slice(7)}`;
if (fixed.length === 10) return `${fixed.slice(0,3)}-${fixed.slice(3,6)}-${fixed.slice(6)}`;
return fixed;
}

function normalizeMemberImportRow(row, index) {
const pick = (...keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return '';
};

const joinDateRaw = pick('가입일', 'join_date');
const capitalRaw = pick('납입출자금', '출자금', '출자금액', 'capital_amount');
const capitalDateRaw = pick('출자금 납입일', '납입일', '출자금납입일', 'capital_date');
const capitalText = String(capitalRaw).trim();
const capitalAmount = capitalText === '' ? null : /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(capitalText) ? Number(capitalText.replace(/,/g,'')) : NaN;
const memberType = String(pick('유형', 'member_type')).trim();
const status = String(pick('상태', 'status')).trim();
const isGroup = memberType === '단체';
const rrnRaw = pick('주민등록번호', '주민번호', 'rrn');
const businessRaw = pick('사업자번호', '사업자등록번호', '고유번호', '사업자·고유번호', 'business_number');
const corpRaw = pick('법인번호', '법인등록번호', 'corp_number');
const phoneRaw = String(pick('연락처', '전화번호', 'phone')).trim();
const name = isGroup
  ? String(pick('단체명', '법인명', '상호', '이름', 'name')).trim()
  : String(pick('이름', '성명', 'name', '단체명')).trim();
const rrn = normalizeRrnDisplay(rrnRaw);
const businessNumber = normalizeBusinessNumberDisplay(businessRaw);
const corpNumber = normalizeCorpNumberDisplay(corpRaw);
const identifierDisplay = isGroup
  ? (businessNumber || corpNumber || '-')
  : maskRrnDisplay(rrn);
const normalized = {
  rowNo: Number.isInteger(row.__rowNum__) ? row.__rowNum__ + 1 : index + 2,
  source_row: { ...row },
  name,
  email: String(pick('이메일', 'email')).trim(),
  phone: normalizeMemberImportPhone(phoneRaw),
  birth_date: null,
  member_type: memberType,
  status,
  address: String(pick('주소', 'address')).trim(),
  member_id: String(pick('조합원번호', 'member_id')).trim(),
  join_category: String(pick('가입구분', 'join_category')).trim(),
  join_date: normalizeMemberImportDate(joinDateRaw),
  capital_amount: capitalAmount,
  capital_date: normalizeMemberImportDate(capitalDateRaw),
  admin_memo: String(pick('관리메모', '비고', 'admin_memo')).trim(),
  rrn,
  business_number: businessNumber,
  corp_number: corpNumber,
  representative_name: isGroup ? String(pick('대표자명', '대표자', 'representative_name')).trim() : '',
  contact_name: isGroup ? String(pick('담당자명', '담당자', 'contact_name')).trim() : '',
  contact_position: isGroup ? String(pick('담당자 직함', '담당자 직함/역할', '담당자 역할', 'contact_position')).trim() : '',
  identifier_display: identifierDisplay
};

const errors = [];
if (!normalized.name) errors.push(isGroup ? '단체명 누락' : '이름 누락');
if (normalized.email && (normalized.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email))) errors.push('이메일 형식 오류');
if (!normalized.member_type) errors.push('유형 누락');
else if (!['개인', '단체'].includes(normalized.member_type)) errors.push('유형 오류');
if (normalized.status && !['정상', '승인대기', '탈퇴', '제명'].includes(normalized.status)) errors.push('상태 오류');
if (String(joinDateRaw).trim() && !normalized.join_date) errors.push('가입일 형식 오류');
if (capitalAmount !== null && (!Number.isSafeInteger(capitalAmount) || capitalAmount < 0)) errors.push('출자금 형식 오류');
if (String(capitalDateRaw).trim() && (!normalized.capital_date || normalized.capital_date < '1900-01-01' || normalized.capital_date > getAdminMemberKstDateString())) errors.push('출자금 납입일 형식 오류');
if (Number.isSafeInteger(capitalAmount) && capitalAmount > 0 && !String(capitalDateRaw).trim()) errors.push('출자금 납입일 누락');
if (String(capitalDateRaw).trim() && !(Number.isSafeInteger(capitalAmount) && capitalAmount > 0)) errors.push('납입일에 맞는 출자금 확인 필요');
if (normalized.name.length > 100 || /[\x00-\x1f\x7f]/.test(normalized.name)) errors.push('이름·단체명 형식 오류');
if (!isGroup && /[0-9]/.test(normalized.name)) errors.push('이름 형식 오류');
if (String(rrnRaw).trim() && (isGroup || !/^[0-9 -]+$/.test(String(rrnRaw)) || !normalized.rrn)) errors.push('주민번호 형식 오류');
if (String(businessRaw).trim() && (!isGroup || !/^[0-9 -]+$/.test(String(businessRaw)) || !normalized.business_number)) errors.push('사업자번호 형식 오류');
if (String(corpRaw).trim() && (!isGroup || !/^[0-9 -]+$/.test(String(corpRaw)) || !normalized.corp_number)) errors.push('법인번호 형식 오류');
if (phoneRaw && (!/^[0-9 ()+.-]+$/.test(phoneRaw) || !/^0[0-9]{8,10}$/.test(normalized.phone.replace(/\D/g,'')))) errors.push('연락처 형식 오류');
for (const field of ['representative_name','contact_name','contact_position']) {
  if (normalized[field].length > 100 || /[\x00-\x1f\x7f]/.test(normalized[field])) errors.push('담당 정보 형식 오류');
}

normalized.errors = errors;
normalized.valid = errors.length === 0;
return normalized;
}

function memberImportPayload(rows) {
return rows.map(row => ({
    row_no:row.rowNo, name:row.name, email:row.email, phone:row.phone || null,
    birth_date:row.birth_date || null, member_type:row.member_type, status:row.status || null,
    address:row.address || null, member_id:row.member_id || null, join_category:row.join_category || null,
    admin_memo:row.admin_memo || null, rrn:row.member_type === '개인' ? row.rrn || null : null,
    business_number:row.member_type === '단체' ? row.business_number || null : null,
    corp_number:row.member_type === '단체' ? row.corp_number || null : null,
    representative_name:row.member_type === '단체' ? row.representative_name || null : null,
    contact_name:row.member_type === '단체' ? row.contact_name || null : null,
    contact_position:row.member_type === '단체' ? row.contact_position || null : null,
    join_date:row.join_date || null,
    ...(row.capital_amount === null || row.capital_amount === undefined ? {} : {capital_amount:row.capital_amount}),
    ...(row.capital_date ? {capital_date:row.capital_date} : {})
}));
}

root.TemporaryUploadMemberTools=Object.freeze({normalizeMemberImportRow,memberImportPayload});
})(window);
