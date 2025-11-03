---
title: "【C#】Blazor.Authで認証認可をシンプルに実装する"
emoji: "🔐"
type: "tech"
topics: ["csharp", "dotnet", "blazor", "authentication"]
published: false
---

Blazorで認証を実装していく際、組み込みのASP.NET Core Identityはちょっと大げさな感じですし、何をやっているのかイマイチわかりにくくて敷居が高いと感じることがあります。
そんなときに役立つのが`Blazor.Auth`ライブラリです。このライブラリを使うことで、認証機能をシンプルかつサクッと実装できます。
https://github.com/BitzArt/Blazor.Auth

実際に試してみたレポジトリはこちら。
https://github.com/arika0093/TryBlazorAuth

## 利点・欠点
まず良いところから。

* 実装が楽。組み込みのIdentityを使うよりもずっとシンプル。
* 公式のJWT実装だとHttpContextを触る関係で静的SSRにする必要があるが、Blazor.Authは専用のEndpointを用意してくれるのでInteractive Serverでも使える。

欠点としては
* 3rd-partyライブラリなので、この先使っていけるかはなんとも言えない。
  * とは言ってもやってることは単純そう。
* パスワードリセットやメール認証・2FAなどまで全部盛りにしたいときはIdentityの方が楽かもしれない。

といったところ。単純な認証認可を実装したい場合には良い選択肢になると思います。

## 使ってみる
### ライブラリを追加する
NuGetから`BitzArt.Blazor.Auth.Server`ライブラリを入れます。今回は2.1.0を使用。
https://www.nuget.org/packages/BitzArt.Blazor.Auth.Server

### 認証を行うコードを追加する（サインイン）
SampleAuthService というクラスを作成し、このクラスの中で認証ロジックを実装します。
いきなり全てを書くと複雑になるので、少しずつ実装を進めていきます。

```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BitzArt.Blazor.Auth;
using BitzArt.Blazor.Auth.Server;
using Microsoft.IdentityModel.Tokens;

namespace TryBlazorAuth.Auth;

// Payloadの型を指定してAuthenticationServiceを継承
public class SampleAuthService : AuthenticationService<SignInPayload>
{
    // --- デモ用にInMemoryでユーザー情報を保持 ---
    // 実際にはDBなどに保存・参照するイメージ。
    private Dictionary<string, UserInfo> Users { get; } =
        new()
        {
            ["user1"] = new UserInfo("user1", "user1", "Alice", "User"),
            ["user2"] = new UserInfo("user2", "user2", "Bob", "User"),
            ["admin"] = new UserInfo("admin", "admin", "Charlie", "Admin"),
        };

    // ------------------------------------------
    public override async Task<AuthenticationResult> SignInAsync(
        SignInPayload signInPayload,
        CancellationToken cancellationToken = default
    )
    {
        // ユーザーIDをPayloadから取得して、そこからDB等でユーザー情報を取得する
        // その後パスワードを検証して、OKならトークンを発行する。
        if (
            Users.TryGetValue(signInPayload.Id, out var user)
            && user.Password == signInPayload.Password
        )
        {
            return LoginSuccessful(user);
        }
        else
        {
            return Failure("Invalid credentials");
        }
    }
}

// ログインするのに必要な情報
public class SignInPayload
{
    public required string Id { get; set; }
    public required string Password { get; set; }
}

// ユーザー情報データ（デモ用）
internal record UserInfo(string Id, string Password, string Name, string Role);
```

`SignInAsync`メソッド内では、ユーザーIDとパスワードを検証し、成功した場合にJWTトークンを発行します。今回はDictionaryでユーザー情報を保持していますが、実際にはデータベースから取得する形になります。

次に`LoginSuccessful`メソッドを実装していきます。

```csharp
    private AuthenticationResult LoginSuccessful(UserInfo user)
    {
        // ユーザー情報をclaimsに追加する
        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Role, user.Role),
        };
        var jwt = BuildJwtPair(claims);
        return Success(jwt);
    }
```

ここでは、ユーザー情報をClaimとして追加し、JWTペアを生成する関数を呼び出しています。
JWTを使った認証においては、ユーザーの権限情報をClaimとしてトークンに含めることが一般的です。
今回は`Name`、`NameIdentifier`、`Role`の3つのClaimを追加しています。それぞれユーザーの名前、ID、ロールを表します。

最後に`BuildJwtPair`メソッドを実装します。また、ここでコンストラクタも合わせて実装します。

```csharp
    private readonly SigningCredentials _signingCredentials;
    private readonly JwtSecurityTokenHandler _tokenHandler;

    public SampleAuthService()
    {
        // 32文字以上推奨。実際にはIConfigurationなどから取得してください。
        var secretKey = "SuperSecretKeyForJwtTokenGeneration12345";
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
        _signingCredentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);
        _tokenHandler = new JwtSecurityTokenHandler();
    }

    private JwtPair BuildJwtPair(IEnumerable<Claim> claims)
    {
        var AccessTokenDuration = TimeSpan.FromMinutes(15); // アクセストークンの有効期限
        var RefreshTokenDuration = TimeSpan.FromDays(7);    // リフレッシュトークンの有効期限
        // -----
        var now = DateTime.UtcNow;

        // Access token
        // ユーザー権限(claims)をここで追加する。
        var accessTokenExpiresAt = now + AccessTokenDuration;
        var accessToken = _tokenHandler.WriteToken(
            new JwtSecurityToken(
                claims: claims,
                notBefore: now,
                expires: accessTokenExpiresAt,
                signingCredentials: _signingCredentials
            )
        );

        // Refresh token
        // JWTを更新するのに使用されるトークン
        var refreshTokenExpiresAt = now + RefreshTokenDuration;
        var refreshToken = _tokenHandler.WriteToken(
            new JwtSecurityToken(
                notBefore: now,
                expires: refreshTokenExpiresAt,
                signingCredentials: _signingCredentials
            )
        );

        return new JwtPair(accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt);
    }
```

何をやっているかというと、渡されたClaim情報を元に2種類のJWTトークンを生成しています。
片方は実際に権限情報やユーザー情報を含むアクセストークン、もう片方はアクセストークンを更新するためのリフレッシュトークンです。
アクセストークンは頻繁にやり取りされるため短めの有効期限にし、寿命が短いと不便なので自動更新できるようにリフレッシュトークンを用意する、というのが一般的なパターンです。
このあたりは下記リンクが参考になります。
https://zenn.dev/ayumukob/articles/640cbf4a1ff3ed

### 認証を行うコードを追加する（更新）
次に、JWTトークンを更新するための`RefreshJwtPairAsync`メソッドを実装します。これも先程のクラスに追加していきます。

```csharp
public class SampleAuthService : AuthenticationService<SignInPayload>
{
    // さっきの部分 (省略)
    // ------------------------------------
    // デモ用にInMemoryでユーザー情報と更新用トークンを保持
    // 実際にはDBなどに保存・参照するイメージ。
    private Dictionary<string, string> UsersRefreshTokens { get; } = [];

    public override async Task<AuthenticationResult> RefreshJwtPairAsync(
        string refreshToken,
        CancellationToken cancellationToken = default
    )
    {
        // 渡されたRefresh tokenを検証する
        // 今回はInMemoryで保持している中にあるかどうかを確認するだけ。
        // 実際にはDBから拾ってくる+無効化されてないかをチェックする。
        if (UsersRefreshTokens.Any(kvp => kvp.Value == refreshToken))
        {
            // 更新のためにユーザー情報がもう一度必要になる
            // そこで紐づくユーザーIDを取得して、再度ユーザー情報を取得する
            var userId = UsersRefreshTokens.First(kvp => kvp.Value == refreshToken).Key;
            var user = Users[userId];
            // 後はサインイン時と同じようにトークンを発行するだけ。
            return LoginSuccessful(user);
        }
        else
        {
            return Failure("Invalid refresh token");
        }
    }
}
```

忘れずに、サインインした時にリフレッシュトークンを保存するコードも追加します。言うまでもなく、実際にはDB等に保存してください。

```csharp diff
    private AuthenticationResult LoginSuccessful(UserInfo user)
    {
        // ユーザー情報をclaimsに追加する
        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Role, user.Role),
        };
        var jwt = BuildJwtPair(claims);

+        // リフレッシュトークンを保存する
+        UsersRefreshTokens[user.Id] = jwt.RefreshToken!;

        return Success(jwt);
    }
```

完成形のコードは以下URLで確認できます。
https://github.com/arika0093/TryBlazorAuth/blob/main/TryBlazorAuth/Auth/SampleAuthService.cs


### サービスを登録する
次に、`Program.cs`に認証サービスを登録します。

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.AddBlazorAuth<SampleAuthService>();
// 省略

var app = builder.Build();
app.MapAuthEndpoints();
// 省略
```

### _Imports.razorを編集する
この時点で認証認可機能は完成しています。後はBlazor側であれこれ書くだけです。
その前に、`_Imports.razor`に以下を追加しておきます。

```razor
@* 全てのページをログイン必須にする。除外したい場合は @attribute[AllowAnonymous]を先頭に付与する *@
@attribute [Authorize]
@* 認証認可関係のnamespace *@
@using TryBlazorAuth.Auth
@using BitzArt.Blazor.Auth
@using Microsoft.AspNetCore.Authorization
@using Microsoft.AspNetCore.Components.Authorization
@* 毎回Generics指定のクラスを書きたくないので、短縮版を用意しておく *@
@using SimpleLoginService = BitzArt.Blazor.Auth.IUserService<TryBlazorAuth.Auth.SignInPayload>
```

### ログインページを作成する
ログインページを用意します。今回はMudBlazorを使っていますが、このあたりは自由です。
注意点として、エラーが発生した際もページが更新されてしまうので、クエリパラメータでメッセージを受け取って表示するようにしています。

```razor
@* 誰でもアクセスできないといけないのでAllowAnonymousを付与 *@
@attribute [AllowAnonymous]
@page "/login"

<MudContainer MaxWidth="MaxWidth.Medium">
    <MudStack Spacing="3">
        <MudStack Row Spacing="2">
            <MudTextField Label="Id" @bind-Value="Id" Variant="Variant.Outlined" FullWidth="true" Margin="Margin.Dense" />
            <MudTextField Label="Password" @bind-Value="Password" Variant="Variant.Outlined" FullWidth="true" Margin="Margin.Dense" InputType="InputType.Password" />
        </MudStack>
        @if(!string.IsNullOrEmpty(Message))
        {
            <MudAlert Severity="Severity.Error">@Message</MudAlert>
        }
        <MudButton Variant="Variant.Filled" Color="Color.Primary" OnClick="HandleLogin">ログイン</MudButton>
    </MudStack>
</MudContainer>

@inject NavigationManager Navigation
@inject SimpleLoginService UserService
@code {
    [SupplyParameterFromQuery]
    public string? ReturnUrl { get; set; }

    [SupplyParameterFromQuery]
    public string? Message { get; set; }

    private string RedirectUrl => ReturnUrl ?? "/";

    // Form fields
    private string Id = "";
    private string Password = "";

    protected override async Task OnInitializedAsync()
    {
        // 既にログイン済みの場合は元のページへリダイレクト
        var state = await UserService.GetAuthenticationStateAsync();
        if(state.User.Identity?.IsAuthenticated == true)
        {
            Navigation.NavigateTo(RedirectUrl, forceLoad: true);
        }
    }

    private async Task HandleLogin()
    {
        var payload = new SignInPayload
        {
            Id = Id,
            Password = Password
        };
        var result = await UserService.SignInAsync(payload);
        if(result.IsSuccess)
        {
            // ログイン成功時は元のページへリダイレクト
            Navigation.NavigateTo(RedirectUrl, forceLoad: true);
        }
        else
        {
            // ログイン失敗時はエラーメッセージをクエリパラメータに付与してリダイレクト
            // (仕組み上失敗時もページが更新されてしまうので、URLにメッセージを含めて再表示させる)
            Navigation.NavigateTo($"/login?message={result.ErrorMessage}&returnUrl={ReturnUrl}", forceLoad: true);
        }
    }
}
```



## 参考文献
### JWT関連
https://qiita.com/asagohan2301/items/cef8bcb969fef9064a5c
https://auth0.com/blog/jp-refresh-tokens-what-are-they-and-when-to-use-them/
https://zenn.dev/ayumukob/articles/640cbf4a1ff3ed
https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-token-claims

