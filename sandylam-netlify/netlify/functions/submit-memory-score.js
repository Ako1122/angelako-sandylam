const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const VALID_DIFFICULTIES = ["10", "20", "25"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { name, difficulty, moves, time } = JSON.parse(event.body);

    // 基本驗證
    if (!name || !difficulty || !moves || !time) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "缺少必要欄位" }),
      };
    }
    if (!VALID_DIFFICULTIES.includes(String(difficulty))) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "難度參數不正確" }),
      };
    }

    const KEY = "leaderboard:memory-" + difficulty;

    // 純比速度：時間越短分數越高。用負數存，配合 rev:true 排序（大分數排前面）
    const sortScore = -time;

    const entry = {
      name: name.replace(/[<>&"']/g, "").slice(0, 20),
      difficulty,
      moves,
      time: Math.round(time * 100) / 100,
    };

    await redis.zadd(KEY, { score: sortScore, member: JSON.stringify(entry) });

    // 只保留前 100 名
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
