/* ===== 凛穏塾 3.5期 説明会の受付（seminar.html 専用）=====
 *
 *   お申し込みのアプリ（index.html）とは別のページにしています。
 *   3期の方とまざらないように、URLごと分けるのが安全だからです。
 *
 *   【流れ】
 *     1. 運営が説明会のご案内を手で送る（このページのURL付き）
 *     2. 開いた方の uid を GAS に渡す
 *        → 「📋 面談」シートで、その方の結果が「3.5期案内」かを見る
 *          ・ちがう／見つからない … お問い合わせのご案内で止める
 *          ・「3.5期案内」        … 説明会の受付ページを出す
 *     3.「はい、参加します」→「📗 3.5期」シートに行ができ、セミナー受付に「参加」が入る
 *     4. 説明会の当日、合言葉をLINEに送っていただく
 *        → プロラインの実行プログラムが GAS を叩き、「キーワード入力」に日付が入る
 *     5. このページを開き直すと「お申し込みにお進みください」に変わる
 *        （合言葉を送っていない方は、ずっと受付ずみの画面のままです）
 */

let STATE = {};

// ---------------------------------------------------------------- 起動
document.addEventListener('DOMContentLoaded', () => {
  initFontSize();
  boot();
});

async function boot() {
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

function errorMessage(code) {
  if (code === 'uid_required') return 'LINEから開き直してください。';
  if (code === 'not_found')    return 'ご案内の記録が見つかりませんでした。公式LINEにご連絡ください。';
  return '通信がうまくいきませんでした。少し時間をおいてお試しください。（' + code + '）';
}

// ---------------------------------------------------------------- 各画面の中身
/** 説明会のご案内（日時・内容）。CONFIG.SEMINAR を書き換えるだけで直せます */
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

/** ①「はい、参加します」だけの画面 */
function paintSeminar() {
  const el = document.getElementById('seminar-body');
  if (!el) return;
  const s = CONFIG.SEMINAR || {};
  el.innerHTML =
    `<p class="lead">${esc(s.lead || '')}</p>
     ${seminarInfoHtml()}
     <p class="note">${esc(s.note || '')}</p>
     <button type="button" class="btn btn--primary" data-act="seminar-join">はい、参加します</button>`;
}

/** ②受付ずみ。詳細と、キャンセルのご案内 */
function paintSeminarDone() {
  const el = document.getElementById('seminar-done-body');
  if (!el) return;
  const at = STATE.joined_at_text ? `（${esc(STATE.joined_at_text)}）` : '';
  el.innerHTML =
    `<p>説明会へのご参加を承りました${at}。当日お会いできることを楽しみにしています。</p>
     ${seminarInfoHtml()}
     <div class="doc__tip" style="margin-top:14px">
       <b>当日の流れ</b><br>
       説明会のなかで<b>合言葉</b>をお伝えします。その合言葉を公式LINEにお送りいただくと、
       この画面がお申し込みのご案内に変わります。
     </div>
     ${deadlineText()
       ? `<p class="note">なお、ご受講のお申し込みとお支払いのお手続きは <b>${esc(deadlineText())}まで</b>とさせていただいております。</p>`
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

/** 説明会に「はい、参加します」 */
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
    '説明会への参加をキャンセルしますか。あとからまたお申し込みいただけます。',
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
