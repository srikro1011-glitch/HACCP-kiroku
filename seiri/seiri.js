window.__seiriRun=function(){// カウンター整理表（食べログノート用）: データ → 見やすい表のHTML
// norm = {date, open:"11:00", close:"20:30", made:"8:40",
//         seats:[{name,type,blocked}], bookings:[{from,to,name,n,seats:[...],status,req,memo}]}
function seiriBuild(norm) {
  const toM = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const live = norm.bookings.filter(b => !/CANCEL/.test(b.status || '') && b.seats.length);
  const isCounter = s => /カウンター/.test(s.type);

  // ---- カウンターの並べ直し ----
  const used = new Set(live.flatMap(b => b.seats));
  const cSeats = norm.seats.filter(s => isCounter(s) && (!s.blocked || used.has(s.name))).map(s => s.name);
  const N = cSeats.length;
  const cBook = live.filter(b => b.seats.some(n => cSeats.includes(n)))
    .map((b, i) => ({ ...b, s: toM(b.from), e: toM(b.to), k: Math.min(b.n, b.seats.length) || 1, orig: b.seats.map(n => cSeats.indexOf(n)), key: i }))
    .sort((a, b) => a.s - b.s || b.k - a.k || Math.min(...a.orig) - Math.min(...b.orig));
  const placed = []; // {b, start}
  const overlaps = (a, b) => a.s < b.e && b.s < a.e;
  function seatBusy(seat, b) { return placed.some(p => p.start <= seat && seat < p.start + p.b.k && overlaps(p.b, b)); }
  function cands(b) {
    const out = [];
    for (let st = 0; st + b.k <= N; st++) {
      let ok = true;
      for (let x = st; x < st + b.k; x++) if (seatBusy(x, b)) { ok = false; break; }
      if (!ok) continue;
      const gap = (st === 0 || !seatBusy(st - 1, b) ? 1 : 0) + (st + b.k === N || !seatBusy(st + b.k, b) ? 1 : 0);
      let keep = 0; for (let x = st; x < st + b.k; x++) if (b.orig.includes(x)) keep++;
      out.push({ st, gap, keep });
    }
    // 1席だけぽつんと空く穴を作らない（2名の組が入れなくなるため）
    out.forEach(o => {
      const holeL = o.st >= 1 && !seatBusy(o.st - 1, b) && (o.st - 1 === 0 || seatBusy(o.st - 2, b));
      const holeR = o.st + b.k < N && !seatBusy(o.st + b.k, b) && (o.st + b.k + 1 === N || seatBusy(o.st + b.k + 1, b));
      o.hole = (holeL ? 1 : 0) + (holeR ? 1 : 0);
    });
    if (mode === 'slot0' || mode === 'slot1') { // 2席ずつの「区切り」にそろえて置く（穴だらけにならない）
      const par = mode === 'slot0' ? 0 : 1;
      out.forEach(o => {
        if (b.k >= 2) o.al = ((o.st - par) % 2 + 2) % 2 === 0 ? 0 : 1;
        else { const pt = ((o.st - par) % 2 + 2) % 2 === 0 ? o.st + 1 : o.st - 1; o.al = (pt < 0 || pt >= N || seatBusy(pt, b)) ? 0 : 1; }
      });
      return out.sort((p, q) => p.al - q.al || q.keep - p.keep || p.hole - q.hole || p.st - q.st);
    }
    if (mode === 'gap') return out.sort((p, q) => q.gap - p.gap || q.keep - p.keep || p.st - q.st);
    if (mode === 'keep') return out.sort((p, q) => q.keep - p.keep || p.hole - q.hole || p.st - q.st);
    return out.sort((p, q) => p.hole - q.hole || p.st - q.st);
  }
  let steps = 0, ok = true, mode = 'gap';
  function dfs(i) {
    if (i === cBook.length) return true;
    if (++steps > (mode === 'gap' ? 3000 : 20000)) return false;
    const b = cBook[i];
    for (const c of cands(b)) {
      placed.push({ b, start: c.st });
      if (dfs(i + 1)) return true;
      placed.pop();
    }
    return false;
  }
  let solved = false;
  const arrange = norm.arrange !== false; // 当日だけ並べ直す。ほかの日は食べログのまま
  // いくつかの置き方を試して、点数が一番いいものを使う
  let bestSet = null, bestSc = -1;
  const scoreOf = () => placed.reduce((a, p) => { let k = 0; for (let x = p.start; x < p.start + p.b.k; x++) if (p.b.orig.includes(x)) k++; return a + k; }, 0);
  for (const m of (arrange ? ['gap', 'slot1', 'slot0', 'pack'] : [])) {
    mode = m; steps = 0; placed.length = 0;
    if (dfs(0)) { solved = true; const sc = scoreOf(); if (sc > bestSc) { bestSc = sc; bestSet = placed.map(p => ({ ...p })); } if (m === 'gap') break; }
  }
  if (solved) { placed.length = 0; bestSet.forEach(p => placed.push(p)); }
  // 仕上げ: 1組ずつ「もっと良い場所」へ動かす（隣を1席あける・元の席に近づける）
  if (solved) {
    const freeFor = (p, st) => { for (let x = st; x < st + p.b.k; x++) if (placed.some(q => q !== p && q.start <= x && x < q.start + q.b.k && overlaps(q.b, p.b))) return false; return true; };
    const nbFree = (p, x) => x < 0 || x >= N || !placed.some(q => q !== p && q.start <= x && x < q.start + q.b.k && overlaps(q.b, p.b));
    const score = () => placed.reduce((a, p) => { let k = 0; for (let x = p.start; x < p.start + p.b.k; x++) if (p.b.orig.includes(x)) k++; return a + 2 * nbFree(p, p.start - 1) + 2 * nbFree(p, p.start + p.b.k) + k; }, 0);
    let best = score();
    for (let pass = 0; pass < 30; pass++) {
      let improved = false;
      for (const p of placed) {
        const cur = p.start;
        for (let st = 0; st + p.b.k <= N; st++) {
          if (st === cur || !freeFor(p, st)) continue;
          const old = p.start; p.start = st;
          const sc = score();
          if (sc > best) { best = sc; improved = true; } else p.start = old;
        }
      }
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
        const p = placed[i], q = placed[j];
        if (p.start === q.start && p.b.k === q.b.k) continue;
        const a = p.start, c = q.start;
        p.start = c; q.start = a;
        if (c + p.b.k <= N && a + q.b.k <= N && freeFor(p, p.start) && freeFor(q, q.start)) {
          const sc = score();
          if (sc > best) { best = sc; improved = true; continue; }
        }
        p.start = a; q.start = c;
      }
      if (!improved) break;
    }
  }
  if (!solved) { // 並べきれないとき: そのままの席で出す
    ok = !arrange; placed.length = 0;
    cBook.forEach(b => placed.push({ b, start: Math.min(...b.orig), split: true }));
  }
  const moves = [];
  placed.forEach(p => {
    const now = cSeats.slice(p.start, p.start + p.b.k);
    p.now = p.split ? p.b.seats : now;
    if (p.now.join() !== p.b.seats.join()) moves.push(p);
  });
  moves.sort((a, b) => a.b.s - b.b.s);

  // ---- 時間軸 ----
  const t0 = Math.floor(Math.min(toM(norm.open), ...live.map(b => toM(b.from))) / 60) * 60;
  const t1 = Math.ceil(Math.max(toM(norm.close), ...live.map(b => toM(b.to))) / 60) * 60;
  const PX = 1.6, RH = 28, LW = 52; // 1分=1.6px
  const W = (t1 - t0) * PX;
  const hhmm = m => Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
  function axis() {
    let h = '';
    for (let m = t0; m <= t1; m += 30) h += `<div class="tk${m % 60 ? ' half' : ''}" style="left:${LW + (m - t0) * PX}px">${m % 60 ? '' : hhmm(m)}</div>`;
    return `<div class="axis" style="width:${LW + W}px">${h}</div>`;
  }
  function grid(rows) {
    let lines = '';
    for (let m = t0; m <= t1; m += 30) lines += `<div class="vl${m % 60 ? ' half' : ''}" style="left:${LW + (m - t0) * PX}px"></div>`;
    return rows.map((r, i) => `<div class="row${i % 2 ? ' odd' : ''}" style="top:${i * RH}px;width:${LW + W}px"><div class="lab">${esc(r)}</div></div>`).join('') + lines;
  }
  function box(b, top, h, cls, sub) {
    const left = LW + (toM(b.from) - t0) * PX, w = (toM(b.to) - toM(b.from)) * PX;
    cls = cls === 'warn' ? 'warn' : (b.n <= 1 ? 'p1' : b.n === 2 ? 'p2' : 'p3');
    return `<div class="bx ${cls}" style="left:${left + 1}px;top:${top + 2}px;width:${w - 3}px;height:${h - 4}px">
      <span class="nm">${esc(b.name.split(' ')[0])}</span><span class="pp">${b.n}名</span>${b.req ? '<span class="rq">★</span>' : ''}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>`;
  }

  // カウンター
  let cHtml = grid(cSeats);
  placed.forEach(p => {
    const moved = p.now.join() !== p.b.seats.join();
    if (p.split) {
      const idx = p.b.seats.map(n => cSeats.indexOf(n)).filter(i => i >= 0).sort((a, c) => a - c);
      const cont = idx.every((v, j) => j === 0 || v === idx[j - 1] + 1);
      if (cont) { cHtml += box(p.b, idx[0] * RH, idx.length * RH, arrange ? 'warn' : 'st', ''); return; }
      idx.forEach(i => { cHtml += box(p.b, i * RH, RH, arrange ? 'warn' : 'st', p.b.seats.join('+')); });
      return;
    }
    cHtml += box(p.b, p.start * RH, p.b.k * RH, 'st', '');
  });

  // テーブル・個室（そのまま）
  const tSeats = norm.seats.filter(s => !isCounter(s)).map(s => s.name);
  let tHtml = grid(tSeats);
  live.filter(b => b.seats.some(n => tSeats.includes(n))).forEach(b => {
    const idx = b.seats.map(n => tSeats.indexOf(n)).filter(i => i >= 0).sort((a, c) => a - c);
    const contiguous = idx.every((v, j) => j === 0 || v === idx[j - 1] + 1);
    if (contiguous) tHtml += box(b, idx[0] * RH, idx.length * RH, 'st', idx.length > 1 ? b.seats.join('+') : '');
    else idx.forEach(i => { tHtml += box(b, i * RH, RH, 'st', b.seats.join('+')); });
  });

  const people = live.reduce((a, b) => a + b.n, 0);
  const nowSeat = {}; placed.forEach(p => { nowSeat[p.b.from + p.b.name] = p.now; });
  const reqs = live.filter(b => b.req || b.memo).sort((a, b) => toM(a.from) - toM(b.from));
  const moveRows = moves.map(p => `<tr><td>${esc(p.b.from)}</td><td>${esc(p.b.name.split(' ')[0])} 様</td><td>${p.b.n}名</td><td class="o">${esc(p.b.seats.join('・'))}</td><td>→</td><td class="n">${esc(p.now.join('・'))}</td></tr>`).join('');
  const reqRows = reqs.map(b => `<tr><td>${esc(b.from)}</td><td>${esc(b.name.split(' ')[0])} 様</td><td>${b.n}名</td><td>${esc((nowSeat[b.from + b.name] || b.seats).join('・'))}</td><td>${esc((b.req || '') + (b.memo ? ' ／メモ: ' + b.memo : ''))}</td></tr>`).join('');
  // 時間別の来店人数（30分ごと）
  const isC = b => b.seats.some(n => cSeats.includes(n));
  let hourRows = '', mx = 0;
  const slots = [];
  for (let m = t0; m < t1; m += 30) {
    const arr = live.filter(b => toM(b.from) >= m && toM(b.from) < m + 30);
    const inn = live.filter(b => toM(b.from) <= m && m < toM(b.to));
    const sl = { m, g: arr.length, p: arr.reduce((a, b) => a + b.n, 0), pc: arr.filter(isC).reduce((a, b) => a + b.n, 0), in: inn.reduce((a, b) => a + b.n, 0) };
    sl.pt = sl.p - sl.pc; mx = Math.max(mx, sl.p); slots.push(sl);
  }
  slots.filter(x => x.g || x.in).forEach(x => {
    hourRows += `<tr><td>${hhmm(x.m)}</td><td class="r">${x.g || ''}</td><td class="r b">${x.p || ''}</td><td class="r">${x.pc || ''}</td><td class="r">${x.pt || ''}</td><td class="r">${x.in}</td><td><div class="hb" style="width:${mx ? x.p / mx * 100 : 0}%"></div></td></tr>`;
  });
  const wd = '日月火水木金土'[new Date(norm.date + 'T00:00:00').getDay()];
  const [, mo, da] = norm.date.split('-').map(Number);

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>カウンター整理表 ${norm.date}</title>
<style>
@page{size:A4 landscape;margin:8mm}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:"Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif;margin:0;padding:14px;color:#222;background:#fff}
h1{font-size:20px;margin:0 0 2px}
.meta{font-size:12px;color:#555;margin-bottom:8px}
.bar{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px;align-items:center}
.bar button{font-size:14px;padding:6px 14px;border:1px solid #c47a00;background:#f7a823;color:#fff;border-radius:6px;cursor:pointer;font-weight:bold}
.bar button.sec{background:#fff;color:#c47a00}
h2{font-size:15px;margin:12px 0 4px;border-left:5px solid #f7a823;padding-left:6px}
.chart{position:relative;overflow-x:auto;-webkit-overflow-scrolling:touch}
.axis{position:relative;height:18px;font-size:11px;color:#444}
.tk{position:absolute;top:0;transform:translateX(-50%)}
.row{position:absolute;left:0;height:${RH}px;border-bottom:1px solid #e3e3e3}
.row.odd{background:#fafafa}
.lab{position:absolute;left:0;width:${LW}px;height:100%;display:flex;align-items:center;padding-left:4px;font-size:12px;font-weight:bold;border-right:1px solid #bbb;background:#f2f2f2}
.vl{position:absolute;top:0;bottom:0;border-left:1px solid #ddd}
.vl.half{border-left:1px dashed #eee}
.bx{position:absolute;border-radius:5px;padding:0 5px;font-size:12px;line-height:1.2;overflow:hidden;display:flex;flex-wrap:wrap;align-content:center;gap:0 4px;white-space:nowrap}
.bx.p1{background:#dcecff;border:2px solid #3b7dd8}
.bx.p2{background:#ffe2ad;border:2px solid #e8a33a}
.bx.p3{background:#e6dcf7;border:2px solid #7d5bc4}
.bx.warn{background:#ffd6d6;border:2px solid #d33}
.nm{font-weight:bold}
.pp{color:#555}
.rq{color:#d33;font-weight:bold}
.sub{font-size:10px;color:#555}
.legend{font-size:11px;color:#444;margin:4px 0}
.legend span{display:inline-block;width:14px;height:10px;border-radius:3px;vertical-align:middle;margin:0 3px 0 10px}
table{border-collapse:collapse;font-size:12px;margin-top:4px}
td,th{border:1px solid #ccc;padding:3px 8px;text-align:left}
th{background:#f2f2f2}
td.o{color:#999;text-decoration:line-through}
td.n{color:#1d7a3a;font-weight:bold}
.pg{page-break-before:always;break-before:page}
.cols{display:flex;gap:12px;align-items:flex-start}
.cols>.c1{flex:0 0 66%}
.big1{font-size:26px}
.bigt{border-collapse:collapse;width:100%}
.bigt td,.bigt th{border:1px solid #bbb;padding:2px 10px;font-size:17px;text-align:right;white-space:nowrap}
.bigt th{font-size:14px;text-align:center;background:#fff3dc}
.bigt td:first-child{text-align:left;font-weight:bold;font-size:19px}
.bigt td.b{font-size:24px;color:#c45a00}
.bigt .bw{width:28%}
.bigt .hb{height:16px}
.cols>.c3{flex:1}
.note{font-size:10px;color:#666;margin-top:2px}
.p3t td,.p3t th{padding:1px 5px;font-size:11px;white-space:nowrap}
.c3 .p3t td:last-child{white-space:normal}
.hr{margin-bottom:6px}
td.r{text-align:right}
td.b{font-weight:bold}
.hb{height:10px;min-width:0;background:#f7a823;border-radius:2px}
.ng{color:#d33;font-weight:bold}
@media print{.bar{display:none}body{padding:0}}
</style></head><body>
<div class="bar">${norm.navJs ? `<button class="sec" onclick="${norm.navJs}(-1)">◀ 前の日</button><button class="sec" onclick="${norm.navJs}(0)">今日</button><button class="sec" onclick="${norm.navJs}(1)">次の日 ▶</button><input type="date" value="${norm.date}" onchange="${norm.navJs}(this.value)" style="font-size:15px;padding:4px">` : ''}<button onclick="window.print()">PDFにする／印刷</button><button class="sec" onclick="${norm.reloadJs || 'location.reload()'}">食べログノートに戻る</button></div>
<h1>① カウンター　${mo}月${da}日（${wd}）${arrange ? '' : '<span style="font-size:15px;color:#c45a00">　食べログのまま（並べ直しは当日だけ）</span>'}</h1>
<div class="meta">${live.length}組 ${people}名　／　${esc(norm.made || '')} 時点の食べログノートから作成${norm.autoNote ? '（' + esc(norm.autoNote) + '）' : ''}　／　${arrange ? 'カウンターは時間そのまま・隣同士に並べ直し済み（食べログ側は書き換えていません）' : 'カウンターも食べログの席のままです'}</div>
${ok ? '' : '<div class="ng">※ この日はカウンターがいっぱいで、全員を隣同士に並べきれませんでした。赤い枠は元の席のままです。</div>'}
<div class="legend"><span style="background:#dcecff;border:2px solid #3b7dd8"></span>1名<span style="background:#ffe2ad;border:2px solid #e8a33a"></span>2名<span style="background:#e6dcf7;border:2px solid #7d5bc4"></span>3名以上<span style="background:none;color:#d33">★</span>要望あり</div>
<div class="chart">${axis()}<div style="position:relative;height:${cSeats.length * RH}px">${cHtml}</div></div>
<div class="pg"></div>
<h1>② テーブル・個室　${mo}月${da}日（${wd}）</h1>
<div class="meta">食べログのままの席です</div>
<div class="legend"><span style="background:#dcecff;border:2px solid #3b7dd8"></span>1名<span style="background:#ffe2ad;border:2px solid #e8a33a"></span>2名<span style="background:#e6dcf7;border:2px solid #7d5bc4"></span>3名以上<span style="background:none;color:#d33">★</span>要望あり</div>
<div class="chart">${axis()}<div style="position:relative;height:${tSeats.length * RH}px">${tHtml}</div></div>
<div class="pg"></div>
<h1 class="big1">③ 時間別の来店人数　${mo}月${da}日（${wd}）　${live.length}組 ${people}名</h1>
<div class="cols"><div class="c1">
<table class="bigt"><tr><th>来店</th><th>組</th><th>人数</th><th>カウンター</th><th>テーブル</th><th>店内</th><th class="bw"></th></tr>${hourRows}</table>
<div class="note">人数＝その30分に来る人数／店内＝その時刻に店にいる人数</div>
</div><div class="c3">
<h2>要望・メモのある予約（${reqs.length}組）</h2>
${reqs.length ? `<table class="p3t"><tr><th>時間</th><th>お名前</th><th>人数</th><th>席</th><th>内容</th></tr>${reqRows}</table>` : '<div class="meta">ありません</div>'}
</div></div>
</body></html>`;
}

(async () => {
  const Q = `query SeatSelection($date: Date!) { seats { id name displayOrder seatType { name } onlineBookingBlockings(date: $date) { id } } calendarDate(date: $date) { officeHour { dinnerTimeFrom dinnerTimeTo lunchTimeFrom lunchTimeTo } } bookings(visitDate: $date) { edges { node { id bookingStatus timeFrom timeTo numberOfPeople lastNameKana firstNameKana lastName firstName seats { name } requestsAndComments memo } } } }`;
  if (location.host !== 'owner.tabelog.com') { alert('食べログノート（owner.tabelog.com）を開いてから押してください'); return; }
  const m = location.pathname.match(/(\d{4}-\d{2}-\d{2})/);
  const jst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const date = window.__seiriDate || (m ? m[1] : jst);
  const auto = !!window.__seiriAuto; // 自動更新のときは画面を隠さず、スクロール位置を保つ
  window.__seiriDate = null; window.__seiriAuto = false;
  clearTimeout(window.__seiriTimer);
  const a = [...document.querySelectorAll('a[href*="tabelog.com/"]')].map(x => (x.href.match(/tabelog\.com\/[a-z]+\/A\d+\/A\d+\/(\d+)/) || [])[1]).find(Boolean);
  const rid = a || window.__seiriRid || '28077897';
  window.__seiriRid = rid;
  // 日付を変えて読み直す（整理表の画面の中から呼ぶ）
  window.__seiriGo = function (v) {
    let d = v;
    if (typeof v === 'number') { if (v === 0) d = jst; else { const t = new Date(date + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + v); d = t.toISOString().slice(0, 10); } }
    window.__seiriDate = d;
    const s = document.createElement('script'); s.src = 'https://replus-tanaoroshi.vercel.app/seiri/seiri.js?' + Date.now(); document.body.appendChild(s);
  };
  // iPadでも動くように、別窓は使わず今の画面を整理表に切り替える
  const w = window;
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;font:18px sans-serif';
  ov.textContent = '整理表を作っています…'; if (!auto) document.body.appendChild(ov);
  const sx = window.scrollX, sy = window.scrollY;
  try {
    const r = await fetch('/graphql', { method: 'POST', credentials: 'include', headers: { 'accept': 'application/graphql-response+json,application/json;q=0.9', 'content-type': 'application/json', 'x-restaurant-id': rid, 'x-from': location.origin }, body: JSON.stringify({ operationName: 'SeatSelection', variables: { date }, query: Q }) });
    const j = await r.json();
    if (!j.data) throw new Error(JSON.stringify(j.errors || j).slice(0, 200));
    const d = j.data, oh = d.calendarDate && d.calendarDate.officeHour || {};
    const now = new Date(Date.now() + 9 * 3600e3);
    const norm = {
      date, arrange: date === jst, navJs: 'window.__seiriGo', open: oh.lunchTimeFrom || oh.dinnerTimeFrom || '11:00', close: oh.dinnerTimeTo || oh.lunchTimeTo || '21:00',
      made: (now.getUTCMonth() + 1) + '/' + now.getUTCDate() + ' ' + now.getUTCHours() + ':' + String(now.getUTCMinutes()).padStart(2, '0'),
      reloadJs: "clearTimeout(window.__seiriTimer);location.href='/tn/time-schedule/" + date + "?r='+Date.now()",
      autoNote: '5分ごとに自動で更新',
      seats: d.seats.slice().sort((x, y) => x.displayOrder - y.displayOrder).map(s => ({ name: s.name, type: s.seatType.name, blocked: (s.onlineBookingBlockings || []).length > 0 })),
      bookings: d.bookings.edges.map(e => e.node).map(n => ({ from: n.timeFrom, to: n.timeTo, name: (n.lastNameKana || n.lastName || '') + ' ' + (n.firstNameKana || n.firstName || ''), n: n.numberOfPeople, seats: n.seats.map(s => s.name), status: n.bookingStatus, req: n.requestsAndComments, memo: n.memo }))
    };
    const html = seiriBuild(norm);
    w.document.open(); w.document.write(html); w.document.close();
    if (auto) window.scrollTo(sx, sy);
    // 開いている間は5分ごとに読み直す
    window.__seiriTimer = setTimeout(() => { window.__seiriAuto = true; window.__seiriGo(date); }, 5 * 60 * 1000);
  } catch (e) { if (auto) { window.__seiriTimer = setTimeout(() => { window.__seiriAuto = true; window.__seiriGo(date); }, 60 * 1000); return; } ov.style.color = '#c00'; ov.innerHTML = '<p style="font:16px sans-serif;padding:20px;color:#c00">読み込めませんでした。食べログノートにログインしているか確かめてください。<br><small>' + String(e.message || e).replace(/</g, '&lt;') + '</small><br><button onclick="this.parentNode.parentNode.remove()">閉じる</button></p>'; }
})();
};window.__seiriRun();