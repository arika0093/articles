# Articles Repository

技術記事を管理・公開するためのリポジトリです。

## 構成

- **articles/**: 記事のソースファイル（年/日付/記事名の階層構造）
- **blog/**: Astroベースのブログシステム
- **scripts/**: 記事管理用のスクリプト
- **draft/**: 下書き記事
- **docs/**: ドキュメント

## セットアップ

```bash
npm install
```

ブログ用の依存関係もインストールする場合:

```bash
cd blog
npm install
```

## 記事の管理

### 新しい記事を作成

```bash
npm run article
```

### 記事のfrontmatterを更新

全記事のfrontmatterを統一スキーマに更新:

```bash
npm run update:frontmatter
```

### Zennへ公開

```bash
npm run publish:zenn
```

このコマンドは:
1. `publish/zenn`ブランチを作成
2. 記事をZenn形式に変換
3. 画像パスを更新
4. ブランチにコミット

その後、手動で`git push -f origin publish/zenn`を実行してZennに公開します。

## ブログシステム

Astroを使用したブログシステムが`blog/`ディレクトリにあります。

### ローカル開発

```bash
npm run blog:dev
```

### ビルド

```bash
npm run blog:build
```

### プレビュー

```bash
npm run blog:preview
```

詳細は[blog/README.md](blog/README.md)を参照してください。

## GitHub Actions

### Astro Blog デプロイ

`.github/workflows/astro-build.yml`がmainブランチへのpush時に:
1. 記事をコピー
2. Astroサイトをビルド
3. GitHub Pagesにデプロイ

デプロイ先: https://arika0093.github.io/articles/

### Zenn公開

`.github/workflows/publish_zenn.yml`がmainブランチへのpush時に:
1. 記事をZenn形式に変換
2. `publish/zenn`ブランチに強制プッシュ

## 記事のfrontmatterスキーマ

```yaml
---
title: "記事のタイトル"
description: "記事の説明文"
published: true  # Astro公開用フラグ
zenn:
  published: true  # Zenn公開用フラグ
  emoji: "🔥"
  type: "tech"  # "tech" or "idea"
  topics: ["html", "bash", "dotfiles"]
---
```

## スクリプト

- `scripts/update_frontmatter.ts`: 全記事のfrontmatterを統一スキーマに更新
- `scripts/publish_zenn.ts`: Zenn公開用に記事を変換
- `blog/scripts/copy-articles.ts`: Astroビルド時に記事をコピー

## ライセンス

記事の内容は著作権により保護されています。
