# Sandy Lam 鐵粉挑戰賽

林憶蓮（Sandy Lam）歌迷互動網站，收錄 **402 首歌曲、76 張專輯**，提供 6 種不同玩法的挑戰遊戲，並附排行榜功能。純前端網站，透過 Netlify Functions + Upstash Redis 提供排行榜的後端服務。

正式網址：https://sandylam.netlify.app

---

## 目錄

- [網站架構](#網站架構)
- [六個遊戲玩法](#六個遊戲玩法)
- [資料檔案格式](#資料檔案格式)
- [排行榜機制](#排行榜機制)
- [輔助腳本](#輔助腳本)
- [部署到 Netlify](#部署到-netlify)
- [環境變數](#環境變數)
- [資料夾結構](#資料夾結構)
- [已知限制：前端資料是公開的](#已知限制前端資料是公開的)

---

## 網站架構

這是一個**純前端網站**：所有遊戲邏輯（出題、計分、計時、干擾選項產生）都在瀏覽器端的 JavaScript 執行，資料來源是 `data/songs.json` 與 `data/cover.json` 兩份靜態 JSON 檔案。唯一有後端運算的部分是**排行榜**，透過 Netlify Functions 讀寫 Upstash Redis 資料庫。

| 頁面 | 說明 |
|---|---|
| `index.html` | 首頁，六個遊戲的入口卡片 |
| `tournament.html` | 歌曲冠軍賽（淘汰賽投票） |
| `guess.html` | 猜歌挑戰（Song Guess Quiz） |
| `guess-album.html` | 猜專輯（Guess The Album） |
| `guess-cover-version-song.html` | 猜翻唱歌名 |
| `guess-cover-version-album.html` | 猜翻唱專輯 |
| `memory-match.html` | 記憶翻牌 |

---

## 六個遊戲玩法

### 1. 冠軍賽（`tournament.html` / `js/app.js`）
歌曲兩兩捉對廝殺的淘汰賽，玩家一路投票選出「最愛的 Sandy 歌曲」，直到冠軍誕生。結束後可產生分享用的戰績圖（含 QR Code）。

### 2. 猜歌挑戰（`guess.html` / `js/guess.js`）
播放 30 秒 Apple Music 音樂片段，四選一猜歌名。可依語言（粵語／國語／英語／日語／藏文）篩選歌曲範圍，並選擇難度：
- 初級：20 題，答錯不會中斷
- 中級：50 題，答錯不會中斷
- 最高級：全曲目，答錯立即結束

干擾選項規則：日語／英語只從同語言歌曲抽；粵語／國語互相混抽。

### 3. 猜專輯（`guess-album.html` / `js/guess-album.js`）
播放音樂片段，四選一猜是哪張專輯封面。難度與語言篩選機制同猜歌挑戰。

### 4. 猜翻唱歌名（`guess-cover-version-song.html` / `js/guess-cover-version-song.js`）
播放的是**翻唱原曲或其他歌手演繹版本**的音樂片段（資料在 `data/cover.json`），玩家要猜出 Sandy 翻唱後的正式歌名。難度：初級 20 題／中級 50 題／最高級全部 113 題（答錯即結束）。

干擾選項規則：
- 正確答案是中文歌名 → 干擾項只能是中文歌名（粵語＋國語）
- 正確答案是英文歌名 → 干擾項只能是英文歌名
- **日文歌名一律不會出現在干擾選項中**
- 每題可在 `cover.json` 指定該題「不可以出現在干擾選項中的歌名」（`excludeSongName`），避免出現容易混淆的近似答案
- 作答後（不論對錯）會在播放器下方顯示翻唱來源資訊（原唱歌手／演繹版本名稱）

### 5. 猜翻唱專輯（`guess-cover-version-album.html` / `js/guess-cover-version-album.js`）
同樣播放翻唱原曲片段，四選一猜這首歌收錄在 Sandy 哪張專輯。干擾封面規則：
- 每題可在 `cover.json` 指定該題「不可以出現在干擾選項中的封面」（`excludeCoverFile`）
- 另外有一份**全域封鎖清單**（寫在 `js/guess-cover-version-album.js` 的 `BLOCKED_DISTRACTOR_COVERS`），清單中的封面檔案除非剛好是該題正確答案，否則永遠不會被抽為干擾選項
- 作答後同樣會顯示翻唱來源資訊

### 6. 記憶翻牌（`memory-match.html` / `js/memory-match.js`）
翻牌配對遊戲，翻開專輯封面找出兩兩相同的配對，可選難度（10／20／25 組封面），計時、計步數。

---

## 資料檔案格式

### `data/songs.json`

Sandy 本人演唱歌曲的主資料庫，陣列，每首歌一個物件：

```json
{
  "id": "c0001",
  "title": "愛情 I Don't Know",
  "album": "林憶蓮",
  "lang": "粵語",
  "cover": "images/covers/01.jpg",
  "coverConfirmed": true,
  "preview_url": "https://audio-ssl.itunes.apple.com/.../mzaf_xxx.plus.aac.p.m4a"
}
```

| 欄位 | 說明 |
|---|---|
| `id` | 唯一代號 |
| `title` | 歌名 |
| `album` | 專輯名稱 |
| `lang` | 語言分類：粵語／國語／英語／日語／藏文 |
| `cover` | 專輯封面圖片路徑（`images/covers/` 底下） |
| `coverConfirmed` | 內部追蹤用欄位，遊戲邏輯不會用到 |
| `preview_url` | Apple Music 30 秒試聽連結，猜歌挑戰／猜專輯／冠軍賽用這個播放 |

目前共 **402 首歌**（粵語 207、國語 139、英語 35、日語 19、藏文 2），涵蓋 **76 張專輯**。

### `data/cover.json`

翻唱歌曲對照表，用於「猜翻唱歌名」「猜翻唱專輯」兩個遊戲，陣列，每筆一個物件：

```json
{
  "id": "cover0001",
  "name": "松田聖子 - 天使のウィンク",
  "correctAnswer": "愛情 I Don't Know",
  "album": "林憶蓮",
  "correctCover": "images/covers/01.jpg",
  "excludeCoverFile": null,
  "excludeSongName": null,
  "appleMusicUrl": "https://music.apple.com/...",
  "trackId": "1536762794",
  "previewUrl": "https://audio-ssl.itunes.apple.com/.../mzaf_xxx.plus.aac.p.m4a"
}
```

| 欄位 | 說明 |
|---|---|
| `id` | 唯一代號（`cover0001` 起） |
| `name` | 翻唱原曲或其他人演繹版本（歌手 - 曲名），作答後顯示給玩家看 |
| `correctAnswer` | 正確答案：Sandy 翻唱後的正式歌名 |
| `album` | 這首翻唱版本收錄在 Sandy 哪張專輯 |
| `correctCover` | 正確答案的專輯封面路徑 |
| `excludeCoverFile` | 這題「猜翻唱專輯」時不可以出現在干擾選項的封面（單一檔案，無則為 `null`） |
| `excludeSongName` | 這題「猜翻唱歌名」時不可以出現在干擾選項的歌名（無則為 `null`） |
| `appleMusicUrl` | 原曲的 Apple Music 頁面連結（僅供對照用，遊戲不會用到） |
| `trackId` | 原曲的 Apple Music track ID |
| `previewUrl` | 原曲／翻唱版本的 30 秒試聽連結，遊戲實際播放用這個 |

目前共 **113 筆**翻唱對照資料。

> `cover.json` 的 `previewUrl` 需要手動用 Apple Music track ID 去查表回填（目前是人工流程），`excludeCoverFile` / `excludeSongName` 兩欄則是手動整理，用來避免容易混淆的翻唱版本互相被拿來當作彼此的干擾選項。

---

## 排行榜機制

六個遊戲裡有排行榜功能的（猜歌挑戰、猜專輯、猜翻唱歌名、猜翻唱專輯、記憶翻牌），都是透過 Netlify Functions + Upstash Redis 的 Sorted Set 實作：

| Function | 用途 |
|---|---|
| `netlify/functions/submit-score.js` | 提交猜歌類遊戲成績 |
| `netlify/functions/get-leaderboard.js` | 讀取猜歌類遊戲前 10 名 |
| `netlify/functions/submit-memory-score.js` | 提交記憶翻牌成績 |
| `netlify/functions/get-memory-leaderboard.js` | 讀取記憶翻牌前 10 名 |

排行榜依「難度模式」分開儲存，Redis key 格式為 `leaderboard:<mode>`，例如：

- `easy` / `medium` / `hard` — 猜歌挑戰
- `album-easy` / `album-medium` / `album-hard` — 猜專輯
- `cover-song-easy` / `cover-song-medium` / `cover-song-hard` — 猜翻唱歌名
- `cover-album-easy` / `cover-album-medium` / `cover-album-hard` — 猜翻唱專輯

排序邏輯：正確率優先，同正確率比用時（`accuracy * 1000000 - time`），每個 mode 只保留前 100 筆，前端只顯示前 10 名。

---

## 輔助腳本

這些腳本是資料整理用的工具，跟網站本身的執行無關（不會被部署到 Netlify 前端）：

- **`convert-songs.js`** — 把 `songs-with-preview.json`（含完整 iTunes 比對結果的中間檔）轉換整理成正式的 `data/songs.json`。執行：`node convert-songs.js`
- **`scripts/match-spotify.js`** — 用 Spotify Client Credentials Flow，批次比對 `data/songs.json` 每首歌對應的 Spotify 曲目，並計算比對信心分數。使用前先複製 `scripts/spotify-config.example.json` 為 `scripts/spotify-config.json` 並填入自己的 Spotify Client ID / Secret（此檔案已加入 `.gitignore`，不會被提交）。執行：`node scripts/match-spotify.js`

---

## 部署到 Netlify

1. 這個 repo 已經設定好 `netlify.toml`（指定 Functions 目錄為 `netlify/functions`），直接連接 GitHub repo 部署，或用 `netlify deploy` 指令部署即可，不需要額外的 build 指令。
2. 需要在 Netlify 後台的 **Site settings → Environment variables** 設定 Upstash Redis 的連線資訊（見下方環境變數）。
3. 部署完成後，`/.netlify/functions/*` 會自動對應到 `netlify/functions/` 資料夾裡的每支 Function。

---

## 環境變數

| 變數 | 說明 |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST API 網址 |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST API Token |

這兩個變數只有 Netlify Functions（伺服器端）會用到，不會出現在前端程式碼裡。

---

## 資料夾結構

```
.
├── index.html                          首頁
├── tournament.html                     冠軍賽
├── guess.html                          猜歌挑戰
├── guess-album.html                    猜專輯
├── guess-cover-version-song.html       猜翻唱歌名
├── guess-cover-version-album.html      猜翻唱專輯
├── memory-match.html                   記憶翻牌
│
├── css/
│   ├── style.css                       共用樣式
│   ├── guess.css / guess-album.css
│   ├── guess-cover-version-song.css / guess-cover-version-album.css
│   └── memory-match.css
│
├── js/
│   ├── app.js                          冠軍賽邏輯
│   ├── guess.js / guess-album.js
│   ├── guess-cover-version-song.js / guess-cover-version-album.js
│   └── memory-match.js
│
├── data/
│   ├── songs.json                      402 首歌主資料庫
│   └── cover.json                      113 筆翻唱歌曲對照表
│
├── images/
│   ├── champion.jpeg / intro-sandy.jpg
│   └── covers/                         77 張專輯封面圖
│
├── netlify/functions/                  排行榜後端 API
│   ├── submit-score.js / get-leaderboard.js
│   └── submit-memory-score.js / get-memory-leaderboard.js
│
├── scripts/
│   ├── match-spotify.js                Spotify 曲目比對工具
│   └── spotify-config.example.json
│
├── convert-songs.js                    songs-with-preview.json → data/songs.json 轉換腳本
├── netlify.toml
├── package.json
└── ad.txt
```

---

## 已知限制：前端資料是公開的

因為這是純前端網站，`data/songs.json` 與 `data/cover.json` 會完整下載到每個造訪者的瀏覽器裡（例如直接打開 `https://sandylam.netlify.app/data/cover.json` 就能看到完整內容），包含：

- 所有歌曲清單、專輯對照、Apple Music 試聽連結
- `cover.json` 裡每一題的正確答案、以及用來避免混淆的 `excludeCoverFile` / `excludeSongName` 排除清單

這是「純前端 + 靜態 JSON」架構的通病，沒有辦法只讓「網頁」存取而擋掉「使用者直接存取」——瀏覽器發出的請求跟使用者手動打開網址的請求，伺服器端無法區分兩者。

如果之後想要真正防止玩家提前看到答案／完整資料被整批抓走，可以考慮把出題邏輯搬到 Netlify Functions（伺服器端保留完整資料庫，每次只回傳單題所需的內容），但這會需要把現在寫在 `js/guess*.js` 裡的抽題與干擾項邏輯，改用 Node.js 在後端重寫一次。
