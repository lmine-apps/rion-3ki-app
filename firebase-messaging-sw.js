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
      data: { url: d.url || './admin.html' }
    });
  });
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || './admin.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('rion-3ki-app') >= 0 && 'focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
