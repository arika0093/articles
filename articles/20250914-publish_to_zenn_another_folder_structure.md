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

あと地味にフラストレーションがたまる仕様として、画像ファイルの参照が`/images/...`で始まる絶対パスでないといけないというのもあります。
VSCodeの貼り付けを使うとファイル名が`image.png`のようになりますが、これをF2キーでリネームすると`../images/...`のように相対パスに変わってしまい、Zennで画像が表示されなくなります。
今までこれを逐一手動で直してましたが、面倒くさい！

## どのようにしたか
Zenn用のpublish/zennブランチを作成して、そこにZennの要求するフォルダ構成に変換したものを反映させることにしました。
どのように変換するかですが、Pythonスクリプトを書いて自動化しました。中身は適当で汚いので、参考程度に。
~~AIにやらせようとしたら全然うまくいかなかったので、手動で書きました。~~

```python
import os
from dataclasses import dataclass
from datetime import datetime


@dataclass
class ArticleImageInfo:
    image_path: str
    after_path: str
    image_name: str
    date_str: str
    is_large: bool


@dataclass
class ArticleInfo:
    markdown_path: str
    current_path: str
    after_path: str
    date_str: str
    contained_images: list[ArticleImageInfo]


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

article_infos: list[ArticleInfo] = []

for file in markdown_files:
    dir = os.path.dirname(file)
    # フォルダ名が日付になっているので、それを取得
    date_str = os.path.basename(dir)
    # ファイル名の先頭に#を使っているので、置換しておく
    new_file = os.path.join("articles", f"{date_str}-{os.path.basename(file)}").replace(
        "#", ""
    )
    image_files = [
        os.path.join(dir, img)
        for img in os.listdir(dir)
        if img.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"))
    ]
    contained_images: list[ArticleImageInfo] = []
    for img in image_files:
        is_large = os.path.getsize(img) > 3 * 1024 * 1024
        after_path = (
            os.path.join("images", date_str, os.path.basename(img))
            if not is_large
            else img
        )
        contained_images.append(
            ArticleImageInfo(
                image_path=img,
                after_path=after_path,
                image_name=os.path.basename(img),
                date_str=date_str,
                is_large=is_large,
            )
        )
    article_infos.append(
        ArticleInfo(
            markdown_path=file,
            current_path=file,
            after_path=new_file,
            date_str=date_str,
            contained_images=contained_images,
        )
    )


# 実際にファイルを移動する
for article in article_infos:
    # markdownファイル
    before = article.current_path
    after = article.after_path
    os.makedirs(os.path.dirname(after), exist_ok=True)
    if os.path.exists(before):
        os.rename(before, after)
    # 画像ファイル
    for img_info in article.contained_images:
        if not img_info.is_large and img_info.image_path != img_info.after_path:
            os.makedirs(os.path.dirname(img_info.after_path), exist_ok=True)
            if os.path.exists(img_info.image_path):
                os.rename(img_info.image_path, img_info.after_path)

# markdownファイル内の画像パスを修正する
for article in article_infos:
    md_path = article.after_path
    if os.path.exists(md_path):
        with open(md_path, "r", encoding="utf-8") as f:
            content = f.read()
        for img_info in article.contained_images:
            img_name = img_info.image_name
            if img_info.is_large:
                # 本文中に大きい画像がある場合、エラーを出す
                if f"({img_name})" in content:
                    raise Exception(
                        f"Image {img_info.image_path} is too large to upload. Please remove it from {md_path}."
                    )
            else:
                # 例: (image.png) -> (/images/yyyyMMdd/image.png)
                content = content.replace(
                    f"({img_name})", f"(/images/{img_info.date_str}/{img_name})"
                )
        with open(md_path, "w", encoding="utf-8") as f:
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
        env:
          TZ: Asia/Tokyo

      - name: Force push to publish/zenn branch
        run: |
          git push -f origin publish/zenn
```

あとはZennの管理画面でGitHub連携のブランチを`publish/zenn`に設定すればOK。

やろうと思いつつサボってましたが、楽に記事が管理できて満足です。

## TODO
- pushしたら自動で英訳して他のプラットフォームに投稿できるようにする
- ~~ファイルサイズが3MBを超える画像を検出したらエラーにする~~ (実装済み)

