/* ===== 凛穏塾 3期生 お申し込みアプリ ===== */

let STATE = null;
let POLL_TIMER = null;

// ---------------------------------------------------------------- 起動
document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  fillStaticLinks();

  const uid = getUid();
  if (!uid) { showScreen('screen-nouid'); return; }

  try {
    showLoading(true);
    const res = await api('enter', { uid });
    render(res);
  } catch (err) {
    showError(String(err.message || err));
  }
}

/** 講座名を設定から流し込む（規約類は js/legal.js を読んでアプリ内で開く） */
function fillStaticLinks() {
  const c = document.getElementById('course-name');
  if (c) c.textContent = CONFIG.COURSE.name;
}

// ---------------------------------------------------------------- 画面の出し分け
/**
 * 現在地（GASが返す stage）だけを見て画面を決める。
 * どの端末から入っても、スプシの進捗どおりの画面が開く。
 */
function render(res) {
  stopPolling();

  if (!res || res.ok === false) { showError(res && res.error ? errorMessage(res.error) : '状態を取得できませんでした'); return; }
  STATE = res;

  if (!res.registered) { showScreen('screen-unregistered'); return; }

  const wp = !!res.require_profile;                 // お客様情報ステップを挟む設定か
  const step = { terms: 1, profile: 2, sign: wp ? 3 : 2, pay: wp ? 4 : 3 };
  const bar = (n, done) => renderSteps(n, done, wp);

  switch (res.stage) {
    case 'プラン未設定':
      showScreen('screen-pending');
      startPolling();
      break;

    case '規約同意待ち':
      bar(step.terms);
      paintPlan('terms-plan');
      showScreen('screen-terms');
      break;

    case 'お客様情報待ち':
      bar(step.profile);
      showScreen('screen-profile');
      break;

    case '署名待ち':
      bar(step.sign);
      paintSign();
      showScreen('screen-sign');
      startPolling();                                // 署名完了はLINE経由で入るので待ち受ける
      break;

    case '支払方法未選択':
      bar(step.pay);
      paintPayOptions();
      showScreen('screen-payselect');
      break;

    case '決済待ち':
      bar(step.pay);
      paintCardPayment(1);
      showScreen('screen-card');
      break;

    case '2回目決済待ち':
      bar(step.pay);
      paintCardPayment(2);
      showScreen('screen-card');
      break;

    case '入金待ち':
      bar(step.pay);
      paintBank();
      showScreen('screen-bank');
      break;

    case '着金待ち':
      bar(step.pay);
      showScreen('screen-bankwait');
      startPolling();
      break;

    case '完了':
      bar(step.pay, true);
      paintDone();
      showScreen('screen-done');
      break;

    default:
      showError('想定していない状態です（' + esc(res.stage) + '）');
  }
}

/** 決済・着金の反映を待つ画面では、定期的に状態を取り直す */
function startPolling() {
  stopPolling();
  POLL_TIMER = setInterval(async () => {
    try {
      const res = await api('get_state', { uid: getUid() });
      if (res && res.stage && res.stage !== STATE.stage) render(res);
    } catch (_) { /* 通信が一時的に切れても画面は保つ */ }
  }, CONFIG.POLL_INTERVAL);
}
function stopPolling() {
  if (POLL_TIMER) { clearInterval(POLL_TIMER); POLL_TIMER = null; }
}

// ---------------------------------------------------------------- 各画面の描画
function paintPlan(elId) {
  const el = document.getElementById(elId);
  if (!el || !STATE.plan) return;
  el.innerHTML =
    `<div class="plan__name">${esc(STATE.plan.label)}</div>
     <div class="plan__price">${esc(yen(STATE.plan.total))}<span class="plan__tax">（税込）</span></div>
     <p class="plan__note">${esc(STATE.plan.note)}</p>`;
}

function paintPayOptions() {
  paintPlan('pay-plan');
  const p = STATE.plan || {};
  const box = document.getElementById('pay-options');
  if (!box) return;

  const opts = [];
  if (p.pay_full) {
    opts.push(opt('カード一括', 'クレジットカードで一括', yen(p.total) + ' を1回でお支払い'));
  }
  if (p.pay_1 && p.pay_2) {
    opts.push(opt('カード2回', 'クレジットカードで2回に分けて',
      yen(p.split[0]) + ' ＋ ' + yen(p.split[1]) + '（1回目のあとに2回目のボタンが出ます）'));
  }
  opts.push(opt('銀行振込', '銀行振込', yen(p.total) + ' を' + (STATE.bank_days || 5) + '日以内にお振り込み（選ぶと振込先が出ます）'));

  box.innerHTML = opts.join('');
  box.querySelectorAll('button[data-method]').forEach(b => {
    b.addEventListener('click', () => choosePayment(b.dataset.method, b));
  });

  const warn = document.getElementById('pay-nolink');
  if (warn) warn.hidden = !!(p.pay_full || (p.pay_1 && p.pay_2));

  function opt(method, title, desc) {
    return `<button type="button" class="payopt" data-method="${esc(method)}">
              <span class="payopt__title">${esc(title)}</span>
              <span class="payopt__desc">${esc(desc)}</span>
            </button>`;
  }
}

function paintCardPayment(n) {
  const p = STATE.plan || {};
  const el = document.getElementById('card-body');
  if (!el) return;

  const isSplit = STATE.payment_method === 'カード2回';
  const url = isSplit ? (n === 2 ? p.pay_2 : p.pay_1) : p.pay_full;
  const amount = isSplit ? p.split[n - 1] : p.total;
  const heading = isSplit ? `${n}回目のお支払い` : 'お支払い';

  el.innerHTML =
    `<h2 class="card__title">${esc(heading)}</h2>
     <div class="amount">${esc(yen(amount))}<span class="amount__tax">（税込）</span></div>
     ${isSplit && n === 1 ? '<p class="note">1回目のお支払いが確認できたら、この画面に2回目のボタンが出ます。</p>' : ''}
     ${isSplit && n === 2 ? '<p class="note">1回目のお支払いを確認しました。ありがとうございます。</p>' : ''}
     ${url
        ? `<a class="btn btn--primary" href="${esc(url)}">カードでお支払いに進む</a>`
        : '<p class="alert">決済ページの準備が整い次第、こちらに表示されます。少しお待ちください。</p>'}
     <p class="note">お支払い後、この画面が切り替わるまで少し時間がかかることがあります。閉じてしまっても、LINEのボタンからいつでも戻れます。</p>
     ${payHintsHtml()}`;
}

/**
 * ②署名待ち。契約書は別ツール（GMOサイン）だが、入口はこのアプリに集約する。
 * URLが未設定のうちは「準備中」を出して、お客様が待てる状態にしておく。
 */
function paintSign() {
  const el = document.getElementById('sign-action');
  if (el) {
    el.innerHTML = STATE.contract_url
      ? `<a class="btn btn--primary" href="${esc(STATE.contract_url)}" target="_blank" rel="noopener">契約書を開いて署名する</a>`
      : '<p class="alert">契約書のご用意が整い次第、この画面にボタンが表示されます。準備ができましたらLINEでもお知らせしますので、少しお待ちください。</p>';
  }
  const btn = document.querySelector('[data-act="declare-signed"]');
  if (btn) btn.hidden = !STATE.allow_self_sign;
}

function paintBank() {
  const b = STATE.bank || {};
  const p = STATE.plan || {};
  const el = document.getElementById('bank-body');
  if (!el) return;
  el.innerHTML =
    `<div class="amount">${esc(yen(p.total))}<span class="amount__tax">（税込）</span></div>
     ${STATE.bank_due
        ? `<p class="due">お振込期限　<b>${esc(STATE.bank_due)}</b></p>`
        : ''}
     <dl class="bank">
       <div><dt>金融機関</dt><dd>${esc(b.bank)} ${esc(b.branch)}</dd></div>
       <div><dt>口座種別</dt><dd>${esc(b.type)}</dd></div>
       <div><dt>口座番号</dt><dd>${esc(b.number)}</dd></div>
       <div><dt>口座名義</dt><dd>${esc(b.holder)}</dd></div>
     </dl>
     <p class="note">${esc(b.note || '')}</p>`;
}

function paintDone() {
  const el = document.getElementById('done-body');
  if (!el) return;
  el.innerHTML =
    `<p>お手続きはすべて完了しました。<br>${esc(CONFIG.ENTRANCE)}でお会いできることを楽しみにしています。</p>
     <p class="note">今後のご案内はLINEにお送りします。</p>`;
}

// ---------------------------------------------------------------- 操作
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;

  if (act === 'agree-terms')  return agreeTerms(btn);
  if (act === 'submit-profile') return submitProfile(btn);
  if (act === 'declare-signed') return declareSigned(btn);
  if (act === 'report-bank')  return reportBank(btn);
  if (act === 'reload')       return boot();
});

// 2つのチェック（規約への同意／書面の電子交付への承諾）が両方入るまで先へ進めない
document.addEventListener('change', (ev) => {
  if (ev.target.id !== 'terms-check' && ev.target.id !== 'edoc-check') return;
  const terms = document.getElementById('terms-check');
  const edoc = document.getElementById('edoc-check');
  const btn = document.querySelector('[data-act="agree-terms"]');
  if (btn) btn.disabled = !(terms && terms.checked && edoc && edoc.checked);
});

async function agreeTerms(btn) {
  try {
    busy(btn, true);
    // edoc＝書面を電子データで受け取ることへの承諾。GAS側もこれが無いと先へ進めない
    render(await api('agree_terms', { uid: getUid(), edoc: true }));
  } catch (err) { showError(String(err.message || err)); }
  finally { busy(btn, false); }
}

async function submitProfile(btn) {
  const form = document.getElementById('profile-form');
  if (!form) return;
  if (!form.reportValidity()) return;

  const profile = {};
  new FormData(form).forEach((v, k) => { profile[k] = String(v).trim(); });

  try {
    busy(btn, true);
    const res = await api('submit_profile', { uid: getUid(), profile });
    if (res.ok === false && res.error === 'missing_fields') {
      showFormError('次の項目を入力してください：' + res.fields.join('、'));
      return;
    }
    showFormError('');
    render(res);
  } catch (err) { showError(String(err.message || err)); }
  finally { busy(btn, false); }
}

function showFormError(msg) {
  const el = document.getElementById('profile-error');
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

async function declareSigned(btn) {
  const ok = await askConfirm(btn,
    '契約書へのご署名は完了していますか？まだの場合は「もどる」を押して、LINEに届いた契約書のURLからお手続きください。',
    'はい、署名しました');
  if (!ok) return;
  try {
    busy(btn, true);
    render(await api('declare_signed', { uid: getUid() }));
  } catch (err) { showError(String(err.message || err)); }
  finally { busy(btn, false); }
}

async function choosePayment(method, btn) {
  try {
    busy(btn, true, '選択中…');
    const res = await api('choose_payment', { uid: getUid(), method });
    if (res.ok === false) { showError(errorMessage(res.error)); return; }
    render(res);
  } catch (err) { showError(String(err.message || err)); }
  finally { busy(btn, false); }
}

async function reportBank(btn) {
  const ok = await askConfirm(btn,
    'お振り込みは完了していますか？運営が着金を確認しましたら、LINEでご連絡します。',
    'はい、振り込みました');
  if (!ok) return;
  try {
    busy(btn, true);
    render(await api('report_bank', { uid: getUid() }));
  } catch (err) { showError(String(err.message || err)); }
  finally { busy(btn, false); }
}

/** GASのエラーコードを、読んで分かる日本語にする */
function errorMessage(code) {
  const map = {
    uid_required: 'LINEのメッセージにあるボタンから開いてください。',
    busy: '混み合っています。少し待ってからもう一度お試しください。',
    not_found: 'お申し込み情報が見つかりませんでした。担当者へお知らせください。',
    already_started: 'お支払い手続きが始まっているため、お支払い方法は変更できません。担当者へご相談ください。',
    bad_method: 'お支払い方法を選び直してください。',
    edoc_required: '書面を電子データで受け取ることへの承諾が必要です。チェックを入れてからお進みください。',
    not_bank: '銀行振込を選んだ方のみのお手続きです。',
    confirm_required: '署名の確認は運営が行います。少しお待ちください。',
    unauthorized: 'この画面を開く権限がありません。LINEのボタンから開き直してください。'
  };
  return map[code] || ('エラーが発生しました（' + code + '）');
}

// ---------------------------------------------------------------- デモモード
/** ?mock=1 のときだけ使う偽サーバー。GASが無くても全画面を確認できる */
const MOCK_KEY = 'rion3ki_mock_state';
function mockApi(action, body) {
  const load = () => {
    try { return JSON.parse(localStorage.getItem(MOCK_KEY)) || {}; } catch (_) { return {}; }
  };
  const save = (s) => { try { localStorage.setItem(MOCK_KEY, JSON.stringify(s)); } catch (_) {} };

  const s = load();
  if (action === 'enter' && !s.init) {
    s.init = true;
    s.plan = new URLSearchParams(location.search).get('plan') || 'VIP';
    save(s);
  }
  if (action === 'agree_terms')    { if (!body || !body.edoc) return Promise.resolve({ ok: false, error: 'edoc_required' }); s.terms = true; save(s); }
  if (action === 'submit_profile') { s.profile = true; save(s); }
  if (action === 'declare_signed') { s.signed = true; save(s); }
  if (action === 'choose_payment') { s.method = body.method; save(s); }
  if (action === 'report_bank')    { s.bank_report = true; save(s); }

  const plans = {
    'VIP':        { label: 'VIPコース', total: 880000, note: 'みほさんのセッション5回／まみさんの算命学鑑定1回／卒業式のランチ会／講義資料の使用権', split: [440000, 440000] },
    'スタンダード': { label: 'スタンダードコース', total: 680000, note: 'みほさんのセッション3回', split: [300000, 380000] }
  };
  const plan = plans[s.plan] || plans['VIP'];

  const withProfile = new URLSearchParams(location.search).get('profile') === '1';

  let stage = 'プラン未設定';
  if (s.plan === 'none') stage = 'プラン未設定';
  else if (!s.terms) stage = '規約同意待ち';
  else if (withProfile && !s.profile) stage = 'お客様情報待ち';
  else if (!s.signed) stage = '署名待ち';
  else if (!s.method) stage = '支払方法未選択';
  else if (s.method === '銀行振込') stage = s.bank_report ? '着金待ち' : '入金待ち';
  else if (s.method === 'カード2回' && s.pay1) stage = '2回目決済待ち';
  else stage = '決済待ち';

  return Promise.resolve({
    ok: true, uid: 'MOCKUID', registered: true, stage,
    name: 'テスト 太郎',
    plan: Object.assign({ key: s.plan, pay_full: '#mock-pay', pay_1: '#mock-pay1', pay_2: '#mock-pay2' }, plan),
    payment_method: s.method || '',
    bank: { bank: '〇〇銀行', branch: '△△支店', type: '普通', number: '1234567', holder: 'カ）リンオンジュク', note: '恐れ入りますが、振込手数料はご負担ください。' },
    contract_url: new URLSearchParams(location.search).get('nocontract') === '1' ? '' : 'https://example.com/mock-contract',
    bank_due: s.method === '銀行振込' ? '2026/08/23 23:59' : null,
    bank_days: 5,
    require_profile: withProfile,
    allow_self_sign: true,
    marks: {}
  });
}
