---
title: 【Blazor】URL絡みの諸々を効率化するライブラリを作りました【Source Generator】
emoji: "🌐"
type: "tech"
topics:
  - "dotnet"
  - "blazor"
  - "sourcegenerator"
published: true
published_at: "2024-12-16"
---

## 前書き
皆さんは最近流行りのBlazorについて既にご存知です。文章量が減って助かりました。

Blazorは

* C#で現代的なWebが書ける（これは人によるが、自分のチームには嬉しい）
* サーバーとクライアントの垣根が薄い(Blazor Serverの場合)ので、色々な処理を割とそのまま書ける
* C#のリフレクションと相性が良く、テーブルコンポーネントなどをとても手軽に使える
* (Blazor Serverの場合)常時通信しているので、DB監視して何かしたりするリアルタイムもどきも既存スタックに手を加えずにやりやすい
* 難解なReactやTypescriptを教えなくてもメンバーをアサインできる

あたりが今のところ嬉しいです。細々とした組織としてはReactﾜｶﾗﾅｲ人間も戦力化したいですからね。そもそも自分もよく分からないし。

あとはMicrosoftが推してるので10年ぐらいはなんだかんだ生き残ると思われます。

個人的唯一の欠点は流行ってないことです。流行ってほしい。

## モヤモヤポイント
そんなBlazorですが、~~流行ってないが故に~~ 気になるポイントがいくつかあります。

### リダイレクト時にベタ書きする必要がある
基本的には型安全で書けます。C#は静的型付け言語なんだからそれはそう。
ただ、型安全が微妙に甘い部分があります。
URLです。

これは他の言語でもそうですが、基本的にリダイレクトする時は

```csharp
// @inject NavigationManager NavigationManager
var count = 0;
NavigationManager.NavigateTo($"/hoge/fuga/{count}");
```

です。typoの可能性があったり、パラメータを文字列にして挿入したりと、型安全の要素がなくてモヤモヤします。
せっかくC#を使ってるんだから

```csharp
// @inject NavigationManager NavigationManager
var count = 0;
var url = Hoge_Fuga_Count(count); // -> "/hoge/fuga/0"
NavigationManager.NavigateTo(url);
```

みたいに書きたいですよね。

### メニュー生成が面倒
これも全言語で共通だと思いますが、メニュー構造を書くのは普通にめんどくさいです。

:::details 長いので折りたたみ

```jsx
<FluentStack Orientation="Orientation.Horizontal" Width="100%">
    <div>
        <FluentNavMenu @bind-Expanded="@Expanded" Width="250" Collapsible="true" CollapsedChildNavigation="@EnableCollapsedChildNavigation" Title="Collapsible demo">
            <FluentNavLink Icon="@(new Icons.Regular.Size24.Home())" Tooltip="Item 1 tooltip">Item 1</FluentNavLink>
            <FluentNavLink Icon="@(new Icons.Regular.Size24.Cloud())" Disabled="true" Tooltip="Item 2 tooltip">Item 2</FluentNavLink>
            <FluentNavGroup Title="Item 3" Tooltip="Item 3 tooltip" Icon="@(new Icons.Regular.Size24.EarthLeaf())" >
                <FluentNavLink Icon="@(new Icons.Regular.Size24.LeafOne())" Tooltip="Item 3.1 tooltip">Item 3.1</FluentNavLink>
                <FluentNavLink Icon="@(new Icons.Regular.Size24.LeafTwo())" Disabled="true" Tooltip="Item 3.2 tooltip">Item 3.2</FluentNavLink>
                <FluentNavGroup Title="Item 3.3" Tooltip="Item 3.3 tooltip" Icon="@(new Icons.Regular.Size24.LeafThree())">
                    <FluentNavLink Icon="@(new Icons.Regular.Size24.Earth())" Href="https://microsoft.com" Tooltip="Item 3.3.1 tooltip">https://microsoft.com</FluentNavLink>
                </FluentNavGroup>
                <FluentNavGroup Title="Item 3.4" Tooltip="Item 3.4 tooltip" Icon="@(new Icons.Regular.Size24.TreeDeciduous())" Disabled="true">
                    <FluentNavLink Icon="@(new Icons.Regular.Size24.Earth())" Href="https://microsoft.com" Tooltip="Item 3.4.1 tooltip">https://microsoft.com</FluentNavLink>
                </FluentNavGroup>
            </FluentNavGroup>
            <FluentNavLink Tooltip="Item 4 tooltip">Item 4</FluentNavLink>
            <FluentNavGroup Title="Item 5" Tooltip="Item 5 tooltip">
                <FluentNavLink Icon="@(new Icons.Regular.Size24.LeafOne())" Tooltip="Item 5.1 tooltip">Item 5.1</FluentNavLink>
            </FluentNavGroup>
            <FluentNavLink Icon="@(new Icons.Regular.Size24.CalendarAgenda())" Disabled="true" Href="https://microsoft.com" Tooltip="Item 6 tooltip">Item 6</FluentNavLink>
        </FluentNavMenu>
    </div>
</FluentStack>
```

:::

こんな感じ。ちなみにこの例は[FluentUIのサンプル](https://www.fluentui-blazor.net/NavMenu#collapsible-navigation-example)から引っ張ってきました。
URLは分かってるはず（ページコンポーネント作成の時点で明示的に指定してる）なのだから、**そのURL構造を元に勝手にメニュー構造を作ってくれてもいいですよね？**

一応これをやってくれるフレームワークもありますが、結局元になるオブジェクトは自前で準備しないとですし、見た目の調整もあまりできません。

### `@page`には文字列ベタ書きしか出来ない
要するに`const string`で定義した定数を使えません。

```html
<!-- const string ConstVar = "/"; がいたとして -->
<!-- これはできない -->
@page ConstVar
```

[Issueにも上がってます](https://github.com/dotnet/razor/issues/7519)が、修正される気配は無いです。
これに関しては抜け道もあって、`@attribute [Route(ConstVar)]`で対応できます。
が、これを書くのは普通に長くて面倒ですね。

### パラメータを受ける変数を手書きする必要がある
例えば`/hoge/fuga/{val:int}`と書いた場合、

```csharp
[Parameter]
public int Val {get;set;}
```
が必要です。これが無いとパラメータを受けられません。というわけで、これを各コンポーネント毎に頑張ってパラメータの数だけ書く必要があります。型安全の代償です。
この時点でもめんどくさいですが、書き忘れたり型を間違えても特に何も教えてくれないところです。
これも **URL的に分かってるのだからいい感じにやってくれないかなあ** とあなたは感じました。

### クエリパラメータの指定が煩雑
パラメータ部分はURLを見ればまだ分かりますが、クエリパラメータの指定は普通に面倒です。
具体的にはこう書く必要があります。

```csharp
[SupplyParameterFromQuery]
public string Query { get; set; } = "hello";
[SupplyParameterFromQuery]
public int Page { get; set; } = 0;
[SupplyParameterFromQuery]
public bool? Opt { get; set; } = null;
```

`SupplyParameterFromQuery`って入力するの **めちゃくちゃ嫌** じゃないですか？
宣言部分はまだいいですが、URLを組み立てる部分はとっても微妙です。

```csharp
// @inject NavigationManager NavigationManager
NavigationManager.GetUriWithQueryParameters(new Dictionary<string, object?>() {
    ["Query"] = "test",
    ["Page"] = 120,
    ["Opt"] = false,
});
```

どうですか？自分はあまり書きたくないです。
そもそもこの`Query`とか`Page`が有効な保証は無いし、そいつの型も`object?`。嫌ですね。
クエリで受け取りたいデータ型のclassを指定したらそこから勝手に組み立てて欲しいなあ……

## 作りました
そういうわけなので、作りました。
上記の課題を手軽に解決できるよう設計されています。


### 使い方
まずはURLの一覧をこのように宣言します。

```csharp
public partial class WebPaths
{
  // public const string (VariableName) = "/your-path";
  public const string Index = "/";
  public const string Sample = "/sample";
  public const string SampleChild = "/sample/child";
  public const string Counter = "/counter";
  public const string CounterWithState = "/counter/{count:int}";
  public const string CounterWithQuery = "/counter/query";
}
```


「こんなの書かないといけないの？`@page`から勝手に拾ってよ」という向きもあるかと思います。
し、実際その思想で作られたライブラリはすでにあるのですが
* 結局後で設定を書かないといけない(主にメニュー関連)
* razorの仕様的に両立できない（後述。上記ライブラリはrazorファイルの動的生成をオフにする=ホットリロードを無効にしないと使えません）

ので最初からこっちの方が良いと判断しました。
副産物として、URL定義がファイル一個にまとまって個人的には見やすいです。


次に、以下のように属性を追記します。

```csharp
using BlazorPathHelper;

[BlazorPath]
public partial class WebPaths
{
  [Item("TopPage"),  Page<Home>]
  public const string Index = "/";
  [Item("Sample1a"), Page<Sample>]
  public const string Sample = "/sample";
  [Item("Sample1b"), Page<SampleChild>]
  public const string SampleChild = "/sample/child";
  [Item("Sample2a"), Page<Counter>]
  public const string Counter = "/counter";
  [Item("Sample2b"), Page<Counter2>]
  public const string CounterWithState = "/counter/{count:int}";
  [Item("Sample2c"), Page<Counter3>, Query<QueryRecord>]
  public const string CounterWithQuery = "/counter/query";
}

public record QueryRecord(string query = "hello", int page = 0, bool? opt = null);
```

`Home`とか`Sample`はURLが紐づくコンポーネントの型です。

色々生えてきましたので説明しますと、`[BlazorPath]`は必須です（ジェネレーターがこの属性の配下を探すようになっています）
`[Item("ページ名")]`は省略することもできますが、メニューの名前が変数名のままになるので基本はつけることになります。ここにアイコン情報等を足していくこともできるようになっています。
`[Page<Component>]`は省略可能です。URLがどのページコンポーネントに紐づくかを指定します。
`[Query<QueryRecord>]`も省略可能です。クエリをclassから作るのにあたって、どのクラスを元にしたらいいのか？を教えるための属性です。

上記のように書いて保存すると、以下の要素が自動で生成されます。

:::details 長いので折りたたみ

これでもいくつか省略してあります。

```csharp
// <auto-generated />
public partial class WebPaths
{
  // ① URLビルダー
  public partial class Helper
  {
    public static string Index() => "/";
    public static string Sample() => "/sample";
    public static string SampleChild() => "/sample/child";
    public static string Counter() => "/counter";
    public static string CounterWithState(int Count)
      => string.Format("/counter/{0}", ToStringForUrl(Count));
    public static string CounterWithQuery(QueryRecord __query)
      => string.Format("/counter/query{0}", BuildQuery([
        ToEscapedStrings("query", __query.query),
        ToEscapedStrings("page", __query.page),
        ToEscapedStrings("opt", __query.opt)
      ]));
  }

  // ② メニュー構造データ
  public static readonly BlazorPathMenuItem[] MenuItem = [
    new BlazorPathMenuItem(){ 
      Index = 0,
      GroupKey = "",
      GroupIndex = 0,
      GroupLevel = 0,
      Name = "TopPage",
      Path = "/",
      Icon = null,
    },
    new BlazorPathMenuItem(){ 
      Index = 1,
      GroupKey = "",
      GroupIndex = 1,
      GroupLevel = 0,
      Name = "Sample1a",
      Path = "/sample",
      Icon = null,
      Children = [
        new BlazorPathMenuItem(){ 
          Index = 2,
          GroupKey = "/sample",
          GroupIndex = 0,
          GroupLevel = 1,
          Name = "Sample1b",
          Path = "/sample/child",
          Icon = null,
        }
      ]
    },
    new BlazorPathMenuItem(){ 
      Index = 3,
      GroupKey = "",
      GroupIndex = 2,
      GroupLevel = 0,
      Name = "Sample2a",
      Path = "/counter",
      Icon = null,
    }
  ];
}

// ③ Route等の自動生成
[Route("/")]
public partial class Home;

[Route("/sample")]
public partial class Sample;

[Route("/sample/child")]
public partial class SampleChild;

[Route("/counter")]
public partial class Counter;

[Route("/counter/{count:int}")]
public partial class Counter2
{
  [Parameter]
  public int Count { get; set; }
}

[Route("/counter/query")]
public partial class Counter3
{
  [SupplyParameterFromQuery]
  public string Query { get; set; } = "hello";
  [SupplyParameterFromQuery]
  public int Page { get; set; } = 0;
  [SupplyParameterFromQuery]
  public bool? Opt { get; set; } = null;
}
```

:::


### 生成されたもの①
まず1つ目に生成されたのはURLビルダーです。

```csharp
public partial class WebPaths
{
  public partial class Helper
  {
    // パラメータ付きの場合
    public static string CounterWithState(int Count)
      => string.Format("/counter/{0}", ToStringForUrl(Count));
    // クエリ付きの場合
    public static string CounterWithQuery(QueryRecord __query)
      => string.Format("/counter/query{0}", BuildQuery([
        ToEscapedStrings("query", __query.query),
        ToEscapedStrings("page", __query.page),
        ToEscapedStrings("opt", __query.opt)
      ]));
  }
}
```

これは見たままですね。format関数でURLを生成してるだけです。
`BuildQuery`とか`ToEscapedStrings`とかなんか色々ついてますが、これは要するにクエリパラメータをこねくり回してURL文字列に起こしてるだけなのであまり気にしないでください。

使い方は↓のようになります。

```csharp
var counterStateUrl = WebPaths.Helper.CounterWithState(1);
var counterQueryUrl1 = WebPaths.Helper.CounterWithQuery(new());
var counterQueryUrl2 = WebPaths.Helper.CounterWithQuery(new() { query = "test" });
var counterQueryUrl3 = WebPaths.Helper.CounterWithQuery(new() { query = "foo", page = 1, opt = true });

Console.WriteLine(counterStateUrl);  // -> "/counter/1"
Console.WriteLine(counterQueryUrl1); // -> "/counter/query?query=hello&page=0"
Console.WriteLine(counterQueryUrl2); // -> "/counter/query?query=test&page=0"
Console.WriteLine(counterQueryUrl3); // -> "/counter/query?query=foo&page=1&opt=true"
```

ともあれ、これで型安全にURLを生成することができるようになりました。

### 生成されたもの②
2つ目に生成されたのはメニュー構造データです。

```csharp
public partial class WebPaths
{
  public static readonly BlazorPathMenuItem[] MenuItem = [
    // 一部略
    new BlazorPathMenuItem(){ 
      Index = 1,          // メニュー全体でユニークなNo
      GroupKey = "",      // 親グループ。標準は一つ上の要素（例えば /foo/bar だったら /foo）
      GroupIndex = 1,     // グループ内のIndex
      GroupLevel = 0,     // グループの深さ
      Name = "Sample1a",  // [Item]属性で指定した名前
      Path = "/sample",   // URL
      Description = null, // [Item]属性で指定した説明文
      Icon = null,        // [Item]属性で指定したアイコン
      Children = [        // 配下のページ要素
        new BlazorPathMenuItem(){ 
          GroupKey = "/sample",
          Name = "Sample1b",
          Path = "/sample/child",
          // 以下同様...
        }
      ]
    },

```

メニュー名、説明文、アイコン、index情報、子要素など、おおよそ必要なデータが揃っています。

メニュー構造データは自動生成されますが、メニュー部分を作るのは自前です。
こうすることでどのフレームワークを使っていても無理なく組み込めます。

なお、URLパラメーターが必要なページ（上記例でいうところの `CounterWithState` など）については自動でメニュー一覧から外れます。

### 生成されたもの③
3つ目に生成されたのは、各ページ毎のRoute+Parameter+Queryの定義です。

```csharp
// 略

[Route("/counter")] // これは `@page "/counter"`と書いたのと同じ
public partial class Counter;

[Route("/counter/{count:int}")]
public partial class Counter2
{
  [Parameter]
  public int Count { get; set; }
}

[Route("/counter/query")]
public partial class Counter3
{
  // クラス定義で指定した初期値をよしなに拾う
  [SupplyParameterFromQuery]
  public string Query { get; set; } = "hello";
  [SupplyParameterFromQuery]
  public int Page { get; set; } = 0;
  [SupplyParameterFromQuery]
  public bool? Opt { get; set; } = null;
}
```

この生成結果は上記①のURLビルダーと連動しているので、パラメータを追加/削除した際はこちらにも追記されます。
いちいちこれらを手書きしなくて良いのは嬉しいですね。

上記①〜③は独立しているので、一部のみを取り出して使うこともできます。



とまあこのような機能があるので、気になる方は↓を見てみてください。
https://github.com/arika0093/BlazorPathHelper


## 技術的な話
ここからは作成における技術的な話を書いていきます。というかこっちが本題です。

### SourceGeneratorとは
ソースジェネレーターの名前が示す通り、C#のソースコードをC#で吐き出せます。

今までC#でメタプログラミングをする場合は型情報をこねくり回してリフレクションしましょう、あるいは一歩進んでExpressionで式解析しましょうだったのが、そこにコードがあるならそいつを解析すればいいじゃんの発想に進化しています。
実際、BlazorPath属性をつけただけでいい感じにメニューを生成したりしてるのはこれのおかげです。

という感じでなかなか色々できそうなのですが、日本語の文献が少ないし分かりにくい！ 敷居が高いなあと思ったので備忘録を兼ねてメモしていきます。

### 貴重な参考文献の紹介

上記で文献がないとは書きましたが、先人の貴重な文献があります。
ここの記事はとても参考になりましたので、SourceGeneratorを組む予定がある方は **全部** 読んでください。
（全部読むとこのあとの説明は割と蛇足なのですが、そこは気にしない）

#### 日本語文献

- [C# Source Generator 開発チュートリアル](https://developer.aiming-inc.com/csharp/source-generator-tutorial/)
- [2022年(2024年)のC# Incremental Source Generator開発手法](https://neue.cc/2022/12/16_IncrementalSourceGenerator.html)
- [コード解析とコード生成](https://ufcpp.net/study/csharp/misc/analyzer-generator/)
- [[C#]VS2022を使用したSource Generator入門](https://zenn.dev/mkmonaka/articles/8b9c1a87e35313)
- [[更新] Source Generator を使って懐かしの AOP を作ってみる](https://qiita.com/TsuyoshiUshio@github/items/b42773afaa4a25c2af60)

#### 英語文献

- [Source Generators Cookbook](https://github.com/dotnet/roslyn/blob/main/docs/features/source-generators.cookbook.md)
    - dotnet公式のcookbook。全てが書いてある。この記事の内容もほぼすべて書いてある。
- [Using source generators to find all routable components in a Blazor WebAssembly app](https://andrewlock.net/using-source-generators-to-find-all-routable-components-in-a-webassembly-app/)
    - 実は今回作ったアプリはこのチュートリアルととても内容が類似している（後で気づいた）

### コード生成の流れ
ソースコード吐き出せるなんて便利じゃん、だけどRoslynなにそれ？な人（私みたいな）向けの説明です。

平たく説明すると、プロジェクト内に存在しているC#ソースコードの構文情報をRoslyn(C#構文パーサー)が教えてくれるので、それを解析しながらC#コードを吐き出す、が大筋の流れです。
なので、極論なんでもできるはできるんですが、Roslyn側で指定したらAttribute属性がついてるシンボルを丸ごと引っ掛けてくれる便利APIがあります（そしてこれ以外の方法は煩雑）
そのため、基本的には〇〇Attributeをユーザーに指定してもらって、それを手がかりに解析する流れとなります。

### 開発環境
2024年現在はVisual Studio 2022一択です。
VS2019だと一部機能が使えない(らしい)、Riderだと書けはしますがキャッシュ等の取り扱いが変なのか上手く動かないです。途中までRiderで書いてましたが挙動が狂ったので ~~仕方なく~~ VSに切り替えました。
そして.NET Compiler Platform SDKの導入も必要です。入れましょう。
このあたりは[neue.cc](https://neue.cc/2022/12/16_IncrementalSourceGenerator.html)先生を見ればだいたい書いてあります。

また注意ポイントとして、vs内部でキャッシュを効かせているのか、ソースを再生成しても出力が反映されていないことがあります。
なので、基本的にVisualStudioを閉じては開いて閉じては開く開発になります。ちょっとこれはどうにかしてほしい。

### プロジェクト構成について
まず使用フレームワークですが、`netstandard2.0`固定です。
古くて悲しいですがある程度は[PolySharp](https://github.com/Sergio0694/PolySharp)（ポリフィル）が何とかしてくれます。入れましょう。

これは日本語ではどこにも書いてなくてしばらく詰まったのですが、Generatorプロジェクトの中で定義したクラス等にはユーザーからはアクセス **できません** 。
すなわち、Generator内で定義したAttributeは参照できなくなります。
そうすると自作Attributeを起点に解析したいのにどうやったらいいの？となると思います。なりました。

結論としてはこのようにプロジェクトを分けます。

- BlazorPathHelper
  - 下二つのプロジェクトを参照するだけ
  - ユーザーがNuGetで導入するのはこいつ
- BlazorPathHelper.Core
  - Attribute定義を並べる
  - 生成したコードから呼び出す関数を書いておく
- BlazorPathHelper.Generator
  - コード生成をする
  - ここに書いたコードは他から呼べない

NuGet等に公開する時（ソースジェネレーターなんて作る時点で公開前提だとは思いますが）は上記3つを全部公開します。
(このフォルダ構成は[FastEnum](https://github.com/xin9le/FastEnum)を参考にさせてもらいました。)

さらにプロジェクト参照の方法も癖があります。
`.Generator.csproj`を開いて、以下のように参照を入れます。GitHub Issueの[このコメント](https://github.com/dotnet/roslyn/discussions/47517#discussioncomment-3542590)に感謝。
コメントの部分は外部ライブラリ(`Newtonsoft.Json`など)を使うときだけ外します。
(下の例では`Microsoft.AspNetCore.Razor.Language`を使おうとしたので`PKGMicrosoft_AspNetCore_Razor_Language`になってます)

```xml:BlazorPathHelper.Generator.csproj
<Project Sdk="Microsoft.NET.Sdk">
    <PropertyGroup>
        <TargetFramework>netstandard2.0</TargetFramework>
        <IsRoslynComponent>true</IsRoslynComponent>
        <AnalyzerLanguage>cs</AnalyzerLanguage>
        <IncludeBuildOutput>false</IncludeBuildOutput>
        <DevelopmentDependency>true</DevelopmentDependency>
        <IncludeSymbols>false</IncludeSymbols>
        <SuppressDependenciesWhenPacking>true</SuppressDependenciesWhenPacking>
        <GeneratePackageOnBuild>true</GeneratePackageOnBuild>
        <!-- <GetTargetPathDependsOn>$(GetTargetPathDependsOn);GetDependencyTargetPaths</GetTargetPathDependsOn> -->
    </PropertyGroup>
    <ItemGroup>
        <ProjectReference Include="..\BlazorPathHelper.Core\BlazorPathHelper.Core.csproj" GeneratePathProperty="true" PrivateAssets="all" />
        <None Include="$(OutputPath)\*.dll" Pack="true" PackagePath="analyzers/dotnet/cs" Visible="false" />
        <None Include="BlazorPathHelper.Generator.props" Pack="true" PackagePath="build" Visible="false" />
        <!-- <PackageReference Include="Microsoft.AspNetCore.Razor.Language" Version="6.*" GeneratePathProperty="true" PrivateAssets="all" /> -->
        <!-- <None Include="$(PKGMicrosoft_AspNetCore_Razor_Language)\lib\netstandard2.0\*.dll" Pack="true" PackagePath="analyzers/dotnet/cs" Visible="false" />-->
    </ItemGroup>
    <!--
    <Target Name="GetDependencyTargetPaths">
	    <ItemGroup>
			<TargetPathWithTargetPlatformMoniker Include="$(PKGMicrosoft_AspNetCore_Razor_Language)\lib\netstandard2.0\*.dll" IncludeRuntimeDependency="false" />
	    </ItemGroup>
    </Target>
    -->
    <ItemGroup>
        <PackageReference Include="Microsoft.CodeAnalysis.Analyzers" Version="3.3.4">
            <PrivateAssets>all</PrivateAssets>
            <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
        </PackageReference>
		<PackageReference Include="Microsoft.CodeAnalysis.CSharp" Version="4.3.0" />
    </ItemGroup>
</Project>
```

この中に`BlazorPathHelper.Generator.props`というのがいます。これは以下のようなファイル構成です。
```xml:BlazorPathHelper.Generator.props
﻿<Project>
    <ItemGroup>
        <CompilerVisibleProperty Include="RootNamespace" />
    </ItemGroup>
</Project>
```
これはプロジェクトのルート名前空間を知りたいからよろしくってのをRoslynに指示する用のファイルです(と認識している)

そして、ローカルプロジェクト（動作検証用アプリなど）からは以下のように呼びます。
```xml:test.csproj
<Project>
    <ItemGroup>
        <ProjectReference Include="(relative-path)\BlazorPathHelper.Core\BlazorPathHelper.Core.csproj">
            <OutputItemType>Analyzer</OutputItemType>
            <ReferenceOutputAssembly>true</ReferenceOutputAssembly>
        </ProjectReference>
        <ProjectReference Include="(relative-path)BlazorPathHelper.Generator\BlazorPathHelper.Generator.csproj">
            <OutputItemType>Analyzer</OutputItemType>
            <ReferenceOutputAssembly>true</ReferenceOutputAssembly>
        </ProjectReference>
    </ItemGroup>
</Project>
```

こうしないと参照できてない扱いになります。(エラーも何もなく突然アプリが落ちるので本当に気づきにくい！)
わかりにくいですが、上記でいう`BlazorPathHelper`(ユーザーがNuGetで読み込む用のライブラリ)についてはそのまま参照でOKです。

```xml:BlazorPathHelper.csproj
<ItemGroup>
  <ProjectReference Include="..\BlazorPathHelper.Core\BlazorPathHelper.Core.csproj" />
  <ProjectReference Include="..\BlazorPathHelper.Generator\BlazorPathHelper.Generator.csproj" />
</ItemGroup>
```

これのせいで2日ぐらい溶かしましたので注意してください。

### ソース生成するコード
ソース生成部分は先人の記事がとても参考になるのでここでは省略します。
なお、生成部分ですが本当にそのままC#コードを吐き出します。インデントをよしなにしてくれる機能は無いので気になる方はめちゃくちゃ頑張って整形する必要があります。 ~~これも超めんどい~~
一般的な手順よりは引っかかりポイントのほうが役立つでしょうから、それを残しておきます。

### 自分的ハマりポイント
#### 1. `Attribute`属性をそのまま使えるわけではない
何言ってるんだ？という話ですが、思い出してください。
あくまでもこれは「ソースコードの解析結果」をよこしてくれるだけで、`Attribute`属性のオブジェクトをくれるわけではないです（コンパイルして実行するまでオブジェクトは存在しません！）
なので、例えば「引数が何個ある」とか「名前付き引数の`Name`は`"Hoge"`だよ」とかそういうのは教えてくれますが、
```csharp
var name = symbol.GetAttributes().FirstOrDefault(a => a.Name === nameof(XxxAttribute))?.Name;
```
みたいなオブジェクトアクセスは **できません。** また、

```csharp
class XxxAttribute(string name): Attribute
{
    public string Name {get;set;} = name;
}
```

みたいに書いてあると「`XxxAttribute("hoge")`と`XxxAttribute(Name = "hoge")`は等価だよなあ」と推測するのが普通ですが、**等価ではないです。**
もしこのように設計した場合は"引数の1個目"と"`Name`プロパティ"の両方を解析する必要があります。罠だ…

知ってる人的には当たり前ですが、私のような初学者が詰まらないために書き残しておきます。

#### 2. 他のソースジェネレータが吐き出した結果を参照できない
これもめちゃくちゃ気づきにくくて嫌らしい仕様なのですが、他のソースジェネレータが吐き出したクラスやメソッドにはアクセスできません（全てのジェネレーターが同時に動く=実行時点では対象のものは存在しない扱い）
これだけならまあそうだよねと思われるかもしれませんが、razorファイルをC#ソースコードに変換するのにもソースジェネレーターが使われています。（他には.NET7で導入された`GeneratedRegex`などがいます）

ということは、すなわち…

<br/>

`.razor`ファイルで定義されたページコンポーネントには触れません！ ＼(^o^)／ｵﾜﾀ
<br/>

一応`.razor.cs`ファイルで分割定義してくれていれば定義済なので色々触れますが、ユーザーに逐一それをしてもらうのは手間ってものです。

この仕様がなければもうちょっと色々できたのに…とは思います。
が、それを考えても仕方ないので対策を考えます。
<br/>

まず、razorファイルに書かなければいいじゃん！という発想です。普通に.csファイルに書かれさえすれば読めるわけなので、それを前提として設計します。
結果上記のように単一ファイルに書いてもらう設計になりました。
<br/>

基本的にはこれで良かったのですが、ページコンポーネントの要素自動生成をしたい時（上記`Page`属性）はこれだと不十分です。
というのも、`Page<Component>`と指定してもらう際、Componentがまだ存在しない可能性があります。（またしてもややこしいのが、Intellisense上はあたかも既に存在するかのように動きます）
すなわち、ソースジェネレーター内では「Component？そんな型は(現時点では)存在しないよ」として、新規オブジェクトのように振舞ってくることになります。
これの何が困るかと言うと、Componentが属する(はずの) **名前空間が分かりません。** なので、素直に実装すると

🤡「`Page<Component>`って書いてあるわ。じゃあComponentの名前空間教えて」
🤖「（未定義なので）globalです」
🤡「ほーんなるほど！じゃあ名前空間つけずに`partial class Component`……っと」
👧🏻「あれ？自動生成されたはずのComponent.〇〇がいないんだけど」

となります。なりました。
しかも自分で出力したクラスをIntellisenseが認識した結果 **あたかもglobal空間に存在するかのように見える** というおまけ付き。
<br/>
なので工夫が必要になります。
具体的に何をしたかと言うと、razorファイルを解析しました。
といってもコンパイルはしてません。

SourceGeneratorでは`AdditionalTextsProvider`を使うことでC#以外のファイルを拾うことができます。
これはC#以外のファイルを元にしたクラス生成などに使用できます。すなわち、razorファイルについても同じように拾えます。
というわけで、中身を拾って正規表現でnamespaceを解析することにしました。（コンパイルすると流石に遅そうと思ったのと、名前空間がほしいだけにしては大げさと判断）

```csharp:ParseRazorStructureFactory.cs
public static IncrementalValueProvider<ImmutableArray<ParseRazorStructure>> ParseRazorFiles(
    IncrementalGeneratorInitializationContext context)
{
    return context.AdditionalTextsProvider
        .Where(static i =>
            i.Path.EndsWith(".razor", StringComparison.OrdinalIgnoreCase) ||
            i.Path.EndsWith(".cshtml", StringComparison.OrdinalIgnoreCase))
        // 中略
        .Select((p, _) =>
        {
            var source = p.Text.GetText();
            // get namespace from source use regex
            // (it is pseudo-extracted with regular expressions.)
            var nsRegex = new Regex(@"@namespace\s+(?<namespace>[\w\.]+)");
            var nsMatch = nsRegex.Match(source?.ToString() ?? "");
            var ns = nsMatch.Success ? nsMatch.Groups["namespace"].Value : relativeNs;
            // 略
        })
        .Collect();
}
```

この後はファイル名(=クラス名)と名前空間を紐づけて検索してあげます。
これで名前空間を推測できるようになったので、後は生成するだけです。お疲れ様でした。

## 開発してみて
上記の内容を見てわかる通り落とし穴が多いです。これをどこかに書き残したい使命感が途中から芽生えてきていました。 ~~そして記事を書くにあたり各種ドキュメントを読み返したところ全て書いてありました~~
ただ、出来上がったライブラリは個人的にはかなり役立っているので、皆様も何か作ってみると良いかと思います。成果物を使う分にはかなり良い技術です。
そしてぜひハマりポイントを共有してください。お願いします。

ついでにBlazorもぜひ触ってみてください。こっちは普通におすすめです。


## 関連情報

- [Allow for a way to ensure some source generators run before / after others #57239](https://github.com/dotnet/roslyn/issues/57239)
    - 上述した同時生成の課題について、実行順序の機能要望（2021年）。なお「速度が非常に重要なので、いいやり方が思いつかない」と凍結状態。
- [Components added by a source generator work in code, but not in markup #32172](https://github.com/dotnet/aspnetcore/issues/32172)
    - 上記に関連して、razorが参照できねえよという質問。「暫定対応としてOpt-outの属性をつけました」という回答。
- [Reference local projects in Source Generator #47517](https://github.com/dotnet/roslyn/discussions/47517)
    - ローカルプロジェクトってどうやって参照すればいいの？の質問。
- [How should source generators emit newlines? #51437](https://github.com/dotnet/roslyn/issues/51437)
    - SourceGeneratorで改行の出力するときって`\r\n`か`\n`なのかわからんけど、どう取得すれば良い？という質問
    - `Environment.NewLine`は使用不可。
    - ちなみに方法は[ここ](https://github.com/dotnet/roslyn-analyzers/issues/6467#issuecomment-1450901760)にしれっと書いてある。
        - `SyntaxFactory.ElasticCarriageReturnLineFeed.ToString()`で取得可能。
