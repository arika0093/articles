---
title: "Source Generator Tips(#1): コード整形にIndentStringBuilderを使う"
pubDatetime: 2026-02-02T00:14:40+09:00
published: true
tags: ["csharp", "dotnet", "source-generator"]
zenn:
  published: true
  emoji: "💡"
  type: "tech"
---

Source Generatorの小技集みたいなものを不定期に書いていこうと思います。
今回はコード生成時の小テクニックです。

## TL;DR
コード整形機能を盛り込んだ`StringBuilder`ラッパーを作成し、それを使ってコード生成を行う。

## 課題
Source Generatorとは書いて字のごとく、ソースコードをプログラム的に生成する仕組みです。
なので、最も単純な形態は以下のようになります。[^1]

[^1]: こういった複数行にわたるソースコードを生成する場合、`$$"""..."""`のようなRaw String Literalを使うと便利です。

```csharp
// ソースコードを直接文字列で書く
var source = $$"""
    namespace GeneratedNamespace;

    public class GeneratedClass
    {
        public void GeneratedMethod()
        {
            // 何か処理
        }
    }
    """;

context.AddSource("GeneratedFile.g.cs", source);
```

とはいえ、実際にはもっと複雑なことをしたいことが多いと思います。

### 一例

例えば、上記の例では`GeneratedNamespace`に吐き出していましたが、ここをユーザーコードの名前空間に合わせることを考えてみます。

素朴に吐き出すと以下のようになりますが

```csharp
var namespaceName = GetNamespaceFromUserCode(parseRecordObject);

var source = $$"""
    namespace {namespaceName}
    {
        public class GeneratedClass
        {
            public void GeneratedMethod()
            {
                // 何か処理
            }
        }
    }
    """;
```

この場合、名前空間が無い場合(global直下の場合)に`namespace { ... }`となってしまい、コンパイルエラーになります。

ということで修正してみます。

```csharp
var namespaceName = GetNamespaceFromUserCode(parseRecordObject);
var sourceBase = $$"""
    public class GeneratedClass
    {
        public void GeneratedMethod()
        {
            // 何か処理
        }
    }
    """;
if (!string.IsNullOrEmpty(namespaceName))
{
    generatedCode = $"""
        namespace {namespaceName}
        {{
        {sourceBase}
        }}
        """;
}
else {
    generatedCode = sourceBase;
}
```

このようにすると…… 生成されたコードは以下のようになります。

```csharp
// 生成されたコード例
namespace MyApp.Models
{
public class GeneratedClass
{
    public void GeneratedMethod()
    {
        // 何か処理
    }
}
}
```

間違ってはいないですし、このままで問題なく動作しますが、コードのインデントが崩れています。

さらに内部処理の生成を別関数で実施したりすると、インデントがさらに崩れていきます。

```csharp
// 生成されたコード例
namespace MyApp.Models
{
public class GeneratedClass
{
    public void GeneratedMethod()
    {
var source = "Some processing";
if(CallAnotherMethod())
{
source += " More processing";
}
Console.WriteLine(source);
    }
}
}
```

## 対策
### その1: インデントをあらかじめ埋め込んでおく

こんなイメージです。

```csharp
// あらかじめインデントを埋め込んでコードを生成する
var generatedMethod = $$"""
        public void GeneratedMethod()
        {
            // 何か処理
        }
    """;
var source = $$"""
    public class GeneratedClass
    {
    {{generatedMethod}}
    }
    """;
```

確かに機能しますが、保守が辛くなっていきます。
また、上記のnamespaceのように、動的にインデントが変わる場合はさらに辛くなります。

### その2: 関数の結果に対して都度インデントを付与する

こんなイメージです。

```csharp
// 普通にコードを生成する(外部関数など)
var generatedMethod = $$"""
    public void GeneratedMethod()
    {
        // 何か処理
    }
    """;
// 生成したコードに対してインデントを付与（あるいは除去）する
var generatedMethodWithIndent = Indent(generatedMethod, 1);
// その結果を使用
var source = $$"""
    public class GeneratedClass
    {
    {{generatedMethodWithIndent}}
    }
    """;

// インデント付与関数の例
string Indent(string code, int indentLevel)
{
    const int spacesPerIndent = 4;
    var indent = new string(' ', indentLevel * spacesPerIndent);
    var lines = code.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None);
    for (int i = 0; i < lines.Length; i++)
    {
        lines[i] = indent + lines[i];
    }
    // Environment.NewLineは使えないので注意
    return string.Join('\n', lines);
}
```

この方法でも良いですが、都度呼び出しが必要なのがネックです。また、後述の方法のほうが読みやすいのでそちらを推奨します。

### その3: NormalizeWhitespaceを使う

RoslynのAPIに`NormalizeWhitespace`というコード整形機能があります。
```csharp
var tree = CSharpSyntaxTree.ParseText(generatedCode);
var formattedCode = tree.GetRoot().NormalizeWhitespace().ToFullString();
```

すごくうってつけの関数だと思いきや、実は**Source Generatorでは使ってはいけない**扱いをされている関数です。

https://github.com/dotnet/roslyn/issues/52914

上記Issueにもある通り、Source Generatorのパフォーマンスを著しく悪化させる原因となります。
そして、これを高速で実施する良い方法は提供されていません。

### その4: csharpierを使う
それならば……というわけで、要するに外部のコード整形ツールを使う方法です。
[csharpier](https://csharpier.com/)は.NET向けのコード整形ツールで、ライブラリとしても利用できます。

なので以下のように書けば良さそうに見えますが……

```csharp
var formattedCode = CSharpFormatter.Format(generatedCode).Code;
```

Source Generatorで外部ライブラリを使うのはとっても面倒です。
具体的にはパッケージの依存関係DLLをすべて生成物に含める必要があり、設定が非常に煩雑です。

ちなみにcsharpier自身の依存関係はこれだけあります（これらの依存的推移も全て含める必要があります）。
![](image.png)

というわけで、このアプローチも微妙です。

### その5: IndentStringBuilderを使う

上記のIssueにてメンテナーのCyrus Najmabadi氏が提案している方法です。

仕組みはすごくシンプルで、インデント管理機能を持った`StringBuilder`ラッパーを作成し、それを使ってコード生成を行います。
実装は以下の通りです。

```csharp
/// <summary>
/// Utility class for efficiently building indented strings.
/// </summary>
internal class IndentedStringBuilder(StringBuilder stringBuilder, int indentLevel = 0)
{
    public const int IndentSize = 4;

    public IndentedStringBuilder(int indentLevel = 0)
        : this(new StringBuilder(), indentLevel) { }

    public int IndentLevel { get; private set; } = indentLevel;

    public string Indent => new(' ', IndentLevel * IndentSize);

    public void IncreaseIndent() => IndentLevel += 1;

    public void DecreaseIndent() => IndentLevel = Math.Max(0, IndentLevel - 1);

    public void AppendLine(string text)
    {
        var lines = text.Split(["\r\n", "\r", "\n"], StringSplitOptions.None);
        foreach (var line in lines)
        {
            stringBuilder.AppendLine(Indent + line);
        }
    }

    public override string ToString() => stringBuilder.ToString();
}
```

`AppendLine`,`ToString`があるのは普通の`StringBuilder`と同じですが、そこに`IncreaseIndent`/`DecreaseIndent`が加わっています。
たったこれだけですが、コード生成時にインデントを管理するのが非常に楽になります。

例えば「その2」のようなケースの場合。

```csharp
public void Generate()
{
    var builder = new IndentedStringBuilder();
    builder.AppendLine("public class GeneratedClass {");
    builder.IncreaseIndent();
    var generatedMethod = GenerateMethodCode(builder);
    builder.DecreaseIndent();
    builder.AppendLine("}");
}

public void GenerateMethodCode(IndentedStringBuilder builder)
{
    builder.AppendLine("public void GeneratedMethod() {");
    builder.IncreaseIndent();
    GenerateAnotherMethod(builder);
    builder.DecreaseIndent();
    builder.AppendLine("}");
    return builder;
}

public void GenerateAnotherMethod(IndentedStringBuilder builder)
{
    builder.AppendLine("var source = \"Some processing\";");
    builder.AppendLine("if(CallAnotherMethod()) {");
    builder.IncreaseIndent();
    builder.AppendLine("source += \" More processing\";");
    builder.DecreaseIndent();
    builder.AppendLine("}");
}
```

このように、別の関数にコード生成を任せる場合でも、builderを渡すことでインデントを維持できます。
また、その2のように都度戻り値で受け取る必要もないのでコードの見栄えが良くなります。

### さらに改良する

この`IndentedStringBuilder`を使用して、冒頭のnamespace対応コードを生成してみます。

```csharp
var builder = new IndentedStringBuilder();
// namespace 
var namespaceName = GetNamespaceFromUserCode(parseRecordObject);
// 名前空間がある場合はnamespace宣言を追加してインデントに入る
if (!string.IsNullOrEmpty(namespaceName))
{
    builder.AppendLine($"namespace {namespaceName}");
    builder.AppendLine("{");
    builder.IncreaseIndent();
}
builder.AppendLine($$"""
    public class GeneratedClass
    {
        public void GeneratedMethod()
        {
            // 何か処理
        }
    }
    """);
// 終わったらインデントを戻して閉じ括弧を追加
if (!string.IsNullOrEmpty(namespaceName))
{
    builder.DecreaseIndent();
    builder.AppendLine("}");
}
```

同じようなif判定文が2箇所発生するのが少々気になります。
そこで、以下のような機能を追加してみます。


```csharp
internal class IndentedStringBuilder(StringBuilder stringBuilder, int indentLevel = 0)
{
    public IndentedStringBuilder(int indentLevel = 0)
        : this(new StringBuilder(), indentLevel) { }

    public const int IndentSize = 4;

    public int IndentLevel { get; private set; } = indentLevel;

    public string Indent => new(' ', IndentLevel * IndentSize);

    public void IncreaseIndent() => IndentLevel += 1;

    public void DecreaseIndent() => IndentLevel = Math.Max(0, IndentLevel - 1);

    public void AppendLine(string text)
    {
        var lines = text.Split(["\r\n", "\r", "\n"], StringSplitOptions.None);
        foreach (var line in lines)
        {
            stringBuilder.AppendLine(Indent + line);
        }
    }

    public override string ToString() => stringBuilder.ToString();

    // ----------------------
    // 以下追加

    public void AppendLineIf(bool condition, string text)
    {
        if (condition)
        {
            AppendLine(text);
        }
    }

    public IDisposable IndentScopeWithBraceIf(bool condition, string open = "{", string close = "}")
    {
        if (condition)
        {
            AppendLine(open);
            IncreaseIndent();
            return new IndentScopeDisposable(this, close);
        }
        else
        {
            return new IndentScopeDisposable(this, null);
        }
    }

    private sealed class IndentScopeDisposable(
        IndentedStringBuilder builder,
        string? closeBraceText = null
    ) : IDisposable
    {
        public void Dispose()
        {
            builder.DecreaseIndent();
            if (closeBraceText is not null)
            {
                builder.AppendLine(closeBraceText);
            }
        }
    }
}
```

`AppendLineIf`は条件付きで行を追加するメソッドです。
`IndentScopeWithBraceIf`はusingステートメントと組み合わせてインデントスコープを管理するためのメソッドです。

これらを使うと、namespace対応コードは以下のように書けます。

```csharp
var builder = new IndentedStringBuilder();
// namespace
var namespaceName = GetNamespaceFromUserCode(parseRecordObject);
var hasNamespace = !string.IsNullOrEmpty(namespaceName);
builder.AppendLineIf(hasNamespace, $"namespace {namespaceName}");
using (builder.IndentScopeWithBraceIf(hasNamespace))
{
    builder.AppendLine($$"""
        public class GeneratedClass
        {
            public void GeneratedMethod()
            {
                // 何か処理
            }
        }
        """);
}
```

どうでしょう、かなりスッキリしたのではないでしょうか。

実際に実行してみると、以下のようなコードが生成されます。

```csharp
namespace test // testの場合
{
    public class GeneratedClass
    {
        public void GeneratedMethod()
        {
            // 何か処理
        }
    }
}
```

```csharp
// 名前空間無しの場合
public class GeneratedClass
{
    public void GeneratedMethod()
    {
        // 何か処理
    }
}
```

## まとめ
この記事では、Source Generatorでのコード生成時にインデントを管理する方法を紹介しました。
`NormalizeWhitespace`の使用は避け、`IndentedStringBuilder`のようなインデント管理機能を持ったラッパーを使うことで、効率的かつ可読性の高いコード生成が可能になります。