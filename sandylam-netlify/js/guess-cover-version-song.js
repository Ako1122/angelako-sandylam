const DATA_URL = "data/cover.json";
const SONGS_URL = "data/songs.json";

let allCovers = [],
  coverPool = [],
  songTitlePool = [], // [{title, isChinese}] 去重後的原曲庫，供猜歌名干擾項使用
  gameQueue = [],
  currentQuestion = 0,
  score = 0,
  totalTimeMs = 0,
  questionStartTime = null,
  gameMode = "easy",
  gameOver = false,
  answered = false,
  currentAudio = null;

// XSS 防護：轉義 HTML 特殊字元
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

// 中文字元判斷（含繁簡漢字），用來區分中文歌名 / 英文歌名
function isChineseTitle(str) {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(str || "");
}

function showScreen(id) {
  ["guess-intro", "guess-game", "guess-result"].forEach((s) => {
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

  const easyRadio = document.querySelector('input[name="guess-mode"][value="easy"]');
  const mediumRadio = document.querySelector('input[name="guess-mode"][value="medium"]');
  const hardRadio = document.querySelector('input[name="guess-mode"][value="hard"]');
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
  gameMode = document.querySelector('input[name="guess-mode"]:checked').value;
  const count =
    gameMode === "easy" ? 20 : gameMode === "medium" ? 50 : coverPool.length;
  gameQueue = shuffle(coverPool).slice(0, count);
  currentQuestion = 0;
  score = 0;
  totalTimeMs = 0;
  gameOver = false;
  showScreen("guess-game");
  loadQuestion();
}

function buildDistractorTitles(correct) {
  const correctAnswer = correct.correctAnswer;
  const excludeName = correct.excludeSongName || null;
  const wantChinese = isChineseTitle(correctAnswer);

  const usedTitles = new Set([correctAnswer]);
  if (excludeName) usedTitles.add(excludeName);

  const wrongTitles = [];

  // 第一輪：只從同語系（中文／英文）的歌名庫抽取，並避開指定不可出現的歌名
  const sameLangPool = shuffle(
    songTitlePool.filter(
      (t) => t.isChinese === wantChinese && !usedTitles.has(t.title),
    ),
  );
  for (const t of sameLangPool) {
    if (wrongTitles.length >= 3) break;
    if (!usedTitles.has(t.title)) {
      wrongTitles.push(t.title);
      usedTitles.add(t.title);
    }
  }

  // 備援：若同語系歌名不足 3 個，從其餘歌名庫補齊（仍避開不可出現歌名）
  if (wrongTitles.length < 3) {
    const restPool = shuffle(
      songTitlePool.filter((t) => !usedTitles.has(t.title)),
    );
    for (const t of restPool) {
      if (wrongTitles.length >= 3) break;
      wrongTitles.push(t.title);
      usedTitles.add(t.title);
    }
  }

  return wrongTitles;
}

function loadQuestion() {
  answered = false;
  stopAudio();
  document.getElementById("guessProgress").textContent =
    "第 " + (currentQuestion + 1) + " / " + gameQueue.length + " 題";
  document.getElementById("guessScore").textContent = "正確：" + score;
  document.getElementById("guessTimer").textContent =
    "⏱ " + (totalTimeMs / 1000).toFixed(2) + "s";

  const sourceInfo = document.getElementById("coverSourceInfo");
  sourceInfo.hidden = true;

  const correct = gameQueue[currentQuestion];
  const wrongTitles = buildDistractorTitles(correct);

  const options = shuffle([
    { title: correct.correctAnswer, isCorrect: true },
    ...wrongTitles.map((t) => ({ title: t, isCorrect: false })),
  ]);

  const el = document.getElementById("guessOptions");
  el.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "guess-option-btn";
    btn.innerHTML = '<span class="option-title">' + esc(opt.title) + "</span>";
    btn.dataset.title = opt.title;
    btn.addEventListener("click", () => handleAnswer(btn, opt.isCorrect, correct));
    el.appendChild(btn);
  });

  document.getElementById("guessNextBtn").hidden = true;
  questionStartTime = performance.now();

  autoPlay();
}

function handleAnswer(btnEl, isCorrect, correct) {
  if (answered) return;
  answered = true;
  totalTimeMs += performance.now() - questionStartTime;
  if (isCorrect) score++;

  document.querySelectorAll(".guess-option-btn").forEach((btn) => {
    btn.disabled = true;
    const titleText = btn.querySelector(".option-title").textContent;
    if (btn.dataset.title === correct.correctAnswer) {
      btn.classList.add("correct");
      btn.innerHTML =
        '<span class="answer-badge correct-badge">○</span><span class="option-title">' +
        esc(titleText) +
        "</span>";
    } else if (btn === btnEl && !isCorrect) {
      btn.classList.add("wrong");
      btn.innerHTML =
        '<span class="answer-badge wrong-badge">✕</span><span class="option-title">' +
        esc(titleText) +
        "</span>";
    }
  });

  document.getElementById("guessScore").textContent = "正確：" + score;
  document.getElementById("guessTimer").textContent =
    "⏱ " + (totalTimeMs / 1000).toFixed(2) + "s";

  // 作答後顯示翻唱來源資訊
  const sourceInfo = document.getElementById("coverSourceInfo");
  document.getElementById("coverSourceName").textContent = correct.name || "";
  sourceInfo.hidden = false;

  if (gameMode === "hard" && !isCorrect) {
    gameOver = true;
    const nb = document.getElementById("guessNextBtn");
    nb.hidden = false;
    nb.textContent = "查看結果";
    nb.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const nb = document.getElementById("guessNextBtn");
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
  showScreen("guess-result");
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
  document.getElementById("guessCardPreviewWrap").hidden = true;

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

  const mode = "cover-song-" + gameMode;

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

async function generateGuessCard() {
  const ml = {
    easy: "初級（20題）",
    medium: "中級（50題）",
    hard: "最高級（全曲目）",
  };
  const tq = currentQuestion + 1,
    ts = (totalTimeMs / 1000).toFixed(2),
    acc = tq > 0 ? Math.round((score / tq) * 100) : 0;
  const w = 600,
    h = 520,
    canvas = document.getElementById("guessResultCanvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#F6F2EA";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#708090";
  ctx.font = "600 13px 'Noto Sans TC',sans-serif";
  ctx.fillText("SANDY LAM COVER VERSION SONG GUESS", w / 2, 40);
  ctx.fillStyle = "#201E1F";
  ctx.font = "700 26px 'Noto Serif TC',serif";
  ctx.fillText("猜翻唱歌名挑戰成績", w / 2, 80);
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
  const url = "https://sandylam.netlify.app/guess-cover-version-song.html";
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
  document.getElementById("guessCardPreviewImg").src = du;
  document.getElementById("guessCardDownloadLink").href = du;
  document.getElementById("guessCardPreviewWrap").hidden = false;
}

async function boot() {
  const [coverRes, songsRes] = await Promise.all([
    fetch(DATA_URL),
    fetch(SONGS_URL),
  ]);
  allCovers = await coverRes.json();
  const allSongs = await songsRes.json();

  coverPool = allCovers.filter((c) => c.previewUrl && c.correctAnswer);

  // 建立去重歌名庫（供猜歌名干擾項使用），並標記中文／英文
  const seen = new Set();
  songTitlePool = [];
  allSongs.forEach((s) => {
    if (!s.title || seen.has(s.title)) return;
    seen.add(s.title);
    songTitlePool.push({ title: s.title, isChinese: isChineseTitle(s.title) });
  });

  updateModeAvailability();

  document.getElementById("guessStartBtn").addEventListener("click", startGame);
  document.getElementById("audioPlayBtn").addEventListener("click", playCurrentSong);
  document.getElementById("guessNextBtn").addEventListener("click", nextQuestion);
  document.getElementById("guessRestart").addEventListener("click", () => {
    stopAudio();
    showScreen("guess-intro");
  });
  document
    .getElementById("guessGenerateCard")
    .addEventListener("click", generateGuessCard);
  document.getElementById("submitScoreBtn").addEventListener("click", submitScore);

  loadLeaderboard("cover-song-hard", "lbHard");
  loadLeaderboard("cover-song-medium", "lbMedium");
  loadLeaderboard("cover-song-easy", "lbEasy");
}
boot();
