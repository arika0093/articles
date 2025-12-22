
## 現象

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

## TL;DR
### うまくいったもの
1. `Microsoft.Extensions.Hosting`の10.0.0以降を使用する
2. `ExecuteAsync`内部の処理をそのまま`Task.Run`でラップする
3. 自前で`IHostedService`を実装する

### うまくいかなかったもの
1. `await Task.Yield()`を使う
2. `ServicesStartConcurrently`を使う

## 何が起こっているのか

とりあえず現物のソースを見る。

Ver 9.0.11
https://github.com/dotnet/runtime/blob/v9.0.11/src/libraries/Microsoft.Extensions.Hosting.Abstractions/src/BackgroundService.cs#L40-L56

Ver 10.0.0
https://github.com/dotnet/runtime/blob/v10.0.0/src/libraries/Microsoft.Extensions.Hosting.Abstractions/src/BackgroundService.cs#L40-L50

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

元々のコードはExecuteAsyncをそのまま実行している。
とはいえ、大本のコードも非同期処理をしているはずなので問題なさそうに見えるが…？

というわけで、実際に同じようなコードを書いて試してみる。
(TODO)



## NG例
```csharp
services.Configure<HostOptions>(options =>
{
    options.ServicesStartConcurrently = true;
    options.ServicesStopConcurrently = true;
});
```


## 解決
https://github.com/dotnet/runtime/issues/36063
https://github.com/dotnet/runtime/pull/116283



see: https://medium.com/@florentbunjaku02/why-task-yield-is-used-in-backgroundservice-266cfcd6cb28
https://blog.stephencleary.com/2020/05/backgroundservice-gotcha-startup.html

