const SONGS_URL = "data/songs.json";

// 牌局結構：底層滿版 + 左上/右上兩座小丘 + 下方橫條 + 架在雙丘縫隙間的尖塔，共 94 張（47 對）
const BLOCKS = [
  { layer: 0, cols: 8, rows: 8, offsetX: 0, offsetY: 0 }, // 底層滿版 64
  { layer: 1, cols: 3, rows: 3, offsetX: 0, offsetY: 0 }, // 左上小丘 9
  { layer: 1, cols: 3, rows: 3, offsetX: 5, offsetY: 0 }, // 右上小丘 9
  { layer: 1, cols: 4, rows: 2, offsetX: 2, offsetY: 6 }, // 下方橫條 8
  { layer: 2, cols: 2, rows: 2, offsetX: 3, offsetY: 1 }, // 雙丘縫隙間的尖塔 4
];
const BASE_COLS = 8;
const BASE_ROWS = 8;
const BOARD_UNIT_W = BASE_COLS * 2; // 16
const BOARD_UNIT_H = BASE_ROWS * 2; // 16
const TOTAL_PAIRS = BLOCKS.reduce((sum, b) => sum + b.cols * b.rows, 0) / 2;

const TIME_LIMITS = { easy: 420, medium: 300, hard: 210 };

const MATCH_SCORE = 100;
const STREAK_WINDOW_MS = 4000; // 這段時間內連續配對算連擊
const CLEAR_BONUS = 2000;
const TIME_BONUS_PER_SEC = 10;

let uniqueCovers = [],
  selectedCovers = [], // 這一局隨機挑出的 41 張封面路徑
  positions = [], // 所有格子的結構資訊（不含圖案），開局只算一次
  tiles = [], // 跟 positions 對應的動態狀態 { type, alive, el }
  score = 0,
  pairsCleared = 0,
  gameMode = "easy",
  timeLeft = 0,
  timerId = null,
  gameRunning = false,
  inputLocked = false,
  selectedTile = null, // 目前選中的第一張牌 { idx }
  lastMatchTime = 0,
  streakCount = 0,
  boardEl = null,
  imageCache = new Map();

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function showScreen(id) {
  ["mj-intro", "mj-game", "mj-result"].forEach((s) => {
    document.getElementById(s).hidden = s !== id;
  });
}

/* ---------------- 圖片預先載入 ---------------- */

function preloadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.decode) img.decode().then(resolve).catch(resolve);
      else resolve();
    };
    img.onerror = resolve;
    img.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

function preloadAllCovers() {
  const loadAll = Promise.all(uniqueCovers.map((c) => preloadImage(c.cover)));
  const timeout = new Promise((resolve) => setTimeout(resolve, 8000));
  return Promise.race([loadAll, timeout]);
}

/* ---------------- 牌局結構（位置、遮擋判斷） ---------------- */

function buildPositions() {
  const list = [];
  BLOCKS.forEach((block) => {
    for (let gy = 0; gy < block.rows; gy++) {
      for (let gx = 0; gx < block.cols; gx++) {
        const absGx = block.offsetX + gx;
        const absGy = block.offsetY + gy;
        list.push({
          layer: block.layer,
          gx: absGx,
          gy: absGy,
          absX: absGx * 2,
          absY: absGy * 2,
        });
      }
    }
  });
  return list;
}

function overlaps(a, b) {
  return (
    a.absX < b.absX + 2 &&
    a.absX + 2 > b.absX &&
    a.absY < b.absY + 2 &&
    a.absY + 2 > b.absY
  );
}

// 判斷某個位置（用 positions 的 index）在目前的 tiles 存活狀態下是否「可選」
function isFreeIdx(idx) {
  const pos = positions[idx];
  // 上方是否被蓋住
  for (let i = 0; i < positions.length; i++) {
    if (!tiles[i] || !tiles[i].alive) continue;
    if (positions[i].layer > pos.layer && overlaps(pos, positions[i])) {
      return false;
    }
  }
  // 同層左右是否至少一邊淨空
  let leftBlocked = false,
    rightBlocked = false;
  for (let i = 0; i < positions.length; i++) {
    if (!tiles[i] || !tiles[i].alive) continue;
    const p = positions[i];
    if (p.layer === pos.layer && p.gy === pos.gy) {
      if (p.gx === pos.gx - 1) leftBlocked = true;
      if (p.gx === pos.gx + 1) rightBlocked = true;
    }
  }
  return !(leftBlocked && rightBlocked);
}

/* ---------------- 保證有解的牌局生成 ---------------- */

// 只針對「目前存活的格子」做一次生成：算出一組合法配對順序，再回填圖案
function generateSolvableTypesForAlive(aliveIndexes, typePool) {
  // 用一份只含存活格子的暫時存活表來模擬
  const tempAlive = {};
  positions.forEach((_, i) => (tempAlive[i] = false));
  aliveIndexes.forEach((i) => (tempAlive[i] = true));

  function isFreeTemp(idx) {
    const pos = positions[idx];
    for (const i of aliveIndexes) {
      if (!tempAlive[i]) continue;
      if (positions[i].layer > pos.layer && overlaps(pos, positions[i])) return false;
    }
    let leftBlocked = false,
      rightBlocked = false;
    for (const i of aliveIndexes) {
      if (!tempAlive[i]) continue;
      const p = positions[i];
      if (p.layer === pos.layer && p.gy === pos.gy) {
        if (p.gx === pos.gx - 1) leftBlocked = true;
        if (p.gx === pos.gx + 1) rightBlocked = true;
      }
    }
    return !(leftBlocked && rightBlocked);
  }

  let remaining = aliveIndexes.slice();
  const pairOrder = [];
  let guard = 0;
  while (remaining.length > 0) {
    guard++;
    if (guard > aliveIndexes.length * 2 + 10) return null; // 防止意外無窮迴圈
    const freeList = remaining.filter((i) => isFreeTemp(i));
    if (freeList.length < 2) return null;
    const shuffled = shuffle(freeList);
    const a = shuffled[0],
      b = shuffled[1];
    pairOrder.push([a, b]);
    tempAlive[a] = false;
    tempAlive[b] = false;
    remaining = remaining.filter((i) => i !== a && i !== b);
  }

  const typeMap = {};
  const shuffledTypes = shuffle(typePool);
  pairOrder.forEach(([a, b], i) => {
    typeMap[a] = shuffledTypes[i];
    typeMap[b] = shuffledTypes[i];
  });
  return typeMap;
}

function generateFullBoard() {
  positions = buildPositions();
  const allIndexes = positions.map((_, i) => i);
  const typePool = shuffle([...Array(TOTAL_PAIRS).keys()]);
  let typeMap = null;
  let attempts = 0;
  while (!typeMap && attempts < 30) {
    typeMap = generateSolvableTypesForAlive(allIndexes, typePool);
    attempts++;
  }
  if (!typeMap) {
    // 理論上不會發生，但保底：退回簡單重試
    return generateFullBoard();
  }
  tiles = positions.map((_, i) => ({ type: typeMap[i], alive: true, el: null }));
}

/* ---------------- 畫面渲染 ---------------- */

function tilePosStyle(pos) {
  const leftPct = (pos.absX / BOARD_UNIT_W) * 100;
  const topPct = (pos.absY / BOARD_UNIT_H) * 100;
  const widthPct = (2 / BOARD_UNIT_W) * 100;
  const heightPct = (2 / BOARD_UNIT_H) * 100;
  return { leftPct, topPct, widthPct, heightPct };
}

function renderBoard() {
  boardEl = document.getElementById("mjBoard");
  boardEl.innerHTML = "";

  positions.forEach((pos, i) => {
    const tile = tiles[i];
    const el = document.createElement("div");
    el.className = "mj-tile";
    const { leftPct, topPct, widthPct, heightPct } = tilePosStyle(pos);
    el.style.left = leftPct + "%";
    el.style.top = topPct + "%";
    el.style.width = widthPct + "%";
    el.style.height = heightPct + "%";
    // 每層一點點視覺位移，做出堆疊感（純視覺，不影響邏輯座標）
    el.style.transform = "translate(" + -pos.layer * 3 + "px, " + -pos.layer * 4 + "px)";
    el.style.zIndex = 100 + pos.layer * 50 + pos.gy * 10 + pos.gx;

    const face = document.createElement("div");
    face.className = "mj-tile-face";
    const img = document.createElement("img");
    img.src = selectedCovers[tile.type];
    img.alt = "";
    img.draggable = false;
    face.appendChild(img);
    el.appendChild(face);

    el.addEventListener("click", () => handleTileClick(i));
    boardEl.appendChild(el);
    tile.el = el;
  });

  refreshBlockedStates();
}

function refreshBlockedStates() {
  tiles.forEach((tile, i) => {
    if (!tile.alive || !tile.el) return;
    const free = isFreeIdx(i);
    tile.el.classList.toggle("blocked", !free);
  });
}

/* ---------------- 點擊 / 配對邏輯 ---------------- */

function handleTileClick(idx) {
  if (inputLocked || !gameRunning) return;
  const tile = tiles[idx];
  if (!tile.alive) return;
  if (!isFreeIdx(idx)) return; // 被蓋住或兩側都被擋住，不能選

  if (selectedTile === null) {
    selectedTile = idx;
    tile.el.classList.add("selected");
    return;
  }

  if (selectedTile === idx) {
    // 點同一張，取消選取
    tile.el.classList.remove("selected");
    selectedTile = null;
    return;
  }

  const firstIdx = selectedTile;
  const firstTile = tiles[firstIdx];

  if (firstTile.type === tile.type) {
    // 配對成功
    firstTile.el.classList.remove("selected");
    removePair(firstIdx, idx);
    selectedTile = null;
  } else {
    // 型別不同，短暫抖動提示後取消選取
    firstTile.el.classList.remove("selected");
    tile.el.classList.add("mismatch");
    firstTile.el.classList.add("mismatch");
    setTimeout(() => {
      tile.el.classList.remove("mismatch");
      firstTile.el.classList.remove("mismatch");
    }, 300);
    selectedTile = null;
  }
}

function comboMultiplier(streak) {
  if (streak >= 6) return 1.5;
  if (streak >= 3) return 1.2;
  return 1;
}

function removePair(idxA, idxB) {
  const now = Date.now();
  if (now - lastMatchTime <= STREAK_WINDOW_MS) {
    streakCount++;
  } else {
    streakCount = 1;
  }
  lastMatchTime = now;

  const gained = Math.round(MATCH_SCORE * comboMultiplier(streakCount));
  score += gained;
  pairsCleared++;

  tiles[idxA].alive = false;
  tiles[idxB].alive = false;
  tiles[idxA].el.classList.add("removed");
  tiles[idxB].el.classList.add("removed");

  showScoreFloat(gained, tiles[idxA].el);

  updateStatus();
  refreshBlockedStates();

  if (pairsCleared >= TOTAL_PAIRS) {
    setTimeout(() => endGame(true), 400);
    return;
  }

  if (!hasAnyValidMove()) {
    setTimeout(() => {
      showEmptyNotice("沒有可配對的組合了，自動洗牌中...");
      reshuffleRemaining();
    }, 400);
  }
}

function showScoreFloat(gained, anchorEl) {
  const el = document.createElement("div");
  el.className = "mj-score-float";
  el.textContent = "+" + gained;
  anchorEl.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function showEmptyNotice(text) {
  const wrap = document.querySelector(".mj-board-wrap");
  let notice = wrap.querySelector(".mj-empty-notice");
  if (!notice) {
    notice = document.createElement("p");
    notice.className = "mj-empty-notice";
    wrap.appendChild(notice);
  }
  notice.textContent = text;
  setTimeout(() => notice.remove(), 1800);
}

/* ---------------- 可走步數檢查 / 洗牌 / 提示 ---------------- */

function hasAnyValidMove() {
  const freeByType = {};
  for (let i = 0; i < positions.length; i++) {
    if (!tiles[i].alive) continue;
    if (!isFreeIdx(i)) continue;
    const t = tiles[i].type;
    freeByType[t] = (freeByType[t] || 0) + 1;
    if (freeByType[t] >= 2) return true;
  }
  return false;
}

function findHintPair() {
  const freeByType = {};
  for (let i = 0; i < positions.length; i++) {
    if (!tiles[i].alive || !isFreeIdx(i)) continue;
    const t = tiles[i].type;
    if (!freeByType[t]) freeByType[t] = [];
    freeByType[t].push(i);
    if (freeByType[t].length >= 2) return freeByType[t].slice(0, 2);
  }
  return null;
}

function showHint() {
  if (inputLocked || !gameRunning) return;
  const pair = findHintPair();
  if (!pair) return;
  pair.forEach((i) => {
    tiles[i].el.classList.add("hint-flash");
    setTimeout(() => tiles[i].el.classList.remove("hint-flash"), 1000);
  });
}

function reshuffleRemaining() {
  const aliveIndexes = [];
  tiles.forEach((t, i) => {
    if (t.alive) aliveIndexes.push(i);
  });
  if (aliveIndexes.length === 0) return;

  // 每個目前還存在的 type 一定剩偶數張（配對消除的特性），直接依現有張數建立 type 池
  const typeCounts = {};
  aliveIndexes.forEach((i) => {
    typeCounts[tiles[i].type] = (typeCounts[tiles[i].type] || 0) + 1;
  });
  const expandedPool = [];
  Object.keys(typeCounts).forEach((t) => {
    for (let k = 0; k < typeCounts[t] / 2; k++) expandedPool.push(Number(t));
  });

  let typeMap = null;
  let attempts = 0;
  while (!typeMap && attempts < 30) {
    typeMap = generateSolvableTypesForAlive(aliveIndexes, expandedPool);
    attempts++;
  }
  if (!typeMap) return; // 極端情況放棄這次洗牌，維持原狀

  aliveIndexes.forEach((i) => {
    tiles[i].type = typeMap[i];
    const img = tiles[i].el.querySelector("img");
    img.src = selectedCovers[typeMap[i]];
  });
  refreshBlockedStates();
}

/* ---------------- 狀態列 / 計時 ---------------- */

function updateStatus() {
  document.getElementById("mjScore").textContent = "分數：" + score;
  document.getElementById("mjPairs").textContent = pairsCleared + " / " + TOTAL_PAIRS + " 對";
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(Math.floor(timeLeft % 60)).padStart(2, "0");
  document.getElementById("mjTimeLeft").textContent = "⏱ " + mm + ":" + ss;
}

function tickTimer() {
  timeLeft--;
  updateStatus();
  if (timeLeft <= 0) {
    endGame(false);
  }
}

/* ---------------- 遊戲流程 ---------------- */

function startGame() {
  gameMode = document.querySelector('input[name="mj-mode"]:checked').value;
  score = 0;
  pairsCleared = 0;
  streakCount = 0;
  lastMatchTime = 0;
  selectedTile = null;
  timeLeft = TIME_LIMITS[gameMode];
  gameRunning = true;
  inputLocked = false;

  selectedCovers = shuffle(uniqueCovers)
    .slice(0, TOTAL_PAIRS)
    .map((c) => c.cover);
  generateFullBoard();

  showScreen("mj-game");
  renderBoard();
  updateStatus();

  clearInterval(timerId);
  timerId = setInterval(tickTimer, 1000);
}

function endGame(cleared) {
  gameRunning = false;
  inputLocked = true;
  clearInterval(timerId);

  showScreen("mj-result");
  const ml = { easy: "初級（7分鐘）", medium: "中級（5分鐘）", hard: "最高級（3.5分鐘）" };

  let finalScore = score;
  let detail = "配對成功 " + pairsCleared + " / " + TOTAL_PAIRS + " 對";

  if (cleared) {
    const remainingBonus = Math.round(timeLeft * TIME_BONUS_PER_SEC);
    finalScore += CLEAR_BONUS + remainingBonus;
    document.getElementById("resultTitle").textContent = "恭喜全部清空！🎉";
    detail += "．全清獎勵 +" + CLEAR_BONUS + "．剩餘時間獎勵 +" + remainingBonus;
  } else {
    document.getElementById("resultTitle").textContent = "時間到！";
  }

  document.getElementById("resultMode").textContent = ml[gameMode];
  document.getElementById("resultScore").textContent = finalScore + " 分";
  document.getElementById("resultDetail").textContent = detail;

  score = finalScore;

  const nameInput = document.getElementById("playerName");
  nameInput.value = "";
  const submitBtn = document.getElementById("submitScoreBtn");
  submitBtn.disabled = false;
  submitBtn.textContent = "提交成績";

  document.getElementById("submitScoreWrap").hidden = false;
  document.getElementById("scoreSubmitted").hidden = true;
  document.getElementById("resultLeaderboard").hidden = true;
}

function submitScore() {
  const nameInput = document.getElementById("playerName");
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }

  const submitBtn = document.getElementById("submitScoreBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "提交中...";

  fetch("/.netlify/functions/submit-mahjong-score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name,
      mode: gameMode,
      score: score,
      pairs: pairsCleared,
      cleared: pairsCleared >= TOTAL_PAIRS,
      time: TIME_LIMITS[gameMode],
    }),
  })
    .then((res) => res.json())
    .then(() => {
      document.getElementById("submitScoreWrap").hidden = true;
      document.getElementById("scoreSubmitted").hidden = false;
      loadLeaderboard(gameMode, "resultLeaderboard");
    })
    .catch(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = "提交成績";
      document.getElementById("scoreSubmitted").textContent = "提交失敗，請重試";
      document.getElementById("scoreSubmitted").hidden = false;
    });
}

function loadLeaderboard(mode, containerId) {
  const container = document.getElementById(containerId);
  container.hidden = false;
  container.innerHTML = '<p class="leaderboard-loading">載入排行榜中...</p>';

  fetch("/.netlify/functions/get-mahjong-leaderboard?mode=" + mode)
    .then((res) => res.json())
    .then((data) => {
      if (!data || data.length === 0) {
        container.innerHTML =
          '<p class="leaderboard-empty">目前還沒有紀錄，等你來挑戰！</p>';
        return;
      }
      let html = '<div class="leaderboard-card">';
      html += '<table class="leaderboard-table">';
      html +=
        "<thead><tr><th>#</th><th>選手</th><th>分數</th><th>配對數</th><th>全清</th></tr></thead>";
      html += "<tbody>";
      data.forEach((entry) => {
        html += "<tr>";
        html += '<td class="rank-col">' + entry.rank + "</td>";
        html += '<td class="name-col">' + esc(entry.name) + "</td>";
        html += "<td>" + entry.score + "</td>";
        html += "<td>" + entry.pairs + "/" + TOTAL_PAIRS + "</td>";
        html += "<td>" + (entry.cleared ? "✓" : "—") + "</td>";
        html += "</tr>";
      });
      html += "</tbody></table></div>";
      container.innerHTML = html;
    })
    .catch(() => {
      container.innerHTML = '<p class="leaderboard-empty">載入失敗，請稍後再試</p>';
    });
}

/* ---------------- 啟動 ---------------- */

async function boot() {
  const res = await fetch(SONGS_URL);
  const allSongs = await res.json();

  const albumMap = new Map();
  allSongs.forEach((s) => {
    if (s.album && s.cover && !albumMap.has(s.album)) {
      albumMap.set(s.album, { album: s.album, cover: s.cover });
    }
  });
  uniqueCovers = Array.from(albumMap.values());

  document.getElementById("mjStartBtn").addEventListener("click", startGame);
  document.getElementById("mjStopBtn").addEventListener("click", () => {
    if (gameRunning) endGame(false);
  });
  document.getElementById("mjHintBtn").addEventListener("click", showHint);
  document.getElementById("mjShuffleBtn").addEventListener("click", () => {
    if (gameRunning && !inputLocked) {
      showEmptyNotice("重新洗牌中...");
      reshuffleRemaining();
    }
  });
  document.getElementById("mjRestart").addEventListener("click", () => {
    showScreen("mj-intro");
  });
  document.getElementById("submitScoreBtn").addEventListener("click", submitScore);

  loadLeaderboard("hard", "lbHard");
  loadLeaderboard("medium", "lbMedium");
  loadLeaderboard("easy", "lbEasy");

  const startBtn = document.getElementById("mjStartBtn");
  startBtn.disabled = true;
  const originalLabel = startBtn.textContent;
  startBtn.textContent = "圖片準備中...";
  preloadAllCovers().then(() => {
    startBtn.disabled = false;
    startBtn.textContent = originalLabel;
  });
}

boot();
