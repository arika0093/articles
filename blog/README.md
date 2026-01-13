# Astro Blog

このディレクトリには、記事を公開するためのAstroベースのブログシステムが含まれています。

## セットアップ

```bash
npm install
```

## 開発

```bash
npm run dev
```

開発サーバーが起動し、`http://localhost:4321`でアクセスできます。

## ビルド

```bash
npm run build
```

ビルド成果物は`dist/`ディレクトリに生成されます。

## プレビュー

```bash
npm run preview
```

ビルドされたサイトをローカルでプレビューできます。

## 仕組み

1. **記事のコピー**: ビルド時に`scripts/copy-articles.ts`が実行され、`../articles`ディレクトリから記事をコピーします
2. **画像の処理**: 記事内の画像を`public/images/`にコピーし、マークダウン内の参照を更新します
3. **コンテンツコレクション**: Astroのコンテンツコレクション機能を使用して記事を管理します
4. **静的サイト生成**: 全ての記事ページが静的HTMLとして生成されます

## ディレクトリ構造

```
blog/
├── src/
│   ├── content/
│   │   ├── config.ts       # コンテンツコレクションの定義
│   │   └── blog/           # コピーされた記事（.gitignoreで除外）
│   ├── layouts/
│   │   └── Layout.astro    # ベースレイアウト
│   ├── pages/
│   │   ├── index.astro     # 記事一覧ページ
│   │   └── blog/
│   │       └── [...slug].astro  # 記事ページ（動的ルーティング）
│   └── env.d.ts
├── public/
│   └── images/             # コピーされた画像（.gitignoreで除外）
├── scripts/
│   └── copy-articles.ts    # 記事と画像をコピーするスクリプト
├── astro.config.mjs        # Astro設定
├── tsconfig.json
└── package.json
```

## GitHub Pages へのデプロイ

`.github/workflows/astro-build.yml`ワークフローが、mainブランチへのpush時に自動的にビルドとデプロイを行います。

デプロイされたサイトは以下のURLでアクセスできます:
https://arika0093.github.io/articles/
