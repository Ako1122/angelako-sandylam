/* ===== 沙畫消消樂 ===== */
(function () {
  "use strict";

  /* ---------- 關卡圖片（相對於 sand-drop.html 的路徑） ---------- */
  const IMAGES = ["images/covers/01.jpg", "images/covers/02.jpg", "images/covers/03.jpg", "images/covers/04.jpg", "images/covers/05.jpg", "images/covers/06.jpg", "images/covers/07.jpg", "images/covers/08.jpg", "images/covers/09.jpg", "images/covers/10.jpg", "images/covers/11.jpg", "images/covers/12.jpg", "images/covers/13.jpg", "images/covers/14.jpg", "images/covers/15.jpg", "images/covers/16.jpg", "images/covers/17.jpg", "images/covers/18.jpg", "images/covers/19.jpg", "images/covers/20.jpg", "images/covers/21.jpg", "images/covers/22.jpg", "images/covers/23.jpg", "images/covers/24.jpg", "images/covers/25.jpg", "images/covers/26.jpg", "images/covers/27.jpg", "images/covers/28.jpg", "images/covers/29.jpg", "images/covers/30.jpg", "images/covers/31.jpg", "images/covers/32.jpg", "images/covers/33.webp", "images/covers/34.jpg", "images/covers/35.jpg", "images/covers/36.jpg", "images/covers/37.webp", "images/covers/38.jpg", "images/covers/39.jpg", "images/covers/40.jpg", "images/covers/41.jpg", "images/covers/42.jpg", "images/covers/43.jpg", "images/covers/44.jpg", "images/covers/45.jpg", "images/covers/46.jpg", "images/covers/47.jpg", "images/covers/48.jpg", "images/covers/49.jpg", "images/covers/50.jpg", "images/covers/51.jpg", "images/covers/52.jpg", "images/covers/53.webp", "images/covers/54.jpg", "images/covers/55.jpg", "images/covers/56.jpg", "images/covers/57.jpg", "images/covers/58.webp", "images/covers/59.jpg", "images/covers/60.jpg", "images/covers/61.jpg", "images/covers/62.jpg", "images/covers/63.jpg", "images/covers/64.jpg", "images/covers/65.jpg", "images/covers/66.jpg", "images/covers/67.jpg", "images/covers/68.jpg", "images/covers/69.jpg", "images/covers/70.webp", "images/covers/71.jpg", "images/covers/72.jpg", "images/covers/73.webp", "images/covers/74.jpg", "images/covers/75.jpg", "images/covers/76.jpg", "images/covers/77.webp", "images/covers/78.jpg"];

  const GRID = 160;          // 沙畫解析度：160×160 粒
  const W = 400;             // 畫面寬度
  const CELL = W / GRID;     // 一粒沙的寬度（px）
  const LANES = 3;           // 三排等候車道（車庫）
  const MAX_ROAD = 6;        // 路上最多同時幾台車
  const TICK_HZ = 60;        // 遊戲邏輯每秒跑 60 步（固定步長，跟螢幕更新率無關）
  const SPEED = W / (4 * TICK_HZ);   // 車速：約 4 秒從左開到右
  const FAST_SPEED = W / (1 * TICK_HZ);   // 車庫的車全部派出後：約 1 秒從左開到右
  const ENTER_X = -40;       // 車子從畫面左邊外面進場
  const EXIT_X = W + 40;     // 裝滿的車開到右邊外面就離場
  const LOOP = 600;          // 繞一圈的長度：畫面 400 + 左右兩邊各 40 + 回到左邊的路 120
  const GAP = 56;            // 車與車之間的距離（路上最多 5 台時，入口一定等得到 2×GAP 的空位：600÷5 = 120 > 112）
  const INTAKE = 12;         // 車子正上方左右各 12px 範圍內的沙都接得到
  const TAKE_PER_TICK = 6;   // 每台車每步最多吸幾粒
  const MAX_REVERSE = 5;     // 每關可以丟回車庫的次數
  const MAX_HINT = 3;        // 每關可以用提示的次數

  function difficulty(i) {
    const t = i / (IMAGES.length - 1);
    return {
      colors: t < 1 / 3 ? 4 : t < 2 / 3 ? 5 : 6,
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
      if (S.queue.length && Core.entryFree(S)) {
        const car = S.queue.shift(); car.p = 0; car.dry = 0; S.road.push(car);
        if (ev && ev.enter) ev.enter(car);
      }
      let moved = false;
      const order = S.road.slice().sort((a, b) => b.p - a.p);   // 前面的車先吸
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
    stuck(S) { return S.road.length > 0 && Core.onRoad(S) >= MAX_ROAD && S.road.every(c => c.dry >= LOOP); },
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
    PLAYERS: [{ m: 0 }, { m: 10 }, { m: 20 }, { m: 30 }, { m: 45 }, { m: 60 }, { m: 90 }, { m: 120 }, { m: 160 }, { m: 200 }],
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
        if (best && Date.now() - t0 > 1100) break;   // 最多花約 1 秒挑最穩的順序
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
    if (h < 228 || h > 340 || sat < 0.15 || l < 0.08 || l > 0.95) return rgb;
    const h2 = h < 290 ? 212 : 348;   // 偏藍的紫 → 藍；偏粉的紫 → 玫瑰紅
    const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs((h2 / 60) % 2 - 1)), m = l - c / 2;
    const seg = Math.floor(h2 / 60), rgb1 = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
    return rgb1.map(v => clamp255((v + m) * 255));
  }
  const MIN_DE = 0.22;
  const MAX_HUE_SHIFT = 0.7;   // 色相最多偏移約 40 度，保留原圖的感覺
  function vividPalette(labCenters) {
    const n = labCenters.length;
    const P = labCenters.map(x => {
      const c = Math.hypot(x[1], x[2]), h = Math.atan2(x[2], x[1]);
      const c2 = c < 0.03 ? c * 0.6 : Math.min(0.26, Math.max(0.13, c * 2.2));
      return toLab(noPurple(lch2rgb(x[0], c2, h)));
    });
    const H0 = P.map(x => Math.atan2(x[2], x[1]));
    const order = [...Array(n).keys()].sort((a, b) => P[a][0] - P[b][0]);
    P[order[0]] = toLab(lch2rgb(Math.min(P[order[0]][0], 0.22), Math.hypot(P[order[0]][1], P[order[0]][2]), Math.atan2(P[order[0]][2], P[order[0]][1])));
    P[order[n - 1]] = toLab(lch2rgb(Math.max(P[order[n - 1]][0], 0.95), Math.hypot(P[order[n - 1]][1], P[order[n - 1]][2]), Math.atan2(P[order[n - 1]][2], P[order[n - 1]][1])));
    for (let it = 0; it < 600; it++) {
      let worst = Infinity;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const dL = P[j][0] - P[i][0], da = P[j][1] - P[i][1], db = P[j][2] - P[i][2];
        const d = Math.hypot(dL, da, db);
        worst = Math.min(worst, d);
        if (d >= MIN_DE) continue;
        // 推開的方向：明暗加權 1.6 倍（暗色、淺色主要靠明暗拉開）；兩色幾乎一樣時直接用明暗
        let v = d < 1e-4 ? [1, 0, 0] : [dL * 2.2, da, db];
        if (Math.abs(v[0]) < 1e-4 && d >= 1e-4) v[0] = (P[i][0] < 0.5 ? 1 : -1) * 0.02;
        // 兩色都很亮或都很暗時，螢幕能顯示的彩度很小，往色相方向推不開 → 改以明暗為主
        const tight = (P[i][0] > 0.82 && P[j][0] > 0.82) || (P[i][0] < 0.28 && P[j][0] < 0.28);
        if (tight) v[0] = (dL >= 0 ? 1 : -1) * Math.max(Math.abs(v[0]), 2 * Math.hypot(v[1], v[2]), 0.02);
        const len = Math.hypot(v[0], v[1], v[2]), k = (MIN_DE - d) * 0.3 / len;
        for (let q = 0; q < 3; q++) { P[i][q] -= v[q] * k; P[j][q] += v[q] * k; }
      }
      if (worst >= MIN_DE) break;
      // 拉回能顯示的範圍
      for (let i = 0; i < n; i++) {
        const L = Math.max(0.08, Math.min(0.98, P[i][0])), C = Math.hypot(P[i][1], P[i][2]);
        let h = Math.atan2(P[i][2], P[i][1]);
        if (C > 0.04) { const dh = Math.atan2(Math.sin(h - H0[i]), Math.cos(h - H0[i])); if (Math.abs(dh) > MAX_HUE_SHIFT) h = H0[i] + Math.sign(dh) * MAX_HUE_SHIFT; }
        P[i] = toLab(noPurple(lch2rgb(L, Math.min(C, 0.3), h)));
      }
    }
    return P.map(x => noPurple(fromLab(x).map(clamp255)));
  }
  function loadImage(src) { return new Promise((res, rej) => { const m = new Image(); m.onload = () => res(m); m.onerror = rej; m.src = src; }); }
  function makeLevel(im, nColors, nCars, seed) {
    const t = document.createElement("canvas"); t.width = t.height = GRID;
    const x = t.getContext("2d", { willReadFrequently: true });
    const s = Math.min(im.width, im.height);
    x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, GRID, GRID);
    const d = x.getImageData(0, 0, GRID, GRID).data, px = [];
    for (let k = 0; k < d.length; k += 4) px.push([d[k], d[k + 1], d[k + 2]]);
    const km = kmeansLab(px, nColors), grid = [];
    for (let y = 0; y < GRID; y++) { const row = new Int8Array(GRID); for (let X = 0; X < GRID; X++) row[X] = km.index[y * GRID + X]; grid.push(row); }
    const pal = vividPalette(km.centers);
    const cols = []; for (let X = 0; X < GRID; X++) { const c = new Int8Array(GRID); for (let y = 0; y < GRID; y++) c[y] = grid[GRID - 1 - y][X]; cols.push(c); }
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
  const done = () => { try { return JSON.parse(LS.get("sand_done") || "[]"); } catch (e) { return []; } };
  const starsOf = () => { try { return JSON.parse(LS.get("sand_stars") || "{}"); } catch (e) { return {}; } };
  const fmt = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

  /* ---------- 音效 ---------- */
  let AC, MUTE = LS.get("sand_mute") === "1";
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
  const H = 720, DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * DPR; cv.height = H * DPR;
  const PIC_H = 400, ROAD_Y = 404, ROAD_H = 56, CAR_Y = ROAD_Y + 44, CAR_SC = 0.55;
  const LANE_TOP = 494, LANE_Y = LANE_TOP + 64, LANE_GAP = 40;
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
    setMsg("點車庫最前面的車派上路，它經過時會吸走上方同顏色的沙！");
  }
  function setMsg(t) { $("sdMsg").textContent = t; }

  /* ---------- 操作 ---------- */
  const laneX = l => (l + .5) * W / LANES;
  function tapLane(l, k) {
    if (state !== "play") return false;
    const ln = lanes[l];
    if (!ln || !ln.length) return false;
    if (!T0) T0 = performance.now();
    if (k > 0) { setMsg("🚧 前面的車還沒開走，後面的車出不去！"); S_.err(); MISS++; flash.push({ l, t: 0 }); return false; }
    if (Core.onRoad(S) >= MAX_ROAD) { setMsg("路上已經有 6 台車了，等有車裝滿離開再派"); S_.err(); return false; }
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
    setMsg(`🚗 丟回車庫了（倒車剩 ${MAX_REVERSE - REVERSE} 次）`);
    return true;
  }
  // manual = 玩家自己按「丟回車庫」；否則是動彈不得時自動跳出
  function showStuck(manual) {
    state = manual ? "choose" : "stuck"; pauseAt = performance.now(); if (!manual) S_.err();
    $("sdStuckTitle").textContent = manual ? "選一台丟回車庫" : "動彈不得了！";
    $("sdStuckText").textContent = manual
      ? `丟回去的車會回到原本那排車庫的最後面（倒車剩 ${MAX_REVERSE - REVERSE} 次）`
      : `路上 6 台車都繞了一整圈，一粒沙都接不到。選一台丟回車庫（倒車剩 ${MAX_REVERSE - REVERSE} 次）`;
    $("sdStuckCancel").hidden = !manual;
    const wrap = $("sdStuckCars"); wrap.innerHTML = "";
    S.road.slice().sort((a, b) => b.p - a.p).concat(S.queue).filter(c => c.claimed < c.cap).forEach(car => {
      const b = document.createElement("button"); b.type = "button"; b.className = "sd-stuck-car";
      const c = document.createElement("canvas"); c.width = 132; c.height = 70; b.appendChild(c);
      const t = document.createElement("span"); t.textContent = Math.round(100 * car.claimed / car.cap) + "%"; b.appendChild(t);
      const cg = c.getContext("2d"); const keep = g; g = cg; drawCar(66, 64, car.c, car.claimed / car.cap, 1.2, { flip: true }); g = keep;
      b.onclick = () => reverseCar(car);
      wrap.appendChild(b);
    });
    $("sdStuck").hidden = false;
  }
  function hideStuck() { const el = $("sdStuck"); if (el) el.hidden = true; }
  function updateReverseBtn() {
    const b = $("sdReverseBtn"), n = MAX_REVERSE - REVERSE;
    b.textContent = n > 0 ? `🚗 丟回車庫（剩 ${n} 次）` : "🚗 倒車次數已用完";
    b.disabled = n <= 0;
  }
  $("sdReverseBtn").onclick = () => {
    if (state !== "play" || REVERSE >= MAX_REVERSE) return;
    if (!S.road.concat(S.queue).some(c => c.claimed < c.cap)) { setMsg("路上沒有可以丟回車庫的車"); return; }
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
    if (hint.lane != null) setMsg(hint.dig ? "💡 前面的車都吸不到沙，先派發亮那排，讓後面的車往前" : "💡 派發亮那排最前面的車");
    else setMsg("💡 路上的車正在吸沙，等有車裝滿離開再派");
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
  mu.onclick = () => { MUTE = !MUTE; LS.set("sand_mute", MUTE ? "1" : "0"); setMu(); };

  /* ---------- 遊戲邏輯（固定每秒 60 步） ---------- */
  function gravity() {
    for (let y = GRID - 2; y >= 0; y--) { const a = grid[y], b = grid[y + 1]; for (let x = 0; x < GRID; x++) if (a[x] >= 0 && b[x] < 0) { b[x] = a[x]; a[x] = -1; } }
  }
  function removeBottom(x) { for (let y = GRID - 1; y >= 0; y--) if (grid[y][x] >= 0) { grid[y][x] = -1; return y; } return 0; }
  const EV = {
    take: (car, col) => {
      const y = removeBottom(col);
      car.pend++;
      parts.push({ x: col * CELL + CELL / 2, y: y * CELL, car, c: car.c, t: 0 });
    },
    full: () => S_.full(),
    exit: car => { car.got = car.claimed; car.pend = 0; }
  };
  function tick() {
    if (S.t % 2 === 0) gravity();
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
    if (!s[level] || r > s[level]) { s[level] = r; LS.set("sand_stars", JSON.stringify(s)); }
    const d = done(); if (!d.includes(level)) { d.push(level); LS.set("sand_done", JSON.stringify(d)); }
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
      ? `用時 ${fmt(ELAPSED)}（標準 ${fmt(PAR)}）・失誤 ${MISS} 次` + (REVERSE ? `・倒車 ${REVERSE} 次` : "")
      : "倒車次數用完，路上的車又都吸不到沙了。派車前先看看沙畫最底下露出哪些顏色！";
    $("sdNextBtn").hidden = !ok;
    $("sdRetryBtn").textContent = ok ? "再玩一次" : "重新開始";
    setMsg(ok ? "" : "😢 動彈不得");
    setTimeout(() => $("sdResult").scrollIntoView({ behavior: "smooth", block: "nearest" }), 300);
  }

  /* ---------- 繪圖工具 ---------- */
  const mix = (p, to, k) => p.map(v => Math.round(v + (to - v) * k));
  const rgb = p => `rgb(${p[0]},${p[1]},${p[2]})`;
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* 側面金龜車（原圖面向左，opt.flip 時面向右）。fill：0~1，車身由下往上從淡色變成沙子的顏色。
     (x, yb) = 車子底部中心；sc = 縮放（原始尺寸 100×50） */
  function drawCar(x, yb, c, fill, sc, opt) {
    const P = pal[c];
  opt=opt||{};
    const lum=0.299*P[0]+0.587*P[1]+0.114*P[2];
  const base=rgb(P), pale=rgb(mix(P,255,.6));
  const fenderBase=rgb(mix(P,0,.08)), fenderPale=rgb(mix(mix(P,255,.6),0,.06));
  const line=lum<55?'#1b191a':rgb(mix(P,0,.45));
  const CHROME='#D9DDE0', CHROME_D='#9EA6AC', TIRE='#2A2627', CREAM='#FBF3E2';
  g.save(); g.translate(x - 50 * sc, yb - 50 * sc); g.scale(sc, sc);
  if (opt.flip) { g.translate(100, 0); g.scale(-1, 1); }   // 車頭朝右
  if(opt.alpha!=null) g.globalAlpha=opt.alpha;
  if(opt.bounce){const b=Math.sin(opt.bounce*Math.PI)*2.5; g.translate(0,-b);}
  g.lineJoin='round'; g.lineCap='round';
  // 影子
  g.fillStyle='rgba(32,30,31,.14)'; g.beginPath(); g.ellipse(50,50.2,46,2.6,0,0,7); g.fill();
  const shell=()=>{g.beginPath();
    g.moveTo(9,38); g.bezierCurveTo(5,36,5,29,13,27);       // 車頭
    g.bezierCurveTo(19,25.5,25,24,30,22.5);                 // 引擎蓋（前行李廂）
    g.bezierCurveTo(34,11,43,5.5,55,5.5);                    // 擋風玻璃
    g.bezierCurveTo(70,5.5,83,12,90,24);                     // 圓頂車頂
    g.bezierCurveTo(94,30,95,35,92,38);                      // 車尾
    g.closePath();};
  const fender=(cx,a,b)=>{g.beginPath();
    g.moveTo(cx-a,40.5); g.bezierCurveTo(cx-a,30,cx-9,25,cx,25); g.bezierCurveTo(cx+9,25,cx+b,30,cx+b,40.5);
    g.lineTo(cx+11,40.5); g.arc(cx,41,11,0,Math.PI,true); g.closePath();};
  const fF=()=>fender(22,16,15), fR=()=>fender(78,15,17);
  const paint=(path,pl,bs)=>{path(); g.fillStyle=pl; g.fill();
    if(fill>0){g.save(); path(); g.clip(); g.fillStyle=bs; g.fillRect(0,41-37*Math.min(1,fill),100,40); g.restore();}
    g.lineWidth=1.5; g.strokeStyle=line; path(); g.stroke();};
  // 車身
  paint(shell,pale,base);
  // 車窗
  const win=()=>{g.beginPath(); g.moveTo(35,21.5); g.bezierCurveTo(38,13,45,9.3,55,9.3); g.bezierCurveTo(66,9.3,76,13.5,82.5,21.5); g.closePath();};
  win(); g.fillStyle='#E6EDF0'; g.fill();
  g.save(); win(); g.clip();
  g.fillStyle='rgba(255,255,255,.75)'; g.beginPath(); g.moveTo(44,22); g.lineTo(50,8); g.lineTo(54,8); g.lineTo(48,22); g.closePath(); g.fill();
  g.fillStyle='rgba(112,128,144,.18)'; g.fillRect(30,17,60,6);
  g.restore();
  g.lineWidth=1.3; g.strokeStyle=line; win(); g.stroke();
  // B 柱
  g.strokeStyle=line; g.lineWidth=2.4; g.beginPath(); g.moveTo(61,9.6); g.lineTo(61.5,21.5); g.stroke();
  // 車門線、門把
  g.strokeStyle='rgba(0,0,0,.22)'; g.lineWidth=1; g.beginPath(); g.moveTo(36,23); g.bezierCurveTo(36.5,30,37,35,37.5,38); g.moveTo(61.5,22); g.lineTo(62,38); g.stroke();
  g.fillStyle=CHROME; g.strokeStyle=CHROME_D; g.lineWidth=.6; g.beginPath(); g.roundRect?g.roundRect(54,25,5,1.8,.9):g.rect(54,25,5,1.8); g.fill(); g.stroke();
  // 車頂光澤
  g.strokeStyle='rgba(255,255,255,.45)'; g.lineWidth=1.6; g.beginPath(); g.moveTo(58,7.3); g.bezierCurveTo(68,7.6,77,11.5,83,17.5); g.stroke();
  // 輪子
  for(const cx of [22,78]){
    g.fillStyle=TIRE; g.beginPath(); g.arc(cx,41,9,0,7); g.fill();
    g.fillStyle=CREAM; g.beginPath(); g.arc(cx,41,5.4,0,7); g.fill();
    g.fillStyle=CHROME; g.strokeStyle=CHROME_D; g.lineWidth=.7; g.beginPath(); g.arc(cx,41,2.6,0,7); g.fill(); g.stroke();
  }
  // 腳踏板
  g.fillStyle='#3a3536'; g.beginPath(); g.moveTo(36,39); g.lineTo(64,39); g.lineTo(63.5,41.6); g.lineTo(36.5,41.6); g.closePath(); g.fill();
  // 葉子板
  paint(fF,fenderPale,fenderBase); paint(fR,fenderPale,fenderBase);
  // 大燈（青蛙眼）
  g.fillStyle=CHROME; g.strokeStyle=CHROME_D; g.lineWidth=.8; g.beginPath(); g.ellipse(11.5,30,3.4,4.2,-.25,0,7); g.fill(); g.stroke();
  g.fillStyle='#FFF6DA'; g.beginPath(); g.ellipse(11,30,2.3,3.1,-.25,0,7); g.fill();
  g.fillStyle='rgba(255,255,255,.9)'; g.beginPath(); g.arc(10.2,28.8,.9,0,7); g.fill();
  // 尾燈
  g.fillStyle='#C8473B'; g.beginPath(); g.ellipse(93.3,31.5,1.5,3,.2,0,7); g.fill();
  // 保險桿
  for(const [bx,w] of [[1.5,10],[89,10]]){g.fillStyle=CHROME; g.strokeStyle=CHROME_D; g.lineWidth=.8; g.beginPath(); g.roundRect?g.roundRect(bx,36.4,w,2.9,1.45):g.rect(bx,36.4,w,2.9); g.fill(); g.stroke();}
    g.restore();
  }

  function drawSand() {
    const D = oimg.data;
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const v = grid[y][x], k = (y * GRID + x) * 4;
      if (v >= 0) { const p = pal[v]; D[k] = p[0]; D[k + 1] = p[1]; D[k + 2] = p[2]; D[k + 3] = 255; } else D[k + 3] = 0;
    }
    og.putImageData(oimg, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(off, 0, 0, W, PIC_H);
  }


  function draw(now) {
    // 固定步長：不管螢幕是 60Hz 還是 120Hz，遊戲速度都一樣
    const dt = Math.min(100, (now || 0) - (lastT || now || 0)); lastT = now;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = "#EDE7DA"; g.fillRect(0, 0, W, PIC_H);
    g.fillStyle = "#F6F2EA"; g.fillRect(0, PIC_H, W, H - PIC_H);
    g.fillStyle = "rgba(32,30,31,.035)";
    for (let y = 10; y < PIC_H; y += 20) for (let x = (y / 20 % 2) * 10 + 5; x < W; x += 20) { g.beginPath(); g.arc(x, y, 1.2, 0, 7); g.fill(); }
    if (!grid || state === "loading" || state === "idle") { requestAnimationFrame(draw); return; }

    if (state === "play") {
      acc += dt;
      while (acc >= 1000 / TICK_HZ && state === "play") { tick(); acc -= 1000 / TICK_HZ; }
      if (T0) ELAPSED = (performance.now() - T0) / 1000;
      if (S.left === 0 && !parts.length && state === "play") win();
    }

    if (state === "win") {
      winT = Math.min(1, winT + 0.025); drawSand(); g.globalAlpha = winT; g.imageSmoothingEnabled = true;
      const s = Math.min(img.width, img.height); g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, W, PIC_H); g.globalAlpha = 1;
    } else drawSand();

    // 路
    g.fillStyle = "#E6DFD1"; g.fillRect(0, ROAD_Y, W, ROAD_H);
    g.fillStyle = "rgba(32,30,31,.10)"; g.fillRect(0, ROAD_Y, W, 1.5); g.fillRect(0, ROAD_Y + ROAD_H - 1.5, W, 1.5);
    g.strokeStyle = "rgba(255,255,255,.75)"; g.lineWidth = 2; g.setLineDash([10, 10]);
    g.beginPath(); g.moveTo(0, ROAD_Y + ROAD_H - 6); g.lineTo(W, ROAD_Y + ROAD_H - 6); g.stroke(); g.setLineDash([]);
    // 進出口箭頭
    g.fillStyle = "rgba(92,107,115,.35)";
    for (const ax of [6, W - 14]) { g.beginPath(); g.moveTo(ax, ROAD_Y + 8); g.lineTo(ax + 8, ROAD_Y + 14); g.lineTo(ax, ROAD_Y + 20); g.closePath(); g.fill(); }

    // 路上的車（車頭朝右）
    const nowMs = performance.now();
    for (const car of S.road) {
      const x = Core.carX(car);
      if (x < -50 || x > W + 50) continue;
      const stuckGlow = state === "stuck" || state === "choose";
      if (stuckGlow) { g.fillStyle = `rgba(200,55,45,${.12 + .08 * Math.sin(nowMs / 180)})`; rr(x - 36, ROAD_Y + 4, 72, ROAD_H - 8, 10); g.fill(); }
      drawCar(x, CAR_Y, car.c, car.got / car.cap, CAR_SC, { flip: true });
      // 小進度條
      g.fillStyle = "rgba(32,30,31,.12)"; rr(x - 18, CAR_Y + 3, 36, 3, 1.5); g.fill();
      g.fillStyle = "#B08A3E"; rr(x - 18, CAR_Y + 3, 36 * Math.min(1, car.got / car.cap), 3, 1.5); g.fill();
    }
    // 等待進場的車
    if (S.queue.length) {
      g.font = '600 11px "Noto Sans TC",sans-serif'; g.fillStyle = "#B08A3E"; g.textAlign = "left";
      g.fillText("等待進場 " + S.queue.length, 6, ROAD_Y + ROAD_H - 10);
    }

    // 車庫（等候車道）
    const hintLane = (nowMs < hintUntil && hint && hint.lane != null) ? hint.lane : -1;
    g.font = '600 12px "Noto Sans TC",sans-serif'; g.fillStyle = "#5C6B73"; g.textAlign = "left";
    g.fillText("車庫", 12, LANE_TOP - 10);
    g.textAlign = "right"; g.fillStyle = Core.onRoad(S) >= MAX_ROAD ? "#A8392E" : "#5C6B73";
    g.fillText("路上 " + Core.onRoad(S) + " / " + MAX_ROAD, W - 12, LANE_TOP - 10); g.textAlign = "left";
    lanes.forEach((ln, l) => {
      const cx = laneX(l), lx = l * W / LANES + 8, lw = W / LANES - 16;
      g.fillStyle = l === hintLane ? "rgba(176,138,62,.16)" : "rgba(112,128,144,.06)";
      rr(lx, LANE_TOP, lw, H - LANE_TOP - 8, 14); g.fill();
      if (l === hintLane) { g.strokeStyle = "rgba(176,138,62,.8)"; g.lineWidth = 2; rr(lx, LANE_TOP, lw, H - LANE_TOP - 8, 14); g.stroke(); }
      const fl = flash.find(f => f.l === l);
      if (fl) { g.fillStyle = `rgba(168,35,24,${.12 * (1 - fl.t)})`; rr(lx, LANE_TOP, lw, H - LANE_TOP - 8, 14); g.fill(); }
      ln.slice(0, 4).forEach((s, k) => {
        if (k === 0) drawCar(cx, LANE_Y, s.c, 1, 0.92, { flip: true });
        else drawCar(cx, LANE_Y + k * LANE_GAP, s.c, 1, 0.74, { flip: true, alpha: .9 });
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
      const tx = Core.carX(p.car), ty = CAR_Y - 14, e = Math.min(1, p.t);
      g.fillStyle = rgb(pal[p.c]);
      g.fillRect(p.x + (tx - p.x) * e - 1.3, p.y + (ty - p.y) * e * e - 1.3, 2.6, 2.6);
      if (p.t >= 1) { p.car.pend--; p.car.got = Math.min(p.car.claimed, p.car.got + 1); if (Math.random() < 0.03) S_.grain(); return false; }
      return true;
    });

    $("sdPct").textContent = "進度 " + Math.round(100 * (1 - S.left / total)) + "%";
    $("sdTime").textContent = "⏱ " + fmt(ELAPSED) + " / " + fmt(PAR);
    $("sdMiss").textContent = "失誤 " + MISS + "・倒車剩 " + (MAX_REVERSE - REVERSE);
    requestAnimationFrame(draw);
  }

  renderPicker();
  requestAnimationFrame(draw);
})();
