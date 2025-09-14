---
title: "ZennのGitHub連携で柔軟なフォルダ構成を使う"
emoji: "🤖"
type: "tech"
topics: ["zenn", "python"]
published: true
---

## やりたいこと
Zennの[GitHub連携](https://zenn.dev/zenn/articles/connect-to-github)は便利ですが、以下のようなフォルダ構成を強要されます。

```
articles/
  ├── article1.md
  └── article2.md
images/
  ├── image1.png
  └── image2.png
```

まあこれはこれで良いのですが、VSCodeの画像貼り付けプラグインや管理の都合上、自分は以下のようなフォルダ構成のほうが好みです。

```
articles/
  ├── 2025/
  │   ├── 20250101/
  │   │   ├── article1.md
  │   │   └── image1.png
  │   └── 20250202/
  │       ├── article2.md
  │       └── image2.png
  └── 2024/
      └── 20241212/
          ├── article3.md
          └── image3.png
```

要するに年月日があって、その中に記事と画像がある構成です。

## どのようにしたか
Zenn用のpublish/zennブランチを作成して、そこにZennの要求するフォルダ構成に変換したものを反映させることにしました。
どのように変換するかですが、Pythonスクリプトを書いて自動化しました。中身は適当で汚いので、参考程度に。
~~AIにやらせようとしたら全然うまくいかなかったので、手動で書きました。~~

```python
import os
from datetime import datetime

# publish/zenn ブランチにチェックアウト
# その際、mainの内容をそのまま持っていく
os.system("git checkout -B publish/zenn main")

## articleフォルダにあるmarkdownファイルを抽出する
# (再帰的に探す)
markdown_files = [
    os.path.join(root, file)
    for root, _, files in os.walk("articles")
    for file in files
    if file.endswith(".md")
]

# tuple(before, after)の形で保存する
move_files = []
# dict((date, newfile), [images])の形で保存する
contain_images = {}
for file in markdown_files:
    # フォルダ名が articles/**/yyyyMMdd/*.md となっている
    dir = os.path.dirname(file)
    date_str = os.path.basename(dir)
    # ファイル名を yyyyMMdd-(filename).md に変更し
    # articles直下に移動する
    # ファイル名に含まれる # は削除する
    new_file = os.path.join("articles", f"{date_str}-{os.path.basename(file)}")
    new_file = new_file.replace("#", "")
    move_files.append((file, new_file))
    # 直下にある画像ファイルを抽出
    image_files = [
        os.path.join(dir, img)
        for img in os.listdir(dir)
        if img.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"))
    ]
    # contains_imagesに保存する
    contain_images[(date_str, new_file)] = image_files
    # 画像ファイルを images/yyyyMMdd/* に移動する
    for img in image_files:
        new_img = os.path.join("images", date_str, os.path.basename(img))
        os.makedirs(os.path.dirname(new_img), exist_ok=True)
        move_files.append((img, new_img))

# 実際にファイルを移動する
for before, after in move_files:
    print(f"Moving {before} to {after}")
    os.makedirs(os.path.dirname(after), exist_ok=True)
    if os.path.exists(before):
        os.rename(before, after)

    # markdownファイル内の画像パスを修正する
    if before.endswith(".md"):
        with open(after, "r", encoding="utf-8") as f:
            content = f.read()
        # 画像パスを修正
        contains = [
            (date_str, md_file, images)
            for (date_str, md_file), images in contain_images.items()
            if md_file == after
        ]
        for date_str, md_file, images in contains:
            for img in images:
                img_name = os.path.basename(img)
                # 例: (20231001/image.png) -> (/images/20231001/image.png)
                # markdown内の画像パスを修正
                content = content.replace(
                    f"({img_name})", f"(/images/{date_str}/{img_name})"
                )
        # 修正した内容を書き戻す
        with open(after, "w", encoding="utf-8") as f:
            f.write(content)

# 空のbooksフォルダを作成し、.keepファイルを置く
os.makedirs("books", exist_ok=True)
with open("books/.keep", "w") as f:
    f.write("")

# commitする
now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
os.system("git add .")
os.system(f'git commit -m "Publish to Zenn at {now}"')
```

mainブランチで`python scripts/setup_zenn.py`を実行すると、publish/zennブランチが作成され、Zenn用のフォルダ構成に変換された内容がコミットされます。
この状態で `npx zenn`を実行すればプレビューが見れますし、`git push -f origin publish/zenn`すればZennに反映されます。

こいつをGitHubのActionsなどで自動化すれば完成です。

```yml
name: Publish Zenn

on:
  push:
    branches:
      - main

permissions:
  contents: write
  id-token: write  

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.x'

      - name: Setup git
        run: |
          git config --global user.name 'github-actions[bot]'
          git config --global user.email 'github-actions[bot]@users.noreply.github.com'

      - name: Run setup_zenn.py
        run: python scripts/setup_zenn.py

      - name: Force push to publish/zenn branch
        run: |
          git push -f origin publish/zenn
```

あとはZennの管理画面でGitHub連携のブランチを`publish/zenn`に設定すればOK。

やろうと思いつつサボってましたが、楽に記事が管理できて満足です。

## TODO
- pushしたら自動で英訳して他のプラットフォームに投稿できるようにする

