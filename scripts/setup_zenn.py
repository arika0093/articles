import os
from datetime import datetime, timedelta

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
# dict(newfile, [images])の形で保存する
upload_skipped_images = {}

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
        # ファイルサイズを確認し、3MBを超える場合はアップロードしない
        # (Zennの制限で、3MBを超える画像はアップロードできない)
        if os.path.getsize(img) > 3 * 1024 * 1024:
            print(f"Skipping {img} because it is larger than 3MB")
            upload_skipped_images[new_file] = upload_skipped_images.get(
                new_file, []
            ) + [img]
        else:
            new_img = os.path.join("images", date_str, os.path.basename(img))
            os.makedirs(os.path.dirname(new_img), exist_ok=True)
            move_files.append((img, new_img))

# 実際にファイルを移動する
for before, after in move_files:
    # print(f"Moving {before} to {after}")
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
                # アップロード省略済みの画像の場合
                if img in upload_skipped_images.get(md_file, []):
                    # 本文中にそのパスがある場合はエラー終了する
                    if f"({img_name})" in content:
                        raise Exception(
                            f"Image {img} is too large to upload. Please remove it from {md_file}."
                        )
                else:
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
