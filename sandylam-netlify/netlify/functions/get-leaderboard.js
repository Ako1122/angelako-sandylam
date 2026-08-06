
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

exports.handler = async (event) => {
  const mode = event.queryStringParameters?.mode || "easy";
  const key = "leaderboard:" + mode;

  try {
    // 取前 10 名（由高分到低分）
    const entries = await redis.zrange(key, 0, 9, { rev: true });

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

