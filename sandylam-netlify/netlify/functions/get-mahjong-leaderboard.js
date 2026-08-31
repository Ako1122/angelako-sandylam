const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const VALID_MODES = ["easy", "medium", "hard"];

exports.handler = async (event) => {
  try {
    const mode = String(event.queryStringParameters?.mode || "easy");
    if (!VALID_MODES.includes(mode)) {
      return { statusCode: 400, body: JSON.stringify({ error: "難度參數不正確" }) };
    }
    const KEY = "leaderboard:mahjong-" + mode;

    const entries = await redis.zrange(KEY, 0, 9, { rev: true });

    const leaderboard = entries.map((entry, index) => {
      const data = typeof entry === "string" ? JSON.parse(entry) : entry;
      return { rank: index + 1, ...data };
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leaderboard),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
