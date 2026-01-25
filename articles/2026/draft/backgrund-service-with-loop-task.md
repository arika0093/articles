---
title: memo
pubDatetime: 2025-12-22T09:53:16+09:00
modDatetime: 2026-01-24T22:42:37+09:00
published: false
---

## TL;DR
1. `Microsoft.Extensions.Hosting`の10.0.0以降を使用する
2. `ExecuteAsync`内部の処理をそのまま`Task.Run`でラップする

## 問題

```csharp
public class MyExecuteWorker(MyExecuterService myExecuter) : BackgroundService
{
    // 一分おきに実行したい
    private readonly PeriodicTimer _timer = new(TimeSpan.FromMinutes(1));
    
    private async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            // 何かしらを定期的に呼び出す
            await myExecuter.TestCall();
            // 次の時間になるまで待機
            await _timer.WaitForNextTickAsync(stoppingToken);
        }
    }
}
```

```csharp
// 似たようなサービスをいくつか登録する
services.AddHostedService<MyExecuteWorker>();
services.AddHostedService<MyExecuteWorker2>();
services.AddHostedService<MyExecuteWorker3>();
```

どれも動かない。

## 何が起こっているのか

とりあえず現物のソースを見てみます。

Ver 9.0.11
https://github.com/dotnet/runtime/blob/v9.0.11/src/libraries/Microsoft.Extensions.Hosting.Abstractions/src/BackgroundService.cs#L40-L56

Ver 10.0.0
https://github.com/dotnet/runtime/blob/v10.0.0/src/libraries/Microsoft.Extensions.Hosting.Abstractions/src/BackgroundService.cs#L40-L50

```csharp
public virtual Task StartAsync(CancellationToken cancellationToken)
{
    _stoppingCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
    // Ver 9.0.11
    _executeTask = ExecuteAsync(_stoppingCts.Token);
    if (_executeTask.IsCompleted)
    {
        return _executeTask;
    }
    return Task.CompletedTask;
}
```

元々のコードはExecuteAsyncをそのまま実行している。
とはいえ、`await`が出てきた時点でTaskが返ってくるから大丈夫そうにも見えるが…？

というわけで、実際に同じようなコードを書いて試してみる。
(TODO)


## 対策
### ✅️ `Microsoft.Extensions.Hosting`の10.0.0以降を使用する
Ver10でこの問題に修正が入り、StartAsync側で非同期実行してくれるようになった。

```diff
public virtual Task StartAsync(CancellationToken cancellationToken)
{
    _stoppingCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
-    // Ver 9.0.11
-    _executeTask = ExecuteAsync(_stoppingCts.Token);
-    if (_executeTask.IsCompleted)
-    {
-        return _executeTask;
-    }
+    // Ver 10.0.0
+    _executeTask = Task.Run(() => ExecuteAsync(_stoppingCts.Token), _stoppingCts.Token);
    return Task.CompletedTask;
}
```

というわけで、冒頭のコードはVer10以降ならそのまま動く。

### ✅️ `ExecuteAsync`内部の処理をそのまま`Task.Run`でラップする
まあそのまんまですね。

```csharp
public class MyExecuteWorker(MyExecuterService myExecuter) : BackgroundService
{
    // 一分おきに実行したい
    private readonly PeriodicTimer _timer = new(TimeSpan.FromMinutes(1));
    
    private Task ExecuteAsync(CancellationToken stoppingToken) =>
        // Task.Runでただ囲うだけ
        Task.Run(async () => {
            while (!stoppingToken.IsCancellationRequested)
            {
                // 何かしらを定期的に呼び出す
                await myExecuter.TestCall();
                // 次の時間になるまで待機
                await _timer.WaitForNextTickAsync(stoppingToken);
            }
        });
}
```

### ✅️ 自前で`IHostedService`を実装する
要するに`StartAsync`内部でそのまま上記の`Task.Run(...)`を呼び出せば良い。これもそのままですね。

### ❌️ `await Task.Yield()`を使う
TODO

### ❌️ `ServicesStartConcurrently`の設定を変える
AIに聞くとこれを解決策として出してくるが、ちょっと意味合いが違う。

```csharp
services.Configure<HostOptions>(options =>
{
    options.ServicesStartConcurrently = true;
    options.ServicesStopConcurrently = true;
});
```

これは実際には複数の`StartAsync`開始を並列でやってくれるだけなので、ブロッキング問題は解決していない。


## 参考
https://github.com/dotnet/runtime/issues/36063
https://github.com/dotnet/runtime/pull/116283
https://medium.com/@florentbunjaku02/why-task-yield-is-used-in-backgroundservice-266cfcd6cb28
https://blog.stephencleary.com/2020/05/backgroundservice-gotcha-startup.html

