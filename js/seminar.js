/* ===== 凛穏塾 無料特別講義の受付（seminar.html 専用）=====
 *
 *   お申し込みのアプリ（index.html）とは別のページにしています。
 *   3期の方とまざらないように、URLごと分けるのが安全だからです。
 *
 *   【流れ】
 *     1. 運営が、3期に合格されなかった方へ無料特別講義のご案内を手で送る
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
 *          「受講を希望します」のボタンが出る（2026-09-07 とーるさんご要望）
 *     4.「受講を希望します」→「📗 3.5期」シートに行ができ、セミナー参加に「参加」が入る
 *        ＝ 無料特別講義への参加のお申し込みが完了
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
/** 無料特別講義のご案内（日時・内容）。CONFIG.SEMINAR を書き換えるだけで直せます */
function seminarInfoHtml() {
  const s = CONFIG.SEMINAR || {};
  const when = s.when
    ? esc(s.when)
    : '<b>日時は決まりしだい、公式LINEにてご案内いたします</b>';
  // 内容がまだ決まっていないあいだは、そのことをお伝えする
  const items = (s.items && s.items.length)
    ? '<ul class="plan__list">' + s.items.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>'
    : '<p class="note">当日お話しする内容の詳細は、<b>追ってご案内いたします</b>。</p>';
  return `<dl class="bank">
            <div><dt>日時</dt><dd>${when}</dd></div>
            <div><dt>場所</dt><dd>${esc(s.where || '')}</dd></div>
          </dl>
          ${items}`;
}

/** 3.5期のお申し込み期限。CONFIG.BY_PLAN['3.5期生'].deadline が正 */
function deadlineText() {
  const v = (CONFIG.BY_PLAN && CONFIG.BY_PLAN['3.5期生']) || {};
  return v.deadline || '';
}

/** ①ボイスを聞いていただき、聞き終わったら「受講を希望します」が出る画面 */
function paintSeminar() {
  const el = document.getElementById('seminar-body');
  if (!el) return;
  const s = CONFIG.SEMINAR || {};
  el.innerHTML =
    `<p class="lead">${esc(s.lead || '')}</p>
     ${voiceHtml()}
     ${seminarInfoHtml()}
     <p class="note">${esc(s.note || '')}</p>
     <div id="join-area">
       <button type="button" class="btn btn--primary" data-act="seminar-join">受講を希望します</button>
     </div>`;
  mountVoice();
}

/* ================================================================
 *  ボイス（先にお聞きいただくお話）  2026-09-07
 *
 *  CONFIG.SEMINAR.voice が空のあいだは、枠もゲートも出ません
 *  （ボタンは最初から押せます）。URLを入れると、聞き終わるまで
 *  「受講を希望します」が隠れます。
 *
 *  YouTube・音声ファイル・動画ファイルのどれでも受けます。
 *  聞いた進み具合はこの端末に覚えておくので、途中で閉じて
 *  戻ってきた方が、はじめから聞き直さずにすみます。
 * ================================================================ */

/** 見た目。voice が空なら何も出さない */
function voiceHtml() {
  const s = CONFIG.SEMINAR || {};
  if (!s.voice) return '';
  return `<div class="voice" id="voice">
            <p class="voice__t">${esc(s.voice_title || 'はじめに、お話を聞いてください')}</p>
            <div class="voice__stage" id="voice-stage"></div>
            <div class="voice__gauge" role="progressbar" aria-label="聞いた進み具合"
                 aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="voice-gauge">
              <i></i>
            </div>
            ${s.voice_note ? `<p class="voice__note">${esc(s.voice_note)}</p>` : ''}
          </div>`;
}

/** この端末で「どこまで聞いたか」を覚えておくキー */
function voiceKey_() {
  return 'rion35_voice_' + String((CONFIG.SEMINAR || {}).voice || '');
}
function voiceHeard_() {
  try { return Number(localStorage.getItem(voiceKey_())) || 0; } catch (_) { return 0; }
}
function voiceRemember_(ratio) {
  try {
    if (ratio > voiceHeard_()) localStorage.setItem(voiceKey_(), String(ratio));
  } catch (_) {}
}

function mountVoice() {
  const s = CONFIG.SEMINAR || {};
  const area = document.getElementById('join-area');
  if (!area) return;

  // ボイスを置いていないときは、いままでどおりボタンをそのまま出す
  if (!s.voice) return;

  // プレビュー用の抜け道。?voiceopen=1 でゲートを開けたまま見られます
  if (new URLSearchParams(location.search).get('voiceopen') === '1') return;

  const gate = Number(s.voice_gate) || 0.8;
  let done = voiceHeard_() >= gate;

  lockJoin(area, done);
  if (done) return;

  const stage = document.getElementById('voice-stage');
  if (!stage) return;

  const onProgress = (ratio) => {
    if (!(ratio > 0)) return;
    voiceRemember_(ratio);
    paintGauge(Math.max(ratio, voiceHeard_()), gate);
    if (!done && ratio >= gate) { done = true; lockJoin(area, true); }
  };

  paintGauge(voiceHeard_(), gate);
  if (isYouTube_(s.voice)) mountYouTube_(stage, s.voice, onProgress);
  else                     mountMedia_(stage, s.voice, onProgress);
}

/** ボタンを隠す／出す。隠しているあいだは理由を書いておく */
function lockJoin(area, open) {
  if (open) {
    area.innerHTML =
      `<button type="button" class="btn btn--primary" data-act="seminar-join">受講を希望します</button>`;
    return;
  }
  area.innerHTML =
    `<p class="voice__lock">お話を聞き終わるころに、ここに<b>お申し込みのボタン</b>が出ます。<br>
       途中で閉じていただいても、続きからお聞きいただけます。</p>`;
}

function paintGauge(ratio, gate) {
  const g = document.getElementById('voice-gauge');
  if (!g) return;
  const pct = Math.min(100, Math.round((ratio / gate) * 100));
  const bar = g.querySelector('i');
  if (bar) bar.style.width = pct + '%';
  g.setAttribute('aria-valuenow', String(pct));
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
  el.addEventListener('timeupdate', () => {
    if (el.duration > 0) onProgress(el.currentTime / el.duration);
  });
  el.addEventListener('ended', () => onProgress(1));
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
          setInterval(() => {
            try {
              const d = player.getDuration();
              if (d > 0) onProgress(player.getCurrentTime() / d);
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
  const at = STATE.joined_at_text ? `（${esc(STATE.joined_at_text)}）` : '';
  el.innerHTML =
    `<p>無料特別講義へのご参加を承りました${at}。当日お会いできることを楽しみにしています。</p>
     ${seminarInfoHtml()}
     <div class="doc__tip" style="margin-top:14px">
       <b>当日の流れ</b><br>
       講義のなかで、凛穏塾3.5期のご案内と<b>合言葉</b>をお伝えします。
       その合言葉を公式LINEにお送りいただくと、この画面がお申し込みのご案内に変わります。
     </div>
     ${deadlineText()
       ? `<p class="note">なお、3.5期をご受講される場合、お申し込みとお支払いのお手続きは <b>${esc(deadlineText())}まで</b>とさせていただいております。</p>`
       : ''}
     <p class="note">合言葉をお送りいただくまでは、この画面のままです。閉じていただいて構いません。</p>
     <button type="button" class="btn btn--ghost" data-act="reload">最新の状態にする</button>
     <button type="button" class="btn btn--ghost btn--cancel" data-act="seminar-cancel">参加をキャンセルする</button>`;
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

/** 無料特別講義に「受講を希望します」 */
async function seminarJoin(btn) {
  try {
    busy(btn, true);
    render(await api('seminar_join', { uid: getUid() }));
  } catch (err) { showError(String(err.message || err)); }
  finally { busy(btn, false); }
}

/** 参加をキャンセルする。押し間違い防止に、いちど確認します */
async function seminarCancel(btn) {
  const ok = await askConfirm(btn,
    '無料特別講義への参加をキャンセルしますか。あとからまたお申し込みいただけます。',
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
