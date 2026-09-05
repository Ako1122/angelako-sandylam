const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

exports.handler = async () => {
  try {
    const KEY = "leaderboard:match3-3min";
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
