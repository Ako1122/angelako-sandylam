const SONGS_URL = "data/songs.json";

// 難度參數：spawnInterval/upTime 會隨時間從 start 線性加速到 end
const DIFFICULTY = {
  easy: {
    duration: 30,
    spawnIntervalStart: 1200,
    spawnIntervalEnd: 900,
    upTimeStart: 1300,
    upTimeEnd: 1000,
    maxConcurrent: 1,
    targetProb: 0.45,
    waveDuration: 12,
  },
  medium: {
    duration: 45,
    spawnIntervalStart: 1000,
    spawnIntervalEnd: 650,
    upTimeStart: 1050,
    upTimeEnd: 800,
    maxConcurrent: 2,
    targetProb: 0.35,
    waveDuration: 10,
  },
  hard: {
    duration: 60,
    spawnIntervalStart: 800,
    spawnIntervalEnd: 450,
    upTimeStart: 850,
    upTimeEnd: 600,
    maxConcurrent: 3,
    targetProb: 0.25,
    waveDuration: 8,
  },
};

const HIT_SCORE_BASE = 100;
const MISS_PENALTY = 50;
const GRID_SIZE = 16; // 4x4

let songPool = [], // 有 preview_url 且有 cover 的歌曲，用來選「正在播放」的目標曲目
  uniqueCovers = [], // 去重後的專輯封面庫（用於干擾選項）
  gameMode = "easy",
  diff = null,
  currentAudio = null,
  currentTarget = null, // 目前正在播放、玩家要找的目標歌曲
  score = 0,
  hits = 0,
  misses = 0,
  combo = 0,
  maxCombo = 0,
  timeLeft = 0,
  elapsed = 0,
  waveElapsed = 0,
  gameTimerId = null,
  spawnTimerId = null,
  gameRunning = false,
  holes = [], // { el, imgEl, active, isTarget, hideTimer }
  recentDecoyCovers = [];

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
  ["whack-intro", "whack-game", "whack-result"].forEach((s) => {
    document.getElementById(s).hidden = s !== id;
  });
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

function playTargetAudio() {
  stopAudio();
  if (!currentTarget || !currentTarget.preview_url) return;
  currentAudio = new Audio(currentTarget.preview_url);
  currentAudio.loop = true;
  currentAudio.play().catch(() => {});
}

/* ---------------- 遊戲初始化 ---------------- */

function buildGrid() {
  const grid = document.getElementById("whackGrid");
  grid.innerHTML = "";
  holes = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    const hole = document.createElement("div");
    hole.className = "whack-hole";
    const img = document.createElement("img");
    img.className = "whack-cover-img";
    img.alt = "";
    hole.appendChild(img);
    grid.appendChild(hole);

    const holeState = {
      el: hole,
      imgEl: img,
      active: false,
      isTarget: false,
      hideTimer: null,
    };
    hole.addEventListener("click", () => handleHoleClick(holeState));
    holes.push(holeState);
  }
}

function pickNewTarget() {
  const excludeId = currentTarget ? currentTarget.id : null;
  const candidates = songPool.filter((s) => s.id !== excludeId);
  currentTarget = candidates[Math.floor(Math.random() * candidates.length)];
  waveElapsed = 0;
  playTargetAudio();

  const banner = document.getElementById("whackTargetBanner");
  banner.classList.remove("pulse");
  void banner.offsetWidth;
  banner.classList.add("pulse");
}

function pickDecoyCover() {
  const targetCover = currentTarget.cover;
  const pool = uniqueCovers.filter(
    (c) => c.cover !== targetCover && !recentDecoyCovers.includes(c.cover),
  );
  const finalPool = pool.length > 0 ? pool : uniqueCovers.filter((c) => c.cover !== targetCover);
  const pick = finalPool[Math.floor(Math.random() * finalPool.length)];

  recentDecoyCovers.push(pick.cover);
  if (recentDecoyCovers.length > 5) recentDecoyCovers.shift();

  return pick;
}

/* ---------------- 出洞 / 收洞 ---------------- */

function spawnMole() {
  if (!gameRunning) return;

  const activeCount = holes.filter((h) => h.active).length;
  if (activeCount >= diff.maxConcurrent) return;

  const emptyHoles = holes.filter((h) => !h.active);
  if (emptyHoles.length === 0) return;

  const hole = emptyHoles[Math.floor(Math.random() * emptyHoles.length)];
  const isTarget = Math.random() < diff.targetProb;

  let coverPath, label;
  if (isTarget) {
    coverPath = currentTarget.cover;
    label = currentTarget.title;
  } else {
    const decoy = pickDecoyCover();
    coverPath = decoy.cover;
    label = decoy.album;
  }

  hole.imgEl.src = coverPath;
  hole.imgEl.alt = label;
  hole.isTarget = isTarget;
  hole.active = true;
  hole.spawnTime = performance.now();
  hole.el.classList.add("active");
  hole.el.classList.remove("hit", "wrong");

  const upTime = lerp(diff.upTimeStart, diff.upTimeEnd, progressRatio());
  hole.hideTimer = setTimeout(() => {
    hideMole(hole, hole.isTarget ? "expire" : null);
  }, upTime);
}

function hideMole(hole, reason) {
  if (!hole.active) return;
  hole.active = false;
  hole.el.classList.remove("active");
  clearTimeout(hole.hideTimer);

  if (reason === "expire") {
    // 目標封面沒點到，連擊中斷但不扣分
    combo = 0;
    updateStatus();
  }
}

function handleHoleClick(hole) {
  if (!hole.active || !gameRunning) return;

  const reactionMs = performance.now() - hole.spawnTime;

  if (hole.isTarget) {
    let gained = HIT_SCORE_BASE;
    if (reactionMs <= 300) gained += 50;
    else if (reactionMs <= 600) gained += 20;

    combo++;
    maxCombo = Math.max(maxCombo, combo);
    const multiplier = comboMultiplier(combo);
    gained = Math.round(gained * multiplier);

    score += gained;
    hits++;

    hole.el.classList.add("hit");
    showFloatScore(hole, "+" + gained, "plus");
  } else {
    score = Math.max(0, score - MISS_PENALTY);
    misses++;
    combo = 0;

    hole.el.classList.add("wrong");
    showFloatScore(hole, "-" + MISS_PENALTY, "minus");
    flashWrong();
  }

  updateStatus();
  hideMole(hole, null);
}

function comboMultiplier(c) {
  if (c >= 10) return 2;
  if (c >= 6) return 1.5;
  if (c >= 3) return 1.2;
  return 1;
}

function showFloatScore(hole, text, cls) {
  const el = document.createElement("div");
  el.className = "whack-float-score " + cls;
  el.textContent = text;
  hole.el.appendChild(el);
  setTimeout(() => el.remove(), 650);
}

function flashWrong() {
  let flash = document.querySelector(".whack-flash-wrong");
  if (!flash) {
    flash = document.createElement("div");
    flash.className = "whack-flash-wrong";
    document.body.appendChild(flash);
  }
  flash.classList.add("show");
  setTimeout(() => flash.classList.remove("show"), 90);
}

/* ---------------- 時間 / 節奏控制 ---------------- */

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function progressRatio() {
  return elapsed / diff.duration;
}

function scheduleNextSpawn() {
  if (!gameRunning) return;
  const interval = lerp(diff.spawnIntervalStart, diff.spawnIntervalEnd, progressRatio());
  spawnTimerId = setTimeout(() => {
    spawnMole();
    scheduleNextSpawn();
  }, interval);
}

function updateStatus() {
  document.getElementById("whackScore").textContent = "分數：" + score;
  document.getElementById("whackCombo").textContent = "連擊：" + combo;
  document.getElementById("whackTimeLeft").textContent =
    "⏱ " + Math.max(0, Math.ceil(diff.duration - elapsed));
}

function tick() {
  elapsed += 0.1;
  waveElapsed += 0.1;

  if (waveElapsed >= diff.waveDuration) {
    pickNewTarget();
  }

  if (elapsed >= diff.duration) {
    endGame();
    return;
  }

  updateStatus();
}

/* ---------------- 遊戲流程 ---------------- */

function startGame() {
  gameMode = document.querySelector('input[name="whack-mode"]:checked').value;
  diff = DIFFICULTY[gameMode];

  score = 0;
  hits = 0;
  misses = 0;
  combo = 0;
  maxCombo = 0;
  elapsed = 0;
  waveElapsed = 0;
  recentDecoyCovers = [];
  currentTarget = null;
  gameRunning = true;

  buildGrid();
  showScreen("whack-game");
  updateStatus();

  pickNewTarget();
  scheduleNextSpawn();
  gameTimerId = setInterval(tick, 100);
}

function endGame() {
  gameRunning = false;
  clearInterval(gameTimerId);
  clearTimeout(spawnTimerId);
  holes.forEach((h) => hideMole(h, null));
  stopAudio();

  showScreen("whack-result");
  const ml = { easy: "初級（30秒）", medium: "中級（45秒）", hard: "最高級（60秒）" };
  const totalTaps = hits + misses;
  const accuracy = totalTaps > 0 ? Math.round((hits / totalTaps) * 100) : 0;

  document.getElementById("resultMode").textContent = ml[gameMode];
  document.getElementById("resultScore").textContent = score + " 分";
  document.getElementById("resultDetail").textContent =
    "命中 " + hits + " 次．失手 " + misses + " 次．最高連擊 " + maxCombo + "．準確率 " + accuracy + "%";

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

  fetch("/.netlify/functions/submit-whack-score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name,
      mode: gameMode,
      score: score,
      hits: hits,
      misses: misses,
      maxCombo: maxCombo,
      time: diff.duration,
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

  fetch("/.netlify/functions/get-whack-leaderboard?mode=" + mode)
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
        "<thead><tr><th>#</th><th>選手</th><th>分數</th><th>最高連擊</th><th>準確率</th></tr></thead>";
      html += "<tbody>";
      data.forEach((entry) => {
        html += "<tr>";
        html += '<td class="rank-col">' + entry.rank + "</td>";
        html += '<td class="name-col">' + esc(entry.name) + "</td>";
        html += "<td>" + entry.score + "</td>";
        html += "<td>" + entry.maxCombo + "</td>";
        html += "<td>" + entry.accuracy + "%</td>";
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

  songPool = allSongs.filter((s) => s.preview_url && s.cover);

  const albumMap = new Map();
  allSongs.forEach((s) => {
    if (s.album && s.cover && !albumMap.has(s.album)) {
      albumMap.set(s.album, { album: s.album, cover: s.cover });
    }
  });
  uniqueCovers = Array.from(albumMap.values());

  document.getElementById("whackStartBtn").addEventListener("click", startGame);
  document.getElementById("whackRestart").addEventListener("click", () => {
    showScreen("whack-intro");
  });
  document.getElementById("submitScoreBtn").addEventListener("click", submitScore);

  loadLeaderboard("hard", "lbHard");
  loadLeaderboard("medium", "lbMedium");
  loadLeaderboard("easy", "lbEasy");
}

boot();
