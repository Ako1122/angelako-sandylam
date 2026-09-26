const DATA_URL = "data/songs.json";

// 大圖候選副檔名（依序嘗試載入，找到就用）
const LARGE_EXTS = [".jpg", ".jpeg", ".avif", ".webp", ".png"];

let coverPool = [];        // [{ smallCover, album, num }]
let selectedCover = null;  // 目前選中的封面物件
let largeSrc = null;       // 成功載入的大圖網址

let gridN = 3;             // 每邊格數
let tileCount = 9;         // gridN * gridN
let tiles = [];            // 目前排列：tiles[position] = 原始格號(0..N-1)，最後一格為空格值 (tileCount-1)
let blankPos = 0;          // 空格目前所在的 position
let moves = 0;
let busy = false;
let startTime = null;
let elapsedMs = 0;
let timerHandle = null;
let gameFinished = false;
let gameSession = 0;

const diffLabel = {
  3: "初級（3 × 3）",
  4: "中級（4 × 4）",
  5: "高級（5 × 5）",
};
const introBoardIds = { 3: "lbEasy", 4: "lbMedium", 5: "lbHard" };
function introBoardId(n) { return introBoardIds[n]; }

// XSS 防護
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
  ["puzzle-intro", "puzzle-game", "puzzle-result"].forEach((s) => {
    document.getElementById(s).hidden = s !== id;
  });
}

// 從 songs.json 建立不重複封面池，記錄檔號（用於找大圖）
function buildCoverPool(allSongs) {
  const seen = new Map();
  allSongs.forEach((s) => {
    if (s.cover && !seen.has(s.cover)) {
      // 從 images/covers/01.jpg 取出 "01"
      const m = s.cover.match(/([^/]+)\.[^.]+$/);
      const num = m ? m[1] : null;
      seen.set(s.cover, { smallCover: s.cover, album: s.album || "", num });
    }
  });
  return Array.from(seen.values());
}

// 依檔號嘗試多個副檔名載入大圖，回傳成功的 URL（都失敗則回退小圖）
function resolveLargeImage(cover) {
  return new Promise((resolve) => {
    const base = "images/covers-large/" + cover.num;
    let idx = 0;
    const tryNext = () => {
      if (idx >= LARGE_EXTS.length) {
        resolve(cover.smallCover); // 全部失敗 → 用小圖頂著
        return;
      }
      const url = base + LARGE_EXTS[idx++];
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = tryNext;
      img.src = url;
    };
    tryNext();
  });
}

function loadImagePromise(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* ---------- 封面挑選 UI ---------- */
function renderCoverPicker() {
  const picker = document.getElementById("coverPicker");
  picker.innerHTML = "";
  coverPool.forEach((c, i) => {
    const el = document.createElement("div");
    el.className = "cover-thumb" + (selectedCover === c ? " selected" : "");
    el.innerHTML = '<img src="' + esc(c.smallCover) + '" alt="' + esc(c.album) + '" loading="lazy">';
    el.addEventListener("click", () => {
      selectedCover = c;
      renderCoverPicker();
    });
    picker.appendChild(el);
  });
}

function pickRandomCover() {
  selectedCover = coverPool[Math.floor(Math.random() * coverPool.length)];
  renderCoverPicker();
  document.getElementById("coverPicker").scrollTop = 0;
}

/* ---------- 可解性：計算逆序數 ---------- */
// tiles 為 position→tileValue，空格值為 tileCount-1
function countInversions(arr) {
  const flat = arr.filter((v) => v !== tileCount - 1);
  let inv = 0;
  for (let i = 0; i < flat.length; i++)
    for (let j = i + 1; j < flat.length; j++)
      if (flat[i] > flat[j]) inv++;
  return inv;
}

function blankRowFromBottom(arr) {
  const pos = arr.indexOf(tileCount - 1);
  const rowFromTop = Math.floor(pos / gridN);
  return gridN - rowFromTop; // 由下往上數（1-based）
}

function isSolvable(arr) {
  const inv = countInversions(arr);
  if (gridN % 2 === 1) {
    // 奇數寬：逆序數為偶數才可解
    return inv % 2 === 0;
  } else {
    // 偶數寬：空格在偶數列(由下數) + 奇逆序 或 奇數列 + 偶逆序
    const br = blankRowFromBottom(arr);
    return (br % 2 === 0) === (inv % 2 === 1);
  }
}

function isSolvedState(arr) {
  for (let i = 0; i < arr.length; i++) if (arr[i] !== i) return false;
  return true;
}

// 產生一個「可解且非已完成」的打亂排列
function makeShuffledTiles() {
  const solved = [];
  for (let i = 0; i < tileCount; i++) solved.push(i);
  let arr;
  do {
    arr = shuffle(solved);
  } while (!isSolvable(arr) || isSolvedState(arr));
  return arr;
}

/* ---------- 開始遊戲 ---------- */
async function startGame() {
  if (!selectedCover) {
    alert("請先選一張封面！");
    return;
  }
  gameSession++;
  gridN = parseInt(document.querySelector('input[name="puzzle-mode"]:checked').value, 10);
  tileCount = gridN * gridN;
  moves = 0;
  busy = false;
  startTime = null;
  elapsedMs = 0;
  gameFinished = false;
  stopTimer();

  const startBtn = document.getElementById("puzzleStartBtn");
  startBtn.disabled = true;
  startBtn.textContent = "載入圖片中...";

  largeSrc = await resolveLargeImage(selectedCover);
  try {
    await loadImagePromise(largeSrc);
  } catch (e) {
    largeSrc = selectedCover.smallCover;
  }
  startBtn.disabled = false;
  startBtn.textContent = "開始挑戰";

  document.getElementById("puzzlePreviewImg").src = largeSrc;

  tiles = makeShuffledTiles();
  blankPos = tiles.indexOf(tileCount - 1);

  buildBoard();
  updateStatus();
  showScreen("puzzle-game");
}

/* ---------- 建立棋盤 ---------- */
let boardPx = 0;
function buildBoard() {
  const board = document.getElementById("puzzleBoard");
  board.className = "puzzle-board";
  board.innerHTML = "";
  boardPx = board.clientWidth || 420;
  const tilePx = boardPx / gridN;

  // 為每個「原始格號」建立一個 tile 元素（空格號 = tileCount-1 也建，但隱藏）
  board._tileEls = {};
  for (let val = 0; val < tileCount; val++) {
    const el = document.createElement("div");
    el.className = "puzzle-tile";
    el.dataset.val = val;
    el.style.width = tilePx + "px";
    el.style.height = tilePx + "px";

    if (val === tileCount - 1) {
      el.classList.add("blank");
    } else {
      const origRow = Math.floor(val / gridN);
      const origCol = val % gridN;
      el.style.backgroundImage = "url('" + largeSrc + "')";
      el.style.backgroundSize = boardPx + "px " + boardPx + "px";
      el.style.backgroundPosition = "-" + origCol * tilePx + "px -" + origRow * tilePx + "px";
    }
    el.addEventListener("click", () => handleTileClick(val));
    board.appendChild(el);
    board._tileEls[val] = el;
  }
  layoutTiles();
}

// 依 tiles（position→val）把每個 tile 放到它該在的位置
function layoutTiles() {
  const board = document.getElementById("puzzleBoard");
  const tilePx = boardPx / gridN;
  tiles.forEach((val, pos) => {
    const el = board._tileEls[val];
    const row = Math.floor(pos / gridN);
    const col = pos % gridN;
    el.style.left = col * tilePx + "px";
    el.style.top = row * tilePx + "px";
  });
  markMovable();
}

// 標記與空格相鄰、可移動的方塊
function markMovable() {
  const board = document.getElementById("puzzleBoard");
  const neighbors = adjacentPositions(blankPos);
  tiles.forEach((val, pos) => {
    const el = board._tileEls[val];
    if (val === tileCount - 1) return;
    if (neighbors.includes(pos)) el.classList.add("movable");
    else el.classList.remove("movable");
  });
}

function adjacentPositions(pos) {
  const row = Math.floor(pos / gridN);
  const col = pos % gridN;
  const res = [];
  if (row > 0) res.push(pos - gridN);
  if (row < gridN - 1) res.push(pos + gridN);
  if (col > 0) res.push(pos - 1);
  if (col < gridN - 1) res.push(pos + 1);
  return res;
}

/* ---------- 點擊移動 ---------- */
function handleTileClick(val) {
  if (busy || gameFinished) return;
  const pos = tiles.indexOf(val);
  if (!adjacentPositions(blankPos).includes(pos)) return; // 只有相鄰才可動

  if (startTime === null) startTimer();

  // 交換空格與該方塊
  tiles[blankPos] = val;
  tiles[pos] = tileCount - 1;
  blankPos = pos;
  moves++;

  layoutTiles();
  updateStatus();

  if (isSolvedState(tiles)) finishGame();
}

function correctCount() {
  let c = 0;
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === i && i !== tileCount - 1) c++;
  return c;
}

function updateStatus() {
  document.getElementById("puzzleProgress").textContent =
    correctCount() + " / " + (tileCount - 1) + " 格就位";
  document.getElementById("puzzleMoves").textContent = "移動：" + moves;
}

/* ---------- 計時 ---------- */
function startTimer() {
  startTime = performance.now();
  timerHandle = setInterval(() => {
    elapsedMs = performance.now() - startTime;
    document.getElementById("puzzleTimer").textContent =
      "⏱ " + (elapsedMs / 1000).toFixed(2) + "s";
  }, 100);
}
function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  if (startTime !== null) elapsedMs = performance.now() - startTime;
}

/* ---------- 完成 ---------- */
function finishGame() {
  gameFinished = true;
  stopTimer();
  // 最後一塊飛回：顯示空格 tile 並填上正確圖塊
  const board = document.getElementById("puzzleBoard");
  const blankEl = board._tileEls[tileCount - 1];
  const tilePx = boardPx / gridN;
  const origRow = Math.floor((tileCount - 1) / gridN);
  const origCol = (tileCount - 1) % gridN;
  blankEl.style.backgroundImage = "url('" + largeSrc + "')";
  blankEl.style.backgroundSize = boardPx + "px " + boardPx + "px";
  blankEl.style.backgroundPosition = "-" + origCol * tilePx + "px -" + origRow * tilePx + "px";
  board.classList.add("solved");

  setTimeout(showResult, 900);
}

function showResult() {
  showScreen("puzzle-result");
  document.getElementById("puzzleResultCover").src = largeSrc;
  document.getElementById("resultMode").textContent = diffLabel[gridN];
  document.getElementById("resultScore").textContent = (elapsedMs / 1000).toFixed(2) + "s";
  document.getElementById("resultDetail").textContent = "移動次數：" + moves + " 次";

  document.getElementById("submitScoreWrap").hidden = false;
  document.getElementById("scoreSubmitted").hidden = true;
  document.getElementById("resultLeaderboard").hidden = true;

  const submitBtn = document.getElementById("submitScoreBtn");
  submitBtn.disabled = false;
  submitBtn.textContent = "提交成績";
  document.getElementById("playerName").value = "";
}

/* ---------- 排行榜提交 / 讀取 ---------- */
function submitScore() {
  const nameInput = document.getElementById("playerName");
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }

  const thisSession = gameSession;
  const submitBtn = document.getElementById("submitScoreBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "提交中...";

  fetch("/.netlify/functions/submit-puzzle-score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name,
      grid: gridN,
      moves: moves,
      time: Math.round(elapsedMs / 10) / 100,
      cover: selectedCover.smallCover, // 排行榜縮圖：沿用小圖路徑
    }),
  })
    .then((res) => res.json())
    .then(() => {
      if (thisSession !== gameSession) return;
      document.getElementById("submitScoreWrap").hidden = true;
      document.getElementById("scoreSubmitted").hidden = false;
      loadLeaderboard("resultLeaderboard", gridN);
      loadLeaderboard(introBoardId(gridN), gridN);
    })
    .catch(() => {
      if (thisSession !== gameSession) return;
      submitBtn.disabled = false;
      submitBtn.textContent = "提交成績";
      document.getElementById("scoreSubmitted").textContent = "提交失敗，請重試";
      document.getElementById("scoreSubmitted").hidden = false;
    });
}

function loadLeaderboard(containerId, n) {
  const container = document.getElementById(containerId);
  container.hidden = false;
  container.innerHTML = '<p class="leaderboard-loading">載入排行榜中...</p>';

  fetch("/.netlify/functions/get-puzzle-leaderboard?grid=" + n)
    .then((res) => res.json())
    .then((data) => {
      if (!data || data.length === 0) {
        container.innerHTML =
          '<p class="leaderboard-empty">目前還沒有紀錄，等你來挑戰！</p>';
        return;
      }
      let html = '<div class="leaderboard-card">';
      html += '<table class="leaderboard-table">';
      html += "<thead><tr><th>#</th><th>封面</th><th>選手</th><th>移動</th><th>用時</th></tr></thead>";
      html += "<tbody>";
      data.forEach((entry) => {
        html += "<tr>";
        html += '<td class="rank-col">' + entry.rank + "</td>";
        html += "<td>" + (entry.cover ? '<img class="lb-thumb" src="' + esc(entry.cover) + '" alt="">' : "") + "</td>";
        html += '<td class="name-col">' + esc(entry.name) + "</td>";
        html += "<td>" + entry.moves + "</td>";
        html += "<td>" + entry.time + "s</td>";
        html += "</tr>";
      });
      html += "</tbody></table></div>";
      container.innerHTML = html;
    })
    .catch(() => {
      container.innerHTML =
        '<p class="leaderboard-empty">載入失敗，請稍後再試</p>';
    });
}

/* ---------- 初始化 ---------- */
function init() {
  fetch(DATA_URL)
    .then((res) => res.json())
    .then((data) => {
      coverPool = buildCoverPool(data);
      pickRandomCover();
    });

  document.getElementById("puzzleStartBtn").addEventListener("click", startGame);
  document.getElementById("puzzleRandomBtn").addEventListener("click", pickRandomCover);
  document.getElementById("submitScoreBtn").addEventListener("click", submitScore);
  document.getElementById("puzzleRestart").addEventListener("click", () => {
    showScreen("puzzle-intro");
    loadLeaderboard("lbEasy", 3);
    loadLeaderboard("lbMedium", 4);
    loadLeaderboard("lbHard", 5);
  });
  document.getElementById("puzzleQuitBtn").addEventListener("click", () => {
    stopTimer();
    showScreen("puzzle-intro");
  });

  loadLeaderboard("lbEasy", 3);
  loadLeaderboard("lbMedium", 4);
  loadLeaderboard("lbHard", 5);
}

document.addEventListener("DOMContentLoaded", init);
