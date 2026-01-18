---
title: "【Astro】新しいブログを作ってみました"
pin: false
published: true
tags: ["blog", "astro", "astro-paper"]
---

ブログを[Astro](https://astro.build/)で新しく作ってみました。

https://eclairs.cc/

## なぜ作ったか

今までは[Zenn](https://zenn.dev/arika)で記事を書いていましたが、以下のような理由で自分のブログを持ちたくなってきました。

### 技術記事以外も書きたい
これが一番の理由です。
言うまでもなく、Zennには日記とか目標とかあまり書けないよね、という話です。

そのためにはてなブログとかを別途用意する手もありますが、どうせなら一元管理したいなあと。

### 見た目
一応エンジニアの端くれなので、ブログの見た目もちょっと弄りたかったのもあります。
個人的には[Shiki](https://shiki.matsu.io/)の方が好きなので、それでコードハイライトできるようにしたかったのもあります（とか言ってたら最近ZennもShiki対応したけど）

### 欠点
ただし、Zennも良いところがあり、リーチ範囲が広いのは魅力的です。
やはり技術記事は読んでもらってなんぼなので、これは捨てがたいのと、ググったときに自分の記事が先頭に出てきたりするので良い備忘録になります。


## やったこと
そういうわけで、単一のMarkdownファイルからZennと自分のブログの両方に記事を公開できるようにしました。
元々Zennの記事も[GitHubで管理してた](/posts/2025/20250914/publish_to_zenn_another_folder_structure)ので、こいつをベースにカスタマイズを加えていきました。

### 何を使って書くか
これはAstroでやろうと決めていました。理由は以下。

* 標準でMarkdownサポート
* カスタマイズが柔軟
* Shikiを組み込みでサポートしている

### テーマ
全然知見がなかったので[astro-paper](https://astro-paper.pages.dev)をカスタマイズして使うことにしました。
後から色々知ったのでそっちにすればよかったかもとも思いましたが、まあいいでしょう。

### カスタマイズ
以下の機能を追加で足しました。方法はググったりAIに聞いたり。

* remark-breaks
  * 素のmarkdown改行(行末スペース2個)がだるいので、書いたとおりに改行されるように
* rehype-external-links
  * 外部リンクに`target="_blank"`を付与
* remark-toc
  * 目次生成
  * デザインは自分で書いた
* カスタムフォント
  * 日本語は`M-PLUS 2`, ソースコードは`JetBrains Mono`を採用
  * M-PLUS2の場合、特にダークテーマ時に線が太いのが気になったので微調整
* astro-google-analytics
  * 一応埋め込み
* `astro-icon`+`@iconify-json/tabler`
  * アイコンをSVGで持つのが面倒だったので導入
* giscus
  * コメント欄設置
  * カラーテーマの切り替えが厄介。[ここ](https://astro-paper.pages.dev/posts/how-to-integrate-giscus-comments/)を参考に実装。

## 記事管理
基本的に`/articles`以下に記事を配置し、以下のfrontmatterを付与しています。

```yml
---
title: "記事のタイトル"
published: false # blogに公開するかどうか
tags: ["csharp", "dotnet", "sourcegenerator"] # タグ一覧
zenn: # Zenn公開用設定
  published: false # Zennに公開するかどうか
  emoji: "⚠️" # Zenn記事のアイコン
  type: "tech" # Zenn記事の種類(techかidea)
  topics: ["csharp", "dotnet", "sourcegenerator"] # Zenn記事のトピック一覧
---
```

後はGitHubActionsでPushされたときに↑の情報を参考に、Zenn用のブランチを自動更新するだけです。
単純ですね。

こうすることで、手間なく同一記事をZennと自分のブログの両方に公開できるようにしています。

## 感想
Astroってすごいですね。静的サイト作るときには積極的に使っていきます。
