# Astro Blog System 実装計画

Astroを使用したブログシステムを構築し、既存の記事資産を活かしつつ Zenn など外部プラットフォームへの公開を容易にするための作業項目をまとめる。

## ゴール
- 既存の `articles/` や `draft/` などの構成を壊さずに、`blog/` 配下へ Astro プロジェクトを配置する。
- 全記事の frontmatter を新スキーマに統一し、Astro でも Zenn でも再利用できるようにする。
- GitHub Actions で Astro ビルドと GitHub Pages へのデプロイを自動化する。
- Zenn への公開用スクリプトを TypeScript(Node.js) 化し、frontmatter から Zenn 用 metadata を生成する。

## ディレクトリとセットアップ方針
- ルート直下の既存フォルダ（`articles/`, `draft/`, `scripts/` など）はそのまま保持する。
- Astro は `blog/` 配下に新規作成する。公式 CLI の最新推奨コマンドで作成する（例: `npm create astro@latest blog --template=blog`。テンプレート名は blog/minimal など公式ドキュメントのテンプレート一覧に合わせて随時更新する）。
- Astro 側の記事参照は必要に応じて `../articles/**` を読むようにし、ビルド成果物は `blog/dist` に出力する。

## frontmatter スキーマ
- 全 markdown を以下の frontmatter に統一する。既存キーがある場合は対応する値で置き換える。

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

- `zenn` セクションが無い記事はデフォルト値を補完する変換スクリプトを用意する。
- 画像パスなど既存の相対パスは可能な限り維持し、Astro 側で静的アセットとして扱えるようにする。

## GitHub Actions (Astro + GitHub Pages)
- `.github/workflows/astro-build.yml`（名称は任意）を追加する。
  - トリガー: `push` to `main` と `workflow_dispatch`。
  - ステップ例:
    - `actions/checkout@v4`
    - `actions/setup-node@v4` (Node 20)
    - `npm ci`（必要なら `working-directory: blog` を指定）
    - `npm run build`
    - `actions/configure-pages@v4`
    - `actions/upload-pages-artifact@v4`（`blog/dist` をアップロード）
    - `actions/deploy-pages@v4`
  - キャッシュは `npm` または `pnpm` を使用する（プロジェクトに合わせる）。
  - `pages` 権限と `id-token` 権限を付与し、`environment: github-pages` を設定する。

## Zenn 公開スクリプト (TypeScript 版)
- 現行の Python スクリプト `scripts/setup_zenn.py` を廃止し、後継の TypeScript 版 `scripts/publish_zenn.ts` にリネーム・実装する（元 TODO で言及されていた `publish_zenn.py` を TS で置き換える位置付け）。
- 役割:
  - `articles/` 以下の markdown を走査し、frontmatter から Zenn 用 metadata を生成。
  - 変換後の Zenn frontmatter は以下の対応で出力する:
    - `title` → `title`
    - `zenn.type` → `type`
    - `zenn.emoji` → `emoji`
    - `zenn.topics` → `topics`
    - `zenn.published` → `published`
  - 必要に応じてファイル名のリネームや画像パスの再配置は、現行 Python スクリプトの挙動を踏襲する。
- `npm`/`pnpm` スクリプトとして実行できるよう `package.json` に登録し、CI/CD でも利用可能にする。
