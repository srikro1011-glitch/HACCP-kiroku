window.__seiriRun=function(){// カウンター整理表（食べログノート用）: データ → 見やすい表のHTML
// norm = {date, open:"11:00", close:"20:30", made:"8:40",
//         seats:[{name,type,blocked}], bookings:[{from,to,name,n,seats:[...],status,req,memo}]}
function seiriBuild(norm) {
  const toM = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const live = norm.bookings.filter(b => !/CANCEL/.test(b.status || '') && b.seats.length);
  live.forEach((b, i) => { b.id = i; });
  const isCounter = s => /カウンター/.test(s.type);

  const arrange = norm.arrange !== false; // 当日だけ並べ直す。ほかの日は食べログのまま
  const C2T = 'none'; // カウンターの予約はカウンターで組む（11/24 工藤さん）。'want'ならテーブル希望だけテーブルへ
  // ---- 2名テーブル（T1〜T9）の団体を T1〜T4 / T5〜T8 の中にまとめる（当日だけ）----
  // T1〜T8は2名掛けが並び、4と5の間に柱。T9は離れているので団体には使わない。
  const tNow = new Map(); let tMoved = 0, tOk = true;
  (function () {
    const POOL = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'].filter(n => norm.seats.some(s => s.name === n));
    if (!arrange || POOL.length < 9) return;
    const BLOCKS = [[0, 1, 2, 3], [4, 5, 6, 7]];
    const inPool = b => b.seats.length && b.seats.every(n => POOL.includes(n));
    const fixed = live.filter(b => !inPool(b) && b.seats.some(n => POOL.includes(n)))
      .map(b => ({ s: toM(b.from), e: toM(b.to), idx: b.seats.map(n => POOL.indexOf(n)).filter(i => i >= 0) }));
    const tb = live.filter(inPool).map(b => ({ b, s: toM(b.from), e: toM(b.to), k: b.seats.length, orig: b.seats.map(n => POOL.indexOf(n)) }))
      .sort((a, c) => c.k - a.k || a.s - c.s);
    const pl = [];
    const busy = (i, x) => fixed.some(f => f.s < x.e && x.s < f.e && f.idx.includes(i)) || pl.some(p => p.x.s < x.e && x.s < p.x.e && p.at.includes(i));
    function cand(x) {
      const out = [];
      if (x.k === 1) for (let i = 0; i < 9; i++) out.push([i]);
      else BLOCKS.forEach(bl => { for (let st = 0; st + x.k <= bl.length; st++) out.push(bl.slice(st, st + x.k)); });
      return out.filter(a => a.every(i => !busy(i, x)))
        .map(a => ({ a, keep: a.filter(i => x.orig.includes(i)).length, far: x.k === 1 && a[0] === 8 ? 1 : 0,
          bump: x.k > 1 ? tb.filter(y => y !== x && !pl.some(p => p.x === y) && y.s < x.e && x.s < y.e && y.orig.some(i => a.includes(i))).length : 0 }))
        .sort((p, q) => p.bump - q.bump || q.keep - p.keep || p.far - q.far || p.a[0] - q.a[0]);
    }
    let steps = 0;
    function dfs(i) {
      if (i === tb.length) return true;
      if (++steps > 20000) return false;
      for (const c of cand(tb[i])) { pl.push({ x: tb[i], at: c.a }); if (dfs(i + 1)) return true; pl.pop(); }
      return false;
    }
    if (tb.length > 0 && !tb.some(x => x.k > 4) && dfs(0)) {
      pl.forEach(p => { const ns = p.at.slice().sort((a, c) => a - c).map(i => POOL[i]); if (ns.join() !== p.x.b.seats.join()) { tNow.set(p.x.b, ns); tMoved++; } });
    } else if (tb.some(x => x.k > 1)) tOk = false;
  })();

  // ---- カウンターの予約を、空いているテーブルへ振る（当日だけ）----
  // テーブルを先に埋めて、カウンターはゆったり。T16はあけておく。個室は使わない。
  // 「テーブル希望」と書いてある予約を先に。1〜2名は2名卓(T1〜T9)→なければ4名卓、3〜4名は4名卓。
  const toT = new Set();
  (function () {
    if (!arrange) return;
    const T2 = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'], T4 = ['T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T17', 'T18'];
    const has = n => norm.seats.some(s => s.name === n && !s.blocked);
    const cName = new Set(norm.seats.filter(isCounter).map(s => s.name));
    const occ = {};
    live.forEach(b => { if (b.seats.every(n => cName.has(n))) return; (tNow.get(b) || b.seats).forEach(n => (occ[n] = occ[n] || []).push([toM(b.from), toM(b.to)])); });
    const free = (t, a, e) => has(t) && !(occ[t] || []).some(x => x[0] < e && a < x[1]);
    const txt = b => (b.req || '') + ' ' + (b.memo || '');
    const wantT = b => /テーブル/.test(txt(b)), wantC = b => /カウンター/.test(txt(b)) && !wantT(b);
    const list = live.filter(b => b.seats.length && b.seats.every(n => cName.has(n)) && b.n <= 4 && !wantC(b) && (C2T === 'want' ? wantT(b) : C2T !== 'none'))
      .sort((x, y) => (wantT(y) - wantT(x)) || (y.n - x.n) || (toM(x.from) - toM(y.from)));
    list.forEach(b => {
      const a = toM(b.from), e = toM(b.to);
      const pool = b.n <= 2 ? T2.concat(T4) : T4;
      // すき間が少ない卓（前の予約の終わりにぴったり続く卓）を優先
      const cand = pool.filter(t => free(t, a, e)).map(t => {
        const prevEnd = Math.max(-1, ...(occ[t] || []).filter(x => x[1] <= a).map(x => x[1]));
        const nextSt = Math.min(9999, ...(occ[t] || []).filter(x => x[0] >= e).map(x => x[0]));
        return { t, big: b.n <= 2 && T4.includes(t) ? 1 : 0, gap: (prevEnd < 0 ? 600 : a - prevEnd) + (nextSt > 9000 ? 600 : nextSt - e) };
      }).sort((p, q) => p.big - q.big || p.gap - q.gap || pool.indexOf(p.t) - pool.indexOf(q.t));
      if (!cand.length) return;
      const t = cand[0].t;
      (occ[t] = occ[t] || []).push([a, e]); tNow.set(b, [t]); toT.add(b);
    });
  })();

  // ---- カウンターの並べ直し ----
  const used = new Set(live.flatMap(b => b.seats));
  const cSeats = norm.seats.filter(s => isCounter(s) && (!s.blocked || used.has(s.name))).map(s => s.name);
  const N = cSeats.length;
  const cBook = live.filter(b => !toT.has(b) && b.seats.some(n => cSeats.includes(n)))
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
    const score = () => placed.reduce((a, p) => { let k = 0; for (let x = p.start; x < p.start + p.b.k; x++) if (p.b.orig.includes(x)) k++; return a + 4 * nbFree(p, p.start - 1) + 4 * nbFree(p, p.start + p.b.k) + k; }, 0);
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
  const cNow = new Map(); placed.forEach(p => { const o = live.find(b => b.id === p.b.id); if (o) cNow.set(o, p.now); });
  const seatsNow = b => tNow.get(b) || cNow.get(b) || b.seats;


  // ---- 時間軸 ----
  const t0 = Math.floor(Math.min(toM(norm.open), ...live.map(b => toM(b.from))) / 60) * 60;
  const t1 = Math.ceil(Math.max(toM(norm.close), ...live.map(b => toM(b.to))) / 60) * 60;
  const PX = 1.6, RH = 28, LW = 52; // 1分=1.6px
  const W = (t1 - t0) * PX;
  const hhmm = m => Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
  const pc = m => ((m - t0) / (t1 - t0) * 100).toFixed(3) + '%';
  let curN = 1; // いま描いている表の行数（縦の％計算用）
  const pr = r => (r / curN * 100).toFixed(3) + '%';
  function axis() {
    let h = '';
    for (let m = t0; m <= t1; m += 30) h += `<div class="tk${m % 60 ? ' half' : ''}" style="left:${pc(m)}">${m % 60 ? '' : hhmm(m)}</div>`;
    return `<div class="axis"><div class="trk">${h}</div></div>`;
  }
  function grid(rows) {
    curN = Math.max(rows.length, 1);
    let lines = '';
    for (let m = t0; m <= t1; m += 30) lines += `<div class="vl${m % 60 ? ' half' : ''}" style="left:${pc(m)}"></div>`;
    const stripes = rows.map((r, i) => `<div class="row${i % 2 ? ' odd' : ''}" style="top:${pr(i)};height:${pr(1)}"><div class="lab">${esc(r)}</div><div class="lab r">${esc(r)}</div></div>`).join('');
    return { head: stripes, lines, rows };
  }
  // 来店時刻が同じで名字も同じ組は黄色にする（受付の取り違え防止）
  const sameCnt = {}; live.forEach(b => { const k = b.from + '|' + b.name.split(' ')[0]; sameCnt[k] = (sameCnt[k] || 0) + 1; });
  const isSame = b => sameCnt[b.from + '|' + b.name.split(' ')[0]] > 1;
  function box(b, top, h, cls, sub) {
    const r0 = top / RH, rn = h / RH;
    cls = cls === 'warn' ? 'warn' : (b.n <= 1 ? 'p1' : b.n === 2 ? 'p2' : 'p3');
    if (isSame(b)) cls += ' same';
    return `<div class="bx ${cls}${rn > 1 ? ' tall' : ''}" data-id="${b.id}" data-k="${esc(b.from + '|' + b.name + '|' + b.n)}" data-q="${esc((b.req || '') + (b.memo ? ' ／メモ: ' + b.memo : ''))}" data-a="${toM(b.from)}" data-b="${toM(b.to)}" data-t="${esc(b.from + '〜' + b.to)}" data-r="${r0}" data-s="${rn}" data-p="${b.n}" data-fn="${esc(b.name.replace(/\s+/g, ' ').trim())}" data-tel="${esc(b.tel || '')}" style="left:calc(${pc(toM(b.from))} + 1px);top:calc(${pr(r0)} + 2px);width:calc(${pc(t0 + toM(b.to) - toM(b.from))} - 3px);height:calc(${pr(rn)} - 4px)">
      <span class="nm">${esc(b.name.split(' ')[0])}</span><span class="pp">${b.n}名</span>${b.req ? '<span class="rq">★</span>' : ''}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>`;
  }
  function arrRow(list) { // 30分ごと・1時間ごとの来店人数と合計（時間の下にそろえる）
    const sum = (f, w) => list.filter(b => toM(b.from) >= f && toM(b.from) < f + w).reduce((a, b) => a + b.n, 0);
    let h30 = '', h60 = '';
    for (let m = t0; m < t1; m += 30) { const p = sum(m, 30); h30 += `<div class="ac" style="left:${pc(m)};width:${pc(t0 + 30)}">${p || ''}</div>`; }
    for (let m = t0; m < t1; m += 60) { const p = sum(m, 60); h60 += `<div class="ac h" style="left:${pc(m)};width:${pc(t0 + 60)}">${p || ''}</div>`; }
    const tot = list.reduce((a, b) => a + b.n, 0);
    return `<div class="arr"><div class="arl">30分ごと</div><div class="trk">${h30}</div></div>`
      + `<div class="arr"><div class="arl">1時間ごと</div><div class="trk">${h60}</div></div>`
      + `<div class="arr tot"><div class="arl">合計</div><div class="trk"><div class="ac" style="left:0;justify-content:flex-start;padding-left:8px;border:0">${list.length}組　${tot}名</div></div></div>`;
  }
  function chart(g, inner, n, cls, foot, ph) {
    return `<div class="chart"><div class="cin">${axis()}<div class="plot ${cls}" data-n="${n}" data-rows="${esc(g.rows.join('|'))}" style="height:${n * RH}px;--ph:${ph || 118}mm">${g.head}<div class="trk">${g.lines}${inner}</div></div>${foot || ''}</div></div>`;
  }

  // カウンター
  const cGrid = grid(cSeats); let cHtml = '';
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
  const tGrid = grid(tSeats); let tHtml = '';
  live.filter(b => seatsNow(b).some(n => tSeats.includes(n))).forEach(b => {
    const ts = tNow.get(b) || b.seats;
    const idx = ts.map(n => tSeats.indexOf(n)).filter(i => i >= 0).sort((a, c) => a - c);
    const contiguous = idx.every((v, j) => j === 0 || v === idx[j - 1] + 1);
    if (contiguous) tHtml += box(b, idx[0] * RH, idx.length * RH, 'st', toT.has(b) ? 'カウンターから' : idx.length > 1 ? ts.join('+') : '');
    else idx.forEach(i => { tHtml += box(b, i * RH, RH, 'st', ts.join('+')); });
  });

  // 空き枠: 20時までに1時間半（90分）空いている席に、赤線の空白枠
  const FREE_END = toM('20:00'), FREE_LEN = 90;
  function freeHtml(rows, occ) {
    let h = '';
    rows.forEach((nm, i) => {
      const busy = (occ[nm] || []).slice().sort((a, c) => a[0] - c[0]);
      let t = Math.ceil(toM(norm.open) / 30) * 30;
      while (t + FREE_LEN <= FREE_END) {
        const hit = busy.find(x => x[0] < t + FREE_LEN && t < x[1]);
        if (hit) { t = Math.ceil(hit[1] / 30) * 30; continue; }
        h += `<div class="free" style="left:calc(${pc(t)} + 1px);top:calc(${pr(i)} + 2px);width:calc(${pc(t0 + FREE_LEN)} - 3px);height:calc(${pr(1)} - 4px)"></div>`;
        t += FREE_LEN;
      }
    });
    return h;
  }
  const occC = {}, occT = {};
  const addOcc = (o, names, b) => names.forEach(n => (o[n] = o[n] || []).push([toM(b.from), toM(b.to)]));
  placed.forEach(p => addOcc(occC, p.now, p.b));
  live.forEach(b => addOcc(occT, (tNow.get(b) || b.seats), b));
  curN = Math.max(cSeats.length, 1); const freeC = freeHtml(cSeats, occC);
  curN = Math.max(tSeats.length, 1); const freeT = freeHtml(tSeats, occT);
  const people = live.reduce((a, b) => a + b.n, 0);
  const nowSeat = {}; placed.forEach(p => { nowSeat[p.b.from + p.b.name] = p.now; }); tNow.forEach((v, b) => { nowSeat[b.from + b.name] = v; });
  const reqs = live.filter(b => b.req || b.memo).sort((a, b) => toM(a.from) - toM(b.from));
  const moveRows = moves.map(p => `<tr><td>${esc(p.b.from)}</td><td>${esc(p.b.name.split(' ')[0])} 様</td><td>${p.b.n}名</td><td class="o">${esc(p.b.seats.join('・'))}</td><td>→</td><td class="n">${esc(p.now.join('・'))}</td></tr>`).join('');
  const reqRows = reqs.map(b => `<tr><td>${esc(b.from)}</td><td>${esc(b.name.replace(/\s+/g, ' ').trim())} 様</td><td>${b.n}名</td><td>${esc((nowSeat[b.from + b.name] || b.seats).join('・'))}</td><td>${esc((b.req || '') + (b.memo ? ' ／メモ: ' + b.memo : ''))}</td></tr>`).join('');
  // 時間別の来店人数（30分ごと）
  const isC = b => seatsNow(b).some(n => cSeats.includes(n));
  const reqC = reqs.filter(b => seatsNow(b).some(n => cSeats.includes(n))), reqT = reqs.filter(b => seatsNow(b).some(n => tSeats.includes(n)));
  const reqBox = list => list.length ? `<div class="rqb"><div class="rqh">要望・メモのある予約（${list.length}組）</div><table>${list.map(b => `<tr><td>${esc(b.from)}</td><td>${esc(b.name.split(' ')[0])} 様</td><td>${b.n}名</td><td class="st">${esc(seatsNow(b).join('・'))}</td><td>${esc((b.req || '') + (b.memo ? ' ／メモ: ' + b.memo : ''))}</td></tr>`).join('')}</table></div>` : '';
  const phOf = list => list.length ? Math.max(78, 112 - list.length * 6) : 118;
  let hourRows = '', mx = 0;
  const slots = [];
  for (let m = t0; m < t1; m += 30) {
    const arr = live.filter(b => toM(b.from) >= m && toM(b.from) < m + 30);
    const inn = live.filter(b => toM(b.from) <= m && m < toM(b.to));
    const sl = { m, g: arr.length, p: arr.reduce((a, b) => a + b.n, 0), pc: arr.filter(isC).reduce((a, b) => a + b.n, 0), in: inn.reduce((a, b) => a + b.n, 0) };
    sl.k = arr.reduce((a, b) => a + Math.min(b.kids || 0, b.n), 0); sl.ad = sl.p - sl.k; // ご飯は大人の人数で炊く（子どもは横に表示だけ）
    sl.pt = sl.p - sl.pc; mx = Math.max(mx, sl.p); slots.push(sl);
  }
  // 釜：前（円卓）16個まで・後ろ20個まで。ふだんは前から、11:00だけ後ろから。点火は来店の15分前
  slots.filter(x => x.p).forEach(x => {
    hourRows += `<tr data-m="${x.m}"><td>${hhmm(x.m)}</td><td class="r">${x.g || ''}</td><td class="r b">${x.ad}</td><td class="r kc">${x.k || ''}</td><td class="r tot">${x.p}</td><td class="memo"></td></tr>`;
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
.chart{overflow-x:auto;overflow-y:hidden;touch-action:pan-x pan-y}
.cin{min-width:${LW * 2 + W}px}
.axis{position:relative;height:18px;font-size:11px;color:#444}
.trk{position:absolute;left:${LW}px;right:${LW}px;top:0;bottom:0}
.plot{position:relative}
.tk{position:absolute;top:0;transform:translateX(-50%)}
.row{position:absolute;left:0;right:0;border-bottom:1px solid #e3e3e3}
.row.odd{background:#fafafa}
.lab{position:absolute;left:0;width:${LW}px;height:100%;display:flex;align-items:center;padding-left:4px;font-size:12px;font-weight:bold;border-right:1px solid #bbb;background:#f2f2f2}
.lab.r{left:auto;right:0;border-right:0;border-left:1px solid #bbb}
.arr{position:relative;height:24px;border-top:1px solid #bbb;border-bottom:1px solid #bbb;background:#fff8ea}
.arl{position:absolute;left:0;width:${LW}px;height:100%;display:flex;align-items:center;padding-left:3px;font-size:10px;font-weight:bold;background:#f2f2f2;border-right:1px solid #bbb}
.arr:first-of-type,.plot+.arr{border-top:2px solid #444}
.ac.h{font-size:17px;color:#7a2e00;border-left:1px solid #666}
.arr.tot .ac{font-size:16px;color:#222}
.ac{position:absolute;top:0;height:100%;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:bold;color:#c45a00;border-left:1px dashed #9a9a9a}
.bx{touch-action:pan-y;cursor:grab;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none}
.bx.held{outline:3px solid #ffd400;outline-offset:1px;transform:scale(1.03);z-index:5}
.bx.drag{opacity:.85;box-shadow:0 4px 12px rgba(0,0,0,.4);z-index:5}
.bx.ed{outline:3px dashed #ffd400;outline-offset:-3px}
.bx.nw{box-shadow:inset 0 0 0 3px #ff6d00}.bx.nw .nm::before{content:"新";background:#ff6d00;color:#fff;font-weight:bold;border-radius:3px;padding:0 3px;margin-right:3px}
.nwn{background:#fff1e0;border:2px solid #ff6d00;border-radius:8px;padding:6px 10px;margin:6px 0;font-size:15px;font-weight:bold;color:#7a3300;line-height:1.6}
#upd{font-weight:bold;font-size:14px}#upd.old{color:#c62828}
.bx.ov{outline:3px solid #ff2d2d;outline-offset:-3px}
.hint{font-size:12px;color:#666}
.edn{color:#b00;font-weight:bold;font-size:12px}
.bx.arr{opacity:.3}
#sp .mn{max-width:480px}#sp .mb{display:flex;flex-direction:column;gap:10px;margin-top:10px}#sp .mb button{font-size:19px;padding:14px;border-radius:10px;border:2px solid #999;background:#fff}#sp .mb .ok{background:#1e7a3c;border-color:#0f4d24;color:#fff}
.rqb{margin-top:4px;border:2px solid #c45a00;border-radius:4px;padding:2px 6px;background:#fff8ef}.rqh{font-weight:bold;color:#c45a00;font-size:13px}.rqb table{border-collapse:collapse;width:100%}.rqb td{font-size:13px;padding:1px 6px;border-top:1px solid #eedcc8;vertical-align:top;white-space:nowrap}.rqb td:last-child{white-space:normal;width:100%}.rqb td.st{font-weight:bold}
#sp{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px}
#sp .cd{background:#fff;border-radius:10px;max-width:760px;width:100%;padding:14px 16px;font-size:15px;color:#222}
#sp h3{margin:0 0 4px;font-size:19px}#sp .sm{font-size:13px;color:#555;margin:0 0 8px}#sp a.tel{display:block;margin:0 0 10px;padding:10px 12px;border:2px solid #1e5fa8;border-radius:8px;color:#1e5fa8;font-size:20px;font-weight:700;text-decoration:none;text-align:center}
#sp .gl{font-weight:bold;margin:10px 0 4px}#sp .gs{display:flex;flex-wrap:wrap;gap:6px}
#sp .st{min-width:64px;min-height:46px;border:2px solid #999;border-radius:8px;background:#fff;font-size:15px;padding:2px 6px;line-height:1.15;color:#222}
#sp .st small{display:block;font-size:11px;color:#b00}
#sp .st.on{background:#1f5fbf;border-color:#123d80;color:#fff}#sp .st.on small{color:#ffd400}
#sp .st.bz{background:#f1f1f1;border-style:dashed}
#sp .now{margin:10px 0 0;font-weight:bold}#sp .ft{display:flex;gap:10px;justify-content:flex-end;margin-top:12px}
#sp .ft button{font-size:17px;padding:10px 22px;border-radius:8px;border:2px solid #999;background:#fff}#sp .ft .ok{background:#1e7a3c;border-color:#0f4d24;color:#fff}
@media print{#sp{display:none}}
.bx.cxl{background:#fff!important;color:#c00000!important;border:2px solid #c00000!important;opacity:.8;background-image:repeating-linear-gradient(135deg,transparent 0 6px,rgba(200,0,0,.15) 6px 12px)!important}.bx.cxl .nm::before{content:'キャンセル ';font-weight:bold}
.bx.park{display:none}
#tray{position:fixed;left:0;right:0;bottom:0;background:#fff8d6;border-top:3px solid #c47a00;padding:8px 12px;z-index:50;display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:15px}#tray .chip{font-size:16px;padding:10px 14px;border:2px solid #c47a00;border-radius:8px;background:#fff;font-weight:bold}
#sp .mb .pk{text-align:left}#sp .ft .unpark{margin-right:auto}
.bx.tm{outline:2px dashed #0b4f8a;outline-offset:-2px}.bx.gone{opacity:.55;background-image:repeating-linear-gradient(45deg,transparent 0 6px,rgba(255,255,255,.5) 6px 12px)}
#sp .tmr{display:flex;gap:16px;margin:12px 0}#sp .tmr label{font-size:17px;font-weight:bold}#sp .tmr select{font-size:22px;padding:6px 10px;margin-left:6px}
.free{position:absolute;border:2px solid #e00000;border-radius:4px;background:transparent;pointer-events:none}
.vl{position:absolute;top:0;bottom:0;border-left:1px solid #888}
.vl.half{border-left:1px dashed #9a9a9a}
.bx{position:absolute;border-radius:5px;padding:0 5px;font-size:12px;line-height:1.2;overflow:hidden;display:flex;flex-wrap:nowrap;align-items:center;gap:0 4px;white-space:nowrap}
.bx .nm{flex-shrink:0}
.bx.tall{flex-wrap:wrap;align-content:center}
.bx .sub{overflow:hidden;text-overflow:clip}
.bx.p1{background:#1f5fbf;border:2px solid #123d80;color:#fff}
.bx.p2{background:#1e7a3c;border:2px solid #0f4d24;color:#fff}
.bx.p3{background:#5b3a9e;border:2px solid #3a2368;color:#fff}
.bx.warn{background:#c62828;border:2px solid #7f1414;color:#fff}
.bx.same{background:#ffe100;border:2px solid #b38f00;color:#000}.bx.same .pp,.bx.same .sub{color:#000}.bx.same .rq{color:#c00000}
.nm{font-weight:bold;font-size:1.1em}
.pp{color:inherit}
.bx .pp,.bx .sub{color:#fff;opacity:.9}
.bx .rq{color:#ffd400}
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
.bigt td,.bigt th{border:1px solid #777;color:#111;padding:2px 10px;font-size:17px;text-align:right;white-space:nowrap}
.bigt th{font-size:14px;text-align:center;background:#333;color:#fff}
.bigt td:first-child{text-align:left;font-weight:bold;font-size:19px}
.bigt td.b{font-size:24px;color:#8a1c00}
.bigt .bw{width:28%}
.bigt .hb{height:16px}
.bigt td.k{font-size:22px;font-weight:bold;color:#0b4f8a;text-align:center}
.bigt td.f{font-size:20px;font-weight:bold;text-align:center}
.bigt .ov{display:block;font-size:11px;color:#666;font-weight:normal}
.bigt .memo{width:56%}
.bigt td.kc{font-size:18px;color:#555}.bigt td.tot{font-size:18px;color:#222}
.bigt small.kid{font-size:12px;color:#666;font-weight:normal;margin-left:4px}
.flow{font-size:13px;border:2px solid #0b4f8a;border-radius:4px;padding:3px 8px;margin:0 0 4px;background:#f2f7fc}
.cols>.c3{flex:1}
.note{font-size:10px;color:#666;margin-top:2px}
.p3t td,.p3t th{padding:1px 5px;font-size:11px;white-space:nowrap}
.c3 .p3t td:last-child{white-space:normal}
.hr{margin-bottom:6px}
td.r{text-align:right}
td.b{font-weight:bold}
.hb{height:10px;min-width:0;background:#c0392b;border-radius:2px}
.ng{color:#d33;font-weight:bold}
@media print{.bar,#tray,.nwn{display:none!important}.bx.nw .nm::before{content:none}.bx.ed{outline:none}body{padding:0}h1{font-size:17px}.meta{margin-bottom:2px}.legend{margin:1px 0}.chart{overflow:visible}.cin{min-width:0}.plot.pc,.plot.pt{height:var(--ph,118mm)!important}.rqb td{font-size:11px;padding:0 4px}.ng{font-size:12px}.bx{font-size:12px}.big1{font-size:20px;margin-bottom:4px}.bigt td,.bigt th{font-size:15px;padding:0 8px;line-height:1.35}.bigt td:first-child{font-size:16px}.bigt td.b{font-size:21px}
.bigt td.tot{font-size:21px;font-weight:bold;color:#000}.bigt .hb{height:10px}h2{margin:4px 0 2px}.cols>.c1{flex:0 0 60%}}
#alerts{position:sticky;top:0;z-index:60;background:#1f1d1a;color:#fff;margin:-14px -14px 8px;padding:8px 14px;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:15px}
#alerts:empty{display:none}
#alerts .clk{font-size:20px;margin-right:2px}
#alerts .lb{font-size:12px;font-weight:bold;padding:2px 8px;border-radius:99px;color:#fff}
#alerts .lb.so{background:#ff8c00;color:#000}#alerts .lb.la{background:#e53935}#alerts .lb.fr{background:#2e7d32}
#alerts .ch{font-size:15px;font-weight:bold;padding:6px 10px;border-radius:8px;border:2px solid;background:#fff;cursor:pointer}
#alerts .ch.so{border-color:#ff8c00;color:#8a4b00}#alerts .ch.la{border-color:#e53935;color:#b71c1c}
#alerts .fs{font-size:14px;background:#2b3a2d;border-radius:6px;padding:3px 8px}#alerts .tg{font-size:14px;font-weight:bold;padding:5px 10px;border-radius:8px;border:1px solid #fff;background:transparent;color:#fff;cursor:pointer}
#alerts .nw{background:#fff8d6;color:#5a3d00;border-radius:8px;padding:4px 2px 4px 10px;font-size:14px;display:inline-flex;gap:4px;align-items:center}#alerts .nw.del{background:#ffe3e3;color:#8a0000}
#alerts .nx{border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:inherit;padding:2px 8px}
#alerts .rt{margin-left:auto;display:flex;gap:6px}
#alerts .rt button{font-size:14px;padding:6px 12px;border-radius:6px;border:1px solid #fff;background:transparent;color:#fff;font-weight:bold;cursor:pointer}
#alerts .rt button:disabled{opacity:.35;cursor:default}
@keyframes blinkSo{50%{box-shadow:0 0 0 5px #ff8c00}}@keyframes blinkLa{50%{box-shadow:0 0 0 5px #e53935}}
.bx.soon{box-shadow:0 0 0 2px #ff8c00;animation:blinkSo 1.2s infinite;z-index:4}
.bx.late{box-shadow:0 0 0 2px #e53935;animation:blinkLa 1.2s infinite;z-index:4}
@media (prefers-reduced-motion:reduce){.bx.soon{animation:none;box-shadow:0 0 0 4px #ff8c00}.bx.late{animation:none;box-shadow:0 0 0 4px #e53935}}
.nowl{position:absolute;top:0;bottom:0;width:0;border-left:2px solid #e53935;z-index:6;pointer-events:none}
.bigt tr.nowr td{background:#ffe9a8}.bigt tr.nextr td{background:#fff6d9}
.bigt tr.nowr td:first-child::after{content:' いま';font-size:12px;color:#c62828}.bigt tr.nextr td:first-child::after{content:' 次';font-size:12px;color:#8a6d00}
.y4{margin-top:22px}.y4 .hint4{font-size:13px;color:#666;margin:0 0 6px}
.y4 .cl4{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;touch-action:pan-x pan-y;padding-bottom:6px;align-items:stretch}
.y4 .sl{flex:0 0 112px;border:2px solid #ddd;border-radius:8px;padding:4px;display:flex;flex-direction:column;gap:4px;background:#fff}
.y4 .sl.now{background:#ffe9a8;border-color:#e0b000}.y4 .sl.next{background:#fff6d9}
.y4 .tm{font-size:22px;font-weight:bold;text-align:center;line-height:1.15;border-bottom:2px solid #ccc;padding-bottom:3px}.y4 .tm small{display:block;font-size:12px;font-weight:normal;color:#555}
.y4 .ar{font-size:12px;font-weight:bold;color:#555;text-align:center;margin-top:2px}
.y4 .sc{width:100%;font:inherit;font-size:18px;font-weight:bold;padding:4px 10px;border-radius:8px;border:3px solid #1f5fbf;background:#fff;color:#111;cursor:pointer;display:inline-flex;flex-direction:column;align-items:center;line-height:1.15;min-height:46px;justify-content:center}
.y4 .sc.p2{border-color:#1e7a3c}.y4 .sc.p3{border-color:#5b3a9e}
.y4 .sc .sn{white-space:nowrap}.y4 .sc small{white-space:nowrap;font-size:11px;font-weight:normal;color:#444}
.y4 .sc.came{opacity:.3}.y4 .sc.late{box-shadow:0 0 0 3px #e53935}
@media print{.y4{break-before:page;page-break-before:always;margin-top:0}.y4 .hint4{display:none}.y4 .cl4{flex-wrap:wrap;overflow:visible;gap:4px}.y4 .sl{flex:0 0 calc(11.11% - 4px);box-sizing:border-box;padding:2px;gap:2px;break-inside:avoid;border-width:1px}.y4 .sl.now,.y4 .sl.next{background:#fff;border-color:#ddd}.y4 .tm{font-size:16px}.y4 .tm small{font-size:10px}.y4 .ar{font-size:10px}.y4 .sc{font-size:13px;min-height:0;padding:1px 3px;border-width:2px;border-radius:5px}.y4 .sc small{font-size:9px}.y4 .sc.late{box-shadow:none}}
@media print{#alerts,.nowl{display:none!important}.bx.soon,.bx.late{animation:none;box-shadow:none}.bigt tr.nowr td,.bigt tr.nextr td{background:none}.bigt tr.nowr td:first-child::after,.bigt tr.nextr td:first-child::after{content:none}}
</style></head><body>
<div class="bar">${norm.navJs ? `<button class="sec" onclick="${norm.navJs}(-1)">◀ 前の日</button><button class="sec" onclick="${norm.navJs}(0)">今日</button><button class="sec" onclick="${norm.navJs}(1)">次の日 ▶</button><input type="date" value="${norm.date}" onchange="${norm.navJs}(this.value)" style="font-size:15px;padding:4px">` : ''}<button onclick="window.print()">PDFにする／印刷</button><button id="fixBtn" style="background:#c62828">この席で確定</button><button class="sec" id="unfixBtn" style="display:none">確定をやめて組み直す</button><span id="fixNote" style="font-weight:bold;color:#c62828"></span><button class="sec" id="undoBtn" style="display:none" onclick="${norm.navJs ? norm.navJs + '(\'' + norm.date + '\')' : 'location.reload()'}">動かしたのを元に戻す</button><span class="hint">予約の枠をタップ →「ご来店しました」で薄くなります／「席を変える」で席の移動・追加・減らす、「お帰りになりました」「時間を変える」「キャンセル」もここからできます。長押しでつかんで動かすこともできます</span><span id="upd"></span><button class="sec" id="shBtn">🔗 共有</button><span id="shSt" style="font-weight:bold"></span><button class="sec" onclick="${norm.reloadJs || 'location.reload()'}">${norm.child ? '読み直す' : '食べログノートに戻る'}</button></div>
<h1>① カウンター　${mo}月${da}日（${wd}）${arrange ? '' : '<span style="font-size:15px;color:#c45a00">　食べログのまま（並べ直しは当日だけ）</span>'}</h1>
<div class="meta">${live.length}組 ${people}名　／　${esc(norm.made || '')} 時点の食べログノートから作成${norm.autoNote ? '（' + esc(norm.autoNote) + '）' : ''}　／　${arrange ? 'カウンターは時間そのまま・隣同士に並べ直し済み（食べログ側は書き換えていません）' : 'カウンターも食べログの席のままです'}</div>
${ok ? '' : '<div class="ng">※ この日はカウンターがいっぱいで、全員を隣同士に並べきれませんでした。赤い枠は元の席のままです。</div>'}
<div class="legend"><span style="background:#1f5fbf"></span>1名<span style="background:#1e7a3c"></span>2名<span style="background:#5b3a9e"></span>3名以上<span style="background:none;color:#d4a000">★</span>要望あり<span style="background:#ffe100;border:1px solid #b38f00"></span>同じ時刻に同じ名字</div>
${chart(cGrid, cHtml, cSeats.length, 'pc', arrRow(live.filter(b => seatsNow(b).some(n => cSeats.includes(n)))))}
<div class="pg"></div>
<h1>② テーブル・個室　${mo}月${da}日（${wd}）</h1>
<div class="meta">${arrange ? (toT.size ? 'カウンターの予約から' + toT.size + '組を空いているテーブルへ移しました（T16はあけています）／' : '') + (tMoved ? '2名テーブルの団体は T1〜T4・T5〜T8 の中にまとめ直し済み（' + tMoved + '組）／' : '') + '食べログ側の席は書き換えていません' : '食べログのままの席です'}</div>${tOk ? '' : '<div class="ng">※ 2名テーブルの団体を T1〜T4・T5〜T8 にまとめきれなかったので、食べログの席のままです。</div>'}
<div class="legend"><span style="background:#1f5fbf"></span>1名<span style="background:#1e7a3c"></span>2名<span style="background:#5b3a9e"></span>3名以上<span style="background:none;color:#d4a000">★</span>要望あり<span style="background:#ffe100;border:1px solid #b38f00"></span>同じ時刻に同じ名字</div>
${chart(tGrid, tHtml, tSeats.length, 'pt', arrRow(live.filter(b => seatsNow(b).some(n => tSeats.includes(n)))))}
<div class="pg"></div>
<h1 class="big1">③ 時間別の来店人数　${mo}月${da}日（${wd}）　${live.length}組 ${people}名</h1>
<div class="cols"><div class="c1">
<div class="flow">①点火したらすぐ、次の時間の釜を数だけ用意 → 米をすり切り1杯入れて置く（冷蔵庫の島ごとに時間を分ける）　②点火10分前に水225cc → 蓋をして炊飯台へ　③時間が来たら厨房に声をかけて点火</div><table class="bigt"><tr><th>来店</th><th>組</th><th>大人</th><th>子ども</th><th>合計</th><th class="memo">メモ（正の字・追加・気づいたこと）</th></tr>${hourRows}</table>
<div class="note">大人＝その30分に来る大人の人数＝炊く個数／子ども＝子どもの人数（炊く数には入れません）／合計＝大人＋子ども</div>
</div><div class="c3">
<h2>要望・メモのある予約（${reqs.length}組）</h2>
${reqs.length ? `<table class="p3t"><tr><th>時間</th><th>お名前</th><th>人数</th><th>席</th><th>内容</th></tr>${reqRows}</table>` : '<div class="meta">ありません</div>'}
</div></div>
<div class="y4"><h1 class="big1">④ 時間ごとの来店予定（どの席に来るか）</h1><p class="hint4">席の番号を押すと「ご来店しました」になって薄くなり、上の①②の枠も同じく薄くなります。もう一度押すと取り消せます。左右にずらすと、ほかの時間も見られます。</p><div id="yotei"></div></div>
<script>
(function(){
  var DATE='${norm.date}',T0=${t0},T1=${t1},MADE='${esc(norm.made || '')}',CHILD=${norm.child ? 1 : 0},C2T='${C2T}',BLK=${JSON.stringify(norm.seats.filter(s => s.blocked).map(s => s.name))};
  var cur=null,lastY=0,timer=null;
  // 時間の変更（帰った・時間を変える）: このiPadに保存して、開き直し・自動更新でも同じにする
  var TKEY='seiri-time-'+DATE;
  function tmGet(){try{return JSON.parse(localStorage.getItem(TKEY)||'{}');}catch(e){return window.__seiriTm||{};}}
  function tmSave(o){window.__seiriTm=o;try{localStorage.setItem(TKEY,JSON.stringify(o));}catch(e){}}
  function hm(m){return Math.floor(m/60)+':'+String(m%60).padStart(2,'0');}
  function pcx(m){return ((m-T0)/(T1-T0)*100).toFixed(3)+'%';}
  function setBoxTime(b,a,e){b.setAttribute('data-a',a);b.setAttribute('data-b',e);
    if(!b.hasAttribute('data-t0'))b.setAttribute('data-t0',b.getAttribute('data-t'));
    b.setAttribute('data-t',hm(a)+'〜'+hm(e));
    b.style.left='calc('+pcx(a)+' + 1px)';b.style.width='calc('+pcx(T0+e-a)+' - 3px)';}
  function applyTimes(){var o=tmGet();document.querySelectorAll('.plot .bx').forEach(function(b){var v=o[b.getAttribute('data-k')];
    if(!b.hasAttribute('data-a0')){b.setAttribute('data-a0',b.getAttribute('data-a'));b.setAttribute('data-b0',b.getAttribute('data-b'));}
    if(v){setBoxTime(b,v[0],v[1]);b.classList.toggle('gone',!!v[2]);b.classList.add('tm');}});}
  applyTimes();
  // キャンセル（来なかった・時間切れ）: このiPadに保存。赤い枠で残し、席は空いている扱い
  var CKEY='seiri-cx-'+DATE;
  function cxList(){try{return JSON.parse(localStorage.getItem(CKEY)||'[]');}catch(e){return window.__seiriCx||[];}}
  function cxSave(a){window.__seiriCx=a;try{localStorage.setItem(CKEY,JSON.stringify(a));}catch(e){}}
  function cxPaint(){var a=cxList();document.querySelectorAll('.plot .bx').forEach(function(b){b.classList.toggle('cxl',a.indexOf(b.getAttribute('data-k'))>=0);});}
  cxPaint();
  setTimeout(function(){if(document.querySelector('.bx.tm,.bx.cxl'))overlaps();},50);
  // ほかの予約と時間・席がかぶるか（キャンセルは数えない）
  function clashes(id,seats,a,e){var out=[];document.querySelectorAll('.plot .bx').forEach(function(o){if(o.getAttribute('data-id')===id||o.classList.contains('cxl')||o.classList.contains('park'))return;
    var oa=+o.getAttribute('data-a'),oe=+o.getAttribute('data-b');if(!(oa<e&&a<oe))return;
    if(seatsOfBox(o).some(function(n){return seats.indexOf(n)>=0;})){var nm=((o.querySelector('.nm')||{}).textContent||'')+' 様（'+o.getAttribute('data-t')+(o.classList.contains('arr')?'・来店済み':'')+'）';if(out.indexOf(nm)<0)out.push(nm);}});return out;}
  function clashOk(list){return !list.length||window.confirm('この席は\\n'+list.join('\\n')+'\\nと時間がかぶっています。このまま置いて大丈夫ですか？');}
  function rowsOf(pl){return pl.getAttribute('data-rows').split('|');}
  function place(bx,pl,r,s){var n=+pl.getAttribute('data-n');
    var trk=pl.querySelector('.trk');if(bx.parentNode!==trk)trk.appendChild(bx);
    bx.style.top='calc('+(r/n*100)+'% + 2px)';bx.style.height='calc('+(s/n*100)+'% - 4px)';
    bx.setAttribute('data-r',r);bx.setAttribute('data-s',s);bx.classList.toggle('tall',s>1);
    var names=rowsOf(pl).slice(r,r+s),sub=bx.querySelector('.sub');
    if(!sub){sub=document.createElement('span');sub.className='sub';bx.appendChild(sub);}
    sub.textContent=names.join('+');}
  function overlaps(){document.querySelectorAll('.plot').forEach(function(pl){pl.querySelectorAll('.bx.cxl,.bx.park').forEach(function(b){b.classList.remove('ov');});var bs=[].slice.call(pl.querySelectorAll('.bx:not(.cxl):not(.park)'));
    bs.forEach(function(b){b.classList.remove('ov');});
    bs.forEach(function(a,i){var ar=a.getBoundingClientRect(),r0=+a.getAttribute('data-r'),s0=+a.getAttribute('data-s');
      bs.slice(i+1).forEach(function(b){var br=b.getBoundingClientRect(),r1=+b.getAttribute('data-r'),s1=+b.getAttribute('data-s');
        if(r0<r1+s1&&r1<r0+s0&&ar.left<br.right-2&&br.left<ar.right-2){a.classList.add('ov');b.classList.add('ov');}});});});}
  function edited(){var u=document.getElementById('undoBtn');if(u)u.style.display='';
    var m=document.querySelector('.meta');if(m&&!document.querySelector('.edn')){var e=document.createElement('div');e.className='edn';e.textContent='※ 手で動かした枠があります（黄色の点線）。動かした席は保存されます。下の来店人数の行は動かす前の数です。食べログ側の席は変わっていません。';m.parentNode.insertBefore(e,m.nextSibling);}}
  function follow(){if(!cur||!cur.moved)return;cur.bx.style.transform='translateY('+(lastY+window.scrollY-cur.py)+'px)';}


  // 名前を押したとき: 来店チェック／席を変える
  var AKEY='seiri-arr-'+DATE;
  function arrList(){try{return JSON.parse(localStorage.getItem(AKEY)||'[]');}catch(e){return window.__seiriArr||[];}}
  function arrSave(a){window.__seiriArr=a;try{localStorage.setItem(AKEY,JSON.stringify(a));}catch(e){}}
  function arrPaint(){var a=arrList();document.querySelectorAll('.plot .bx').forEach(function(b){b.classList.toggle('arr',a.indexOf(b.getAttribute('data-k'))>=0);});}
  arrPaint();

  // 確定: 今の席をこのiPadに保存し、開き直しても自動更新でも同じ並びにする
  var FKEY='seiri-fix-'+DATE;
  function fixGet(){try{return JSON.parse(localStorage.getItem(FKEY)||'null');}catch(e){return window.__seiriFix||null;}}
  function fixSet(v){window.__seiriFix=v;try{if(v)localStorage.setItem(FKEY,JSON.stringify(v));else localStorage.removeItem(FKEY);}catch(e){}}
  function allIds(){var o={};document.querySelectorAll('.plot .bx').forEach(function(b){o[b.getAttribute('data-id')]=b.getAttribute('data-k');});return o;}
  function rearm(){if(!window.__seiriGo)return;clearTimeout(window.__seiriTimer);window.__seiriTimer=setTimeout(function(){window.__seiriAuto=true;window.__seiriGo(DATE);},300000);}
  function fixUi(){var f=fixGet(),n=document.getElementById('fixNote'),u=document.getElementById('unfixBtn'),b=document.getElementById('fixBtn');
    if(n)n.textContent=f?'確定済み（'+f.at+'）':'';if(u)u.style.display=f?'':'none';if(b)b.textContent=f?'今の席で確定し直す':'この席で確定';}
  // 最初に組んだ席（動かしたかどうかの見比べ用）
  var BASE={};document.querySelectorAll('.plot .bx').forEach(function(b){var k=b.getAttribute('data-k');if(!BASE[k])BASE[k]=seatsOf(b.getAttribute('data-id')).slice().sort();});
  (function applyFix(){var f=fixGet();if(!f||!f.seats)return;var ids=allIds(),changed=0;
    Object.keys(ids).forEach(function(id){var k=ids[id],want=f.seats[k];if(!want)return;
      if(seatsOf(id).slice().sort().join()!==want.slice().sort().join()){render(id,want);changed++;}});
    document.querySelectorAll('.plot .bx.ed').forEach(function(b){b.classList.remove('ed');});
    var news=Object.keys(ids).filter(function(id){return !f.seats[ids[id]];}).length;
    overlaps();
    var m=document.querySelector('.meta');if(m){var e=document.createElement('div');e.className='edn';e.textContent='※ '+f.at+' に確定した席で表示しています。食べログ側の席は変わっていません。';m.parentNode.insertBefore(e,m.nextSibling);}})();
  fixUi();
  // 動かした席・一時置きを保存（開き直し・自動更新・ほかのタブレットでも同じにする）
  var MKEY='seiri-mv-'+DATE,PKEY='seiri-pk-'+DATE;
  function idOfK(k){var bs=document.querySelectorAll('.plot .bx');for(var i=0;i<bs.length;i++)if(bs[i].getAttribute('data-k')===k)return bs[i].getAttribute('data-id');return null;}
  (function applyMoves(){var mv=lsGet(MKEY,{}),pk=lsGet(PKEY,[]),n=0;
    Object.keys(mv).forEach(function(k){var id=idOfK(k);if(id&&mv[k]&&mv[k].length&&seatsOf(id).slice().sort().join()!==mv[k].slice().sort().join()){render(id,mv[k]);n++;}});
    pk.forEach(function(k){var id=idOfK(k);if(id)boxesOf(id).forEach(function(b){b.classList.add('park');});});
    if(n||pk.length){overlaps();setTimeout(trayPaint,0);}})();
  // 確定のあとに入った予約: 確定した並びは動かさず、空いている席へ入れる（空きがなければ一時置き）。「新」の印をつける
  (function placeNew(){var f=fixGet();if(!f||!f.seats)return;f.nw=f.nw||{};var mv=lsGet(MKEY,{}),pk=lsGet(PKEY,[]),cx=cxList(),ch=0;
    var rowsC=[],rowsT=[];document.querySelectorAll('.plot').forEach(function(pl){if(pl.classList.contains('pc'))rowsC=rowsC.concat(rowsOf(pl));else rowsT=rowsT.concat(rowsOf(pl));});
    var T2=['T1','T2','T3','T4','T5','T6','T7','T8','T9'],T4=['T10','T11','T12','T13','T14','T15','T17','T18'],BLOCKS=[['T1','T2','T3','T4'],['T5','T6','T7','T8']];
    var news=uniqBoxes().filter(function(b){var k=b.getAttribute('data-k');return !f.seats[k]&&!mv[k]&&pk.indexOf(k)<0&&cx.indexOf(k)<0;})
      .sort(function(x,y){return (+y.getAttribute('data-p'))-(+x.getAttribute('data-p'))||(+x.getAttribute('data-a'))-(+y.getAttribute('data-a'));});
    var wait={};news.forEach(function(b){wait[b.getAttribute('data-id')]=1;});
    news.forEach(function(b){var id=b.getAttribute('data-id'),k=b.getAttribute('data-k'),a=+b.getAttribute('data-a'),e=+b.getAttribute('data-b'),n=+b.getAttribute('data-p')||1,cur0=seatsOf(id);delete wait[id];
      var bz={};document.querySelectorAll('.plot .bx').forEach(function(o){var oi=o.getAttribute('data-id');if(oi===id||wait[oi]||o.classList.contains('cxl')||o.classList.contains('park'))return;var oa=+o.getAttribute('data-a'),oe=+o.getAttribute('data-b');if(oa<e&&a<oe)seatsOfBox(o).forEach(function(x){bz[x]=1;});});
      var ok=function(x){return !bz[x]&&BLK.indexOf(x)<0&&x!=='T16'&&rowsC.concat(rowsT).indexOf(x)>=0;};
      var q=b.getAttribute('data-q')||'',isC=cur0.every(function(x){return rowsC.indexOf(x)>=0;}),wantC=/カウンター/.test(q)&&!/テーブル/.test(q),want=null;
      if(cur0.length&&cur0.every(function(x){return !bz[x];}))want=cur0;
      if(!want&&!isC&&cur0.length>1&&cur0.every(function(x){return T2.indexOf(x)>=0;})){var L=cur0.length;BLOCKS.forEach(function(bl){for(var st=0;!want&&st+L<=bl.length;st++){var c=bl.slice(st,st+L);if(c.every(ok))want=c;}});}
      if(!want&&n<=4&&(!isC||(C2T==='want'&&/テーブル/.test(q)))){var pool=n<=2?T2.concat(T4):T4;for(var i=0;i<pool.length;i++)if(ok(pool[i])){want=[pool[i]];break;}}
      if(!want&&isC){var need=isC?Math.max(1,Math.min(n,cur0.length||n)):n,best=null,o0=rowsC.indexOf(cur0[0]);
        for(var st=0;st+need<=rowsC.length;st++){var c=rowsC.slice(st,st+need);if(!c.every(ok))continue;
          var sc=(st===0||ok(rowsC[st-1])?1:0)+(st+need===rowsC.length||ok(rowsC[st+need])?1:0),d=o0>=0?Math.abs(st-o0):st;
          if(!best||sc>best.sc||(sc===best.sc&&d<best.d))best={c:c,sc:sc,d:d};}
        if(best)want=best.c;}
      f.nw[k]=1;ch++;
      if(want){if(want.slice().sort().join()!==cur0.slice().sort().join())render(id,want);f.seats[k]=want;}
      else{pk.push(k);boxesOf(id).forEach(function(x){x.classList.add('park');});}});
    if(ch){fixSet(f);lsSet(PKEY,pk);}
    var msg=[];Object.keys(f.nw).forEach(function(k){var id=idOfK(k);if(!id||cx.indexOf(k)>=0)return;var bs=boxesOf(id),b0=bs[0];bs.forEach(function(x){x.classList.add('nw');x.classList.remove('ed');});
      msg.push((b0.getAttribute('data-fn')||'')+' 様 '+(b0.getAttribute('data-p')||'')+'名 '+(b0.getAttribute('data-t')||'')+' → '+(b0.classList.contains('park')?'一時置き（空き席なし・下から席を選んでください）':seatsOf(id).join('+')));});
    if(msg.length){var m=document.querySelector('.meta');if(m){var el=document.createElement('div');el.className='nwn';el.innerHTML='🆕 確定のあとに入った予約（空いている席に入れました・オレンジの枠）<br>'+msg.map(function(t){return String(t).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}).join('<br>');m.parentNode.insertBefore(el,m.nextSibling);}}
    if(ch){overlaps();setTimeout(trayPaint,0);setTimeout(function(){if(typeof shPush==='function')shPush();},300);}})();
  function saveLocal(){var mv={},pk=[];uniqBoxes().forEach(function(b){var k=b.getAttribute('data-k'),id=b.getAttribute('data-id'),cs=seatsOf(id).slice().sort();
      if(BASE[k]&&cs.join()!==BASE[k].join())mv[k]=cs;if(b.classList.contains('park'))pk.push(k);});
    lsSet(MKEY,mv);lsSet(PKEY,pk);}
  (function(){var u=document.getElementById('undoBtn');if(u)u.onclick=function(){if(!confirm('手で動かした席と一時置きを、ぜんぶ元に戻しますか？'))return;var b=items();lsSet(MKEY,{});lsSet(PKEY,[]);UNDO.push({b:b,a:items()});shPush();if(window.__seiriRedraw)window.__seiriRedraw();else location.reload();};
    if(Object.keys(lsGet(MKEY,{})).length||lsGet(PKEY,[]).length)u.style.display='';})();
  document.getElementById('fixBtn').onclick=function(){var ids=allIds(),seats={};Object.keys(ids).forEach(function(id){seats[ids[id]]=seatsOf(id);});
    var d=new Date(Date.now()+9*3600e3);fixSet({at:(d.getUTCMonth()+1)+'/'+d.getUTCDate()+' '+d.getUTCHours()+':'+String(d.getUTCMinutes()).padStart(2,'0'),seats:seats});
    document.querySelectorAll('.plot .bx.ed').forEach(function(b){b.classList.remove('ed');});var x=document.querySelector('.edn');if(x)x.parentNode.removeChild(x);
    var u=document.getElementById('undoBtn');if(u)u.style.display='none';fixUi();rearm();saveLocal();shPush();alert('この席で確定しました。閉じて開き直しても、この並びで出ます'+(shPin()?'（共有中のタブレットすべて）':'（このiPadだけ）')+'。');};
  document.getElementById('unfixBtn').onclick=function(){if(!confirm('確定をやめて、席を最初から組み直しますか？'))return;fixSet(null);lsSet(MKEY,{});lsSet(PKEY,[]);shPush(function(){if(window.__seiriRedraw)window.__seiriRedraw();else if(window.__seiriGo)window.__seiriGo(DATE);else location.reload();});return;if(window.__seiriGo)window.__seiriGo(DATE);else location.reload();};
  function openMenu(bx){var id=bx.getAttribute('data-id'),k=bx.getAttribute('data-k'),came=arrList().indexOf(k)>=0;
    var nm=bx.getAttribute('data-fn')||(bx.querySelector('.nm')||{}).textContent||'',p=+bx.getAttribute('data-p')||1,tt=bx.getAttribute('data-t')||'',q=bx.getAttribute('data-q')||'',tel=bx.getAttribute('data-tel')||'';
    var old=document.getElementById('sp');if(old)old.parentNode.removeChild(old);
    var sp=document.createElement('div');sp.id='sp';sp.dataset.t=Date.now();
    var e=function(x){return String(x).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});};
    sp.innerHTML='<div class="cd mn"><h3>'+e(nm)+' 様　'+p+'名　'+e(tt)+'</h3><p class="sm">席: '+e(seatsOf(id).join('+'))+(came?'　<b style="color:#1e7a3c">来店済み</b>':'')+'</p>'+(tel?'<a class="tel" href="tel:'+e(tel.replace(/[^0-9+]/g,''))+'">📞 '+e(tel)+'（押すと電話）</a>':'<p class="sm">電話番号: 登録なし</p>')+(q?'<p class="sm" style="color:#c45a00">要望: '+e(q)+'</p>':'')
      +'<div class="mb"><button class="arr1 '+(came?'':'ok')+'">'+(came?'来店を取り消す':'ご来店しました')+'</button><button class="gone1">お帰りになりました（今の時刻で枠を終わらせる）</button>'+(isToday()?'<button class="ext1">お帰りを15分のばす</button>':'')+'<button class="tm1">時間を変える（来店・お帰りの時刻）</button>'+(tmGet()[k]?'<button class="tm0">予約どおりの時間に戻す</button>':'')+'<button class="seat">席を変える・席を減らす／足す</button><button class="park1">一時置きにする（いったんよけて、あとで席を選ぶ）</button><button class="cx1" style="color:#c00000;border-color:#c00000">'+(cxList().indexOf(k)>=0?'キャンセルを取り消す':'キャンセルにする（来なかった・時間切れ）')+'</button><button class="cx">閉じる</button></div></div>';
    document.body.appendChild(sp);
    sp.addEventListener('click',function(ev){var t=ev.target.closest('button');if(ev.target===sp&&Date.now()-sp.dataset.t<600)return;
      if(ev.target===sp||(t&&t.classList.contains('cx'))){sp.parentNode.removeChild(sp);return;}if(!t)return;
      if(t.classList.contains('arr1')){snap();var a=arrList(),i=a.indexOf(k);if(i>=0)a.splice(i,1);else a.push(k);arrSave(a);arrPaint();sp.parentNode.removeChild(sp);return;}
      if(t.classList.contains('seat')){sp.parentNode.removeChild(sp);openPanel(bx);return;}
      if(t.classList.contains('gone1')){var d=new Date(Date.now()+9*3600e3),nw=d.getUTCHours()*60+d.getUTCMinutes();nw=Math.ceil(nw/5)*5;
        var a=+bx.getAttribute('data-a');if(nw<=a){alert('まだ来店時刻（'+hm(a)+'）より前です。時刻を選ぶときは「時間を変える」を使ってください。');return;}
        sp.parentNode.removeChild(sp);timeSet(id,k,a,nw,1);return;}
      if(t.classList.contains('tm1')){sp.parentNode.removeChild(sp);openTime(bx);return;}
      if(t.classList.contains('ext1')){var a2=+bx.getAttribute('data-a'),e2=Math.min(T1,+bx.getAttribute('data-b')+15);if(!clashOk(clashes(id,seatsOf(id),a2,e2)))return;sp.parentNode.removeChild(sp);timeSet(id,k,a2,e2,0);return;}
      if(t.classList.contains('park1')){sp.parentNode.removeChild(sp);parkSet(id,true);return;}
      if(t.classList.contains('cx1')){var c=cxList(),j=c.indexOf(k);
        if(j<0){if(!confirm(nm+' 様（'+tt+'）をキャンセルにしますか？\\n赤い枠で残り、この席は空いている扱いになります。食べログの予約は変わりません。'))return;c.push(k);}else c.splice(j,1);
        snap();cxSave(c);cxPaint();sp.parentNode.removeChild(sp);overlaps();return;}
      if(t.classList.contains('tm0')){snap();var o=tmGet();delete o[k];tmSave(o);boxesOf(id).forEach(function(b){setBoxTime(b,+b.getAttribute('data-a0'),+b.getAttribute('data-b0'));b.classList.remove('gone','tm');});
        sp.parentNode.removeChild(sp);overlaps();return;}});}
  function timeSet(id,k,a,e,gone){snap();var o=tmGet();o[k]=[a,e,gone?1:0];tmSave(o);
    boxesOf(id).forEach(function(b){setBoxTime(b,a,e);b.classList.toggle('gone',!!gone);b.classList.add('tm');});overlaps();}
  function openTime(bx){var id=bx.getAttribute('data-id'),k=bx.getAttribute('data-k'),a=+bx.getAttribute('data-a'),e=+bx.getAttribute('data-b');
    var nm=bx.getAttribute('data-fn')||(bx.querySelector('.nm')||{}).textContent||'',p=+bx.getAttribute('data-p')||1,t0=bx.getAttribute('data-t0')||bx.getAttribute('data-t');
    var old=document.getElementById('sp');if(old)old.parentNode.removeChild(old);
    var sp=document.createElement('div');sp.id='sp';sp.dataset.t=Date.now();
    function opts(lo,hi,v){var h='';for(var m=lo;m<=hi;m+=15)h+='<option value="'+m+'"'+(m===v?' selected':'')+'>'+hm(m)+'</option>';if((v-lo)%15)h+='<option value="'+v+'" selected>'+hm(v)+'</option>';return h;}
    sp.innerHTML='<div class="cd mn"><h3>'+nm+' 様　'+p+'名</h3><p class="sm">予約: '+t0+'　15分きざみで選べます。整理表の中だけの変更で、食べログの予約は変わりません。</p>'
      +'<div class="tmr"><label>来店<select class="sa">'+opts(T0,T1-15,a)+'</select></label><label>お帰り<select class="se">'+opts(T0+15,T1,e)+'</select></label></div>'
      +'<div class="ft"><button class="cx">やめる</button><button class="ok">この時間にする</button></div></div>';
    document.body.appendChild(sp);
    sp.addEventListener('click',function(ev){var t=ev.target.closest('button');if(ev.target===sp&&Date.now()-sp.dataset.t<600)return;if(ev.target===sp||(t&&t.classList.contains('cx'))){sp.parentNode.removeChild(sp);return;}if(!t)return;
      if(t.classList.contains('ok')){var na=+sp.querySelector('.sa').value,ne=+sp.querySelector('.se').value;if(ne<=na){alert('お帰りは来店より後の時刻にしてください');return;}
        if(na===a&&ne===e){sp.parentNode.removeChild(sp);return;}if(!clashOk(clashes(id,seatsOf(id),na,ne)))return;sp.parentNode.removeChild(sp);timeSet(id,k,na,ne,0);}});}
  // タップで席を選び直す（複数の席も選べる）
  function boxesOf(id){return [].slice.call(document.querySelectorAll('.bx[data-id="'+id+'"]'));}
  function seatsOfBox(b){var pl=b.closest('.plot'),r=+b.getAttribute('data-r'),s=+b.getAttribute('data-s');return rowsOf(pl).slice(r,r+s);}
  function seatsOf(id){var out=[];boxesOf(id).forEach(function(b){seatsOfBox(b).forEach(function(n){if(out.indexOf(n)<0)out.push(n);});});return out;}
  function busyMap(bx){var a=+bx.getAttribute('data-a'),e=+bx.getAttribute('data-b'),id=bx.getAttribute('data-id'),m={};
    document.querySelectorAll('.plot .bx').forEach(function(o){if(o.getAttribute('data-id')===id||o.classList.contains('cxl')||o.classList.contains('park'))return;var oa=+o.getAttribute('data-a'),oe=+o.getAttribute('data-b');
      if(oa<e&&a<oe){var nm=(o.querySelector('.nm')||{}).textContent||'';seatsOfBox(o).forEach(function(n){m[n]=nm;});}});return m;}
  function render(id,seats){var old=boxesOf(id),tpl=old[0];if(!tpl)return;
    old.forEach(function(b){b.parentNode.removeChild(b);});
    document.querySelectorAll('.plot').forEach(function(pl){var rows=rowsOf(pl),idx=seats.map(function(n){return rows.indexOf(n);}).filter(function(i){return i>=0;}).sort(function(x,y){return x-y;});
      var runs=[];idx.forEach(function(i){var l=runs[runs.length-1];if(l&&l[0]+l[1]===i)l[1]++;else runs.push([i,1]);});
      runs.forEach(function(rn){var b=tpl.cloneNode(true);b.classList.remove('held','drag','ov','park');place(b,pl,rn[0],rn[1]);b.querySelector('.sub').textContent=seats.length>1?seats.join('+'):'';b.classList.add('ed');});});}
  // 重なった所をタップ: その位置の組をぜんぶ出して選ぶ
  function pickAt(bx,x,y){var pl=bx.closest('.plot'),hits=[].slice.call(pl.querySelectorAll('.bx:not(.park)')).filter(function(b){var r=b.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});
    var ids=[],list=[];hits.forEach(function(b){var i=b.getAttribute('data-id');if(ids.indexOf(i)<0){ids.push(i);list.push(b);}});
    if(list.length<2){openMenu(bx);return;}
    var old=document.getElementById('sp');if(old)old.parentNode.removeChild(old);
    var sp=document.createElement('div');sp.id='sp';sp.dataset.t=Date.now();
    var e=function(v){return String(v).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});};
    sp.innerHTML='<div class="cd mn"><h3>どちらの組ですか？</h3><p class="sm">ここには'+list.length+'組が重なっています。</p><div class="mb">'+list.map(function(b,i){return '<button class="pk" data-i="'+i+'">'+e(b.getAttribute('data-fn')||'')+' 様　'+(b.getAttribute('data-p')||'')+'名　'+e(b.getAttribute('data-t')||'')+'　'+e(seatsOf(b.getAttribute('data-id')).join('+'))+'</button>';}).join('')+'<button class="cx">閉じる</button></div></div>';
    document.body.appendChild(sp);
    sp.addEventListener('click',function(ev){var t=ev.target.closest('button');if(ev.target===sp&&Date.now()-sp.dataset.t<600)return;if(ev.target===sp||(t&&t.classList.contains('cx'))){sp.parentNode.removeChild(sp);return;}if(!t)return;
      if(t.classList.contains('pk')){sp.parentNode.removeChild(sp);openMenu(list[+t.getAttribute('data-i')]);}});}
  // 一時置き: 枠を表からよけて、画面下の「一時置き」に並べる。タップで席を選んで戻す
  function parkSet(id,on){snap();boxesOf(id).forEach(function(b){b.classList.toggle('park',on);});if(on)edited();overlaps();trayPaint();}
  function trayPaint(){var tr=document.getElementById('tray');if(!tr){tr=document.createElement('div');tr.id='tray';document.body.appendChild(tr);
      tr.addEventListener('click',function(ev){var c=ev.target.closest('.chip');if(!c)return;var b=boxesOf(c.getAttribute('data-id'))[0];if(b)openPanel(b);});}
    var seen=[],h='';document.querySelectorAll('.plot .bx.park').forEach(function(b){var i=b.getAttribute('data-id');if(seen.indexOf(i)>=0)return;seen.push(i);
      h+='<button class="chip" data-id="'+i+'">'+(b.getAttribute('data-fn')||'')+' 様 '+(b.getAttribute('data-p')||'')+'名 '+(b.getAttribute('data-t')||'')+'</button>';});
    tr.innerHTML=seen.length?'<b>一時置き（タップで席を選ぶ）</b>'+h:'';tr.style.display=seen.length?'':'none';document.body.style.paddingBottom=seen.length?'90px':'';}
  function openPanel(bx){var id=bx.getAttribute('data-id'),cur0=seatsOf(id),sel=cur0.slice(),bz=busyMap(bx);
    var nm=bx.getAttribute('data-fn')||(bx.querySelector('.nm')||{}).textContent||'',p=+bx.getAttribute('data-p')||1,tt=bx.getAttribute('data-t')||'';
    var old=document.getElementById('sp');if(old)old.parentNode.removeChild(old);
    var sp=document.createElement('div');sp.id='sp';
    sp.dataset.t=Date.now();var html='<div class="cd"><h3>'+nm+' 様　'+p+'名　'+tt+'</h3><p class="sm">座る席をタップして選んでください（いくつでも選べます）。もう一度タップで外れます。点線の席は同じ時間に別の予約があります。</p>';
    var groups=[];document.querySelectorAll('.plot').forEach(function(pl){groups.push({lab:pl.classList.contains('pc')?'カウンター':'テーブル・個室',rows:rowsOf(pl)});});
    groups.forEach(function(g){html+='<div class="gl">'+g.lab+'</div><div class="gs">';g.rows.forEach(function(n){html+='<button class="st" data-n="'+n.replace(/"/g,'&quot;')+'">'+n+(bz[n]?'<small>'+bz[n]+'</small>':'')+'</button>';});html+='</div>';});
    html+='<div class="now"></div><div class="ft">'+(bx.classList.contains('park')?'<button class="unpark">元の席に戻す</button>':'')+'<button class="cx">やめる</button><button class="ok">この席にする</button></div></div>';
    sp.innerHTML=html;document.body.appendChild(sp);
    function paint(){[].forEach.call(sp.querySelectorAll('.st'),function(b){var n=b.getAttribute('data-n');b.classList.toggle('on',sel.indexOf(n)>=0);b.classList.toggle('bz',!!bz[n]&&sel.indexOf(n)<0);});
      sp.querySelector('.now').textContent='えらんだ席: '+(sel.length?sel.join('+'):'なし')+'（今: '+cur0.join('+')+'）';}
    paint();
    sp.addEventListener('click',function(ev){var t=ev.target.closest('button');if(ev.target===sp&&Date.now()-sp.dataset.t<600)return;if(ev.target===sp||(t&&t.classList.contains('cx'))){sp.parentNode.removeChild(sp);return;}if(!t)return;
      if(t.classList.contains('unpark')){sp.parentNode.removeChild(sp);parkSet(id,false);return;}
      if(t.classList.contains('st')){var n=t.getAttribute('data-n'),i=sel.indexOf(n);if(i>=0)sel.splice(i,1);else sel.push(n);paint();return;}
      if(t.classList.contains('ok')){if(!sel.length){alert('席を1つ以上えらんでください');return;}
        var all=[];groups.forEach(function(g){g.rows.forEach(function(n){if(sel.indexOf(n)>=0)all.push(n);});});
        if(all.slice().sort().join()===cur0.slice().sort().join()){sp.parentNode.removeChild(sp);return;}if(!clashOk(clashes(id,all,+bx.getAttribute('data-a'),+bx.getAttribute('data-b'))))return;sp.parentNode.removeChild(sp);snap();render(id,all);edited();overlaps();arrPaint();trayPaint();}});}
  // ===== 営業中のお知らせ（退席10分前・未着・空く席・新しい予約）と1つ戻す =====
  function jstNow(){var d=new Date(Date.now()+9*3600e3);return {ds:d.toISOString().slice(0,10),m:d.getUTCHours()*60+d.getUTCMinutes()};}
  function nowM(){return window.__seiriNow!=null?window.__seiriNow:jstNow().m;}
  function isToday(){return window.__seiriToday!=null?!!window.__seiriToday:jstNow().ds===DATE;}
  function lsGet(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){var m=window.__seiriLs||{};return k in m?m[k]:d;}}
  function lsSet(k,v){window.__seiriLs=window.__seiriLs||{};window.__seiriLs[k]=v;try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
  function esc2(x){return String(x).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function uniqBoxes(){var seen={},out=[];document.querySelectorAll('.plot .bx').forEach(function(b){var i=b.getAttribute('data-id');if(seen[i])return;seen[i]=1;out.push(b);});return out;}
  function surname(b){return (b.querySelector('.nm')||{}).textContent||'';}
  // 音（iPadは画面を1回さわってから鳴らせる）
  var SKEY='seiri-sound';
  function soundOn(){return lsGet(SKEY,1)!==0;}
  document.addEventListener('pointerdown',function(){var C=window.AudioContext||window.webkitAudioContext;if(!C)return;try{if(!window.__seiriAC)window.__seiriAC=new C();if(window.__seiriAC.state==='suspended')window.__seiriAC.resume();}catch(e){}},true);
  function beep(n){var A=window.__seiriAC;if(!A||!soundOn())return;try{for(var i=0;i<(n||2);i++){var o=A.createOscillator(),g=A.createGain(),t=A.currentTime+i*0.35;o.type='sine';o.frequency.value=880;o.connect(g);g.connect(A.destination);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.4,t+0.02);g.gain.exponentialRampToValueAtTime(0.0001,t+0.25);o.start(t);o.stop(t+0.3);}}catch(e){}}
  var BKEY='seiri-beep-'+DATE,SEENKEY='seiri-seen-'+DATE,NEWSKEY='seiri-news-'+DATE;
  // 新しい予約・キャンセル: 前に開いたとき（自動更新を含む）との差を出す
  (function diff(){var now={};uniqBoxes().forEach(function(b){var k=b.getAttribute('data-k'),p=k.split('|');now[k]=p[0]+' '+String(p[1]||'').split(' ')[0]+' 様 '+(p[2]||'')+'名（'+(b.classList.contains('park')?'一時置き':seatsOf(b.getAttribute('data-id')).join('+'))+'）';});
    var prev=lsGet(SEENKEY,null),news=lsGet(NEWSKEY,[]),add=0;
    if(prev){Object.keys(now).forEach(function(k){if(!prev[k]){news.push({t:'new',s:now[k],at:hm(nowM())});add++;}});Object.keys(prev).forEach(function(k){if(!now[k]){news.push({t:'del',s:prev[k],at:hm(nowM())});add++;}});}
    lsSet(SEENKEY,now);lsSet(NEWSKEY,news.slice(-20));if(add)beep(1);})();
  // 1つ戻す
  // 1つ戻す（自分が変えた所だけを戻す。ほかのタブレットの変更は戻さない。描き直しても覚えておく）
  if(window.__seiriUndoDate!==DATE){window.__seiriUndo=[];window.__seiriUndoDate=DATE;}
  var UNDO=window.__seiriUndo;
  function snap(){var e={b:items(),a:null};UNDO.push(e);if(UNDO.length>20)UNDO.shift();setTimeout(function(){saveLocal();e.a=items();tick();shPush();},30);}
  function undo(){var e=UNDO.pop();if(!e)return;var a=e.a||items(),b=e.b,ks={},need='';
    Object.keys(a).concat(Object.keys(b)).forEach(function(k){if(!same(a[k],b[k]))ks[k]=1;});
    Object.keys(ks).forEach(function(k){var w=setItem(k,k in b?b[k]:null);if(w==='full')need='full';else if(w&&!need)need='lite';});
    shPush();if(need==='full'){if(window.__seiriRedraw)window.__seiriRedraw();}else{lite();trayPaint();}}
  // ④ 時間ごとの来店予定（30分ごと・席ごと）
  function nsort(a,b){var x=a.replace(/\\d+/g,function(d){return ('000'+d).slice(-4);}),y=b.replace(/\\d+/g,function(d){return ('000'+d).slice(-4);});return x<y?-1:x>y?1:0;}
  function r4(){var el=document.getElementById('yotei');if(!el)return;var arr=arrList(),cx=cxList(),sl={},n=nowM(),today=isToday();
    uniqBoxes().forEach(function(b){var k=b.getAttribute('data-k');if(cx.indexOf(k)>=0||b.classList.contains('park'))return;
      var id=b.getAttribute('data-id'),a=+b.getAttribute('data-a'),m=a-a%30,c=[],t=[];
      boxesOf(id).forEach(function(x){var L=x.closest('.plot.pc')?c:t;seatsOfBox(x).forEach(function(s){if(L.indexOf(s)<0)L.push(s);});});
      c.sort(nsort);t.sort(nsort);
      (sl[m]=sl[m]||[]).push({id:id,c:c,t:t,nm:surname(b),p:+b.getAttribute('data-p'),came:arr.indexOf(k)>=0,late:b.classList.contains('late')});});
    var ms=Object.keys(sl).map(Number).sort(function(x,y){return x-y;}),nowM30=n-n%30,h='';
    if(!ms.length){el.innerHTML='<div class="meta">予約はありません</div>';return;}
    function chip(g,list){var p=g.p<=1?'p1':g.p===2?'p2':'p3';return '<button class="sc '+p+(g.came?' came':'')+(g.late&&!g.came?' late':'')+'" data-id="'+esc2(g.id)+'"><span>'+list.map(function(x){return '<span class="sn">'+esc2(x)+'</span>';}).join('・')+'</span><small>'+esc2(g.nm)+' '+g.p+'名</small></button>';}
    ms.forEach(function(m){var G=sl[m].slice().sort(function(x,y){return nsort((x.t[0]||x.c[0]||''),(y.t[0]||y.c[0]||''));}),
      ppl=G.reduce(function(s,g){return s+g.p;},0),done=G.filter(function(g){return g.came;}),
      T=G.filter(function(g){return g.t.length;}),C=G.filter(function(g){return g.c.length;});
      var cls=today&&m===nowM30?' now':(today&&m===nowM30+30?' next':'');
      h+='<div class="sl'+cls+'"'+(cls===' now'?' id="y4now"':'')+'><div class="tm">'+hm(m)+'<small>'+G.length+'組 '+ppl+'名'+(done.length?'<br>来店 '+done.length+'組':'')+'</small></div>'
        +(T.length?'<div class="ar">テーブル</div>'+T.map(function(g){return chip(g,g.t);}).join(''):'')
        +(C.length?'<div class="ar">カウンター</div>'+C.map(function(g){return chip(g,g.c);}).join(''):'')+'</div>';});
    var sx=(el.querySelector('.cl4')||{}).scrollLeft||0,first=!el.querySelector('.cl4');
    el.innerHTML='<div class="cl4">'+h+'</div>';var cl=el.querySelector('.cl4'),nw=document.getElementById('y4now');
    if(first&&nw)cl.scrollLeft=Math.max(0,nw.offsetLeft-cl.offsetLeft-8);else cl.scrollLeft=sx;}
  document.addEventListener('click',function(ev){var t=ev.target.closest&&ev.target.closest('#yotei .sc');if(!t)return;
    var b=boxesOf(t.getAttribute('data-id'))[0];if(!b)return;var k=b.getAttribute('data-k');snap();var a=arrList(),i=a.indexOf(k);if(i>=0)a.splice(i,1);else a.push(k);arrSave(a);arrPaint();r4();});
  // 20秒ごとに見直す
  function tick(){var bar=document.getElementById('alerts');
    if(!bar){bar=document.createElement('div');bar.id='alerts';document.body.insertBefore(bar,document.body.firstChild);bar.addEventListener('click',onBar);}
    var today=isToday(),n=nowM(),soon=[],late=[],free=[],emptyNow=0,news=lsGet(NEWSKEY,[]);
    document.querySelectorAll('.plot .bx.soon,.plot .bx.late').forEach(function(b){b.classList.remove('soon','late');});
    document.querySelectorAll('.nowl').forEach(function(l){l.parentNode.removeChild(l);});
    document.querySelectorAll('.bigt tr.nowr,.bigt tr.nextr').forEach(function(r){r.classList.remove('nowr','nextr');});
    if(today){var arr=arrList(),cx=cxList(),beeped=lsGet(BKEY,[]),ring=false;
      uniqBoxes().forEach(function(b){var k=b.getAttribute('data-k'),id=b.getAttribute('data-id');if(cx.indexOf(k)>=0||b.classList.contains('park')||b.classList.contains('gone'))return;
        var a=+b.getAttribute('data-a'),e=+b.getAttribute('data-b'),came=arr.indexOf(k)>=0,key=null;
        if(n>=e-10&&n<e+15){soon.push(b);boxesOf(id).forEach(function(x){x.classList.add('soon');});key='A|'+k+'|'+e;}
        else if(!came&&n>=a+10&&n<e){late.push(b);boxesOf(id).forEach(function(x){x.classList.add('late');});key='B|'+k;}
        if(key&&beeped.indexOf(key)<0){beeped.push(key);ring=true;}});
      if(ring){lsSet(BKEY,beeped.slice(-300));beep(2);}
      var occ={};document.querySelectorAll('.plot .bx').forEach(function(b){if(cx.indexOf(b.getAttribute('data-k'))>=0||b.classList.contains('park'))return;var a=+b.getAttribute('data-a'),e=+b.getAttribute('data-b');seatsOfBox(b).forEach(function(s){(occ[s]=occ[s]||[]).push([a,e]);});});
      document.querySelectorAll('.plot').forEach(function(pl){rowsOf(pl).forEach(function(s){var L=occ[s]||[],c=L.filter(function(x){return x[0]<=n&&n<x[1];});
        if(!c.length){emptyNow++;return;}var e=Math.max.apply(null,c.map(function(x){return x[1];}));
        if(e<=n+30)free.push({s:s,e:e,nx:L.some(function(x){return x[0]>=e&&x[0]<e+30;})});});});
      free.sort(function(x,y){return x.e-y.e;});
      if(n>=T0&&n<=T1)document.querySelectorAll('.plot .trk').forEach(function(t){var l=document.createElement('div');l.className='nowl';l.style.left=pcx(n);t.appendChild(l);});
      var rows=[].slice.call(document.querySelectorAll('.bigt tr[data-m]')),hit=-1;rows.forEach(function(r,i){var m=+r.getAttribute('data-m');if(m<=n&&n<m+30)hit=i;});
      if(hit>=0){rows[hit].classList.add('nowr');if(rows[hit+1])rows[hit+1].classList.add('nextr');}
      else{var nx=rows.filter(function(r){return +r.getAttribute('data-m')>n;})[0];if(nx)nx.classList.add('nextr');}}
    r4();
    if(!today&&!news.length&&!UNDO.length){bar.innerHTML='';return;}
    var h='';
    if(today){h+='<b class="clk">'+hm(n)+'</b>';
      var OP=window.__seiriOpen=window.__seiriOpen||{};
      function grp(key,cls,label,items,unit){if(!items.length)return '';var big=items.length>3,open=!big||OP[key];
        return '<span class="lb '+cls+'">'+label+'</span>'+(big?'<button class="tg" data-g="'+key+'">'+items.length+unit+(open?' ▲':' ▼')+'</button>':'')+(open?items.join(''):'');}
      h+=grp('so','so','退席10分前',soon.map(function(b){var e=+b.getAttribute('data-b');return '<button class="ch so" data-id="'+esc2(b.getAttribute('data-id'))+'">'+esc2(seatsOf(b.getAttribute('data-id')).join('+'))+' '+esc2(surname(b))+' 様 '+(e>n?'あと'+(e-n)+'分':(n===e?'時間です':(n-e)+'分すぎ'))+'</button>';}),'組');
      h+=grp('la','la','未着',late.map(function(b){return '<button class="ch la" data-id="'+esc2(b.getAttribute('data-id'))+'">'+esc2(seatsOf(b.getAttribute('data-id')).join('+'))+' '+esc2(surname(b))+' 様 '+hm(+b.getAttribute('data-a'))+'</button>';}),'組');
      var fr=free.filter(function(f){return !f.nx;});
      h+='<span class="lb fr">いま空き '+emptyNow+'席</span>'+grp('fr','fr','30分以内に空く',fr.map(function(f){return '<span class="fs">'+esc2(f.s)+' '+hm(f.e)+'</span>';}),'席');}
    news.forEach(function(x,i){h+='<span class="nw '+x.t+'">'+(x.t==='new'?'新しい予約':'食べログでキャンセル')+'（'+esc2(x.at)+'）：'+esc2(x.s)+'<button class="nx" data-i="'+i+'" aria-label="消す">×</button></span>';});
    h+='<span class="rt"><button class="und"'+(UNDO.length?'':' disabled')+'>↩ 1つ戻す</button>'+(today?'<button class="snd">'+(soundOn()?'🔔 音あり':'🔕 音なし')+'</button>':'')+'</span>';
    bar.innerHTML=h;}
  function onBar(ev){var t=ev.target.closest('button');if(!t)return;
    if(t.classList.contains('ch')){var b=boxesOf(t.getAttribute('data-id'))[0];if(b)openMenu(b);return;}
    if(t.classList.contains('nx')){var a=lsGet(NEWSKEY,[]);a.splice(+t.getAttribute('data-i'),1);lsSet(NEWSKEY,a);tick();return;}
    if(t.classList.contains('und')){undo();return;}
    if(t.classList.contains('tg')){var g=t.getAttribute('data-g'),O=window.__seiriOpen=window.__seiriOpen||{};O[g]=!O[g];tick();return;}
    if(t.classList.contains('snd')){lsSet(SKEY,soundOn()?0:1);if(soundOn())beep(1);tick();return;}}
  clearInterval(window.__seiriTick);window.__seiriTick=setInterval(tick,20000);setTimeout(tick,60);
  // ---- タブレット共有（Supabase） ----
  var SHU='https://qflnjyqkuczadlutvrxs.supabase.co',SHK='sb_publishable_3dbrAMr925n4HB31i-hdbg_P-SE3FLB',SYK='seiri-sync-'+DATE;
  function shPin(){return lsGet('seiri-pin','');}
  function rpc(fn,args){return fetch(SHU+'/rest/v1/rpc/'+fn,{method:'POST',headers:{'apikey':SHK,'Authorization':'Bearer '+SHK,'Content-Type':'application/json'},body:JSON.stringify(args)}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});}
  function items(){var o={};arrList().forEach(function(k){o['a:'+k]=1;});cxList().forEach(function(k){o['c:'+k]=1;});var t=tmGet();Object.keys(t).forEach(function(k){o['t:'+k]=t[k];});
    var mv=lsGet(MKEY,{});Object.keys(mv).forEach(function(k){o['m:'+k]=mv[k];});lsGet(PKEY,[]).forEach(function(k){o['p:'+k]=1;});var f=fixGet();if(f)o.fix=f;return o;}
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function syGet(){return lsGet(SYK,{rev:0,last:null});}
  function shSt(t,c){var e=document.getElementById('shSt');if(e){e.textContent=t;e.style.color=c||'#1e7a3c';}}
  var shBusy=false,shAgain=false,shCbs=[];
  function shPush(cb){if(cb)shCbs.push(cb);var pin=shPin();if(!pin){var q=shCbs;shCbs=[];q.forEach(function(f){f();});return;}
    if(shBusy){shAgain=true;return;}var sy=syGet();if(!sy.last){var q2=shCbs;shCbs=[];q2.forEach(function(f){f();});return;}
    var cur=items(),diff={},n=0;Object.keys(cur).forEach(function(k){if(!same(cur[k],sy.last[k])){diff[k]=cur[k];n++;}});Object.keys(sy.last).forEach(function(k){if(!(k in cur)&&sy.last[k]!=null){diff[k]=null;n++;}});
    if(!n){var q3=shCbs;shCbs=[];q3.forEach(function(f){f();});return;}
    shBusy=true;rpc('seiri_set',{p_pin:pin,p_d:DATE,p_items:diff}).then(function(r){shBusy=false;if(r===-1){shBad();return;}
      var s2=syGet();s2.last=s2.last||{};Object.keys(diff).forEach(function(k){if(diff[k]==null)delete s2.last[k];else s2.last[k]=diff[k];});lsSet(SYK,s2);shSt('🔗 共有中');
      var q=shCbs;shCbs=[];q.forEach(function(f){f();});if(shAgain){shAgain=false;shPush();}})
    .catch(function(){shBusy=false;shSt('🔗 つながっていません（あとで送ります）','#c62828');var q=shCbs;shCbs=[];q.forEach(function(f){f();});});}
  function shBad(){lsSet('seiri-pin','');shSt('🔗 暗証番号がちがいます','#c62828');}
  function setItem(k,v){var c=k.charAt(0),key=k.slice(2);
    if(k==='fix'){fixSet(v||null);return 'full';}
    if(c==='a'){var a=arrList(),i=a.indexOf(key);if(v&&i<0)a.push(key);if(!v&&i>=0)a.splice(i,1);arrSave(a);return 'lite';}
    if(c==='c'){var x=cxList(),j=x.indexOf(key);if(v&&j<0)x.push(key);if(!v&&j>=0)x.splice(j,1);cxSave(x);return 'lite';}
    if(c==='t'){var o=tmGet();if(v)o[key]=v;else delete o[key];tmSave(o);return 'lite';}
    if(c==='m'){var m=lsGet(MKEY,{});if(v)m[key]=v;else delete m[key];lsSet(MKEY,m);return 'full';}
    if(c==='p'){var p=lsGet(PKEY,[]),q=p.indexOf(key);if(v&&q<0)p.push(key);if(!v&&q>=0)p.splice(q,1);lsSet(PKEY,p);return 'full';}
    return '';}
  function lite(){document.querySelectorAll('.plot .bx').forEach(function(b){if(b.hasAttribute('data-a0'))setBoxTime(b,+b.getAttribute('data-a0'),+b.getAttribute('data-b0'));b.classList.remove('gone','tm');});
    applyTimes();cxPaint();arrPaint();overlaps();tick();}
  var shWantFull=false;
  function busyUi(){return !!document.getElementById('sp')||!!cur;}
  function full(){if(busyUi()){shWantFull=true;return;}shWantFull=false;if(window.__seiriRedraw)window.__seiriRedraw();}
  function shPull(){var pin=shPin();if(!pin)return;var sy=syGet();
    rpc('seiri_pull',{p_pin:pin,p_d:DATE,p_since:sy.last?sy.rev:0,p_snap_at:window.__seiriSnapAt||null}).then(function(r){
      if(!r||r.err){shBad();return;}var first=!sy.last,s2=syGet(),need='';s2.last=s2.last||{};
      if(first){var loc=items(),remote={};}
      (r.marks||[]).forEach(function(m){if(first)remote[m.k]=1;var v=m.v==null?null:m.v,mine=items()[m.k];
        if(!same(v,mine===undefined?null:mine)){var w=setItem(m.k,v);if(w==='full')need='full';else if(w&&!need)need='lite';}
        if(v==null)delete s2.last[m.k];else s2.last[m.k]=v;});
      s2.rev=Math.max(s2.rev||0,r.rev||0);lsSet(SYK,s2);
      if(first){var add=0;Object.keys(loc).forEach(function(k){if(!remote[k]){setItem(k,loc[k]);add++;}});if(add){need=need||'lite';}}
      shSt('🔗 共有中');
      if(r.snap&&window.__seiriOnSnap){if(!busyUi())window.__seiriOnSnap(r.snap,r.snap_at);return;}
      if(need==='full')full();else if(need==='lite')lite();
      if(first)shPush();})
    .catch(function(){shSt('🔗 つながっていません','#c62828');});}
  document.getElementById('shBtn').onclick=function(){var pin=shPin();
    if(pin){if(confirm('このタブレットの共有をやめますか？（印はこのタブレットに残ります）')){lsSet('seiri-pin','');shSt('');}return;}
    var v=window.prompt('タブレット共有の暗証番号（6桁）を入れてください','');if(!v)return;v=String(v).replace(/[^0-9]/g,'');
    lsSet('seiri-pin',v);lsSet(SYK,{rev:0,last:null});shSt('🔗 つないでいます…','#555');
    if(window.__seiriPushSnap)window.__seiriPushSnap();shPull();};
  // 最終更新の時刻。古くなったら赤。食べログノートのタブレットは開き直したらすぐ読み直す
  function madeAge(){var t=(MADE.split(' ')[1]||'').split(':');if(t.length<2||!isToday())return 0;return jstNow().m-(+t[0]*60+ +t[1]);}
  function updPaint(){var u=document.getElementById('upd');if(!u)return;var ag=madeAge(),old=ag>=10;u.className=old?'old':'';
    u.textContent='最終更新 '+(MADE.split(' ')[1]||'')+(old?(CHILD?'（更新が止まっています。食べログノートのタブレットの画面をつけてください）':'（読み直しています…）'):'');
    if(old&&!CHILD&&window.__seiriGo&&!busyUi()&&document.visibilityState!=='hidden'&&!window.__seiriReloading){window.__seiriReloading=1;setTimeout(function(){window.__seiriReloading=0;},60000);window.__seiriAuto=true;window.__seiriGo(DATE);}}
  updPaint();clearInterval(window.__seiriUpd);window.__seiriUpd=setInterval(updPaint,30000);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState!=='visible')return;
    if(!CHILD&&window.__seiriGo&&madeAge()>=2&&!busyUi()){window.__seiriAuto=true;window.__seiriGo(DATE);return;}shPull();updPaint();});
  clearInterval(window.__seiriSh);window.__seiriSh=setInterval(function(){if(shWantFull&&!busyUi()){full();return;}shPull();},5000);
  if(shPin()){shSt('🔗 共有中');setTimeout(shPull,200);}
  var HOLD=500;
  function cancel(){clearTimeout(cur&&cur.ht);clearInterval(timer);if(cur){cur.bx.classList.remove('drag','held');cur.bx.style.transform='';}cur=null;}
  document.addEventListener('pointerdown',function(ev){var bx=ev.target.closest&&ev.target.closest('.bx');if(!bx||!bx.closest('.plot'))return;
    var br=bx.getBoundingClientRect();cur={bx:bx,py:ev.clientY+window.scrollY,sy:ev.clientY,sx:ev.clientX,grab:ev.clientY-br.top,moved:false,held:false,id:ev.pointerId};lastY=ev.clientY;
    cur.ht=setTimeout(function(){if(!cur)return;cur.held=true;cur.bx.classList.add('held');try{cur.bx.setPointerCapture(cur.id);}catch(e){}
      if(navigator.vibrate)navigator.vibrate(30);
      timer=setInterval(function(){if(!cur||!cur.moved)return;var h=window.innerHeight;
        if(lastY>h-70){window.scrollBy(0,14);follow();}else if(lastY<70){window.scrollBy(0,-14);follow();}},16);},HOLD);});
  document.addEventListener('touchmove',function(ev){if(cur&&cur.held)ev.preventDefault();},{passive:false});
  document.addEventListener('pointermove',function(ev){if(!cur)return;lastY=ev.clientY;
    if(!cur.held){if(Math.abs(ev.clientY-cur.sy)>8||Math.abs(ev.clientX-cur.sx)>8)cancel();return;}
    if(!cur.moved&&Math.abs(ev.clientY+window.scrollY-cur.py)<6)return;
    if(!cur.moved){cur.moved=true;cur.bx.classList.add('drag');}follow();});
  function end(ev){clearTimeout(cur&&cur.ht);clearInterval(timer);if(!cur)return;var c=cur;cur=null;c.bx.classList.remove('drag','held');c.bx.style.transform='';if(!c.held&&!c.moved&&!c.cx){pickAt(c.bx,c.sx,c.sy);return;}if(!c.held||!c.moved)return;
    var y=lastY,tg=null;document.querySelectorAll('.plot').forEach(function(pl){var r=pl.getBoundingClientRect();if(y>=r.top-10&&y<=r.bottom+10)tg=pl;});
    if(!tg)return;
    var src=c.bx.closest('.plot'),s=+c.bx.getAttribute('data-s'),p=+c.bx.getAttribute('data-p')||1;
    if(tg!==src){s=tg.classList.contains('pc')?Math.max(1,p):(p>4?2:1);}
    var n=+tg.getAttribute('data-n'),rect=tg.getBoundingClientRect(),rh=rect.height/n;
    var r=Math.max(0,Math.min(n-s,Math.round((y-c.grab-rect.top)/rh)));
    if(tg===src&&r===+c.bx.getAttribute('data-r'))return;
    var nm=(c.bx.querySelector('.nm')||{}).textContent||'',from=rowsOf(src).slice(+c.bx.getAttribute('data-r'),+c.bx.getAttribute('data-r')+(+c.bx.getAttribute('data-s'))).join('+'),to=rowsOf(tg).slice(r,r+s).join('+');
    var cl=clashes(c.bx.getAttribute('data-id'),rowsOf(tg).slice(r,r+s),+c.bx.getAttribute('data-a'),+c.bx.getAttribute('data-b'));
    setTimeout(function(){if(!window.confirm(nm+' 様を\\n'+from+' → '+to+'\\nに移しますか？'+(cl.length?'\\n\\n※ '+cl.join('、')+' と時間がかぶっています。かぶったままで大丈夫ですか？':'')))return;
      snap();place(c.bx,tg,r,s);c.bx.classList.add('ed');edited();overlaps();},30);}
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',function(){if(cur&&!cur.held)cancel();else end();});
})();
</script>
</body></html>`;
}

(async () => {
  const Q = `query SeatSelection($date: Date!) { seats { id name displayOrder seatType { name } onlineBookingBlockings(date: $date) { id } } calendarDate(date: $date) { officeHour { dinnerTimeFrom dinnerTimeTo lunchTimeFrom lunchTimeTo } } bookings(visitDate: $date) { edges { node { id bookingStatus timeFrom timeTo numberOfPeople numberOfChildren telephoneNumber lastNameKana firstNameKana lastName firstName seats { name } requestsAndComments memo } } } }`;
  if (location.host !== 'owner.tabelog.com') { alert('食べログノート（owner.tabelog.com）を開いてから押してください'); return; }
  const m = location.pathname.match(/(\d{4}-\d{2}-\d{2})/);
  const jst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const date = window.__seiriDate || (m ? m[1] : jst);
  const auto = !!window.__seiriAuto; // 自動更新のときは画面を隠さず、スクロール位置を保つ
  window.__seiriDate = null; window.__seiriAuto = false;
  clearTimeout(window.__seiriTimer);
  const a = [...document.querySelectorAll('a[href*="tabelog.com/"]')].map(x => (x.href.match(/tabelog\.com\/[a-z]+\/A\d+\/A\d+\/(\d+)/) || [])[1]).find(Boolean);
  let rid = a || window.__seiriRid;
  if (!rid) { // 画面にリンクが出ていないときは、店舗トップから拾う
    try { const t = await (await fetch('/owner_rst/top/', { credentials: 'include' })).text(); rid = (t.match(/tabelog\.com\/[a-z]+\/A\d+\/A\d+\/(\d+)/) || [])[1]; } catch (e) {}
  }
  if (!rid) { alert('お店の番号が読み取れませんでした。食べログノートのタイムスケジュールを開いて、画面がすべて出てからもう一度押してください'); return; }
  window.__seiriRid = rid;
  // 日付を変えて読み直す（整理表の画面の中から呼ぶ）
  window.__seiriGo = function (v) {
    let d = v;
    if (typeof v === 'number') { if (v === 0) d = jst; else { const t = new Date(date + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + v); d = t.toISOString().slice(0, 10); } }
    window.__seiriDate = d;
    const s = document.createElement('script'); s.src = 'https://replus-tanaoroshi.vercel.app/seiri/seiri.js?' + Date.now(); document.body.appendChild(s);
  };
  // 1か月分、指定の時間帯にかかる予約を調べる（中休みにしてよいかの確認用）
  window.__seiriMonth = async function () {
    const def = date.slice(0, 7) + ' 15:00-17:00';
    const ans = window.prompt('調べる月と時間帯を入れてください（例: 2026-12 15:00-17:00）', def);
    if (!ans) return;
    const mm = ans.match(/(\d{4})-(\d{1,2})\s+(\d{1,2}):(\d{2})\s*[-〜~]\s*(\d{1,2}):(\d{2})/);
    if (!mm) { alert('書き方がちがいます。例: 2026-12 15:00-17:00'); return; }
    const y = +mm[1], mo = +mm[2], f = +mm[3] * 60 + +mm[4], t = +mm[5] * 60 + +mm[6];
    const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const QM = `query SeatSelection($date: Date!) { bookings(visitDate: $date) { edges { node { bookingStatus timeFrom timeTo numberOfPeople lastNameKana lastName seats { name } } } } }`;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;overflow:auto;padding:16px;font:15px sans-serif;color:#222';
    box.innerHTML = '<p>調べています… <span id="smp">0</span>/' + days + '日</p>'; document.body.appendChild(box);
    const tm = x => +x.slice(0, 2) * 60 + +x.slice(3, 5);
    const lines = [], esc = x => String(x).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    let hitN = 0, hitP = 0, err = '';
    for (let d = 1; d <= days; d++) {
      const ds = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      try {
        const r = await fetch('/graphql', { method: 'POST', credentials: 'include', headers: { 'accept': 'application/graphql-response+json,application/json;q=0.9', 'content-type': 'application/json', 'x-restaurant-id': rid, 'x-from': location.origin }, body: JSON.stringify({ operationName: 'SeatSelection', variables: { date: ds }, query: QM }) });
        const j = await r.json(); if (!j.data) throw new Error(JSON.stringify(j.errors || j).slice(0, 120));
        const bs = j.data.bookings.edges.map(e => e.node).filter(n => !/CANCEL/.test(n.bookingStatus || '') && tm(n.timeFrom) < t && tm(n.timeTo) > f)
          .sort((a, b) => tm(a.timeFrom) - tm(b.timeFrom));
        if (bs.length) { hitN += bs.length; hitP += bs.reduce((a, n) => a + n.numberOfPeople, 0);
          lines.push(ds.slice(5) + '（' + '日月火水木金土'[new Date(ds + 'T00:00:00').getDay()] + '） ' + bs.length + '組: ' + bs.map(n => n.timeFrom.slice(0, 5) + '〜' + n.timeTo.slice(0, 5) + ' ' + (n.lastNameKana || n.lastName || '') + '様 ' + n.numberOfPeople + '名 ' + n.seats.map(s => s.name).join('+')).join(' ／ ')); }
      } catch (e) { err = String(e.message || e); lines.push(ds.slice(5) + ' 読めませんでした'); }
      const c = document.getElementById('smp'); if (c) c.textContent = d;
    }
    const head = y + '年' + mo + '月 ' + mm[3] + ':' + mm[4] + '〜' + mm[5] + ':' + mm[6] + ' にかかる予約: ' + hitN + '組 ' + hitP + '名';
    const txt = head + '\n' + (lines.length ? lines.join('\n') : '（ありません）');
    box.innerHTML = '<h2 style="font-size:20px;margin:0 0 8px">' + esc(head) + '</h2>' + (err ? '<p style="color:#c00">一部読めませんでした: ' + esc(err) + '</p>' : '')
      + '<p><button id="smc" style="font-size:15px;padding:6px 14px">この結果をコピー</button> <button id="smx" style="font-size:15px;padding:6px 14px">閉じる</button></p>'
      + '<pre style="white-space:pre-wrap;font:15px/1.7 sans-serif">' + esc(lines.length ? lines.join('\n') : 'この時間帯にかかる予約はありません。') + '</pre>';
    document.getElementById('smx').onclick = () => box.remove();
    document.getElementById('smc').onclick = () => { navigator.clipboard.writeText(txt).then(() => alert('コピーしました。つむぎに貼りつけて送ってください'), () => alert('コピーできませんでした。画面の文字を長押しで選んでコピーしてください')); };
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
      bookings: d.bookings.edges.map(e => e.node).map(n => ({ from: n.timeFrom, to: n.timeTo, name: (n.lastNameKana || n.lastName || '') + ' ' + (n.firstNameKana || n.firstName || ''), n: n.numberOfPeople, kids: n.numberOfChildren || 0, tel: n.telephoneNumber || '', seats: n.seats.map(s => s.name), status: n.bookingStatus, req: n.requestsAndComments, memo: n.memo }))
    };
    norm.parent = true; window.__seiriNorm = norm;
    // 開いたまま描き直す（ほかのタブレットで席を動かしたときなど）
    window.__seiriRedraw = function () { const x = window.scrollX, y = window.scrollY; w.document.open(); w.document.write(seiriBuild(window.__seiriNorm)); w.document.close(); window.scrollTo(x, y); };
    // 共有中なら、その日の予約をSupabaseへ送る（ほかのタブレットは食べログを開かなくても見られる）
    window.__seiriPushSnap = function () {
      let pin = ''; try { pin = JSON.parse(localStorage.getItem('seiri-pin') || '""'); } catch (e) {}
      if (!pin) return;
      const n = window.__seiriNorm, data = {}; Object.keys(n).forEach(k => { if (!/^(navJs|reloadJs|autoNote|parent)$/.test(k)) data[k] = n[k]; });
      fetch('https://qflnjyqkuczadlutvrxs.supabase.co/rest/v1/rpc/seiri_push', { method: 'POST', headers: { 'apikey': 'sb_publishable_3dbrAMr925n4HB31i-hdbg_P-SE3FLB', 'Authorization': 'Bearer sb_publishable_3dbrAMr925n4HB31i-hdbg_P-SE3FLB', 'Content-Type': 'application/json' }, body: JSON.stringify({ p_pin: pin, p_d: n.date, p_data: data }) })
        .then(r => r.json()).then(t => { if (t) window.__seiriSnapAt = t; }).catch(() => {});
    };
    const html = seiriBuild(norm);
    w.document.open(); w.document.write(html); w.document.close();
    if (auto) window.scrollTo(sx, sy);
    window.__seiriPushSnap();
    // 開いている間は5分ごとに読み直す
    window.__seiriTimer = setTimeout(() => { window.__seiriAuto = true; window.__seiriGo(date); }, 5 * 60 * 1000);
  } catch (e) { if (auto) { window.__seiriTimer = setTimeout(() => { window.__seiriAuto = true; window.__seiriGo(date); }, 60 * 1000); return; } ov.style.color = '#c00'; ov.innerHTML = '<p style="font:16px sans-serif;padding:20px;color:#c00">読み込めませんでした。食べログノートにログインしているか確かめてください。<br><small>' + String(e.message || e).replace(/</g, '&lt;') + '</small><br><button onclick="this.parentNode.parentNode.remove()">閉じる</button></p>'; }
})();
};window.__seiriRun();