---
title: "【Astro】新しいブログを作ってみました"
pin: false
published: true
tags: ["blog", "astro", "astro-paper"]
---

ブログを[astro](https://astro.build/)で新しく作ってみました。

## なぜ作ったか

今までは[Zenn](https://zenn.dev/arika)で記事を書いていましたが、以下のような理由で自分のブログを持ちたくなってきました。

* 技術記事以外が書きにくい
  * これが一番大きい。
  * 自分の目標とか日記的なものを書きたくなったときにちょっと困った。
  * 別に気にせず書いてもいいけど、色々言われるのも嫌だよね、ということで。
* 見た目
  * もうちょっと読みやすくできるよね、と。
  * SyntaxHighlighterがPrism.jsだったが、個人的に[Shiki](https://shiki.matsu.io/)の方が好き
    * とか言ってたら最近ZennもShiki対応した。。

ただし、Zennも良いところがあり

* リーチ範囲が広い
  * 読んでもらってなんぼなので、これは捨てがたい
  * ググったときに自分の記事が先頭に出てきたりする

## やったこと
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
* giscus
  * コメント欄設置

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
