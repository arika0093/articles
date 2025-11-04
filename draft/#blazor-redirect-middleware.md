

ダメな例

```csharp
public class FooBarRedirectMiddleware(FooBarService service) : IMiddleware
{
    private const string RedirectPath = "/user/settings";
    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        var isRedirectNeeds = service.Check();
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

すべてのファイル(js, css)がリダイレクトされてしまう！

Copilotに聞いて出てきたものを試す。

razorコンポーネントのFilterとして実装してみる。

```csharp
public class FooBarRedirectFilter : IEndpointFilter
{
    private const string RedirectPath = "/user/settings";
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

結局だめだった。

結局

```razor
@inject FooBarService Service
@inject NavigationManager Navigation
@implements IDisposable
@code {
    private const string RedirectUrl = "/user/current";
    private IDisposable? registration;

    protected override async Task OnInitializedAsync()
    {
        await CheckAndRedirectIfNeeded();
    }

    protected override void OnAfterRender(bool firstRender)
    {
        if (firstRender)
        {
            registration = Navigation.RegisterLocationChangingHandler(OnLocationChanging);
        }
    }

    // 初回読み込み時(Reload時など)に現在のURLをチェックし、必要ならリダイレクトする
    private async Task CheckAndRedirectIfNeeded()
    {
        var flag = await CheckIfRedirectNeeded(Navigation.Uri);
        if (flag)
        {
            Navigation.NavigateTo(RedirectUrl);
        }
    }

    // ナビゲーションが発生するたびに遷移先のURLをチェックし、必要な場合は遷移を無効化する
    private async ValueTask OnLocationChanging(LocationChangingContext context)
    {
        var flag = await CheckIfRedirectNeeded(context.TargetLocation);
        if (flag)
        {
            context.PreventNavigation();
        }
    }

    // リダイレクトが必要かどうかを判定する
    private async Task<bool> CheckIfRedirectNeeded(string targetUrl)
    {
        var isRedirectNeeds = await Service.Check();
        var alreadyOnRedirectPage = targetUrl.EndsWith(RedirectUrl, StringComparison.OrdinalIgnoreCase);
        return isRedirectNeeds && !alreadyOnRedirectPage;
    }

    public void Dispose()
    {
        registration?.Dispose();
    }
}
```



