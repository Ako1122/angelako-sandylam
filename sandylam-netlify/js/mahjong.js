
const SONGS_URL = "data/songs.json";

// ==================== 牌局結構 ====================
const BASE_COLS = 7;
const BASE_ROWS = 7;
const BOARD_UNIT_W = BASE_COLS * 2;
const BOARD_UNIT_H = BASE_ROWS * 2;

const SHAPE_TEMPLATES = [
  {
    name: "三丘尖塔",
    blocks: [
      { layer: 0, cols: 7, rows: 7, offsetX: 0, offsetY: 0 },
      { layer: 1, cols: 3, rows: 3, offsetX: 0, offsetY: 0 },
      { layer: 1, cols: 3, rows: 3, offsetX: 4, offsetY: 0 },
      { layer: 1, cols: 3, rows: 3, offsetX: 2, offsetY: 4 },
      { layer: 2, cols: 2, rows: 2, offsetX: 0, offsetY: 0 },
      { layer: 2, cols: 2, rows: 2, offsetX: 4, offsetY: 0 },
      { layer: 2, cols: 2, rows: 2, offsetX: 2, offsetY: 4 },
      { layer: 3, cols: 2, rows: 2, offsetX: 2, offsetY: 0 },
      { layer: 4, cols: 1, rows: 2, offsetX: 2, offsetY: 0 },
      { layer: 5, cols: 1, rows: 2, offsetX: 2, offsetY: 0 },
    ],
  },
  {
    name: "十字架",
    blocks: [
      { layer: 0, cols: 3, rows: 3, offsetX: 2, offsetY: 2 },
      { layer: 0, cols: 3, rows: 2, offsetX: 2, offsetY: 0 },
      { layer: 0, cols: 3, rows: 2, offsetX: 2, offsetY: 5 },
      { layer: 0, cols: 2, rows: 3, offsetX: 0, offsetY: 2 },
      { layer: 0, cols: 2, rows: 3, offsetX: 5, offsetY: 2 },
      { layer: 1, cols: 3, rows: 3, offsetX: 2, offsetY: 2 },
      { layer: 1, cols: 3, rows: 1, offsetX: 2, offsetY: 1 },
      { layer: 1, cols: 3, rows: 1, offsetX: 2, offsetY: 5 },
      { layer: 1, cols: 1, rows: 3, offsetX: 1, offsetY: 2 },
      { layer: 1, cols: 1, rows: 3, offsetX: 5, offsetY: 2 },
      { layer: 2, cols: 1, rows: 1, offsetX: 3, offsetY: 3 },
      { layer: 2, cols: 1, rows: 1, offsetX: 3, offsetY: 2 },
      { layer: 2, cols: 1, rows: 1, offsetX: 3, offsetY: 4 },
      { layer: 2, cols: 1, rows: 1, offsetX: 2, offsetY: 3 },
      { layer: 2, cols: 1, rows: 1, offsetX: 4, offsetY: 3 },
      { layer: 3, cols: 1, rows: 1, offsetX: 3, offsetY: 3 },
    ],
  },
  {
    name: "菱形",
    blocks: [
      { layer: 0, cols: 1, rows: 1, offsetX: 3, offsetY: 0 },
      { layer: 0, cols: 3, rows: 1, offsetX: 2, offsetY: 1 },
      { layer: 0, cols: 5, rows: 1, offsetX: 1, offsetY: 2 },
      { layer: 0, cols: 7, rows: 1, offsetX: 0, offsetY: 3 },
      { layer: 0, cols: 5, rows: 1, offsetX: 1, offsetY: 4 },
      { layer: 0, cols: 3, rows: 1, offsetX: 2, offsetY: 5 },
      { layer: 0, cols: 1, rows: 1, offsetX: 3, offsetY: 6 },
      { layer: 1, cols: 3, rows: 1, offsetX: 2, offsetY: 1 },
      { layer: 1, cols: 5, rows: 1, offsetX: 1, offsetY: 2 },
      { layer: 1, cols: 5, rows: 1, offsetX: 1, offsetY: 3 },
      { layer: 1, cols: 5, rows: 1, offsetX: 1, offsetY: 4 },
      { layer: 1, cols: 3, rows: 1, offsetX: 2, offsetY: 5 },
      { layer: 2, cols: 3, rows: 1, offsetX: 2, offsetY: 2 },
      { layer: 2, cols: 3, rows: 1, offsetX: 2, offsetY: 3 },
      { layer: 2, cols: 3, rows: 1, offsetX: 2, offsetY: 4 },
      { layer: 3, cols: 1, rows: 1, offsetX: 3, offsetY: 3 },
    ],
  },
  {
    name: "蝴蝶",
    blocks: [
      { layer: 0, cols: 7, rows: 2, offsetX: 0, offsetY: 0 },
      { layer: 0, cols: 5, rows: 1, offsetX: 1, offsetY: 2 },
      { layer: 0, cols: 3, rows: 1, offsetX: 2, offsetY: 3 },
      { layer: 0, cols: 5, rows: 1, offsetX: 1, offsetY: 4 },
      { layer: 0, cols: 7, rows: 2, offsetX: 0, offsetY: 5 },
      { layer: 1, cols: 5, rows: 1, offsetX: 1, offsetY: 0 },
      { layer: 1, cols: 3, rows: 1, offsetX: 2, offsetY: 3 },
      { layer: 1, cols: 5, rows: 1, offsetX: 1, offsetY: 5 },
      { layer: 2, cols: 1, rows: 2, offsetX: 3, offsetY: 2 },
    ],
  },
];

var BLOCKS = SHAPE_TEMPLATES[0].blocks;
var TOTAL_PAIRS = BLOCKS.reduce(function(s, b) { return s + b.cols * b.rows; }, 0) / 2;
var currentShapeName = SHAPE_TEMPLATES[0].name;

// ==================== 遊戲模式設定 ====================
var TIME_LIMITS = { easy: 300, medium: 240, hard: 180, zen: Infinity, speed: Infinity, daily: 240 };
var IDLE_HINT_MS = 10000;
var AUTO_HINT_PENALTY = 30;
var MANUAL_HINT_PENALTY = 50;
var MANUAL_HINT_LIMITS = { easy: 5, medium: 3, hard: 2, zen: 99, speed: 2, daily: 3 };
var SHUFFLE_PENALTY = 150;
var SHUFFLE_LIMITS = { easy: 5, medium: 3, hard: 3, zen: 99, speed: 3, daily: 3 };
var MATCH_SCORE = 100;
var STREAK_WINDOW_MS_MAP = { easy: 5000, medium: 4000, hard: 3000, zen: 5000, speed: 3000, daily: 4000 };
var CLEAR_BONUS = 2000;
var TIME_BONUS_PER_SEC = 10;

// ==================== 成就定義 ====================
var ACHIEVEMENTS = [
  { id: "first_game", name: "初試啼聲", icon: "🐣", desc: "完成第一局遊戲" },
  { id: "first_clear", name: "全清大師", icon: "🧹", desc: "任意難度全清" },
  { id: "triple_crown", name: "三冠王", icon: "👑", desc: "初級、中級、最高級都全清過" },
  { id: "combo_10", name: "連擊達人", icon: "🔥", desc: "單局達成 10 連擊" },
  { id: "speed_demon", name: "閃電手", icon: "⚡", desc: "30 秒內清 10 對" },
  { id: "no_hints", name: "不靠提示", icon: "🧠", desc: "全清且未使用任何提示" },
  { id: "all_shapes", name: "四種花色", icon: "🎴", desc: "玩過所有四種牌型" },
  { id: "veteran", name: "鐵粉認證", icon: "💎", desc: "累計遊玩 50 局" },
  { id: "combo_20", name: "超級連擊", icon: "💥", desc: "單局達成 20 連擊" },
  { id: "perfect_hard", name: "完美最高級", icon: "🏆", desc: "最高級全清且不用提示不洗牌" },
];

// ==================== 遊戲狀態 ====================
var uniqueCovers = [];
var selectedCovers = [];
var positions = [];
var tiles = [];
var score = 0;
var pairsCleared = 0;
var gameMode = "easy";
var timeLeft = 0;
var timeElapsed = 0;
var timerId = null;
var idleCheckId = null;
var gameRunning = false;
var inputLocked = false;
var isPaused = false;
var selectedTile = null;
var lastMatchTime = 0;
var lastProgressTime = 0;
var manualHintsLeft = 2;
var manualHintsUsed = 0;
var autoHintsUsed = 0;
var streakCount = 0;
var maxStreak = 0;
var manualShufflesUsed = 0;
var autoShufflesUsed = 0;
var shufflesLeft = 3;
var boardEl = null;
var imageCache = new Map();
var soundEnabled = true;
var selectedShapeIndex = -1;
var gameStartTimestamp = 0;
var pairsIn30s = 0;
var pairsIn30sTimer = null;
var dailySeed = "";
var newlyUnlocked = [];

// ==================== 玩家個人檔案 ====================
function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem("mj_profile")) || {
      totalGames: 0, totalPairs: 0, bestScores: {}, fastestClears: {},
      maxStreak: 0, shapesPlayed: [], achievements: [], clearedModes: [], dailyPlayed: {}
    };
  } catch(e) {
    return {
      totalGames: 0, totalPairs: 0, bestScores: {}, fastestClears: {},
      maxStreak: 0, shapesPlayed: [], achievements: [], clearedModes: [], dailyPlayed: {}
    };
  }
}
function saveProfile(p) { try { localStorage.setItem("mj_profile", JSON.stringify(p)); } catch(e) {} }
function loadSoundPref() { try { var v = localStorage.getItem("mj_sound"); return v === null ? true : v === "1"; } catch(e) { return true; } }
function saveSoundPref(v) { try { localStorage.setItem("mj_sound", v ? "1" : "0"); } catch(e) {} }

// ==================== 工具函式 ====================
function esc(str) { var d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

function shuffle(a) {
  var b = a.slice();
  for (var i = b.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = b[i]; b[i] = b[j]; b[j] = tmp;
  }
  return b;
}

function seededRandom(seed) {
  var h = 0;
  for (var i = 0; i < seed.length; i++) { h = ((h << 5) - h + seed.charCodeAt(i)) | 0; }
  return function() { h = (h * 1664525 + 1013904223) | 0; return ((h >>> 0) / 4294967296); };
}

function seededShuffle(a, rng) {
  var b = a.slice();
  for (var i = b.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = b[i]; b[i] = b[j]; b[j] = tmp;
  }
  return b;
}

function getTodayString() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function showScreen(id) {
  ["mj-intro", "mj-game", "mj-result"].forEach(function(s) { document.getElementById(s).hidden = (s !== id); });
}

function formatTime(sec) {
  if (sec === Infinity || sec === undefined) return "∞";
  var mm = String(Math.floor(sec / 60)).padStart(2, "0");
  var ss = String(Math.floor(sec % 60)).padStart(2, "0");
  return mm + ":" + ss;
}

// ==================== 音效 ====================
var audioCtx = null;
function ensureAudioCtx() {
  if (!audioCtx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; audioCtx = new C(); }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(freq, dur, type, vol) {
  if (!soundEnabled) return;
  var ctx = ensureAudioCtx(); if (!ctx) return;
  try {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
  } catch(e) {}
}

function playMatchSound(streak) {
  var f = 600 + Math.min(streak - 1, 6) * 45;
  playTone(f, 0.15, "sine", 0.18);
  setTimeout(function() { playTone(f * 1.5, 0.12, "sine", 0.12); }, 60);
}
function playErrorSound() { playTone(180, 0.16, "square", 0.14); }
function playCountdownTick(s) { playTone(440 + (10 - s) * 30, 0.09, "square", 0.15); }
function playAchievementSound() {
  playTone(523, 0.12, "sine", 0.2);
  setTimeout(function() { playTone(659, 0.12, "sine", 0.2); }, 120);
  setTimeout(function() { playTone(784, 0.2, "sine", 0.25); }, 240);
}
function playShuffleSound() {
  for (var i = 0; i < 5; i++) {
    (function(idx) { setTimeout(function() { playTone(300 + idx * 60, 0.06, "triangle", 0.1); }, idx * 40); })(i);
  }
}

// ==================== 圖片預載 ====================
function preloadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  var p = new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() { if (img.decode) { img.decode().then(resolve).catch(resolve); } else { resolve(); } };
    img.onerror = resolve; img.src = src;
  });
  imageCache.set(src, p); return p;
}
function preloadAllCovers() {
  var all = Promise.all(uniqueCovers.map(function(c) { return preloadImage(c.cover); }));
  var timeout = new Promise(function(r) { setTimeout(r, 8000); });
  return Promise.race([all, timeout]);
}

// ==================== 牌局結構 ====================
function buildPositions() {
  var list = [];
  BLOCKS.forEach(function(block) {
    for (var gy = 0; gy < block.rows; gy++) {
      for (var gx = 0; gx < block.cols; gx++) {
        list.push({ layer: block.layer, gx: block.offsetX + gx, gy: block.offsetY + gy,
          absX: (block.offsetX + gx) * 2, absY: (block.offsetY + gy) * 2 });
      }
    }
  });
  return list;
}

function overlaps(a, b) {
  return a.absX < b.absX + 2 && a.absX + 2 > b.absX && a.absY < b.absY + 2 && a.absY + 2 > b.absY;
}

var coverCache = {}, leftNeighborCache = {}, rightNeighborCache = {};

function buildAdjacencyCache() {
  coverCache = {}; leftNeighborCache = {}; rightNeighborCache = {};
  for (var i = 0; i < positions.length; i++) {
    coverCache[i] = []; leftNeighborCache[i] = []; rightNeighborCache[i] = [];
    var pos = positions[i];
    for (var j = 0; j < positions.length; j++) {
      if (i === j) continue;
      var p = positions[j];
      if (p.layer > pos.layer && overlaps(pos, p)) coverCache[i].push(j);
      if (p.layer === pos.layer && p.gy === pos.gy) {
        if (p.gx === pos.gx - 1) leftNeighborCache[i].push(j);
        if (p.gx === pos.gx + 1) rightNeighborCache[i].push(j);
      }
    }
  }
}

function isFreeIdx(idx) {
  var k;
  for (k = 0; k < coverCache[idx].length; k++) { if (tiles[coverCache[idx][k]] && tiles[coverCache[idx][k]].alive) return false; }
  var lb = false, rb = false;
  for (k = 0; k < leftNeighborCache[idx].length; k++) { if (tiles[leftNeighborCache[idx][k]] && tiles[leftNeighborCache[idx][k]].alive) { lb = true; break; } }
  for (k = 0; k < rightNeighborCache[idx].length; k++) { if (tiles[rightNeighborCache[idx][k]] && tiles[rightNeighborCache[idx][k]].alive) { rb = true; break; } }
  return !(lb && rb);
}

// ==================== 保證有解的牌局生成 ====================
function generateSolvableTypesForAlive(aliveIndexes, typePool, rng) {
  var tempAlive = {};
  positions.forEach(function(_, i) { tempAlive[i] = false; });
  aliveIndexes.forEach(function(i) { tempAlive[i] = true; });

  function isFreeTemp(idx) {
    var k;
    for (k = 0; k < coverCache[idx].length; k++) { if (tempAlive[coverCache[idx][k]]) return false; }
    var lb = false, rb = false;
    for (k = 0; k < leftNeighborCache[idx].length; k++) { if (tempAlive[leftNeighborCache[idx][k]]) { lb = true; break; } }
    for (k = 0; k < rightNeighborCache[idx].length; k++) { if (tempAlive[rightNeighborCache[idx][k]]) { rb = true; break; } }
    return !(lb && rb);
  }

  var shuffleFn = rng ? function(a) { return seededShuffle(a, rng); } : shuffle;
  // 每一輪找出「當下同時空閒」的格子，優先湊成 4 張一組（同一種封面兩對），
  // 湊不到 4 張才退回 2 張一組。同一組內的牌是同一時刻證明空閒的，
  // 所以之後不管玩家用哪種兩兩組合去消，都還是保證解得開。
  var remaining = aliveIndexes.slice();
  var groups = [];
  var guard = 0;
  while (remaining.length > 0) {
    guard++;
    if (guard > aliveIndexes.length * 2 + 10) return null;
    var freeList = remaining.filter(function(i) { return isFreeTemp(i); });
    if (freeList.length < 2) return null;
    var shuffled = shuffleFn(freeList);
    var groupSize = shuffled.length >= 4 ? 4 : 2;
    var group = shuffled.slice(0, groupSize);
    groups.push(group);
    group.forEach(function(idx) { tempAlive[idx] = false; });
    remaining = remaining.filter(function(i) { return group.indexOf(i) === -1; });
  }
  var typeMap = {};
  var shuffledTypes = shuffleFn(typePool);
  groups.forEach(function(group, i) {
    var type = shuffledTypes[i];
    group.forEach(function(idx) { typeMap[idx] = type; });
  });
  return typeMap;
}

function generateFullBoard(rng) {
  positions = buildPositions();
  buildAdjacencyCache();
  var allIndexes = positions.map(function(_, i) { return i; });
  var pool = []; for (var n = 0; n < TOTAL_PAIRS; n++) pool.push(n);
  var typePool = (rng ? function(a) { return seededShuffle(a, rng); } : shuffle)(pool);
  var typeMap = null, attempts = 0;
  while (!typeMap && attempts < 30) { typeMap = generateSolvableTypesForAlive(allIndexes, typePool, rng); attempts++; }
  if (!typeMap) return generateFullBoard(rng);
  tiles = positions.map(function(_, i) { return { type: typeMap[i], alive: true, el: null }; });
}

// ==================== 畫面渲染 ====================
function tilePosStyle(pos) {
  return {
    leftPct: (pos.absX / BOARD_UNIT_W) * 100, topPct: (pos.absY / BOARD_UNIT_H) * 100,
    widthPct: (2 / BOARD_UNIT_W) * 100, heightPct: (2 / BOARD_UNIT_H) * 100
  };
}

function renderBoard() {
  boardEl = document.getElementById("mjBoard");
  boardEl.innerHTML = "";
  positions.forEach(function(pos, i) {
    var tile = tiles[i];
    var el = document.createElement("div");
    el.className = "mj-tile";
    var s = tilePosStyle(pos);
    el.style.left = s.leftPct + "%"; el.style.top = s.topPct + "%";
    el.style.width = s.widthPct + "%"; el.style.height = s.heightPct + "%";
    el.style.transform = "translate(" + (-pos.layer * 3) + "px, " + (-pos.layer * 4) + "px)";
    el.style.zIndex = 100 + pos.layer * 50 + pos.gy * 10 + pos.gx;
    var coverInfo = uniqueCovers.find(function(c) { return c.cover === selectedCovers[tile.type]; });
    el.setAttribute("aria-label", coverInfo ? coverInfo.album : "封面 " + tile.type);
    el.setAttribute("role", "button"); el.setAttribute("tabindex", "0");
    var face = document.createElement("div"); face.className = "mj-tile-face";
    var img = document.createElement("img"); img.src = selectedCovers[tile.type]; img.alt = ""; img.draggable = false;
    face.appendChild(img);
    var badge = document.createElement("span"); badge.className = "mj-tile-badge"; badge.textContent = tile.type + 1;
    face.appendChild(badge);
    el.appendChild(face);
    el.addEventListener("click", (function(idx) { return function() { handleTileClick(idx); }; })(i));
    el.addEventListener("keydown", (function(idx) { return function(e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleTileClick(idx); } }; })(i));
    boardEl.appendChild(el);
    tile.el = el;
  });
  refreshBlockedStates();
}

function refreshBlockedStates() {
  tiles.forEach(function(tile, i) {
    if (!tile.alive || !tile.el) return;
    tile.el.classList.toggle("blocked", !isFreeIdx(i));
  });
}

// ==================== 連擊視覺回饋 ====================
function showComboFloat(streak, anchorEl) {
  if (streak < 2) return;
  var el = document.createElement("div"); el.className = "mj-combo-float";
  var text = "🔥 x" + streak;
  var mult = comboMultiplier(streak);
  if (mult > 1) text += " ×" + mult;
  el.textContent = text;
  if (streak >= 10) el.classList.add("combo-mega");
  else if (streak >= 6) el.classList.add("combo-high");
  else if (streak >= 3) el.classList.add("combo-mid");
  anchorEl.appendChild(el);
  setTimeout(function() { el.remove(); }, 1200);
}

// ==================== 點擊 / 配對邏輯 ====================
function handleTileClick(idx) {
  if (inputLocked || !gameRunning || isPaused) return;
  var tile = tiles[idx];
  if (!tile.alive) return;
  if (!isFreeIdx(idx)) { playErrorSound(); return; }
  if (selectedTile === null) { selectedTile = idx; tile.el.classList.add("selected"); return; }
  if (selectedTile === idx) { tile.el.classList.remove("selected"); selectedTile = null; return; }
  var firstIdx = selectedTile, firstTile = tiles[firstIdx];
  if (firstTile.type === tile.type) {
    firstTile.el.classList.remove("selected"); removePair(firstIdx, idx); selectedTile = null;
  } else {
    playErrorSound(); firstTile.el.classList.remove("selected");
    tile.el.classList.add("mismatch"); firstTile.el.classList.add("mismatch");
    setTimeout(function() { tile.el.classList.remove("mismatch"); firstTile.el.classList.remove("mismatch"); }, 500);
    selectedTile = null;
  }
}

function comboMultiplier(streak) {
  if (streak >= 20) return 2.5; if (streak >= 15) return 2.0;
  if (streak >= 10) return 1.8; if (streak >= 6) return 1.5;
  if (streak >= 3) return 1.2; return 1;
}

function removePair(idxA, idxB) {
  var now = Date.now();
  var streakWindow = STREAK_WINDOW_MS_MAP[gameMode] || 4000;
  if (now - lastMatchTime <= streakWindow) { streakCount++; } else { streakCount = 1; }
  lastMatchTime = now; lastProgressTime = now;
  if (streakCount > maxStreak) maxStreak = streakCount;
  pairsIn30s++;
  var isZen = (gameMode === "zen");
  var gained = isZen ? 0 : Math.round(MATCH_SCORE * comboMultiplier(streakCount));
  score += gained; pairsCleared++;
  playMatchSound(streakCount);
  tiles[idxA].alive = false; tiles[idxB].alive = false;
  tiles[idxA].el.classList.add("removed"); tiles[idxB].el.classList.add("removed");
  if (!isZen) showScoreFloat(gained, tiles[idxA].el);
  showComboFloat(streakCount, tiles[idxB].el);
  updateStatus(); refreshBlockedStates();
  if (pairsCleared >= TOTAL_PAIRS) { setTimeout(function() { endGame(true); }, 400); return; }
  if (!hasAnyValidMove()) {
    setTimeout(function() { autoShufflesUsed++; showEmptyNotice("沒有可配對的組合了，自動洗牌中..."); playShuffleSound(); reshuffleRemaining(); }, 400);
  }
}

function showScoreFloat(gained, anchorEl) {
  var el = document.createElement("div"); el.className = "mj-score-float"; el.textContent = "+" + gained;
  anchorEl.appendChild(el); setTimeout(function() { el.remove(); }, 800);
}

function showEmptyNotice(text) {
  var wrap = document.querySelector(".mj-board-wrap");
  var notice = wrap.querySelector(".mj-empty-notice");
  if (!notice) { notice = document.createElement("p"); notice.className = "mj-empty-notice"; wrap.appendChild(notice); }
  notice.textContent = text; setTimeout(function() { notice.remove(); }, 1800);
}

// ==================== 可走步數 / 洗牌 / 提示 ====================
function hasAnyValidMove() {
  var freeByType = {};
  for (var i = 0; i < positions.length; i++) {
    if (!tiles[i].alive || !isFreeIdx(i)) continue;
    var t = tiles[i].type; freeByType[t] = (freeByType[t] || 0) + 1;
    if (freeByType[t] >= 2) return true;
  }
  return false;
}

function findHintPair() {
  var freeByType = {};
  for (var i = 0; i < positions.length; i++) {
    if (!tiles[i].alive || !isFreeIdx(i)) continue;
    var t = tiles[i].type;
    if (!freeByType[t]) freeByType[t] = [];
    freeByType[t].push(i);
    if (freeByType[t].length >= 2) return freeByType[t].slice(0, 2);
  }
  return null;
}

function flashHintPair(pair) {
  pair.forEach(function(i) {
    tiles[i].el.classList.add("hint-flash");
    setTimeout(function() { tiles[i].el.classList.remove("hint-flash"); }, 3000);
  });
}

function showHint() {
  if (inputLocked || !gameRunning || isPaused) return;
  if (manualHintsLeft <= 0) return;
  var pair = findHintPair(); if (!pair) return;
  manualHintsLeft--; manualHintsUsed++;
  if (gameMode !== "zen") score = Math.max(0, score - MANUAL_HINT_PENALTY);
  lastProgressTime = Date.now(); flashHintPair(pair); updateStatus();
}

function triggerAutoHint() {
  lastProgressTime = Date.now();
  var pair = findHintPair(); if (!pair) return;
  autoHintsUsed++;
  if (gameMode === "easy" && autoHintsUsed <= 1) { /* 初級第一次免費 */ }
  else if (gameMode !== "zen") { score = Math.max(0, score - AUTO_HINT_PENALTY); }
  flashHintPair(pair); updateStatus();
}

function reshuffleRemaining() {
  var aliveIndexes = [];
  tiles.forEach(function(t, i) { if (t.alive) aliveIndexes.push(i); });
  if (aliveIndexes.length === 0) return;
  var typeCounts = {};
  aliveIndexes.forEach(function(i) { typeCounts[tiles[i].type] = (typeCounts[tiles[i].type] || 0) + 1; });
  var expandedPool = [];
  Object.keys(typeCounts).forEach(function(t) { for (var k = 0; k < typeCounts[t] / 2; k++) expandedPool.push(Number(t)); });
  var typeMap = null, attempts = 0;
  while (!typeMap && attempts < 30) { typeMap = generateSolvableTypesForAlive(aliveIndexes, expandedPool); attempts++; }
  if (!typeMap) return;
  aliveIndexes.forEach(function(i) { tiles[i].el.classList.add("shuffling"); });
  setTimeout(function() {
    aliveIndexes.forEach(function(i) {
      tiles[i].type = typeMap[i];
      tiles[i].el.querySelector("img").src = selectedCovers[typeMap[i]];
      var bdg = tiles[i].el.querySelector(".mj-tile-badge"); if (bdg) bdg.textContent = typeMap[i] + 1;
      tiles[i].el.classList.remove("shuffling");
    });
    refreshBlockedStates();
  }, 300);
}

function manualShuffle() {
  if (!gameRunning || inputLocked || isPaused) return;
  if (shufflesLeft <= 0) return;
  shufflesLeft--; manualShufflesUsed++;
  if (gameMode !== "zen") score = Math.max(0, score - SHUFFLE_PENALTY);
  showEmptyNotice("重新洗牌中... (-" + SHUFFLE_PENALTY + "分)");
  playShuffleSound(); reshuffleRemaining(); updateStatus();
}


// ==================== 狀態列 / 計時 ====================
function updateStatus() {
  document.getElementById("mjScore").textContent = (gameMode === "zen") ? "禪模式" : "分數：" + score;
  document.getElementById("mjPairs").textContent = pairsCleared + " / " + TOTAL_PAIRS + " 對";
  if (gameMode === "speed" || gameMode === "zen") {
    document.getElementById("mjTimeLeft").textContent = "⏱ " + formatTime(timeElapsed);
  } else {
    document.getElementById("mjTimeLeft").textContent = "⏱ " + formatTime(timeLeft);
  }
  var hintBtn = document.getElementById("mjHintBtn");
  hintBtn.textContent = "💡 提示 (" + manualHintsLeft + ")";
  hintBtn.disabled = (manualHintsLeft <= 0);
  var shuffleBtn = document.getElementById("mjShuffleBtn");
  shuffleBtn.textContent = "🔀 洗牌 (" + shufflesLeft + ")";
  shuffleBtn.disabled = (shufflesLeft <= 0);
  var comboEl = document.getElementById("mjComboDisplay");
  if (comboEl) {
    if (streakCount >= 2 && Date.now() - lastMatchTime < (STREAK_WINDOW_MS_MAP[gameMode] || 4000) + 500) {
      comboEl.textContent = "🔥 " + streakCount + " 連擊";
      comboEl.hidden = false; comboEl.className = "mj-combo-display";
      if (streakCount >= 10) comboEl.classList.add("combo-mega");
      else if (streakCount >= 6) comboEl.classList.add("combo-high");
      else if (streakCount >= 3) comboEl.classList.add("combo-mid");
    } else { comboEl.hidden = true; }
  }
}

function tickTimer() {
  timeElapsed++;
  if (gameMode !== "zen" && gameMode !== "speed") {
    timeLeft--;
    if (timeLeft > 0 && timeLeft <= 10) playCountdownTick(timeLeft);
    if (timeLeft <= 0) { endGame(false); return; }
  }
  updateStatus();
}

// ==================== 遊戲流程 ====================
function startTimers() {
  clearInterval(timerId); clearInterval(idleCheckId);
  timerId = setInterval(tickTimer, 1000);
  idleCheckId = setInterval(function() {
    if (!isPaused && gameRunning && !inputLocked && Date.now() - lastProgressTime >= IDLE_HINT_MS) {
      if (gameMode !== "zen") triggerAutoHint();
    }
  }, 500);
}

function pauseGame() {
  if (!gameRunning || isPaused) return;
  isPaused = true; clearInterval(timerId); clearInterval(idleCheckId);
  document.getElementById("mjPauseOverlay").hidden = false;
}

function resumeGame() {
  if (!gameRunning || !isPaused) return;
  isPaused = false; lastProgressTime = Date.now(); startTimers();
  document.getElementById("mjPauseOverlay").hidden = true;
}

function startGame() {
  ensureAudioCtx();
  gameMode = document.querySelector('input[name="mj-mode"]:checked').value;
  score = 0; pairsCleared = 0; streakCount = 0; maxStreak = 0;
  lastMatchTime = 0; lastProgressTime = Date.now(); gameStartTimestamp = Date.now();
  manualHintsLeft = MANUAL_HINT_LIMITS[gameMode] || 2;
  manualHintsUsed = 0; autoHintsUsed = 0; manualShufflesUsed = 0; autoShufflesUsed = 0;
  shufflesLeft = SHUFFLE_LIMITS[gameMode] || 3;
  isPaused = false; selectedTile = null;
  timeLeft = (TIME_LIMITS[gameMode] === Infinity) ? Infinity : TIME_LIMITS[gameMode];
  timeElapsed = 0; gameRunning = true; inputLocked = false;
  pairsIn30s = 0; newlyUnlocked = [];
  document.getElementById("mjPauseOverlay").hidden = true;

  if (gameMode === "daily") {
    dailySeed = getTodayString();
    var prof = loadProfile();
    if (prof.dailyPlayed && prof.dailyPlayed[dailySeed]) { alert("你今天已經挑戰過了！明天再來吧 😊"); return; }
  }

  var rng = null, template;
  if (gameMode === "daily") {
    rng = seededRandom(dailySeed);
    template = SHAPE_TEMPLATES[Math.floor(rng() * SHAPE_TEMPLATES.length)];
  } else if (selectedShapeIndex >= 0 && selectedShapeIndex < SHAPE_TEMPLATES.length) {
    template = SHAPE_TEMPLATES[selectedShapeIndex];
  } else {
    template = SHAPE_TEMPLATES[Math.floor(Math.random() * SHAPE_TEMPLATES.length)];
  }

  BLOCKS = template.blocks;
  TOTAL_PAIRS = BLOCKS.reduce(function(s, b) { return s + b.cols * b.rows; }, 0) / 2;
  currentShapeName = template.name;
  document.getElementById("mjShapeName").textContent = "花色：" + currentShapeName;

  if (gameMode === "daily" && rng) {
    selectedCovers = seededShuffle(uniqueCovers, rng).slice(0, TOTAL_PAIRS).map(function(c) { return c.cover; });
  } else {
    selectedCovers = shuffle(uniqueCovers).slice(0, TOTAL_PAIRS).map(function(c) { return c.cover; });
  }

  generateFullBoard(rng);
  showScreen("mj-game"); renderBoard(); updateStatus(); startTimers();
  clearInterval(pairsIn30sTimer); pairsIn30s = 0;
  pairsIn30sTimer = setInterval(function() { pairsIn30s = 0; }, 30000);
}

function endGame(cleared) {
  gameRunning = false; inputLocked = true; isPaused = false;
  clearInterval(timerId); clearInterval(idleCheckId); clearInterval(pairsIn30sTimer);
  document.getElementById("mjPauseOverlay").hidden = true;
  showScreen("mj-result");

  var ml = { easy: "初級（5分鐘）", medium: "中級（4分鐘）", hard: "最高級（3分鐘）",
    zen: "禪模式", speed: "極速模式", daily: "每日挑戰" };
  var finalScore = score;
  var detail = "配對成功 " + pairsCleared + " / " + TOTAL_PAIRS + " 對";

  if (cleared && gameMode !== "zen") {
    var remainingBonus = (gameMode === "speed") ? 0 : Math.round(timeLeft * TIME_BONUS_PER_SEC);
    finalScore += CLEAR_BONUS + remainingBonus;
    document.getElementById("resultTitle").textContent = "恭喜全部清空！🎉";
    detail += "．全清獎勵 +" + CLEAR_BONUS;
    if (remainingBonus > 0) detail += "．剩餘時間獎勵 +" + remainingBonus;
  } else if (cleared && gameMode === "zen") {
    document.getElementById("resultTitle").textContent = "恭喜全部清空！🎉";
  } else {
    document.getElementById("resultTitle").textContent = "時間到！";
  }

  document.getElementById("resultMode").textContent = ml[gameMode] || gameMode;
  if (gameMode === "zen" || gameMode === "speed") {
    document.getElementById("resultScore").textContent = "用時 " + formatTime(timeElapsed);
  } else {
    document.getElementById("resultScore").textContent = finalScore + " 分";
  }
  document.getElementById("resultDetail").textContent = detail;
  score = finalScore;

  // 統計面板
  var statsEl = document.getElementById("resultStats");
  if (statsEl) {
    var avgSpeed = pairsCleared > 0 ? (timeElapsed / pairsCleared).toFixed(1) : "—";
    statsEl.innerHTML =
      '<div class="mj-stats-grid">' +
      '<div class="mj-stat-item"><span class="mj-stat-label">牌型</span><span class="mj-stat-value">' + esc(currentShapeName) + '</span></div>' +
      '<div class="mj-stat-item"><span class="mj-stat-label">最長連擊</span><span class="mj-stat-value">🔥 ' + maxStreak + '</span></div>' +
      '<div class="mj-stat-item"><span class="mj-stat-label">平均配對速度</span><span class="mj-stat-value">' + avgSpeed + ' 秒/對</span></div>' +
      '<div class="mj-stat-item"><span class="mj-stat-label">手動提示</span><span class="mj-stat-value">' + manualHintsUsed + ' 次</span></div>' +
      '<div class="mj-stat-item"><span class="mj-stat-label">自動提示</span><span class="mj-stat-value">' + autoHintsUsed + ' 次</span></div>' +
      '<div class="mj-stat-item"><span class="mj-stat-label">手動洗牌</span><span class="mj-stat-value">' + manualShufflesUsed + ' 次</span></div>' +
      '<div class="mj-stat-item"><span class="mj-stat-label">自動洗牌</span><span class="mj-stat-value">' + autoShufflesUsed + ' 次</span></div>' +
      '<div class="mj-stat-item"><span class="mj-stat-label">用時</span><span class="mj-stat-value">' + formatTime(timeElapsed) + '</span></div>' +
      '</div>';
    statsEl.hidden = false;
  }

  // 更新個人檔案 & 檢查成就
  var profile = loadProfile();
  profile.totalGames = (profile.totalGames || 0) + 1;
  profile.totalPairs = (profile.totalPairs || 0) + pairsCleared;
  if (maxStreak > (profile.maxStreak || 0)) profile.maxStreak = maxStreak;
  if (!profile.shapesPlayed) profile.shapesPlayed = [];
  if (profile.shapesPlayed.indexOf(currentShapeName) === -1) profile.shapesPlayed.push(currentShapeName);
  if (!profile.bestScores) profile.bestScores = {};
  if (gameMode !== "zen" && gameMode !== "speed") {
    if (!profile.bestScores[gameMode] || score > profile.bestScores[gameMode]) profile.bestScores[gameMode] = score;
  }
  if (cleared) {
    if (!profile.fastestClears) profile.fastestClears = {};
    if (!profile.fastestClears[gameMode] || timeElapsed < profile.fastestClears[gameMode]) profile.fastestClears[gameMode] = timeElapsed;
  }
  if (gameMode === "daily") {
    if (!profile.dailyPlayed) profile.dailyPlayed = {};
    profile.dailyPlayed[dailySeed] = { score: score, cleared: cleared, time: timeElapsed };
  }
  if (!profile.clearedModes) profile.clearedModes = [];
  if (cleared && profile.clearedModes.indexOf(gameMode) === -1) profile.clearedModes.push(gameMode);
  if (!profile.achievements) profile.achievements = [];
  newlyUnlocked = [];

  function unlock(id) { if (profile.achievements.indexOf(id) === -1) { profile.achievements.push(id); newlyUnlocked.push(id); } }
  unlock("first_game");
  if (cleared) unlock("first_clear");
  if (profile.clearedModes.indexOf("easy") !== -1 && profile.clearedModes.indexOf("medium") !== -1 && profile.clearedModes.indexOf("hard") !== -1) unlock("triple_crown");
  if (maxStreak >= 10) unlock("combo_10");
  if (maxStreak >= 20) unlock("combo_20");
  if (pairsIn30s >= 10) unlock("speed_demon");
  if (cleared && manualHintsUsed === 0 && autoHintsUsed === 0) unlock("no_hints");
  if (profile.shapesPlayed.length >= 4) unlock("all_shapes");
  if (profile.totalGames >= 50) unlock("veteran");
  if (cleared && gameMode === "hard" && manualHintsUsed === 0 && autoHintsUsed === 0 && manualShufflesUsed === 0) unlock("perfect_hard");
  saveProfile(profile);
  if (newlyUnlocked.length > 0) { playAchievementSound(); showAchievementPopups(newlyUnlocked); }

  // 提交 & 排行榜
  var nameInput = document.getElementById("playerName"); nameInput.value = "";
  var submitBtn = document.getElementById("submitScoreBtn"); submitBtn.disabled = false; submitBtn.textContent = "提交成績";
  var canSubmit = (gameMode !== "zen");
  document.getElementById("submitScoreWrap").hidden = !canSubmit;
  document.getElementById("scoreSubmitted").hidden = true;
  document.getElementById("resultLeaderboard").hidden = true;
}

// ==================== 成就彈窗 ====================
function showAchievementPopups(ids) {
  var container = document.getElementById("achievementPopups") || createAchievementContainer();
  ids.forEach(function(id, i) {
    var ach = null;
    for (var k = 0; k < ACHIEVEMENTS.length; k++) { if (ACHIEVEMENTS[k].id === id) { ach = ACHIEVEMENTS[k]; break; } }
    if (!ach) return;
    setTimeout(function() {
      var popup = document.createElement("div"); popup.className = "mj-achievement-popup";
      popup.innerHTML = '<span class="ach-icon">' + ach.icon + '</span><div class="ach-text"><strong>成就解鎖！</strong><br>' + esc(ach.name) + '</div>';
      container.appendChild(popup);
      setTimeout(function() { popup.classList.add("fade-out"); setTimeout(function() { popup.remove(); }, 500); }, 3000);
    }, i * 800);
  });
}

function createAchievementContainer() {
  var el = document.createElement("div"); el.id = "achievementPopups";
  el.style.cssText = "position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
  document.body.appendChild(el); return el;
}

// ==================== 分享功能 ====================
var GAME_SHARE_URL = "https://sandylam.netlify.app/mahjong.html";

function generateShareText() {
  var ml = { easy: "初級", medium: "中級", hard: "最高級", zen: "禪模式", speed: "極速", daily: "每日挑戰" };
  var isCleared = (pairsCleared >= TOTAL_PAIRS);
  var text = "林憶蓮鐵粉挑戰賽－封面連連看\n";
  text += "網址：" + GAME_SHARE_URL + "\n\n";
  text += "🀄 封面連連看 " + (ml[gameMode] || gameMode) + "\n";
  text += "🎯 " + pairsCleared + "/" + TOTAL_PAIRS + " 對";
  if (isCleared) text += " ✅ 全清！";
  text += "\n";
  if (gameMode !== "zen") text += "📊 " + score + " 分\n";
  text += "🔥 最長連擊 " + maxStreak + "\n";
  text += "⏱ 用時 " + formatTime(timeElapsed) + "\n";
  text += "🎴 " + currentShapeName + "\n";
  text += "#封面連連看 #林憶蓮";
  return text;
}

function shareResult() {
  var text = generateShareText();
  if (navigator.share) {
    navigator.share({ title: "林憶蓮鐵粉挑戰賽－封面連連看", text: text, url: GAME_SHARE_URL }).catch(function() {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() {
      var btn = document.getElementById("mjShareBtn");
      if (btn) { btn.textContent = "✓ 已複製到剪貼簿！"; setTimeout(function() { btn.textContent = "📤 分享成績"; }, 2000); }
    }).catch(function() {});
  }
}

// ==================== 分數提交 ====================
function submitScore() {
  var nameInput = document.getElementById("playerName");
  var name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  var submitBtn = document.getElementById("submitScoreBtn");
  submitBtn.disabled = true; submitBtn.textContent = "提交中...";
  var modeKey = (gameMode === "daily") ? "daily" : gameMode;

  fetch("/.netlify/functions/submit-mahjong-score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name, mode: modeKey,
      score: (gameMode === "speed") ? -timeElapsed : score,
      pairs: pairsCleared, totalPairs: TOTAL_PAIRS,
      cleared: pairsCleared >= TOTAL_PAIRS,
      time: timeElapsed, maxStreak: maxStreak,
      shape: currentShapeName,
      dailyDate: (gameMode === "daily") ? getTodayString() : undefined
    })
  })
  .then(function(res) { return res.json(); })
  .then(function() {
    document.getElementById("submitScoreWrap").hidden = true;
    document.getElementById("scoreSubmitted").hidden = false;
    loadLeaderboard(modeKey, "resultLeaderboard");
  })
  .catch(function() {
    submitBtn.disabled = false; submitBtn.textContent = "提交成績";
    document.getElementById("scoreSubmitted").textContent = "提交失敗，請重試";
    document.getElementById("scoreSubmitted").hidden = false;
  });
}

// ==================== 排行榜 ====================
function loadLeaderboard(mode, containerId) {
  var container = document.getElementById(containerId);
  container.hidden = false;
  container.innerHTML = '<p class="leaderboard-loading">載入排行榜中...</p>';
  var url = "/.netlify/functions/get-mahjong-leaderboard?mode=" + mode;
  if (mode === "daily") url += "&date=" + getTodayString();

  fetch(url)
    .then(function(res) { return res.json(); })
    .then(function(raw) {
      var data = Array.isArray(raw) ? raw : (raw.leaderboard || []);
      if (!data || data.length === 0) {
        container.innerHTML = '<p class="leaderboard-empty">目前還沒有紀錄，等你來挑戰！</p>'; return;
      }
      var isSpeed = (mode === "speed");
      var html = '<div class="leaderboard-card"><table class="leaderboard-table">';
      html += "<thead><tr><th>#</th><th>選手</th>";
      html += isSpeed ? "<th>用時</th>" : "<th>分數</th>";
      html += "<th>配對</th><th>🔥</th><th>全清</th></tr></thead><tbody>";
      data.forEach(function(entry) {
        html += "<tr>";
        html += '<td class="rank-col">' + entry.rank + "</td>";
        html += '<td class="name-col">' + esc(entry.name) + "</td>";
        if (isSpeed) { html += "<td>" + formatTime(entry.displayTime || Math.abs(entry.score)) + "</td>"; }
        else { html += "<td>" + entry.score + "</td>"; }
        html += "<td>" + entry.pairs + "/" + (entry.totalPairs || TOTAL_PAIRS) + "</td>";
        html += "<td>" + (entry.maxStreak || 0) + "</td>";
        html += "<td>" + (entry.cleared ? "✓" : "—") + "</td></tr>";
      });
      html += "</tbody></table></div>";
      container.innerHTML = html;
    })
    .catch(function() { container.innerHTML = '<p class="leaderboard-empty">載入失敗，請稍後再試</p>'; });
}

// ==================== 個人檔案面板 ====================
function showProfilePanel() {
  var profile = loadProfile();
  var panel = document.getElementById("mjProfilePanel"); if (!panel) return;
  var html = '<div class="mj-profile-panel"><h3>📊 我的紀錄</h3><div class="mj-stats-grid">';
  html += '<div class="mj-stat-item"><span class="mj-stat-label">總遊玩局數</span><span class="mj-stat-value">' + (profile.totalGames || 0) + '</span></div>';
  html += '<div class="mj-stat-item"><span class="mj-stat-label">總配對數</span><span class="mj-stat-value">' + (profile.totalPairs || 0) + '</span></div>';
  html += '<div class="mj-stat-item"><span class="mj-stat-label">最長連擊</span><span class="mj-stat-value">🔥 ' + (profile.maxStreak || 0) + '</span></div>';
  var modeNames = { easy: "初級", medium: "中級", hard: "最高級", daily: "每日" };
  ["easy", "medium", "hard", "daily"].forEach(function(m) {
    if (profile.bestScores && profile.bestScores[m]) {
      html += '<div class="mj-stat-item"><span class="mj-stat-label">' + modeNames[m] + '最高分</span><span class="mj-stat-value">' + profile.bestScores[m] + '</span></div>';
    }
    if (profile.fastestClears && profile.fastestClears[m]) {
      html += '<div class="mj-stat-item"><span class="mj-stat-label">' + modeNames[m] + '最快全清</span><span class="mj-stat-value">' + formatTime(profile.fastestClears[m]) + '</span></div>';
    }
  });
  html += '</div>';
  html += '<h3 style="margin-top:1rem;">🏅 成就</h3><div class="mj-achievements-grid">';
  ACHIEVEMENTS.forEach(function(ach) {
    var unlocked = profile.achievements && profile.achievements.indexOf(ach.id) !== -1;
    html += '<div class="mj-ach-card ' + (unlocked ? "unlocked" : "locked") + '">';
    html += '<span class="ach-icon">' + ach.icon + '</span>';
    html += '<div class="ach-info"><strong>' + esc(ach.name) + '</strong><br><small>' + esc(ach.desc) + '</small></div></div>';
  });
  html += '</div></div>';
  panel.innerHTML = html; panel.hidden = false;
}

function toggleProfilePanel() {
  var panel = document.getElementById("mjProfilePanel"); if (!panel) return;
  if (panel.hidden) { showProfilePanel(); } else { panel.hidden = true; }
}

// ==================== 音效開關 ====================
function toggleSound() {
  soundEnabled = !soundEnabled;
  var btn = document.getElementById("mjSoundBtn");
  if (btn) btn.textContent = soundEnabled ? "🔊" : "🔇";
  saveSoundPref(soundEnabled);
}

// ==================== 牌型選擇 ====================
function renderShapeSelector() {
  var container = document.getElementById("mjShapeSelector"); if (!container) return;
  var html = '<label class="mj-shape-option"><input type="radio" name="mj-shape" value="-1" checked> 🎲 隨機</label>';
  SHAPE_TEMPLATES.forEach(function(t, i) {
    var pairs = t.blocks.reduce(function(s, b) { return s + b.cols * b.rows; }, 0) / 2;
    html += '<label class="mj-shape-option">';
    html += '<input type="radio" name="mj-shape" value="' + i + '"> ';
    html += esc(t.name);
    html += ' <span class="mj-shape-pairs">(' + pairs + '對)</span>';
    html += '</label>';
  });
  container.innerHTML = html;
  container.querySelectorAll('input[name="mj-shape"]').forEach(function(radio) {
    radio.addEventListener("change", function(e) { selectedShapeIndex = parseInt(e.target.value, 10); });
  });
}

// ==================== 啟動 ====================
async function boot() {
  soundEnabled = loadSoundPref();
  var soundBtn = document.getElementById("mjSoundBtn");
  if (soundBtn) soundBtn.textContent = soundEnabled ? "🔊" : "🔇";
  renderShapeSelector();

  try {
    var res = await fetch(SONGS_URL);
    var allSongs = await res.json();
    var albumMap = new Map();
    allSongs.forEach(function(s) {
      if (s.album && s.cover && !albumMap.has(s.album)) albumMap.set(s.album, { album: s.album, cover: s.cover });
    });
    uniqueCovers = Array.from(albumMap.values());
  } catch(e) { console.error("Failed to load songs:", e); }

  ["hard", "medium", "easy", "speed", "daily"].forEach(function(mode) {
    var containerId = "lb" + mode.charAt(0).toUpperCase() + mode.slice(1);
    var el = document.getElementById(containerId);
    if (el) {
      var details = el.closest("details");
      if (details) {
        details.addEventListener("toggle", function handler() {
          if (this.open) { loadLeaderboard(mode, containerId); this.removeEventListener("toggle", handler); }
        });
      }
    }
  });

  await preloadAllCovers();
}

document.addEventListener("DOMContentLoaded", boot);

