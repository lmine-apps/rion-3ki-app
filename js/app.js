/* ===== 凛穏塾 3期生 お申し込みアプリ ===== */

let STATE = null;
let POLL_TIMER = null;

// ---------------------------------------------------------------- 起動
document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  initFontSize();
  fillStaticLinks();

  // 🔧 メンテナンス中（アプリ側のスイッチ）。GASに問い合わせる前に止めます
  if (CONFIG.MAINTENANCE) { showMaintenance(CONFIG.MAINTENANCE_NOTE); return; }

  const uid = getUid();
  if (!uid) { showScreen('screen-nouid'); return; }

  /* ★署名後の入口（?signed=1）から来た方は、GASに一緒に伝える（2026-09-03）。
     プロラインの「実行時に外部プログラム」が届かないことがあったので、
     こちらからも署名完了を伝えられるようにした。
     ・すでに署名ずみなら、GAS側で何もしない（二重に記録しない）
     ・通信は1回のまま。余計な待ち時間は増えない */
  const signed = new URLSearchParams(location.search).get('signed') === '1' ? 1 : 0;

  try {
    showLoading(true);
    const res = await api('enter', signed ? { uid, signed: 1 } : { uid });
    render(res);
  } catch (err) {
    showError(String(err.message || err));
  } finally {
    showLoading(false);
  }
}

/** 講座名を設定から流し込む（規約類は js/legal.js を読んでアプリ内で開く） */
function fillStaticLinks() {
  const c = document.getElementById('course-name');
  if (c) c.textContent = CONFIG.COURSE.name;
}

/**
 * その方のコースに合わせた表示のちがい（2026-09-06）。
 * 3.5期の方に「3期生」と出てしまわないように、コース名で切り替えます。
 * CONFIG.BY_PLAN に無いコースは、これまでどおりの表示のままです。
 */
/**
 * メンテナンス中の画面（2026-09-06）。
 * 運営が「メンテナンス中にする」を押しているあいだ、GASが error:'maintenance' を返します。
 */
function showMaintenance(note) {
  const el = document.getElementById('maint-note');
  if (el) {
    if (note) { el.textContent = note; el.hidden = false; }
    else { el.textContent = ''; el.hidden = true; }
  }
  showScreen('screen-maintenance');
}

function planView() {
  const key = (STATE.plan && STATE.plan.key) || '';
  return (CONFIG.BY_PLAN && CONFIG.BY_PLAN[key]) || {};
}

/** ヘッダーの講座名を、その方のコースに合わせて出し直す */
function paintCourseName() {
  const v = planView();
  const c = document.getElementById('course-name');
  if (c) c.textContent = v.name || CONFIG.COURSE.name;
  const k = document.getElementById('course-kicker');
  if (k && v.kicker) k.textContent = v.kicker;
}

// ---------------------------------------------------------------- 画面の出し分け
/**
 * 現在地（GASが返す stage）だけを見て画面を決める。
 * どの端末から入っても、スプシの進捗どおりの画面が開く。
 */
function render(res) {
  stopPolling();

  // メンテナンス中は、どの口から返ってきてもこの画面に寄せる
  if (res && res.ok === false && res.error === 'maintenance') {
    showMaintenance(res.note);
    return;
  }

  // 受付前は、どの口から返ってきても「受付開始までお待ちください」に寄せる（念のための保険）
  if (res && res.ok === false && res.error === 'before_open') {
    res = { ok: true, registered: false, stage: '受付前',
            open_at: res.open_at, open_at_text: res.open_at_text };
  }

  if (!res || res.ok === false) { showError(res && res.error ? errorMessage(res.error) : '状態を取得できませんでした'); return; }
  STATE = res;

  // ヘッダーの講座名を、その方のコースに合わせて出し直す（3.5期の方に「3期生」と出さないため）
  paintCourseName();

  // テスト中だけ帯を出す。本番の金額ではないと、ひと目で分かるように
  const tb = document.getElementById('testbar');
  if (tb) tb.hidden = !res.test_mode;

  // 開始前なのに開けているときの帯（運営の戻し忘れ防止）
  const ob = document.getElementById('openbar');
  if (ob) ob.hidden = !res.opened_for_test;
  if (res.open_at_text) {
    document.querySelectorAll('[data-open-at]').forEach(el => { el.textContent = res.open_at_text; });
  }

  // 受付前。コースが入っていても、開始のときこくまでは進ませない
  if (res.stage === '受付前') {
    startOpenCountdown(res.open_at);
    showScreen('screen-beforeopen');
    startPolling();
    return;
  }
  stopOpenCountdown();

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

    case '2回目の方法選択待ち':
      bar(step.pay);
      paintSecondOptions();
      showScreen('screen-second');
      break;

    case '2回目決済待ち':
      bar(step.pay);
      paintCardPayment(2);
      showScreen('screen-card');
      break;

    case '2回目入金待ち':
      bar(step.pay);
      paintBank(2);
      showScreen('screen-bank');
      break;

    case '入金待ち':
      bar(step.pay);
      paintBank();
      showScreen('screen-bank');
      break;

    case '着金待ち':
      bar(step.pay);
      paintWait('bank');
      showScreen('screen-bankwait');
      startPolling();
      break;

    case '決済確認まち':
      bar(step.pay);
      paintWait('card');
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

// ---------------------------------------------------------------- 受付開始までの秒読み
// 開始のときこくはサーバー（GAS）が持っています。端末の時計がずれていても、
// 表示が少しずれるだけで、通す・通さないの判断はサーバー側で決まります。
let OPEN_TIMER = null;

function startOpenCountdown(openAtMs) {
  stopOpenCountdown();
  if (!openAtMs) return;

  const put = (k, v) => {
    const el = document.querySelector(`[data-oc="${k}"]`);
    const s = (v < 10 ? '0' : '') + v;
    if (el && el.textContent !== s) el.textContent = s;
  };

  const tick = () => {
    const ms = openAtMs - Date.now();
    if (ms <= 0) {                       // 時間になったら、すぐ次の画面へ
      stopOpenCountdown();
      boot();
      return;
    }
    const d = Math.floor(ms / 86400000);
    put('d', d);
    put('h', Math.floor(ms / 3600000) - d * 24);
    put('m', Math.floor(ms / 60000) % 60);
    put('s', Math.floor(ms / 1000) % 60);
  };

  tick();
  OPEN_TIMER = setInterval(tick, 1000);
}

function stopOpenCountdown() {
  if (OPEN_TIMER) { clearInterval(OPEN_TIMER); OPEN_TIMER = null; }
}

// ---------------------------------------------------------------- 各画面の描画
/**
 * コース欄。withNote を false にすると、サービス内容の一文を出さない。
 * ★お支払いの画面では出しません（2026-08-27 とーる）。
 *   そこはもう規約に同意いただいたあとなので、コース名と金額だけで十分。
 */
function paintPlan(elId, withNote) {
  const el = document.getElementById(elId);
  if (!el || !STATE.plan) return;
  const p = STATE.plan;

  let body = '';
  if (withNote !== false) {
    if (p.items && p.items.length) body = planItemsHtml(p.items);
    else if (p.note) body = `<p class="plan__note">${esc(p.note)}</p>`;
    // 受講内容がまだ決まっていないコースは、そのことをはっきりお伝えする
    if (planView().items_pending) {
      body += `<p class="plan__note">受講内容の詳細は<b>ただいま未確定</b>です。決まりしだい、公式LINEにてご案内いたします。</p>`;
    }
    // お申し込みの期限があるコース（3.5期）は、その期限も添える
    if (planView().deadline) {
      body += `<p class="plan__note">お申し込みとお支払いは <b>${esc(planView().deadline)}まで</b>にお願いいたします。</p>`;
    }
  }

  el.innerHTML =
    `<div class="plan__name">${esc(p.label)}</div>
     <div class="plan__price">${esc(yen(p.total))}<span class="plan__tax">（税込）</span></div>
     ${body}`;
}

/** 受講内容の箇条書き。sub があれば、その下に小さくぶら下げる */
function planItemsHtml(items) {
  return '<ul class="plan__list">'
    + items.map((x) =>
        '<li>' + esc(x.t)
        + (x.sub && x.sub.length
            ? '<ul>' + x.sub.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>'
            : '')
        + '</li>').join('')
    + '</ul>';
}

function paintPayOptions() {
  paintPlan('pay-plan', false);   // ここは同意後。コース名と金額だけ出す
  const p = STATE.plan || {};
  const box = document.getElementById('pay-options');
  if (!box) return;

  const opts = [];
  if (p.pay_full) {
    opts.push(opt('カード一括', 'クレジットカードで一括', yen(p.total) + ' を1回でお支払い'));
  }
  if (p.pay_1 && p.pay_2) {
    opts.push(opt('カード2回', '2回に分けてお支払い',
      yen(p.split[0]) + ' ＋ ' + yen(p.split[1]) + '。',
      // ★2回目の選び直しは見落とされやすいので、ここだけ下線を引く
      '1回目はカードでお支払いいただき、2回目はカードか銀行振込かを、あらためてお選びいただけます'));
  }
  opts.push(opt('銀行振込', '銀行振込', yen(p.total) + ' を' + (STATE.bank_days || 5) + '日以内にお振り込み（選ぶと振込先が出ます）'));

  box.innerHTML = opts.join('');
  box.querySelectorAll('button[data-method]').forEach(b => {
    b.addEventListener('click', () => choosePayment(b.dataset.method, b));
  });

  const warn = document.getElementById('pay-nolink');
  if (warn) warn.hidden = !!(p.pay_full || (p.pay_1 && p.pay_2));

  function opt(method, title, desc, mark) {
    const tail = mark ? `<span class="payopt__mark">${esc(mark)}</span>` : '';
    return `<button type="button" class="payopt" data-method="${esc(method)}">
              <span class="payopt__title">${esc(title)}</span>
              <span class="payopt__desc">${esc(desc)}${tail}</span>
            </button>`;
  }
}

/**
 * 1回目が済んだあと、2回目をカードにするか銀行振込にするかを選んでいただく。
 * 総額は変わらず、当社での追加費用もありません。
 */
function paintSecondOptions() {
  const p = STATE.plan || {};
  const head = document.getElementById('second-body');
  const box = document.getElementById('second-options');
  if (head) {
    head.innerHTML =
      `<p>1回目のお支払いを確認しました。ありがとうございます。</p>
       <div class="amount">${esc(yen(p.split ? p.split[1] : p.total))}<span class="amount__tax">（税込）</span></div>
       <p class="note">残りのお支払いです。ご都合のよい方をお選びください。どちらを選ばれても総額は変わりません。</p>`;
  }
  if (!box) return;

  const opts = [];
  if (p.pay_2) {
    opts.push(`<button type="button" class="payopt" data-second="カード">
                 <span class="payopt__title">クレジットカード</span>
                 <span class="payopt__desc">${esc(yen(p.split ? p.split[1] : p.total))} を決済ページでお支払い</span>
               </button>`);
  }
  opts.push(`<button type="button" class="payopt" data-second="銀行振込">
               <span class="payopt__title">銀行振込</span>
               <span class="payopt__desc">${esc(yen(p.split ? p.split[1] : p.total))} を${STATE.bank_days || 5}日以内にお振り込み（選ぶと振込先が出ます）</span>
             </button>`);
  box.innerHTML = opts.join('');
  box.querySelectorAll('button[data-second]').forEach(b => {
    b.addEventListener('click', () => chooseSecond(b.dataset.second, b));
  });
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
     ${resetPayHtml(isSplit && n === 2 ? '2回目のお支払い方法を選び直す' : 'お支払い方法を選び直す')}
     <button type="button" class="doc-hint" data-act="declare-paid">お支払いが済んでいるのに、この画面が変わらないとき</button>
     ${payHintsHtml()}`;
}

/**
 * ご入金の確認まち。振込とカードで言い方を変える。
 * どちらも「運営が目視で確認して、LINEでご連絡する」ところは同じ。
 */
function paintWait(kind) {
  const el = document.getElementById('wait-body');
  if (!el) return;
  const m = STATE.marks || {};
  const isBank = kind === 'bank';
  const told = isBank
    ? 'お振り込みのご連絡をいただきました。'
    : 'お支払いのご連絡をいただきました。';
  const detail = (isBank && (m.bank_name || m.bank_date))
    ? `<dl class="bank">
         ${m.bank_name ? `<div><dt>お名義</dt><dd>${esc(m.bank_name)}</dd></div>` : ''}
         ${m.bank_date ? `<div><dt>お振込日</dt><dd>${esc(m.bank_date)}</dd></div>` : ''}
       </dl>`
    : '';
  el.innerHTML =
    `<h2 class="card__title">ご入金の確認をお待ちください</h2>
     <p>${told}ありがとうございます。<br>運営がご入金を確認しましたら、LINEでご連絡します。</p>
     ${detail}
     <p class="note">確認までお時間をいただくことがあります。この画面は閉じていただいて構いません。</p>
     <button type="button" class="btn btn--ghost" data-act="reload">最新の状態にする</button>`;
}

/**
 * ②署名待ち。契約書は別ツール（GMOサイン）だが、入口はこのアプリに集約する。
 * URLが未設定のうちは「準備中」を出して、お客様が待てる状態にしておく。
 */
/* ── 署名のしかたの動画（2026-09-02 とーるさんご要望）────────────────
   プロラインのメディアライブラリにある縦長の動画を、この画面に置きます。
   ★見なくても先へ進めます（任意）。読み込めなかったときは、
     動画のかたまりごと隠して、署名の導線だけ残します。
     ここで止めてしまうと、契約書へ進めなくなってしまうためです。
   ★プロラインの外なので [[uid]] は置き換わりません。アプリが持っている
     uid を自分で付けます（uid はプロラインのものと同じです）。
──────────────────────────────────────────────── */
const SIGN_VIDEO_ID = 'RXs9JFbSBg';
const SIGN_VIDEO_ASSETS = [
  { css: 'https://vjs.zencdn.net/7.15.4/video-js.css' },
  { css: 'https://autosns.jp/build/assets/video-js-DLDwZelC.css' },
  { js:  'https://autosns.jp/js/vendor/jquery-3.7.1.min.js?v=1788289390' },
  { js:  'https://cdn.jsdelivr.net/npm/js-cookie@2/src/js.cookie.min.js?v=2' },
  { js:  'https://vjs.zencdn.net/7.15.4/video.min.js' },
  { js:  'https://autosns.jp/build/assets/videojs-seek-buttons.min-DtWm0i3G.js' },
  { js:  'https://autosns.jp/build/assets/videojs-vjsdownload.min-Bpm5oSU6.js' }
];
let signVideoStarted = false;

function loadOne(spec) {
  return new Promise((done, fail) => {
    let el;
    if (spec.css) {
      el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = spec.css;
    } else {
      el = document.createElement('script');
      el.src = spec.js;
      el.async = false;               // 書いた順に読ませる（依存があるため）
    }
    el.onload = () => done();
    el.onerror = () => fail(new Error(spec.css || spec.js));
    document.head.appendChild(el);
  });
}

async function loadSignVideo() {
  if (signVideoStarted) return;
  signVideoStarted = true;

  const wrap = document.getElementById('sign-video');
  const box = document.getElementById('sign-video-box');
  if (!wrap || !box) return;

  const elId = 'video_js_' + SIGN_VIDEO_ID;
  box.innerHTML =
    `<div class="video-js-container" data-element-id="${elId}">`
    + `<video id="${elId}" class="video-js vjs-default-skin vjs-big-play-centered"></video>`
    + '</div>';

  try {
    for (const spec of SIGN_VIDEO_ASSETS) await loadOne(spec);
    await loadOne({ js: `https://autosns.jp/storage/video-js/${SIGN_VIDEO_ID}?uid=`
                        + encodeURIComponent(getUid() || '') });
    wrap.hidden = false;
  } catch (err) {
    // 読めなかったときは、そっと引っ込める（署名の導線は残す）
    wrap.hidden = true;
    box.innerHTML = '';
  }
}

function paintSign() {
  loadSignVideo();
  const el = document.getElementById('sign-action');
  if (el) {
    // 契約書URLがまだ無いあいだも、ボタンは本番と同じ形で置いておく。
    // 押すと「準備中」とだけお伝えする。画面の見た目が本番と変わらないので、
    // URLが決まったあとに慌てて作り直さなくてよい。
    el.innerHTML = STATE.contract_url
      ? `<a class="btn btn--primary" href="${esc(STATE.contract_url)}" target="_blank" rel="noopener">契約書を開く</a>`
      : `<button type="button" class="btn btn--primary" data-act="contract-soon">契約書を開く</button>
         <p class="note" id="contract-soon" hidden>
           ただいま契約書のご用意をしております。<b>整いしだい、公式LINEでお知らせ</b>いたしますので、
           少しだけお待ちください。</p>`;
  }
  const btn = document.querySelector('[data-act="declare-signed"]');
  // ★ふだんは出しません（2026-09-02）。署名していない方が
  //   ボタンひとつで先へ進めてしまうためです。
  //   署名の完了は、GMOサイン → LINEの専用シナリオ → mark_signed の道で入ります。
  //   GAS側の ALLOW_SELF_DECLARE_SIGN を true にしたときだけ出ます。
  if (btn) btn.hidden = !STATE.allow_self_sign;
}

/**
 * 「お支払い方法を選び直す」ボタン。
 * お支払いがまだ動いていないあいだだけ出す。押すと確かめてから、シートを書き直す。
 */
function resetPayHtml(label) {
  return `<button type="button" class="btn btn--ghost" data-act="reset-pay">${esc(label)}</button>`;
}

function paintBank(n) {
  const b = STATE.bank || {};
  const p = STATE.plan || {};
  const el = document.getElementById('bank-body');
  if (!el) return;
  // 2回目の銀行振込は、残りの金額だけをお振り込みいただく
  const amount = (n === 2 && p.split) ? p.split[1] : p.total;
  el.innerHTML =
    `${n === 2 ? '<p class="note">1回目のお支払いを確認しました。ありがとうございます。残りのお振り込みをお願いいたします。</p>' : ''}
     <div class="amount">${esc(yen(amount))}<span class="amount__tax">（税込）</span></div>
     ${STATE.bank_due
        ? `<p class="due">お振込期限　<b>${esc(STATE.bank_due)}</b></p>`
        : ''}
     <dl class="bank">
       <div><dt>金融機関</dt><dd>${esc(b.bank)}${
         b.bank_old ? `<span class="bank__old">${esc(b.bank_old)}</span>` : ''}</dd></div>
       <div><dt>支店名</dt><dd>${esc(b.branch)}</dd></div>
       <div><dt>口座種別</dt><dd>${esc(b.type)}</dd></div>
       <div><dt>口座番号</dt><dd>${esc(b.number)}</dd></div>
       <div><dt>口座名義</dt><dd>${esc(b.holder)}</dd></div>
     </dl>
     <p class="note">${esc(b.note || '')}</p>
     ${resetPayHtml(n === 2 ? '2回目のお支払い方法を選び直す' : 'お支払い方法を選び直す')}`;
}

function paintDone() {
  const el = document.getElementById('done-body');
  if (!el) return;
  const v = planView();
  // entrance を空にしてあるコース（開講日が未確定）は、日付を書かない言い方にする
  const entrance = Object.prototype.hasOwnProperty.call(v, 'entrance') ? v.entrance : CONFIG.ENTRANCE;
  const lead = entrance
    ? `お手続きはすべて完了しました。<br>${esc(entrance)}でお会いできることを楽しみにしています。`
    : `お手続きはすべて完了しました。<br>開講の日程は<b>ただいま未確定</b>です。決まりしだい、公式LINEにてご案内いたします。`;
  el.innerHTML =
    `<p>${lead}</p>
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
  if (act === 'declare-paid') return declarePaid(btn);
  if (act === 'reset-pay')    return resetPayment(btn);
  if (act === 'reload')       return boot();

  // 契約書URLがまだ無いとき。押したら理由をその場でお伝えする
  if (act === 'contract-soon') {
    const msg = document.getElementById('contract-soon');
    if (msg) msg.hidden = false;
    btn.disabled = true;
    return;
  }
});

/** お支払い方法を選び直す。押し間違い対策に、一度たしかめてから送る */
async function resetPayment(btn) {
  const second = (STATE.stage === '2回目決済待ち' || STATE.stage === '2回目入金待ち');
  const ok = await askConfirm(btn,
    second
      ? '2回目のお支払い方法を選び直しますか。カードか銀行振込を、もう一度お選びいただけます。'
      : 'お支払い方法を選び直しますか。はじめからお選びいただけます。',
    '選び直す');
  if (!ok) return;
  try {
    busy(btn, true);
    render(await api('reset_payment', { uid: getUid() }));
  } catch (err) { showError(String(err.message || err)); }
  finally { busy(btn, false); }
}

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

async function chooseSecond(method, btn) {
  const label = method === 'カード' ? 'クレジットカード' : '銀行振込';
  const ok = await askConfirm(btn,
    `2回目のお支払いを「${label}」にします。よろしいですか？`, 'はい、これにします');
  if (!ok) return;
  try {
    busy(btn, true);
    render(await api('choose_second', { uid: getUid(), method }));
  } catch (err) { showError(String(err.message || err)); }
  finally { busy(btn, false); }
}

async function reportBank(btn) {
  // 通帳と照らし合わせるため、お名義とお振込日を伺う（どちらも任意）
  const said = await askBankReport(btn);
  if (!said) return;
  try {
    busy(btn, true);
    render(await api('report_bank', {
      uid: getUid(),
      holder: said.holder,
      paid_on: said.paid_on
    }));
  } catch (err) { showError(String(err.message || err)); }
  finally { busy(btn, false); }
}

/**
 * カード決済が済んでいるのに画面が変わらないときの受け皿。
 * ここでは決済済みにはせず、運営に確認してもらう。
 */
async function declarePaid(btn) {
  const ok = await askConfirm(btn,
    'カードでのお支払いは完了していますか？運営が確認のうえ、LINEでご連絡します。',
    'はい、支払いました');
  if (!ok) return;
  try {
    busy(btn, true);
    render(await api('declare_paid', { uid: getUid() }));
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
    already_done: 'お支払いが完了しているため、選び直すことはできません。',
    already_reported: 'お支払いのご連絡をいただいているため、選び直すことはできません。変更をご希望の場合は、公式LINEからお知らせください。',
    bad_method: 'お支払い方法を選び直してください。',
    edoc_required: '書面を電子データで受け取ることへの承諾が必要です。チェックを入れてからお進みください。',
    not_bank: '銀行振込を選んだ方のみのお手続きです。',
    confirm_required: '署名の確認は運営が行います。少しお待ちください。',
    unauthorized: 'この画面を開く権限がありません。LINEのボタンから開き直してください。',
    before_open: 'お申し込みの受付は、まだ始まっていません。開始しましたらLINEでお知らせします。'
  };
  return map[code] || ('エラーが発生しました（' + code + '）');
}

// ---------------------------------------------------------------- デモモード
/** ?mock=1 のときだけ使う偽サーバー。GASが無くても全画面を確認できる */
const MOCK_KEY = 'rion3ki_mock_state';
function mockApi(action, body) {
  /* ?maint=1 で、メンテナンス中の見え方を確かめられます */
  if (new URLSearchParams(location.search).get('maint') === '1') {
    return Promise.resolve({ ok: false, error: 'maintenance',
                             note: new URLSearchParams(location.search).get('note') || '' });
  }

  const load = () => {
    try { return JSON.parse(localStorage.getItem(MOCK_KEY)) || {}; } catch (_) { return {}; }
  };
  const save = (s) => {
    if (new URLSearchParams(location.search).get('at')) return;   // ?at= は使い捨て
    try { localStorage.setItem(MOCK_KEY, JSON.stringify(s)); } catch (_) {}
  };

  /* ?at=◯◯ でその画面を直に出す。画面一覧のPDFを実物から作るために使う。
     localStorage は使わず、毎回この場で状態を組み立てる（前回の続きに引きずられない）。 */
  const AT = new URLSearchParams(location.search).get('at');
  const AT_PRESETS = {
    terms:     {},
    sign:      { terms: 1 },
    payselect: { terms: 1, signed: 1 },
    card:      { terms: 1, signed: 1, method: 'カード2回' },
    second:    { terms: 1, signed: 1, method: 'カード2回', pay1: 1 },
    bank:      { terms: 1, signed: 1, method: '銀行振込' },
    bankwait:  { terms: 1, signed: 1, method: '銀行振込', bank_report: 1,
                 holder: 'リオン ハナコ', paid_on: '2026/09/02' },
    done:      { terms: 1, signed: 1, method: 'カード一括', done: 1 }
  };

  const s = AT && AT_PRESETS[AT]
    ? Object.assign({ init: true,
                      plan: new URLSearchParams(location.search).get('plan') || 'VIP' },
                    AT_PRESETS[AT])
    : load();
  if (!AT && action === 'enter' && !s.init) {
    s.init = true;
    s.plan = new URLSearchParams(location.search).get('plan') || 'VIP';
    save(s);
  }
  if (action === 'agree_terms')    { if (!body || !body.edoc) return Promise.resolve({ ok: false, error: 'edoc_required' }); s.terms = true; save(s); }
  if (action === 'submit_profile') { s.profile = true; save(s); }
  if (action === 'declare_signed') { s.signed = true; save(s); }
  if (action === 'choose_payment') { s.method = body.method; save(s); }
  if (action === 'report_bank')    { s.bank_report = true; s.holder = (body && body.holder) || ''; s.paid_on = (body && body.paid_on) || ''; save(s); }
  if (action === 'declare_paid')   { s.self_paid = true; save(s); }
  if (action === 'choose_second')  { s.second = body.method; s.bank_report = false; save(s); }
  if (action === 'reset_payment')  {
    if (s.pay2 || s.bank_report || s.self_paid) return Promise.resolve({ ok: false, error: 'already_reported' });
    if (s.pay1) { s.second = ''; }          // 2回に分ける方の1回目が済んでいたら、2回目だけ消す
    else { s.method = ''; s.second = ''; }
    save(s);
  }
  if (action === 'mock_pay1')      { s.pay1 = true; save(s); }

  const plans = {
    'VIP':        { label: 'VIPコース', total: 990000, note: 'みこの個別セッション2回／中尾真巳の算命学鑑定2回（受講料に含む）／リトリート 12月5〜6日（参加費無料）／卒業式 2027年1月24日／講義動画の視聴期限1年', split: [500000, 490000] },
    'スタンダード': { label: 'スタンダードコース', total: 770000, note: 'みこのセッション2回／卒業式 2027年1月24日／講義動画の視聴期限1年', split: [400000, 370000] },
    '3.5期生':     { label: '凛穏塾3.5期生コース（グループサポート講座）', total: 385000, note: '2026年10月14日 開講／2027年2月14日まで（4か月間）／すべてオンライン（Zoom等）', split: [200000, 185000] }
  };
  /* 価格の下のサービス内容（箇条書き）。本番は GAS の PLAN_ITEMS から届く。
     ★ここは gas/Code.gs の PLAN_ITEMS を写したもの。
       画面一覧のPDFを実物から作るときに、箇条書きまで揃える必要があるため。
       GAS を直したら sync_mock_items.py を流して合わせ直す。 */
  const MOCK_ITEMS = {
  'VIP': [
    { t: '4ヶ月間の東洋哲学オンライン講座「凛穏塾」および関連サポート' },
    { t: 'メイン講師による個別セッションZoom 全2回（1回120分）' },
    { t: '算命学講師による個別鑑定Zoom 全2回（1回90分）' },
    { t: 'オンライン講義 全11回（1回120分）' },
    { t: '対面形式による卒業式',
      sub: ['参加費用は受講料に含まれ、会場までの交通費のみ受講生の自己負担'] },
    { t: '1泊2日の宿泊型リトリートプログラム 1回',
      sub: ['参加費用は受講料に含まれ、会場までの交通費のみ受講生の自己負担'] },
    { t: 'LINEによる質問サポート',
      sub: ['毎週月曜日と木曜日に質問を受付し、受付後24時間以内に担当講師より回答',
            '12月31日は休業日とし、また講師の急病その他やむを得ない事情がある場合は、回答が遅れることがあります'] },
    { t: 'ゆるカフェ交流会Zoom 全2回（1回120分）' },
    { t: 'オープンチャットによるグループサポート',
      sub: ['講師からの学びやボイス配信 全4回（月1回）',
            '講義では学べない細やかなアドバイス',
            '宿題の提出・共有による相互学習の機会'] }
  ],
  'スタンダード': [
    { t: '4ヶ月間の東洋哲学オンライン講座「凛穏塾」および関連サポート' },
    { t: 'メイン講師による個別セッションZoom 全2回（1回120分）' },
    { t: 'オンライン講義 全11回（1回120分）' },
    { t: '対面形式による卒業式',
      sub: ['参加費用は受講料に含まれ、会場までの交通費のみ受講生の自己負担'] },
    { t: 'LINEによる質問サポート',
      sub: ['毎週月曜日と木曜日に質問を受付し、受付後24時間以内に担当講師より回答',
            '12月31日は休業日とし、また講師の急病その他やむを得ない事情がある場合は、回答が遅れることがあります'] },
    { t: 'ゆるカフェ交流会Zoom 全2回（1回120分）' },
    { t: 'オープンチャットによるグループサポート',
      sub: ['講師からの学びやボイス配信 全4回（月1回）',
            '講義では学べない細やかなアドバイス',
            '宿題の提出・共有による相互学習の機会'] }
  ],
  // ★3.5期生（2026-09-07 とーるさんから別表を受領して反映）
  '3.5期生': [
    { t: '4か月間のグループサポート講座「凛穏塾3.5期生コース」',
      sub: ['2026年10月14日（開講日）から2027年2月14日まで'] },
    { t: 'オンライン講義 全10回（1回あたり約120分）' },
    { t: 'グループセッション 全3回' },
    { t: '受講期間中の質問サポート（公式LINE等による）' },
    { t: '講義アーカイブ動画・教材資料の提供' },
    { t: 'すべてオンライン（Zoom等）により提供' }
  ]
};

  const plan = Object.assign({}, plans[s.plan] || plans['VIP']);
  if (MOCK_ITEMS[s.plan]) plan.items = MOCK_ITEMS[s.plan];

  const withProfile = new URLSearchParams(location.search).get('profile') === '1';

  let stage = 'プラン未設定';
  if (s.done) stage = '完了';
  else if (s.plan === 'none') stage = 'プラン未設定';
  else if (!s.terms) stage = '規約同意待ち';
  else if (withProfile && !s.profile) stage = 'お客様情報待ち';
  else if (!s.signed) stage = '署名待ち';
  else if (!s.method) stage = '支払方法未選択';
  else if (s.method === '銀行振込') stage = s.bank_report ? '着金待ち' : '入金待ち';
  else if (s.method === 'カード2回' && s.pay1) {
    if (!s.second) stage = '2回目の方法選択待ち';
    else if (s.second === '銀行振込') stage = s.bank_report ? '着金待ち' : '2回目入金待ち';
    else if (s.self_paid) stage = '決済確認まち';
    else stage = '2回目決済待ち';
  }
  else if (s.self_paid) stage = '決済確認まち';
  else stage = '決済待ち';

  /* ?slow=6 で、6秒かかったふりをします（待っているあいだのご案内の確かめ用）。
     本番のGASは眠っていると立ち上がりに数秒かかるので、その様子を再現します。 */
  const SLOW = Number(new URLSearchParams(location.search).get('slow') || 0);
  const answer = (o) => SLOW > 0
    ? new Promise((r) => setTimeout(() => r(o), SLOW * 1000))
    : Promise.resolve(o);

  return answer({
    ok: true, uid: 'MOCKUID', registered: true, stage,
    name: 'テスト 太郎',
    plan: Object.assign({ key: s.plan, pay_full: '#mock-pay', pay_1: '#mock-pay1', pay_2: '#mock-pay2' }, plan),
    payment_method: s.method || '',
    // 本番と同じ表記にしてある（画面一覧のPDFで文言を確かめるため）。
    // ★口座番号だけは伏せ字。PDFは人手に渡るので、本物の番号を載せない。
    bank: { bank: 'ドコモSMTBネット銀行', bank_old: '旧：住信SBIネット銀行',
            branch: '法人第一支店（106）', type: '普通', number: '300●●●●',
            holder: 'カ）リオン',
            note: '恐れ入りますが、振込手数料はご負担ください。' },
    // 本物のGMOサインのURL（コースごと）。開いて確かめられるように入れてある。
    // ?nocontract=1 を付けると「準備中」の見え方になる。
    contract_url: new URLSearchParams(location.search).get('nocontract') === '1' ? ''
      : (s.plan === 'スタンダード'
          ? 'https://app.gmosign.com/openForm/reception/17c30c6c-a3dc-4294-82fa-70f6c5396da3'
          : 'https://app.gmosign.com/openForm/reception/d970980e-9b55-4cde-8b0d-0f7d85d1f3e0'),
    bank_due: (s.method === '銀行振込' || s.second === '銀行振込') ? '2026/09/05 23:59' : null,
    bank_days: 5,
    require_profile: withProfile,
    allow_self_sign: new URLSearchParams(location.search).get('selfsign') === '1',

    marks: { bank_name: s.holder || '', bank_date: s.paid_on || '',
             self_paid: s.self_paid ? '（申告あり）' : null,
             second: s.second || '', due_amount: '' }
  });
}
