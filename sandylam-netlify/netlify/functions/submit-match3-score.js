const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { name, score, maxCombo, matches, time } = JSON.parse(event.body);

    if (
      !name ||
      score === undefined ||
      maxCombo === undefined ||
      matches === undefined ||
      !time
    ) {
      return { statusCode: 400, body: JSON.stringify({ error: "缺少必要欄位" }) };
    }

    const KEY = "leaderboard:match3-3min";

    const entry = {
      name: name.replace(/[<>&"']/g, "").slice(0, 20),
      score,
      maxCombo,
      matches,
      time: Math.round(time * 100) / 100,
    };

    await redis.zadd(KEY, { score, member: JSON.stringify(entry) });

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
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
