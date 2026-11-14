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
 *    ?bank=1    … 銀行振込の選択肢を出します
 * ========================================================== */

'use strict';

var Q = new URLSearchParams(location.search);

var STATE = {
  uid: '',
  phase: '',
  remain: { part1: 0, part2: 0 },
  avail: { part1: false, part2: false, both: false },
  price: {},
  bank_days: 5,
  part: '',          // いま選ばれている部
  name: '',
  pay_url: ''
};

/* ============================================================
 *  入口
 * ========================================================== */

document.addEventListener('DOMContentLoaded', function () {
  initFontSize();
  initFade();
  paintStatic();

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

    STATE.phase     = r.phase;
    STATE.remain    = r.remain;
    STATE.avail     = r.avail;
    STATE.price     = r.price || {};
    STATE.bank_days = r.bank_days || 5;

    byId('foot-ver').textContent = r.version || '';
    paintLp();
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
    STATE.phase  = r.phase;
    STATE.remain = r.remain;
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
  byId('capacity-note').textContent = CONFIG.TEXT.capacity_note || '';
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
        (p.reception ? '<small>' + esc(p.reception) + '</small>' : '') + '</dd></div>';

    byId('items-' + k).innerHTML = (p.items && p.items.length)
      ? '<ul class="lines">' + p.items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'
      : '<p class="tbd">当日の内容は、決まりしだいこのページでご案内します。</p>';
  });
}

function venueSmall(v) {
  return v && v.name ? '<small>' + esc(v.name) + '　' + mapLink(v) + '</small>' : '';
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
      '<p class="plan__note">お一人さま　定員' + p.capacity + '名</p>';
  });

  byId('gate-before').hidden  = STATE.phase !== 'before';
  byId('gate-closed').hidden  = STATE.phase !== 'closed';

  var full = !STATE.avail.part1 && !STATE.avail.part2;
  byId('gate-open').hidden    = !(STATE.phase === 'open' && !full);
  byId('gate-soldout').hidden = !(STATE.phase === 'open' && full);

  if (STATE.phase === 'before') startCountdown();
  if (STATE.phase === 'open' && !full) paintPickOptions();

  // 募集前なのに開けている（確認用）ときだけ帯を出します
  byId('openbar').hidden = !(STATE.phase === 'before' && Q.get('phase'));
  var oa = document.querySelector('[data-open-at]');
  if (oa) oa.textContent = CONFIG.EVENT.open_label;
}

/** 残席のバッジ */
function seatHtml(k) {
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
      '<button type="button" class="payopt" data-pick="' + k + '"' + (ok ? '' : ' disabled') + '>' +
        '<span class="payopt__title">' + esc(p.label) + (p.title ? '　' + esc(p.title) : '') + '</span>' +
        '<span class="payopt__desc">' + esc(yen(p.price)) +
          (ok ? '　' + (p.time || '') : '　満席になりました') + '</span>' +
      '</button>');
  });

  // 両部は、第1部・第2部の両方に空きがあるときだけお見せします
  var b = ps.both;
  if (STATE.avail.both) {
    out.push(
      '<button type="button" class="payopt" data-pick="both">' +
        '<span class="payopt__title">' + esc(b.label) + '　' + esc(b.title) + '</span>' +
        '<span class="payopt__desc">' + esc(yen(b.price)) + '　第1部・第2部のお席をそれぞれ1つお取りします</span>' +
      '</button>');
  }

  byId('pick-options').innerHTML = out.join('');
  byId('pick-options').querySelectorAll('[data-pick]').forEach(function (btn) {
    btn.addEventListener('click', function () { goForm(btn.getAttribute('data-pick')); });
  });
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

  // 銀行振込もお選びいただくとき
  var showBank = CONFIG.PAYMENT.show_bank || Q.get(CONFIG.PAYMENT.bank_query) === '1';
  byId('form-payopts').hidden = !showBank;
  byId('btn-go').textContent = showBank ? 'この内容でお申し込みに進む' : 'お支払いに進む';
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
    '<button type="button" class="payopt" data-method="card">' +
      '<span class="payopt__title">' + esc(CONFIG.PAYMENT.card_label) + '</span>' +
      '<span class="payopt__desc">決済ページでそのままお支払いいただけます</span>' +
    '</button>' +
    '<button type="button" class="payopt" data-method="bank">' +
      '<span class="payopt__title">銀行振込</span>' +
      '<span class="payopt__desc">お申し込みから' + STATE.bank_days +
        '日以内にお振り込みください（選ぶと振込先が出ます）</span>' +
    '</button>';

  byId('pay-options').querySelectorAll('[data-method]').forEach(function (btn) {
    btn.addEventListener('click', function () { submitForm(btn.getAttribute('data-method')); });
  });
}

document.addEventListener('submit', function (e) {
  if (e.target.id === 'form-apply') {
    e.preventDefault();
    var showBank = CONFIG.PAYMENT.show_bank || Q.get(CONFIG.PAYMENT.bank_query) === '1';
    if (showBank) {
      // お支払い方法のボタンでお進みいただきます
      if (!checkName()) return;
      byId('form-payopts').hidden = false;
      byId('form-payopts').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    submitForm('card');
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
  STATE.name = name;
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

async function submitForm(method) {
  if (!checkName()) return;
  if (!STATE.uid) return showScreen('screen-nouid');

  var btn = byId('btn-go');
  busy(btn, true);

  try {
    if (method === 'bank') {
      var rb = await api('bank', { uid: STATE.uid, name: STATE.name, part: STATE.part });
      if (!rb || !rb.ok) return handleApiError(rb);
      paintBank(rb);
      return showScreen('screen-bank');
    }

    var r = await api('hold', { uid: STATE.uid, name: STATE.name, part: STATE.part });
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
      remain: remain,
      avail: { part1: remain.part1 > 0, part2: remain.part2 > 0,
               both: remain.part1 > 0 && remain.part2 > 0 },
      price: { part1: CONFIG.PARTS.part1.price, part2: CONFIG.PARTS.part2.price,
               both: CONFIG.PARTS.both.price },
      bank_days: 5
    });
  }
  if (action === 'hold') return Promise.resolve({ ok: true, part: body.part });
  if (action === 'bank') return Promise.resolve({
    ok: true, deadline: '（確認用の表示です）',
    bank: { bank: '◯◯銀行', branch: '◯◯支店', type: '普通',
            number: '0000000', holder: 'カ）◯◯', note: '恐れ入りますが、振込手数料はご負担ください。' }
  });
  if (action === 'bank_report') return Promise.resolve({ ok: true });
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

/** スクロールでふわっと出す */
function initFade() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('[data-fade]').forEach(function (el) { el.classList.add('is-in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  document.querySelectorAll('[data-fade]:not(.is-in)').forEach(function (el) { io.observe(el); });
}

/** 「ひとつ前にもどる」 */
document.addEventListener('click', function (e) {
  var b = e.target.closest ? e.target.closest('[data-back]') : null;
  if (!b) return;
  e.preventDefault();
  showScreen('screen-lp');
  paintLp();
});
