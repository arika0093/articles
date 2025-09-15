import os
from dataclasses import dataclass
from datetime import datetime


@dataclass
class ArticleImageInfo:
    current_path: str
    after_path: str
    image_name: str
    date_str: str
    is_large: bool


@dataclass
class ArticleInfo:
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
                current_path=img,
                after_path=after_path,
                image_name=os.path.basename(img),
                date_str=date_str,
                is_large=is_large,
            )
        )
    article_infos.append(
        ArticleInfo(
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
        if not img_info.is_large and img_info.current_path != img_info.after_path:
            os.makedirs(os.path.dirname(img_info.after_path), exist_ok=True)
            if os.path.exists(img_info.current_path):
                os.rename(img_info.current_path, img_info.after_path)

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
                        f"Image {img_info.current_path} is too large to upload. Please remove it from {md_path}."
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
