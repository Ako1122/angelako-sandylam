const SONGS_URL = "data/songs.json";

const COLS = 6;
const ROWS = 7;
const ANIM_MS = 180; // 跟 CSS transition 時間對齊
const SWIPE_THRESHOLD = 14; // px，超過這個位移才判定成一次拖曳交換

const TIMED_DURATION = 180; // 3 分鐘挑戰（秒）

// 這些封面不會被抽選進消消樂的 6 張候選封面裡
const EXCLUDED_MATCH3_COVERS = new Set(
  [
    "53.webp", "54.jpg", "55.jpg", "56.jpg", "57.png", "58.webp", "59.jpg",
    "60.jpg", "61.png", "61.jpg", "62.jpg", "64.jpg", "65.jpg", "66.jpg", "67.jpg",
    "68.png", "69.jpg", "70.webp", "77.webp", "34.jpg", "33.webp", "31.jpg",
    "35.jpg", "36.png", "37.webp", "38.jpg", "27.jpg", "28.jpg", "32.jpg", "21.jpg",
  ].map((f) => "images/covers/" + f),
);

// 連鎖倍率：comboLevel 1 = 玩家手動交換觸發的第一輪；2 以後都是自動連鎖
function comboMultiplier(level) {
  if (level >= 4) return 3;
  if (level === 3) return 2;
  if (level === 2) return 1.5;
  return 1;
}

// 依連線長度計算單一條線的基礎分數
function runScore(len) {
  if (len >= 6) return 800 + (len - 6) * 150;
  if (len === 5) return 500;
  if (len === 4) return 240;
  return 90; // len === 3
}

let uniqueCovers = [],
  selectedCovers = [], // 這一局隨機挑出的 6 張封面路徑
  board = [], // board[row][col] = type index (0~5) 或 null
  tileEls = [], // tileEls[row][col] = DOM element
  score = 0,
  maxCombo = 0,
  matchesCount = 0,
  gameMode = "timed",
  timeLeft = TIMED_DURATION,
  timerId = null,
  gameRunning = false,
  inputLocked = false,
  boardEl = null,
  dragStates = new Map(); // pointerId -> { row, col, startX, startY, resolved }

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
  ["m3-intro", "m3-game", "m3-result"].forEach((s) => {
    document.getElementById(s).hidden = s !== id;
  });
}

/* ---------------- 音效（Web Audio API 即時合成，不需外部音檔） ---------------- */

let audioCtx = null;

function ensureAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq, duration, type, startVol) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(startVol || 0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

// 一般消除音效：連線越長音調越高，長度短（0.15秒），不會太干擾
function playMatchSound(runLength) {
  const freq = 523 + Math.min(runLength - 3, 4) * 80; // 從 C5 開始，連線越長音越高
  playTone(freq, 0.15, "sine", 0.18);
}

// 連鎖音效：快速上升三音，聽起來比單一消除更有鼓勵感，連鎖越深音調越高
function playComboSound(comboLevel) {
  const base = 600 + Math.min(comboLevel - 2, 4) * 60;
  const notes = [base, base * 1.25, base * 1.5];
  notes.forEach((f, i) => {
    setTimeout(() => playTone(f, 0.12, "triangle", 0.16), i * 55);
  });
}

// 倒數最後 5 秒的提示音，越接近 0 音調越高，增加緊張感
function playCountdownTick(secondsLeft) {
  const freq = 500 + (5 - secondsLeft) * 60;
  playTone(freq, 0.09, "square", 0.15);
}



function pickSixCovers() {
  selectedCovers = shuffle(uniqueCovers)
    .slice(0, 6)
    .map((c) => c.cover);
}

function randomTypeAvoidingMatch(r, c) {
  const bad = new Set();
  // 避免一開始就水平連三
  if (c >= 2 && board[r][c - 1] === board[r][c - 2] && board[r][c - 1] !== null) {
    bad.add(board[r][c - 1]);
  }
  // 避免一開始就垂直連三
  if (r >= 2 && board[r - 1][c] === board[r - 2][c] && board[r - 1][c] !== null) {
    bad.add(board[r - 1][c]);
  }
  const candidates = [0, 1, 2, 3, 4, 5].filter((t) => !bad.has(t));
  const pool = candidates.length > 0 ? candidates : [0, 1, 2, 3, 4, 5];
  return pool[Math.floor(Math.random() * pool.length)];
}

function generateBoard() {
  board = [];
  for (let r = 0; r < ROWS; r++) {
    board.push([]);
    for (let c = 0; c < COLS; c++) {
      board[r].push(randomTypeAvoidingMatch(r, c));
    }
  }
  // 確保開局至少有一步可走，否則重新產生
  if (!hasPossibleMove()) {
    generateBoard();
  }
}

/* ---------------- 畫面渲染 ---------------- */

function positionTile(el, row, col) {
  el.style.transform = "translate(" + col * 100 + "%, " + row * 100 + "%)";
}

function createTileEl(row, col, type) {
  const el = document.createElement("div");
  el.className = "m3-tile";
  const img = document.createElement("img");
  img.src = selectedCovers[type];
  img.alt = "";
  img.draggable = false;
  el.appendChild(img);
  positionTile(el, row, col);
  attachTileEvents(el);
  boardEl.appendChild(el);
  return el;
}

function renderBoard() {
  boardEl = document.getElementById("m3Board");
  boardEl.innerHTML = "";
  tileEls = [];
  for (let r = 0; r < ROWS; r++) {
    tileEls.push([]);
    for (let c = 0; c < COLS; c++) {
      tileEls[r].push(createTileEl(r, c, board[r][c]));
    }
  }
}

/* ---------------- 拖曳交換 ---------------- */

function attachTileEvents(el) {
  el.addEventListener("pointerdown", (e) => {
    if (inputLocked || !gameRunning) return;
    const pos = findTilePosition(el);
    if (!pos) return;
    dragStates.set(e.pointerId, {
      row: pos.row,
      col: pos.col,
      startX: e.clientX,
      startY: e.clientY,
      resolved: false,
    });
    try {
      el.setPointerCapture(e.pointerId);
    } catch (err) {}
  });

  el.addEventListener("pointermove", (e) => {
    const state = dragStates.get(e.pointerId);
    if (!state || state.resolved) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;

    let targetRow = state.row;
    let targetCol = state.col;
    if (Math.abs(dx) > Math.abs(dy)) {
      targetCol += dx > 0 ? 1 : -1;
    } else {
      targetRow += dy > 0 ? 1 : -1;
    }

    state.resolved = true;
    if (targetRow >= 0 && targetRow < ROWS && targetCol >= 0 && targetCol < COLS) {
      attemptSwap(state.row, state.col, targetRow, targetCol);
    }
  });

  const endDrag = (e) => {
    dragStates.delete(e.pointerId);
  };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
}

function findTilePosition(el) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (tileEls[r][c] === el) return { row: r, col: c };
    }
  }
  return null;
}

/* ---------------- 交換 / 消除 / 連鎖 ---------------- */

function attemptSwap(r1, c1, r2, c2) {
  if (inputLocked || !gameRunning) return;

  // 防呆：確認兩格都是有效、目前沒有正在消除動畫中的方塊，避免用到過期或損毀的參照
  const elA0 = tileEls[r1] && tileEls[r1][c1];
  const elB0 = tileEls[r2] && tileEls[r2][c2];
  if (
    board[r1][c1] === null ||
    board[r2][c2] === null ||
    !elA0 ||
    !elB0 ||
    elA0.classList.contains("clearing") ||
    elB0.classList.contains("clearing")
  ) {
    return;
  }

  // 資料層交換
  const tmp = board[r1][c1];
  board[r1][c1] = board[r2][c2];
  board[r2][c2] = tmp;

  const elA = tileEls[r1][c1];
  const elB = tileEls[r2][c2];
  tileEls[r1][c1] = elB;
  tileEls[r2][c2] = elA;
  positionTile(elA, r2, c2);
  positionTile(elB, r1, c1);

  inputLocked = true;

  setTimeout(() => {
    const matches = findMatches();
    if (matches.length === 0) {
      // 沒湊成線，交換回去
      const tmp2 = board[r1][c1];
      board[r1][c1] = board[r2][c2];
      board[r2][c2] = tmp2;
      const elA2 = tileEls[r1][c1];
      const elB2 = tileEls[r2][c2];
      tileEls[r1][c1] = elB2;
      tileEls[r2][c2] = elA2;
      positionTile(elA2, r1, c1);
      positionTile(elB2, r2, c2);
      setTimeout(() => {
        inputLocked = false;
      }, ANIM_MS);
    } else {
      resolveCascade(1);
    }
  }, ANIM_MS);
}

function findMatches() {
  const runs = [];

  // 橫向
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      const t = board[r][c];
      if (t === null) {
        c++;
        continue;
      }
      let len = 1;
      while (c + len < COLS && board[r][c + len] === t) len++;
      if (len >= 3) {
        const cells = [];
        for (let k = 0; k < len; k++) cells.push([r, c + k]);
        runs.push({ cells, length: len });
      }
      c += len;
    }
  }

  // 縱向
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      const t = board[r][c];
      if (t === null) {
        r++;
        continue;
      }
      let len = 1;
      while (r + len < ROWS && board[r + len][c] === t) len++;
      if (len >= 3) {
        const cells = [];
        for (let k = 0; k < len; k++) cells.push([r + k, c]);
        runs.push({ cells, length: len });
      }
      r += len;
    }
  }

  return runs;
}

function showScoreFloat(gained, r, c) {
  const el = document.createElement("div");
  el.className = "m3-score-float";
  el.textContent = "+" + gained;
  el.style.left = ((c + 0.5) / COLS) * 100 + "%";
  el.style.top = ((r + 0.5) / ROWS) * 100 + "%";
  boardEl.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function clearMatches(runs, comboLevel) {
  const multiplier = comboMultiplier(comboLevel);
  const cellSet = new Set();
  let cycleScore = 0;
  let anchor = runs[0].cells[0];

  runs.forEach((run) => {
    cycleScore += runScore(run.length);
    matchesCount++;
    run.cells.forEach(([r, c]) => cellSet.add(r + "," + c));
  });

  const gained = Math.round(cycleScore * multiplier);
  score += gained;
  maxCombo = Math.max(maxCombo, comboLevel);
  updateStatus();
  showScoreFloat(gained, anchor[0], anchor[1]);

  if (comboLevel >= 2) {
    playComboSound(comboLevel);
  } else {
    const longestRun = Math.max(...runs.map((r) => r.length));
    playMatchSound(longestRun);
  }

  cellSet.forEach((key) => {
    const [r, c] = key.split(",").map(Number);
    tileEls[r][c].classList.add("clearing");
    board[r][c] = null;
  });
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    const survivors = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] !== null) {
        survivors.push({ type: board[r][c], el: tileEls[r][c] });
      }
    }
    const emptyCount = ROWS - survivors.length;

    // 先清空這一欄的舊 tileEls / board 記錄，重新由下往上填入存活的方塊
    for (let r = 0; r < ROWS; r++) {
      board[r][c] = null;
      tileEls[r][c] = null;
    }
    for (let i = 0; i < survivors.length; i++) {
      const newRow = emptyCount + i;
      board[newRow][c] = survivors[i].type;
      tileEls[newRow][c] = survivors[i].el;
      positionTile(survivors[i].el, newRow, c);
    }
  }
}

function refillBoard() {
  for (let c = 0; c < COLS; c++) {
    let stackAbove = 0;
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] === null) {
        stackAbove++;
        const type = Math.floor(Math.random() * 6);
        board[r][c] = type;
        const el = createTileEl(r - stackAbove, c, type);
        tileEls[r][c] = el;
        // 下一個 tick 再設定最終位置，讓 CSS transition 有起點可以動畫
        requestAnimationFrame(() => positionTile(el, r, c));
      }
    }
  }
}

function removeClearedElements() {
  document.querySelectorAll(".m3-tile.clearing").forEach((el) => el.remove());
}

function resolveCascade(comboLevel) {
  const matches = findMatches();
  if (matches.length === 0) {
    inputLocked = false;
    if (!hasPossibleMove()) {
      reshuffleBoard();
    }
    return;
  }

  clearMatches(matches, comboLevel);
  document.getElementById("m3Combo").textContent = "連鎖：" + comboLevel;

  setTimeout(() => {
    removeClearedElements();
    applyGravity();
    setTimeout(() => {
      refillBoard();
      setTimeout(() => {
        resolveCascade(comboLevel + 1);
      }, ANIM_MS + 60);
    }, ANIM_MS + 30);
  }, ANIM_MS + 20);
}

/* ---------------- 可走步數檢查 / 重新洗牌 ---------------- */

function wouldMatch(r1, c1, r2, c2) {
  const tmp = board[r1][c1];
  board[r1][c1] = board[r2][c2];
  board[r2][c2] = tmp;
  const matched = findMatches().length > 0;
  const tmp2 = board[r1][c1];
  board[r1][c1] = board[r2][c2];
  board[r2][c2] = tmp2;
  return matched;
}

function hasPossibleMove() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS && wouldMatch(r, c, r, c + 1)) return true;
      if (r + 1 < ROWS && wouldMatch(r, c, r + 1, c)) return true;
    }
  }
  return false;
}

function reshuffleBoard() {
  inputLocked = true;
  const notice = document.getElementById("m3ReshuffleNotice");
  notice.hidden = false;
  setTimeout(() => {
    generateBoard();
    renderBoard();
    notice.hidden = true;
    inputLocked = false;
  }, 1100);
}

/* ---------------- 狀態列 / 計時 ---------------- */

function updateStatus() {
  document.getElementById("m3Score").textContent = "分數：" + score;
  if (gameMode === "timed") {
    const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
    const ss = String(timeLeft % 60).padStart(2, "0");
    document.getElementById("m3TimeLeft").textContent = "⏱ " + mm + ":" + ss;
  }
}

function tickTimer() {
  timeLeft--;
  updateStatus();
  if (timeLeft > 0 && timeLeft <= 5) {
    playCountdownTick(timeLeft);
  }
  if (timeLeft <= 0) {
    endGame();
  }
}

/* ---------------- 遊戲流程 ---------------- */

function startGame() {
  ensureAudioCtx(); // 在使用者點擊當下解鎖音效，避免手機瀏覽器擋掉之後的自動播放
  gameMode = document.querySelector('input[name="m3-mode"]:checked').value;
  score = 0;
  maxCombo = 0;
  matchesCount = 0;
  timeLeft = TIMED_DURATION;
  gameRunning = true;
  inputLocked = false;
  dragStates.clear();

  document.getElementById("m3TimeLeft").hidden = gameMode !== "timed";
  document.getElementById("m3Combo").textContent = "連鎖：0";

  pickSixCovers();
  generateBoard();
  showScreen("m3-game");
  renderBoard();
  updateStatus();

  if (gameMode === "timed") {
    clearInterval(timerId);
    timerId = setInterval(tickTimer, 1000);
  }
}

function endGame() {
  gameRunning = false;
  inputLocked = true;
  clearInterval(timerId);

  showScreen("m3-result");
  const ml = gameMode === "timed" ? "3 分鐘挑戰" : "自由消除";
  document.getElementById("resultMode").textContent = ml;
  document.getElementById("resultScore").textContent = score + " 分";
  document.getElementById("resultDetail").textContent =
    "消除 " + matchesCount + " 條線．最高連鎖 " + maxCombo + " 段";

  const submitWrap = document.getElementById("submitScoreWrap");
  if (gameMode === "timed") {
    const nameInput = document.getElementById("playerName");
    nameInput.value = "";
    const submitBtn = document.getElementById("submitScoreBtn");
    submitBtn.disabled = false;
    submitBtn.textContent = "提交成績";
    submitWrap.hidden = false;
  } else {
    submitWrap.hidden = true;
  }
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

  fetch("/.netlify/functions/submit-match3-score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name,
      score: score,
      maxCombo: maxCombo,
      matches: matchesCount,
      time: TIMED_DURATION,
    }),
  })
    .then((res) => res.json())
    .then(() => {
      document.getElementById("submitScoreWrap").hidden = true;
      document.getElementById("scoreSubmitted").hidden = false;
      loadLeaderboard("resultLeaderboard");
    })
    .catch(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = "提交成績";
      document.getElementById("scoreSubmitted").textContent = "提交失敗，請重試";
      document.getElementById("scoreSubmitted").hidden = false;
    });
}

function loadLeaderboard(containerId) {
  const container = document.getElementById(containerId);
  container.hidden = false;
  container.innerHTML = '<p class="leaderboard-loading">載入排行榜中...</p>';

  fetch("/.netlify/functions/get-match3-leaderboard")
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
        "<thead><tr><th>#</th><th>選手</th><th>分數</th><th>消除線數</th><th>最高連鎖</th></tr></thead>";
      html += "<tbody>";
      data.forEach((entry) => {
        html += "<tr>";
        html += '<td class="rank-col">' + entry.rank + "</td>";
        html += '<td class="name-col">' + esc(entry.name) + "</td>";
        html += "<td>" + entry.score + "</td>";
        html += "<td>" + entry.matches + "</td>";
        html += "<td>" + entry.maxCombo + "</td>";
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
  uniqueCovers = Array.from(albumMap.values()).filter(
    (c) => !EXCLUDED_MATCH3_COVERS.has(c.cover),
  );

  document.getElementById("m3StartBtn").addEventListener("click", startGame);
  document.getElementById("m3StopBtn").addEventListener("click", () => {
    if (gameRunning) endGame();
  });
  document.getElementById("m3Restart").addEventListener("click", () => {
    showScreen("m3-intro");
  });
  document.getElementById("submitScoreBtn").addEventListener("click", submitScore);

  loadLeaderboard("lbTimed");
}

boot();
