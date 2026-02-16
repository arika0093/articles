---
title: "【C#】dotnet app.cs(File-based apps)のメモ+罠ポイント"
pubDatetime: 2026-02-17T00:13:43+09:00
published: true
tags: ["csharp", "dotnet"]
zenn:
  published: true
  emoji: "📖"
  type: "tech"
---

.NET 10で、`dotnet app.cs`のように、C#ファイルを直接実行できる機能が追加されました🎉 公式での呼称は「File-based apps」です。

機能面の概要は

* [ここ(MS Learn)](https://learn.microsoft.com/en-us/dotnet/core/sdk/file-based-apps)とか
* [ここ(MSのアナウンス)](https://devblogs.microsoft.com/dotnet/announcing-dotnet-run-app/)とか
* [このあたり(解説記事)](https://andrewlock.net/exploring-dotnet-10-preview-features-1-exploring-the-dotnet-run-app.cs/)
 
を見てもらえば良いので、ここでは実際に使ってみて気づいた点をまとめておきます。
なお、`.NET 10.0.2`で確認しています。

## 概要
おさらいです。

`dotnet run app.cs` あるいは `dotnet app.cs` とすることで、C#ファイルを直接実行できます。

```csharp
#!/usr/bin/env dotnet
// echo dotnet version
Console.WriteLine($"dotnet version: {Environment.Version}");
```
![1](image.png)

パッケージを使いたい場合は`#:package (パッケージ名)@(バージョン)`の記法を使えます。

```csharp
#:package Humanizer@2.14.1
using Humanizer;

var dotNet9Released = DateTimeOffset.Parse("2024-12-03");
var since = DateTimeOffset.Now - dotNet9Released;
Console.WriteLine($"It has been {since.Humanize()} since .NET 9 was released.");
```
![2](image-1.png)

なお、どうせ使い捨ての実行であることが多いと思うので、パッケージは`@*`で最新版を使うのが便利です。

```csharp
#:package Humanizer@*
```

指定無しで最新版使ってくれよという[Issueも立ってます](https://github.com/dotnet/sdk/issues/49779)。.NET11で入るかも？

Preview 6以降ではプロジェクト参照が使えるようになっています。作ったライブラリの動作確認に使えるのでとてもありがたい！
ディレクトリ指定でも利用可能なのも嬉しいですね。

```csharp
#:project ../MyLibrary/MyLibrary.csproj
// または
#:project ../MyLibrary
```

## 罠ポイント
### 標準でNativeAOT
リフレクションをうっかり使うと死にます。
そんなの使わないよと思うかもしれませんが、例えば`System.Text.Json`等のシリアライズは既定ではリフレクションを使うので普通にコケます。

もちろん明示的にOffにできますが、Onで動くコードを書くように努めたほうが良さそうです。

```csharp
// Offにするとき
#:property PublishAot=false
```

### ビルドキャッシュに注意
特にプロジェクト参照をしているときに注意が必要だと思います。標準では以下の内容で出力をキャッシュしています。

* Source file content.
  * 要するにファイルの中身。それはそう。
* Directive configuration.
  * `#:package`や`#:project`などの構成内容
* SDK version.
  * ビルドに使ったSDKのバージョン。これも当然。
* Implicit build file existence and content.
  * これは`Directory.Build.props`や`nuget.config`などの話。

参照プロジェクトだけをビルドし直した場合、変更が反映されずにあれ？となります。AIもこれに戸惑っていたので注意したほうが良さそうです。
なお、以下のコマンドで明示的にビルドし直せます。

```bash
dotnet clean file-based-apps
# or
dotnet clean file.cs
dotnet build file.cs
```

### Analyzerを参照できない
アナライザーやSourceGeneratorはそのままだと(現時点では)参照できません。
`ExcludeAssets`等を指定することができないという文法上の話ですね。

回避策としては、`Directory.Build.props`は使えるのでそこにProjectReferenceを追加します。
(あるいは、普通にprojectに移行する)

対応する予定はあるっぽいので期待。実施される場合は`#:package (package)@(version) ExcludeAssets=runtime PrivateAssets=all`のような構文になりそう。

https://github.com/dotnet/sdk/issues/52399


## 最新機能のウォッチ
色々な人が記事として取り上げてくれているのはいいんですが、大体が.NET 10 Preview 4の時点で止まっているのが悲しみ……。公式は公式で微妙に内容がないし。
というわけで、[公式Issues](https://github.com/dotnet/sdk/issues?q=state%3Aclosed%20label%3A%22Area-run-file%22)のウォッチをしたほうが良さそうです。

* [人気がありそうなIssue](https://github.com/dotnet/sdk/issues?q=label%3A%22Area-run-file%22%20is%3Aissue%20comments%3A%3E5)
* [上記のうちOpenなやつ](https://github.com/dotnet/sdk/issues?q=label%3A%22Area-run-file%22%20is%3Aissue%20comments%3A%3E5%20state%3Aopen)