import { APP_PIN, PAYMENT_METHODS, RELATIONS, CONSENT_TEXT, IDLE_RESET_MS } from './config.js';
import {
  validateRecord, isNonEmpty, isValidPhone, isValidRRN, isValidEmail,
  maskRRN, maskAccount, buildCsv, withBom, buildFilename,
} from './lib.js';

const MAX_BENEFICIARIES = 3;

// 세션 메모리 상태. 새로고침/초기화 시 사라진다(서버 없음).
function emptyData() {
  return {
    consent: false,
    name: '', birth: '', phone: '', email: '', address: '', rrn: '', job: '',
    insured: { name: '', relation: '', sameAsApplicant: false },
    beneficiaries: [{ name: '', relation: '', phone: '' }],
    account: { bank: '', number: '', holder: '' },
    payment: '',
    createdAt: '',
  };
}

let data = emptyData();
let step = 1;
let lastCsv = '';
let lastFilename = '';
let idleTimer = null;

const $ = (sel) => document.querySelector(sel);
const el = (id) => document.getElementById(id);

// 화면 전환 -----------------------------------------------------
function show(id) {
  ['gate', 'form', 'done'].forEach((s) => el(s).classList.toggle('hidden', s !== id));
}

// PIN 게이트 ----------------------------------------------------
function initGate() {
  el('pin-submit').addEventListener('click', submitPin);
  el('pin-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPin(); });
}
function submitPin() {
  const v = el('pin-input').value.trim();
  if (v === APP_PIN) {
    el('pin-err').textContent = '';
    el('pin-input').value = '';
    startForm();
  } else {
    el('pin-err').textContent = 'PIN이 올바르지 않습니다.';
  }
}

function startForm() {
  data = emptyData();
  step = 1;
  show('form');
  renderStep();
  resetIdle();
}

// 단계 렌더 -----------------------------------------------------
const STEP_TITLES = { 1: '인적사항', 2: '신분·보험 상세', 3: '확인 및 저장' };

function renderStep() {
  el('step-title').textContent = STEP_TITLES[step];
  el('step-count').textContent = `${step} / 3`;
  el('progress-bar').style.width = `${(step / 3) * 100}%`;
  el('btn-prev').classList.toggle('hidden', step === 1);
  el('btn-next').textContent = step === 3 ? '저장하기' : '다음';

  const body = el('step-body');
  if (step === 1) body.innerHTML = tplStep1();
  else if (step === 2) body.innerHTML = tplStep2();
  else body.innerHTML = tplStep3();
  body.classList.remove('step'); void body.offsetWidth; body.classList.add('step');

  if (step === 1) bindStep1();
  else if (step === 2) bindStep2();
}

// Step1 --------------------------------------------------------
function tplStep1() {
  const d = data;
  return `
    <div class="consent">
      <div style="margin-bottom:8px">${CONSENT_TEXT}</div>
      <label class="consent-check"><input type="checkbox" id="f-consent" ${d.consent ? 'checked' : ''}/> 위 개인정보 수집·이용에 동의합니다.<span class="req">*</span></label>
    </div>
    ${textField('f-name', '이름', d.name, true, 'text')}
    ${textField('f-birth', '생년월일', d.birth, false, 'date')}
    ${textField('f-phone', '연락처', d.phone, true, 'tel', '010-0000-0000')}
    ${textField('f-email', '이메일', d.email, false, 'email')}
    ${textField('f-address', '주소', d.address, false, 'text')}
  `;
}
function bindStep1() {
  el('f-consent').addEventListener('change', (e) => { data.consent = e.target.checked; });
  bindText('f-name', (v) => data.name = v);
  bindText('f-birth', (v) => data.birth = v);
  bindText('f-phone', (v) => data.phone = v);
  bindText('f-email', (v) => data.email = v);
  bindText('f-address', (v) => data.address = v);
}

// Step2 --------------------------------------------------------
function tplStep2() {
  const d = data;
  return `
    ${textField('f-rrn', '주민등록번호', d.rrn, true, 'text', '000000-0000000')}
    ${textField('f-job', '직업', d.job, false, 'text')}
    <div class="field">
      <label>피보험자</label>
      <div class="toggle-row" style="margin-bottom:10px">
        <span class="muted">가입자와 동일</span>
        <button type="button" class="toggle ${d.insured.sameAsApplicant ? 'on' : ''}" id="f-insured-same" aria-pressed="${d.insured.sameAsApplicant}"></button>
      </div>
      ${textField('f-insured-name', '피보험자 이름', d.insured.name, false, 'text')}
      <label class="muted" style="font-weight:600">관계</label>
      ${chips('insured-rel', d.insured.relation)}
    </div>
    <div class="field">
      <label>수익자 <span class="muted">(최대 ${MAX_BENEFICIARIES}명)</span></label>
      <div id="bene-list">${data.beneficiaries.map((b, i) => tplBene(b, i)).join('')}</div>
      <button type="button" class="link-btn ${data.beneficiaries.length >= MAX_BENEFICIARIES ? 'hidden' : ''}" id="bene-add">+ 수익자 추가</button>
    </div>
    <div class="field">
      <label>납입 계좌</label>
      <div class="row2">
        ${textField('f-bank', '은행', d.account.bank, false, 'text')}
        ${textField('f-holder', '예금주', d.account.holder, false, 'text')}
      </div>
      ${textField('f-accnum', '계좌번호', d.account.number, false, 'text')}
    </div>
    <div class="field">
      <label>결제수단</label>
      <div class="segment" id="f-payment">
        ${PAYMENT_METHODS.map((p) => `<button type="button" data-v="${p}" class="${d.payment === p ? 'on' : ''}">${p}</button>`).join('')}
      </div>
    </div>
  `;
}
function tplBene(b, i) {
  return `
    <div class="bene" data-i="${i}">
      <div class="bene-head">
        <strong>수익자 ${i + 1}</strong>
        ${i > 0 ? `<button type="button" class="rm" data-rm="${i}">삭제</button>` : ''}
      </div>
      ${textField(`f-bname-${i}`, '이름', b.name, false, 'text')}
      <label class="muted" style="font-weight:600">관계</label>
      ${chips(`bene-rel-${i}`, b.relation)}
      <div class="err" id="err-beneficiary${i}"></div>
      ${textField(`f-bphone-${i}`, '연락처', b.phone, false, 'tel')}
    </div>`;
}
function bindStep2() {
  bindText('f-rrn', (v) => data.rrn = v);
  bindText('f-job', (v) => data.job = v);
  el('f-insured-same').addEventListener('click', () => {
    data.insured.sameAsApplicant = !data.insured.sameAsApplicant;
    if (data.insured.sameAsApplicant) {
      data.insured.name = data.name;
      data.insured.relation = '본인';
    }
    renderStep();
  });
  bindText('f-insured-name', (v) => data.insured.name = v);
  bindChips('insured-rel', (v) => data.insured.relation = v);

  data.beneficiaries.forEach((_, i) => {
    bindText(`f-bname-${i}`, (v) => data.beneficiaries[i].name = v);
    bindText(`f-bphone-${i}`, (v) => data.beneficiaries[i].phone = v);
    bindChips(`bene-rel-${i}`, (v) => data.beneficiaries[i].relation = v);
  });
  el('bene-list').querySelectorAll('[data-rm]').forEach((btn) => {
    btn.addEventListener('click', () => {
      data.beneficiaries.splice(Number(btn.dataset.rm), 1);
      renderStep();
    });
  });
  const add = el('bene-add');
  if (add) add.addEventListener('click', () => {
    if (data.beneficiaries.length < MAX_BENEFICIARIES) {
      data.beneficiaries.push({ name: '', relation: '', phone: '' });
      renderStep();
    }
  });

  bindText('f-bank', (v) => data.account.bank = v);
  bindText('f-holder', (v) => data.account.holder = v);
  bindText('f-accnum', (v) => data.account.number = v);
  el('f-payment').querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      data.payment = btn.dataset.v;
      el('f-payment').querySelectorAll('button').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
    });
  });
}

// Step3 요약 ----------------------------------------------------
function tplStep3() {
  const d = data;
  const rows = [
    ['동의여부', d.consent ? '동의함' : '미동의'],
    ['이름', d.name], ['생년월일', d.birth], ['연락처', d.phone],
    ['이메일', d.email], ['주소', d.address],
    ['주민등록번호', maskRRN(d.rrn)], ['직업', d.job],
    ['피보험자', `${d.insured.name || '-'} (${d.insured.relation || '-'})${d.insured.sameAsApplicant ? ' · 가입자동일' : ''}`],
    ['수익자', d.beneficiaries.filter((b) => isNonEmpty(b.name)).map((b) => `${b.name}(${b.relation || '-'})`).join(', ') || '-'],
    ['납입계좌', `${d.account.bank || '-'} ${maskAccount(d.account.number)} ${d.account.holder || ''}`.trim()],
    ['결제수단', d.payment || '-'],
  ];
  return `
    <p class="muted">입력 내용을 확인하세요. 저장 시 전체 데이터가 CSV 파일로 다운로드됩니다.</p>
    <table class="summary">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
    <p class="hint">민감정보는 화면에서만 마스킹되며, 저장 파일에는 원문이 평문으로 기록됩니다.</p>
  `;
}

// 공통 필드 헬퍼 ------------------------------------------------
function textField(id, label, value, required, type = 'text', placeholder = '') {
  return `
    <div class="field">
      <label for="${id}">${label}${required ? '<span class="req">*</span>' : ''}</label>
      <input id="${id}" type="${type}" value="${escapeAttr(value)}" placeholder="${placeholder}" ${type === 'text' && (id === 'f-rrn' || id === 'f-accnum') ? 'autocomplete="off"' : ''} />
      <div class="err" id="err-${id}"></div>
    </div>`;
}
function chips(group, current) {
  return `<div class="chips" data-group="${group}">${RELATIONS.map((r) => `<button type="button" class="chip ${current === r ? 'on' : ''}" data-v="${r}">${r}</button>`).join('')}</div>`;
}
function bindText(id, setter) {
  const node = el(id);
  if (node) node.addEventListener('input', (e) => { setter(e.target.value); markIdle(); });
}
function bindChips(group, setter) {
  const box = document.querySelector(`[data-group="${group}"]`);
  if (!box) return;
  box.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    setter(c.dataset.v);
    box.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
    c.classList.add('on');
    markIdle();
  }));
}

// 단계 이동/검증 ------------------------------------------------
function clearErrors() {
  document.querySelectorAll('.err').forEach((e) => e.textContent = '');
  document.querySelectorAll('input.invalid').forEach((i) => i.classList.remove('invalid'));
}
function showFieldError(inputId, msg) {
  const box = el(`err-${inputId}`);
  if (box) box.textContent = msg;
  const inp = el(inputId);
  if (inp) inp.classList.add('invalid');
}

function validateStep1() {
  clearErrors();
  let ok = true;
  if (!data.consent) { alertToast('개인정보 수집·이용 동의가 필요합니다.'); ok = false; }
  if (!isNonEmpty(data.name)) { showFieldError('f-name', '이름을 입력하세요.'); ok = false; }
  if (!isValidPhone(data.phone)) { showFieldError('f-phone', '연락처 형식이 올바르지 않습니다.'); ok = false; }
  if (isNonEmpty(data.email) && !isValidEmail(data.email)) { showFieldError('f-email', '이메일 형식이 올바르지 않습니다.'); ok = false; }
  return ok;
}
function validateStep2() {
  clearErrors();
  let ok = true;
  if (!isValidRRN(data.rrn)) { showFieldError('f-rrn', '주민등록번호 형식이 올바르지 않습니다.'); ok = false; }
  data.beneficiaries.forEach((b, i) => {
    if (isNonEmpty(b.name) && !isNonEmpty(b.relation)) {
      const box = el(`err-beneficiary${i}`);
      if (box) box.textContent = '수익자 관계를 선택하세요.';
      ok = false;
    }
  });
  return ok;
}

function next() {
  markIdle();
  if (step === 1 && !validateStep1()) return;
  if (step === 2 && !validateStep2()) return;
  if (step === 3) { save(); return; }
  step += 1;
  renderStep();
}
function prev() { markIdle(); if (step > 1) { step -= 1; renderStep(); } }

// 저장/다운로드 ------------------------------------------------
function save() {
  const errors = validateRecord(data);
  if (Object.keys(errors).length > 0) {
    alertToast('필수 항목 또는 형식 오류가 있습니다. 1~2단계를 확인하세요.');
    return;
  }
  data.createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  lastCsv = withBom(buildCsv(data));
  lastFilename = buildFilename(data.name, data.phone);
  if (download(lastCsv, lastFilename)) {
    renderDone();
  } else {
    alertToast('다운로드에 실패했습니다.', () => { if (download(lastCsv, lastFilename)) renderDone(); });
  }
}

function download(csv, filename) {
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (err) {
    return false;
  }
}

function renderDone() {
  show('done');
  el('done-filename').textContent = lastFilename;
  el('done-preview').innerHTML = previewTable(lastCsv);
  resetIdle();
}
function previewTable(csvWithBomStr) {
  const csv = csvWithBomStr.replace(/^\ufeff/, '');
  const [head, row] = csv.split('\r\n');
  const heads = splitCsvLine(head);
  const cells = splitCsvLine(row || '');
  return `<tr>${heads.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>` +
    `<tr>${heads.map((_, i) => `<td>${escapeHtml(cells[i] || '')}</td>`).join('')}</tr>`;
}
// 미리보기용 최소 CSV 파서(따옴표 처리 포함).
function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// 완료 화면 버튼
function initDone() {
  el('btn-redownload').addEventListener('click', () => {
    if (!download(lastCsv, lastFilename)) alertToast('다운로드에 실패했습니다.', () => download(lastCsv, lastFilename));
  });
  el('btn-restart').addEventListener('click', startForm);
}

// 토스트 -------------------------------------------------------
let toastTimer = null;
function alertToast(msg, retry) {
  el('toast-msg').textContent = msg;
  const action = el('toast-action');
  action.classList.toggle('hidden', !retry);
  action.onclick = retry ? () => { hideToast(); retry(); } : null;
  el('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, retry ? 8000 : 3500);
}
function hideToast() { el('toast').classList.remove('show'); }

// 유휴 초기화(완화책) ------------------------------------------
function markIdle() { resetIdle(); }
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    data = emptyData(); step = 1; lastCsv = ''; lastFilename = '';
    el('pin-input').value = '';
    show('gate');
  }, IDLE_RESET_MS);
}

// escape 헬퍼
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }

// 부트스트랩 ---------------------------------------------------
function init() {
  initGate();
  initDone();
  el('btn-next').addEventListener('click', next);
  el('btn-prev').addEventListener('click', prev);
  show('gate');
}
init();
