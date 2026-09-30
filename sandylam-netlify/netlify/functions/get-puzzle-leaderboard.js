const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const VALID_GRIDS = ["3", "4", "5"];

exports.handler = async (event) => {
  try {
    const grid = String(event.queryStringParameters?.grid || "3");
    if (!VALID_GRIDS.includes(grid)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "難度參數不正確" }),
      };
    }
    const KEY = "leaderboard:puzzle-" + grid;

    // 取前 10 名（時間最短排最前）
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
