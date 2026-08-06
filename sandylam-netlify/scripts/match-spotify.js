#!/usr/bin/env node
/**
 * match-spotify.js
 * ------------------------------------------------------------
 * Batch-matches every song in data/songs.json to a Spotify track
 * using the Client Credentials flow (no user login needed), and
 * scores each match's confidence so you know which ones to check
 * by hand afterwards.
 *
 * SETUP
 *   1. Create an app at https://developer.spotify.com/dashboard
 *   2. Copy scripts/spotify-config.example.json to
 *      scripts/spotify-config.json and fill in your clientId / clientSecret
 *      (this file is gitignored — never commit real secrets)
 *   3. Requires Node.js 18+ (uses the built-in fetch, no npm install needed)
 *
 * RUN
 *   node scripts/match-spotify.js
 *
 * OUTPUT
 *   scripts/spotify-matches.json   — one entry per song, with confidence
 *   Console table of everything below the "high" confidence threshold,
 *   so you know exactly which songs to manually re-check.
 *
 * RE-RUNNING
 *   Safe to re-run any time. Songs already matched with "high" confidence
 *   are skipped to save API calls; "medium" / "low" / "none" are retried.
 *   Delete an entry from spotify-matches.json if you want to force a redo.
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "spotify-config.json");
const SONGS_PATH = path.join(__dirname, "..", "data", "songs.json");
const OUTPUT_PATH = path.join(__dirname, "spotify-matches.json");

const ARTIST_NAMES = ["sandy lam", "林憶蓮", "lam yik lin"];
const VERSION_MARKERS = ["live", "remix", "demo", "instrumental", "cover", "reprise", "karaoke", "現場", "混音", "伴奏"];

const REQUEST_DELAY_MS = 150; // be polite to the API between searches

// ---------- setup / config ----------
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(
      `找不到 ${CONFIG_PATH}\n請先複製 scripts/spotify-config.example.json 改名為 spotify-config.json，並填入你的 clientId / clientSecret。`
    );
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- string similarity ----------
function normalize(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[（）()［］\[\]【】「」『』]/g, "") // strip common CJK/latin brackets
    .replace(/[\s\u3000]/g, "") // strip spaces incl. full-width space
    .replace(/[·・.,!！?？'"'"‘’]/g, "");
}

// Dice coefficient over character bigrams — works reasonably well for
// CJK strings, which have no natural word boundaries to tokenize on.
function diceSimilarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0;

  const bigrams = (s) => {
    const map = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.substr(i, 2);
      map.set(bg, (map.get(bg) || 0) + 1);
    }
    return map;
  };

  const mapA = bigrams(na);
  const mapB = bigrams(nb);
  let intersection = 0;
  for (const [bg, count] of mapA) {
    if (mapB.has(bg)) intersection += Math.min(count, mapB.get(bg));
  }
  return (2 * intersection) / (na.length - 1 + nb.length - 1);
}

function hasVersionMarker(text) {
  const lower = (text || "").toLowerCase();
  return VERSION_MARKERS.some((m) => lower.includes(m));
}

function isArtistMatch(spotifyArtists) {
  return spotifyArtists.some((a) => {
    const n = a.name.toLowerCase();
    return ARTIST_NAMES.some((target) => n.includes(target));
  });
}

// ---------- Spotify API ----------
async function getAccessToken(config) {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`取得 token 失敗：${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function searchTrack(token, query, market) {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&market=${market}&limit=10`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
    console.log(`  被限速了，等 ${retryAfter} 秒後重試…`);
    await sleep((retryAfter + 1) * 1000);
    return searchTrack(token, query, market);
  }
  if (!res.ok) {
    throw new Error(`搜尋失敗：${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.tracks?.items || [];
}

// ---------- scoring ----------
function scoreCandidate(song, candidate) {
  const titleSim = diceSimilarity(song.title, candidate.name);
  const albumSim = diceSimilarity(song.album, candidate.album?.name);
  const artistOk = isArtistMatch(candidate.artists || []);

  let score = titleSim * 0.55 + albumSim * 0.3 + (artistOk ? 0.15 : 0);

  const candidateHasVersionMarker = hasVersionMarker(candidate.name);
  const originalHasVersionMarker = hasVersionMarker(song.title);
  if (candidateHasVersionMarker && !originalHasVersionMarker) {
    score -= 0.25; // likely a Live/Remix/Demo version we didn't ask for
  }

  score += ((candidate.popularity || 0) / 100) * 0.05; // small tiebreaker

  return { score: Math.max(0, Math.min(1, score)), titleSim, albumSim, artistOk };
}

function confidenceLabel(score) {
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

async function matchSong(token, song, market) {
  const query = `${song.title} 林憶蓮`;
  const candidates = await searchTrack(token, query, market);

  if (candidates.length === 0) {
    return {
      id: song.id,
      title: song.title,
      album: song.album,
      spotifyUrl: null,
      matchedName: null,
      matchedAlbum: null,
      score: 0,
      confidence: "none",
    };
  }

  let best = null;
  for (const c of candidates) {
    const { score, titleSim, albumSim, artistOk } = scoreCandidate(song, c);
    if (!best || score > best.score) {
      best = { candidate: c, score, titleSim, albumSim, artistOk };
    }
  }

  return {
    id: song.id,
    title: song.title,
    album: song.album,
    spotifyUrl: best.candidate.external_urls?.spotify || null,
    matchedName: best.candidate.name,
    matchedAlbum: best.candidate.album?.name || null,
    matchedArtists: (best.candidate.artists || []).map((a) => a.name).join(", "),
    score: Math.round(best.score * 100) / 100,
    confidence: confidenceLabel(best.score),
  };
}

// ---------- main ----------
async function main() {
  const config = loadConfig();
  const market = config.market || "TW";
  const songs = JSON.parse(fs.readFileSync(SONGS_PATH, "utf8"));

  let existing = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    const prev = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
    prev.forEach((r) => (existing[r.id] = r));
  }

  console.log(`取得 access token…`);
  const token = await getAccessToken(config);

  const results = [];
  let processed = 0;
  let skipped = 0;

  for (const song of songs) {
    const prev = existing[song.id];
    if (prev && prev.confidence === "high") {
      results.push(prev);
      skipped++;
      continue;
    }

    process.stdout.write(`[${results.length + 1}/${songs.length}] ${song.title} … `);
    try {
      const match = await matchSong(token, song, market);
      results.push(match);
      console.log(`${match.confidence} (${match.score})`);
    } catch (err) {
      console.log(`錯誤：${err.message}`);
      results.push(prev || { id: song.id, title: song.title, album: song.album, spotifyUrl: null, confidence: "none", score: 0, error: err.message });
    }
    processed++;

    // Save incrementally so a crash halfway through doesn't lose progress.
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), "utf8");
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\n完成。處理 ${processed} 首，沿用先前高信心結果 ${skipped} 首。`);
  console.log(`結果存在：${OUTPUT_PATH}\n`);

  // ---- review report ----
  const needsReview = results.filter((r) => r.confidence !== "high").sort((a, b) => a.score - b.score);
  if (needsReview.length === 0) {
    console.log("所有歌曲都是高信心配對，不用人工複核 🎉");
    return;
  }

  console.log(`以下 ${needsReview.length} 首建議人工複核（分數由低到高）：\n`);
  needsReview.forEach((r) => {
    console.log(
      `[${r.confidence.toUpperCase()} ${r.score}] ${r.title}（${r.album}）→ ${r.matchedName || "（無結果）"} / ${r.matchedAlbum || "-"}\n  ${r.spotifyUrl || "(no url)"}`
    );
  });
}

main().catch((err) => {
  console.error("執行失敗：", err);
  process.exit(1);
});
