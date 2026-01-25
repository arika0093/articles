---
title: "【C#】Blazorで強制リダイレクトを実装する方法"
pubDatetime: 2025-11-05T21:41:21+09:00
modDatetime: 2026-01-25T23:20:04+09:00
published: true
tags: ["csharp", "dotnet", "blazor"]
zenn:
  published: true
  emoji: "🚀"
  type: "tech"
  topics: ["csharp", "dotnet", "blazor"]
---


例えばユーザーログイン後に初期設定ページに強制的に転移させるなど、特定の条件に基づいてBlazorアプリケーション内で強制リダイレクトを実装したい場合があります。
この場合、どのページを開こうとしても指定したページにリダイレクトしてほしいわけです。
調べてみた範囲で直接的にその方法の記載が見つからなかったため、いくつかの方法を試してみました。[^1]

[^1]: 認証済でないならリダイレクトとかはたくさん出てくるんですけど、そういうのはAuthorizeViewとかでできるのでちょっと違う。。

## 要件

- どのページを開いても特定のページに遷移する
- 特定ページから別のページに移動しようとすると警告を出し、遷移をキャンセルする
- On/Offを切り替えられる
- 凝ったことはやらない

## 試してみる
やってみます。

`FooBarService`というサービスを用意し、この中でリダイレクトが必要かどうかを判定する`Check`メソッドを持つことにします。

```csharp
public class FooBarService
{
    public bool Enabled { get; set; } = false;
    public bool Check()
    {
        // ここでリダイレクトが必要かどうかを判定するロジックを実装
        return Enabled;
    }
}
```

### 方法1: Middlewareでリダイレクトを試みる

ASP.NET的発想です。単純にMiddlewareでリダイレクトを試みます。

```csharp
public class FooBarRedirectMiddleware(FooBarService service) : IMiddleware
{
    private const string RedirectPath = "/setting";
    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        // リダイレクトが必要かどうかを判定
        var isRedirectNeeds = service.Check();
        // すでにリダイレクト先のページにいるかどうか
        var alreadyEntered = context.Request.Path.Equals(
            RedirectPath,
            StringComparison.OrdinalIgnoreCase
        );
        if(isRedirectNeeds && !alreadyEntered)
        {
            context.Response.Redirect(RedirectPath);
        }
        await next(context);
    }
}
```

あとはProgram.csで登録します。

```csharp
// Programs.cs
builder.Service.AddScoped<FooBarService>();

app.UseAntiforgery();
app.MapStaticAssets();
app.MapControllers();

app.UseMiddleware<FooBarRedirectMiddleware>();
app.MapRazorComponents<App>().AddInteractiveServerRenderMode();

await app.RunAsync();
```

結果は……

静的ファイル(js, css)の取得リクエストもすべてリダイレクトされてしまい、アプリケーションが正しく動作しません！
![](image.png)

ミドルウェアの記載順序的には静的ファイルには効かない気がするのですが……
とりあえずこの方法は諦めます。

### 方法2: EndpointFilterでリダイレクトを試みる
GitHub Copilotに聞いてみたところ、RazorコンポーネントのEndpointFilterで実装する方法が出てきました。
というわけで試します。

```csharp
public class FooBarRedirectFilter : IEndpointFilter
{
    private const string RedirectPath = "/setting";
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context,
        EndpointFilterDelegate next
    )
    {
        // Scopedなサービスを使う場合はContextから拾う
        var http = context.HttpContext;
        var service = http.RequestServices.GetRequiredService<FooBarService>();
        var isRedirectNeeds = service.Check();
        var alreadyEntered = http.Request.Path.Equals(
            RedirectPath,
            StringComparison.OrdinalIgnoreCase
        );
        if(isRedirectNeeds && !alreadyEntered)
        {
            http.Response.Redirect(RedirectPath);
        }
        return await next(context);
    }
}
```

あとはProgram.csで登録します。

```csharp
// Programs.cs
builder.Service.AddScoped<FooBarService>();
// 忘れずに追加
builder.Service.AddSingleton<FooBarRedirectFilter>();

app.UseAntiforgery();
app.MapStaticAssets();
app.MapControllers();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode()
    .AddEndpointFilter<RazorComponentsEndpointConventionBuilder, FooBarRedirectFilter>();

await app.RunAsync();
```

結果は……
機能しません！そもそもこういう用途で使うものなのかも謎（ドキュメントが何も引っかからない！）。

### 方法3: コンポーネント内で判定してリダイレクト
結局、コンポーネント内で判定してリダイレクトする方法が一番シンプルで確実そうです。

ForceRedirect.razorというコンポーネントを作成し、ここでリダイレクトの判定と実行を行います。

```razor
@inject SampleSettingService Service
@inject NavigationManager Navigation
@inject IDialogService DialogService
@implements IDisposable
@code {
    // 遷移させたいURL
    private const string RedirectUrl = "/setting";
    private IDisposable? registration;

    protected override async Task OnInitializedAsync()
    {
        await CheckAndRedirectIfNeeded();
    }

    protected override void OnAfterRender(bool firstRender)
    {
        if(firstRender)
        {
            registration = Navigation.RegisterLocationChangingHandler(OnLocationChanging);
        }
    }

    // 初回読み込み時(Reload時など)に現在のURLをチェックし、必要ならリダイレクトする
    private async Task CheckAndRedirectIfNeeded()
    {
        var flag = await CheckIfRedirectNeeded(Navigation.Uri);
        if(flag)
        {
            Navigation.NavigateTo(RedirectUrl);
        }
    }

    // ナビゲーションが発生するたびに遷移先のURLをチェックし、必要な場合は遷移を無効化する
    private async ValueTask OnLocationChanging(LocationChangingContext context)
    {
        // 現在ページが対象ページでないときは無視する
        var currentFlag = await CheckIfRedirectNeeded(Navigation.Uri);
        var targetFlag = await CheckIfRedirectNeeded(context.TargetLocation);
        if(!currentFlag && targetFlag)
        {
            context.PreventNavigation();
            // 何も出ないと不親切なのでメッセージを表示する
            // これはMudBlazorのDialogServiceを使った例
            await DialogService.ShowMessageBox(new()
            {
                Title = "Redirect Notice",
                Message = "You are being redirected to the settings page to update your configuration.",
                YesText = "OK"
            });

        }
    }

    // リダイレクトが必要かどうかを判定する
    private async Task<bool> CheckIfRedirectNeeded(string targetUrl)
    {
        // リダイレクトが必要な設定になっているか
        var isRedirectNeeds = await Service.Check();
        // すでにリダイレクト先のページにいるかどうか
        var alreadyOnRedirectPage = targetUrl.EndsWith(RedirectUrl, StringComparison.OrdinalIgnoreCase);
        return isRedirectNeeds && !alreadyOnRedirectPage;
    }

    public void Dispose()
    {
        registration?.Dispose();
    }
}
```

あとは `MainLayout.razor` にでもこのコードを入れておけばOKです。

```razor diff
 @inherits LayoutComponentBase
 
 <MudThemeProvider Theme="@_theme" IsDarkMode="_isDarkMode" />
 <MudPopoverProvider />
 <MudDialogProvider />
 <MudSnackbarProvider />
 <MudLayout>
     @* 略 *@
 </MudLayout>
+<ForceRedirect />
```

検証用にログインもどきページも作成しておきます。

```razor
@page "/login"

<MudButton Class="mt-3" Variant="Variant.Filled" Color="Color.Primary" OnClick="OnClick">
    ログイン(仮)
</MudButton>

@inject SampleSettingService Service
@inject NavigationManager Navigation
@code {
    private void OnClick()
    {
        // 例えばここでログインするなどして、強制リダイレクトを有効にしたとする
        Service.ForceRedirectEnabled = true;
        Navigation.NavigateTo("/", forceLoad: true);
    }
}
```

結果は……

うまくいってそう！
![](https://i.imgur.com/wBAkloK.gif)

## まとめ
結局コンポーネントでやるのかよという感じはありますが、期待する挙動になったので良しとします。

コードはここに置いてあります。
https://github.com/arika0093/BlazorForceRedirectSample
