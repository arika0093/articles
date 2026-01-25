---
title: "【BlazorLocalTime】Blazor Serverでタイムゾーンを考慮した日時を正しく表示/編集する"
pubDatetime: 2025-06-22
published: true
tags: []
zenn:
  published: true
  emoji: "🕰️"
  type: "tech"
  topics: []
---


サーバーサイドBlazor（以下、Blazor Server）は直感的な記法でWebアプリを作成しやすいのですが、日時(`DateTime`)の取り扱いに注意が必要です。

## 問題
以下のコードにはバグがあります。わかりますか？

```razor
<p>@DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")</p>
```

正解は「**ユーザーから見た現在時刻ではなく、サーバー上の現在時刻が表示される**」です。
Blazorホストサーバーのタイムゾーンによって時刻がフォーマットされるため、ユーザー側から見て正しくない時間になってしまいます。

このバグは BlazorホストサーバーのTimeZone ≠ ユーザーTimeZone の時に発生します。
この性質上、開発環境では気づきにくい厄介なバグになりがちです。

また、同じようなことが日時入力でも言えます。
要するに、入力された時間が「どのタイムゾーンのものか」を判別することができません。

```razor
<InputDate Type="InputDateType.DateTimeLocal" @bind-Value="dt" />
@code {
    private DateTime dt { get; set; }
    private void SaveToDatabase()
    {
        // UTC時刻に正しく変換できない（サーバー側のTZを見てしまう）
        var utc = dt?.ToUniversalTime();
    }
}
```

## 作ったもの
上記問題を手っ取り早く解決するためのライブラリとして `BlazorLocalTime` を作成しました。
https://github.com/arika0093/BlazorLocalTime

実際に動いている現物を見たい場合は、↓にデモが置いてあります。
https://arika0093.github.io/BlazorLocalTime/

### 下準備
まずは[NuGet](https://www.nuget.org/packages/BlazorLocalTime)から`BlazorLocalTime`をインストールします。

```bash
dotnet add package BlazorLocalTime
```

次に、Program.cs にサービスを登録します。

```csharp
builder.Services.AddBlazorLocalTimeService();
```

最後に、以下のコンポーネントを Routes.razor（または MainLayout.razor など）に追加します。

```razor
@using BlazorLocalTime
<BlazorLocalTimeProvider />
```

### 使い方

単純な文字列として時刻を表示するときは以下のように使います。
```razor
<LocalTimeText Value="@dt" Format="yyyy-MM-dd HH:mm:ss" />
```

`DateTimeOffset`として変換後の値を受け取ることもできます。
```razor
<LocalTime Value="@DateTime.UtcNow" Context="dt">
    @dt.ToString("yyyy-MM-dd HH:mm:ss")
</LocalTime>
```

コード側で変換することも可能です。
```razor
@inject ILocalTimeService LocalTimeService
@code {
    private void ButtonClicked()
    {
        var localNow = LocalTimeService.ToLocalTime(DateTime.UtcNow);
    }
}
```

入力フォームの場合は以下のように使います。
```razor
<LocalTimeForm @bind-Value="Dt" Context="dtf">
    <InputDate Type="InputDateType.DateTimeLocal" @bind-Value="dtf.Value" />
    @* or *@
    <InputDate Type="InputDateType.Date" @bind-Value="dtf.Date" />
    <InputDate Type="InputDateType.Time" @bind-Value="dtf.Time" />
</LocalTimeForm>

@code {
    private DateTime Dt { get; set; } = DateTime.UtcNow;
}
```

勿論、MudBlazorなどのコンポーネントライブラリでも同様に使えます。


## 原理
殆ど[ここ](https://www.meziantou.net/convert-datetime-to-user-s-time-zone-with-server-side-blazor-time-provider.htm)で説明されているのと同じですが、日本語で改めて説明しておきます。

まず、ユーザー側のTimeZoneを取得する必要があります。
Blazorではどうしようもないので、ここはJavascriptを実行する必要があります。

```js
export function getBrowserTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
```

上記ファイルを`.js`で用意したうえで、この関数をBlazorのJS相互運用機能(`IJSRuntime`)で呼び出し、得られた結果を`ILocalTimeService`に突っ込みます。
この処理を呼び出すために、`<BlazorLocalTimeProvider />`を適当な場所に追加してもらう必要があります。

```csharp
public interface ILocalTimeService
{
    TimeZoneInfo? TimeZoneInfo { get; set; }
    public DateTime ToLocalTime(DateTime utcDateTime);
    // and more ...
}

public class BlazorLocalTimeProvider : ComponentBase
{
    private const string JsPath = "./wwwroot/BlazorLocalTimeProvider.razor.js";

    [Inject]
    private IJSRuntime JsRuntime { get; set; } = null!;
    [Inject]
    private ILocalTimeService LocalTimeService { get; set; } = null!;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            await using var module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", JsPath);
            var timeZoneString = await module.InvokeAsync<string>("getBrowserTimeZone");
            var timeZone = TimeZoneInfo.FindSystemTimeZoneById(timeZoneString);
            LocalTimeService.TimeZoneInfo = timeZone;
        }
    }
}
```

`ILocalTimeService`はユーザーごとに確保したいため、`AddScoped`でDIしておきます。
これが先程の`builder.Services.AddBlazorLocalTimeService()`でやっていることです。
```csharp
public static class BlazorLocalTimeExtension
{
    public static IServiceCollection AddBlazorLocalTimeService(
        this IServiceCollection services)
    {
        services.AddScoped<ILocalTimeService, LocalTimeService>();
        return services;
    }
}
```

あとは、得られた`TimeZoneInfo`を使ってUTC時刻から変換すればOKです。
```csharp
public class LocalTimeService : ILocalTimeService
{
    public DateTime ToLocalTime(DateTime utcDateTime)
        => TimeZoneInfo.ConvertTimeFromUtc(utcDateTime, TimeZoneInfo!);
    // and more...
}
```

なお、初回レンダリング時(`OnInitialized`)では上記Javascript関数がまだ実行されていないため、変換エラーとなります。
その対処として、イベントハンドラーを用意しておき、登録時に呼び出し→`StateHasChanged`でリフレッシュをかけるようにしてあります。

```csharp
public class LocalTimeService : ILocalTimeService
{
    private TimeZoneInfo? _timeZoneInfo;
    public TimeZoneInfo? TimeZoneInfo
    {
        get => _timeZoneInfo;
        set
        {
            _timeZoneInfo = value;
            LocalTimeZoneChanged.Invoke(this, EventArgs.Empty);
        }
    }
    public event EventHandler LocalTimeZoneChanged = delegate { };
}

public sealed partial class LocalTimeText : ComponentBase, IDisposable
{
    [Inject]
    private ILocalTimeService LocalTimeService { get; set; } = null!;

    protected override void OnInitialized()
    {
        LocalTimeService.LocalTimeZoneChanged += OnLocalTimeZoneChanged;
    }

    public void Dispose()
    {
        LocalTimeService.LocalTimeZoneChanged -= OnLocalTimeZoneChanged;
    }

    private void OnLocalTimeZoneChanged(object? sender, EventArgs e)
    {
        StateHasChanged();
    }
}
```

入力フォームの場合も基本的には同じですが、UIライブラリごとに`DateTime`/`DateOnly`/`TimeOnly`/`TimeSpan`のどれを使うかがまちまちなので、全てに対応できるようにまとめて用意してあります。

```csharp
// <LocalTimeForm>を使ったときの子要素に渡されるクラス
public record LocalTimeFormValue
{
    private DateTime? _innerValue;

    public required DateTime? Value
    {
        get => _innerValue;
        set
        {
            _innerValue = value;
            ValueChanged.InvokeAsync(value);
        }
    }

    public DateOnly? Date
    {
        get =>
            Value.HasValue
                ? new DateOnly(Value.Value.Year, Value.Value.Month, Value.Value.Day)
                : null;
        set => DateChanged.InvokeAsync(value);
    }

    public TimeOnly? Time
    {
        get =>
            Value.HasValue
                ? new TimeOnly(Value.Value.Hour, Value.Value.Minute, Value.Value.Second)
                : null;
        set => TimeChanged.InvokeAsync(value);
    }

    public TimeSpan? TimeSpan
    {
        get =>
            Value.HasValue
                ? new TimeSpan(Value.Value.Hour, Value.Value.Minute, Value.Value.Second)
                : null;
        set => TimeSpanChanged.InvokeAsync(value);
    }

    public required EventCallback<DateTime?> ValueChanged { get; init; }
    public required EventCallback<DateOnly?> DateChanged { get; init; }
    public required EventCallback<TimeOnly?> TimeChanged { get; init; }
    public required EventCallback<TimeSpan?> TimeSpanChanged { get; init; }
}
```

## まとめ
……とこのように、毎回書くにはなかなか面倒な内容です。
こんなのを都度書きたくないのでライブラリ化しました。
ぜひ使ってみてください。
https://github.com/arika0093/BlazorLocalTime
