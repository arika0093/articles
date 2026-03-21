---
title: "LLMに狙ったコードを書かせるためにLinterを自作してみたら体験が良かった"
published: true
tags: ["dotnet", "AI", "source-generator", "linter"]
zenn:
  published: true
  emoji: "📐"
  type: "tech"
---

LLMにコードを書かせるとき、狙い通りに書かせるにはどうしたらよいか？
planを立てるとか、AGENT.mdで色々指示するとか、様々な方法があるとは思いますが、一番確実なのはやはりビルドエラーにすることでしょう。
LLMくんはビルドを完了させることがタスク完了の前提と強く思考する節があります。
これは言い換えれば、エラー条件をガチガチに制御することで、LLMくんに狙い通りのコードを書かせることができるということです。

というわけで、今回は狙い通りのコードを書かせるための方法についてです。

## どういった状況なのか

私はC#のSource Generatorというものをよく書きます。これはメタプログラミングの一種で、ユーザーが書いたコードを元に動的なコードを生成するものです。
それ自体の話は今回あまり重要でないので割愛しますが、ここで大事なのは「結構独特な書き方を要求される」ということです。

### 例1: 使用を推奨されるAPIがある

Source Generatorでは特定のAPIを介してユーザーが書いたコードを解析する必要があります。
この際、なんでもいいというわけではなく、基本的には属性(Attribute)がついたクラス・メソッドを拾うことになります。
なぜこんなことをするかというと、属性がついてるコードを効率よく検索できるAPIがあるからです。
言い換えると、属性がついてないコードを解析するとパフォーマンスが悪くなる可能性が高いです。その倍率、およそ100倍！

というわけなので極力そのAPIを使うようにしたいのですが、LLMは普通に汎用的な書き方（パフォーマンスが悪い方法）を使ってきます。[^1]
これは避けたいですよね。

[^1]: 属性を使用できないケース(関数呼び出しを上書きする場合など)もありますが、効率化できるケースでも汎用的な書き方をしてきます。


### 例2: キャッシュが効かない書き方を避けたい

Source Generatorは一種のイベント駆動パイプラインのようなもので、ユーザーがコードを書き換えるたびに何度も呼び出されます。
この際、同じコードを何度も解析することになるため、キャッシュが効かない書き方をされるとパフォーマンスが大幅に悪化します。

簡略化すると概ね以下のようなやり方でキャッシュを効かせています。

```csharp
// MyAttributeがついたクラスをして、そのクラスからSomeMetadataを抽出する処理
var firstCheck = context.SyntaxProvider.ForAttributeWithMetadataName(
    "MyAttribute",
    // 判定ロジック
    static (node, _) => node is ClassDeclarationSyntax,
    // データの抽出
    static (context, ct) => new SomeMetadata( /* ... */ )
);

// 最初に得られたデータを使って、さらに他のデータを抽出したり結合したり
// この際、firstCheckの値が変更されていなければその後ろも走らない（キャッシュが効く）
var secondCheck = firstCheck.Combine(/* 他のデータ */);
```

ここで、最初の値`firstCheck`が変更されない限り、後ろの処理は走らないようになっています。
この「変更されない」というのが厄介で、値の等価性によってチェックする仕組みです。普通にclassを生成すると参照等価性のチェックとなってしまい、毎回新規判定となってしまいます。

このため、値の等価性を正しく実装する必要があります。具体的には

* `record`/`struct`を使用する
* 中のメンバーも等価性を正しく実装する
* 配列も同様（例えば`List<T>`の代わりに自作の`EquatableArray<T>`を使用するなど）

ここでまた厄介なのが、Roslynの解析データ(`SemanticModel`, `Compilation`など)を直接クラス/レコードに突っ込むと、毎回新規判定になってしまうことです。
これらの解析データはデータ生成にとっても便利なので可能であれば最後まで持っていきたいのですが、それをやるとパフォーマンスが激悪のGeneratorになります。

ではどうするべきかというと、最初に必要な情報を全部抜いて`string`や`int`などのプリミティブな値に変換して格納します。
めんどくさいですね。

こんなのは知ってないとうっかりやってしまうので、もちろんLLMはよくないやり方（`SemanticModel`本体を最後まで引きずり回すやりかた）をしてきます。
やめさせたいですね。

### 例3: ソースコード整形の方法も独特

これについては以前記事を書きました。

https://eclairs.cc/posts/2026/20260201/source-generator-use-indentbuilder/


Source Generatorはコードを文字列として生成するため、コードの整形も自分でやる必要があります。
この際、単純に文字列内にインデントを埋め込むと色々厄介な問題が発生するため、専用のビルダークラスを作って管理すると楽になります。

もちろん、LLMにとってはそんなのは知ったこっちゃないので、普通に文字列内にインデントを埋め込むやり方をしてきます。
やめさせたいですね。

---

とこのように落とし穴が大量にあります。正直人間が書いても普通にやらかす ~~ので設計がイケてない~~ のですが、これらをLLMに守らせるにはどうしたらよいか？

## linterを自作する
答えは、「上記のような構文を書いたら即エラーになるようにする」です。

例えば上記のSource Generatorの問題を対策するために、私は以下のようなLinterを作りました。

https://github.com/arika0093/lint4sg


> Source Generators have strict performance and correctness requirements that differ significantly from ordinary C# code. This analyzer catches common mistakes at compile time, acting as a safety net especially when AI coding assistants generate Source Generator code.

とあるように、ずばりLLMのためのLinterです。

[READMEのアナライザー一覧](https://github.com/arika0093/lint4sg?tab=readme-ov-file#analyzer-rules)を見るとわかるように、様々なルールを実装しています。

例えば上記例3の対策として、以下のようなコードをエラーにします。

```csharp
var sb = new StringBuilder();
sb.AppendLine("        public void Method()"); // error!
// インデントを直接埋め込んでいるのでエラーになる。
// 専用のビルダークラスを使用するように促す。
```

## linterの作り方

C#(dotnet)の場合は、LLMに「こんなアナライザーが欲しいんだけど」と伝えるだけです！

例えば、上記`lint4sg`は以下のようなプロンプトで雛形を作りました。

```
このプロジェクトはC#のコードAnalyzerです。普通のAnalyzerとは異なり、dotnetのSource Generatorプロジェクトを対象としています。

目的
Source Generatorには多数のSHOULD/MUST(NOT)が存在していますが、それらはLLMsには未知のルールです。skills.md等で指示することもできますが、より確実なのは(非常に厳しい)linterとしてプロジェクト参照に追加し、エラーによって行動を制約することです。

情報源
(ドキュメント記事の一覧)

上記に記載のある内容/指示をベースとします。

用意するべきルールセット。特に指定がない限り、全てエラーとして取り扱います。

* ISourceGeneratorの使用: IIncrementalGeneratorを使用するべき。
* ForAttributeWithMetadataName以外のSyntaxProviderの使用(警告): パフォーマンスの観点からFAWMNを極力使用する必要がある。場合により避け得ないパターンが存在するため、警告止まりとする。
* (以下略)
```

## 工夫したポイント

工夫したといっても実装は全てLLMがやったので、ライブラリ自体や指示出しの工夫として。

### 基本的にエラーにする

LLMに狙い通りのコードを書かせるためには、エラーにするのが一番確実です。
警告でも一応読んではくれますが、やはりエラーの方が強い動機付けになります。あとは警告だと`NoWarn`で消してきたりします。
（怠惰な人間と同じですね）

### メッセージに対処方法を書く

例えば上記インデントの例では、以下のようなエラーメッセージにしています。

> AppendLine/Append contains excessive whitespace indentation. Use a dedicated StringBuilder with indentation management instead.
> (訳): AppendLine/Appendに過剰な空白インデントが含まれています。インデント管理専用のStringBuilderを使用してください。

> Using 8+ consecutive spaces or 2+ consecutive tabs in AppendLine/Append calls indicates manual indentation management. Use IndentedStringBuilder or a similar utility for better maintainability.
> (訳): AppendLine/Append呼び出しで8つ以上の連続したスペースまたは2つ以上の連続したタブを使用すると、手動のインデント管理を示します。より良い保守性のためにIndentedStringBuilderなどのユーティリティを使用してください。

このように、エラーメッセージに対処方法を明示的に書いてあげると、LLMも「どうすればいいか」を理解しやすくなり、狙ったコードを書いてくれる可能性が高まります。

### まとめて修正できるようにする

基本的にターン制なので、1回のターンで複数のエラーを修正できるようにするのが望ましいです。

良くない例は、例えばA→Bの呼び出し方法を修正するとB→Cの呼び出し方法エラーが出て、それを修正すると今後はC→Dの呼び出し方法エラーが出る、というような連鎖的なエラーです。
これだと単純に時間がかかりますし、LLM側も修正を諦めてNoWarnに突っ込んだりする可能性があります。

より良い例は、A→Bの呼び出し方法エラーが出たときに、B→C, C→Dの呼び出し方法も同時にエラーになるようにすることです。
これをやるためには連鎖的に構文解析をするようにanalyzerを実装する必要があるので、そのようにLLMに指示を出すと良いです。

### READMEに修正用のプロンプト例を用意する

単純に一度用意しておけば後が楽なので。
例えば上記`lint4sg`のREADMEには、以下のような指示用プロンプトを置いています。

```
Please apply the lint4sg analyzer to this Source Generator project.
lint4sg is a strict Roslyn analyzer that detects patterns violating best practices for Source Generator code.
To ensure code quality and performance, please adhere to lint4sg's rules. Warnings and errors will be displayed in the format LSGxxx.
All warnings and errors must be addressed. For each issue, refer to the error message and the official README documentation for guidance on how to resolve it.

nuget: https://www.nuget.org/packages/lint4sg/
repository: https://github.com/arika0093/lint4sg
readme: https://raw.githubusercontent.com/arika0093/lint4sg/refs/heads/main/README.md
```

単純に、

* `lint4sg`をプロジェクトに追加して
* 出てきたエラーおよび警告を全部直して

と指示するだけです。


## 結果
今まではLLMが生成したコードを見て、上記のやらかしポイントを踏んでないか確認し、もしやってたら「ここを直して！」と毎回指示していました。
これが結構な手間だったのですが、Linterを入れてからは勝手に自走してくれるようになったので、かなり楽になりました。最初からやっておけばよかったと思うくらいです。

というわけで、LLMに狙ったコードを書かせるための方法として、Linterを自作するのはかなり有効な手段だと思います。
モデル性能の向上で自分用のlinterも簡単に作れるようになったので、ぜひ試してみてください。
