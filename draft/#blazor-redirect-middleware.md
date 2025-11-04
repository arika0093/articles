

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


razorコンポーネントのFilterとして実装してみる。

```csharp
public class FooBarRedirectFilter : IEndpointFilter
{
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

以下のように書いてもよい。

```csharp
```


