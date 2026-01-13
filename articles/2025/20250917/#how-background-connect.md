---
title: "【C#】BackgroundServiceをDIして他からデータを取得したい"
published: true
zenn:
  published: true
  emoji: "⚙"
  type: "tech"
  topics: ["csharp", "dotnet", "asp.net", "background"]
---


タイトルが意味不明だと思った方、正解です。

## やりたいこと
こういう`BackgroundService`があったとします。

```csharp
public class SampleBackgroundService : BackgroundService
{
    // Dataを定期的に更新し続ける
    public SampleData Data { get; private set; } = new();

    // 1分おきに呼び出す
    // PeriodicTimerを使うとTask.Delayよりも正確に呼び出せる
    private readonly PeriodicTimer _timer = new(TimeSpan.FromMinutes(1));

    // BackgroundServiceから呼び出されるので無限ループ
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while(!stoppingToken.IsCancellationRequested) {
            // 何かしらのデータを取得して更新する
            await FetchDataFromSomewhereAsync();
            await _timer.WaitForNextTickAsync(stoppingToken);
        }
    }

    // 手動でデータを更新したい場合はこれを直接呼び出す
    public async Task<SampleData> FetchDataFromSomewhereAsync()
    {
        // 何かしらのデータを取得する
        await Task.Delay(1000);
        Data = new SampleData { Value = DateTimeOffset.Now.ToString() };
        return Task.FromResult(Data);
    }
}

public record SampleData(string Value);
```

で、HostedServiceとして登録しておきます。

```csharp
builder.Services.AddHostedService<SampleBackgroundService>();
```

このようにすると1分おきにデータを更新できるようになります。

そして、更新されたデータを参照するために`SampleBackgroundService`をDIします。

```razor
@* Blazorの例 *@
@inject SampleBackgroundService SampleService

<p>現在のデータ: @SampleService.Data.Value</p>
<button @onclick="SampleService.FetchDataFromSomewhereAsync">手動更新</button>
```

すると以下のようなエラーとなります。

```
There is no registered service of type 'SampleBackgroundService'.
```

## 解決方法？

`AddHostedService`は`AddSingleton`してくれないんだ！というわけで以下のように書きます。
ServiceProviderからインスタンスを取得して登録しないと別個のインスタンスが生成されてしまうので、`GetRequiredService`から拾うようにします。

```csharp
builder.Services.AddSingleton<SampleBackgroundService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<SampleBackgroundService>());
```

これにて一件落着！
にしては記法がなんか気持ち悪いですね。本当にこれでいいのでしょうか。

## 本当の解決方法

クラスを分離しましょう。
データ保存用+手動更新のクラスと、それを呼び出す自動化クラス という構成にします。
(もっと言えばデータ保存用のクラスも別のほうが良いですが、今回は省略)

```csharp
// データ保存+手動更新のクラス
public class SampleDataService
{
    // 更新されたデータ
    public SampleData Data { get; private set; } = new();

    // データを更新する
    public async Task<SampleData> FetchDataFromSomewhereAsync()
    {
        // 何かしらのデータを取得する
        await Task.Delay(1000);
        Data = new SampleData { Value = DateTimeOffset.Now.ToString() };
        return Task.FromResult(Data);
    }
}

// 自動更新用クラス
public class SampleBackgroundService(SampleDataService dataService) : BackgroundService
{
    // 1分おきに呼び出す
    private readonly PeriodicTimer _timer = new(TimeSpan.FromMinutes(1));

    /// <inheritdoc/>
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while(!stoppingToken.IsCancellationRequested) {
            // データを取得して更新する
            await dataService.FetchDataFromSomewhereAsync();
            await _timer.WaitForNextTickAsync(stoppingToken);
        }
    }
}

public record SampleData(string Value);
```

Program.csは以下のようになります。

```csharp
builder.Services.AddSingleton<SampleDataService>();
builder.Services.AddHostedService<SampleBackgroundService>();
```

シンプルですね！

## まとめ
すごい初歩的な話ですが、redditでも[同じような質問](https://www.reddit.com/r/csharp/comments/1i6qh5e/is_it_common_to_double_register_a_service_for/)があったので潜在的に需要があるかもということでメモしておきます。
参考になれば幸いです。
