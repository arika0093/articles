
Astroを使用したブログシステムを構築したい。

## TODO
* 既存のフォルダ構成を維持しながら、blog/以下にAstroを設置してください。
* 既存markdownのmetadataを以下のような内容に差し替えます。(Zenn等のプラットフォームに公開できるようにするため)

```yml
# 共通設定
title: "記事のタイトル"
description: "記事の説明文"
# Astro公開用フラグ
published: true
zenn:
    # Zenn公開用設定
    published: true
    emoji: "🔥"
    type: "tech"
    topics: ["html", "bash", "dotfiles"]
```

* Astroビルド・GitHubPages公開用のGitHub Actionsを追加します。
* Zenn公開用のスクリプト(scripts/publish_zenn.py)を修正
  * Python -> TypeScript(nodejs)に書き換える
  * metadataをZenn用のmetadataに変換する処理を追加。
```yml
title: "記事のタイトル" # from title
type: "tech" # from zenn.type
emoji: "🔥" # from zenn.emoji
topics: ["html", "bash", "dotfiles"] # from zenn.topics
published: true # from zenn.published
```

