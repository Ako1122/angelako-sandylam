const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const VALID_GRIDS = ["3", "4", "5"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { name, grid, moves, time, cover } = JSON.parse(event.body);

    // 基本驗證
    if (!name || !grid || !moves || !time) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "缺少必要欄位" }),
      };
    }
    if (!VALID_GRIDS.includes(String(grid))) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "難度參數不正確" }),
      };
    }

    const KEY = "leaderboard:puzzle-" + grid;

    // 純比速度：時間越短分數越高。用負數存，配合 rev:true 排序（大分數排前面）
    const sortScore = -time;

    // 縮圖路徑白名單：只允許 images/covers/ 底下的相對路徑，避免塞入惡意 URL
    let safeCover = "";
    if (typeof cover === "string" && /^images\/covers\/[\w.-]+$/.test(cover)) {
      safeCover = cover;
    }

    const entry = {
      name: name.replace(/[<>&"']/g, "").slice(0, 20),
      grid,
      moves,
      time: Math.round(time * 100) / 100,
      cover: safeCover,
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
