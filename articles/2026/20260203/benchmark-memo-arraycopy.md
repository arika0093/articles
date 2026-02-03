---
title: "【C#】配列のDeepCopyを高速化するベンチマーク調査結果"
published: true
tags: ["csharp", "dotnet", "deepcopy", "benchmark"]
---

以下のような操作を最も高速で行える方法はなにかを調べたメモ。

```csharp
// 文字列の配列（ないしList）があったとして
List<string> original = ["a", "b", "c", "d", /* ... */];
// これをDeepCopy(DeepClone)する。
List<string> copy = new(original.Count);
foreach (var item in original)
{
    copy.Add(item);
}
// これを最速で行う方法を調べる。
```

環境は以下の通り。

```
BenchmarkDotNet v0.15.8, Windows 11 (10.0.26200.7623/25H2/2025Update/HudsonValley2)
Intel Core i7-14700F 2.10GHz, 1 CPU, 28 logical and 20 physical cores
.NET SDK 10.0.101
  [Host]    : .NET 6.0.28 (6.0.28, 6.0.2824.12007), X64 RyuJIT x86-64-v3
  .NET 6.0  : .NET 6.0.28 (6.0.28, 6.0.2824.12007), X64 RyuJIT x86-64-v3
  .NET 8.0  : .NET 8.0.22 (8.0.22, 8.0.2225.52707), X64 RyuJIT x86-64-v3
  .NET 10.0 : .NET 10.0.1 (10.0.1, 10.0.125.57005), X64 RyuJIT x86-64-v3
```

## 配列(string)の場合

とりあえず思いつく方法を列挙。

1. `Array.Copy`
2. forループで1要素ずつコピー
3. `Clone`
4. `Enumerable.ToArray(original)`
5. `original.AsSpan().ToArray()`
6. `[.. original]`

```csharp
[MemoryDiagnoser]
[SimpleJob(RuntimeMoniker.Net60)]
[SimpleJob(RuntimeMoniker.Net80)]
[SimpleJob(RuntimeMoniker.Net10_0)]
[Orderer(SummaryOrderPolicy.FastestToSlowest)]
public class ArrayCopy
{
    private string[] SampleArray { get; set; } = [];

    [Params(100)]
    public int ArraySize { get; set; }

    [GlobalSetup]
    public void Setup()
    {
        SampleArray = new string[ArraySize];
        for (int i = 0; i < ArraySize; i++)
        {
            SampleArray[i] = "SampleString" + i;
        }
    }

    [Benchmark]
    public string[] CopyUsingArrayCopy()
    {
        var a = SampleArray.Length;
        var destinationArray = new string[a];
        Array.Copy(SampleArray, destinationArray, a);
        return destinationArray;
    }

    [Benchmark]
    public string[] CopyFor()
    {
        var a = SampleArray.Length;
        var destinationArray = new string[a];
        for (int i = 0; i < a; i++)
        {
            destinationArray[i] = SampleArray[i];
        }
        return destinationArray;
    }

    [Benchmark]
    public string[] CopyUsingClone()
    {
        return (string[])SampleArray.Clone();
    }

    [Benchmark]
    public string[] CopyWithLinq()
    {
        return System.Linq.Enumerable.ToArray(SampleArray);
    }

    [Benchmark]
    public string[] CopyUsingSpan()
    {
        return SampleArray.AsSpan().ToArray();
    }

    [Benchmark]
    public string[] CopyUsingCollectionExpr()
    {
        return [.. SampleArray];
    }
}
```

### 結果

| Method                  | Job       | Runtime   | ArraySize | Mean      | Error    | StdDev   | Gen0   | Allocated |
|------------------------ |---------- |---------- |---------- |----------:|---------:|---------:|-------:|----------:|
| CopyUsingArrayCopy      | .NET 10.0 | .NET 10.0 | 100       |  32.65 ns | 0.678 ns | 0.807 ns | 0.0477 |     824 B |
| CopyWithLinq            | .NET 10.0 | .NET 10.0 | 100       |  33.53 ns | 0.700 ns | 0.911 ns | 0.0477 |     824 B |
| CopyUsingSpan           | .NET 6.0  | .NET 6.0  | 100       |  34.25 ns | 0.649 ns | 0.694 ns | 0.0477 |     824 B |
| CopyUsingSpan           | .NET 8.0  | .NET 8.0  | 100       |  34.90 ns | 0.702 ns | 0.656 ns | 0.0477 |     824 B |
| CopyUsingCollectionExpr | .NET 6.0  | .NET 6.0  | 100       |  40.33 ns | 0.761 ns | 0.712 ns | 0.0477 |     824 B |
| CopyWithLinq            | .NET 6.0  | .NET 6.0  | 100       |  41.40 ns | 0.849 ns | 0.978 ns | 0.0477 |     824 B |
| CopyUsingSpan           | .NET 10.0 | .NET 10.0 | 100       |  42.04 ns | 0.868 ns | 1.129 ns | 0.0477 |     824 B |
| CopyUsingCollectionExpr | .NET 10.0 | .NET 10.0 | 100       |  43.03 ns | 0.897 ns | 1.033 ns | 0.0477 |     824 B |
| CopyUsingCollectionExpr | .NET 8.0  | .NET 8.0  | 100       |  44.83 ns | 0.433 ns | 0.384 ns | 0.0477 |     824 B |
| CopyUsingArrayCopy      | .NET 8.0  | .NET 8.0  | 100       |  45.13 ns | 0.928 ns | 1.417 ns | 0.0477 |     824 B |
| CopyUsingClone          | .NET 10.0 | .NET 10.0 | 100       |  45.27 ns | 0.359 ns | 0.336 ns | 0.0477 |     824 B |
| CopyUsingClone          | .NET 8.0  | .NET 8.0  | 100       |  47.07 ns | 0.949 ns | 1.298 ns | 0.0477 |     824 B |
| CopyUsingClone          | .NET 6.0  | .NET 6.0  | 100       |  48.62 ns | 0.973 ns | 1.195 ns | 0.0477 |     824 B |
| CopyWithLinq            | .NET 8.0  | .NET 8.0  | 100       |  54.21 ns | 1.109 ns | 2.214 ns | 0.0477 |     824 B |
| CopyUsingArrayCopy      | .NET 6.0  | .NET 6.0  | 100       |  57.13 ns | 1.161 ns | 1.086 ns | 0.0477 |     824 B |
| CopyFor                 | .NET 10.0 | .NET 10.0 | 100       |  85.55 ns | 0.843 ns | 0.788 ns | 0.0477 |     824 B |
| CopyFor                 | .NET 8.0  | .NET 8.0  | 100       |  86.35 ns | 0.946 ns | 0.885 ns | 0.0477 |     824 B |
| CopyFor                 | .NET 6.0  | .NET 6.0  | 100       | 104.11 ns | 1.537 ns | 1.438 ns | 0.0477 |     824 B |

うーん、謎…。
とりあえずSpanを使えば悪くなさそう。

## 配列(クラス)の場合

以下のようなクラスをディープコピーすることを考える。

```csharp
public class SampleSubClass
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool Flag { get; set; } = false;

    public SampleSubClass Clone()
    {
        return new SampleSubClass()
        {
            Id = this.Id,
            Name = this.Name,
            Flag = this.Flag,
        };
    }
}
```

方法としては

1. forループで1要素ずつCloneしてコピー
2. `Enumerable.ToArray(original.Select(x => x.Clone()))`
3. `original.AsSpan()`+forループで1要素ずつCloneしてコピー

```csharp
[MemoryDiagnoser]
[SimpleJob(RuntimeMoniker.Net60)]
[SimpleJob(RuntimeMoniker.Net80)]
[SimpleJob(RuntimeMoniker.Net10_0)]
[Orderer(SummaryOrderPolicy.FastestToSlowest)]
public class ArrayCopyWithClass
{
    private SampleSubClass[] SampleArray { get; set; } = [];

    [Params(5)]
    public int ArraySize { get; set; }

    [GlobalSetup]
    public void Setup()
    {
        SampleArray = new SampleSubClass[ArraySize];
        for (int i = 0; i < ArraySize; i++)
        {
            SampleArray[i] = new()
            {
                Id = i,
                Name = "Sample_" + i.ToString(),
                Flag = (i % 2 == 0),
            };
        }
    }

    [Benchmark]
    public SampleSubClass[] CopyForAdd()
    {
        var a = SampleArray.Length;
        var c = new SampleSubClass[a];
        for (int i = 0; i < a; i++)
        {
            c[i] = SampleArray[i].Clone();
        }
        return c;
    }

    [Benchmark]
    public SampleSubClass[] CopyUsingLinq()
    {
        return System.Linq.Enumerable.ToArray(SampleArray.Select(item => item.Clone()));
    }

    [Benchmark]
    public SampleSubClass[] CopyUsingSpan()
    {
        var a = SampleArray.Length;
        var r = new SampleSubClass[a];
        var c = r.AsSpan();
        for (var i = 0; i < a; i++)
        {
            c[i] = SampleArray[i].Clone();
        }
        return r;
    }
}
```

### 結果
| Method        | Job       | Runtime   | ArraySize | Mean     | Error    | StdDev   | Gen0   | Allocated |
|-------------- |---------- |---------- |---------- |---------:|---------:|---------:|-------:|----------:|
| CopyUsingSpan | .NET 10.0 | .NET 10.0 | 5         | 21.30 ns | 0.203 ns | 0.199 ns | 0.0130 |     224 B |
| CopyForAdd    | .NET 8.0  | .NET 8.0  | 5         | 22.82 ns | 0.326 ns | 0.305 ns | 0.0130 |     224 B |
| CopyUsingSpan | .NET 8.0  | .NET 8.0  | 5         | 26.61 ns | 0.493 ns | 0.437 ns | 0.0130 |     224 B |
| CopyUsingLinq | .NET 10.0 | .NET 10.0 | 5         | 33.22 ns | 0.227 ns | 0.438 ns | 0.0157 |     272 B |
| CopyUsingSpan | .NET 6.0  | .NET 6.0  | 5         | 34.50 ns | 0.666 ns | 0.955 ns | 0.0129 |     224 B |
| CopyForAdd    | .NET 6.0  | .NET 6.0  | 5         | 35.63 ns | 0.483 ns | 0.452 ns | 0.0129 |     224 B |
| CopyUsingLinq | .NET 8.0  | .NET 8.0  | 5         | 39.48 ns | 0.415 ns | 0.388 ns | 0.0157 |     272 B |
| CopyForAdd    | .NET 10.0 | .NET 10.0 | 5         | 40.50 ns | 0.604 ns | 0.565 ns | 0.0130 |     224 B |
| CopyUsingLinq | .NET 6.0  | .NET 6.0  | 5         | 52.01 ns | 0.614 ns | 0.574 ns | 0.0157 |     272 B |

とりあえず`Span`経由で良さげ。

---

## List(string)の場合

思いつく範囲で。

1. コンストラクタ経由でコピー
2. foreachで1要素ずつコピー
3. forループで1要素ずつコピー
4. `Enumerable.ToList(original)`
5. `CollectionsMarshal.AsSpan(original).ToArray()`
6. `CollectionsMarshal.AsSpan`+一つずつコピー
7. `[.. original]`

```csharp
[MemoryDiagnoser]
[SimpleJob(RuntimeMoniker.Net60)]
[SimpleJob(RuntimeMoniker.Net80)]
[SimpleJob(RuntimeMoniker.Net10_0)]
[Orderer(SummaryOrderPolicy.FastestToSlowest)]
public class ListCopy
{
    private List<string> SampleList { get; set; } = [];

    [Params(100)]
    public int ArraySize { get; set; }

    [GlobalSetup]
    public void Setup()
    {
        SampleList = new(ArraySize);
        for (int i = 0; i < ArraySize; i++)
        {
            SampleList.Add("SampleString" + i);
        }
    }

    [Benchmark]
    public List<string> CopyUsingConstructor()
    {
        return new List<string>(SampleList);
    }

    [Benchmark]
    public List<string> CopyForeachAdd()
    {
        var a = SampleList.Count;
        var c = new List<string>(a);
        foreach (var item in SampleList)
        {
            c.Add(item);
        }
        return c;
    }

    [Benchmark]
    public List<string> CopyForAdd()
    {
        var a = SampleList.Count;
        var c = new List<string>(a);
        for (int i = 0; i < SampleList.Count; i++)
        {
            c.Add(SampleList[i]);
        }
        return c;
    }

    [Benchmark]
    public List<string> CopyUsingLinq()
    {
        return System.Linq.Enumerable.ToList(SampleList);
    }

    [Benchmark]
    public List<string> CopyUsingSpan1()
    {
        var c = CollectionsMarshal.AsSpan(SampleList).ToArray();
        return new List<string>(c);
    }

    [Benchmark]
    public List<string> CopyUsingSpan2()
    {
#if NET7_0_OR_GREATER
        var a = SampleList.Count;
        var r = new List<string>(a);
        CollectionsMarshal.SetCount(r, a);
        var c = CollectionsMarshal.AsSpan(r);
        for (var i = 0; i < SampleList.Count; i++)
        {
            c[i] = SampleList[i];
        }
        return r;
#endif
        throw new NotSupportedException(
            "CollectionsMarshal.SetCount is not supported in this .NET version."
        );
    }

    [Benchmark]
    public List<string> CopyUsingCollectionExpr()
    {
        return [.. SampleList];
    }
}
```

### 結果

| Method                  | Job       | Runtime   | ArraySize | Mean      | Error    | StdDev   | Gen0   | Gen1   | Allocated |
|------------------------ |---------- |---------- |---------- |----------:|---------:|---------:|-------:|-------:|----------:|
| CopyUsingLinq           | .NET 10.0 | .NET 10.0 | 100       |  36.66 ns | 0.668 ns | 0.592 ns | 0.0496 | 0.0001 |     856 B |
| CopyUsingConstructor    | .NET 10.0 | .NET 10.0 | 100       |  36.73 ns | 0.551 ns | 0.460 ns | 0.0496 | 0.0001 |     856 B |
| CopyUsingCollectionExpr | .NET 10.0 | .NET 10.0 | 100       |  36.93 ns | 0.498 ns | 0.466 ns | 0.0496 | 0.0001 |     856 B |
| CopyUsingConstructor    | .NET 6.0  | .NET 6.0  | 100       |  42.11 ns | 0.781 ns | 0.988 ns | 0.0496 | 0.0001 |     856 B |
| CopyUsingConstructor    | .NET 8.0  | .NET 8.0  | 100       |  42.21 ns | 0.303 ns | 0.237 ns | 0.0496 | 0.0001 |     856 B |
| CopyUsingCollectionExpr | .NET 6.0  | .NET 6.0  | 100       |  44.89 ns | 0.412 ns | 0.386 ns | 0.0496 | 0.0001 |     856 B |
| CopyUsingLinq           | .NET 6.0  | .NET 6.0  | 100       |  45.04 ns | 0.729 ns | 0.748 ns | 0.0496 | 0.0001 |     856 B |
| CopyUsingCollectionExpr | .NET 8.0  | .NET 8.0  | 100       |  45.20 ns | 0.725 ns | 0.678 ns | 0.0496 | 0.0001 |     856 B |
| CopyUsingLinq           | .NET 8.0  | .NET 8.0  | 100       |  46.67 ns | 0.964 ns | 1.184 ns | 0.0496 | 0.0001 |     856 B |
| CopyUsingSpan1          | .NET 10.0 | .NET 10.0 | 100       |  66.88 ns | 1.051 ns | 0.932 ns | 0.0974 | 0.0002 |    1680 B |
| CopyUsingSpan1          | .NET 6.0  | .NET 6.0  | 100       |  82.20 ns | 0.669 ns | 0.626 ns | 0.0973 | 0.0002 |    1680 B |
| CopyUsingSpan1          | .NET 8.0  | .NET 8.0  | 100       |  82.57 ns | 1.162 ns | 0.970 ns | 0.0974 | 0.0002 |    1680 B |
| CopyForeachAdd          | .NET 10.0 | .NET 10.0 | 100       | 133.95 ns | 1.563 ns | 1.385 ns | 0.0496 |      - |     856 B |
| CopyUsingSpan2          | .NET 8.0  | .NET 8.0  | 100       | 137.5 ns | 1.51 ns | 1.41 ns | 0.0496 |      - |     856 B |
| CopyUsingSpan2          | .NET 10.0 | .NET 10.0 | 100       | 140.1 ns | 2.07 ns | 2.54 ns | 0.0496 |      - |     856 B |
| CopyForeachAdd          | .NET 8.0  | .NET 8.0  | 100       | 150.56 ns | 1.521 ns | 1.422 ns | 0.0496 |      - |     856 B |
| CopyForAdd              | .NET 10.0 | .NET 10.0 | 100       | 169.19 ns | 2.459 ns | 2.179 ns | 0.0496 |      - |     856 B |
| CopyForeachAdd          | .NET 6.0  | .NET 6.0  | 100       | 170.70 ns | 1.737 ns | 1.625 ns | 0.0496 |      - |     856 B |
| CopyForAdd              | .NET 6.0  | .NET 6.0  | 100       | 173.45 ns | 1.378 ns | 1.222 ns | 0.0496 |      - |     856 B |
| CopyForAdd              | .NET 8.0  | .NET 8.0  | 100       | 195.96 ns | 3.262 ns | 3.051 ns | 0.0496 |      - |     856 B |

どの環境でも`new List<string>(original)`で良さそう。

## List(クラス)の場合

Arrayと同様に、`SampleSubClass`をディープコピー(Clone関数の呼び出し)することを考える。
方法としては

1. foreachで1要素ずつCloneしてAdd
2. forループで1要素ずつCloneして代入
3. `Enumerable.ToList(original.Select(x => x.Clone()))`
4. `CollectionsMarshal.AsSpan(original)`+forループでCloneしてAdd

```csharp
[MemoryDiagnoser]
[SimpleJob(RuntimeMoniker.Net60)]
[SimpleJob(RuntimeMoniker.Net80)]
[SimpleJob(RuntimeMoniker.Net10_0)]
[Orderer(SummaryOrderPolicy.FastestToSlowest)]
public class ListCopyWithClass
{
    private List<SampleSubClass> SampleList { get; set; } = [];

    [Params(5)]
    public int ArraySize { get; set; }

    [GlobalSetup]
    public void Setup()
    {
        SampleList = new(ArraySize);
        for (int i = 0; i < ArraySize; i++)
        {
            SampleList.Add(
                new()
                {
                    Id = i,
                    Name = "Sample_" + i.ToString(),
                    Flag = (i % 2 == 0),
                }
            );
        }
    }

    [Benchmark]
    public List<SampleSubClass> CopyForeachAdd()
    {
        var a = SampleList.Count;
        var c = new List<SampleSubClass>(a);
        foreach (var i in SampleList)
        {
            c.Add(i.Clone());
        }
        return c;
    }

    [Benchmark]
    public List<SampleSubClass> CopyForAdd()
    {
        var a = SampleList.Count;
        var c = new List<SampleSubClass>(a);
        for (int i = 0; i < a; i++)
        {
            c.Add(SampleList[i].Clone());
        }
        return c;
    }

    [Benchmark]
    public List<SampleSubClass> CopyUsingLinq()
    {
        return System.Linq.Enumerable.ToList(SampleList.Select(item => item.Clone()));
    }

    [Benchmark]
    public List<SampleSubClass> CopyUsingSpan()
    {
#if NET7_0_OR_GREATER
        var a = SampleList.Count;
        var r = new List<SampleSubClass>(a);
        CollectionsMarshal.SetCount(r, a);
        var c = CollectionsMarshal.AsSpan(r);
        for (var i = 0; i < a; i++)
        {
            c[i] = SampleList[i];
        }
        return r;
#endif
        throw new NotSupportedException(
            "CollectionsMarshal.SetCount is not supported in this .NET version."
        );
    }
}
```

### 結果

| Method         | Job       | Runtime   | ArraySize | Mean     | Error    | StdDev   | Gen0   | Allocated |
|--------------- |---------- |---------- |---------- |---------:|---------:|---------:|-------:|----------:|
| CopyUsingSpan  | .NET 8.0  | .NET 8.0  | 5         | 10.28 ns | 0.122 ns | 0.114 ns | 0.0056 |      96 B |
| CopyUsingSpan  | .NET 10.0 | .NET 10.0 | 5         | 11.62 ns | 0.097 ns | 0.091 ns | 0.0056 |      96 B |
| CopyForAdd     | .NET 10.0 | .NET 10.0 | 5         | 26.54 ns | 0.222 ns | 0.207 ns | 0.0148 |     256 B |
| CopyForeachAdd | .NET 8.0  | .NET 8.0  | 5         | 29.88 ns | 0.396 ns | 0.351 ns | 0.0148 |     256 B |
| CopyForeachAdd | .NET 10.0 | .NET 10.0 | 5         | 32.28 ns | 0.664 ns | 0.711 ns | 0.0148 |     256 B |
| CopyForAdd     | .NET 8.0  | .NET 8.0  | 5         | 32.33 ns | 0.606 ns | 0.943 ns | 0.0148 |     256 B |
| CopyUsingLinq  | .NET 10.0 | .NET 10.0 | 5         | 37.60 ns | 0.440 ns | 0.368 ns | 0.0190 |     328 B |
| CopyForeachAdd | .NET 6.0  | .NET 6.0  | 5         | 41.76 ns | 0.411 ns | 0.385 ns | 0.0148 |     256 B |
| CopyForAdd     | .NET 6.0  | .NET 6.0  | 5         | 42.47 ns | 0.466 ns | 0.413 ns | 0.0148 |     256 B |
| CopyUsingLinq  | .NET 8.0  | .NET 8.0  | 5         | 53.81 ns | 0.497 ns | 0.465 ns | 0.0190 |     328 B |
| CopyUsingLinq  | .NET 6.0  | .NET 6.0  | 5         | 60.15 ns | 0.424 ns | 0.354 ns | 0.0190 |     328 B |

.NET7以上なら`Span`経由が最速。使えないなら地道に追加するのがベター。

