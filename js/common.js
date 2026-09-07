/* ===== 共通処理：uid管理・GAS呼び出し・画面切替 ===== */

/**
 * uid取得（URL → localStorage の順。URLにあれば保存する）
 *
 * ★2026-09-07 デモモード（?mock=1）のときは保存も読み出しもしません。
 *   画面一覧のページ（flow35.html）が uid=preview&mock=1 でアプリを表示するので、
 *   そのまま保存すると、あとで同じブラウザからLINEを通さずアプリを開いたときに
 *   「preview」という方が本番のシートに入場してしまっていました。
 */
function getUid() {
  const urlUid = new URLSearchParams(location.search).get('uid');
  const valid = urlUid && urlUid !== '[[uid]]' ? urlUid : null;

  // デモモードは、この画面かぎり。ブラウザには何も残しません
  // （?uid= を空にして開くと「LINEから開いてください」の画面を確認できます）
  if (isMock()) return urlUid === '' ? null : (valid || 'preview');

  if (valid) {
    try { localStorage.setItem(CONFIG.UID_KEY, valid); } catch (_) {}
    return valid;
  }
  // 直しの前に「preview」が保存されてしまったブラウザは、ここで捨てます
  try {
    const saved = localStorage.getItem(CONFIG.UID_KEY);
    if (saved === 'preview') { localStorage.removeItem(CONFIG.UID_KEY); return null; }
    return saved;
  } catch (_) { return null; }
}

/**
 * LINEから開いていない方の画面に置いた「公式LINEを開く」ボタン（2026-09-07）。
 * CONFIG.LINE_URL が入っているときだけ出します。空のあいだは文章のご案内だけです。
 */
document.addEventListener('DOMContentLoaded', function () {
  var url = (typeof CONFIG !== 'undefined' && CONFIG.LINE_URL) || '';
  if (!url) return;
  var list = document.querySelectorAll('[data-line-open]');
  for (var i = 0; i < list.length; i++) {
    list[i].href = url;
    list[i].hidden = false;
  }
});

/** デモモード（?mock=1）。GASが無くても全画面を確認できる */
function isMock() {
  return new URLSearchParams(location.search).get('mock') === '1';
}

/**
 * GAS呼び出し（POST・text/plain でプリフライトを避ける）
 *
 * GASは久しぶりのアクセスだと立ち上がりに数秒かかり、その間に 404 や 5xx を返すことがある。
 * お客様に「うまく表示できませんでした」を見せる前に、こちらで数回やり直す。
 */
async function api(action, body) {
  if (isMock()) return mockApi(action, body);
  const payload = Object.assign({ action, token: CONFIG.TOKEN }, body || {});

  let lastError = null;
  for (let attempt = 0; attempt <= CONFIG.RETRY_COUNT; attempt++) {
    if (attempt > 0) await sleep(CONFIG.RETRY_WAIT * attempt);   // 1回目1.2秒 → 2回目2.4秒
    try {
      const res = await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      if (res.ok) return res.json();
      // 立ち上がり中に出やすいものだけやり直す。それ以外は即座に返す
      if (![404, 429, 500, 502, 503, 504].includes(res.status)) {
        throw new Error('通信に失敗しました（' + res.status + '）');
      }
      lastError = new Error('通信に失敗しました（' + res.status + '）');
    } catch (err) {
      lastError = err;                                            // 圏外・切断もここに来る
    }
  }
  throw lastError || new Error('通信に失敗しました');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** 画面切替（.screen のうち1つだけ表示） */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('is-active');
  const loading = document.getElementById('loading');
  if (loading) loading.hidden = true;
  window.scrollTo(0, 0);
}

/**
 * 読み込み中の表示。
 * GASの立ち上がりで10秒近くかかることがあるので、黙って待たせずに一言添える。
 */
let LOADING_TIMERS = [];
function showLoading(on) {
  const el = document.getElementById('loading');
  if (!el) return;
  el.hidden = !on;

  LOADING_TIMERS.forEach(clearTimeout);
  LOADING_TIMERS = [];
  const msg = el.querySelector('[data-loading-msg]');
  if (!on || !msg) return;

  msg.textContent = '読み込んでいます…';
  LOADING_TIMERS.push(setTimeout(() => { msg.textContent = 'もう少しお待ちください…'; }, 3500));
  LOADING_TIMERS.push(setTimeout(() => { msg.textContent = '接続しています。初回は時間がかかることがあります'; }, 8000));
}

/** エラー表示（原因が分かるものは本文に出す） */
function showError(msg) {
  const el = document.getElementById('error-detail');
  if (el) el.textContent = msg || '';
  showScreen('screen-error');
}

/**
 * ステップバーを描画する
 * @param {number} current 1始まり（0を渡すと全て未着手）
 * @param {boolean} allDone 全部完了として描くか
 * @param {boolean} withProfile お客様情報の入力ステップを挟む設定か
 */
function renderSteps(current, allDone, withProfile) {
  const labels = withProfile
    ? ['利用規約', 'お客様情報', '契約書署名', 'お支払い']
    : ['利用規約', '契約書署名', 'お支払い'];
  const html = labels.map((label, i) => {
    const n = i + 1;
    let cls = 'step';
    let badge = '';
    if (allDone || n < current) {
      cls += ' is-done';
    } else if (n === current) {
      cls += ' is-current';
      badge = '<span class="step__badge step__badge--now">今ココ</span>';
    } else if (n === current + 1 && !allDone) {
      badge = '<span class="step__badge step__badge--next">次コレ</span>';
    }
    // 中身が空だとプロラインのエディタに消されるので、&nbsp; を入れてクラスで隠す
    if (!badge) badge = '<span class="step__badge step__badge--none">&nbsp;</span>';
    const mark = (allDone || n < current) ? '✓' : n;
    return `<li class="${cls}">${badge}<span class="step__dot">${mark}</span><span class="step__label">${esc(label)}</span></li>`;
  }).join('');
  document.querySelectorAll('[data-steps]').forEach(el => { el.innerHTML = html; });
}

/* ===== 文字サイズ（中／大） =====
 * 30〜60代の方が読みやすいように。選んだ設定は次に開いたときも残る。
 */
const FS_KEY = 'rion3ki_fs';

function initFontSize() {
  let saved = 'normal';
  try { saved = localStorage.getItem(FS_KEY) || 'normal'; } catch (_) {}
  applyFontSize(saved);

  document.querySelectorAll('.fontsize button[data-fs]').forEach(btn => {
    btn.addEventListener('click', () => applyFontSize(btn.dataset.fs));
  });
}

function applyFontSize(mode) {
  const large = (mode === 'large');
  if (large) document.documentElement.setAttribute('data-fs', 'large');
  else document.documentElement.removeAttribute('data-fs');
  try { localStorage.setItem(FS_KEY, large ? 'large' : 'normal'); } catch (_) {}

  document.querySelectorAll('.fontsize button[data-fs]').forEach(btn => {
    const on = (btn.dataset.fs === (large ? 'large' : 'normal'));
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/** 金額を「990,000円」形式に */
function yen(n) {
  return Number(n || 0).toLocaleString('ja-JP') + '円';
}

/** HTMLエスケープ */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * 画面内の確認パネル。
 * LINEアプリ内ブラウザでは confirm() が出ないことがあるため、ネイティブダイアログは使わない。
 * @returns {Promise<boolean>} はい＝true／いいえ＝false
 */
/**
 * お振り込みのご連絡。お名義とお振込日を伺ってから送る。
 * 入力は任意（分からなくても先へ進めるようにしておく）。
 */
function askBankReport(btn) {
  return new Promise(resolve => {
    const old = btn.parentNode.querySelector('.confirm');
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.className = 'confirm';
    panel.innerHTML =
      `<p class="confirm__msg">お振り込みは完了していますか？<br>確認のため、差し支えなければ次のことを教えてください。</p>
       <label class="field">
         <span class="field__label">お振り込みのお名義</span>
         <input type="text" data-holder placeholder="リオン ハナコ" autocomplete="name">
         <span class="field__hint">ご本人以外のお名義でお振り込みの場合は、そのお名前をご記入ください。</span>
       </label>
       <label class="field">
         <span class="field__label">お振込日</span>
         <input type="date" data-paid-on>
       </label>
       <div class="confirm__btns">
         <button type="button" class="btn btn--primary" data-yes>はい、振り込みました</button>
         <button type="button" class="btn btn--ghost" data-no>もどる</button>
       </div>`;
    btn.insertAdjacentElement('afterend', panel);
    btn.hidden = true;

    const done = (ans) => { panel.remove(); btn.hidden = false; resolve(ans); };
    panel.querySelector('[data-yes]').addEventListener('click', () => done({
      holder: String(panel.querySelector('[data-holder]').value || '').trim(),
      paid_on: String(panel.querySelector('[data-paid-on]').value || '').trim()
    }));
    panel.querySelector('[data-no]').addEventListener('click', () => done(null));
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function askConfirm(btn, message, yesLabel) {
  return new Promise(resolve => {
    const old = btn.parentNode.querySelector('.confirm');
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.className = 'confirm';
    panel.innerHTML =
      `<p class="confirm__msg">${esc(message)}</p>
       <div class="confirm__btns">
         <button type="button" class="btn btn--primary" data-yes>${esc(yesLabel || 'はい')}</button>
         <button type="button" class="btn btn--ghost" data-no>もどる</button>
       </div>`;
    btn.insertAdjacentElement('afterend', panel);
    btn.hidden = true;

    const done = (ans) => { panel.remove(); btn.hidden = false; resolve(ans); };
    panel.querySelector('[data-yes]').addEventListener('click', () => done(true));
    panel.querySelector('[data-no]').addEventListener('click', () => done(false));
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}


/* ===== アプリ内の読み物（規約など）を開く =====
 * 外部ページへ飛ばすと手続きの途中で迷子になるため、この場で重ねて表示する。
 * 本文は js/legal.js の DOCS が持つ。
 */
let DOC_OPENER = null;

function openDoc(key, opener) {
  const doc = (typeof DOCS !== 'undefined') ? DOCS[key] : null;
  if (!doc) return;
  closeDoc();
  DOC_OPENER = opener || document.activeElement;

  const back = document.createElement('div');
  back.className = 'docwrap';
  back.id = 'docwrap';
  back.innerHTML =
    `<div class="doc" role="dialog" aria-modal="true" aria-label="${esc(doc.title)}">
       <div class="doc__head">
         <div>
           <p class="doc__kicker">${esc(doc.kicker || '')}</p>
           <h2 class="doc__title">${esc(doc.title)}</h2>
         </div>
         <button type="button" class="doc__close" aria-label="閉じる">✕</button>
       </div>
       <div class="doc__body">${doc.body}</div>
       <div class="doc__foot">
         <button type="button" class="btn btn--ghost" data-close>閉じる</button>
       </div>
     </div>`;
  document.body.appendChild(back);
  document.body.classList.add('is-locked');

  back.addEventListener('click', (ev) => {
    if (ev.target === back || ev.target.closest('.doc__close, [data-close]')) closeDoc();
  });
  document.addEventListener('keydown', onDocKey);
  const close = back.querySelector('.doc__close');
  if (close) close.focus();
}

function closeDoc() {
  const back = document.getElementById('docwrap');
  if (!back) return;
  back.remove();
  document.body.classList.remove('is-locked');
  document.removeEventListener('keydown', onDocKey);
  if (DOC_OPENER && DOC_OPENER.focus) DOC_OPENER.focus();
  DOC_OPENER = null;
}

function onDocKey(ev) {
  if (ev.key === 'Escape') closeDoc();
}

/** 読み物を開くボタン（画面のどこに置いても効く） */
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-doc]');
  if (!el) return;
  ev.preventDefault();
  openDoc(el.getAttribute('data-doc'), el);
});

/** 決済まわりの補足リンク（カード画面に出す） */
function payHintsHtml() {
  return `<div class="doc-hints">
            <button type="button" class="doc-hint" data-doc="split">分割払いにしたい方はこちら</button>
            <button type="button" class="doc-hint" data-doc="secure">決済が進まないとき（3Dセキュア）</button>
          </div>`;
}

/**
 * ボタンの二度押し防止と、待っているあいだのご案内。
 *
 *   ★2026-09-01 とーるさんご要望。
 *     GASは眠っていると立ち上がりに5秒ほどかかります。そのあいだ
 *     「選択中…」のまま止まって見えるので、お客様が不安になります。
 *     時間に応じて言い方を変えて、「待てば開く」と分かるようにしました。
 *
 *   ・ボタンの字が変わります（読み込んでおります → しばらくこのまま…）
 *   ・画面の下にも同じご案内を出します（ボタンが見えない位置でも分かるように）
 *   ・「…」はCSSで動かします。文言に「…」は含めません
 */
var BUSY_STEPS = [
  { at: 2000,  text: '読み込んでおります' },
  { at: 5000,  text: 'しばらくこのままお待ちください' },
  { at: 10000, text: 'もう少しです。閉じずにお待ちください' }
];

var BUSY_TIMERS = [];

function busy(btn, on, labelWhenBusy) {
  busyClear_();

  if (!on) {
    if (btn) {
      if (btn.dataset.label) {
        btn.textContent = btn.dataset.label;
        delete btn.dataset.label;
      }
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
    return;
  }

  if (btn) {
    // ★もとの字は、すでに預かっているときは上書きしない
    //   （二度 busy(on) が来ると「送信中」を元の字として覚えてしまうため）
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = busyLabel_(labelWhenBusy || '送信中');
    btn.disabled = true;
    btn.classList.add('is-busy');
  }

  var bar = waitBar_();
  for (var i = 0; i < BUSY_STEPS.length; i++) {
    (function (step) {
      BUSY_TIMERS.push(setTimeout(function () {
        if (btn) btn.textContent = step.text;
        if (bar) {
          bar.textContent = step.text;
          bar.className = 'waitbar is-on';
        }
      }, step.at));
    })(BUSY_STEPS[i]);
  }
}

/** 末尾の「…」は落とす。動く点はCSS（.is-busy::after）が出します */
function busyLabel_(s) {
  return String(s).replace(/[…\.…]+$/, '');
}

function busyClear_() {
  for (var i = 0; i < BUSY_TIMERS.length; i++) clearTimeout(BUSY_TIMERS[i]);
  BUSY_TIMERS = [];
  var bar = document.getElementById('waitbar');
  if (bar) bar.className = 'waitbar';
}

/** 画面の下に出す、待っているあいだの帯。無ければ作ります */
function waitBar_() {
  if (typeof document === 'undefined' || !document.body) return null;
  var bar = document.getElementById('waitbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'waitbar';
    bar.className = 'waitbar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    document.body.appendChild(bar);
  }
  return bar;
}
