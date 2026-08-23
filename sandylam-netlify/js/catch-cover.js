const SONGS_URL = "data/songs.json";

const LANE_COUNT = 6;
const CATCH_BAND_TOP = 74; // 封面 top（field 高度百分比）落在這個區間內才可能被接到
const CATCH_BAND_BOTTOM = 92;
const MISS_TOP = 104; // 超過這個 top 視為掉出畫面、沒接到
const LANE_COOLDOWN_MS = 700; // 同一條軌道封面離開後，要冷卻這麼久才能再出下一個
const BASKET_HALF_WIDTH = 11; // 籃子寬度的一半（field 寬度百分比），對應 CSS 的 22% 寬
const BASKET_SPEED_PER_FRAME = 0.9; // 籃子每個動畫影格移動的百分比

const HIT_SCORE_BASE = 100;
const MISS_PENALTY = 50;

// 難度參數：spawnInterval / fallDuration 會隨時間從 start 線性加速到 end
const DIFFICULTY = {
  easy: {
    duration: 30,
    spawnIntervalStart: 1500,
    spawnIntervalEnd: 1150,
    fallDurationStart: 4600,
    fallDurationEnd: 3800,
    maxConcurrent: 1,
    targetProb: 0.5,
    waveDuration: 12,
  },
  medium: {
    duration: 45,
    spawnIntervalStart: 1200,
    spawnIntervalEnd: 850,
    fallDurationStart: 4000,
    fallDurationEnd: 3200,
    maxConcurrent: 2,
    targetProb: 0.4,
    waveDuration: 10,
  },
  hard: {
    duration: 60,
    spawnIntervalStart: 950,
    spawnIntervalEnd: 650,
    fallDurationStart: 3400,
    fallDurationEnd: 2600,
    maxConcurrent: 3,
    targetProb: 0.3,
    waveDuration: 8,
  },
};

let songPool = [],
  uniqueCovers = [],
  gameMode = "easy",
  diff = null,
  currentAudio = null,
  currentTarget = null,
  score = 0,
  hits = 0,
  misses = 0,
  combo = 0,
  maxCombo = 0,
  elapsed = 0,
  waveElapsed = 0,
  gameTimerId = null,
  spawnTimerId = null,
  rafId = null,
  gameRunning = false,
  imageCache = new Map(),
  lanes = [], // { index, occupied, cooldownUntil }
  lastUsedLane = -1,
  fallingCovers = [], // { el, imgEl, lane, spawnTime, fallDuration, isTarget, removed }
  basketX = 50, // field 寬度百分比，籃子中心位置
  leftPressed = false,
  rightPressed = false,
  fieldEl = null,
  basketEl = null;

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

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function progressRatio() {
  return elapsed / diff.duration;
}

function showScreen(id) {
  ["catch-intro", "catch-game", "catch-result"].forEach((s) => {
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
  const paths = uniqueCovers.map((c) => c.cover);
  const loadAll = Promise.all(paths.map(preloadImage));
  const timeout = new Promise((resolve) => setTimeout(resolve, 8000));
  return Promise.race([loadAll, timeout]);
}

/* ---------------- 音樂 ---------------- */

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

function pickNewTarget() {
  const excludeId = currentTarget ? currentTarget.id : null;
  const candidates = songPool.filter((s) => s.id !== excludeId);
  currentTarget = candidates[Math.floor(Math.random() * candidates.length)];
  waveElapsed = 0;
  playTargetAudio();

  const banner = document.getElementById("catchTargetBanner");
  banner.classList.remove("pulse");
  void banner.offsetWidth;
  banner.classList.add("pulse");
}

function pickDecoyCover(recentList) {
  const targetCover = currentTarget.cover;
  const pool = uniqueCovers.filter(
    (c) => c.cover !== targetCover && !recentList.includes(c.cover),
  );
  const finalPool =
    pool.length > 0 ? pool : uniqueCovers.filter((c) => c.cover !== targetCover);
  const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
  recentList.push(pick.cover);
  if (recentList.length > 5) recentList.shift();
  return pick;
}
let recentDecoyCovers = [];

/* ---------------- 場地初始化 ---------------- */

function buildField() {
  fieldEl = document.getElementById("catchField");
  fieldEl.querySelectorAll(".falling-cover").forEach((el) => el.remove());
  basketEl = document.getElementById("catchBasket");
  basketX = 50;
  basketEl.style.left = basketX + "%";

  lanes = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    lanes.push({ index: i, occupied: false, cooldownUntil: 0 });
  }
  fallingCovers = [];
}

function laneCenterPercent(laneIndex) {
  return ((laneIndex + 0.5) / LANE_COUNT) * 100;
}

/* ---------------- 出封面 ---------------- */

function spawnCover() {
  if (!gameRunning) return;
  if (fallingCovers.length >= diff.maxConcurrent) return;

  const freeLanes = lanes.filter(
    (l) =>
      !l.occupied &&
      performance.now() >= l.cooldownUntil &&
      l.index !== lastUsedLane,
  );
  if (freeLanes.length === 0) return;

  const lane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
  const isTarget = Math.random() < diff.targetProb;

  let coverPath, label;
  if (isTarget) {
    coverPath = currentTarget.cover;
    label = currentTarget.title;
  } else {
    const decoy = pickDecoyCover(recentDecoyCovers);
    coverPath = decoy.cover;
    label = decoy.album;
  }

  const el = document.createElement("div");
  el.className = "falling-cover";
  el.style.left = laneCenterPercent(lane.index) + "%";
  el.style.top = "-18%";
  const img = document.createElement("img");
  img.src = coverPath;
  img.alt = label;
  el.appendChild(img);
  fieldEl.appendChild(el);

  const fallDuration = lerp(
    diff.fallDurationStart,
    diff.fallDurationEnd,
    progressRatio(),
  );

  const coverObj = {
    el,
    lane,
    spawnTime: performance.now(),
    fallDuration,
    isTarget,
    removed: false,
  };

  lane.occupied = true;
  fallingCovers.push(coverObj);
}

function releaseLane(coverObj) {
  coverObj.lane.occupied = false;
  coverObj.lane.cooldownUntil = performance.now() + LANE_COOLDOWN_MS;
  lastUsedLane = coverObj.lane.index;
}

function scheduleNextSpawn() {
  if (!gameRunning) return;
  const interval = lerp(
    diff.spawnIntervalStart,
    diff.spawnIntervalEnd,
    progressRatio(),
  );
  spawnTimerId = setTimeout(() => {
    spawnCover();
    scheduleNextSpawn();
  }, interval);
}

/* ---------------- 接取判定 / 動畫迴圈 ---------------- */

function catchCover(coverObj, success) {
  coverObj.removed = true;
  releaseLane(coverObj);

  if (success) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    const multiplier = comboMultiplier(combo);
    const gained = Math.round(HIT_SCORE_BASE * multiplier);
    score += gained;
    hits++;

    coverObj.el.classList.add("caught-hit");
    showFloatScore("+" + gained, "plus");
  } else {
    score = Math.max(0, score - MISS_PENALTY);
    misses++;
    combo = 0;

    coverObj.el.classList.add("caught-wrong");
    showFloatScore("-" + MISS_PENALTY, "minus");
    flashWrong();
  }

  updateStatus();
  setTimeout(() => coverObj.el.remove(), 220);
}

function missCover(coverObj) {
  coverObj.removed = true;
  releaseLane(coverObj);
  if (coverObj.isTarget) {
    combo = 0;
    updateStatus();
  }
  coverObj.el.remove();
}

function comboMultiplier(c) {
  if (c >= 10) return 2;
  if (c >= 6) return 1.5;
  if (c >= 3) return 1.2;
  return 1;
}

function showFloatScore(text, cls) {
  const el = document.createElement("div");
  el.className = "whack-float-score " + cls;
  el.textContent = text;
  basketEl.appendChild(el);
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

function animationLoop() {
  if (!gameRunning) return;

  // 移動籃子
  if (leftPressed) basketX -= BASKET_SPEED_PER_FRAME;
  if (rightPressed) basketX += BASKET_SPEED_PER_FRAME;
  basketX = Math.max(BASKET_HALF_WIDTH, Math.min(100 - BASKET_HALF_WIDTH, basketX));
  basketEl.style.left = basketX + "%";

  const now = performance.now();

  fallingCovers.forEach((c) => {
    if (c.removed) return;
    const t = (now - c.spawnTime) / c.fallDuration;
    const topPercent = -18 + t * 122; // -18% -> 104%
    c.el.style.top = topPercent + "%";

    if (topPercent >= CATCH_BAND_TOP && topPercent <= CATCH_BAND_BOTTOM) {
      const laneCenter = laneCenterPercent(c.lane.index);
      const inBasket =
        laneCenter >= basketX - BASKET_HALF_WIDTH &&
        laneCenter <= basketX + BASKET_HALF_WIDTH;
      if (inBasket) {
        catchCover(c, c.isTarget);
        return;
      }
    }

    if (topPercent >= MISS_TOP) {
      missCover(c);
    }
  });

  fallingCovers = fallingCovers.filter((c) => !c.removed);

  rafId = requestAnimationFrame(animationLoop);
}

/* ---------------- 時間 / 狀態 ---------------- */

function updateStatus() {
  document.getElementById("catchScore").textContent = "分數：" + score;
  document.getElementById("catchCombo").textContent = "連擊：" + combo;
  document.getElementById("catchTimeLeft").textContent =
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
  gameMode = document.querySelector('input[name="catch-mode"]:checked').value;
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
  lastUsedLane = -1;
  gameRunning = true;

  buildField();
  showScreen("catch-game");
  updateStatus();

  pickNewTarget();
  scheduleNextSpawn();
  gameTimerId = setInterval(tick, 100);
  rafId = requestAnimationFrame(animationLoop);
}

function endGame() {
  gameRunning = false;
  clearInterval(gameTimerId);
  clearTimeout(spawnTimerId);
  cancelAnimationFrame(rafId);
  fallingCovers.forEach((c) => c.el.remove());
  fallingCovers = [];
  stopAudio();
  leftPressed = false;
  rightPressed = false;

  showScreen("catch-result");
  const ml = { easy: "初級（30秒）", medium: "中級（45秒）", hard: "最高級（60秒）" };
  const totalCatches = hits + misses;
  const accuracy = totalCatches > 0 ? Math.round((hits / totalCatches) * 100) : 0;

  document.getElementById("resultMode").textContent = ml[gameMode];
  document.getElementById("resultScore").textContent = score + " 分";
  document.getElementById("resultDetail").textContent =
    "接對 " + hits + " 次．接錯 " + misses + " 次．最高連擊 " + maxCombo + "．準確率 " + accuracy + "%";

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

  fetch("/.netlify/functions/submit-catch-score", {
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

  fetch("/.netlify/functions/get-catch-leaderboard?mode=" + mode)
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

/* ---------------- 籃子控制（按住方向鈕） ---------------- */

function setupControls() {
  const leftBtn = document.getElementById("catchLeftBtn");
  const rightBtn = document.getElementById("catchRightBtn");

  function bindPress(btn, setFn) {
    const start = (e) => {
      e.preventDefault();
      setFn(true);
    };
    const end = (e) => {
      e.preventDefault();
      setFn(false);
    };
    btn.addEventListener("mousedown", start);
    btn.addEventListener("touchstart", start, { passive: false });
    btn.addEventListener("mouseup", end);
    btn.addEventListener("mouseleave", end);
    btn.addEventListener("touchend", end);
    btn.addEventListener("touchcancel", end);
  }

  bindPress(leftBtn, (v) => (leftPressed = v));
  bindPress(rightBtn, (v) => (rightPressed = v));

  // 桌面版鍵盤方向鍵也支援
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") leftPressed = true;
    if (e.key === "ArrowRight") rightPressed = true;
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft") leftPressed = false;
    if (e.key === "ArrowRight") rightPressed = false;
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

  setupControls();

  document.getElementById("catchStartBtn").addEventListener("click", startGame);
  document.getElementById("catchRestart").addEventListener("click", () => {
    showScreen("catch-intro");
  });
  document.getElementById("submitScoreBtn").addEventListener("click", submitScore);

  loadLeaderboard("hard", "lbHard");
  loadLeaderboard("medium", "lbMedium");
  loadLeaderboard("easy", "lbEasy");

  const startBtn = document.getElementById("catchStartBtn");
  startBtn.disabled = true;
  const originalLabel = startBtn.textContent;
  startBtn.textContent = "圖片準備中...";
  preloadAllCovers().then(() => {
    startBtn.disabled = false;
    startBtn.textContent = originalLabel;
  });
}

boot();
