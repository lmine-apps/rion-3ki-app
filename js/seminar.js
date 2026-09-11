/* ===== 凛穏塾 特別講義の受付（seminar.html 専用）=====
 *
 *   お申し込みのアプリ（index.html）とは別のページにしています。
 *   3期の方とまざらないように、URLごと分けるのが安全だからです。
 *
 *   【流れ】
 *     1. 運営が、3期に合格されなかった方へ特別講義のご案内を手で送る
 *        （このページのURL付き）
 *     2. 開いた方の uid を GAS に渡す
 *        → 「📋 面談」シートで、その方の「結果」を見る
 *          ・「3.5案内NG」／面談シートに見つからない … お問い合わせのご案内で止める
 *          ・それ以外                              … 受付ページを出す
 *        ★2026-09-06 とーるさんご判断。3期に合格されなかった方には基本的に全員
 *          ご案内するので、「案内する人」ではなく「案内しない人」に印を付ける。
 *          166名に印を付けるより確実で、付け忘れたときの事故も小さいため。
 *     3. ページに置いたボイスをお聞きいただく
 *        → 聞き終わるころ（CONFIG.SEMINAR.voice_gate）に
 *          「無料特別講義に参加します」のボタンが出る（2026-09-07 とーるさんご要望）
 *     4.「無料特別講義に参加します」→「📗 3.5期」シートに行ができ、セミナー参加に「参加」が入る
 *        ＝ 特別講義への参加のお申し込みが完了
 *     5. 講義のなかで3.5期のご案内をして、合言葉をお伝えする
 *     6. 合言葉をLINEに送っていただく
 *        → プロラインの実行プログラムが GAS を叩き、「合言葉 入力」に日付が入る
 *     7. このページを開き直すと「お申し込みにお進みください」に変わる
 *        （合言葉を送っていない方は、ずっと受付ずみの画面のままです）
 */

let STATE = {};

// ---------------------------------------------------------------- 起動
document.addEventListener('DOMContentLoaded', () => {
  initFontSize();
  boot();
});

async function boot() {
  // 🔧 メンテナンス中（アプリ側のスイッチ）。GASに問い合わせる前に止めます
  if (CONFIG.MAINTENANCE) { showMaintenance(CONFIG.MAINTENANCE_NOTE); return; }

  const uid = getUid();
  if (!uid) { showScreen('screen-nouid'); return; }
  try {
    showLoading(true);
    render(await api('seminar_state', { uid }));
  } catch (err) {
    showError(String(err.message || err));
  } finally {
    showLoading(false);
  }
}

// ---------------------------------------------------------------- 画面の出し分け
function render(res) {
  // メンテナンス中は、どの口から返ってきてもこの画面に寄せる
  if (res && res.ok === false && res.error === 'maintenance') {
    showMaintenance(res.note);
    return;
  }

  if (!res || res.ok === false) {
    showError(res && res.error ? errorMessage(res.error) : '状態を取得できませんでした');
    return;
  }
  STATE = res;

  switch (res.stage) {
    case 'ご案内対象外':
      showScreen('screen-notlisted');
      break;

    case 'セミナー受付':
      paintSeminar();
      showScreen('screen-seminar');
      break;

    case 'セミナー申込ずみ':
      paintSeminarDone();
      showScreen('screen-seminar-done');
      break;

    case 'お申し込みへ':
      paintReady();
      showScreen('screen-ready');
      break;

    default:
      showScreen('screen-notlisted');
  }
}

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

function errorMessage(code) {
  if (code === 'uid_required') return 'LINEから開き直してください。';
  if (code === 'not_found')    return 'ご案内の記録が見つかりませんでした。公式LINEにご連絡ください。';
  return '通信がうまくいきませんでした。少し時間をおいてお試しください。（' + code + '）';
}

// ---------------------------------------------------------------- 各画面の中身
/** 演題・日時・場所。ボイスを聞き終わってから出します */
function seminarInfoHtml() {
  const s = CONFIG.SEMINAR || {};
  const when = s.when
    ? esc(s.when)
    : '<b>日時は決まりしだい、公式LINEにてご案内いたします</b>';
  const subject = s.subject ? `<p class="subject">【${esc(s.subject)}】</p>` : '';
  const qualify = s.qualify_note ? `<p class="qualify">${esc(s.qualify_note)}</p>` : '';
  return `<div data-fade>${subject}${qualify}</div>
          <div data-fade>
            <dl class="bank">
              <div><dt>日時</dt><dd>${when}</dd></div>
              <div><dt>場所</dt><dd>${esc(s.where || '')}</dd></div>
            </dl>
          </div>`;
}

/**
 * 講義のご説明と、みこさんからの言葉。
 * ボイスを聞き終わった方と、参加を承った方に出します。
 * 中身はすべて CONFIG.SEMINAR にあるので、文章はそこだけ直せば変わります。
 */
function lectureBodyHtml() {
  const s = CONFIG.SEMINAR || {};
  let h = '';

  if (s.lead) h += `<div data-fade><p class="lead">${esc(s.lead)}</p></div>`;

  if (s.about && s.about.length) {
    h += '<div data-fade><h3 class="mid-title">この講義について</h3>';
    h += s.about.map((x) => `<p>${esc(x)}</p>`).join('');
    h += '</div>';
  }

  if (s.items && s.items.length) {
    h += '<div data-fade><h3 class="mid-title">当日お話しすること</h3>';
    h += '<ul class="plan__list">' + s.items.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>';
    h += '</div>';
  }

  if (s.notes && s.notes.length) {
    h += '<div data-fade><h3 class="mid-title">ご参加にあたって</h3><dl class="doc__dl">';
    h += s.notes.map((n) => `<div><dt>${esc(n[0])}</dt><dd>${esc(n[1])}</dd></div>`).join('');
    h += '</dl></div>';
  }

  if (s.message && s.message.length) {
    h += '<div data-fade><div class="msg">' + s.message.map((x) => `<p>${letterHtml(x)}</p>`).join('');
    if (s.message_who) h += `<span class="msg__who">${esc(s.message_who)}</span>`;
    h += '</div></div>';
  }

  return h;
}

/**
 * みこさんの言葉を、お手紙のように組む（2026-09-08 とーるさんご要望）。
 * 句読点のところで行を変えます。息づかいのまま読めるように。
 * 閉じかっこの前では改行しません（「〜。」が割れてしまうため）。
 */
function letterHtml(t) {
  var parts = String(t == null ? '' : t).match(/[^。、]*[。、]?/g) || [];
  parts = parts.filter(function (x) { return x !== ''; });

  var out = '', buf = '';
  for (var i = 0; i < parts.length; i++) {
    buf += parts[i];
    var last = parts[i].slice(-1);
    var end  = (i === parts.length - 1);
    if (end) { out += esc(buf); break; }
    // 句点では必ず行を変える。読点は、そこまでが短いとぶら下がるので続けます
    if (last === '。' || buf.length >= 8) { out += esc(buf) + '<br>'; buf = ''; }
  }
  return out;
}

/**
 * 講義の終盤にご案内があることを、そっとお伝えする一文（2026-09-08 とーるさんご要望）。
 * 詳細と、参加を承ったあとの画面の両方に出します。強調はしません。
 */
function offerNoteHtml() {
  const t = (CONFIG.SEMINAR || {}).offer_note;
  return t ? `<p class="note">${esc(t)}</p>` : '';
}

/** 3.5期のお申し込み期限。CONFIG.BY_PLAN['3.5期生'].deadline が正 */
function deadlineText() {
  const v = (CONFIG.BY_PLAN && CONFIG.BY_PLAN['3.5期生']) || {};
  return v.deadline || '';
}

/**
 * ①「お知らせ」の画面。
 *
 *   ★2026-09-08 とーるさんご要望。ボイスを聞く前に演題や日時が見えていると、
 *     お話のネタバレになってしまいます。そこで、聞く前は見出しも「お知らせ」だけにして、
 *     聞き終わったところで、詳細とお申し込みのボタンがまとめて現れる形にしました。
 */
function paintSeminar() {
  const el = document.getElementById('seminar-body');
  if (!el) return;
  const s = CONFIG.SEMINAR || {};
  el.innerHTML =
    `<p class="lead">${esc(s.lead_before || '')}</p>
     ${voiceHtml()}
     <div id="after-voice"></div>`;
  mountVoice();
  watchFade(el);
}

/** 聞き終わった方に出す、詳細とお申し込みのボタン */
function afterVoiceHtml() {
  const s = CONFIG.SEMINAR || {};
  return `${seminarInfoHtml()}
          ${lectureBodyHtml()}
          <div data-fade>
            ${offerNoteHtml()}
            <p class="note">${esc(s.note || '')}</p>
            <button type="button" class="btn btn--primary" data-act="seminar-join">無料特別講義に参加します</button>
          </div>`;
}

/* ================================================================
 *  スクロールに合わせて、ふわっと出す（2026-09-08 とーるさんご要望）
 *
 *  data-fade を付けたかたまりが、画面に入ってきたところで
 *  ゆっくり浮かび上がります。急がせない速さ（1.1秒）にしています。
 *
 *  ★JSが動かない環境では、そもそも隠しません。
 *    <html> に js-fade が付いているときだけ隠れる書き方にしてあるので、
 *    万一この処理が動かなくても、文章が見えなくなることはありません。
 *  ★「動きを減らす」設定の端末では、動かさずにそのまま出します。
 * ================================================================ */
var FADE_OBS = null;

function watchFade(root) {
  var items = (root || document).querySelectorAll('[data-fade]:not(.is-in)');
  if (!items.length) return;

  var reduce = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduce || !('IntersectionObserver' in window)) {
    for (var i = 0; i < items.length; i++) items[i].classList.add('is-in');
    return;
  }

  document.documentElement.classList.add('js-fade');

  if (!FADE_OBS) {
    FADE_OBS = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        // 同時に入ってきたものは、少しずつ時間をずらして出す
        e.target.style.transitionDelay = (n++ * 140) + 'ms';
        e.target.classList.add('is-in');
        FADE_OBS.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
  }
  for (var j = 0; j < items.length; j++) FADE_OBS.observe(items[j]);
}

/* ================================================================
 *  ボイス（先にお聞きいただくお話）  2026-09-07
 *
 *  CONFIG.SEMINAR.voice が空のあいだは、枠もゲートも出ません
 *  （ボタンは最初から押せます）。URLを入れると、聞き終わるまで
 *  「無料特別講義に参加します」が隠れます。
 *
 *  YouTube・音声ファイル・動画ファイルのどれでも受けます。
 *  聞いた進み具合はこの端末に覚えておくので、途中で閉じて
 *  戻ってきた方が、はじめから聞き直さずにすみます。
 * ================================================================ */

/**
 * 見た目。voice がまだ空のあいだは「ここにボイスが入ります」の枠を置きます
 * （2026-09-08 とーるさんご要望。ボイスが届く前に、置き場所を見て確かめられるように）
 */
function voiceHtml() {
  const s = CONFIG.SEMINAR || {};
  if (!s.voice) {
    return `<div class="voice voice--soon">
              <p class="voice__t">${esc(s.voice_title || 'はじめに、お話を聞いてください')}</p>
              <p class="voice__soon">🎙 ここにボイスが入ります<span>ただいま準備しております</span></p>
            </div>`;
  }
  return `<div class="voice" id="voice">
            <p class="voice__t">${esc(s.voice_title || 'はじめに、お話を聞いてください')}</p>
            <div class="voice__stage" id="voice-stage"></div>
            <div class="voice__gauge" role="progressbar" aria-label="聞いた進み具合"
                 aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="voice-gauge">
              <i></i>
            </div>
            <p class="voice__left" id="voice-left" hidden></p>
            ${s.voice_note ? `<p class="voice__note">${esc(s.voice_note)}</p>` : ''}
          </div>`;
}

/* ===== どこまで聞いたか =====
 * ★2026-09-12 とーるさんご要望で「15分ほどお聞きいただいたら」に変えました。
 *   数え方は「実際に耳を傾けていた秒数」です。バーを先に送っても進みません。
 *   途中で閉じても、この端末に覚えているので続きから数えます。
 */
function voiceKey_() {
  return 'rion35_heard_' + String((CONFIG.SEMINAR || {}).voice || '');
}
function voiceHeard_() {
  try { return Number(localStorage.getItem(voiceKey_())) || 0; } catch (_) { return 0; }
}
function voiceRemember_(sec) {
  try { localStorage.setItem(voiceKey_(), String(Math.round(sec))); } catch (_) {}
}

/* ボイスのURL。プロラインの [[uid]] は、その方のuidに置きかえます
   （このアプリはLINEの外で開くので、置きかえないと文字のまま届いてしまいます） */
function voiceUrl_() {
  const raw = String((CONFIG.SEMINAR || {}).voice || '');
  if (!raw) return '';
  const uid = (typeof getUid === 'function' && getUid()) || '';
  return raw.split('[[uid]]').join(encodeURIComponent(uid));
}

/* ボタンを出すまでに必要な「聞いた秒数」。
   voice_gate_sec があればそれを、無ければ長さの voice_gate 割を使います。
   ボイスが短いときのために、どちらか早いほうで開きます。 */
function voiceGateSec_(duration) {
  const s = CONFIG.SEMINAR || {};
  const bySec   = Number(s.voice_gate_sec) || 0;
  const byRatio = (duration > 0) ? duration * (Number(s.voice_gate) || 0.8) : 0;
  if (bySec && byRatio) return Math.min(bySec, byRatio);
  return bySec || byRatio || 0;
}

function mountVoice() {
  const s = CONFIG.SEMINAR || {};
  const area = document.getElementById('after-voice');
  if (!area) return;

  // ボイスを置いていないあいだは、詳細を最初から出しておく
  //（本番でボイスを入れ忘れても、お客様が進めなくなることはありません）
  if (!s.voice) { revealAfterVoice(area, true); return; }

  // プレビュー用の抜け道。?voiceopen=1 でゲートを開けたまま見られます
  if (new URLSearchParams(location.search).get('voiceopen') === '1') {
    revealAfterVoice(area, true);
    return;
  }

  let heard = voiceHeard_();
  let gate  = voiceGateSec_(0);          // 長さが分かるまでは、秒の指定だけで見ます
  let done  = gate > 0 && heard >= gate;

  revealAfterVoice(area, done);
  if (done) { paintGauge(heard, gate); return; }   // 済んだ方は、ゲージを満タンで出しておく

  const stage = document.getElementById('voice-stage');
  if (!stage) return;
  stage.innerHTML = '';           // 二重に置かないように、いちど空にします

  /* 聞けた分（秒）を足していきます。duration は分かりしだい届きます */
  const onProgress = (addSec, duration) => {
    if (duration > 0) gate = voiceGateSec_(duration);
    if (addSec > 0) { heard += addSec; voiceRemember_(heard); }
    paintGauge(heard, gate);
    if (!done && gate > 0 && heard >= gate) { done = true; paintLeft(0); revealAfterVoice(area, true); }
  };

  paintGauge(heard, gate);
  if (isYouTube_(s.voice)) mountYouTube_(stage, voiceUrl_(), onProgress);
  else                     mountMedia_(stage, voiceUrl_(), onProgress);
}

/** 詳細を隠す／出す。隠しているあいだは、なぜ出ないのかを書いておく */
function revealAfterVoice(area, open) {
  if (open) {
    area.className = '';
    area.innerHTML = afterVoiceHtml();
    watchFade(area);
    return;
  }
  area.className = '';
  area.innerHTML =
    `<p class="voice__lock">お話を17分ほどお聞きいただいたころに、ここに<b>くわしいご案内</b>が出ます。<br>
       途中で閉じていただいても、続きからお聞きいただけます。</p>`;
}

function paintGauge(heardSec, gateSec) {
  const g = document.getElementById('voice-gauge');
  if (!g || !(gateSec > 0)) return;
  const pct = Math.min(100, Math.round((heardSec / gateSec) * 100));
  const bar = g.querySelector('i');
  if (bar) bar.style.width = pct + '%';
  g.setAttribute('aria-valuenow', String(pct));
  paintLeft(gateSec - heardSec);
}

/* ★2026-09-12 とーるさんご要望。ゲージのとなりに、あとどれくらいで
   ご案内が出るかを出します。出たあとは、この行は消します。 */
function paintLeft(leftSec) {
  const el = document.getElementById('voice-left');
  if (!el) return;
  if (!(leftSec > 0)) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.innerHTML = `残り <b>${esc(mmss_(leftSec))}</b> で、ご案内が出ます`;
}

/** 秒を「◯分◯秒」に。1分未満は「◯秒」だけにします */
function mmss_(sec) {
  const t = Math.ceil(sec);
  const m = Math.floor(t / 60);
  const s = t % 60;
  if (m <= 0) return `${s}秒`;
  return s > 0 ? `${m}分${s}秒` : `${m}分`;
}

function isYouTube_(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(String(url));
}

/** YouTubeのURLから動画IDだけ取り出す */
function youTubeId_(url) {
  const m = String(url).match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : '';
}

/** 音声ファイル・動画ファイル。ブラウザのふつうの再生機能を使います */
function mountMedia_(stage, url, onProgress) {
  const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
  const el = document.createElement(isVideo ? 'video' : 'audio');
  el.src = url;
  el.controls = true;
  el.preload = 'metadata';
  el.playsInline = true;
  el.className = isVideo ? 'voice__video' : 'voice__audio';
  /* ★聞いた秒数の数え方。
     前回見たときとの差だけを足します。差が大きいときは
     「バーを先に送った」ということなので、足しません。 */
  let last = -1;
  el.addEventListener('timeupdate', () => {
    const t = el.currentTime;
    const d = (last >= 0) ? (t - last) : 0;
    last = t;
    onProgress((d > 0 && d < 2) ? d : 0, el.duration || 0);
  });
  el.addEventListener('seeking', () => { last = -1; });
  stage.appendChild(el);
}

/** YouTube。再生位置を1秒ごとに見て、進み具合を測ります */
function mountYouTube_(stage, url, onProgress) {
  const id = youTubeId_(url);
  if (!id) { stage.innerHTML = '<p class="note">お話をうまく読み込めませんでした。公式LINEにご連絡ください。</p>'; return; }

  const holder = document.createElement('div');
  holder.className = 'voice__yt';
  const slot = document.createElement('div');
  holder.appendChild(slot);
  stage.appendChild(holder);

  const start = () => {
    const player = new YT.Player(slot, {
      videoId: id,
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onReady: () => {
          let last = -1;
          setInterval(() => {
            try {
              const t = player.getCurrentTime();
              const d = (last >= 0) ? (t - last) : 0;
              last = t;
              onProgress((d > 0 && d < 2) ? d : 0, player.getDuration() || 0);
            } catch (_) {}
          }, 1000);
        }
      }
    });
  };

  if (window.YT && window.YT.Player) { start(); return; }
  // APIはページに1回だけ読み込む
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function () { if (prev) prev(); start(); };
  if (!document.getElementById('yt-api')) {
    const tag = document.createElement('script');
    tag.id = 'yt-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }
}

/** ②受付ずみ。詳細と、キャンセルのご案内 */
function paintSeminarDone() {
  const el = document.getElementById('seminar-done-body');
  if (!el) return;
  /* ★2026-09-12 1970年と出てしまったことがあったので、念のため画面側でも守ります。
     GASから来た文字が「2020年より前」なら、日時は出しません。 */
  const t = String(STATE.joined_at_text || '');
  const ok = /^20[2-9]\d\//.test(t);
  const at = ok ? `（${esc(t)}）` : '';
  el.innerHTML =
    `<p>特別講義へのご参加を承りました${at}。当日お会いできることを楽しみにしています。</p>
     ${seminarInfoHtml()}
     ${lectureBodyHtml()}
     ${offerNoteHtml()}
     <p class="note">この画面は閉じていただいて構いません。当日のZoomのURLは、公式LINEでお送りします。</p>
     <button type="button" class="btn btn--ghost" data-act="reload">最新の状態にする</button>
     <button type="button" class="btn btn--ghost btn--cancel" data-act="seminar-cancel">参加をキャンセルする</button>`;
  watchFade(el);
}

/** ③合言葉を確認できた方。お申し込みのアプリへご案内する */
function paintReady() {
  const el = document.getElementById('ready-body');
  if (!el) return;
  const uid = getUid();
  const href = 'index.html?uid=' + encodeURIComponent(uid || '');
  el.innerHTML =
    `<p>合言葉を確認いたしました。ありがとうございます。</p>
     <p>下のボタンから、お申し込みのお手続きにお進みください。受講規約のご確認からご案内いたします。</p>
     ${deadlineText()
       ? `<div class="doc__tip"><b>お手続きの期限</b><br>お申し込みとお支払いは <b>${esc(deadlineText())}まで</b>にお願いいたします。</div>`
       : ''}
     <a class="btn btn--primary" href="${href}">お申し込みへ進む</a>
     <p class="note">このあと、規約へのご同意 → 契約書へのご署名 → お支払い、の順にご案内します。<br>途中で閉じていただいても、続きから再開できます。</p>`;
}

// ---------------------------------------------------------------- 操作
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'reload')         return boot();
  if (act === 'seminar-join')   return seminarJoin(btn);
  if (act === 'seminar-cancel') return seminarCancel(btn);
});

/** 特別講義に「無料特別講義に参加します」を押していただいたとき。
 *  ★2026-09-12 とーるさんご要望。指がふれただけで参加になってしまうと
 *  こわいので、いちど「よろしいですか」とお尋ねしてから承ります。 */
async function seminarJoin(btn) {
  const ok = await askConfirm(btn,
    '無料特別講義へのご参加を承ります。よろしいですか。',
    'はい、参加します');
  if (!ok) return;
  try {
    busy(btn, true);
    render(await api('seminar_join', { uid: getUid() }));
  } catch (err) { showError(String(err.message || err)); }
  finally { busy(btn, false); }
}

/** 参加をキャンセルする。押し間違い防止に、いちど確認します */
async function seminarCancel(btn) {
  const ok = await askConfirm(btn,
    '特別講義への参加をキャンセルしますか。あとからまたお申し込みいただけます。',
    'キャンセルする');
  if (!ok) return;
  try {
    busy(btn, true);
    render(await api('seminar_cancel', { uid: getUid() }));
  } catch (err) { showError(String(err.message || err)); }
  finally { busy(btn, false); }
}

// ---------------------------------------------------------------- デモ用
/** ?mock=1 のときだけ使う偽サーバー。GASが無くても全画面を確認できる */
function mockApi(action, body) {
  const KEY = 'rion35_seminar_mock';
  /* ?maint=1 で、メンテナンス中の見え方を確かめられます */
  if (new URLSearchParams(location.search).get('maint') === '1') {
    return Promise.resolve({ ok: false, error: 'maintenance',
                             note: new URLSearchParams(location.search).get('note') || '' });
  }

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } };
  const save = (s) => {
    if (new URLSearchParams(location.search).get('at')) return;   // ?at= は使い捨て
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
  };

  /* ?at=◯◯ でその画面を直に出す。画面一覧のページから呼んでいます。 */
  const AT = new URLSearchParams(location.search).get('at');
  const AT_PRESETS = {
    notlisted: { listed: false },
    seminar:   { listed: true },
    done:      { listed: true, joined: true },
    ready:     { listed: true, joined: true, keyword: true }
  };

  const s = AT && AT_PRESETS[AT]
    ? Object.assign({ init: true }, AT_PRESETS[AT])
    : Object.assign({ listed: true }, load());

  if (action === 'seminar_join')   { s.joined = true;  save(s); }
  if (action === 'seminar_cancel') { s.joined = false; save(s); }

  let stage = 'ご案内対象外';
  if (s.listed) {
    if (s.keyword)     stage = 'お申し込みへ';
    else if (s.joined) stage = 'セミナー申込ずみ';
    else               stage = 'セミナー受付';
  }

  return Promise.resolve({
    ok: true, stage,
    joined_at_text: s.joined ? '2026/09/06 21:40' : ''
  });
}
