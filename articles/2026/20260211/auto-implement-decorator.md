---
title: "【C#】Decorator/Interceptorの自動実装を試みる方法メモ"
published: true
tags: ["csharp", "dotnet", "interface", "decorator"]
zenn:
  published: true
  emoji: "📚"
  type: "tech"
---

## やりたいこと

デコレーターパターン（↓こんな感じのやつ）を実装するとき。

```csharp
// こんな感じのインターフェースがあったとして
public interface IService
{
    void DoSomething();
    int Calculate(int x, int y);
}

// このように、自身もIServiceを実装しつつ、
// 内部でIServiceのインスタンスを保持して処理を委譲する。
// こうすることで、前後に処理を追加できる。
public class ServiceDecorator(IService innerService) : IService
{
    public void DoSomething()
    {
        // 前処理
        _innerService.DoSomething();
        // 後処理
    }

    public int Calculate(int x, int y)
    {
        // 前処理
        var result = _innerService.Calculate(x, y);
        // 後処理
        return result;
    }
}
```

## 課題
インターフェースのメソッドが多いと、委譲コードを手動で書くのが面倒になる。

```csharp
public interface IService
{
    void DoSomething();
    int Calculate(int x, int y);
    string GetData(string key);
    // 他にもたくさんメソッドがあるとする...
}

public class ServiceDecorator(IService innerService) : IService
{
    public void DoSomething() { /* ... */ }

    public int Calculate(int x, int y) { /* ... */ }

    public string GetData(string key) { /* ... */ }

    // 当然、他にもたくさんメソッドを実装する必要がある...
}
```

また、共通の処理を挟み込む場合、全てのメソッドに対して同じような前後処理を書く必要があり、コードの重複が発生しやすい。

```csharp
public class ServiceDecorator(IService innerService) : IService
{
    // 共通の前後処理をまとめたメソッド
    // yield returnを使って本体実行の可否を制御することができる。
    private IEnumerable<bool> Interceptor()
    {
        Console.WriteLine("共通の前処理");
        yield return true;
        Console.WriteLine("共通の後処理");
    }

    public void DoSomething()
    {
        var enumerator = Interceptor().GetEnumerator();
        enumerator.MoveNext(); // 前処理
        if(enumerator.Current) // trueなら本体実行
        {
            innerService.DoSomething();
            enumerator.MoveNext(); // 後処理
        }
    }

    public int Calculate(int x, int y)
    {
        // ここも同様
    }

    public string GetData(string key)
    {
        // ここも同様
    }

    // 当然、他にもたくさんメソッドを実装する必要がある...
}
```

これらをどうにかして自動化したい！という思考実験のメモ書き。なお、自動実装部分はSource Generatorで実現する想定とします。

## 前提
以下のような呼び出し方をします。DIコンテナなどで使われるイメージ。この部分は各コード例の先頭に書かれているとします。

```csharp
// common part
var sample = new ServiceImpl();
IService decoratedSample = new ServiceDecorator(sample);
decoratedSample.DoSomething();
var rst = decoratedSample.Calculate(3, 5);
Console.WriteLine($"Result: {rst}");

// declaration part
public interface IService
{
    void DoSomething();
    int Calculate(int x, int y);
}

public class ServiceImpl : IService
{
    public void DoSomething()
    {
        Console.WriteLine("Doing something in ServiceImpl.");
    }

    public int Calculate(int x, int y)
    {
        Console.WriteLine($"Calculating {x} + {y} in ServiceImpl.");
        return x + y;
    }
}

// この後ろにServiceDecoratorの実装が続く
```

また、以後のコードでは「ユーザーが書くべきコード」と「自動生成されるコード」を分けて記載します。

```csharp
// ユーザーが書く必要のあるコード
// > ユーザーがここにServiceDecoratorの実装を書く

// 自動生成されるコード
// > ここから下のコードは機械的に生成することを想定しているので、コードの重複とか実装難度は気にしない
```

## 方法1: partial classで足りないメンバーを自動生成
partial class機能を使って、ユーザーが書かなかったメンバーを自動生成する方法。

```csharp
// ユーザーが書く必要のあるコード
public partial class ServiceDecorator(IService innerService) : IService
{
    public void DoSomething()
    {
        // 前処理
        innerService.DoSomething();
        // 後処理
    }
    // 他のメソッドは書かない
}
// 自動生成されるコード
public partial class ServiceDecorator : IService
{
    public int Calculate(int x, int y) => innerService.Calculate(x, y);
    // ほかも同様に自動生成
}
```

基本はこれで良さそうですが、例えばinterceptorパターンのように全てのメソッドに対して前後処理を入れたい場合、ユーザーが上書きしたロジックについても自動生成側で前後処理を入れたい、となると実現が難しい。
また、生成されるタイミングは保存時なので、ユーザーがコードを書いている最中は未実装のメソッドがある or 実装が重複する状態になり、アナライザーエラーが出てしまうのも不便。

## 方法2: abstract classを自動生成
インターフェースに対応するabstract classを自動生成し、そのabstract classを継承する形でデコレータを実装する方法。

```csharp
// ユーザーが書く必要のあるコード
public class ServiceDecorator(IService innerService) : ServiceDecoratorBase(innerService)
{
    public override void DoSomething()
    {
        // 前処理
        base.DoSomething();
        // 後処理
    }
    // 素通しするメソッドはオーバーライドしなくて良い
}

// 自動生成されるコード
public abstract class ServiceDecoratorBase(IService innerService) : IService
{
    public virtual void DoSomething() => innerService.DoSomething();

    public virtual int Calculate(int x, int y) => innerService.Calculate(x, y);

    // ほかも同様に自動生成
}
```

これであれば、ユーザーがオーバーライドしたメソッドについても`base.`で素通し処理を呼び出せるため、前後処理を入れやすい。
のですが、実装時点で`ServiceDecoratorBase`が存在しないため、体験が良くない。具体的にはIDE補完が効かないし、保存するまでエラーが出る。
CodeFixで自動生成するのを前提にするならこれでも良い。

## 方法3: partial class + abstract classを自動生成
C#14以降限定。
継承する部分も含めて自動生成すればいいじゃない！という考え方。

```csharp
// ユーザーが書く必要のあるコード
public partial class ServiceDecorator : IService
{
    // C#14のpartial constructorを使用する。
    // これを使いたいのでprimary constructorが使えない！
    public partial ServiceDecorator(IService innerService);

    // あとは方法1と同じ
    public override void DoSomething()
    {
        // 前処理
        base.DoSomething();
        // 後処理
    }
}

// 自動生成されるコード
partial class ServiceDecorator : ServiceDecorator__GeneratedBase
{
    // ここでabstract側にIServiceを渡す
    public partial ServiceDecorator(IService innerService) : base(innerService) { }
}
public abstract class ServiceDecorator__GeneratedBase(IService innerService) : IService
{
    // あとは同じ。
    public virtual void DoSomething() => innerService.DoSomething();
    public virtual int Calculate(int x, int y) => innerService.Calculate(x, y);
    // ...
}
```

primary constructorが使えないのが残念。
あと、見た目上はinterfaceしか書いてないのにoverrideとかしてるのが非常に違和感のあるコードになる。

## 方法4: partial class + interfaceの自動実装
abstract classではなく、interfaceの自動実装機能を使う方法。
そのままでは自動生成されたインターフェースを参照できないため、partial class側で生成されたインターフェースを継承[^1]させる。
また、interfaceの自動実装部分でinnerServiceを参照できるように内部用のプロパティを用意し、自動生成されたpartial class側で値を渡す。

[^1]: 正確には継承ではないんですが、良い表現が思いつかない。。 `: IServiceDecorator__Generated`を追加するよ、の意味合いです。

```csharp
// ユーザーが書く必要のあるコード
public partial class ServiceDecorator(IService innerService) : IService
{
    public void DoSomething()
    {
        // 前処理
        // base.DoSomething(); // これは書けない...！
        innerService.DoSomething();
        // 後処理
    }
}

// 自動生成されるコード
partial class ServiceDecorator : IServiceDecorator__Generated
{
    // __innerServiceに値を渡す
    IService IServiceDecorator__Generated.__innerService => innerService;
}
public interface IServiceDecorator__Generated : IService
{
    // ここで内部用のプロパティを用意して
    IService __innerService { get; }
    // あとはinterfaceの自動実装として実装を提供する
    void IService.DoSomething() => __innerService.DoSomething();
    int IService.Calculate(int x, int y) => __innerService.Calculate(x, y);
    // ...
}
```

これであれば、primary constructorも使えるし、見た目上もinterfaceを実装しているだけなので違和感が少ない。
ただ、フック処理を全てに差し込む場合などのことを考えると、そこを`base.DoSomething()`のように書けないのが欠点。

あともう一つの欠点として、[インターフェースのデフォルト実装機能を使用する](https://ufcpp.net/study/csharp/cheatsheet/ap_ver8/#default-imeplementation-of-interface)関係で、`C# 8`以降に加えて`.NET Core 3.0`以降が必要になる。
abstract classを使う方法なら(言語バージョンの縛りはあるが)どの環境でも使えるので、やや汎用性が落ちる。[^2]

[^2]: 個人的には切り捨てたいですが。自動実装なんて使いたい人は最新環境を使うと思うので。。

## 方法5-1: partial class + interface + 共通処理クラス
方法4をさらに改良し、共通処理を別のクラスに分離する。
この分離したクラスを自動生成インターフェース側に持たせ(内部でしか使わないのでprotectedにする)、partial class側でインスタンスを生成してプロパティ経由で参照できるようにする。

```csharp
// ユーザーが書く必要のあるコード
public partial class ServiceDecorator(IService innerService) : IService
{
    public void DoSomething()
    {
        // 共通処理を呼び出したい場合、Baseプロパティ経由で呼び出す
        // こうすることで共通処理も働く
        Base.DoSomething();
    }
}

// 自動生成されるコード
partial class ServiceDecorator : IServiceDecorator__Generated
{
    // __innerServiceに値を渡す
    private readonly IServiceDecorator__Generated.__BaseImpl Base = new(innerService);
    IServiceDecorator__Generated.__BaseImpl IServiceDecorator__Generated.__Base => Base;
}

public interface IServiceDecorator__Generated : IService
{
    // このクラスを自動で用意して、元のServiceの呼び出しをラップする
    protected class __BaseImpl(IService __Service)
    {
        public void DoSomething() => __Service.DoSomething();

        public int Calculate(int x, int y) => __Service.Calculate(x, y);
    }

    // 呼び出し用のプロパティを用意。実装はpartial class側で提供する
    protected __BaseImpl __Base { get; }

    // あとはinterfaceの自動実装として上記プロパティを呼び出す
    void IService.DoSomething() => __Base.DoSomething();
    int IService.Calculate(int x, int y) => __Base.Calculate(x, y);
    // ...
}
```

これであれば、ユーザーは`Base.`を使って元の処理を呼び出せるし、primary constructorも使える。
ただし、このままだと共通処理を__BaseImpl側から参照できないので、次の方法6で改良します。

## 方法5-2: partial class 内部に自動生成クラスを配置
方法5-1の別解として、自動生成クラスをpartial classの内部に配置することもできる。

```csharp
// ユーザーが書く必要のあるコード
public partial class ServiceDecorator(IService innerService) : IService
{
    public void DoSomething()
    {
        // 前処理
        Base.DoSomething();
        // 後処理
    }
}

// 自動生成されるコード
partial class ServiceDecorator : IService
{
    // このクラスを自動で用意して、元のServiceの呼び出しをラップする
    private class __BaseImpl(IService __Service)
    {
        public void DoSomething() => __Service.DoSomething();

        public int Calculate(int x, int y) => __Service.Calculate(x, y);
    }

    // また、Baseで呼び出せるようにプロパティも用意
    private readonly __BaseImpl Base = new(innerService);

    // 足りない項目は自動生成する
    public int Calculate(int x, int y) => Base.Calculate(x, y);
}
```

これでも同じように動作する。
大きな違いは、方法5-2の場合、interface側とクラス側で実装が重複していると一時的にアナライザーエラーが出る。
保存時点で再生成されるが、コードを書く最中にエラーが出るのは少し不便かな。。

## 方法6: 自動生成クラスから自動生成インターフェースを参照

方法5-1を元に、インターセプター処理を組み込めるように改良したもの。

```csharp
// ユーザーが書く必要のあるコード
public partial class ServiceDecorator(IService innerService) : IService
{
    public void DoSomething()
    {
        Base.DoSomething(); // Base経由で呼び出す
    }

    // インターセプター用のロジックを定義する場合
    // public IEnumerable<bool> Intercept(string methodName, object[] args) { ... }
}

// 自動生成されるコード
partial class ServiceDecorator : IServiceDecorator__Generated
{
    // フィールドだとthisを渡す都合上うまくいかないのでBaseをプロパティとし
    // 毎回生成しないようにキャッシュする
    private IServiceDecorator__Generated.__BaseImpl? __baseCache;
    private IServiceDecorator__Generated.__BaseImpl Base => __baseCache ??= new(innerService, this);
    IServiceDecorator__Generated.__BaseImpl IServiceDecorator__Generated.__Base => Base;
}

public interface IServiceDecorator__Generated : IService
{
    // このクラスを自動で用意して、元のServiceの呼び出しをラップする
    // 5-1からの変更点として、コンストラクタにIServiceDecorator__Generatedのインスタンスを受け取るようにする
    // これにより、インターセプター処理を呼び出せるようにする
    protected class __BaseImpl(IService __Service, IServiceDecorator__Generated __Root)
    {
        public void DoSomething()
        {
            // インターセプター処理を呼び出す
            var e = __Root.Intercept(nameof(DoSomething), []).GetEnumerator();
            if (e.MoveNext() && e.Current)
            {
                __Service.DoSomething();
                e.MoveNext();
                return;
            }
            throw new InvalidOperationException("Intercepted call was blocked.");
        }

        public int Calculate(int x, int y)
        {
            var e = __Root.Intercept(nameof(Calculate), [x, y]).GetEnumerator();
            if (e.MoveNext() && e.Current)
            {
                var result = __Service.Calculate(x, y);
                e.MoveNext();
                return result;
            }
            throw new InvalidOperationException("Intercepted call was blocked.");
        }
    }

    // 呼び出し用のプロパティを用意。実装はpartial class側で提供する
    protected __BaseImpl __Base { get; }

    // インターセプター用のロジックを定義。デフォルトでは何もしない実装を提供する
    IEnumerable<bool> Intercept(string methodName, object[] args)
    {
        yield return true;
    }

    // あとはinterfaceの自動実装として上記プロパティを呼び出す
    void IService.DoSomething() => __Base.DoSomething();
    int IService.Calculate(int x, int y) => __Base.Calculate(x, y);
    // ...
}
```

注目すべきポイントとして、`ServiceDecorator`のユーザー記述部分が以下のようにシンプルなコードになっていること。
SourceGeneratorを動かすために属性は付与されていますが、それ以外はあまりにも自然なコードといえるはず。
まあ`Base`プロパティが突然現れるのはちょっと違和感があるが。

```csharp
// [AutoImplDecorator]的な属性が付与されている
public partial class ServiceDecorator(IService innerService) : IService
{
    public void DoSomething() => Base.DoSomething();
}
```

また、全ての処理の前後にフック処理を差し込むだけなら、`Intercept`メソッドだけを書けば良い。

```csharp
public partial class ServiceDecorator(IService innerService) : IService
{
    // 例えば処理時間を簡易的に計測する例
    public IEnumerable<bool> Intercept(string methodName, object[] args)
    {
        var start = Stopwatch.GetTimestamp();
        yield return true; // yield return trueを返すと本体処理が実行される
        var end = Stopwatch.GetTimestamp();
        var elapsed = (end - start) * 1000.0 / Stopwatch.Frequency;
        Console.WriteLine($"[{methodName}]: Elapsed {elapsed} ms");
    }
}
```

## 完成形

こんな感じ。実際に`dotnet run sample.cs`で動かせます(.NET 10以降)。


```csharp
// 共通部分
var sample = new ServiceImpl();
IService decoratedSample = new ServiceDecorator(sample);
decoratedSample.DoSomething();
var rst = decoratedSample.Calculate(3, 5);
Console.WriteLine($"Result: {rst}");

public interface IService
{
    void DoSomething();
    int Calculate(int x, int y);
}

public class ServiceImpl : IService
{
    public void DoSomething()
    {
        Console.WriteLine("Doing something in ServiceImpl.");
    }

    public int Calculate(int x, int y)
    {
        Console.WriteLine($"Calculating {x} + {y} in ServiceImpl.");
        return x + y;
    }
}

public partial class ServiceDecorator(IService innerService) : IService
{
    public void DoSomething()
    {
        Console.WriteLine("Overwrite Hook Before");
        Base.DoSomething(); // Base経由で呼び出す
        Console.WriteLine("Overwrite Hook After");
    }

    // インターセプター用のロジックを定義
    public IEnumerable<bool> Intercept(string methodName, object[] args)
    {
        Console.WriteLine($"[{methodName}]: Hook Before");
        yield return true; // yield return trueを返すと本体処理が実行される
        Console.WriteLine($"[{methodName}]: Hook After");
    }
}

// -----------------------------
// 自動生成されるコード
partial class ServiceDecorator : IServiceDecorator__Generated
{
    private IServiceDecorator__Generated.__BaseImpl? __baseCache;
    private IServiceDecorator__Generated.__BaseImpl Base => __baseCache ??= new(innerService, this);
    IServiceDecorator__Generated.__BaseImpl IServiceDecorator__Generated.__Base => Base;
}

public interface IServiceDecorator__Generated : IService
{
    protected class __BaseImpl(IService __Service, IServiceDecorator__Generated __Root)
    {
        public void DoSomething()
        {
            // インターセプター処理を呼び出す
            var e = __Root.Intercept(nameof(DoSomething), []).GetEnumerator();
            if (e.MoveNext() && e.Current)
            {
                __Service.DoSomething();
                e.MoveNext();
                return;
            }
            throw new InvalidOperationException("Intercepted call was blocked.");
        }

        public int Calculate(int x, int y)
        {
            var e = __Root.Intercept(nameof(Calculate), [x, y]).GetEnumerator();
            if (e.MoveNext() && e.Current)
            {
                var result = __Service.Calculate(x, y);
                e.MoveNext();
                return result;
            }
            throw new InvalidOperationException("Intercepted call was blocked.");
        }
    }

    protected __BaseImpl __Base { get; }

    IEnumerable<bool> Intercept(string methodName, object[] args)
    {
        yield return true;
    }

    void IService.DoSomething() => __Base.DoSomething();
    int IService.Calculate(int x, int y) => __Base.Calculate(x, y);
    // ...
}
```

これを実行すると、結果は以下のようになる。

```
Overwrite Hook Before
[DoSomething]: Hook Before
Doing something in ServiceImpl.
[DoSomething]: Hook After
Overwrite Hook After
[Calculate]: Hook Before
Calculating 3 + 5 in ServiceImpl.
[Calculate]: Hook After
Result: 8
```

見ての通り、共通部分(ServiceImpl)に手をつけず、なおかつServiceDecorator自体のコードも最小限に抑えて、インターセプター処理を差し込むことができる。

## 結果早見表

| 方法 | 前提環境 | primary constructor | base呼び出し(共通処理参照) | その他の欠点 | 
|---|---|---|---|---|
| 方法1   | ー | ○ | × | 保存するまで実装が生成されない |
| 方法2   | ー | ○ | ○ | 書いてる最中は基底クラスが存在しない |
| 方法3   | C#14 | × | ○ | primary constructorが使えない、見た目が違和感ある |
| 方法4   | C#8/Core 3.0 | ○ | × | 環境依存 |
| 方法5-1 | C#8/Core 3.0 | ○ | ○(`Base`) | 方法4の欠点+protectedなクラスが勝手に生えてくる |
| 方法5-2 | ー | ○ | ○(`Base`) | 保存するまで実装が生成されない |
| 方法6(完成形) | C#8/Core 3.0  | ○ | ○(`Base`) | 方法5-1の欠点+初見では読めたもんじゃない |

共通処理呼び出しをやらないなら方法4、共通処理呼び出しをやるなら方法6が良さそう。

## 感想
だいぶ黒魔術感が出てきましたが、やろうと思えば何でもできそうですね。。
まあ、ここまでやるのはどうなんだという向きもあると思いますが、同じようなことを考えた人の参考になれば幸いです。
