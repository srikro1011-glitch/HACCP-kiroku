// ==UserScript==
// @name         カウンター整理表（食べログノート）
// @description  食べログノートを #seiri つきで開いたとき、自動で整理表に切り替える
// @match        https://owner.tabelog.com/tn/*
// @run-at       document-idle
// ==/UserScript==
(function () {
  if (location.hash !== '#seiri') return;
  var s = document.createElement('script');
  s.src = 'https://replus-tanaoroshi.vercel.app/seiri/seiri.js?' + Date.now();
  document.body.appendChild(s);
})();
