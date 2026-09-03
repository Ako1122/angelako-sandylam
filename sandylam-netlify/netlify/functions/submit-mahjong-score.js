const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const VALID_MODES = ["easy", "medium", "hard"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { name, mode, score, pairs, totalPairs, cleared, time } = JSON.parse(event.body);

    if (
      !name ||
      !mode ||
      score === undefined ||
      pairs === undefined ||
      cleared === undefined ||
      !time
    ) {
      return { statusCode: 400, body: JSON.stringify({ error: "缺少必要欄位" }) };
    }
    if (!VALID_MODES.includes(String(mode))) {
      return { statusCode: 400, body: JSON.stringify({ error: "難度參數不正確" }) };
    }

    const KEY = "leaderboard:mahjong-" + mode;

    const entry = {
      name: name.replace(/[<>&"']/g, "").slice(0, 20),
      score,
      pairs,
      totalPairs: totalPairs || pairs,
      cleared: !!cleared,
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
