const DATA_URL = "data/cover.json";
const SONGS_URL = "data/songs.json";

// 這些封面檔案，除非是該題的正確答案，否則不可以出現在干擾選項中
const BLOCKED_DISTRACTOR_COVERS = new Set(
  [
    "08.jpg","16.jpg","18.jpg","19.jpg","20.jpg","21.jpg","23.jpg","27.jpg","28.jpg",
    "30.jpg","31.jpg","32.jpg","33.webp","34.jpg","35.jpg","36.png","37.webp",
    "38.jpg","41.jpg","43.jpg","44.jpg","46.jpg","45.jpg","47.jpg","49.jpg","50.jpg",
    "51.jpg","52.jpg","53.webp","54.jpg","55.jpg","56.jpg","57.png","58.webp",
    "59.jpg","60.jpg","61.png","62.jpg","63.jpg","64.jpg","65.jpg","66.jpg",
    "67.jpg","68.png","69.jpg","70.webp","73.webp","74.jpg","76.jpg","77.webp",
  ].map((f) => "images/covers/" + f),
);

let allCovers = [],
  coverPool = [],
  albumOptionsPool = [], // [{album, cover}] 去重後的專輯封面庫，供猜專輯干擾項使用
  gameQueue = [],
  currentQuestion = 0,
  score = 0,
  totalTimeMs = 0,
  questionStartTime = null,
  gameMode = "easy",
  gameOver = false,
  answered = false,
  currentAudio = null;

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
  ["album-intro", "album-game", "album-result"].forEach((s) => {
    document.getElementById(s).hidden = s !== id;
  });
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  const b = document.getElementById("audioPlayBtn");
  if (b) b.textContent = "▶ 播放";
}

function autoPlay() {
  const q = gameQueue[currentQuestion];
  if (!q || !q.previewUrl) return;
  stopAudio();
  currentAudio = new Audio(q.previewUrl);
  currentAudio.play().catch(() => {});
  document.getElementById("audioPlayBtn").textContent = "⏸ 暫停";
  currentAudio.addEventListener("ended", () => {
    document.getElementById("audioPlayBtn").textContent = "▶ 重播";
    currentAudio = null;
  });
}

function playCurrentSong() {
  const q = gameQueue[currentQuestion];
  if (!q || !q.previewUrl) return;
  if (currentAudio) {
    if (currentAudio.paused) {
      currentAudio.play();
      document.getElementById("audioPlayBtn").textContent = "⏸ 暫停";
    } else {
      currentAudio.pause();
      document.getElementById("audioPlayBtn").textContent = "▶ 播放";
    }
    return;
  }
  currentAudio = new Audio(q.previewUrl);
  currentAudio.play().catch(() => {});
  document.getElementById("audioPlayBtn").textContent = "⏸ 暫停";
  currentAudio.addEventListener("ended", () => {
    document.getElementById("audioPlayBtn").textContent = "▶ 重播";
    currentAudio = null;
  });
}

function updateModeAvailability() {
  const poolSize = coverPool.length;
  const info = document.getElementById("poolInfo");
  info.textContent = "可用曲目：" + poolSize + " 首";

  const easyRadio = document.querySelector('input[name="album-mode"][value="easy"]');
  const mediumRadio = document.querySelector('input[name="album-mode"][value="medium"]');
  const hardRadio = document.querySelector('input[name="album-mode"][value="hard"]');
  const easyOption = easyRadio.closest(".mode-option");
  const mediumOption = mediumRadio.closest(".mode-option");
  const hardOption = hardRadio.closest(".mode-option");

  if (poolSize >= 20) {
    easyRadio.disabled = false;
    easyOption.classList.remove("disabled");
  } else {
    easyRadio.disabled = true;
    easyOption.classList.add("disabled");
    if (easyRadio.checked) hardRadio.checked = true;
  }

  if (poolSize >= 50) {
    mediumRadio.disabled = false;
    mediumOption.classList.remove("disabled");
  } else {
    mediumRadio.disabled = true;
    mediumOption.classList.add("disabled");
    if (mediumRadio.checked) hardRadio.checked = true;
  }

  hardRadio.disabled = false;
  hardOption.classList.remove("disabled");
}

function startGame() {
  gameMode = document.querySelector('input[name="album-mode"]:checked').value;
  const count =
    gameMode === "easy" ? 20 : gameMode === "medium" ? 50 : coverPool.length;
  gameQueue = shuffle(coverPool).slice(0, count);
  currentQuestion = 0;
  score = 0;
  totalTimeMs = 0;
  gameOver = false;
  showScreen("album-game");
  loadQuestion();
}

function buildDistractorAlbums(correct) {
  const correctCover = correct.correctCover;
  const excludeCover = correct.excludeCoverFile || null;

  const usedAlbums = new Set([correct.album]);
  const usedCovers = new Set([correctCover]);
  if (excludeCover) usedCovers.add(excludeCover);

  const wrongAlbums = [];
  const shuffledAlbums = shuffle(albumOptionsPool);
  for (const a of shuffledAlbums) {
    if (wrongAlbums.length >= 3) break;
    // a.cover 本身就是正確答案時不會出現在這個迴圈（已被 usedCovers 排除），
    // 所以這裡的封面一律是「干擾選項」，需檢查全域封鎖清單
    if (BLOCKED_DISTRACTOR_COVERS.has(a.cover)) continue;
    if (!usedAlbums.has(a.album) && !usedCovers.has(a.cover)) {
      wrongAlbums.push(a);
      usedAlbums.add(a.album);
      usedCovers.add(a.cover);
    }
  }
  return wrongAlbums;
}

function loadQuestion() {
  answered = false;
  stopAudio();

  document.getElementById("albumProgress").textContent =
    "第 " + (currentQuestion + 1) + " / " + gameQueue.length + " 題";
  document.getElementById("albumScore").textContent = "正確：" + score;
  document.getElementById("albumTimer").textContent =
    "⏱ " + (totalTimeMs / 1000).toFixed(2) + "s";

  const sourceInfo = document.getElementById("coverSourceInfo");
  sourceInfo.hidden = true;

  const correct = gameQueue[currentQuestion];
  const wrongAlbums = buildDistractorAlbums(correct);

  const options = shuffle([
    { album: correct.album, cover: correct.correctCover, isCorrect: true },
    ...wrongAlbums.map((a) => ({ album: a.album, cover: a.cover, isCorrect: false })),
  ]);

  const el = document.getElementById("albumOptions");
  el.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "album-option-btn";
    btn.innerHTML =
      '<div class="album-cover-wrap"><img src="' +
      esc(opt.cover) +
      '" alt=""></div>' +
      '<p class="album-name">' +
      esc(opt.album) +
      "</p>";
    btn.dataset.correct = opt.isCorrect;
    btn.addEventListener("click", () => handleAnswer(btn, opt.isCorrect, correct));
    el.appendChild(btn);
  });

  document.getElementById("albumNextBtn").hidden = true;
  questionStartTime = performance.now();

  autoPlay();
}

function handleAnswer(btnEl, isCorrect, correct) {
  if (answered) return;
  answered = true;
  totalTimeMs += performance.now() - questionStartTime;
  if (isCorrect) score++;

  document.querySelectorAll(".album-option-btn").forEach((btn) => {
    btn.disabled = true;
    const wrap = btn.querySelector(".album-cover-wrap");
    if (btn.dataset.correct === "true") {
      btn.classList.add("correct");
      const badge = document.createElement("span");
      badge.className = "answer-badge correct-badge";
      badge.textContent = "○";
      wrap.appendChild(badge);
    } else if (btn === btnEl && !isCorrect) {
      btn.classList.add("wrong");
      const badge = document.createElement("span");
      badge.className = "answer-badge wrong-badge";
      badge.textContent = "✕";
      wrap.appendChild(badge);
    }
  });

  document.getElementById("albumScore").textContent = "正確：" + score;
  document.getElementById("albumTimer").textContent =
    "⏱ " + (totalTimeMs / 1000).toFixed(2) + "s";

  // 作答後顯示翻唱來源資訊
  const sourceInfo = document.getElementById("coverSourceInfo");
  document.getElementById("coverSourceName").textContent = correct.name || "";
  sourceInfo.hidden = false;

  if (gameMode === "hard" && !isCorrect) {
    gameOver = true;
    const nb = document.getElementById("albumNextBtn");
    nb.hidden = false;
    nb.textContent = "查看結果";
    nb.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const nb = document.getElementById("albumNextBtn");
  nb.hidden = false;
  nb.textContent =
    currentQuestion >= gameQueue.length - 1 ? "查看結果" : "下一題";
  nb.scrollIntoView({ behavior: "smooth", block: "center" });
}

function nextQuestion() {
  stopAudio();
  if (gameOver || currentQuestion >= gameQueue.length - 1) {
    showResult();
    return;
  }
  currentQuestion++;
  loadQuestion();
}

function showResult() {
  stopAudio();
  showScreen("album-result");
  const ml = {
    easy: "初級（20題）",
    medium: "中級（50題）",
    hard: "最高級（全曲目）",
  };
  const tq = currentQuestion + 1;
  document.getElementById("resultMode").textContent = ml[gameMode];
  document.getElementById("resultScore").textContent = score + " / " + tq;
  document.getElementById("resultDetail").textContent =
    "總用時：" + (totalTimeMs / 1000).toFixed(2) + " 秒";
  document.getElementById("albumCardPreviewWrap").hidden = true;

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

  const tq = currentQuestion + 1;
  const submitBtn = document.getElementById("submitScoreBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "提交中...";

  const mode = "cover-album-" + gameMode;

  fetch("/.netlify/functions/submit-score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name,
      score: score,
      total: tq,
      mode: mode,
      time: Math.round(totalTimeMs / 10) / 100,
    }),
  })
    .then((res) => res.json())
    .then(() => {
      document.getElementById("submitScoreWrap").hidden = true;
      document.getElementById("scoreSubmitted").hidden = false;
      loadLeaderboard(mode, "resultLeaderboard");
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

  fetch("/.netlify/functions/get-leaderboard?mode=" + mode)
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
        "<thead><tr><th>#</th><th>選手</th><th>分數</th><th>正確率</th><th>用時</th></tr></thead>";
      html += "<tbody>";
      data.forEach((entry) => {
        html += "<tr>";
        html += '<td class="rank-col">' + entry.rank + "</td>";
        html += '<td class="name-col">' + esc(entry.name) + "</td>";
        html += "<td>" + entry.score + "/" + entry.total + "</td>";
        html += "<td>" + entry.accuracy + "%</td>";
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

function loadImage(src) {
  return new Promise((r) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => r(img);
    img.onerror = () => r(null);
    img.src = src;
  });
}

async function generateAlbumCard() {
  const ml = {
    easy: "初級（20題）",
    medium: "中級（50題）",
    hard: "最高級（全曲目）",
  };
  const tq = currentQuestion + 1;
  const ts = (totalTimeMs / 1000).toFixed(2);
  const acc = tq > 0 ? Math.round((score / tq) * 100) : 0;
  const w = 600,
    h = 520;
  const canvas = document.getElementById("albumResultCanvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#F6F2EA";
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "center";
  ctx.fillStyle = "#708090";
  ctx.font = "600 13px 'Noto Sans TC',sans-serif";
  ctx.fillText("SANDY LAM COVER VERSION ALBUM GUESS", w / 2, 40);

  ctx.fillStyle = "#201E1F";
  ctx.font = "700 26px 'Noto Serif TC',serif";
  ctx.fillText("猜翻唱專輯挑戰成績", w / 2, 80);

  ctx.fillStyle = "#5C6B73";
  ctx.font = "500 15px 'Noto Sans TC',sans-serif";
  ctx.fillText(ml[gameMode], w / 2, 115);

  ctx.beginPath();
  ctx.arc(w / 2, 200, 60, 0, Math.PI * 2);
  ctx.fillStyle = "#708090";
  ctx.fill();
  ctx.fillStyle = "#F6F2EA";
  ctx.font = "700 36px 'Noto Sans TC',sans-serif";
  ctx.fillText(score, w / 2, 208);
  ctx.font = "500 13px 'Noto Sans TC',sans-serif";
  ctx.fillText("/ " + tq + " 題", w / 2, 230);

  ctx.fillStyle = "#201E1F";
  ctx.font = "600 16px 'Noto Sans TC',sans-serif";
  ctx.fillText("正確率", w / 4, 310);
  ctx.fillStyle = "#B08A3E";
  ctx.font = "700 28px 'Noto Sans TC',sans-serif";
  ctx.fillText(acc + "%", w / 4, 346);

  ctx.fillStyle = "#201E1F";
  ctx.font = "600 16px 'Noto Sans TC',sans-serif";
  ctx.fillText("總用時", (w * 3) / 4, 310);
  ctx.fillStyle = "#B08A3E";
  ctx.font = "700 28px 'Noto Sans TC',sans-serif";
  ctx.fillText(ts + "s", (w * 3) / 4, 346);

  const avg = tq > 0 ? (totalTimeMs / tq / 1000).toFixed(2) : "0.00";
  ctx.fillStyle = "#201E1F";
  ctx.font = "600 16px 'Noto Sans TC',sans-serif";
  ctx.fillText("平均每題", w / 2, 390);
  ctx.fillStyle = "#B08A3E";
  ctx.font = "700 28px 'Noto Sans TC',sans-serif";
  ctx.fillText(avg + "s", w / 2, 426);

  ctx.strokeStyle = "rgba(32,30,31,.15)";
  ctx.beginPath();
  ctx.moveTo(60, 450);
  ctx.lineTo(w - 60, 450);
  ctx.stroke();

  const url = "https://sandylam.netlify.app/guess-cover-version-album.html";
  ctx.textAlign = "left";
  ctx.fillStyle = "#201E1F";
  ctx.font = "600 13px 'Noto Sans TC',sans-serif";
  ctx.fillText("你也來挑戰看看！", 60, 480);
  ctx.fillStyle = "#708090";
  ctx.font = "500 12px 'Noto Sans TC',sans-serif";
  ctx.fillText(url, 60, 502);

  const qr = await loadImage(
    "https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=0&data=" +
      encodeURIComponent(url),
  );
  if (qr) ctx.drawImage(qr, w - 120, 460, 60, 60);

  const du = canvas.toDataURL("image/png");
  document.getElementById("albumCardPreviewImg").src = du;
  document.getElementById("albumCardDownloadLink").href = du;
  document.getElementById("albumCardPreviewWrap").hidden = false;
}

async function boot() {
  const [coverRes, songsRes] = await Promise.all([
    fetch(DATA_URL),
    fetch(SONGS_URL),
  ]);
  allCovers = await coverRes.json();
  const allSongs = await songsRes.json();

  coverPool = allCovers.filter(
    (c) => c.previewUrl && c.correctCover && c.album,
  );

  // 建立去重專輯封面庫（供猜專輯干擾項使用）
  const albumMap = new Map();
  allSongs.forEach((s) => {
    if (s.album && s.cover && !albumMap.has(s.album)) {
      albumMap.set(s.album, { album: s.album, cover: s.cover });
    }
  });
  albumOptionsPool = Array.from(albumMap.values());

  updateModeAvailability();

  document.getElementById("albumStartBtn").addEventListener("click", startGame);
  document.getElementById("audioPlayBtn").addEventListener("click", playCurrentSong);
  document.getElementById("albumNextBtn").addEventListener("click", nextQuestion);
  document.getElementById("albumRestart").addEventListener("click", () => {
    stopAudio();
    showScreen("album-intro");
  });
  document
    .getElementById("albumGenerateCard")
    .addEventListener("click", generateAlbumCard);
  document.getElementById("submitScoreBtn").addEventListener("click", submitScore);

  loadLeaderboard("cover-album-hard", "lbHard");
  loadLeaderboard("cover-album-medium", "lbMedium");
  loadLeaderboard("cover-album-easy", "lbEasy");
}

boot();
