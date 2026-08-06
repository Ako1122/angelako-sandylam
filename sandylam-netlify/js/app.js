const DATA_URL = "data/songs.json";
let allSongsMap = {},
  currentPool = [],
  history = [],
  currentRoundData = null,
  championId = null,
  currentLangs = [],
  currentAudio = null,
  currentPlayBtn = null;

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (currentPlayBtn) {
    currentPlayBtn.classList.remove("playing");
    currentPlayBtn = null;
  }
}

function togglePreview(btn, url, e) {
  e.stopPropagation();
  if (currentPlayBtn === btn) {
    stopAudio();
    return;
  }
  stopAudio();
  currentAudio = new Audio(url);
  currentPlayBtn = btn;
  btn.classList.add("playing");
  currentAudio.play().catch(() => {});
  currentAudio.addEventListener("ended", () => {
    btn.classList.remove("playing");
    currentAudio = null;
    currentPlayBtn = null;
  });
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function groupSizeForCount(n) {
  if (n > 300) return 20;
  if (n >= 201) return 16;
  if (n >= 101) return 8;
  if (n >= 51) return 4;
  return 2;
}
function pickCountForGroup(g) {
  return g <= 1 ? 1 : Math.ceil(g / 2);
}

function startTournament(songs, mode, langs) {
  allSongsMap = {};
  songs.forEach((s) => (allSongsMap[s.id] = s));
  currentLangs = langs || [];
  let ids = shuffle(songs.map((s) => s.id));
  if (mode === "random100" && ids.length > 100) ids = ids.slice(0, 100);
  else if (mode === "random200" && ids.length > 200) ids = ids.slice(0, 200);
  currentPool = ids;
  history = [];
  championId = null;
  nextRound();
}

function nextRound() {
  if (currentPool.length === 1) {
    championId = currentPool[0];
    showChampionScreen();
    return;
  }
  const ps = currentPool.length,
    gs = groupSizeForCount(ps),
    sh = shuffle(currentPool);
  const groups = chunk(sh, gs).map((g) => ({ songs: g, picked: null }));
  currentRoundData = {
    roundIndex: history.length + 1,
    poolSizeAtStart: ps,
    groupSize: gs,
    groups,
    groupIndex: 0,
  };
  history.push(currentRoundData);
  showGroupScreen();
}

function roundLabel(n) {
  if (n === 2) return "冠軍戰";
  if (n <= 4) return "準決賽";
  return n + "強";
}

function showGroupScreen() {
  const rd = currentRoundData;
  if (rd.groupIndex >= rd.groups.length) {
    const next = [];
    rd.groups.forEach((g) => next.push(...g.picked));
    currentPool = next;
    nextRound();
    return;
  }
  renderRoundScreen(rd);
}

function confirmGroupPicks(picked) {
  stopAudio();
  const rd = currentRoundData;
  rd.groups[rd.groupIndex].picked = picked;
  rd.groupIndex++;
  updateProgress();
  showGroupScreen();
}

function updateProgress() {
  const w = document.getElementById("progressWrap"),
    rd = currentRoundData;
  if (!rd) {
    w.hidden = true;
    return;
  }
  w.hidden = false;
  document.getElementById("progressLabel").textContent =
    roundLabel(rd.poolSizeAtStart) +
    " " +
    rd.groupIndex +
    "/" +
    rd.groups.length;
  document.getElementById("progressFill").style.width =
    Math.round((rd.groupIndex / rd.groups.length) * 100) + "%";
}

function showScreen(id) {
  ["screen-intro", "screen-round", "screen-champion"].forEach((s) => {
    document.getElementById(s).hidden = s !== id;
  });
}

function renderRoundScreen(rd) {
  showScreen("screen-round");
  updateProgress();
  stopAudio();
  const group = rd.groups[rd.groupIndex],
    pickCount = pickCountForGroup(group.songs.length);
  document.getElementById("roundHeading").textContent = roundLabel(
    rd.poolSizeAtStart,
  );
  document.getElementById("roundSub").textContent =
    "第" +
    (rd.groupIndex + 1) +
    "組/共" +
    rd.groups.length +
    "組 · 從" +
    group.songs.length +
    "首中選" +
    pickCount +
    "首晉級";
  const grid = document.getElementById("songGrid");
  grid.innerHTML = "";
  const selected = new Set(),
    counter = document.getElementById("pickCounter"),
    confirmBtn = document.getElementById("confirmBtn");

  function refresh() {
    counter.textContent = "已選 " + selected.size + " / " + pickCount;
    confirmBtn.disabled = selected.size !== pickCount;
  }

  group.songs.forEach((songId) => {
    const song = allSongsMap[songId],
      card = document.createElement("div");
    card.className = "song-card";
    const pb = song.preview_url
      ? '<button class="preview-btn" title="試聽">&#9654;</button>'
      : "";
    card.innerHTML =
      '<div class="cover-wrap"><img src="' +
      song.cover +
      '" alt="' +
      song.title +
      '" loading="lazy"><div class="select-mark">✓</div>' +
      pb +
      '</div><p class="song-name">' +
      song.title +
      '</p><p class="song-album">' +
      song.album +
      "</p>";
    const playBtn = card.querySelector(".preview-btn");
    if (playBtn)
      playBtn.addEventListener("click", (e) =>
        togglePreview(playBtn, song.preview_url, e),
      );
    card.addEventListener("click", () => {
      if (selected.has(songId)) {
        selected.delete(songId);
        card.classList.remove("selected");
      } else {
        if (selected.size >= pickCount) return;
        selected.add(songId);
        card.classList.add("selected");
      }
      refresh();
    });
    grid.appendChild(card);
  });

  if (group.songs.length === 1) {
    confirmBtn.textContent = "自動晉級";
    confirmBtn.disabled = false;
    confirmBtn.onclick = () => {
      confirmBtn.textContent = "確認晉級名單";
      confirmGroupPicks([group.songs[0]]);
    };
    counter.textContent = "本組只有1首歌，直接晉級";
    return;
  }
  refresh();
  confirmBtn.onclick = () => {
    if (selected.size !== pickCount) return;
    confirmGroupPicks(Array.from(selected));
  };
}

function showChampionScreen() {
  showScreen("screen-champion");
  stopAudio();
  document.getElementById("progressWrap").hidden = true;
  const song = allSongsMap[championId];
  document.getElementById("championCover").src = song.cover;
  document.getElementById("championTitle").textContent = song.title;
  document.getElementById("championAlbum").textContent = song.album;
  document.getElementById("cardPreviewWrap").hidden = true;
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
function truncateText(ctx, text, mw) {
  if (ctx.measureText(text).width <= mw) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > mw)
    t = t.slice(0, -1);
  return t + "…";
}

async function generateResultsCard() {
  const champ = allSongsMap[championId];
  const fg = history[history.length - 1].groups[0];
  const rId = fg ? fg.songs.find((id) => id !== championId) : null;
  const runner = rId ? allSongsMap[rId] : null;
  const total = history[0].poolSizeAtStart;
  const ranked = [championId];
  for (let i = history.length - 1; i >= 0; i--)
    history[i].groups.forEach((g) => {
      if (g.picked)
        ranked.push(...g.songs.filter((id) => !g.picked.includes(id)));
    });

  const width = 860,
    mx = 60,
    gw = width - mx * 2;
  let y = 120;
  const tiers = [
    { pct: 0.25, cols: 10, label: "TOP 25%" },
    { pct: 0.1, cols: 5, label: "TOP 10%" },
  ].map((d) => {
    const cols = Math.min(d.cols, total);
    const count = Math.min(
      total,
      Math.ceil(Math.max(cols, Math.round(total * d.pct)) / cols) * cols,
    );
    return { label: d.label, ids: ranked.slice(0, count), cols };
  });
  const sYs = [];
  tiers.forEach((t) => {
    const cw = gw / t.cols,
      thumb = Math.min(90, Math.max(40, cw - 18)),
      ch = thumb + 30;
    sYs.push({ y, cols: t.cols, thumb, cw, ch });
    y += Math.ceil(t.ids.length / t.cols) * ch + 40;
  });

  const height = y + 560,
    canvas = document.getElementById("resultCanvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#F6F2EA";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.fillStyle = "#8E4B63";
  ctx.font = "600 13px 'Noto Sans TC',sans-serif";
  ctx.fillText("MY 林憶蓮 CHAMPION", width / 2, 34);
  ctx.fillStyle = "#201E1F";
  ctx.font = "700 22px 'Noto Serif TC',serif";
  ctx.fillText("晉級戰績", width / 2, 66);

  const covers = new Set();
  tiers.forEach((t) =>
    t.ids.forEach((id) => covers.add(allSongsMap[id].cover)),
  );
  covers.add(champ.cover);
  if (runner) covers.add(runner.cover);
  const ic = {};
  await Promise.all(
    Array.from(covers).map(async (src) => {
      ic[src] = await loadImage(src);
    }),
  );

  tiers.forEach((t, i) => {
    const s = sYs[i];
    ctx.textAlign = "left";
    ctx.fillStyle = "#5C6B73";
    ctx.font = "600 14px 'Noto Sans TC',sans-serif";
    ctx.fillText(t.label, mx, s.y - 10);
    t.ids.forEach((id, j) => {
      const song = allSongsMap[id],
        col = j % s.cols,
        row = Math.floor(j / s.cols);
      const cx = mx + col * s.cw + (s.cw - s.thumb) / 2,
        cy = s.y + row * s.ch;
      const img = ic[song.cover];
      if (img) ctx.drawImage(img, cx, cy, s.thumb, s.thumb);
      ctx.strokeStyle =
        id === championId || id === rId ? "#B08A3E" : "rgba(32,30,31,.25)";
      ctx.lineWidth = id === championId || id === rId ? 3 : 1.5;
      ctx.strokeRect(cx + 1, cy + 1, s.thumb - 2, s.thumb - 2);
      ctx.fillStyle = "#201E1F";
      ctx.font =
        "400 " + (s.thumb >= 70 ? 12 : 10) + "px 'Noto Sans TC',sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        truncateText(ctx, song.title, s.cw - 4),
        mx + col * s.cw + s.cw / 2,
        cy + s.thumb + 14,
      );
    });
  });

  const ft = y + 20;
  ctx.textAlign = "center";
  ctx.fillStyle = "#8E4B63";
  ctx.font = "700 14px 'Noto Sans TC',sans-serif";
  ctx.fillText("冠軍戰結果", width / 2, ft);
  const cs = 220,
    rs = 120,
    gap = 40,
    tw = cs + gap + rs,
    rx = width / 2 - tw / 2,
    cx2 = rx + rs + gap,
    ry = ft + 30 + (cs - rs),
    cy2 = ft + 30;
  if (runner) {
    const ri = ic[runner.cover];
    if (ri) ctx.drawImage(ri, rx, ry, rs, rs);
    ctx.fillStyle = "#5C6B73";
    ctx.font = "600 12px 'Noto Sans TC',sans-serif";
    ctx.fillText("亞軍", rx + rs / 2, ry + rs + 20);
    ctx.fillStyle = "#201E1F";
    ctx.font = "600 13px 'Noto Sans TC',sans-serif";
    ctx.fillText(
      truncateText(ctx, runner.title, rs + 20),
      rx + rs / 2,
      ry + rs + 38,
    );
  }
  const ci = ic[champ.cover];
  if (ci) {
    ctx.save();
    ctx.shadowColor = "rgba(32,30,31,.35)";
    ctx.shadowBlur = 24;
    ctx.drawImage(ci, cx2, cy2, cs, cs);
    ctx.restore();
    ctx.strokeStyle = "#B08A3E";
    ctx.lineWidth = 3;
    ctx.strokeRect(cx2 + 1.5, cy2 + 1.5, cs - 3, cs - 3);
  }
  ctx.fillStyle = "#8E4B63";
  ctx.font = "600 13px 'Noto Sans TC',sans-serif";
  ctx.fillText("冠軍", cx2 + cs / 2, cy2 + cs + 26);
  ctx.fillStyle = "#201E1F";
  ctx.font = "700 22px 'Noto Serif TC',serif";
  ctx.fillText(champ.title, cx2 + cs / 2, cy2 + cs + 54);
  ctx.fillStyle = "#5C6B73";
  ctx.font = "400 13px 'Noto Sans TC',sans-serif";
  ctx.fillText(champ.album, cx2 + cs / 2, cy2 + cs + 76);

  const fTop = cy2 + cs + 110;
  ctx.strokeStyle = "rgba(32,30,31,.15)";
  ctx.beginPath();
  ctx.moveTo(mx, fTop);
  ctx.lineTo(width - mx, fTop);
  ctx.stroke();
  const url = "https://sandylam.netlify.app/";
  ctx.textAlign = "left";
  ctx.fillStyle = "#201E1F";
  ctx.font = "700 15px 'Noto Sans TC',sans-serif";
  ctx.fillText("你也來選出你最愛的一首", mx, fTop + 42);
  ctx.fillStyle = "#8E4B63";
  ctx.font = "600 14px 'Noto Sans TC',sans-serif";
  ctx.fillText(url, mx, fTop + 66);
  const qr = await loadImage(
    "https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=" +
      encodeURIComponent(url),
  );
  if (qr) ctx.drawImage(qr, width - mx - 90, fTop + 24, 90, 90);

  const du = canvas.toDataURL("image/png");
  document.getElementById("cardPreviewImg").src = du;
  document.getElementById("cardDownloadLink").href = du;
  document.getElementById("cardPreviewWrap").hidden = false;
}

async function boot() {
  const res = await fetch(DATA_URL),
    songs = await res.json();
  document.getElementById("introDesc").textContent =
    "目前收錄 " + songs.length + " 首歌曲（粵語／國語／英語／日語／藏文）。";
  const lc = {};
  songs.forEach((s) => {
    lc[s.lang] = (lc[s.lang] || 0) + 1;
  });
  document.querySelectorAll("[data-lang-count]").forEach((el) => {
    el.textContent = "（" + (lc[el.dataset.langCount] || 0) + "首）";
  });

  const cbs = Array.from(document.querySelectorAll('input[name="lang"]'));
  const hint = document.getElementById("langHint"),
    btn = document.getElementById("startBtn");
  function getLangs() {
    return cbs.filter((c) => c.checked).map((c) => c.value);
  }
  function refresh() {
    const any = getLangs().length > 0;
    btn.disabled = !any;
    hint.hidden = any;
  }
  cbs.forEach((c) => c.addEventListener("change", refresh));
  refresh();

  btn.addEventListener("click", () => {
    const sl = getLangs();
    if (!sl.length) {
      hint.hidden = false;
      return;
    }
    startTournament(
      songs.filter((s) => sl.includes(s.lang)),
      document.querySelector('input[name="mode"]:checked').value,
      sl,
    );
  });
  document.getElementById("restartBtn").addEventListener("click", () => {
    stopAudio();
    showScreen("screen-intro");
    document.getElementById("progressWrap").hidden = true;
  });
  document
    .getElementById("generateCardBtn")
    .addEventListener("click", generateResultsCard);
}
boot();
