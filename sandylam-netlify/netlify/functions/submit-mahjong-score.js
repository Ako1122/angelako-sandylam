
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ==================== 設定 ====================

const VALID_MODES = ["easy", "medium", "hard", "speed", "daily"];

const MAX_SCORE_LIMITS = {
  easy:   15000,
  medium: 15000,
  hard:   15000,
  speed:  0,       // 極速模式用負數秒數，不檢查上限
  daily:  15000,
};

const MAX_TIME_LIMITS = {
  easy:   300,
  medium: 240,
  hard:   180,
  speed:  3600,
  daily:  240,
};

const MAX_PAIRS = 48;
const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX = 5;

// ==================== 工具函式 ====================

function sanitizeName(name) {
  return String(name)
    .replace(/[<>&"'/\\]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, 20);
}

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

function getClientIP(event) {
  return (
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers["client-ip"] ||
    event.headers["x-real-ip"] ||
    "unknown"
  );
}

// ==================== 主處理函式 ====================

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const { name, mode, score, pairs, totalPairs, cleared, time, maxStreak, shape, dailyDate } = body;

    // ==================== 欄位驗證 ====================

    if (
      !name ||
      !mode ||
      score === undefined ||
      pairs === undefined ||
      cleared === undefined ||
      time === undefined
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "缺少必要欄位" }),
      };
    }

    if (!VALID_MODES.includes(String(mode))) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "難度參數不正確" }),
      };
    }

    if (typeof score !== "number" || typeof pairs !== "number" || typeof time !== "number") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "分數、配對數、時間必須為數字" }),
      };
    }

    // ==================== 合理性檢查（防作弊） ====================

    const numPairs = Number(pairs);
    const numScore = Number(score);
    const numTime = Number(time);

    if (numPairs < 0 || numPairs > MAX_PAIRS) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "配對數不合理" }),
      };
    }

    const maxTime = MAX_TIME_LIMITS[mode] || 600;
    if (numTime < 0 || numTime > maxTime) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "時間不合理" }),
      };
    }

    if (mode !== "speed") {
      const maxScore = MAX_SCORE_LIMITS[mode] || 15000;
      if (numScore < 0 || numScore > maxScore) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "分數不合理" }),
        };
      }
    }

    if (mode === "speed" && numScore > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "極速模式分數格式不正確" }),
      };
    }

    // ==================== Rate Limiting ====================

    const clientIP = getClientIP(event);
    const rateLimitKey = `ratelimit:mahjong-submit:${clientIP}`;

    try {
      const currentCount = await redis.incr(rateLimitKey);
      if (currentCount === 1) {
        await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
      }
      if (currentCount > RATE_LIMIT_MAX) {
        return {
          statusCode: 429,
          body: JSON.stringify({ error: "提交太頻繁，請稍後再試" }),
        };
      }
    } catch (rlErr) {
      console.warn("Rate limit check failed:", rlErr.message);
    }

    // ==================== 每日挑戰：每人每天只能提交一次 ====================

    // 使用前端送來的日期（解決時區問題），後端做格式驗證
    const resolvedDate = sanitizeDateString(dailyDate) || new Date().toISOString().slice(0, 10);

    if (mode === "daily") {
      const dailyKey = `daily-played:mahjong:${resolvedDate}:${clientIP}`;

      const alreadyPlayed = await redis.get(dailyKey);
      if (alreadyPlayed) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "你今天已經挑戰過了，明天再來！" }),
        };
      }

      await redis.set(dailyKey, "1", { ex: 172800 });
    }

    // ==================== 組裝 entry 並寫入 ====================

    const safeName = sanitizeName(name);
    if (!safeName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "名字不能為空" }),
      };
    }

    const entry = {
      name: safeName,
      score: numScore,
      pairs: numPairs,
      totalPairs: Number(totalPairs) || numPairs,
      cleared: !!cleared,
      time: Math.round(numTime * 100) / 100,
      maxStreak: typeof maxStreak === "number" ? Math.min(maxStreak, 999) : 0,
      shape: typeof shape === "string" ? shape.replace(/[<>&"'/\\]/g, "").slice(0, 20) : "",
      ts: Date.now(),
    };

    let KEY;
    if (mode === "daily") {
      KEY = `leaderboard:mahjong-daily-${resolvedDate}`;
    } else {
      KEY = `leaderboard:mahjong-${mode}`;
    }

    const sortScore = numScore;

    await redis.zadd(KEY, { score: sortScore, member: JSON.stringify(entry) });

    if (mode === "daily") {
      await redis.expire(KEY, 172800);
    }

    const count = await redis.zcard(KEY);
    if (count > 100) {
      await redis.zremrangebyrank(KEY, 0, count - 101);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("Submit error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

