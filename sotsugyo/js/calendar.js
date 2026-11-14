/* ============================================================
 *  凛穏塾 3期生 卒業式｜カレンダーに登録
 *
 *  使いかた
 *    calendar.html?part=part1   第1部だけ
 *    calendar.html?part=part2   第2部だけ
 *    calendar.html?part=both    両方（2件ぶん出ます）
 *    part= を付けないときは、両方ぶん出します。
 *
 *  日付や会場は js/config.js の CALENDAR / PARTS / EVENT を見ています。
 *  このファイルはふだん触りません。
 * ========================================================== */

'use strict';

var QC = new URLSearchParams(location.search);

document.addEventListener('DOMContentLoaded', function () {
  var ev = CONFIG.EVENT || {};
  setText('[data-ev="kicker"]', ev.kicker);
  setText('[data-ev="name"]',   ev.name);
  setText('[data-ev="date"]',   ev.date);

  var lt = document.getElementById('link-tokusho');
  var lp = document.getElementById('link-privacy');
  if (lt && CONFIG.LINKS && CONFIG.LINKS.tokusho) lt.href = CONFIG.LINKS.tokusho;
  if (lp && CONFIG.LINKS && CONFIG.LINKS.privacy) lp.href = CONFIG.LINKS.privacy;

  render();
});

function render() {
  var box = document.getElementById('cal-list');
  var cal = CONFIG.CALENDAR || {};

  if (!cal.enabled) {
    box.innerHTML = '<p class="note">ただいま準備中です。</p>';
    return;
  }

  var want = (QC.get('part') || 'both').toLowerCase();
  var keys = (want === 'part1' || want === 'part2') ? [want] : ['part1', 'part2'];

  var items = keys.map(buildItem).filter(Boolean);
  if (!items.length) {
    box.innerHTML = '<p class="note">日程が決まりましたら、こちらでご案内します。</p>';
    return;
  }

  box.innerHTML = items.map(function (it) {
    return '<div class="calbox">' +
      '<div class="calbox__name">' + esc(it.summary) + '</div>' +
      '<div class="calbox__when">' + esc(it.when) + '</div>' +
      '<div class="calbox__where">' + esc(it.location) + '</div>' +
      '<a class="btn" href="' + esc(it.gcal) + '" target="_blank" rel="noopener">Googleカレンダーに登録</a>' +
      '<button type="button" class="btn btn--ghost" data-ics="' + esc(it.key) + '">' +
        'iPhone・そのほかのカレンダー</button>' +
      '</div>';
  }).join('');

  // 2件以上あるときは「まとめて1件で入れる」も出します
  if (items.length > 1) {
    box.insertAdjacentHTML('beforeend',
      '<p class="note calall">第1部・第2部をまとめて入れるときは ' +
      '<button type="button" class="linkbtn" data-ics="all">こちら</button> です。</p>');
  }

  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ics]');
    if (!b) return;
    var k = b.getAttribute('data-ics');
    var list = (k === 'all') ? items : items.filter(function (it) { return it.key === k; });
    downloadIcs(list);
  });
}

/** 1件ぶんの材料をそろえます */
function buildItem(key) {
  var cal = CONFIG.CALENDAR || {};
  var p   = (CONFIG.PARTS || {})[key];
  var t   = cal[key];
  if (!p || !t || !t.start || !t.end) return null;

  var start = new Date(t.start);
  var end   = new Date(t.end);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  var v = p.venue || {};
  var location = [v.name, v.address].filter(Boolean).join(' ');
  var summary  = (cal.title_prefix || '') + ' ' + (p.label || '');
  if (p.title) summary += '（' + p.title + '）';
  summary = summary.trim();

  var details = cal.details || ('ご案内：' + pageUrl());

  var when = (CONFIG.EVENT.date || '') + '　' + (p.time || '');
  if (p.reception) when += '（' + p.reception + '）';

  return {
    key: key,
    summary: summary,
    location: location,
    details: details,
    start: start,
    end: end,
    when: when.trim(),
    gcal: gcalUrl(summary, start, end, location, details)
  };
}

function pageUrl() {
  return location.href.split('?')[0].replace(/calendar\.html$/, '');
}

/* ---- Googleカレンダー ----------------------------------- */

function gcalUrl(summary, start, end, location, details) {
  var q = new URLSearchParams();
  q.set('action', 'TEMPLATE');
  q.set('text', summary);
  q.set('dates', utc(start) + '/' + utc(end));
  if (location) q.set('location', location);
  if (details)  q.set('details', details);
  q.set('ctz', 'Asia/Tokyo');
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

/** 20270131T040000Z のかたち（UTC） */
function utc(d) {
  function z(n) { return (n < 10 ? '0' : '') + n; }
  return d.getUTCFullYear() + z(d.getUTCMonth() + 1) + z(d.getUTCDate()) + 'T' +
         z(d.getUTCHours()) + z(d.getUTCMinutes()) + z(d.getUTCSeconds()) + 'Z';
}

/* ---- .ics（iPhoneのカレンダーなど）---------------------- */

function downloadIcs(items) {
  if (!items.length) return;

  var stamp = utc(new Date());
  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//rionjuku//sotsugyo//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  items.forEach(function (it) {
    lines.push(
      'BEGIN:VEVENT',
      'UID:rionjuku-sotsugyo-' + it.key + '@l-mine.com',
      'DTSTAMP:' + stamp,
      'DTSTART:' + utc(it.start),
      'DTEND:' + utc(it.end),
      'SUMMARY:' + icsText(it.summary),
      'LOCATION:' + icsText(it.location),
      'DESCRIPTION:' + icsText(it.details),
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');

  var body = lines.map(fold).join('\r\n') + '\r\n';
  var name = 'rionjuku-sotsugyo' + (items.length === 1 ? '-' + items[0].key : '') + '.ics';

  try {
    var blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  } catch (err) {
    // 端末によってはダウンロードができないので、そのときは開くだけにします
    location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(body);
  }

  var help = document.getElementById('cal-help');
  if (help) {
    help.innerHTML = 'カレンダーのファイルをお送りしました。' +
      '開かないときは、画面右上（または右下）の「ブラウザで開く」からもう一度お試しください。';
  }
}

/** ics の決まりごと（, ; \ と改行をエスケープします） */
function icsText(t) {
  return String(t || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** 1行75バイトで折り返す決まり（日本語は3バイトなので、バイトで数えます） */
function fold(line) {
  var bytes = new TextEncoder().encode(line);
  if (bytes.length <= 73) return line;

  var out = [];
  var buf = '';
  var len = 0;
  var limit = 73;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    var n = new TextEncoder().encode(ch).length;
    if (len + n > limit) {
      out.push(buf);
      buf = ch;
      len = n + 1;   // 続きの行は先頭に半角スペースが付きます
      limit = 73;
    } else {
      buf += ch;
      len += n;
    }
  }
  out.push(buf);
  return out.join('\r\n ');
}

/* ---- こまごま -------------------------------------------- */

function setText(sel, t) {
  var el = document.querySelector(sel);
  if (el && t) el.textContent = t;
}

function esc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
