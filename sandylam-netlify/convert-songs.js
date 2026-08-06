
// node convert-songs.js
// 將 songs-with-preview.json 轉成 data/songs.json
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('songs-with-preview.json', 'utf8'));
const output = raw.map(s => ({
  id: s.id,
  title: s.title,
  album: s.album,
  lang: s.lang,
  cover: s.cover,
  coverConfirmed: s.coverConfirmed,
  preview_url: (s.itunes && s.itunes.preview_url) || null
}));
fs.writeFileSync('data/songs.json', JSON.stringify(output, null, 2));
console.log(`Done: ${output.length} songs, ${output.filter(s=>s.preview_url).length} with preview`);
