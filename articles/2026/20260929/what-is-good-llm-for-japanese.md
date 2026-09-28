---
title: "日本語が一番うまいLLMは誰なのか調べる"
published: true
tags: ["llm", "opencode"]
zenn:
  published: true
  emoji: "🔍️"
  type: "tech"
---

GPT系列の日本語が終わっているという話はよく聞くし自分も困っているので、
じゃあどのモデルでドキュメントを書かせればいいかな、ということで雑に調査した。

## 日本語が終わっている、とは

↓のような文章。（ちなみにこの文章は実装コードを元にGPT 6 Lunaが生成した）

```md
`Configlue.Resource.Dapr` は Dapr State Management の1つの store key を Configlue の byte-resource 契約へ接続します。
Dapr を使うアプリケーションだけにインストールしてください:

このパッケージは Dapr .NET SDK を使い、設定済みの Dapr state store と実行中の Dapr sidecar を必要とします。
`Configlue.Core` と `Configlue` メタパッケージからは参照されません。

DI アプリケーションでは `ClientFactory` からホスト所有の `DaprClient` を解決できます。
クライアントの所有権は呼び出し側に残ります。リソースは byte の読み書きを行うだけで、レイヤー、merge、provenance、schema、migration、query/ORM は実装しません。

読み取り時に store が ETag を返せば Configlue revision として公開します。
revision を確認する書き込みは Dapr の `FirstWrite` concurrency mode を使って期待 revision を渡し、ETag 不一致を `StateConflictException` に変換します。
revision を確認しない書き込みは `LastWrite` を使います。
Dapr は書き込み後の新しい ETag を返さないため、書き込み成功時の revision は次回読み取りまで null です。
ETag と concurrency の保証は選択した Dapr state-store component に依存します。
component が保証しない動作やエラーはそのまま表面化し、強い保証を擬似しません。
ETag がない Dapr byte-state 応答では長さ0の値とキー不在を区別できないため、不在として扱います。

変更 watcher とキー間 transaction はありません。設定した state store より強い整合性や transaction を保証しません。
```

みなさんこの文章を読んでどう思いますか？私にはよくわかりませんでした。なお、この文章は

* 解説ページの**先頭部分**から取得した
* 前提となるページは特にない（ライブラリ機能の一つを解説するだけ）

ので、通しで読んでも多分同じ感想になると思います。

### なぜよくわからないのか

個人的には

* 1.用語の解説がない
  * Daprって何？がない
  * 突然`ETag`とか`Dapr state store`とか出てくる。
* 2.日本語と英語が混ざっている
  * 例: `設定済みの Dapr state store と実行中の Dapr sidecar を必要とします`
  * 例: `読み取り時に store が ETag を返せば Configlue revision として公開します`
* 3.謎の日本語訳・英訳
  * 例: `契約`(contract: インターフェースとかAPIとかそういうことを言いたいと思われる)
  * 例: `保証`(guarantees: 今回の場合は、Atomic性(成功or失敗が単一に決まること)の保証)
  * 例: `擬似`(simulate: この場合はAtomic性を擬似的に担保しないですよ、ということ？)
* 1,2,3の合わせ技
  * 例: `ETag と concurrency の保証は選択した Dapr state-store component に依存します`
* 4.否定的な材料（読むうえで必要としない知識）が素の文章で出てくる
  * 例: `リソースは byte の読み書きを行うだけで、レイヤー、merge、provenance、schema、migration、query/ORM は実装しません。`
  * 例: `変更 watcher とキー間 transaction はありません。`

要するに

* **頭が良すぎる。**
  * Dapr・ETagの知識なんて当然知っているので解説なんてしない。
  * 日本語も英語も万能なので交ぜ書きする。
  * 頭が良すぎるので、文字数を節約するために謎の日本語訳を始める(契約・保証・疑似など)
* **メタ認知が低すぎる。**
  * 読者のことを思いやるという気持ちはない。
  * 文章として読むことをしないので、突然話が飛ぶし、入れなくていい否定的な話を始める。
* **事実・背景を大事にしすぎる**
  * "実装がない"とか"対処不要なので除外した"みたいな（いらない）背景まで文面に残す
  * これは自分自身が背景情報を知りたすぎる故に発生してるのかなと思っている

癖があると思っています。

## 日本語が終わっていないモデルが欲しい

Gemini 3.8 Flashがいいらしい。

https://x.com/izutorishima/status/2100299957043638605

実際仕事で触った感触としてはとても良かった。
が、契約してないと使えない（と思っている）ので代替案を探そう、という取り組み。

## 調査方法

自分が現在開発している[ライブラリ](https://github.com/arika0093/Configlue)について、以下の方法で要約文を作成させた。

1. [利用可能なモデル一覧](#調査対象)を取得(`opencode models`)し、重複・古いものを削除
2. 適当なLLMにライブラリのcontextを収集させ、これを唯一の情報源とする
3. 各LLMに上記テキストを渡して、簡単な要約文を作成させる
4. この文章を人間（著者）が読んで、良し悪しを判定する

## 調査対象
[OpenCode Go](https://opencode.ai/go)で2026/09/29時点で使えるモデル。

## 実験
以下の3実験を試してみた。

### その1
まずは全部をAIに任せる。Deepseek v4.1 flashが生成した↓クエリを投げる。

```md
あなたは技術ドキュメントライターです。添付の context.md は .NET ライブラリ「Configlue」の調査メモです。これを唯一の情報源として、Configlue の README に載せる日本語解説を作成してください。

要件:
- 構成は「概要」「主な特徴」「基本的な使い方」の3部のみにすること。
- 見出し・本文・説明は自然で読みやすい日本語にすること。専門用語は無理に訳さず、カタカナや英語のまま使ってよい。
- コード例は context.md にあるものをそのまま引用してよい。コード内コメントは英語のままでよい。
- context.md に書かれていない事実を創作しないこと。
- 出力は Markdown 本文のみ。前置き・後書き・「以下が回答です」等の説明・作業ログは一切書かないこと。
- ファイルを書き込んだりツールを使ったりせず、最終メッセージとして Markdown をそのまま出力すること。
```

context.mdは[GitHub上](https://github.com/arika0093/opencode-llm-japanese-arena/blob/main/context.md)に置いてあります。

### その2
context.mdはそのまま、プロンプトを以下の1文のみに変更。

```md
添付の context.md は .NET ライブラリ「Configlue」の調査メモです。これを唯一の情報源として、Configlue の README に載せる日本語解説を作成してください。
```

### その3
その1，その2ともに文章・添付が両方日本語だったので、英語に変更。

```md
The attached context.md is a research memo on the .NET library "Configlue". Using it as the only source of information, create a Japanese explanation to include in Configlue's README.
```

## 実行結果

結果をここに貼ると長すぎるので、↓を参照。

https://github.com/arika0093/opencode-llm-japanese-arena

## 観察
### ざっと眺めた感想

* 大体のモデルは渡されたcontext.mdの構造に引っ張られている（文面もそのままだったり）
  * 安いモデルが中心なのである程度は仕方ないが…
* 意外とGPTの文章が（相対的に）きれい。
  * 安いモデルが中心なので(略)

### 簡易調査
全部読むのもめんどくさいので、個人的に大事にしたい5項目+[japanese-tech-writing skill](https://gist.github.com/k16shikano/fd287c3133457c4fd8f5601d34aa817d)から4項目を抽出して、Deepseekに採点させた。


| 区分 | 軸 | ★5 | ★1 |
| --- | --- | --- | --- |
| 著者が大事とするポイント | **① context非依存** | 独自の導入・再構成で読み手を意識 | context.md の見出し・順序・文言をなぞるだけ |
| | **② 日英混在回避** | 不自然な混在なし（専門用語の英語・カタカナは許容） | 不自然な英文・中国語・韓国語などの混入 |
| | **③ 直訳回避** | 「退役」等の直訳語・誤訳なし | 直訳語や誤訳が目立つ |
| | **④ 初見理解** | 初見（初級者）でも理解できる | 前提知識なしではほぼ理解不能 |
| | **⑤ 否定的背景の除去** | 否定的背景をほぼ含まない | 冒頭から免責・否定が唐突に並びノイズになる |
| 文章規範準拠（重複しない項目） | **⑥ 構成・論証** | 一段落一トピック・トピックセンテンス・論証が一方向 | 箇条の羅列・論証の断絶 |
| | **⑦ 読み手負荷の管理** | 用語を定義してから使い、不要な固有名を出さない | 未定義語・識別子の氾濫 |
| | **⑧ 演出抑制** | 太字/emダッシュ・決め台詞を節度をもって使う | 太字・emダッシュ・決め台詞が過剰 |
| | **⑨ 見出しの具体性** | 内容を特定できる見出し | 無情報見出し・成果物なし |

* 1の`context非依存`は、要するに渡された要約文章をそのまま訳してないよね、わかりやすくしてるよね、の視点。
* 5は、特にGPT系がよくやりがちな「XXは使っていません」みたいなのをそのまま出すな、の話。

### 結果
run3(全部英語)の結果:

| 順位 | モデル | ① | ② | ③ | ④ | ⑤ | ⑥ | ⑦ | ⑧ | ⑨ | 合計 | メモ |
| :---: | --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| 1 | opencode-muse-spark-1.3-contributor-free | ★5 | ★3 | ★3 | ★4 | ★3 | ★5 | ★4 | ★5 | ★5 | **37** | 独自見出しで論証明快。英単語混入と「閉じ」 |
| 2 | opencode-go/hy4-preview | ★5 | ★5 | ★2 | ★4 | ★2 | ★4 | ★4 | ★4 | ★5 | **35** | 独自目次・表で再構成。退役/読み取り面の直訳 |
| 3 | opencode-go/qwen3.8-max | ★4 | ★3 | ★2 | ★4 | ★2 | ★5 | ★5 | ★4 | ★5 | **34** | 目次整備で構成良。退役・来歴の直訳 |
| 4 | opencode-go/space-bunny-free | ★4 | ★3 | ★3 | ★5 | ★2 | ★5 | ★4 | ★3 | ★5 | **34** | 「読み取り面」を回避し「廃止」。太字・英単語混入 |
| 5 | opencode-go/kimi-k3 | ★3 | ★5 | ★2 | ★4 | ★2 | ★3 | ★4 | ★4 | ★5 | **32** | context順を概ね踏襲。「退避」「読み取り面」 |
| 6 | opencode-go/muse-spark-1.3-contributor | ★4 | ★4 | ★2 | ★4 | ★2 | ★4 | ★4 | ★4 | ★4 | **32** | 独自導入・再構成。「引退」「読み取り面」 |
| 7 | opencode-go/longcat-2.5-preview-free | ★3 | ★5 | ★2 | ★4 | ★3 | ★3 | ★3 | ★4 | ★5 | **32** | 冒頭免責なし・制限のみ。引退/読み取り画面 |
| 8 | opencode-longcat-2.5-preview-free | ★3 | ★4 | ★2 | ★3 | ★4 | ★4 | ★4 | ★4 | ★4 | **32** | 冒頭免責なし・制限1箇所のみで抑制 |
| 9 | opencode-go/gpt-6-luna | ★4 | ★4 | ★2 | ★4 | ★3 | ★4 | ★4 | ★2 | ★4 | **31** | 免責を末尾に集約。emダッシュ多用 |
| 10 | opencode-mimo-v2.6-flash-free | ★4 | ★4 | ★2 | ★4 | ★2 | ★4 | ★3 | ★4 | ★4 | **31** | 独自導入ありだが節順はcontext踏襲 |

残念ながら③(直訳回避)、⑤(否定的背景の除去)が高いやつはほぼ無かった。ので、ここはスキル等で制約を付ける必要がありそうな印象。

とりあえず

* muse-spark-1.3-contributor
* hy4-preview
* qwen3.8-max
* kimi-k3

あたりが良さそうなので深堀りする。

### 各モデルごとの所感

* [muse-spark-1.3-contributor](https://github.com/arika0093/opencode-llm-japanese-arena/blob/main/run3/output/opencode-go-muse-spark-1.3-contributor.md)
  * 文章としてはまあ読める。
  * ただ、元の調査結果を引きずった構成でやや読みにくい。
  * GPTと同じような微妙さが残っている印象。
  * なお、free版が謎に評価が高かったが中身としてはほぼ同一。
* [hy4-preview](https://github.com/arika0093/opencode-llm-japanese-arena/blob/main/run3/output/opencode-go-hy4-preview.md)
  * 構成がかなり読みやすい。
  * 少々冗長な記述がある気はする。
  * 後半部分がくどい。
* [qwen3.8-max](https://github.com/arika0093/opencode-llm-japanese-arena/blob/main/run3/output/opencode-go-qwen3.8-max.md)
  * 目次が整備されて読みやすい
  * 文章は自然。
  * 箇条書きの傾向がある
* [kimi-k3](https://github.com/arika0093/opencode-llm-japanese-arena/blob/main/run3/output/opencode-go-kimi-k3.md)
  * 元の調査結果を引きずった構成でやや読みにくい。
  * それ以外は概ね文句なし。
* [gpt-6-luna](https://github.com/arika0093/opencode-llm-japanese-arena/blob/main/run3/output/opencode-go-gpt-6-luna.md)
  * 意外にも読みやすい。
  * 今回は自分で調査してないのが良かったのかもしれない。
    * 多分自己調査したら全部書きたくなっちゃうタイプだろうから。。。
    * あとはコンテキストが長くなると混乱しちゃうのはあるかも。

## まとめ

* hy4-previewが結構いい。
* gptも意外と書ける。ただしガチガチに制御して別contextでやったほうがいい。
* Geminiを使おう。

