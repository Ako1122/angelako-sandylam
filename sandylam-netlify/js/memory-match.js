const DATA_URL = "data/songs.json";
let coverPool = [];
let cards = [];
let difficulty = 10;
let flippedCards = [];
let matchedPairs = 0;
let totalPairs = 10;
let moves = 0;
let busy = false;
let startTime = null;
let elapsedMs = 0;
let timerHandle = null;
let gameFinished = false;
let gameSession = 0; // 每開始新的一局就 +1，用來辨識過期的提交回應

const diffLabel = {
  10: "初級（10 組封面）",
  20: "中級（20 組封面）",
  25: "高級（25 組封面）",
};

const introBoardIds = { 10: "lbEasy", 20: "lbMedium", 25: "lbHard" };
function introBoardId(difficulty) {
  return introBoardIds[difficulty];
}

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
  ["memory-intro", "memory-game", "memory-result"].forEach((s) => {
    document.getElementById(s).hidden = s !== id;
  });
}

function buildCoverPool(allSongs) {
  const seen = new Map();
  allSongs.forEach((s) => {
    if (s.cover && !seen.has(s.cover)) {
      seen.set(s.cover, { cover: s.cover, album: s.album });
    }
  });
  return Array.from(seen.values());
}

function startTimer() {
  startTime = performance.now();
  timerHandle = setInterval(() => {
    elapsedMs = performance.now() - startTime;
    document.getElementById("memoryTimer").textContent =
      "⏱ " + (elapsedMs / 1000).toFixed(2) + "s";
  }, 100);
}

function stopTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  if (startTime !== null) {
    elapsedMs = performance.now() - startTime;
  }
}

function startGame() {
  gameSession++;
  difficulty = parseInt(
    document.querySelector('input[name="memory-mode"]:checked').value,
    10,
  );
  totalPairs = difficulty;
  matchedPairs = 0;
  moves = 0;
  flippedCards = [];
  busy = false;
  startTime = null;
  elapsedMs = 0;
  gameFinished = false;
  stopTimer();

  const chosen = shuffle(coverPool).slice(0, difficulty);
  const raw = [];
  chosen.forEach((c, idx) => {
    raw.push({ pairId: idx, cover: c.cover, album: c.album });
    raw.push({ pairId: idx, cover: c.cover, album: c.album });
  });
  cards = shuffle(raw).map((c, i) => ({ ...c, uid: i }));

  renderGrid();
  updateStatus();
  showScreen("memory-game");
}

function renderGrid() {
  const grid = document.getElementById("memoryGrid");
  grid.className = "memory-grid diff-" + difficulty;
  grid.innerHTML = "";

  cards.forEach((card) => {
    const el = document.createElement("div");
    el.className = "memory-card";
    el.dataset.uid = card.uid;
    el.dataset.pairId = card.pairId;
    el.innerHTML =
      '<div class="memory-card-inner">' +
      '<div class="memory-card-face memory-card-back">♪</div>' +
      '<div class="memory-card-face memory-card-front"><img src="' +
      esc(card.cover) +
      '" alt=""></div>' +
      "</div>";
    el.addEventListener("click", () => handleCardClick(el, card));
    grid.appendChild(el);
  });
}

function updateStatus() {
  document.getElementById("memoryProgress").textContent =
    matchedPairs + " / " + totalPairs + " 組";
  document.getElementById("memoryMoves").textContent = "翻牌：" + moves;
}

function handleCardClick(el, card) {
  if (busy || gameFinished) return;
  if (el.classList.contains("flipped") || el.classList.contains("matched"))
    return;
  if (flippedCards.length >= 2) return;

  if (startTime === null) startTimer();

  el.classList.add("flipped");
  flippedCards.push({ el, card });

  if (flippedCards.length === 2) {
    moves++;
    updateStatus();
    busy = true;
    const [a, b] = flippedCards;
    if (a.card.pairId === b.card.pairId) {
      setTimeout(() => {
        a.el.classList.add("matched");
        b.el.classList.add("matched");
        flippedCards = [];
        busy = false;
        matchedPairs++;
        updateStatus();
        if (matchedPairs >= totalPairs) {
          finishGame();
        }
      }, 350);
    } else {
      setTimeout(() => {
        a.el.classList.remove("flipped");
        b.el.classList.remove("flipped");
        flippedCards = [];
        busy = false;
      }, 700);
    }
  }
}

function finishGame() {
  gameFinished = true;
  stopTimer();
  showResult();
}

function showResult() {
  showScreen("memory-result");
  document.getElementById("resultMode").textContent = diffLabel[difficulty];
  document.getElementById("resultScore").textContent =
    (elapsedMs / 1000).toFixed(2) + "s";
  document.getElementById("resultDetail").textContent =
    "翻牌次數：" + moves + " 次";
  document.getElementById("memoryCardPreviewWrap").hidden = true;

  document.getElementById("submitScoreWrap").hidden = false;
  document.getElementById("scoreSubmitted").hidden = true;
  document.getElementById("resultLeaderboard").hidden = true;

  // 重置提交按鈕跟姓名欄位，避免上一局還沒回應完的提交請求
  // 把「提交中...」的卡住狀態帶到這一局的畫面上
  const submitBtn = document.getElementById("submitScoreBtn");
  submitBtn.disabled = false;
  submitBtn.textContent = "提交成績";
  document.getElementById("playerName").value = "";
}

function submitScore() {
  const nameInput = document.getElementById("playerName");
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }

  const thisSession = gameSession;
  const submitBtn = document.getElementById("submitScoreBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "提交中...";

  fetch("/.netlify/functions/submit-memory-score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name,
      difficulty: difficulty,
      moves: moves,
      time: Math.round(elapsedMs / 10) / 100,
    }),
  })
    .then((res) => res.json())
    .then(() => {
      if (thisSession !== gameSession) return; // 已經在玩新的一局了，這個回應過期了，不要動畫面
      document.getElementById("submitScoreWrap").hidden = true;
      document.getElementById("scoreSubmitted").hidden = false;
      loadLeaderboard("resultLeaderboard", difficulty);
      loadLeaderboard(introBoardId(difficulty), difficulty);
    })
    .catch(() => {
      if (thisSession !== gameSession) return;
      submitBtn.disabled = false;
      submitBtn.textContent = "提交成績";
      document.getElementById("scoreSubmitted").textContent =
        "提交失敗，請重試";
      document.getElementById("scoreSubmitted").hidden = false;
    });
}

function loadLeaderboard(containerId, difficulty) {
  const container = document.getElementById(containerId);
  container.hidden = false;
  container.innerHTML = '<p class="leaderboard-loading">載入排行榜中...</p>';

  fetch("/.netlify/functions/get-memory-leaderboard?difficulty=" + difficulty)
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
        "<thead><tr><th>#</th><th>選手</th><th>翻牌</th><th>用時</th></tr></thead>";
      html += "<tbody>";
      data.forEach((entry) => {
        html += "<tr>";
        html += '<td class="rank-col">' + entry.rank + "</td>";
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

function loadImage(src) {
  return new Promise((r) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => r(img);
    img.onerror = () => r(null);
    img.src = src;
  });
}

async function generateMemoryCard() {
  const ts = (elapsedMs / 1000).toFixed(2);
  const w = 600,
    h = 480;
  const canvas = document.getElementById("memoryResultCanvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#F6F2EA";
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "center";
  ctx.fillStyle = "#708090";
  ctx.font = "600 13px 'Noto Sans TC',sans-serif";
  ctx.fillText("SANDY LAM MEMORY MATCH", w / 2, 40);

  ctx.fillStyle = "#201E1F";
  ctx.font = "700 26px 'Noto Serif TC',serif";
  ctx.fillText("記憶翻牌成績", w / 2, 80);

  ctx.fillStyle = "#5C6B73";
  ctx.font = "500 15px 'Noto Sans TC',sans-serif";
  ctx.fillText(diffLabel[difficulty], w / 2, 115);

  ctx.beginPath();
  ctx.arc(w / 2, 195, 60, 0, Math.PI * 2);
  ctx.fillStyle = "#708090";
  ctx.fill();
  ctx.fillStyle = "#F6F2EA";
  ctx.font = "700 30px 'Noto Sans TC',sans-serif";
  ctx.fillText(ts + "s", w / 2, 203);

  ctx.fillStyle = "#201E1F";
  ctx.font = "600 16px 'Noto Sans TC',sans-serif";
  ctx.fillText("翻牌次數", w / 2, 300);
  ctx.fillStyle = "#B08A3E";
  ctx.font = "700 28px 'Noto Sans TC',sans-serif";
  ctx.fillText(moves + " 次", w / 2, 336);

  ctx.strokeStyle = "rgba(32,30,31,.15)";
  ctx.beginPath();
  ctx.moveTo(60, 400);
  ctx.lineTo(w - 60, 400);
  ctx.stroke();

  const url = "https://sandylam.netlify.app/memory-match.html";
  ctx.textAlign = "left";
  ctx.fillStyle = "#201E1F";
  ctx.font = "600 13px 'Noto Sans TC',sans-serif";
  ctx.fillText("你也來挑戰看看！", 60, 430);
  ctx.fillStyle = "#708090";
  ctx.font = "500 12px 'Noto Sans TC',sans-serif";
  ctx.fillText(url, 60, 452);

  const qr = await loadImage(
    "https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=0&data=" +
      encodeURIComponent(url),
  );
  if (qr) ctx.drawImage(qr, w - 120, 410, 60, 60);

  const du = canvas.toDataURL("image/png");
  document.getElementById("memoryCardPreviewImg").src = du;
  document.getElementById("memoryCardDownloadLink").href = du;
  document.getElementById("memoryCardPreviewWrap").hidden = false;
}

async function boot() {
  const res = await fetch(DATA_URL);
  const allSongs = await res.json();
  coverPool = buildCoverPool(allSongs);

  document
    .getElementById("memoryStartBtn")
    .addEventListener("click", startGame);
  document.getElementById("memoryRestart").addEventListener("click", () => {
    stopTimer();
    showScreen("memory-intro");
  });
  document
    .getElementById("memoryGenerateCard")
    .addEventListener("click", generateMemoryCard);
  document
    .getElementById("submitScoreBtn")
    .addEventListener("click", submitScore);

  loadLeaderboard("lbEasy", 10);
  loadLeaderboard("lbMedium", 20);
  loadLeaderboard("lbHard", 25);
}

boot();
