/**
 * 凛穏塾 3期生 受付管理 ── スマホ通知の受け取り役（Service Worker）
 *
 * 管理アプリを閉じているあいだに届いたお知らせは、ここが受け取って表示します。
 * Firebaseの設定は、登録するときのURL（?apiKey=…&projectId=…）で受け取るので、
 * このファイルを書き替える必要はありません（設定は admin.html の PUSH_CFG 1か所だけ）。
 *
 * ★このファイルは rion-3ki-app フォルダの直下に置いてください。
 *   ここに置くことで、同じサーバーの他のアプリ（動画視聴アプリなど）の
 *   通知とぶつからないようになります。
 */
/* 通知をタップしたときの行き先を直します（2026-11-17）。
 *   運営の入口を admin.html にしたので、3期生のページは 3ki.html に移りました。
 *   3期生GASは古いURL（.../admin.html）を送ってきますが、
 *   そのままだと入口に着いてしまい、ひと手間増えます。
 *   3期生GASは3.5期生が現役で動いているため触りません。ここで読み替えます。 */
function fixUrl_(u) {
  u = u || './3ki.html';
  return String(u).replace(/rion-3ki-app\/admin\.html/, 'rion-3ki-app/3ki.html');
}

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

var q = new URLSearchParams(self.location.search);
var cfg = {
  apiKey: q.get('apiKey') || '',
  authDomain: q.get('authDomain') || '',
  projectId: q.get('projectId') || '',
  messagingSenderId: q.get('messagingSenderId') || '',
  appId: q.get('appId') || ''
};

if (cfg.projectId) {
  firebase.initializeApp(cfg);
  var messaging = firebase.messaging();

  messaging.onBackgroundMessage(function (payload) {
    var d = payload.data || {};
    var n = payload.notification || {};
    self.registration.showNotification(d.title || n.title || '凛穏塾 3期生', {
      body: d.body || n.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: d.tag || 'rion3ki-ops',
      data: { url: fixUrl_(d.url) }
    });
  });
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = fixUrl_(event.notification.data && event.notification.data.url);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('rion-3ki-app') >= 0 && 'focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
