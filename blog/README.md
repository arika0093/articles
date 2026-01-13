# Astro Blog (AstroPaper Theme)

このディレクトリには、[AstroPaper](https://github.com/satnaing/astro-paper)テーマを使用したブログシステムが含まれています。

## 特徴

- レスポンシブデザイン（Tailwind CSS v4）
- ダーク/ライトモード切り替え
- 全文検索機能（Pagefind）
- RSSフィード生成
- サイトマップ生成
- 年月別アーカイブページ
- タグベースのナビゲーション
- SEO最適化

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
Pagefindの検索インデックスも自動的に生成されます。

## プレビュー

```bash
npm run preview
```

ビルドされたサイトをローカルでプレビューできます。

## 仕組み

1. **記事のコピー**: ビルド時に`scripts/copy-articles.ts`が実行され、`../articles`ディレクトリから記事をコピーします
2. **画像の処理**: 記事内の画像を`public/images/`にコピーし、マークダウン内の参照を更新します
3. **コンテンツコレクション**: Astroのコンテンツコレクション機能（glob loader）を使用して記事を管理します
4. **静的サイト生成**: 全ての記事ページが静的HTMLとして生成されます
5. **検索インデックス**: Pagefindが全文検索用のインデックスを自動生成します

## ディレクトリ構造

```
blog/
├── src/
│   ├── data/
│   │   └── blog/           # コピーされた記事（.gitignoreで除外）
│   ├── content.config.ts   # コンテンツコレクションの定義
│   ├── config.ts           # サイト設定
│   ├── layouts/            # レイアウトコンポーネント
│   ├── components/         # 再利用可能なコンポーネント
│   ├── pages/              # ページとルーティング
│   │   ├── index.astro     # ホームページ
│   │   ├── posts/          # 記事ページ
│   │   ├── tags/           # タグページ
│   │   └── archives/       # アーカイブページ
│   ├── styles/             # グローバルスタイル
│   └── utils/              # ユーティリティ関数
├── public/
│   └── images/             # コピーされた画像（.gitignoreで除外）
├── scripts/
│   └── copy-articles.ts    # 記事と画像をコピーするスクリプト
├── astro.config.ts         # Astro設定
├── tsconfig.json
└── package.json
```

## カスタマイズ

サイトの設定は`src/config.ts`で変更できます：

```typescript
export const SITE = {
  website: "https://arika0093.github.io/articles/",
  author: "arika0093",
  profile: "https://github.com/arika0093",
  desc: "技術記事とブログ",
  title: "arika0093's blog",
  // ... その他の設定
}
```

## GitHub Pages へのデプロイ

`.github/workflows/astro-build.yml`ワークフローが、mainブランチへのpush時に自動的にビルドとデプロイを行います。

デプロイされたサイトは以下のURLでアクセスできます:
https://arika0093.github.io/articles/

## AstroPaper について

このプロジェクトは[AstroPaper](https://github.com/satnaing/astro-paper)テーマを使用しています。
AstroPaperは最小限で、レスポンシブ、アクセシブル、SEOフレンドリーなAstroブログテーマです。
