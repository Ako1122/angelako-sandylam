
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
    const { name, score, total, mode, langs, time } = JSON.parse(event.body);

    // 基本驗證
    if (!name || score === undefined || !total || !mode || !time) {
      return { statusCode: 400, body: JSON.stringify({ error: "缺少必要欄位" }) };
    }

    // 計算分數（用於排序：正確率優先，同正確率比速度）
    const accuracy = score / total;
    const sortScore = accuracy * 1000000 - time;

    const entry = {
      name: name.slice(0, 20),
      score,
      total,
      mode,
      langs: langs || [],
      time: Math.round(time * 100) / 100,
      accuracy: Math.round(accuracy * 10000) / 100,
    };

    // 用 Sorted Set 存排行榜，依 mode 分開
    const key = "leaderboard:" + mode;
    await redis.zadd(key, { score: sortScore, member: JSON.stringify(entry) });

    // 只保留前 100 名
    const count = await redis.zcard(key);
    if (count > 100) {
      await redis.zremrangebyrank(key, 0, count - 101);
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

