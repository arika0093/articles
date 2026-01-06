---
title: "【C#】SourceGeneratorを作成するときに気をつけるポイント"
emoji: "⚠️"
type: "tech"
topics: ["csharp", "dotnet", "sourcegenerator"]
published: false
---


## 最初に
### ドキュメントを読み込む
個人的おすすめは以下のあたり。

#### 公式
https://github.com/dotnet/roslyn/blob/main/docs/features/incremental-generators.md
https://github.com/dotnet/roslyn/blob/main/docs/features/incremental-generators.cookbook.md
https://github.com/dotnet/runtime/blob/main/docs/coding-guidelines/source-generator-guidelines.md
https://github.com/dotnet/runtime/blob/main/docs/coding-guidelines/libraries-packaging.md#analyzers--source-generators

#### 参考文献
https://andrewlock.net/series/creating-a-source-generator/
https://neue.cc/2022/12/16_IncrementalSourceGenerator.html
https://qiita.com/ry18847/items/15c979b67e0372c22f1d

このあたりを抑えておけば間違いない。が、初見だとあまりに未知の概念なので(普通のC#プログラミングとは性質が違う！)、これを理解するというのは難しいと思う。
なのでハマった落とし穴をこの下につらつらと書いていきます。上記の記事の目次代わりにはなるはず。。

### Increment Source Generatorについての基礎を抑える
**要約: 「Increment」の概念を抑えると後が楽になる。**

Incrementとはなんぞやという話。


https://andrewlock.net/creating-a-source-generator-part-9-avoiding-performance-pitfalls-in-incremental-generators/

### プロジェクト構造を決める


https://andrewlock.net/creating-a-source-generator-part-7-solving-the-source-generator-marker-attribute-problem-part1/
https://andrewlock.net/creating-a-source-generator-part-8-solving-the-source-generator-marker-attribute-problem-part2/

## コード記述時
### コード整形に`NormalizeWhitespace`を使わない



https://github.com/dotnet/roslyn/issues/52914

### Attributeからの取得以外を極力行わない
**要約: 基本的に`ForAttributeWithMetadataName`を使うべき。**

インターフェースやabstract classの自動実装みたいなことをしたくなるが、これはパフォーマンスが超悪化する。
* どの型が目的のインターフェースを実装しているかわからんので毎回フルスキャンが走る
* このスキャンがカーソル動かしたり1文字入力するたびに走って最悪になる

で、パフォーマンスド安定の`ForAttributeWithMetadataName`がいるのでそいつを使うべき。ということがcookbookに書いてある(2025/06に追加された模様)
https://github.com/dotnet/roslyn/blob/main/docs/features/incremental-generators.cookbook.md#do-not-scan-for-types-that-indirectly-implement-interfaces-indirectly-inherit-from-types-or-are-indirectly-marked-by-an-attribute-from-an-interface-or-base-type


### 3rd-partyライブラリを使うときは要注意
**要約: 外部ライブラリは使わないほうが無難。**

別プロセスで動作するから、成果物の中身に依存関係の生DLLを全部突っ込む必要がある。設定がめんどくさすぎる。

一応手順としては

1. `PackageReference`で対象のパッケージを追加する。
    * コード生成時のみ使うので `PrivateAssets`指定でユーザー側に依存が入らないようにする。
    * DLLコピーのために`GeneratePathProperty`を有効にする。
2. ライブラリのDLLを所定のパスにコピーする
    * `Include="$(Pkg*)\lib\netstandard2.0\*.dll"`の形で指定。
        * このPkgなんちゃらが上記のGeneratePathProperty指定で生えてくる。
    * もちろんライブラリに含めたいので`Pack=true`
    * `analyzers/dotnet/cs`に入れる。これは先述の生成物パスの話と同様。
    * 見せたくないので`Visible=false`。


例えば`Newtonsoft.Json`でやる場合はこんな感じ。

```xml
<Project>
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="12.0.1" PrivateAssets="all" GeneratePathProperty="true" />
    <None Include="$(PkgNewtonsoft_Json)\lib\netstandard2.0\*.dll" Pack="true" PackagePath="analyzers/dotnet/cs" Visible="false" />
  </ItemGroup>
</Project>
```

ただ、外部ライブラリが追加で依存関係を持ってたりするとそれも全部DLL参照を追加する必要がある。あんまりにも面倒なのでIssueが立っているが、修正される目処はなさそう。
https://github.com/dotnet/roslyn/issues/43903
コメント欄を見ると一応これを解決するライブラリもいくつかあるっぽい。

## デプロイ
### 成果物は`analyzers/dotnet/cs`に入れる必要がある
SourceGeneratorなんて作る時点で9割は公開するつもりだと思うので、ここも大事。



csprojに書くべきおまじないが大量にあるので、それらを抑えておく。上記の「プロジェクト構造」や「3rd-partyライブラリ」の内容も参考。

```xml



```

https://andrewlock.net/creating-a-source-generator-part-3-integration-testing-and-packaging/




