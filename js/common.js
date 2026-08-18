/* ===== 共通処理：uid管理・GAS呼び出し・画面切替 ===== */

/** uid取得（URL → localStorage の順。URLにあれば保存する） */
function getUid() {
  const urlUid = new URLSearchParams(location.search).get('uid');
  if (urlUid && urlUid !== '[[uid]]') {
    try { localStorage.setItem(CONFIG.UID_KEY, urlUid); } catch (_) {}
    return urlUid;
  }
  try { return localStorage.getItem(CONFIG.UID_KEY); } catch (_) { return null; }
}

/** デモモード（?mock=1）。GASが無くても全画面を確認できる */
function isMock() {
  return new URLSearchParams(location.search).get('mock') === '1';
}

/** GAS呼び出し（POST・text/plain でプリフライトを避ける） */
async function api(action, body) {
  if (isMock()) return mockApi(action, body);
  const payload = Object.assign({ action, token: CONFIG.TOKEN }, body || {});
  const res = await fetch(CONFIG.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('通信に失敗しました（' + res.status + '）');
  return res.json();
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

function showLoading(on) {
  const el = document.getElementById('loading');
  if (el) el.hidden = !on;
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
    if (allDone || n < current) cls += ' is-done';
    else if (n === current) cls += ' is-current';
    const mark = (allDone || n < current) ? '✓' : n;
    return `<li class="${cls}"><span class="step__dot">${mark}</span><span class="step__label">${esc(label)}</span></li>`;
  }).join('');
  document.querySelectorAll('[data-steps]').forEach(el => { el.innerHTML = html; });
}

/** 金額を「880,000円」形式に */
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

/** ボタンの二度押し防止 */
function busy(btn, on, labelWhenBusy) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.textContent;
    btn.textContent = labelWhenBusy || '送信中…';
    btn.disabled = true;
  } else {
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
    btn.disabled = false;
  }
}
