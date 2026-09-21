import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CSV_COLUMNS, isNonEmpty, isValidRRN, isValidPhone, isValidEmail,
  maskRRN, maskAccount, csvEscape, recordToRow, buildCsv, withBom,
  formatDateYYYYMMDD, phoneLast4, buildFilename, validateRecord,
} from './lib.js';

test('isValidRRN: 하이픈 유무 모두 통과, 자릿수 오류 실패', () => {
  assert.equal(isValidRRN('900101-1234567'), true);
  assert.equal(isValidRRN('9001011234567'), true);
  assert.equal(isValidRRN('90010-1234567'), false);
  assert.equal(isValidRRN(''), false);
});

test('isValidPhone: 휴대전화 패턴', () => {
  assert.equal(isValidPhone('010-1234-5678'), true);
  assert.equal(isValidPhone('01012345678'), true);
  assert.equal(isValidPhone('02-123-4567'), false);
});

test('isValidEmail', () => {
  assert.equal(isValidEmail('a@b.com'), true);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail('no-at.com'), false);
});

test('maskRRN: 뒷자리 마스킹', () => {
  assert.equal(maskRRN('900101-1234567'), '900101-1******');
  assert.equal(maskRRN('9001011234567'), '900101-1******');
});

test('maskAccount: 뒤 4자리만 노출', () => {
  assert.equal(maskAccount('110123456789'), '********6789');
  assert.equal(maskAccount('1234'), '1234');
});

test('csvEscape: 쉼표/따옴표/개행 처리', () => {
  assert.equal(csvEscape('홍길동'), '홍길동');
  assert.equal(csvEscape('서울, 강남'), '"서울, 강남"');
  assert.equal(csvEscape('그는 "말"했다'), '"그는 ""말""했다"');
});

test('CSV_COLUMNS: 컬럼 수/순서 고정(수익자 1~3)', () => {
  assert.equal(CSV_COLUMNS.length, 25);
  assert.equal(CSV_COLUMNS[0], '동의여부');
  assert.equal(CSV_COLUMNS.includes('수익자3_연락처'), true);
  assert.equal(CSV_COLUMNS[CSV_COLUMNS.length - 1], '작성일시');
});

const sample = {
  consent: true,
  name: '홍길동', birth: '1990-01-01', phone: '010-1234-5678',
  email: 'a@b.com', address: '서울, 강남', rrn: '900101-1234567', job: '회사원',
  insured: { name: '홍길동', relation: '본인', sameAsApplicant: true },
  beneficiaries: [{ name: '김철수', relation: '자녀', phone: '010-0000-1111' }],
  account: { bank: '국민', number: '110123456789', holder: '홍길동' },
  payment: '자동이체(CMS)',
  createdAt: '2026-09-21 10:00:00',
};

test('recordToRow: 컬럼 수 일치, 빈 수익자는 빈 컬럼', () => {
  const row = recordToRow(sample);
  assert.equal(row.length, CSV_COLUMNS.length);
  assert.equal(row[0], 'Y');
  assert.equal(row[1], '홍길동');
  assert.equal(row[10], 'Y'); // 피보험자_가입자동일
  assert.equal(row[11], '김철수'); // 수익자1_이름
  assert.equal(row[14], ''); // 수익자2_이름 (없음)
});

test('buildCsv + withBom: BOM 선두 + 헤더/행', () => {
  const csv = withBom(buildCsv(sample));
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const body = csv.slice(1);
  const [head, row] = body.split('\r\n');
  assert.equal(head.split(',').length >= 25, true);
  assert.equal(row.includes('"서울, 강남"'), true); // 이스케이프 확인
});

test('formatDateYYYYMMDD / phoneLast4 / buildFilename', () => {
  assert.equal(formatDateYYYYMMDD(new Date('2026-09-21T00:00:00')), '20260921');
  assert.equal(phoneLast4('010-1234-5678'), '5678');
  assert.equal(buildFilename('홍길동', '010-1234-5678', new Date('2026-09-21T00:00:00')), '홍길동_5678_20260921.csv');
});

test('buildFilename: 파일명 불가 문자 치환', () => {
  assert.equal(buildFilename('홍/길:동', '01000001111', new Date('2026-01-02T00:00:00')), '홍_길_동_1111_20260102.csv');
});

test('validateRecord: 필수/형식/수익자 부분입력', () => {
  assert.deepEqual(validateRecord(sample), {});
  const bad = { ...sample, name: '', phone: '123', rrn: 'x', beneficiaries: [{ name: '무명', relation: '' }] };
  const errs = validateRecord(bad);
  assert.ok(errs.name && errs.phone && errs.rrn && errs.beneficiary0);
});
