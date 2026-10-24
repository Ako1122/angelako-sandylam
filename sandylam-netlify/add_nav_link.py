#!/usr/bin/env python3
"""
在 sandylam-netlify 資料夾裡執行（和各個 .html 同一層）：
    python add_nav_link.py
會在每個 html 的選單「首頁」後面加上「專輯島」連結。
已經有連結的檔案會略過，可以重複執行。
sandylam-islands.html 與 index.html 已經加好，不會被改動。
"""
import glob, re, io

LINK = '<a href="sandylam-islands.html" class="nav-link">專輯島</a>'
PAT = re.compile(r'(<a href="index\.html" class="nav-link[^"]*">首頁</a>)')

for path in sorted(glob.glob('*.html')):
    with io.open(path, encoding='utf-8') as f:
        s = f.read()
    if 'sandylam-islands.html' in s:
        print('略過（已有）:', path); continue
    new, n = PAT.subn(lambda m: m.group(1) + '\n  ' + LINK, s, count=1)
    if n == 0:
        print('找不到選單:', path); continue
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(new)
    print('已加入:', path)
