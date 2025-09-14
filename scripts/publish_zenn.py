import datetime
import os

# publish/zenn ブランチにチェックアウト
# その際、mainの内容をそのまま持っていく
os.system("git checkout -B publish/zenn main")

## articleフォルダにあるmarkdownファイルを抽出する
# (再帰的に探す)
markdown_files = [
    os.path.join(root, file)
    for root, dirs, files in os.walk("articles")
    for file in files
    if file.endswith(".md")
]

# tuple(before, after)の形で保存する
move_files = []
for file in markdown_files:
    # フォルダ名が articles/**/yyyyMMdd/*.md となっている
    dir = os.path.dirname(file)
    date_str = os.path.basename(dir)
    # ファイル名を yyyyMMdd-(filename).md に変更し
    # articles直下に移動する
    new_file = os.path.join("articles", f"{date_str}-{os.path.basename(file)}")
    move_files.append((file, new_file))
    # 直下にある画像ファイルを抽出
    image_files = [
        os.path.join(dir, img)
        for img in os.listdir(dir)
        if img.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"))
    ]
    # 画像ファイルを images/yyyyMMdd/* に移動する
    for img in image_files:
        new_img = os.path.join("images", date_str, os.path.basename(img))
        os.makedirs(os.path.dirname(new_img), exist_ok=True)
        move_files.append((img, new_img))

# 実際にファイルを移動する
for before, after in move_files:
    print(f"Moving {before} to {after}")
    os.makedirs(os.path.dirname(after), exist_ok=True)
    os.rename(before, after)

# commitしてforce pushする
now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
os.system("git add .")
os.system(f'git commit -m "Publish to Zenn at {now}"')
os.system("git push -f origin publish/zenn")

# mainブランチに戻る
os.system("git checkout main")
