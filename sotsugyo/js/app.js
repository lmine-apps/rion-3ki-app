/* ============================================================
 *  凛穏塾 3期生 卒業式｜サロン生 受付ページ
 *
 *  ★文章・金額・会場などは js/config.js にまとめてあります。
 *    ここ（app.js）は動きだけです。ふだんは触りません。
 *
 *  画面の流れ
 *    画面1 ご案内＋参加される部を選ぶ  → screen-lp
 *    画面2 お名前をいただく            → screen-form
 *    画面3 決済ページを開きました      → screen-go
 *    画面4 お振込先のご案内（振込のとき）→ screen-bank
 *
 *  確認のときに便利なもの（URLのうしろに足します）
 *    ?mock=1    … GASにつながず、ぜんぶの画面を見られます
 *    &phase=open|before|closed … 募集の状況を好きに切り替えます
 *    &remain=3,0 … 残席を好きな数にします（第1部,第2部）
 *    &limit=1    … 定員の上限を「かけている」ときの見た目にします（いまは外しているのが標準）
 *    ?bank=1    … 銀行振込の選択肢を出します
 * ========================================================== */

'use strict';

var Q = new URLSearchParams(location.search);

var STATE = {
  uid: '',
  phase: '',
  remain: { part1: 0, part2: 0 },
  limit: true,       // 定員の上限をかけているか（GASが返します。false のあいだ定員・残席は出しません）
  avail: { part1: false, part2: false, both: false },
  price: {},
  bank_days: 5,
  part: '',          // いま選ばれている部
  name: '',
  pay_url: '',
  mine: null          // この方のお申し込み状況（action=mine の答え）
};

/* ============================================================
 *  入口
 * ========================================================== */

document.addEventListener('DOMContentLoaded', function () {
  initFontSize();
  initFade();
  paintStatic();
  bindDayButtons();

  if (CONFIG.MAINTENANCE) {
    byId('maint-note').textContent = CONFIG.MAINTENANCE_NOTE || byId('maint-note').textContent;
    return showScreen('screen-maint');
  }

  STATE.uid = pickUid();

  // 公式LINEのボタン以外から開かれたとき（?uid= が無いとき）は、ご案内だけ出します。
  //   ?mock=1 のときは確認用なので通します。
  if (CONFIG.REQUIRE_UID && !STATE.uid && Q.get('mock') !== '1') {
    paintNoUid();
    return showScreen('screen-nouid');
  }

  load();
});

/** ?uid= を拾って覚えます。2回目以降はLINEを通らなくても開けるように */
function pickUid() {
  var q = s(Q.get('uid'));
  if (q) {
    try { localStorage.setItem(CONFIG.UID_KEY, q); } catch (ignore) {}
    return q;
  }
  try { return s(localStorage.getItem(CONFIG.UID_KEY)); } catch (ignore) { return ''; }
}

/** 「公式LINEからお開きください」の画面。LINEのURLがあればボタンも出します */
function paintNoUid() {
  var box = byId('nouid-line');
  if (!box) return;
  if (CONFIG.LINE_URL) {
    box.innerHTML = '<a class="btn" href="' + esc(CONFIG.LINE_URL) +
      '" target="_blank" rel="noopener">凛穏塾の公式LINEをひらく</a>';
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

/* ============================================================
 *  Googleマップ
 * ========================================================== */

/** config に map: があればそれを、無ければ会場名＋住所から作ります */
function mapUrl(v) {
  if (!v) return '';
  if (v.map) return v.map;
  var q = (s(v.name) + ' ' + s(v.address)).trim();
  return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
}

/** 「地図を見る」の小さなリンク */
function mapLink(v) {
  var u = mapUrl(v);
  return u ? '<a class="maplink" href="' + esc(u) + '" target="_blank" rel="noopener">地図を見る</a>' : '';
}

async function load() {
  showLoading(true);
  try {
    var r = await api('state', {});
    if (!r || !r.ok) throw new Error(r && r.error ? r.error : 'state');

    setSkew(r.now);
    STATE.phase     = r.phase;
    STATE.remain    = r.remain;
    STATE.limit     = r.limit !== false;
    STATE.avail     = r.avail;
    STATE.price     = r.price || {};
    STATE.bank_days = r.bank_days || 5;
    STATE.test_mode = !!r.test_mode;      // 🧪 テスト決済のボタンを出すか
    paintTestBand();

    byId('foot-ver').textContent = r.version || '';
    paintLp();

    // お支払いが済んでいる方には、受付のご案内ではなく「当日のご案内」を出します
    var mine = await loadMine();
    if (mine && mine.paid) {
      paintDay(mine);
      return showScreen('screen-day');
    }
    // お振込をお待ちしている方には、振込先をもう一度お見せします
    if (mine && mine.waiting) {
      STATE.part = mine.waiting.part;
      STATE.name = mine.name || '';
      paintBank(mine.waiting);
      paintBankReported(mine.waiting.reported);
      return showScreen('screen-bank');
    }

    showScreen('screen-lp');

    // 残席を黙って取り直します（ほかの方が申し込んだら数字が変わる）
    if (STATE.phase === 'open' && CONFIG.POLL_INTERVAL > 0) {
      setInterval(refreshRemain, CONFIG.POLL_INTERVAL);
    }
  } catch (err) {
    console.error(err);
    showScreen('screen-error');
  }
}

async function refreshRemain() {
  // 画面1を見ている方にだけ効かせます（入力中の方のじゃまをしない）
  if (!byId('screen-lp').classList.contains('is-active')) return;
  try {
    var r = await api('state', {});
    if (!r || !r.ok) return;
    setSkew(r.now);
    STATE.phase  = r.phase;
    STATE.remain = r.remain;
    STATE.limit  = r.limit !== false;
    STATE.avail  = r.avail;
    paintLp();
  } catch (ignore) {}
}

/* ============================================================
 *  画面1を描く
 * ========================================================== */

/** config.js だけで決まるところ（通信の前に出してしまう） */
function paintStatic() {
  var ev = CONFIG.EVENT;
  setText('[data-ev="kicker"]', ev.kicker);
  setText('[data-ev="name"]', ev.name);
  setText('[data-ev="date"]', ev.date + (ev.date_note ? '　' + ev.date_note : ''));
  document.title = '卒業式のご案内｜' + ev.name;

  var tk = byId('link-tokusho'), pv = byId('link-privacy');
  linkOrDisable(tk, CONFIG.LINKS.tokusho);
  linkOrDisable(pv, CONFIG.LINKS.privacy);

  byId('target-note').textContent   = CONFIG.TEXT.target_note || '';

  // 締切の日時（2026-11-20）。秒読みの枠の中に出します
  setTextId('closecd-open',  CONFIG.EVENT.open_label ? CONFIG.EVENT.open_label + ' 開始' : '');
  setTextId('closecd-close', CONFIG.EVENT.close_label || '');
  byId('before-note').textContent   = CONFIG.TEXT.before_open || '';
  byId('closed-note').textContent   = CONFIG.TEXT.after_close || '';
  byId('soldout-note').textContent  = CONFIG.TEXT.soldout || '';
  byId('name-reason').textContent   = CONFIG.TEXT.name_reason || '';

  // ごあいさつ・みこ先生のお言葉・当日のご案内・お取り消し
  paintLead('box-intro', 'intro-body', (CONFIG.INTRO || {}).lead);
  paintLines('box-cancel', 'cancel-body', (CONFIG.CANCEL || {}).lines);
  paintLines('box-notice', 'notice-body', (CONFIG.NOTICE || {}).lines);
  if (CONFIG.NOTICE && CONFIG.NOTICE.title) byId('notice-title').textContent = CONFIG.NOTICE.title;
  paintMessage();

  // 開催概要
  var ps = CONFIG.PARTS;
  var rows = [['日時', esc(ev.date)]];
  if (ps.part1.time) rows.push(['第1部', esc(ps.part1.time) + venueSmall(ps.part1.venue)]);
  if (ps.part2.time) {
    rows.push(['第2部', esc(ps.part2.time) +
      (ps.part2.reception ? '<small>' + esc(ps.part2.reception) + '</small>' : '') +
      venueSmall(ps.part2.venue)]);
  }
  rows.push(['受付期間', esc(ev.open_label) + '　〜　' + esc(ev.close_label)]);
  byId('info-main').innerHTML = rows.map(function (r) {
    return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
  }).join('');

  // 各部の会場と内容
  ['part1', 'part2'].forEach(function (k) {
    var p = ps[k];
    byId('info-' + k).innerHTML =
      '<div><dt>会場</dt><dd>' + esc(p.venue.name) +
        '<small>' + esc(p.venue.address) + (p.venue.note ? '　' + esc(p.venue.note) : '') +
        '　' + mapLink(p.venue) + '</small></dd></div>' +
      '<div><dt>時間</dt><dd>' + esc(p.time || '—') +
        (p.reception ? '<small>' + esc(p.reception) + '</small>' : '') + '</dd></div>' +
      tbdRow(p.items);

    byId('items-' + k).innerHTML = (p.items && p.items.length)
      ? '<ul class="lines">' + p.items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'
      : '';
  });
}

function venueSmall(v) {
  return v && v.name ? '<small>' + esc(v.name) + '　' + mapLink(v) + '</small>' : '';
}

/* まだ決まっていないところは「未確定」とだけ出します
 *   （2026-11-16 とーるさん「詳細未確定部分は『未確定』とするだけでいいです」）
 *   言い回しを変えたくなったら config.js の TEXT.tbd だけ直してください。
 *   中身（items）が入った時点で、この行は自動で消えて箇条書きに変わります。 */
function tbdLabel() {
  return (CONFIG.TEXT && CONFIG.TEXT.tbd) || '未確定';
}
function tbdRow(list, label) {
  if (list && list.length) return '';
  return '<div><dt>' + esc(label || '内容') + '</dt>' +
         '<dd><span class="tbd-chip">' + esc(tbdLabel()) + '</span></dd></div>';
}

/** 通信のあとで決まるところ（残席・押せるボタン） */
function paintLp() {
  var ps = CONFIG.PARTS;

  ['part1', 'part2'].forEach(function (k) {
    var p = ps[k];
    byId('plan-' + k).innerHTML =
      '<div class="plan__head">' +
        '<div class="plan__name">' + esc(p.label) + (p.title ? '　' + esc(p.title) : '') + '</div>' +
        seatHtml(k) +
      '</div>' +
      '<div class="plan__price">' + esc(yen(p.price)) + '<span class="plan__tax">（税込）</span></div>' +
      (STATE.limit ? '<p class="plan__note">お一人さま　定員' + p.capacity + '名</p>' : '');
  });

  // 定員の案内。上限を外しているあいだは出しません（2026-11-21）
  var cn = byId('capacity-note');
  if (cn) {
    cn.textContent = STATE.limit ? (CONFIG.TEXT.capacity_note || '') : '';
    cn.hidden = !cn.textContent;
  }

  byId('gate-before').hidden  = STATE.phase !== 'before';
  byId('gate-closed').hidden  = STATE.phase !== 'closed';

  var full = !STATE.avail.part1 && !STATE.avail.part2;
  byId('gate-open').hidden    = !(STATE.phase === 'open' && !full);
  byId('gate-soldout').hidden = !(STATE.phase === 'open' && full);

  if (STATE.phase === 'before') startCountdown();
  if (STATE.phase === 'open' && !full) { paintPickOptions(); startCloseCountdown(); }

  /* 締切の一行。カウントダウンを出していないあいだだけ、ボタンの下に出します（2026-11-21）
   *   カウントダウンを出しているときは、その枠の中に締切が書いてあるので出しません。 */
  var dl = byId('entry-deadline');
  if (dl) {
    if (!CONFIG.SHOW_CLOSE_COUNTDOWN && CONFIG.EVENT.close_label) {
      dl.innerHTML = '受付は <b>' + esc(CONFIG.EVENT.close_label) + '</b> まで。' +
        (STATE.limit ? '定員に達した時点で終了いたします。' : '');
      dl.hidden = false;
    } else {
      dl.hidden = true;
    }
  }

  // 募集前なのに開けている（確認用）ときだけ帯を出します
  byId('openbar').hidden = !(STATE.phase === 'before' && Q.get('phase'));
  var oa = document.querySelector('[data-open-at]');
  if (oa) oa.textContent = CONFIG.EVENT.open_label;
}

/** 残席のバッジ */
function seatHtml(k) {
  if (!STATE.limit) return '';          // 定員の上限を外しているあいだは出しません
  var n = STATE.remain[k];
  if (typeof n !== 'number') return '';
  var cls = n <= 0 ? 'seat seat--none' : (n <= 5 ? 'seat seat--few' : 'seat');
  var text = n <= 0 ? '満席' : 'のこり<b>' + n + '</b>席';
  return '<span class="' + cls + '">' + text + '</span>';
}

/** 参加される部を選ぶボタン */
function paintPickOptions() {
  var ps = CONFIG.PARTS;
  var out = [];

  ['part1', 'part2'].forEach(function (k) {
    var p  = ps[k];
    var ok = STATE.avail[k];
    out.push(
      '<button type="button" class="payopt payopt--cta payopt--' + k + '"' +
        ' data-pick="' + k + '"' + (ok ? '' : ' disabled') + '>' +
        '<span class="payopt__body">' +
          '<span class="payopt__top">' +
            '<span class="payopt__label">' + (k === 'part1' ? 'PART 1' : 'PART 2') + '</span>' +
            (ok ? seatHtml(k) : '') +
          '</span>' +
          '<span class="payopt__title">' + esc(p.label) +
            (p.title ? '　' + esc(p.title) : '') + 'にお申し込み</span>' +
          '<span class="payopt__desc">' + esc(yen(p.price)) +
            (ok ? '　' + (p.time || '') : '　満席になりました') + '</span>' +
        '</span>' +
        '<span class="payopt__arrow" aria-hidden="true">→</span>' +
      '</button>');
  });

  // 両部は、第1部・第2部の両方に空きがあるときだけお見せします
  var b = ps.both;
  if (STATE.avail.both) {
    out.push(
      '<button type="button" class="payopt payopt--cta payopt--both" data-pick="both">' +
        '<span class="payopt__body">' +
          '<span class="payopt__top">' +
            '<span class="payopt__label">PART 1 + 2</span>' +
          '</span>' +
          '<span class="payopt__title">' + esc(b.label) + 'にお申し込み</span>' +
          '<span class="payopt__desc">' + esc(yen(b.price)) +
            '　第1部・第2部のお席をそれぞれ1つお取りします</span>' +
        '</span>' +
        '<span class="payopt__arrow" aria-hidden="true">→</span>' +
      '</button>');
  }

  byId('pick-options').innerHTML = out.join('');
  byId('pick-options').querySelectorAll('[data-pick]').forEach(function (btn) {
    btn.addEventListener('click', function () { goForm(btn.getAttribute('data-pick')); });
  });
}

/**
 * サーバー（GAS）の時計と、この端末の時計のずれを覚えます（2026-11-20）。
 *   端末の時計がずれている方でも、締切までの秒読みが合うようにするためです。
 *   GASは now を「2026/11/20 09:40:16」の形（日本時間）で返します。
 */
function setSkew(now) {
  var m = /^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(s(now));
  if (!m) return;
  var p2 = function (v) { return String(v).padStart(2, '0'); };
  var t = new Date(m[1] + '-' + p2(m[2]) + '-' + p2(m[3]) + 'T' +
                   p2(m[4]) + ':' + m[5] + ':' + m[6] + '+09:00').getTime();
  if (!isNaN(t)) STATE.skew = t - Date.now();
}

/** id で探して文字を入れます（無ければ何もしません） */
function setTextId(id, text) {
  var el = byId(id);
  if (el) el.textContent = text;
}

/**
 * 受付終了までの秒読み（2026-11-20 とーるさんご指定）
 *   ・締切は config.js の EVENT.close_at
 *   ・残り72時間を切ると data-urgency="soon"、24時間を切ると "last" にして色を変えます
 *   ・0になったら、受付の状況を取り直します（GASが「終了」を返せば画面が切り替わります）
 */
var CC_TIMER = null;
function startCloseCountdown() {
  var box = byId('closecd');
  if (!box) return;

  // いったん消しています（config.js の SHOW_CLOSE_COUNTDOWN）。
  // 締切を過ぎたときの切り替えは、20秒ごとの取り直し（refreshRemain）が受け持ちます
  if (!CONFIG.SHOW_CLOSE_COUNTDOWN) { box.hidden = true; return; }

  // 「定員になり次第、早期終了」の帯は、上限をかけているときだけ
  var early = box.querySelector('.closecd__early');
  if (early) early.hidden = !STATE.limit;

  var open  = new Date(CONFIG.EVENT.open_at).getTime();
  var close = new Date(CONFIG.EVENT.close_at).getTime();
  if (isNaN(close)) { box.hidden = true; return; }
  box.hidden = false;
  if (CC_TIMER) return;

  var shown = {};
  var put = function (k, v) {
    var text = String(v).padStart(2, '0');
    if (shown[k] === text) return;
    var el = box.querySelector('[data-cc="' + k + '"]');
    if (!el) return;
    el.textContent = text;
    // 数字が変わった瞬間だけ、小さく動かします
    if (shown[k] !== undefined) {
      el.classList.remove('is-tick');
      void el.offsetWidth;
      el.classList.add('is-tick');
    }
    shown[k] = text;
  };

  var tick = function () {
    var now  = Date.now() + (STATE.skew || 0);
    var left = Math.max(close - now, 0);
    var sec  = Math.floor(left / 1000);
    put('d', Math.floor(sec / 86400));
    put('h', Math.floor(sec % 86400 / 3600));
    put('m', Math.floor(sec % 3600 / 60));
    put('s', sec % 60);

    var u = left <= 86400000 ? 'last' : (left <= 259200000 ? 'soon' : 'normal');
    if (box.getAttribute('data-urgency') !== u || !shown.label) {
      box.setAttribute('data-urgency', u);
      setTextId('closecd-k', u === 'last' ? '締切まで24時間を切りました'
                           : u === 'soon' ? 'まもなく締切です'
                           : '受付終了まで');
      shown.label = true;
    }

    // 受付期間のうち、どこまで進んだか
    var bar = byId('closecd-bar');
    if (bar && !isNaN(open) && close > open) {
      var done = Math.min(Math.max((now - open) / (close - open), 0), 1);
      bar.style.width = (done * 100).toFixed(2) + '%';
    }

    if (left <= 0) {
      clearInterval(CC_TIMER);
      CC_TIMER = null;
      refreshRemain();
    }
  };

  tick();
  CC_TIMER = setInterval(tick, 1000);
}

/** 受付開始までの秒読み */
var CD_TIMER = null;
function startCountdown() {
  if (CD_TIMER) return;
  var open = new Date(CONFIG.EVENT.open_at).getTime();
  var tick = function () {
    var left = Math.max(open - Date.now(), 0);
    var sec = Math.floor(left / 1000);
    put('d', Math.floor(sec / 86400));
    put('h', Math.floor(sec % 86400 / 3600));
    put('m', Math.floor(sec % 3600 / 60));
    put('s', sec % 60);
    if (left <= 0) { clearInterval(CD_TIMER); location.reload(); }
  };
  var put = function (k, v) {
    var el = document.querySelector('[data-oc="' + k + '"]');
    if (el) el.textContent = String(v).padStart(2, '0');
  };
  tick();
  CD_TIMER = setInterval(tick, 1000);
}

/* ============================================================
 *  画面2｜お名前をいただく
 * ========================================================== */

function goForm(part) {
  if (!CONFIG.PARTS[part]) return;
  STATE.part = part;

  var p = CONFIG.PARTS[part];
  byId('form-picked').innerHTML = pickedHtml(part);

  var d = [];
  if (part === 'both') {
    d.push('<p class="note">' + esc(p.note || '') + '</p>');
    d.push('<dl class="info">' +
      '<div><dt>第1部</dt><dd>' + esc(CONFIG.PARTS.part1.time) +
        '<small>' + esc(CONFIG.PARTS.part1.venue.name) + '　' +
        mapLink(CONFIG.PARTS.part1.venue) + '</small></dd></div>' +
      '<div><dt>第2部</dt><dd>' + esc(CONFIG.PARTS.part2.time) +
        '<small>' + esc(CONFIG.PARTS.part2.venue.name) + '　' +
        mapLink(CONFIG.PARTS.part2.venue) + '</small></dd></div></dl>');
  } else {
    d.push('<dl class="info">' +
      '<div><dt>日時</dt><dd>' + esc(CONFIG.EVENT.date) + '　' + esc(p.time) + '</dd></div>' +
      '<div><dt>会場</dt><dd>' + esc(p.venue.name) +
        '<small>' + esc(p.venue.address) + '　' + mapLink(p.venue) + '</small></dd></div></dl>');
  }
  byId('form-detail').innerHTML = d.join('');

  byId('form-error').hidden = true;
  byId('f-name').value = STATE.name || '';
  byId('f-mail').value = STATE.mail || '';

  /* お支払い方法（2026-11-19 とーるさんご指定で並べ替え）
   *   振込も出すときは、最初からお支払い方法を並べておきます。
   *   そのボタンが、そのまま「進む」ボタンです。
   *   振込を出さないときだけ、従来どおり btn-go を使います。 */
  var showBank = CONFIG.PAYMENT.show_bank || Q.get(CONFIG.PAYMENT.bank_query) === '1';
  byId('form-payopts').hidden = !showBank;
  byId('btn-go').hidden = showBank;
  byId('btn-go').textContent = 'お支払いに進む';
  if (showBank) paintPayOptions();

  showScreen('screen-form');
}

function pickedHtml(part) {
  var p = CONFIG.PARTS[part];
  return '<span class="picked__name">' + esc(p.label) + (p.title ? '　' + esc(p.title) : '') + '</span>' +
         '<span class="picked__price">' + esc(yen(p.price)) + '<span>（税込）</span></span>';
}

function paintPayOptions() {
  byId('pay-options').innerHTML =
    '<button type="button" class="payopt payopt--cta payopt--card" data-method="card">' +
      '<span class="payopt__body">' +
        '<span class="payopt__top">' +
          '<span class="payopt__label">CARD</span>' +
        '</span>' +
        '<span class="payopt__title">' + esc(CONFIG.PAYMENT.card_label) + 'でお支払い</span>' +
        '<span class="payopt__desc">決済ページが開きます。その場でお席が確定します</span>' +
      '</span>' +
      '<span class="payopt__arrow" aria-hidden="true">→</span>' +
    '</button>' +
    '<button type="button" class="payopt payopt--cta payopt--bank" data-method="bank">' +
      '<span class="payopt__body">' +
        '<span class="payopt__top">' +
          '<span class="payopt__label">BANK</span>' +
        '</span>' +
        '<span class="payopt__title">銀行振込でお支払い</span>' +
        '<span class="payopt__desc">振込先と期限（お申し込みから' + STATE.bank_days +
          '日）を次の画面でご案内します</span>' +
      '</span>' +
      '<span class="payopt__arrow" aria-hidden="true">→</span>' +
    '</button>' +
    // 🧪 テストモードのあいだだけ出ます（2026-11-17）
    (STATE.test_mode
      ? '<button type="button" class="payopt payopt--test" data-method="test">' +
          '<span class="payopt__title">🧪 テスト決済</span>' +
          '<span class="payopt__desc">Stripeを通さずに決済済みにします。' +
            'そのあとの画面を確かめるためのものです</span>' +
        '</button>'
      : '');

  byId('pay-options').querySelectorAll('[data-method]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      submitForm(btn.getAttribute('data-method'), btn);
    });
  });
}

document.addEventListener('submit', function (e) {
  if (e.target.id === 'form-apply') {
    e.preventDefault();
    var showBank = CONFIG.PAYMENT.show_bank || Q.get(CONFIG.PAYMENT.bank_query) === '1';
    if (showBank) {
      /* お支払い方法のボタンでお進みいただきます。
         ここに来るのは、入力欄で Enter を押されたときだけです。 */
      if (!checkName()) return;
      byId('form-payopts').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    submitForm('card', byId('btn-go'));
  }
  if (e.target.id === 'form-bank') {
    e.preventDefault();
    sendBankReport();
  }
});

function checkName() {
  var name = s(byId('f-name').value);
  if (name.length < 1) return formError('お名前をご入力ください。');
  if (name.length > 40) return formError('お名前が長すぎるようです。');

  // メールアドレス（2026-11-17）。かたちだけ確かめます
  var mail = s(byId('f-mail').value);
  if (mail.length < 1) return formError('メールアドレスをご入力ください。');
  if (mail.length > 120) return formError('メールアドレスが長すぎるようです。');
  if (!/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(mail)) {
    return formError('メールアドレスのかたちをご確認ください。');
  }

  STATE.name = name;
  STATE.mail = mail;
  byId('form-error').hidden = true;
  return true;
}

function formError(msg) {
  var el = byId('form-error');
  el.textContent = msg;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return false;
}

async function submitForm(method, from) {
  if (!checkName()) return;
  if (!STATE.uid) return showScreen('screen-nouid');

  // お押しになったボタンそのものを「処理中」にします（2026-11-19）
  var btn = from || byId('btn-go');
  busy(btn, true);

  try {
    if (method === 'bank') {
      var rb = await api('bank',
        { uid: STATE.uid, name: STATE.name, mail: STATE.mail, part: STATE.part });
      if (!rb || !rb.ok) return handleApiError(rb);
      paintBank(rb);
      return showScreen('screen-bank');
    }

    // 🧪 テスト決済。Stripeを通さずに決済済みにして、そのあとの画面を確かめます
    if (method === 'test') {
      var rt = await api('test_paid',
        { uid: STATE.uid, name: STATE.name, mail: STATE.mail, part: STATE.part });
      if (!rt || !rt.ok) return handleApiError(rt);
      var mine = await loadMine();
      if (mine && mine.paid) { paintDay(mine); return showScreen('screen-day'); }
      return showScreen('screen-lp');
    }

    var r = await api('hold',
      { uid: STATE.uid, name: STATE.name, mail: STATE.mail, part: STATE.part });
    if (!r || !r.ok) return handleApiError(r);

    // 決済ページへ。?uid= は【このページが】足します
    //   （GitHub Pages では [[uid]] は置きかわらないため）
    STATE.pay_url = CONFIG.PARTS[STATE.part].pay +
      (CONFIG.PARTS[STATE.part].pay.indexOf('?') >= 0 ? '&' : '?') +
      'uid=' + encodeURIComponent(STATE.uid);

    byId('go-picked').innerHTML = pickedHtml(STATE.part);
    byId('btn-reopen').href = STATE.pay_url;
    showScreen('screen-go');
    window.open(STATE.pay_url, '_blank', 'noopener');

  } catch (err) {
    console.error(err);
    formError('通信がうまくいきませんでした。少し経ってから、もう一度お押しください。');
  } finally {
    busy(btn, false);
  }
}

function handleApiError(r) {
  var e = r && r.error ? r.error : 'unknown';
  if (e === 'soldout') {
    if (r && r.remain) { STATE.remain = r.remain; }
    paintLp();
    return formError('申し訳ございません。ちょうどお席が埋まってしまいました。');
  }
  if (e === 'before')   return formError('受付は' + CONFIG.EVENT.open_label + 'より開始します。');
  if (e === 'closed')   return formError('受付は' + CONFIG.EVENT.close_label + 'をもって終了しました。');
  if (e === 'no_uid')   { showScreen('screen-nouid'); return false; }
  if (e === 'bad_token') return formError('ページの読み込みがうまくいっていないようです。もう一度お開きください。');
  return formError('うまく進めませんでした。少し経ってから、もう一度お押しください。');
}

/* ============================================================
 *  画面4｜お振込先
 * ========================================================== */

/* ============================================================
 *  画面0｜当日のご案内（お支払いが済んだ方）
 * ========================================================== */

/** この方のお申し込み状況を聞きます。つながらなくても画面は止めません */
async function loadMine() {
  if (!STATE.uid) return null;
  try {
    var r = await api('mine', { uid: STATE.uid });
    if (!r || !r.ok) return null;
    STATE.mine = r;
    return r;
  } catch (ignore) {
    return null;
  }
}

function paintDay(m) {
  var d = CONFIG.DAY || {};

  byId('day-badge').textContent = d.badge || 'お申し込みを承っております';
  byId('day-title').textContent = d.title || '当日のご案内';

  // 冒頭の一文（お名前がわかっていれば、はじめに出します）
  var lead = [];
  if (m.name) lead.push(esc(m.name) + '　さま');
  (d.lead || []).forEach(function (t) { lead.push(esc(t)); });
  byId('day-lead').innerHTML = lead.length
    ? lead.map(function (t) { return '<p class="donelead">' + t + '</p>'; }).join('')
    : '';

  // ご参加の部ごとに、日時と会場と地図
  byId('day-parts').innerHTML = (m.parts || []).map(function (k) {
    var p = CONFIG.PARTS[k];
    if (!p) return '';
    return '<div class="daypart">' +
      '<div class="daypart__name">' + esc(p.label) + (p.title ? '　' + esc(p.title) : '') + '</div>' +
      '<dl class="info">' +
        '<div><dt>日時</dt><dd>' + esc(CONFIG.EVENT.date) + '　' + esc(p.time || '') +
          (p.reception ? '<small>' + esc(p.reception) + '</small>' : '') + '</dd></div>' +
        '<div><dt>会場</dt><dd>' + esc(p.venue.name) +
          '<small>' + esc(p.venue.address) + (p.venue.note ? '　' + esc(p.venue.note) : '') +
          '　' + mapLink(p.venue) + '</small></dd></div>' +
        tbdRow(p.items) +
      '</dl>' +
      ((p.items && p.items.length)
        ? '<ul class="lines">' + p.items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'
        : '') +
      '</div>';
  }).join('');

  // カレンダーに登録
  var calBox = byId('day-cal');
  if (d.show_calendar !== false && (m.parts || []).length) {
    var q = (m.parts.length > 1) ? 'both' : m.parts[0];
    calBox.innerHTML = '<a class="btn btn--ghost" href="calendar.html?part=' + esc(q) +
      '" target="_blank" rel="noopener">カレンダーに登録する</a>';
    calBox.hidden = false;
  } else {
    calBox.innerHTML = '';
    calBox.hidden = true;
  }

  // 追加事項（かたまりごと）
  var bc = byId('day-blocks-card');
  var blocks = (d.blocks || []).filter(function (b) { return b && (b.title || (b.lines || []).length); });
  if (blocks.length) {
    bc.innerHTML = blocks.map(function (b) {
      return (b.title ? '<h2 class="card__title">' + esc(b.title) + '</h2>' : '') +
        '<ul class="lines">' + (b.lines || []).map(function (t) {
          return '<li>' + esc(t) + '</li>';
        }).join('') + '</ul>';
    }).join('');
    bc.hidden = false;
  } else {
    bc.hidden = true;
  }

  // 当日のご案内（持ち物・服装など）
  paintLines('day-notice-card', 'day-notice-body', (CONFIG.NOTICE || {}).lines);
  if (CONFIG.NOTICE && CONFIG.NOTICE.title) byId('day-notice-title').textContent = CONFIG.NOTICE.title;

  // 片方だけお振込がまだのとき
  var bk = byId('day-bank-card');
  if (m.waiting) {
    var wp = CONFIG.PARTS[m.waiting.part];
    byId('day-bank-note').textContent =
      (wp ? wp.label : '') + 'は、お振込の確認が取れておりません。お振込の期限は ' +
      (m.waiting.deadline || '') + ' です。';
    bk.hidden = false;
  } else {
    bk.hidden = true;
  }

  // 公式LINE
  var lineBox = byId('day-line');
  if (CONFIG.LINE_URL) {
    lineBox.innerHTML = '<a class="btn btn--ghost" href="' + esc(CONFIG.LINE_URL) +
      '" target="_blank" rel="noopener">凛穏塾の公式LINEをひらく</a>';
    lineBox.hidden = false;
  } else {
    lineBox.innerHTML = '';
    lineBox.hidden = true;
  }

  // 受付中で、まだ両部そろっていない方には、ご案内への戻り道を出します
  byId('btn-day-lp').hidden = !(STATE.phase === 'open' && (m.parts || []).length < 2);
}

/** 「振り込みました」をもうお知らせいただいているとき */
function paintBankReported(reported) {
  var f = byId('form-bank');
  if (!f) return;
  if (reported) {
    f.hidden = true;
    var n = byId('bank-error');
    if (n) { n.hidden = true; }
  } else {
    f.hidden = false;
  }
}

function paintBank(r) {
  byId('bank-picked').innerHTML = pickedHtml(STATE.part);
  byId('bank-due').textContent = r.deadline || '';

  var b = r.bank || {};
  byId('bank-info').innerHTML =
    '<div><dt>金融機関</dt><dd>' + esc(b.bank || '') +
      (b.bank_old ? '<span class="bank__old">' + esc(b.bank_old) + '</span>' : '') + '</dd></div>' +
    '<div><dt>支店</dt><dd>' + esc(b.branch || '') + '</dd></div>' +
    '<div><dt>種別</dt><dd>' + esc(b.type || '') + '</dd></div>' +
    '<div><dt>口座番号</dt><dd>' + esc(b.number || '') + '</dd></div>' +
    '<div><dt>口座名義</dt><dd>' + esc(b.holder || '') + '</dd></div>';
  byId('bank-note').textContent = b.note || '';
}

/** 画面0のボタン */
function bindDayButtons() {
  var toLp = byId('btn-day-lp');
  if (toLp) toLp.addEventListener('click', function () { showScreen('screen-lp'); });

  var toBank = byId('btn-day-bank');
  if (toBank) toBank.addEventListener('click', function () {
    var m = STATE.mine;
    if (!m || !m.waiting) return;
    STATE.part = m.waiting.part;
    STATE.name = m.name || '';
    paintBank(m.waiting);
    paintBankReported(m.waiting.reported);
    showScreen('screen-bank');
  });
}

async function sendBankReport() {
  var btn = byId('btn-bank-report');
  busy(btn, true);
  try {
    var r = await api('bank_report', {
      uid: STATE.uid,
      part: STATE.part,
      holder: s(byId('f-holder').value),
      paid_on: s(byId('f-paidon').value)
    });
    if (!r || !r.ok) {
      var el = byId('bank-error');
      el.textContent = 'うまくお送りできませんでした。少し経ってから、もう一度お押しください。';
      el.hidden = false;
      return;
    }
    showScreen('screen-bank-done');
  } catch (err) {
    console.error(err);
    byId('bank-error').textContent = '通信がうまくいきませんでした。';
    byId('bank-error').hidden = false;
  } finally {
    busy(btn, false);
  }
}

/* ============================================================
 *  文章のかたまりを描くもの
 * ========================================================== */

function paintLead(boxId, bodyId, lines) {
  if (!lines || !lines.length) return;
  byId(bodyId).innerHTML = lines.map(function (t) {
    return '<p class="donelead">' + esc(t) + '</p>';
  }).join('');
  byId(boxId).hidden = false;
}

function paintLines(boxId, bodyId, lines) {
  if (!lines || !lines.length) return;
  byId(bodyId).innerHTML = lines.map(function (t) {
    return '<li>' + esc(t) + '</li>';
  }).join('');
  byId(boxId).hidden = false;
}

function paintMessage() {
  var m = CONFIG.MESSAGE || {};
  if (!m.body || !m.body.length) return;
  byId('message-body').innerHTML =
    m.body.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') +
    (m.who ? '<p class="msg__who">' + esc(m.who) + '</p>' : '');
  byId('box-message').hidden = false;
}

/* ============================================================
 *  GASとのやりとり
 *   POST・text/plain にしているのは、プリフライトを避けるためです。
 *   GASは久しぶりのアクセスだと立ち上がりに数秒かかり、
 *   その間に404や5xxを返すことがあるので、数回やり直します。
 * ========================================================== */

async function api(action, body) {
  if (Q.get('mock') === '1') return mockApi(action, body);

  var payload = Object.assign({ action: action, token: CONFIG.TOKEN }, body || {});
  var lastError = null;

  for (var i = 0; i <= CONFIG.RETRY_COUNT; i++) {
    if (i > 0) await sleep(CONFIG.RETRY_WAIT * i);
    try {
      var res = await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      if (res.ok) return res.json();
      if ([404, 429, 500, 502, 503, 504].indexOf(res.status) === -1) {
        throw new Error('通信に失敗しました（' + res.status + '）');
      }
      lastError = new Error('通信に失敗しました（' + res.status + '）');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('通信に失敗しました');
}

/** ?mock=1 のとき。GASにつながずに、ぜんぶの画面を見られます */
function mockApi(action, body) {
  var rm = (Q.get('remain') || '40,40').split(',');
  var remain = { part1: Number(rm[0] || 0), part2: Number(rm[1] || 0) };

  if (action === 'state') {
    return Promise.resolve({
      ok: true, version: 'mock', phase: Q.get('phase') || 'open',
      test_mode: Q.get('test') === '1',
      remain: remain,
      limit: Q.get('limit') === '1',     // いまの本番と同じく、上限なしが標準
      avail: { part1: remain.part1 > 0, part2: remain.part2 > 0,
               both: remain.part1 > 0 && remain.part2 > 0 },
      price: { part1: CONFIG.PARTS.part1.price, part2: CONFIG.PARTS.part2.price,
               both: CONFIG.PARTS.both.price },
      bank_days: 5
    });
  }
  if (action === 'mine') {
    var w = (Q.get('mine') || '').toLowerCase();   // part1 / part2 / both / bank
    if (!w) return Promise.resolve({ ok: true, paid: false, parts: [], rows: [], waiting: null });
    if (w === 'bank') {
      return Promise.resolve({
        ok: true, name: '凛穏 花子', paid: false, parts: [], rows: [],
        waiting: { part: 'part1', price: CONFIG.PARTS.part1.price, deadline: '（確認用の表示です）',
                   reported: false,
                   bank: { bank: '◯◯銀行', branch: '◯◯支店', type: '普通',
                           number: '0000000', holder: 'カ）◯◯',
                           note: '恐れ入りますが、振込手数料はご負担ください。' } }
      });
    }
    var parts = (w === 'both') ? ['part1', 'part2'] : [w];
    return Promise.resolve({ ok: true, name: '凛穏 花子', paid: true, parts: parts, rows: [], waiting: null });
  }
  if (action === 'hold') return Promise.resolve({ ok: true, part: body.part });
  if (action === 'bank') return Promise.resolve({
    ok: true, deadline: '（確認用の表示です）',
    bank: { bank: '◯◯銀行', branch: '◯◯支店', type: '普通',
            number: '0000000', holder: 'カ）◯◯', note: '恐れ入りますが、振込手数料はご負担ください。' }
  });
  if (action === 'bank_report') return Promise.resolve({ ok: true });
  if (action === 'test_paid')   return Promise.resolve({ ok: true, test: true });
  // お支払い方法を変える。?unbank=reported を付けると「ご連絡ずみで変えられない」を確認できます
  if (action === 'unbank') {
    var u = (Q.get('unbank') || '').toLowerCase();
    if (u === 'reported') return Promise.resolve({ ok: false, error: 'reported' });
    if (u === 'already')  return Promise.resolve({ ok: false, error: 'already' });
    return Promise.resolve({ ok: true, remain: remain });
  }
  return Promise.resolve({ ok: false, error: 'mock' });
}

/* ============================================================
 *  小さな道具
 * ========================================================== */

function byId(id) { return document.getElementById(id); }

function setText(sel, text) {
  var el = document.querySelector(sel);
  if (el) el.textContent = text || '';
}

function linkOrDisable(el, url) {
  if (!el) return;
  if (url) { el.href = url; el.removeAttribute('aria-disabled'); }
  else { el.href = '#'; el.setAttribute('aria-disabled', 'true'); }
}

function s(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

function esc(v) {
  return s(v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function yen(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (el) { el.classList.remove('is-active'); });
  var el = byId(id);
  if (el) el.classList.add('is-active');
  showLoading(false);
  window.scrollTo(0, 0);
  initFade();
}

function showLoading(on) {
  var el = byId('loading');
  if (el) el.hidden = !on;
}

function busy(btn, on) {
  if (!btn) return;
  btn.disabled = !!on;
  btn.classList.toggle('is-busy', !!on);
  var wb = byId('waitbar');
  if (wb) wb.classList.toggle('is-on', !!on);
}

/** 文字サイズ（中・大）。選んだものを覚えます */
function initFontSize() {
  var KEY = CONFIG.UID_KEY + '_fs';
  var set = function (v) {
    document.documentElement.setAttribute('data-fs', v);
    document.querySelectorAll('[data-fs]').forEach(function (b) {
      if (b.tagName === 'BUTTON') b.classList.toggle('is-on', b.getAttribute('data-fs') === v);
    });
    try { localStorage.setItem(KEY, v); } catch (ignore) {}
  };
  document.querySelectorAll('.fontsize button[data-fs]').forEach(function (b) {
    b.addEventListener('click', function () { set(b.getAttribute('data-fs')); });
  });
  var saved = 'normal';
  try { saved = localStorage.getItem(KEY) || 'normal'; } catch (ignore) {}
  set(saved);
}

/** スクロールでふわっと出す
 *  2026-11-18 作り直し。
 *    ブラウザの「見えました」の合図（IntersectionObserver）だけに頼ると、
 *    画面が裏に回っているときなどに合図が来ず、ずっと出ないままになります。
 *    そこで、スクロールのたびに自分でも位置を見るようにしました。
 *    どちらが先に気づいても結果は同じです（二重に出ることはありません）。 */
function initFade() {
  var list = [].slice.call(document.querySelectorAll('[data-fade]'));
  if (!list.length) return;

  var show = function (el) { el.classList.add('is-in'); };

  // 自分で位置を見るほう
  var ticking = false;
  var sweep = function () {
    ticking = false;
    var line = (window.innerHeight || 0) * 0.92;
    var rest = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.classList.contains('is-in')) continue;
      var r = el.getBoundingClientRect();
      // まだ画面に出ていない（高さが0の）ものは、そのまま待ちます。
      // これを入れないと、読み込んだ直後に全部まとめて出てしまいます。
      if (!r.height) { rest.push(el); continue; }
      if (r.top < line) show(el);
      else rest.push(el);
    }
    list = rest;
  };
  var onScroll = function () {
    if (ticking) return;
    ticking = true;
    // ここは setTimeout を使います。requestAnimationFrame は、画面が裏に
    // 回っているあいだ動かないブラウザがあるためです（2026-11-18）。
    setTimeout(sweep, 16);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  document.addEventListener('visibilitychange', onScroll);

  // ブラウザの合図があれば、そちらでも出します
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    list.forEach(function (el) { io.observe(el); });
  }

  sweep();                   // 最初に見えているぶん
  setTimeout(sweep, 200);    // 文章が入って高さが決まったあと
  setTimeout(sweep, 900);
}

/** 「ひとつ前にもどる」 */
document.addEventListener('click', function (e) {
  var b = e.target.closest ? e.target.closest('[data-back]') : null;
  if (!b) return;
  e.preventDefault();
  showScreen('screen-lp');
  paintLp();
});

/* ============================================================
 *  お支払い方法を変える（2026-11-16 とーるさんご要望）
 *
 *  カード … この時点ではまだお席を押さえていません（GASは「決済待ち」の
 *           行を作るだけ）。ですからそのまま選び直しの画面へ戻せます。
 *  振込   … お選びになった時点でお席を押さえています。GASに unbank を
 *           頼んで「決済待ち」に戻し、お席をお返ししてから画面を戻します。
 *
 *  ★「振り込みました」のご連絡をいただいたあとは変えられません。
 *    行き違いでご入金が済んでいることがあるためです。運営へご案内します。
 * ========================================================== */
document.addEventListener('click', function (e) {
  var t = e.target.closest
    ? e.target.closest('#btn-repick-bank, #btn-repick-card') : null;
  if (!t) return;
  e.preventDefault();
  repick(t.id === 'btn-repick-bank');
});

async function repick(fromBank) {
  if (fromBank) {
    var btn = byId('btn-repick-bank');
    busy(btn, true);
    try {
      var r = await api('unbank', { uid: STATE.uid, part: STATE.part });
      if (!r || !r.ok) {
        if (r && r.error === 'reported') {
          return bankError('お振込のご連絡をいただいております。'
            + 'お支払い方法を変えたい場合は、凛穏塾の公式LINEへご連絡ください。');
        }
        if (r && r.error === 'already') {
          return bankError('すでにお支払いが済んでおります。');
        }
        return handleApiError(r);
      }
    } catch (err) {
      console.error(err);
      return bankError('通信がうまくいきませんでした。少し経ってから、もう一度お押しください。');
    } finally {
      busy(btn, false);
    }
  }

  goForm(STATE.part);
  var opts = byId('pay-options');
  if (opts) opts.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* 🧪 テストモードのあいだ、画面の上に帯を出します（2026-11-17）。
 *   オフに戻し忘れると、お客様にも「テスト決済」が見えてしまうためです。 */
function paintTestBand() {
  var el = byId('test-band');
  if (!el) return;
  el.hidden = !STATE.test_mode;
}

/** 振込画面でのお知らせ（既にある bank-error の欄を使います） */
function bankError(msg) {
  var el = byId('bank-error');
  if (!el) return false;
  el.textContent = msg;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return false;
}
