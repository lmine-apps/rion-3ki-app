/* ===== 凛穏塾 3期生 お申し込みアプリ 設定 =====
 * 金額・決済ページ・銀行口座は「GAS側が正」です（ここには書きません）。
 * 画面はGASから受け取った値をそのまま表示します。
 */
const CONFIG = {
  // GAS Web App のURL（2026-08-18 デプロイ済み）
  GAS_URL: 'https://script.google.com/macros/s/AKfycbwxo1mNRBl5Gjp86XbNXZONgkNHAGHp86uqQYux0Lu3CnP11zH8is5MFrqik0VwvcXL/exec',

  // GAS側の TOKEN と一致させる
  TOKEN: 'TOORU-rion3ki-hQ4vN8pR',

  // localStorage のキー（他アプリと混ざらないように接頭辞をつける）
  UID_KEY: 'rion3ki_uid',

  // 規約系ページ（プロラインのコンテンツページ。3期用のURLに差し替え）
  // 参考）2期: 利用規約 /cp/XOAbHNC5Z2 ／ 特商法 /cp/XHxokyjYAP ／ プラポリ /cp/fYrWvBRKAV
  LINKS: {
    terms:   'https://mka0tn6z.autosns.app/cp/XXXXXXXX',  // 受講規約
    tokusho: 'https://mka0tn6z.autosns.app/cp/XXXXXXXX',  // 特定商取引法に基づく表記
    privacy: 'https://mka0tn6z.autosns.app/cp/XXXXXXXX'   // プライバシーポリシー
  },

  // 講座の基本情報（画面に出す文言）
  COURSE: {
    name: '凛穏塾 3期生',
    period: '2026年10月1日 入学式 ／ 全4ヶ月',
    deadline: '2026年9月30日まで'
  },

  // 入学式などの案内（完了画面に出す）
  ENTRANCE: '2026年10月1日（木）入学式',

  // 状態の自動再取得（ミリ秒）。決済や着金の反映を待つ画面で使う
  POLL_INTERVAL: 20000
};
