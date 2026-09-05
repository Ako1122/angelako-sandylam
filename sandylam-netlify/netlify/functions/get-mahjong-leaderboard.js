
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ==================== 設定 ====================

const VALID_MODES = ["easy", "medium", "hard", "speed", "daily"];
const TOP_N = 10;

// ==================== 工具函式 ====================

function sanitizeDateString(str) {
  if (!str || typeof str !== "string") return null;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  if (y < 2024 || y > 2030 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return str;
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function getRedisKey(mode, dateParam) {
  if (mode === "daily") {
    const date = sanitizeDateString(dateParam) || getTodayString();
    return `leaderboard:mahjong-daily-${date}`;
  }
  return `leaderboard:mahjong-${mode}`;
}

function sanitizeEntry(raw) {
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (!raw || typeof raw !== "object") return null;

  return {
    name:      String(raw.name || "???").replace(/[<>&"'/\\]/g, "").slice(0, 20),
    score:     typeof raw.score === "number" ? raw.score : 0,
    pairs:     typeof raw.pairs === "number" ? raw.pairs : 0,
    totalPairs:typeof raw.totalPairs === "number" ? raw.totalPairs : (raw.pairs || 0),
    cleared:   !!raw.cleared,
    time:      typeof raw.time === "number" ? raw.time : 0,
    maxStreak: typeof raw.maxStreak === "number" ? raw.maxStreak : 0,
    shape:     typeof raw.shape === "string" ? raw.shape.replace(/[<>&"'/\\]/g, "").slice(0, 20) : "",
  };
}

// ==================== 主處理函式 ====================

exports.handler = async (event) => {
  try {
    const mode = String(event.queryStringParameters?.mode || "easy");
    const dateParam = event.queryStringParameters?.date || null;

    if (!VALID_MODES.includes(mode)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "難度參數不正確，支援：" + VALID_MODES.join(", ") }),
      };
    }

    const KEY = getRedisKey(mode, dateParam);
    const entries = await redis.zrange(KEY, 0, TOP_N - 1, { rev: true });

    const leaderboard = [];
    for (let i = 0; i < entries.length; i++) {
      const data = sanitizeEntry(entries[i]);
      if (!data) continue;

      const entry = {
        rank: leaderboard.length + 1,
        ...data,
      };

      if (mode === "speed") {
        entry.displayTime = Math.abs(data.score);
        entry.score = Math.abs(data.score);
      }

      leaderboard.push(entry);
    }

    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(leaderboard),
    };
  } catch (err) {
    console.error("Leaderboard error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

