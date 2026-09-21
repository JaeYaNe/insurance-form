// 브라우저 없이 단위 테스트가 가능한 순수 함수 모음(검증·CSV·BOM·파일명·마스킹).
// 부작용 없음. app.js와 lib.test.mjs가 공유한다.

// CSV 컬럼 순서(고정). 수익자는 항상 1~3 컬럼이 존재하며 빈 값은 빈 컬럼으로 저장한다.
export const CSV_COLUMNS = [
  '동의여부',
  '이름', '생년월일', '연락처', '이메일', '주소', '주민등록번호', '직업',
  '피보험자_이름', '피보험자_관계', '피보험자_가입자동일',
  '수익자1_이름', '수익자1_관계', '수익자1_연락처',
  '수익자2_이름', '수익자2_관계', '수익자2_연락처',
  '수익자3_이름', '수익자3_관계', '수익자3_연락처',
  '납입계좌_은행', '납입계좌_번호', '납입계좌_예금주',
  '작성일시',
];

// 필수/형식 검증 --------------------------------------------------

export function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// 주민등록번호: 6자리-7자리(하이픈 선택).
export function isValidRRN(value) {
  return /^\d{6}-?\d{7}$/.test((value || '').trim());
}

// 휴대전화: 01X-XXX(X)-XXXX(하이픈 선택).
export function isValidPhone(value) {
  return /^01[0-9]-?\d{3,4}-?\d{4}$/.test((value || '').trim());
}

// 이메일(선택 입력 시에만 검증).
export function isValidEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((value || '').trim());
}

// 입력 자동 서식화 --------------------------------------------

// 숫자만 남기고 휴대전화 형식으로 자동 하이픈(3-4-4, 10자리는 3-3-4). 최대 11자리.
export function formatPhone(value) {
  const d = (value || '').replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) {
    // 10자리 계열: 3-3-4 구간(중간 입력 중)
    const mid = d.length <= 7 ? d.length - 3 : 3;
    return `${d.slice(0, 3)}-${d.slice(3, 3 + mid)}`;
  }
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

// 숫자만 남기고 주민번호 13자리를 6-7로 자동 하이픈.
export function formatRRN(value) {
  const d = (value || '').replace(/\D/g, '').slice(0, 13);
  if (d.length <= 6) return d;
  return `${d.slice(0, 6)}-${d.slice(6)}`;
}

// 화면 표시용 마스킹(저장값은 원문 유지). 뒷자리만 가린다.
export function maskRRN(value) {
  const digits = (value || '').replace(/-/g, '');
  if (digits.length < 7) return value || '';
  return `${digits.slice(0, 6)}-${digits[6]}******`;
}

export function maskAccount(value) {
  const raw = (value || '').replace(/\s/g, '');
  if (raw.length <= 4) return raw;
  return `${'*'.repeat(raw.length - 4)}${raw.slice(-4)}`;
}

// CSV 직렬화 -----------------------------------------------------

// RFC 4180 이스케이프: 쉼표/큰따옴표/개행 포함 시 큰따옴표로 감싸고 내부 "는 ""로.
export function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// 가입자 레코드를 CSV_COLUMNS 순서의 값 배열로 변환한다. 빈 값은 빈 문자열.
export function recordToRow(data) {
  const b = Array.isArray(data.beneficiaries) ? data.beneficiaries : [];
  const bene = (i) => b[i] || {};
  const insured = data.insured || {};
  const account = data.account || {};
  return [
    data.consent ? 'Y' : 'N',
    data.name || '',
    data.birth || '',
    data.phone || '',
    data.email || '',
    data.address || '',
    data.rrn || '',
    data.job || '',
    insured.name || '',
    insured.relation || '',
    insured.sameAsApplicant ? 'Y' : 'N',
    bene(0).name || '', bene(0).relation || '', bene(0).phone || '',
    bene(1).name || '', bene(1).relation || '', bene(1).phone || '',
    bene(2).name || '', bene(2).relation || '', bene(2).phone || '',
    account.bank || '',
    account.number || '',
    account.holder || '',
    data.createdAt || '',
  ];
}

// 헤더 + 1행 CSV 문자열(BOM 미포함).
export function buildCsv(data) {
  const header = CSV_COLUMNS.map(csvEscape).join(',');
  const row = recordToRow(data).map(csvEscape).join(',');
  return `${header}\r\n${row}\r\n`;
}

// Excel 한글 호환을 위해 UTF-8 BOM을 선두에 붙인다.
export function withBom(csv) {
  return `\ufeff${csv}`;
}

// 파일명/날짜 ----------------------------------------------------

export function formatDateYYYYMMDD(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function phoneLast4(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.slice(-4);
}

// 파일명 규칙: 이름_연락처뒤네자리_YYYYMMDD.csv (파일명 불가 문자는 _로 치환).
export function buildFilename(name, phone, date = new Date()) {
  const safeName = (name || '가입자').replace(/[\\/:*?"<>|]/g, '_').trim() || '가입자';
  return `${safeName}_${phoneLast4(phone)}_${formatDateYYYYMMDD(date)}.csv`;
}

// 저장 가능 여부(필수·형식). 오류 맵을 반환(빈 객체면 통과).
export function validateRecord(data) {
  const errors = {};
  if (!isNonEmpty(data.name)) errors.name = '이름을 입력하세요.';
  if (!isValidPhone(data.phone)) errors.phone = '연락처 형식이 올바르지 않습니다.';
  if (!isValidRRN(data.rrn)) errors.rrn = '주민등록번호 형식이 올바르지 않습니다.';
  if (isNonEmpty(data.email) && !isValidEmail(data.email)) errors.email = '이메일 형식이 올바르지 않습니다.';
  // 수익자 부분 입력 방지: 이름이 있으면 관계 필수.
  (data.beneficiaries || []).forEach((bn, i) => {
    if (isNonEmpty(bn.name) && !isNonEmpty(bn.relation)) {
      errors[`beneficiary${i}`] = '수익자 관계를 선택하세요.';
    }
  });
  return errors;
}
