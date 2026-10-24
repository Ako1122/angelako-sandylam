const DATA_URL = "data/songs.json";
const CLIP_MS = 5000; // 每次翻牌播放的試聽片段長度（毫秒）；翻下一張會在 playClip() 裡先 stopAudio() 再播新的

let coverPool = []; // [{ cover, album, previewUrl }]，只收有試聽網址的封面
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
let gameSession = 0;

let currentAudio = null;
let clipTimeoutHandle = null;
let currentPlayingEl = null; // 目前在播放試聽片段的那張卡片元素，用來切換「聆聽中」動畫

const diffLabel = {
  10: "初級（10 組）",
  20: "中級（20 組）",
  25: "高級（25 組）",
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
  ["amemory-intro", "amemory-game", "amemory-result"].forEach((s) => {
    document.getElementById(s).hidden = s !== id;
  });
}

// 依封面分組，每組封面只要有任何一首歌帶 preview_url 就收進池子，
// 沒有試聽網址的封面整個排除（不然翻開會放不出聲音）。
function buildAudioCoverPool(allSongs) {
  const byCover = new Map();
  allSongs.forEach((s) => {
    if (!s.cover) return;
    if (!byCover.has(s.cover)) byCover.set(s.cover, []);
    byCover.get(s.cover).push(s);
  });
  const pool = [];
  byCover.forEach((songs, cover) => {
    const withPreview = songs.find((s) => s.preview_url);
    if (withPreview) {
      pool.push({ cover, album: withPreview.album || "", previewUrl: withPreview.preview_url });
    }
  });
  return pool;
}

function stopAudio() {
  if (clipTimeoutHandle) {
    clearTimeout(clipTimeoutHandle);
    clipTimeoutHandle = null;
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

function playClip(url) {
  stopAudio();
  currentAudio = new Audio(url);
  currentAudio.play().catch(() => {});
  clipTimeoutHandle = setTimeout(() => {
    if (currentAudio) currentAudio.pause();
  }, CLIP_MS);
}

function startTimer() {
  startTime = performance.now();
  timerHandle = setInterval(() => {
    elapsedMs = performance.now() - startTime;
    document.getElementById("amemoryTimer").textContent =
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
    document.querySelector('input[name="amemory-mode"]:checked').value,
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
  stopAudio();

  const chosen = shuffle(coverPool).slice(0, difficulty);
  const raw = [];
  chosen.forEach((c, idx) => {
    raw.push({ pairId: idx, cover: c.cover, album: c.album, previewUrl: c.previewUrl });
    raw.push({ pairId: idx, cover: c.cover, album: c.album, previewUrl: c.previewUrl });
  });
  cards = shuffle(raw).map((c, i) => ({ ...c, uid: i }));

  renderGrid();
  updateStatus();
  showScreen("amemory-game");
}

function renderGrid() {
  const grid = document.getElementById("amemoryGrid");
  grid.className = "amemory-grid diff-" + difficulty;
  grid.innerHTML = "";

  cards.forEach((card) => {
    const el = document.createElement("div");
    el.className = "amemory-card";
    el.dataset.uid = card.uid;
    el.dataset.pairId = card.pairId;
    el.innerHTML =
      '<div class="amemory-card-inner">' +
      '<div class="amemory-card-face amemory-card-back">♪</div>' +
      '<div class="amemory-card-face amemory-card-front">' +
      '<div class="amemory-listening-icon"><span></span><span></span><span></span><span></span></div>' +
      "</div>" +
      "</div>";
    el.addEventListener("click", () => handleCardClick(el, card));
    grid.appendChild(el);
  });
}

function updateStatus() {
  document.getElementById("amemoryProgress").textContent =
    matchedPairs + " / " + totalPairs + " 組";
  document.getElementById("amemoryMoves").textContent = "翻牌：" + moves;
}

function revealCover(el, card) {
  const front = el.querySelector(".amemory-card-front");
  front.innerHTML = '<img src="' + esc(card.cover) + '" alt="' + esc(card.album) + '">';
}

function handleCardClick(el, card) {
  if (busy || gameFinished) return;
  if (el.classList.contains("flipped") || el.classList.contains("matched")) return;
  if (flippedCards.length >= 2) return;

  if (startTime === null) startTimer();

  el.classList.add("flipped");
  playClip(card.previewUrl);
  flippedCards.push({ el, card });

  if (flippedCards.length === 2) {
    moves++;
    updateStatus();
    busy = true;
    const [a, b] = flippedCards;
    if (a.card.pairId === b.card.pairId) {
      setTimeout(() => {
        stopAudio();
        a.el.classList.add("matched");
        b.el.classList.add("matched");
        revealCover(a.el, a.card);
        revealCover(b.el, b.card);
        flippedCards = [];
        busy = false;
        matchedPairs++;
        updateStatus();
        if (matchedPairs >= totalPairs) {
          finishGame();
        }
      }, 500);
    } else {
      setTimeout(() => {
        stopAudio();
        a.el.classList.remove("flipped");
        b.el.classList.remove("flipped");
        flippedCards = [];
        busy = false;
      }, 900);
    }
  }
}

function finishGame() {
  gameFinished = true;
  stopTimer();
  stopAudio();
  showResult();
}

function showResult() {
  showScreen("amemory-result");
  document.getElementById("resultMode").textContent = diffLabel[difficulty];
  document.getElementById("resultScore").textContent =
    (elapsedMs / 1000).toFixed(2) + "s";
  document.getElementById("resultDetail").textContent =
    "翻牌次數：" + moves + " 次";

  document.getElementById("submitScoreWrap").hidden = false;
  document.getElementById("scoreSubmitted").hidden = true;
  document.getElementById("resultLeaderboard").hidden = true;

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

  fetch("/.netlify/functions/submit-audio-memory-score", {
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
      if (thisSession !== gameSession) return;
      document.getElementById("submitScoreWrap").hidden = true;
      document.getElementById("scoreSubmitted").hidden = false;
      loadLeaderboard("resultLeaderboard", difficulty);
      loadLeaderboard(introBoardId(difficulty), difficulty);
    })
    .catch(() => {
      if (thisSession !== gameSession) return;
      submitBtn.disabled = false;
      submitBtn.textContent = "提交成績";
      document.getElementById("scoreSubmitted").textContent = "提交失敗，請重試";
      document.getElementById("scoreSubmitted").hidden = false;
    });
}

function loadLeaderboard(containerId, difficulty) {
  const container = document.getElementById(containerId);
  container.hidden = false;
  container.innerHTML = '<p class="leaderboard-loading">載入排行榜中...</p>';

  fetch("/.netlify/functions/get-audio-memory-leaderboard?difficulty=" + difficulty)
    .then((res) => res.json())
    .then((data) => {
      if (!data || data.length === 0) {
        container.innerHTML =
          '<p class="leaderboard-empty">目前還沒有紀錄，等你來挑戰！</p>';
        return;
      }
      let html = '<div class="leaderboard-card">';
      html += '<table class="leaderboard-table">';
      html += "<thead><tr><th>#</th><th>選手</th><th>翻牌</th><th>用時</th></tr></thead>";
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
      container.innerHTML = '<p class="leaderboard-empty">載入失敗，請稍後再試</p>';
    });
}

async function boot() {
  const res = await fetch(DATA_URL);
  const allSongs = await res.json();
  coverPool = buildAudioCoverPool(allSongs);

  document.getElementById("amemoryStartBtn").addEventListener("click", startGame);
  document.getElementById("amemoryRestart").addEventListener("click", () => {
    stopTimer();
    stopAudio();
    showScreen("amemory-intro");
  });
  document.getElementById("submitScoreBtn").addEventListener("click", submitScore);

  loadLeaderboard("lbEasy", 10);
  loadLeaderboard("lbMedium", 20);
  loadLeaderboard("lbHard", 25);
}

boot();
