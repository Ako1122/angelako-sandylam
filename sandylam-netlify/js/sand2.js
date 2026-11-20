/* ===== 沙畫消消樂 2（珠子版・試驗中） ===== */
(function () {
  "use strict";

  /* ---------- 關卡圖片（相對於 sand-drop.html 的路徑） ---------- */
  const IMAGES = ["images/covers/01.jpg", "images/covers/02.jpg", "images/covers/03.jpg", "images/covers/04.jpg", "images/covers/05.jpg", "images/covers/06.jpg", "images/covers/07.jpg", "images/covers/08.jpg", "images/covers/09.jpg", "images/covers/10.jpg", "images/covers/11.jpg", "images/covers/12.jpg", "images/covers/13.jpg", "images/covers/14.jpg", "images/covers/15.jpg", "images/covers/16.jpg", "images/covers/17.jpg", "images/covers/18.jpg", "images/covers/19.jpg", "images/covers/20.jpg", "images/covers/21.jpg", "images/covers/22.jpg", "images/covers/23.jpg", "images/covers/24.jpg", "images/covers/25.jpg", "images/covers/26.jpg", "images/covers/27.jpg", "images/covers/28.jpg", "images/covers/29.jpg", "images/covers/30.jpg", "images/covers/31.jpg", "images/covers/32.jpg", "images/covers/33.webp", "images/covers/34.jpg", "images/covers/35.jpg", "images/covers/36.jpg", "images/covers/37.webp", "images/covers/38.jpg", "images/covers/39.jpg", "images/covers/40.jpg", "images/covers/41.jpg", "images/covers/42.jpg", "images/covers/43.jpg", "images/covers/44.jpg", "images/covers/45.jpg", "images/covers/46.jpg", "images/covers/47.jpg", "images/covers/48.jpg", "images/covers/49.jpg", "images/covers/50.jpg", "images/covers/51.jpg", "images/covers/52.jpg", "images/covers/53.webp", "images/covers/54.jpg", "images/covers/55.jpg", "images/covers/56.jpg", "images/covers/57.jpg", "images/covers/58.webp", "images/covers/59.jpg", "images/covers/60.jpg", "images/covers/61.jpg", "images/covers/62.jpg", "images/covers/63.jpg", "images/covers/64.jpg", "images/covers/65.jpg", "images/covers/66.jpg", "images/covers/67.jpg", "images/covers/68.jpg", "images/covers/69.jpg", "images/covers/70.webp", "images/covers/71.jpg", "images/covers/72.jpg", "images/covers/73.webp", "images/covers/74.jpg", "images/covers/75.jpg", "images/covers/76.jpg", "images/covers/77.webp", "images/covers/78.jpg"];

  const GRID = 60;           // 珠子解析度：60×60 顆
  const W = 400;             // 畫面寬度
  const CELL = W / GRID;     // 一顆珠子的寬度（px）
  const LANES = 3;           // 三排等候車道（車庫）
  const MAX_ROAD = 6;        // 路上最多同時幾台車
  const TICK_HZ = 60;        // 遊戲邏輯每秒跑 60 步（固定步長，跟螢幕更新率無關）
  const SPEED = W * 1.5 / (4 * TICK_HZ);   // 車速：原本 4 秒開過畫面，加快 50% → 約 2.7 秒
  const FAST_SPEED = W * 1.5 / (1 * TICK_HZ);   // 車庫的車全部派出後：再加快 4 倍，約 0.7 秒開過畫面
  const ENTER_X = -40;       // 車子從畫面左邊外面進場
  const EXIT_X = W + 40;     // 裝滿的車開到右邊外面就離場
  const LOOP = 600;          // 繞一圈的長度：畫面 400 + 左右兩邊各 40 + 回到左邊的路 120
  const GAP = 56;            // 車與車之間的距離（路上最多 5 台時，入口一定等得到 2×GAP 的空位：600÷5 = 120 > 112）
  const INTAKE = 12;         // 車子正上方左右各 12px 範圍內的沙都接得到
  const TAKE_PER_TICK = 1;   // 每台車每次最多吸幾顆
  const TAKE_EVERY = 2;      // 每 2 步吸一次（每秒最多 30 顆）
  const MAX_REVERSE = 5;     // 每關可以丟回車庫的次數
  const MAX_HINT = 3;        // 每關可以用提示的次數

  function difficulty(i) {
    const t = i / (IMAGES.length - 1);
    return {
      colors: t < 2 / 3 ? 6 : 7,   // 珠子版顏色多一點，圖案才認得出來（路上最多 6 台車，顏色不能太多）
      cars: t < 1 / 3 ? 40 : t < 2 / 3 ? 60 : 80,
      stars: 1 + Math.floor(t * 4.99)
    };
  }

  /* =====================================================================
     核心邏輯：實際遊戲、產生派車順序、驗證，三者共用同一套 Road 規則
     cols[x] = 第 x 欄由下往上的顏色；ptr[x] = 該欄目前最底部那粒的位置
     車子位置 car.p：0 = 剛進場（畫面左邊外面），沿著一圈 LOOP 往前開
     ===================================================================== */
  const Core = {
    newState(cols) {
      return { cols, ptr: new Int32Array(GRID), road: [], queue: [], left: GRID * GRID, t: 0 };
    },
    carX(car) { return ENTER_X + car.p; },
    entryFree(S) { return S.road.every(c => c.p >= GAP && c.p <= LOOP - GAP); },
    onRoad(S) { return S.road.length + S.queue.length; },
    // 跑一步：開車 → 裝滿的離場 → 新車進場 → 經過的地方吸沙
    tick(S, ev) {
      S.t++;
      const out = [];
      const v = S.fast ? FAST_SPEED : SPEED;
      for (const car of S.road) {
        car.p += v; car.dry += v;
        if (car.claimed >= car.cap && Core.carX(car) >= EXIT_X) out.push(car);
        else if (car.p >= LOOP) { car.p -= LOOP; car.laps++; }
      }
      if (out.length) { S.road = S.road.filter(c => !out.includes(c)); if (ev && ev.exit) out.forEach(ev.exit); }
      S.qwait = S.queue.length ? (S.qwait || 0) + 1 : 0;   // 等待進場的車等了幾步
      if (S.queue.length && Core.entryFree(S)) {
        const car = S.queue.shift(); car.p = 0; car.dry = 0; S.road.push(car); S.qwait = 0;
        if (ev && ev.enter) ev.enter(car);
      }
      let moved = false;
      const order = S.t % TAKE_EVERY === 0 ? S.road.slice().sort((a, b) => b.p - a.p) : [];   // 前面的車先吸
      for (const car of order) {
        if (car.claimed >= car.cap) continue;
        const x = Core.carX(car);
        if (x < -INTAKE || x > W + INTAKE) continue;
        const c0 = Math.max(0, Math.floor((x - INTAKE) / CELL)), c1 = Math.min(GRID - 1, Math.floor((x + INTAKE) / CELL));
        let n = TAKE_PER_TICK;
        for (let col = c1; col >= c0 && n > 0; col--) {
          const p = S.ptr[col];
          if (p < GRID && S.cols[col][p] === car.c) {
            S.ptr[col]++; car.claimed++; car.dry = 0; S.left--; n--; moved = true;
            if (ev && ev.take) ev.take(car, col);
            if (car.claimed >= car.cap) { if (ev && ev.full) ev.full(car); break; }
          }
        }
      }
      return moved;
    },
    // 動彈不得：路上滿 6 台，而且每台都繞了一整圈沒接到沙
    // 有車在等進場時，要等滿一整圈都進不來才算（不然它只是在等入口空出來）
    stuck(S) { return S.road.length > 0 && Core.onRoad(S) >= MAX_ROAD && S.road.every(c => c.dry >= LOOP) && (!S.queue.length || S.qwait > LOOP / SPEED); },
    exposed(cols, ptr, n) {
      const e = new Int32Array(n);
      for (let x = 0; x < GRID; x++) if (ptr[x] < GRID) e[cols[x][ptr[x]]]++;
      return e;
    },
    newCar(c, cap, k) { return { c, cap, k, claimed: 0, got: 0, pend: 0, p: 0, dry: 0, laps: 0, lane: k % LANES }; },
    /* 模擬一整局。
       產生模式（o.choose）：路上不滿 6 台就挑一個顏色派車，記錄成派車順序 seq。
       驗證模式（o.seq）：照順序派車；o.delay() 模擬玩家每次派車前發呆幾步。 */
    play(cols, nColor, o) {
      const S = Core.newState(cols);
      const gen = !o.seq, seq = gen ? [] : o.seq, unres = gen ? o.unres.slice() : null;
      let unresLeft = gen ? unres.reduce((a, b) => a + b, 0) : 0, next = 0, act = o.delay ? o.delay() : 0;
      const carsLeft = () => gen ? unresLeft > 0 : next < seq.length;
      for (let t = 0; t < 120000; t++) {
        while (t >= act && carsLeft() && Core.onRoad(S) < MAX_ROAD) {
          let c, cap, k;
          if (gen) {
            c = o.choose(Core.exposed(cols, S.ptr, nColor), S, unres);
            cap = Math.min(o.cap, unres[c]); unres[c] -= cap; unresLeft -= cap;
            k = seq.length; seq.push({ c, cap });
          } else { k = next++; c = seq[k].c; cap = seq[k].cap; }
          S.queue.push(Core.newCar(c, cap, k));
          act = t + (o.delay ? o.delay() : 0);
        }
        S.fast = !carsLeft() && !S.queue.length;
        Core.tick(S);
        if (S.left === 0) return { ok: true, seq, steps: S.t };
        if (Core.stuck(S)) return { ok: false, seq, left: S.left };
      }
      return { ok: false, seq, left: S.left };
    },
    rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; },
    /* 驗證：用不同手速的玩家照順序重玩（單位：步，60 步 = 1 秒） */
    PLAYERS: [0, 5, 10, 15, 20, 25, 30, 35, 40, 40, 45, 50, 55, 60, 60, 70, 80, 100, 140, 200].map(m => ({ m })),
    validate(cols, nColor, q, seed, need) {
      let pass = 0, fail = 0, steps = 0;
      for (let k = 0; k < Core.PLAYERS.length; k++) {
        const p = Core.PLAYERS[k], rnd = Core.rng(seed * 31 + k + 7);
        const r = Core.play(cols, nColor, { seq: q.seq, delay: () => Math.floor(rnd() * p.m) });
        if (r.ok) { pass++; if (k === 0) steps = r.steps; }
        else if (++fail > Core.PLAYERS.length - (need || 0)) break;
      }
      q.steps = steps || q.steps;
      return pass;
    },
    buildQueue(cols, nColor, cap, seed, maxTry) {
      const unres = new Array(nColor).fill(0);
      cols.forEach(col => col.forEach(v => unres[v]++));
      let best = null; const t0 = Date.now();
      for (let k = 0; k < (maxTry || 120); k++) {
        if (best && Date.now() - t0 > 1200) break;   // 最多花約 1.2 秒挑最穩的順序
        const rnd = Core.rng(seed * 977 + k * 131 + 1);
        // 挑色原則：路上顏色越分散越好；優先派「底部露出最多、路上還沒有」的顏色
        const choose = (exp, S, un) => {
          const busy = new Set(S.road.concat(S.queue).filter(c => c.claimed < c.cap).map(c => c.c));
          let bc = -1, bs = -Infinity, nearC = null;
          for (let c = 0; c < nColor; c++) {
            if (un[c] <= 0) continue;
            let tier, sub;
            if (!busy.has(c) && exp[c] > 0) { tier = 3; sub = exp[c] * 100; }
            else if (!busy.has(c)) {
              if (!nearC) {
                nearC = new Float64Array(nColor);
                for (let x = 0; x < GRID; x++) for (let d = 0; d < 24 && S.ptr[x] + d < GRID; d++) nearC[cols[x][S.ptr[x] + d]] += 1 / (d + 1);
              }
              tier = 2; sub = nearC[c] * 10;
            } else { tier = 1; sub = exp[c] * 100; }
            const sc = tier * 1e7 + sub + un[c] / 1000 + rnd() * k * 3000;
            if (sc > bs) { bs = sc; bc = c; }
          }
          return bc;
        };
        const gm = [0, 15, 40, 80][k % 4], grnd = Core.rng(seed * 53 + k);
        const r = Core.play(cols, nColor, { unres, cap, choose, delay: gm ? () => Math.floor(grnd() * gm) : null });
        if (!r.ok) continue;
        const q = { seq: r.seq, steps: r.steps };
        q.pass = Core.validate(cols, nColor, q, seed, best ? best.pass + 1 : 0); q.total = Core.PLAYERS.length;
        if (!best || q.pass > best.pass) best = q;
        if (q.pass === q.total) break;
      }
      return best;
    }
  };

  /* ---------- 讀圖、分色（k-means） ---------- */
  function near(p, c) { let b = 0, d = 1e12; for (let j = 0; j < c.length; j++) { const q = c[j], e = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (e < d) { d = e; b = j; } } return b; }
  function kmeans(px, k) {
    const sorted = px.slice().sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
    let c = []; for (let i = 0; i < k; i++) c.push(sorted[Math.floor((i + .5) * sorted.length / k)].slice());
    for (let it = 0; it < 10; it++) {
      const s = c.map(() => [0, 0, 0, 0]);
      for (const p of px) { const j = near(p, c); s[j][0] += p[0]; s[j][1] += p[1]; s[j][2] += p[2]; s[j][3]++; }
      c = c.map((v, j) => s[j][3] ? [s[j][0] / s[j][3], s[j][1] / s[j][3], s[j][2] / s[j][3]] : v);
    }
    return c.map(v => v.map(Math.round));
  }
  /* ---------- 顏色（OKLab：比 RGB 更接近人眼感覺的色彩空間） ---------- */
  const s2l = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const l2s = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;
  function toLab(p) {
    const r = s2l(p[0]), g = s2l(p[1]), b = s2l(p[2]);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
      m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
      s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function fromLab(c) {
    const L = c[0], a = c[1], b = c[2];
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [l2s(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), l2s(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), l2s(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
  }
  const clamp255 = v => Math.round(Math.max(0, Math.min(255, v)));
  function lch2rgb(L, C, h) {
    let c = C;
    for (let k = 0; k < 40; k++) { const p = fromLab([L, c * Math.cos(h), c * Math.sin(h)]); if (p.every(v => v >= -0.5 && v <= 255.5)) return p.map(clamp255); c *= 0.93; }
    return fromLab([L, 0, 0]).map(clamp255);
  }
  // 在 OKLab 裡分色（以 RGB 分色結果為起點），亮橘色不會被旁邊的暗邊混成鏽色
  function kmeansLab(px, k) {
    const lab = px.map(toLab); let c = kmeans(px, k).map(toLab);
    const nearL = p => { let b = 0, d = 1e9; for (let j = 0; j < c.length; j++) { const q = c[j], e = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (e < d) { d = e; b = j; } } return b; };
    for (let it = 0; it < 12; it++) {
      const s = c.map(() => [0, 0, 0, 0]);
      for (const p of lab) { const j = nearL(p); s[j][0] += p[0]; s[j][1] += p[1]; s[j][2] += p[2]; s[j][3]++; }
      c = c.map((v, j) => s[j][3] ? [s[j][0] / s[j][3], s[j][1] / s[j][3], s[j][2] / s[j][3]] : v);
    }
    return { index: lab.map(nearL), centers: c };
  }
  /* 鮮豔化＋拉開顏色：
     1. 保留原本的明暗與色相、拉高彩度
     2. 任兩色在 OKLab 裡的距離小於 MIN_DE，就互相推開（主要靠明暗，其次色相／彩度），
        每一步都拉回螢幕能顯示的範圍，直到每一對顏色都夠分得開 */
  /* 不使用紫色：色相落在紫色範圍（HSL 228°～340°，含看起來偏紫的藍紫色）就改成最接近的藍色或玫瑰紅 */
  function noPurple(rgb) {
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (d < 1e-6) return rgb;
    const sat = d / (1 - Math.abs(2 * l - 1));
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
    if (h < 228 || h > 340 || sat < 0.07 || l < 0.06 || l > 0.96) return rgb;
    const h2 = h < 290 ? 212 : 348;   // 偏藍的紫 → 藍；偏粉的紫 → 玫瑰紅
    const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs((h2 / 60) % 2 - 1)), m = l - c / 2;
    const seg = Math.floor(h2 / 60), rgb1 = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
    return rgb1.map(v => clamp255((v + m) * 255));
  }
  const MIN_DE = 0.22;
  const MAX_HUE_SHIFT = 0.7;   // 色相最多偏移約 40 度，保留原圖的感覺
  /* ---------- 膚色保護：臉不要變成慘白、灰綠或紙紮人的粉黃粉紅 ---------- */
  // 像素是不是膚色（常用的 RGB 膚色判斷）
  function isSkinPx(p) {
    const r = p[0], g = p[1], b = p[2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return r > 95 && g > 40 && b > 20 && mx - mn > 15 && r - g > 12 && r > b && g >= b * 0.85 && r < 252;
  }
  // 每個顏色群裡有多少比例是膚色
  function skinShares(px, index, n) {
    const tot = new Array(n).fill(0), sk = new Array(n).fill(0);
    for (let i = 0; i < px.length; i++) { tot[index[i]]++; if (isSkinPx(px[i])) sk[index[i]]++; }
    return tot.map((t, j) => t ? sk[j] / t : 0);
  }
  // 自然膚色的範圍（OKLab）：色相 42°～76°（暖杏到米色），彩度 0.03～0.085（不加彩度，避免變成鮮黃、鮮橘的假臉），明度 0.45～0.94（保留原本的明暗）
  const SKIN = { h0: 42 * Math.PI / 180, h1: 76 * Math.PI / 180, c0: 0.03, c1: 0.085, l0: 0.45, l1: 0.94 };
  function toSkin(lab) {
    const L = Math.max(SKIN.l0, Math.min(SKIN.l1, lab[0]));
    let h = Math.atan2(lab[2], lab[1]), C = Math.hypot(lab[1], lab[2]);
    if (!(h >= SKIN.h0 && h <= SKIN.h1)) h = Math.abs(Math.atan2(Math.sin(h - SKIN.h0), Math.cos(h - SKIN.h0))) < Math.abs(Math.atan2(Math.sin(h - SKIN.h1), Math.cos(h - SKIN.h1))) ? SKIN.h0 : SKIN.h1;
    C = Math.max(SKIN.c0, Math.min(SKIN.c1, C));
    return toLab(lch2rgb(L, C, h));
  }

  /* 鮮豔化＋拉開顏色：
     1. 保留原本的明暗與色相、拉高彩度（膚色除外：固定在自然膚色範圍）
     2. 任兩色在 OKLab 裡的距離小於 MIN_DE，就互相推開（主要靠明暗，其次色相／彩度），
        膚色幾乎不動、由其他顏色讓開；每一步都拉回螢幕能顯示的範圍 */
  function vividPalette(labCenters, skin) {
    const n = labCenters.length;
    // 膚色群：裡面至少 35% 是膚色像素，而且這個顏色本身是橘杏色系（粉紅、紅色背景不算）
    const isSkin = labCenters.map((x, i) => {
      if (!skin || skin[i] < 0.35 || x[0] < 0.45) return false;
      const hd = Math.atan2(x[2], x[1]) * 180 / Math.PI, c = Math.hypot(x[1], x[2]);
      return hd >= 35 && hd <= 92 && c >= 0.02 && c <= 0.17;
    });
    const P = labCenters.map((x, i) => {
      if (isSkin[i]) return toSkin(x);
      const c = Math.hypot(x[1], x[2]), h = Math.atan2(x[2], x[1]);
      const c2 = c < 0.03 ? c * 0.6 : Math.min(0.26, Math.max(0.13, c * 2.2));
      return toLab(noPurple(lch2rgb(x[0], c2, h)));
    });
    const H0 = P.map(x => Math.atan2(x[2], x[1]));
    const order = [...Array(n).keys()].sort((a, b) => P[a][0] - P[b][0]);
    if (!isSkin[order[0]]) P[order[0]] = toLab(lch2rgb(Math.min(P[order[0]][0], 0.22), Math.hypot(P[order[0]][1], P[order[0]][2]), Math.atan2(P[order[0]][2], P[order[0]][1])));
    if (!isSkin[order[n - 1]]) P[order[n - 1]] = toLab(lch2rgb(Math.max(P[order[n - 1]][0], 0.95), Math.hypot(P[order[n - 1]][1], P[order[n - 1]][2]), Math.atan2(P[order[n - 1]][2], P[order[n - 1]][1])));
    const wt = isSkin.map(s => s ? 0.4 : 1);   // 膚色只在自然膚色範圍內小幅移動，主要由其他顏色讓開
    const S0 = P.map(x => x.slice());          // 起點：每個顏色最多只能離開起點 MAX_MOVE，免得被推成完全不同的顏色
    const MAX_MOVE = 0.16;
    const leash = i => {
      const d = Math.hypot(P[i][0] - S0[i][0], P[i][1] - S0[i][1], P[i][2] - S0[i][2]);
      if (d > MAX_MOVE) for (let q = 0; q < 3; q++) P[i][q] = S0[i][q] + (P[i][q] - S0[i][q]) * MAX_MOVE / d;
    };
    for (let it = 0; it < 1500; it++) {
      let worst = Infinity;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const dL = P[j][0] - P[i][0], da = P[j][1] - P[i][1], db = P[j][2] - P[i][2];
        const d = Math.hypot(dL, da, db);
        worst = Math.min(worst, d);
        if (d >= MIN_DE) continue;
        // 推開的方向：明暗加權（暗色、淺色主要靠明暗拉開）；兩色幾乎一樣時直接用明暗
        let v = d < 1e-4 ? [1, 0, 0] : [dL * 2.2, da, db];
        if (Math.abs(v[0]) < 1e-4 && d >= 1e-4) v[0] = (P[i][0] < 0.5 ? 1 : -1) * 0.02;
        // 兩色都很亮或都很暗時，螢幕能顯示的彩度很小，往色相方向推不開 → 改以明暗為主
        const tight = (P[i][0] > 0.82 && P[j][0] > 0.82) || (P[i][0] < 0.28 && P[j][0] < 0.28);
        if (tight) v[0] = (dL >= 0 ? 1 : -1) * Math.max(Math.abs(v[0]), 2 * Math.hypot(v[1], v[2]), 0.02);
        const len = Math.hypot(v[0], v[1], v[2]), k = (MIN_DE - d) * 0.6 / len;
        const ki = k * wt[i] / (wt[i] + wt[j]), kj = k * wt[j] / (wt[i] + wt[j]);
        for (let q = 0; q < 3; q++) { P[i][q] -= v[q] * ki; P[j][q] += v[q] * kj; }
      }
      if (worst >= MIN_DE) break;
      // 拉回能顯示的範圍（膚色拉回自然膚色範圍）
      for (let i = 0; i < n; i++) {
        leash(i);
        if (isSkin[i]) { P[i] = toSkin(P[i]); continue; }
        const L = Math.max(0.08, Math.min(0.98, P[i][0])), C = Math.hypot(P[i][1], P[i][2]);
        let h = Math.atan2(P[i][2], P[i][1]);
        if (C > 0.04) { const dh = Math.atan2(Math.sin(h - H0[i]), Math.cos(h - H0[i])); if (Math.abs(dh) > MAX_HUE_SHIFT) h = H0[i] + Math.sign(dh) * MAX_HUE_SHIFT; }
        P[i] = toLab(noPurple(lch2rgb(L, Math.min(C, 0.3), h)));
      }
    }
    // 最後補強：兩個都很淺、還是太像的顏色（例如淡藍和米白），把比較有顏色的那個再調得更有顏色一點
    for (let it = 0; it < 30; it++) {
      let fixed = false;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (isSkin[i] || isSkin[j] || P[i][0] < 0.8 || P[j][0] < 0.8) continue;
        if (Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]) >= 0.15) continue;
        const k = Math.hypot(P[i][1], P[i][2]) >= Math.hypot(P[j][1], P[j][2]) ? i : j;
        const C = Math.hypot(P[k][1], P[k][2]), h = Math.atan2(P[k][2], P[k][1]);
        if (C < 0.012) continue;   // 幾乎沒有顏色的就不硬加顏色
        P[k] = toLab(noPurple(lch2rgb(Math.max(0.8, P[k][0] - 0.01), Math.min(0.16, C * 1.2), h)));
        leash(k);
        fixed = true;
      }
      if (!fixed) break;
    }
    return P.map(x => noPurple(fromLab(x).map(clamp255)));
  }
  /* ---------- 卡通色盤（不含紫色） ---------- */
  const POSTER = [
    ["#26272C", "黑"], ["#F7F6F0", "白"], ["#F9E6B8", "米"], ["#F8C81F", "黃"], ["#F59A2E", "橘"], ["#E5484D", "紅"],
    ["#F59CB0", "粉"], ["#8C4B2C", "棕"], ["#5A3322", "深棕"], ["#D4A06A", "卡其"], ["#2F6FDB", "藍"], ["#7CC8F2", "天藍"],
    ["#22406F", "深藍"], ["#1FA39A", "青綠"], ["#5CBC48", "綠"], ["#2E7B4B", "深綠"], ["#A3A8AF", "灰"], ["#5F6770", "深灰"],
    ["#F8CBB0", "淺膚", 1], ["#F2AC88", "膚", 1], ["#D9895F", "深膚", 1]
  ].map(([h, name, skin]) => ({ rgb: [1, 3, 5].map(k => parseInt(h.substr(k, 2), 16)), name, skin: !!skin }));
  POSTER.forEach(p => p.lab = toLab(p.rgb));
  // 匈牙利演算法：n 個顏色群配到 m 個色盤顏色（n ≤ m），總差距最小、每個色盤顏色只用一次
  function assign(cost) {
    const n = cost.length, m = cost[0].length, INF = 1e18;
    const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i; let j0 = 0; const minv = new Array(m + 1).fill(INF), used = new Array(m + 1).fill(false);
      do {
        used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
        for (let j = 1; j <= m; j++) if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= m; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const res = new Array(n); for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1;
    return res;
  }
  function posterPalette(labCenters, skin) {
    const isSkin = labCenters.map((x, i) => {
      if (!skin || skin[i] < 0.35 || x[0] < 0.45) return false;
      const hd = Math.atan2(x[2], x[1]) * 180 / Math.PI, c = Math.hypot(x[1], x[2]);
      return hd >= 35 && hd <= 92 && c >= 0.02 && c <= 0.17;
    });
    const cost = labCenters.map((x, i) => POSTER.map(p => {
      const dL = x[0] - p.lab[0], da = x[1] - p.lab[1], db = x[2] - p.lab[2];
      let c = dL * dL + 3 * (da * da + db * db);
      if (isSkin[i] && !p.skin) c += 1;        // 臉一定配到膚色
      if (!isSkin[i] && p.skin) c += 0.02;     // 不是臉的盡量不用膚色
      return c;
    }));
    return assign(cost).map(j => POSTER[j].rgb.slice());
  }
  // 拼豆感：把零星的雜點換成周圍最多的顏色
  function cleanSpeckles(index, n) {
    const out = index.slice();
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const cnt = new Array(n).fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= GRID || xx >= GRID) continue;
        cnt[index[yy * GRID + xx]]++;
      }
      const me = index[y * GRID + x];
      let best = me; for (let k = 0; k < n; k++) if (cnt[k] > cnt[best]) best = k;
      if (cnt[me] <= 2 && cnt[best] >= 5) out[y * GRID + x] = best;
    }
    return out;
  }
  function loadImage(src) { return new Promise((res, rej) => { const m = new Image(); m.onload = () => res(m); m.onerror = rej; m.src = src; }); }
  // 找不到夠穩的派車順序時（20 種派車節奏裡有 2 種以上過不了），少用一種顏色重新產生，確保每關都過得了
  function makeLevel(im, nColors, nCars, seed) {
    let L = makeLevelOnce(im, nColors, nCars, seed);
    while ((!L.q || L.q.pass < L.q.total - 1) && nColors > 5) { nColors--; L = makeLevelOnce(im, nColors, nCars, seed); }
    return L;
  }
  function makeLevelOnce(im, nColors, nCars, seed) {
    // 先縮成 4 倍大，再每 4×4 取平均（顏色比直接縮小乾淨）
    const BIG = GRID * 4, t = document.createElement("canvas"); t.width = t.height = BIG;
    const x = t.getContext("2d", { willReadFrequently: true });
    const s = Math.min(im.width, im.height);
    x.imageSmoothingQuality = "high";
    x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, BIG, BIG);
    const d = x.getImageData(0, 0, BIG, BIG).data, px = [];
    for (let Y = 0; Y < GRID; Y++) for (let X = 0; X < GRID; X++) {
      let r = 0, gg = 0, b = 0;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) { const k = ((Y * 4 + dy) * BIG + X * 4 + dx) * 4; r += d[k]; gg += d[k + 1]; b += d[k + 2]; }
      // 稍微加強對比與彩度，五官和輪廓比較清楚
      r /= 16; gg /= 16; b /= 16;
      const L = 0.299 * r + 0.587 * gg + 0.114 * b;
      px.push([r, gg, b].map(v => Math.max(0, Math.min(255, (L + (v - L) * 1.2 - 128) * 1.12 + 128))));
    }
    const km = kmeansLab(px, nColors), idx = cleanSpeckles(km.index, nColors), grid = [];
    for (let y = 0; y < GRID; y++) { const row = new Int8Array(GRID); for (let X = 0; X < GRID; X++) row[X] = idx[y * GRID + X]; grid.push(row); }
    const pal = posterPalette(km.centers, skinShares(px, km.index, nColors));
    // 纜車從上方吸：每一欄由上往下排，ptr = 已經被吸走幾顆
    const cols = []; for (let X = 0; X < GRID; X++) { const c = new Int8Array(GRID); for (let y = 0; y < GRID; y++) c[y] = grid[y][X]; cols.push(c); }
    const cap = Math.ceil(GRID * GRID / nCars);
    const q = Core.buildQueue(cols, pal.length, cap, seed + 1);
    return { pal, grid, cols, cap, q };
  }
  window.SandCore = { Core, IMAGES, GRID, difficulty, loadImage, makeLevel };
  if (window.SAND_TEST_ONLY) return;

  /* =====================================================================
     介面
     ===================================================================== */
  const $ = id => document.getElementById(id);
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } } };
  const done = () => { try { return JSON.parse(LS.get("sand2_done") || "[]"); } catch (e) { return []; } };
  const starsOf = () => { try { return JSON.parse(LS.get("sand2_stars") || "{}"); } catch (e) { return {}; } };
  const fmt = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

  /* ---------- 音效 ---------- */
  let AC, MUTE = LS.get("sand2_mute") === "1";
  function snd(f, d = 0.08, type = "sine", v = 0.15, f2) {
    if (MUTE) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const o = AC.createOscillator(), gg = AC.createGain(), t = AC.currentTime;
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      gg.gain.setValueAtTime(v, t); gg.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(gg).connect(AC.destination); o.start(t); o.stop(t + d);
    } catch (e) { }
  }
  const S_ = {
    tap: () => snd(520, 0.1, "triangle", 0.2, 820),
    grain: () => snd(1300 + Math.random() * 900, 0.03, "sine", 0.025),
    full: () => { snd(660, 0.12, "triangle", 0.14); setTimeout(() => snd(990, 0.16, "triangle", 0.14), 90); },
    err: () => snd(180, 0.2, "sawtooth", 0.1, 120),
    win: () => [523, 659, 784, 1047].forEach((f, k) => setTimeout(() => snd(f, 0.25, "triangle", 0.2), k * 130)),
    lose: () => [392, 330, 262].forEach((f, k) => setTimeout(() => snd(f, 0.3, "sawtooth", 0.08), k * 200))
  };

  /* ---------- 畫面元素 ---------- */
  const scrIntro = $("sd-intro"), scrGame = $("sd-game");
  const cv = $("sdCanvas"); let g = cv.getContext("2d");
  const H = 730, DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * DPR; cv.height = H * DPR;
  const CABLE_Y = 12, PIC_Y = 68, PIC_H = 400, CAR_SC = 0.76, CAR_Y = CABLE_Y + 70 * CAR_SC;   // 纜線、圖畫位置；CAR_Y = 纜車車廂底部
  const LANE_TOP = 502, LANE_Y = LANE_TOP + 62, LANE_GAP = 44, GARAGE_SC = 0.66;
  const off = document.createElement("canvas"); off.width = off.height = GRID;
  const og = off.getContext("2d"), oimg = og.createImageData(GRID, GRID);

  let level = 0, L = null, pal, grid, S = null, lanes, parts, state = "idle", img;
  let total, winT = 0, T0 = 0, ELAPSED = 0, MISS = 0, PAR = 0, NCARS = 0, pauseAt = 0;
  let hintUntil = 0, hint = null, flash = [], nextK = 0, onTrack = true, REVERSE = 0, HINTS = 0, lastT = 0, acc = 0;

  /* ---------- 選關畫面 ---------- */
  function renderPicker() {
    const d = done(), st = starsOf(), wrap = $("sdLevels");
    wrap.innerHTML = "";
    IMAGES.forEach((src, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sd-level" + (d.includes(i) ? " cleared" : "");
      const s = st[i] || 0;
      b.innerHTML = `<img src="${src}" alt="" loading="lazy"><span class="sd-level-no">${i + 1}</span>` +
        `<span class="sd-level-stars">${s ? "★".repeat(s) + "☆".repeat(3 - s) : ""}</span>`;
      b.setAttribute("aria-label", "第 " + (i + 1) + " 關");
      b.onclick = () => start(i);
      wrap.appendChild(b);
    });
    const total3 = Object.values(st).reduce((a, b) => a + b, 0);
    $("sdProgressText").textContent = `已過關 ${d.length} / ${IMAGES.length}　・　★ ${total3} / ${IMAGES.length * 3}`;
    const firstOpen = IMAGES.findIndex((_, i) => !d.includes(i));
    const n = firstOpen < 0 ? 0 : firstOpen;
    $("sdContinueBtn").textContent = d.length ? `繼續挑戰：第 ${n + 1} 關` : "從第 1 關開始";
    $("sdContinueBtn").onclick = () => start(n);
  }

  function showIntro() {
    state = "idle"; scrGame.hidden = true; scrIntro.hidden = false; hideStuck(); renderPicker();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- 開始關卡 ---------- */
  async function start(i) {
    level = i; scrIntro.hidden = true; scrGame.hidden = false; $("sdResult").hidden = true; hideStuck();
    state = "loading"; grid = null; setMsg("沙子堆疊中…");
    const df = difficulty(i);
    $("sdLevelLabel").textContent = "第 " + (i + 1) + " 關";
    $("sdDiff").textContent = "★".repeat(df.stars) + "☆".repeat(5 - df.stars) + "　" + df.colors + " 色";
    window.scrollTo({ top: 0, behavior: "smooth" });
    let im;
    try { im = await loadImage(IMAGES[i]); } catch (e) { setMsg("圖片載入失敗：" + IMAGES[i]); return; }
    if (level !== i) return;
    await new Promise(r => setTimeout(r, 30));
    try { L = makeLevel(im, df.colors, df.cars, i); }
    catch (e) { setMsg("無法讀取圖片像素（請用本機伺服器開啟）"); return; }
    if (level !== i) return;
    if (!L.q) { setMsg("這關產生失敗，請按「重新開始」"); return; }
    $("sdDiff").textContent = "★".repeat(df.stars) + "☆".repeat(5 - df.stars) + "　" + L.pal.length + " 色";
    img = im; pal = L.pal; reset();
  }
  function reset() {
    grid = L.grid.map(r => Int8Array.from(r)); S = Core.newState(L.cols);
    total = GRID * GRID;
    lanes = [...Array(LANES)].map(() => []);
    L.q.seq.forEach((c, k) => lanes[k % LANES].push(Core.newCar(c.c, c.cap, k)));
    parts = []; flash = [];
    state = "play"; winT = 0; T0 = 0; ELAPSED = 0; MISS = 0; hintUntil = 0; hint = null;
    nextK = 0; onTrack = true; REVERSE = 0; HINTS = 0; acc = 0; updateHintBtn(); updateReverseBtn(); hideStuck();
    NCARS = L.q.seq.length; PAR = Math.round((L.q.steps || NCARS * 150) / TICK_HZ * 1.4) + 15;
    $("sdResult").hidden = true;
    setMsg("點纜車站最前面的纜車送上纜線，它經過時會吸走正下方最上面一顆同色的珠子！");
  }
  function setMsg(t) { $("sdMsg").textContent = t; }

  /* ---------- 操作 ---------- */
  const laneX = l => (l + .5) * W / LANES;
  function tapLane(l, k) {
    if (state !== "play") return false;
    const ln = lanes[l];
    if (!ln || !ln.length) return false;
    if (!T0) T0 = performance.now();
    if (k > 0) { setMsg("🚧 前面的纜車還沒出發，後面的出不去！"); S_.err(); MISS++; flash.push({ l, t: 0 }); return false; }
    if (Core.onRoad(S) >= MAX_ROAD) { setMsg("纜線上已經有 6 台纜車了，等有纜車裝滿離開再派"); S_.err(); return false; }
    const car = ln.shift();
    if (onTrack && car.k === nextK) nextK++; else onTrack = false;
    car.p = 0; car.dry = 0; S.queue.push(car); S_.tap(); setMsg(""); hintUntil = 0;
    return true;
  }
  // 動彈不得時：選一台車丟回車庫（回到原本車道的最後面）
  function reverseCar(car) {
    if ((state !== "stuck" && state !== "choose") || REVERSE >= MAX_REVERSE || !car) return false;
    S.road = S.road.filter(c => c !== car); S.queue = S.queue.filter(c => c !== car);
    car.got = car.claimed; car.pend = 0; car.p = 0; car.dry = 0;
    lanes[car.lane].push(car);
    parts = parts.filter(p => p.car !== car);
    REVERSE++; onTrack = false; S_.tap(); hideStuck(); updateReverseBtn();
    state = "play"; if (T0) T0 += performance.now() - pauseAt;
    setMsg(`🚡 送回纜車站了（送回剩 ${MAX_REVERSE - REVERSE} 次）`);
    return true;
  }
  // manual = 玩家自己按「丟回車庫」；否則是動彈不得時自動跳出
  function showStuck(manual) {
    state = manual ? "choose" : "stuck"; pauseAt = performance.now(); if (!manual) S_.err();
    $("sdStuckTitle").textContent = manual ? "選一台送回纜車站" : "動彈不得了！";
    $("sdStuckText").textContent = manual
      ? `送回去的纜車會回到原本那排的最後面（送回剩 ${MAX_REVERSE - REVERSE} 次）`
      : `纜線上 6 台纜車都繞了一整圈，一顆珠子都吸不到。選一台送回纜車站（送回剩 ${MAX_REVERSE - REVERSE} 次）`;
    $("sdStuckCancel").hidden = !manual;
    const wrap = $("sdStuckCars"); wrap.innerHTML = "";
    S.road.slice().sort((a, b) => b.p - a.p).concat(S.queue).filter(c => c.claimed < c.cap).forEach(car => {
      const b = document.createElement("button"); b.type = "button"; b.className = "sd-stuck-car";
      const c = document.createElement("canvas"); c.width = 132; c.height = 70; b.appendChild(c);
      const t = document.createElement("span"); t.textContent = Math.round(100 * car.claimed / car.cap) + "%"; b.appendChild(t);
      const cg = c.getContext("2d"); const keep = g; g = cg; drawCar(66, 68, car.c, car.claimed / car.cap, 0.92, { noGrip: true }); g = keep;
      b.onclick = () => reverseCar(car);
      wrap.appendChild(b);
    });
    $("sdStuck").hidden = false;
  }
  function hideStuck() { const el = $("sdStuck"); if (el) el.hidden = true; }
  function updateReverseBtn() {
    const b = $("sdReverseBtn"), n = MAX_REVERSE - REVERSE;
    b.textContent = n > 0 ? `🚡 送回纜車站（剩 ${n} 次）` : "🚡 送回次數已用完";
    b.disabled = n <= 0;
  }
  $("sdReverseBtn").onclick = () => {
    if (state !== "play" || REVERSE >= MAX_REVERSE) return;
    if (!S.road.concat(S.queue).some(c => c.claimed < c.cap)) { setMsg("纜線上沒有可以送回去的纜車"); return; }
    showStuck(true);
  };
  $("sdStuckCancel").onclick = () => {
    if (state !== "choose") return;
    hideStuck(); state = "play"; if (T0) T0 += performance.now() - pauseAt; setMsg("");
  };

  /* 提示：一直照建議順序派車就照順序；偏離之後改看「現在」的局面 */
  function suggest() {
    if (Core.onRoad(S) >= MAX_ROAD) return { wait: true };
    if (onTrack && nextK < NCARS) return { lane: nextK % LANES };
    const e = Core.exposed(S.cols, S.ptr, pal.length);
    const busy = new Set(S.road.concat(S.queue).filter(c => c.claimed < c.cap).map(c => c.c));
    let best = -1, bs = 0;
    lanes.forEach((ln, l) => {
      if (!ln.length || e[ln[0].c] === 0) return;
      const sc = (busy.has(ln[0].c) ? 1 : 2) * 1e6 + e[ln[0].c];
      if (sc > bs) { bs = sc; best = l; }
    });
    if (best >= 0) return { lane: best };
    let bd = 1e9; best = -1;
    lanes.forEach((ln, l) => { const d = ln.findIndex(c => e[c.c] > 0); if (d >= 0 && d < bd) { bd = d; best = l; } });
    return best >= 0 ? { lane: best, dig: true } : { wait: true };
  }
  function updateHintBtn() {
    const b = $("sdHintBtn"), n = MAX_HINT - HINTS;
    b.textContent = n > 0 ? `💡 提示（剩 ${n} 次）` : "💡 提示已用完";
    b.disabled = n <= 0;
  }
  $("sdHintBtn").onclick = () => {
    if (state !== "play" || HINTS >= MAX_HINT) return;
    HINTS++; updateHintBtn();
    hint = suggest(); hintUntil = performance.now() + 2800;
    if (hint.lane != null) setMsg(hint.dig ? "💡 前面的纜車都吸不到珠子，先派發亮那排，讓後面的往前" : "💡 派發亮那排最前面的纜車");
    else setMsg("💡 纜車正在吸珠子，等有纜車裝滿離開再派");
  };
  cv.addEventListener("click", e => {
    if (state !== "play") return;
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    if (y < LANE_TOP) return;
    tapLane(Math.min(LANES - 1, Math.floor(x / (W / LANES))), y < LANE_Y + 4 ? 0 : 1 + Math.floor((y - LANE_Y - 4) / LANE_GAP));
  });
  $("sdRestartBtn").onclick = () => { if (L && L.q) reset(); };
  $("sdBackBtn").onclick = showIntro;
  $("sdNextBtn").onclick = () => start((level + 1) % IMAGES.length);
  $("sdRetryBtn").onclick = () => { if (L && L.q) reset(); };
  const mu = $("sdMuteBtn"); const setMu = () => { mu.textContent = MUTE ? "🔇" : "🔊"; mu.setAttribute("aria-label", MUTE ? "開啟音效" : "關閉音效"); }; setMu();
  mu.onclick = () => { MUTE = !MUTE; LS.set("sand2_mute", MUTE ? "1" : "0"); setMu(); };

  /* ---------- 遊戲邏輯（固定每秒 60 步） ---------- */
  function gravity() {
    for (let y = GRID - 2; y >= 0; y--) { const a = grid[y], b = grid[y + 1]; for (let x = 0; x < GRID; x++) if (a[x] >= 0 && b[x] < 0) { b[x] = a[x]; a[x] = -1; } }
  }
  function removeTop(x) { for (let y = 0; y < GRID; y++) if (grid[y][x] >= 0) { grid[y][x] = -1; return y; } return 0; }
  const EV = {
    take: (car, col) => {
      const y = removeTop(col);
      car.pend++;
      parts.push({ x: col * CELL + CELL / 2, y: PIC_Y + y * CELL + CELL / 2, car, c: car.c, t: 0 });
    },
    full: () => S_.full(),
    exit: car => { car.got = car.claimed; car.pend = 0; }
  };
  function tick() {
    S.fast = lanes.every(l => !l.length) && !S.queue.length;   // 車庫空了就加速
    Core.tick(S, EV);
    if (S.left === 0) return;
    if (Core.stuck(S)) {
      if (REVERSE >= MAX_REVERSE) { state = "lose"; S_.lose(); showResult(false); }
      else showStuck();
    }
  }
  // 測試用（不影響遊戲）
  window.__sandDebug = {
    start, tapLane, suggest, reverseCar: i => reverseCar(S.road.slice().sort((a, b) => b.p - a.p)[i]), openReverse: () => $("sdReverseBtn").click(),
    tick: () => { if (state === "play") tick(); },
    info: () => ({ state, left: S ? S.left : -1, NCARS, MISS, REVERSE, onRoad: S ? Core.onRoad(S) : 0, lanesLeft: lanes ? lanes.map(l => l.length) : [] }),
    peek: { S: () => S, lanes: () => lanes, pal: () => pal, onTrack: () => onTrack, nextK: () => nextK },
    finishParts: () => { parts.forEach(p => { p.car.pend--; p.car.got = Math.min(p.car.claimed, p.car.got + 1); }); parts = []; }
  };
  function rate() { if (ELAPSED <= PAR && MISS + REVERSE <= 2) return 3; if (ELAPSED <= PAR * 1.5) return 2; return 1; }
  function win() {
    state = "win"; winT = 0; S_.win();
    const r = rate(), s = starsOf();
    if (!s[level] || r > s[level]) { s[level] = r; LS.set("sand2_stars", JSON.stringify(s)); }
    const d = done(); if (!d.includes(level)) { d.push(level); LS.set("sand2_done", JSON.stringify(d)); }
    showResult(true, r);
  }
  function showResult(ok, r) {
    hideStuck();
    $("sdResult").hidden = false;
    $("sdResultEyebrow").textContent = ok ? "Clear" : "Stuck";
    $("sdResultTitle").textContent = ok ? "過關！沙畫完成" : "動彈不得…";
    $("sdResultStars").innerHTML = ok ? '<span class="on">' + "★".repeat(r) + "</span>" + "☆".repeat(3 - r) : "";
    $("sdResultStars").hidden = !ok;
    $("sdResultDetail").textContent = ok
      ? `用時 ${fmt(ELAPSED)}（標準 ${fmt(PAR)}）・失誤 ${MISS} 次` + (REVERSE ? `・送回 ${REVERSE} 次` : "")
      : "送回次數用完，纜線上的纜車又都吸不到珠子了。派纜車前先看看圖畫最上面露出哪些顏色！";
    $("sdNextBtn").hidden = !ok;
    $("sdRetryBtn").textContent = ok ? "再玩一次" : "重新開始";
    setMsg(ok ? "" : "😢 動彈不得");
    setTimeout(() => $("sdResult").scrollIntoView({ behavior: "smooth", block: "nearest" }), 300);
  }

  /* ---------- 繪圖工具 ---------- */
  const mix = (p, to, k) => p.map(v => Math.round(v + (to - v) * k));
  const rgb = p => `rgb(${p[0]},${p[1]},${p[2]})`;
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* 纜車（正面）：上面是掛在纜線上的滑輪夾，吊臂往下接車廂。
     fill：0~1，車廂由下往上從淡色變成珠子的顏色。(x, yb) = 車廂底部中心；sc = 縮放（原始尺寸 60×70，最上面 y=0 是纜線） */
  function drawCar(x, yb, c, fill, sc, opt) {
    opt = opt || {};
    const P = pal[c], L = 0.299 * P[0] + 0.587 * P[1] + 0.114 * P[2];
    const base = rgb(P), pale = rgb(mix(P, 255, .6));
    const line = L < 55 ? "#1b191a" : rgb(mix(P, 0, .45));
    const STEEL = "#3B4A5C", GLASS = "#F4EBDD", GLASS_D = "#E3D3BE";
    g.save(); g.translate(x - 30 * sc, yb - 70 * sc); g.scale(sc, sc);
    if (opt.alpha != null) g.globalAlpha = opt.alpha;
    if (opt.bounce) g.translate(0, -Math.sin(opt.bounce * Math.PI) * 2.5);
    g.lineJoin = "round"; g.lineCap = "round";
    // 滑輪夾＋吊臂
    if (!opt.noGrip) {
      g.fillStyle = STEEL; g.beginPath(); g.roundRect ? g.roundRect(19, -2, 22, 6, 2) : g.rect(19, -2, 22, 6); g.fill();
      g.fillStyle = "#8C9AAB"; for (const wx of [23, 30, 37]) { g.beginPath(); g.arc(wx, -2, 2.2, 0, 7); g.fill(); }
      g.strokeStyle = STEEL; g.lineWidth = 3; g.beginPath(); g.moveTo(30, 4); g.bezierCurveTo(30, 12, 33, 14, 31, 22); g.stroke();
    }
    g.fillStyle = STEEL; g.beginPath(); g.roundRect ? g.roundRect(20, 21, 20, 4, 1.5) : g.rect(20, 21, 20, 4); g.fill();
    // 車廂：兩側微微外凸、底部圓弧
    const body = () => {
      g.beginPath();
      g.moveTo(12, 25); g.lineTo(48, 25);
      g.bezierCurveTo(54, 25, 56, 40, 55, 52);
      g.bezierCurveTo(54, 64, 50, 70, 42, 70);
      g.lineTo(18, 70);
      g.bezierCurveTo(10, 70, 6, 64, 5, 52);
      g.bezierCurveTo(4, 40, 6, 25, 12, 25);
      g.closePath();
    };
    body(); g.fillStyle = pale; g.fill();
    if (fill > 0) { g.save(); body(); g.clip(); g.fillStyle = base; g.fillRect(0, 70 - 46 * Math.min(1, fill), 60, 46); g.restore(); }
    g.lineWidth = 1.6; g.strokeStyle = line; body(); g.stroke();
    // 兩側小窗
    g.fillStyle = GLASS_D;
    g.beginPath(); g.moveTo(10, 32); g.quadraticCurveTo(7, 42, 9, 52); g.lineTo(12.5, 52); g.lineTo(12.5, 32); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(50, 32); g.quadraticCurveTo(53, 42, 51, 52); g.lineTo(47.5, 52); g.lineTo(47.5, 32); g.closePath(); g.fill();
    // 兩扇門＋門上的窗
    g.strokeStyle = line; g.lineWidth = 1.2; g.strokeRect(16, 29, 28, 39);
    g.beginPath(); g.moveTo(30, 29); g.lineTo(30, 68); g.stroke();
    for (const wx of [18.5, 32]) {
      const gr = g.createLinearGradient(0, 31, 0, 51); gr.addColorStop(0, GLASS); gr.addColorStop(1, GLASS_D);
      g.fillStyle = gr; g.fillRect(wx, 31, 9.5, 20);
      g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 0.8; g.beginPath(); g.moveTo(wx, 35); g.lineTo(wx + 9.5, 35); g.stroke();
      g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 1; g.beginPath(); g.moveTo(wx + 2, 48); g.lineTo(wx + 6, 38); g.stroke();
    }
    g.restore();
  }

  /* 有光澤的圓珠：每種顏色先畫好一顆，之後直接貼上 */
  let beadCache = null, beadPal = null, holeBg = null, board = { color: "#2E2F35", dark: true };
  /* 底板顏色：從幾種底色裡，挑跟這關所有珠子顏色差最多的那個（例如黑珠子多就用淺色底板） */
  const BOARDS = ["#2E2F35", "#F1EBDF", "#8E8A82", "#CBD9D0", "#DCCDB9", "#4A5A55"];
  function pickBoard(p) {
    let best = BOARDS[0], bd = -1;
    for (const hx of BOARDS) {
      const c = [1, 3, 5].map(k => parseInt(hx.substr(k, 2), 16)), L = toLab(c);
      const d = Math.min(...p.map(q => { const Q = toLab(q); return Math.hypot(L[0] - Q[0], L[1] - Q[1], L[2] - Q[2]); }));
      if (d > bd) { bd = d; best = hx; }
    }
    const c = [1, 3, 5].map(k => parseInt(best.substr(k, 2), 16));
    return { color: best, dark: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] < 110 };
  }
  function beadSprite(p) {
    const sz = Math.round(CELL * DPR), c = document.createElement("canvas"); c.width = c.height = sz;
    const b = c.getContext("2d"), r = sz * 0.47, cx = sz / 2, cy = sz / 2;
    const lite = mix(p, 255, .45), dark = mix(p, 0, .28);
    const gr = b.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r);
    gr.addColorStop(0, rgb(lite)); gr.addColorStop(.45, rgb(p)); gr.addColorStop(1, rgb(dark));
    b.fillStyle = gr; b.beginPath(); b.arc(cx, cy, r, 0, 7); b.fill();
    b.fillStyle = "rgba(255,255,255,.55)"; b.beginPath(); b.ellipse(cx - r * .32, cy - r * .38, r * .22, r * .14, -.6, 0, 7); b.fill();
    // 細邊：深色珠子加亮邊、淺色珠子加暗邊，放在任何底板上都看得出輪廓
    const lum = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
    b.strokeStyle = lum < 110 ? "rgba(255,255,255,.32)" : "rgba(0,0,0,.22)"; b.lineWidth = Math.max(1, sz * 0.07);
    b.beginPath(); b.arc(cx, cy, r - b.lineWidth / 2, 0, 7); b.stroke();
    return c;
  }
  // 車子上的數字：還能裝幾顆
  function carLabel(x, y, n, size) {
    g.font = `800 ${size}px "Noto Sans TC",sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 3.5; g.strokeStyle = "rgba(32,30,31,.85)"; g.lineJoin = "round"; g.strokeText(String(n), x, y);
    g.fillStyle = "#fff"; g.fillText(String(n), x, y);
    g.textAlign = "left"; g.textBaseline = "alphabetic";
  }
  function drawSand() {
    if (beadPal !== pal) { beadPal = pal; beadCache = pal.map(beadSprite); board = pickBoard(pal); holeBg = null; }
    // 深色底板＋每格一個淡淡的凹洞（只畫一次，之後直接貼上）
    if (!holeBg) {
      holeBg = document.createElement("canvas"); holeBg.width = Math.round(W * DPR); holeBg.height = Math.round(PIC_H * DPR);
      const h = holeBg.getContext("2d"); h.scale(DPR, DPR);
      h.fillStyle = board.color; h.fillRect(0, 0, W, PIC_H); h.fillStyle = board.dark ? "rgba(0,0,0,.25)" : "rgba(0,0,0,.10)";
      for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) { h.beginPath(); h.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, CELL * .3, 0, 7); h.fill(); }
    }
    g.drawImage(holeBg, 0, 0, W, PIC_H);
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) { const v = grid[y][x]; if (v >= 0) g.drawImage(beadCache[v], x * CELL, y * CELL, CELL, CELL); }
  }


  function draw(now) {
    // 固定步長：不管螢幕是 60Hz 還是 120Hz，遊戲速度都一樣
    const dt = Math.min(100, (now || 0) - (lastT || now || 0)); lastT = now;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = "#F6F2EA"; g.fillRect(0, 0, W, H);
    g.fillStyle = board.color; g.fillRect(0, PIC_Y, W, PIC_H);
    if (!grid || state === "loading" || state === "idle") { requestAnimationFrame(draw); return; }

    if (state === "play") {
      acc += dt;
      while (acc >= 1000 / TICK_HZ && state === "play") { tick(); acc -= 1000 / TICK_HZ; }
      if (T0) ELAPSED = (performance.now() - T0) / 1000;
      if (S.left === 0 && !parts.length && state === "play") win();
    }

    g.save(); g.translate(0, PIC_Y);
    if (state === "win") {
      winT = Math.min(1, winT + 0.025); drawSand(); g.globalAlpha = winT; g.imageSmoothingEnabled = true;
      const s = Math.min(img.width, img.height); g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, W, PIC_H); g.globalAlpha = 1;
    } else drawSand();
    g.restore();

    // 纜線（兩條，下面那條是纜車掛的）
    g.strokeStyle = "#6B4A36"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, CABLE_Y - 6); g.lineTo(W, CABLE_Y - 6); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.moveTo(0, CABLE_Y); g.lineTo(W, CABLE_Y); g.stroke();
    // 兩端的支架
    g.fillStyle = "#3B4A5C";
    for (const ax of [0, W - 6]) { g.fillRect(ax, CABLE_Y - 9, 6, 14); }

    // 纜線上的纜車
    const nowMs = performance.now();
    for (const car of S.road) {
      const x = Core.carX(car);
      if (x < -50 || x > W + 50) continue;
      const stuckGlow = state === "stuck" || state === "choose";
      if (stuckGlow) { g.fillStyle = `rgba(200,55,45,${.18 + .1 * Math.sin(nowMs / 180)})`; rr(x - 25, CABLE_Y + 14, 50, CAR_Y - CABLE_Y - 12, 10); g.fill(); }
      drawCar(x, CAR_Y, car.c, car.got / car.cap, CAR_SC, {});
      carLabel(x, CAR_Y - 22, car.cap - car.claimed, 12);
    }
    // 等待出發的纜車
    if (S.queue.length) {
      g.font = '600 11px "Noto Sans TC",sans-serif'; g.fillStyle = "#B08A3E"; g.textAlign = "left";
      g.fillText("等待出發 " + S.queue.length, 10, CABLE_Y + 22);
    }

    // 車庫（等候車道）
    const hintLane = (nowMs < hintUntil && hint && hint.lane != null) ? hint.lane : -1;
    g.font = '600 12px "Noto Sans TC",sans-serif'; g.fillStyle = "#5C6B73"; g.textAlign = "left";
    g.fillText("纜車站", 12, LANE_TOP - 10);
    g.textAlign = "right"; g.fillStyle = Core.onRoad(S) >= MAX_ROAD ? "#A8392E" : "#5C6B73";
    g.fillText("纜線上 " + Core.onRoad(S) + " / " + MAX_ROAD, W - 12, LANE_TOP - 10); g.textAlign = "left";
    lanes.forEach((ln, l) => {
      const cx = laneX(l), lx = l * W / LANES + 8, lw = W / LANES - 16;
      g.fillStyle = l === hintLane ? "rgba(176,138,62,.16)" : "rgba(112,128,144,.06)";
      rr(lx, LANE_TOP, lw, H - LANE_TOP - 8, 14); g.fill();
      if (l === hintLane) { g.strokeStyle = "rgba(176,138,62,.8)"; g.lineWidth = 2; rr(lx, LANE_TOP, lw, H - LANE_TOP - 8, 14); g.stroke(); }
      const fl = flash.find(f => f.l === l);
      if (fl) { g.fillStyle = `rgba(168,35,24,${.12 * (1 - fl.t)})`; rr(lx, LANE_TOP, lw, H - LANE_TOP - 8, 14); g.fill(); }
      ln.slice(0, 4).forEach((s, k) => {
        if (k === 0) { drawCar(cx, LANE_Y, s.c, 1, GARAGE_SC, { noGrip: true }); carLabel(cx, LANE_Y - 18, s.cap - s.claimed, 14); }
        else drawCar(cx, LANE_Y + k * LANE_GAP, s.c, 1, GARAGE_SC * 0.92, { noGrip: true, alpha: .9 });
      });
      if (ln.length) {
        const bob = l === hintLane ? Math.sin(nowMs / 120) * 3 : 0;
        g.fillStyle = l === hintLane ? "#B08A3E" : "rgba(92,107,115,.35)";
        g.beginPath(); g.moveTo(cx - 6, LANE_TOP + 6 + bob); g.lineTo(cx + 6, LANE_TOP + 6 + bob); g.lineTo(cx, LANE_TOP + 13 + bob); g.closePath(); g.fill();
      } else { g.fillStyle = "rgba(92,107,115,.45)"; g.textAlign = "center"; g.fillText("空", cx, LANE_Y - 10); g.textAlign = "left"; }
      if (ln.length > 4) { g.fillStyle = "#708090"; g.textAlign = "center"; g.font = '600 12px "Noto Sans TC",sans-serif'; g.fillText("+" + (ln.length - 4), cx, H - 16); g.textAlign = "left"; }
    });
    flash.forEach(f => f.t += 0.06); flash = flash.filter(f => f.t < 1);

    // 沙粒從沙畫底部被吸進車裡
    if (state !== "stuck" && state !== "choose") parts = parts.filter(p => {
      p.t += 0.12;
      const tx = Core.carX(p.car), ty = CAR_Y - 18, e = Math.min(1, p.t);
      g.fillStyle = rgb(pal[p.c]);
      if (beadCache) g.drawImage(beadCache[p.c], p.x + (tx - p.x) * e - 3.5, p.y + (ty - p.y) * e - 3.5, 7, 7);
      if (p.t >= 1) { p.car.pend--; p.car.got = Math.min(p.car.claimed, p.car.got + 1); if (Math.random() < 0.03) S_.grain(); return false; }
      return true;
    });

    $("sdPct").textContent = "進度 " + Math.round(100 * (1 - S.left / total)) + "%";
    $("sdTime").textContent = "⏱ " + fmt(ELAPSED) + " / " + fmt(PAR);
    $("sdMiss").textContent = "失誤 " + MISS + "・送回剩 " + (MAX_REVERSE - REVERSE);
    requestAnimationFrame(draw);
  }

  renderPicker();
  requestAnimationFrame(draw);
})();
