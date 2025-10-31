
ASP.NET Core Identity
https://learn.microsoft.com/ja-jp/aspnet/core/security/authentication/identity?view=aspnetcore-9.0

テンプレートから立ち上げできる
けど、でかい、よくわからん、もうちょっとミニマムにしたい、カスタマイズしたい

Blazor.Authを使う
https://github.com/BitzArt/Blazor.Auth
https://bitzart.github.io/Blazor.Auth/

概念の説明

JWTを使った認証
JWTと呼ばれるトークンをリクエスト毎に送りつけ(Cookieを使う)、サーバー側はそこから情報を取り出すだけ
サーバー側でセッション状態を保持しなくてよい・JWTは署名がつけられるので改ざん耐性がある。

JWTは複数セットすることもできる。
資格情報等を突っ込んでおき有効期限を短くしたAccessTokenと、それを更新するための有効期限が長いRefreshTokenの2個セットで運用。
RefreshTokenはアプリ側で永続化しておき(DB等)、そこから参照・無効化できるようにしておく必要がある。

JWTにはClaimと呼ばれる情報を埋め込むことができる。
例えば、`name`や`email`など。これを埋め込んでおけば、アプリ側でその情報を取り出してユーザー情報として利用できる。
標準的なもの(上記のnameなど)は[RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519)で定義されているのでそれを使うのが無難。
独自のもの(従業員ID, 部署名など)を定義して使うことも可能。

Claimsに`role`として情報を埋め込むことで、ロールベールのアクセス制御(RBAC)が実現できる。
`role=admin`と突っ込んでおいて、アプリ側でそれをチェックするイメージ。

実際のコード

ユーザーDB

```
[Index(nameof(UserPublicId), IsUnique = true)]
[Comment("ユーザー情報")]
public class UserInfo
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Comment("ID")]
    public int UserId { get; set; }

    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Comment("公開用ID")]
    public Guid UserPublicId { get; set; }

    [Comment("ユーザー名")]
    public string? DisplayName { get; set; }

    [Comment("メールアドレス")]
    public string? Email { get; set; }

    [Comment("権限")]
    public Role Role { get; set; }

    // ----------------------
    public virtual UserLoginPassword? LoginPassword { get; set; }
    public virtual ICollection<UserToken> Tokens { get; set; } = [];
}

[Comment("ユーザー情報/パスワードログイン")]
public class UserLoginPassword
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Comment("ID")]
    public int UserLoginPasswordId { get; set; }

    [Comment("ユーザーID")]
    public int UserId { get; set; }

    [Comment("パスワード")]
    public byte[] HashedPassword { get; set; }

    [Comment("salt")]
    public byte[] Salt { get; set; }

    // ----------------------
    [ForeignKey(nameof(UserId))]
    public UserInfo User { get; set; }
}

[Comment("ユーザー情報/トークン")]
public class UserToken
{
    [Key]
    [Comment("リフレッシュトークン")]
    public string RefreshToken { get; set; }

    [Comment("ユーザーID")]
    public int UserId { get; set; }

    [Comment("トークンの作成日時")]
    public DateTimeOffset CreatedAt { get; set; }

    [Comment("トークンの有効期限")]
    public DateTimeOffset ExpiresAt { get; set; }

    [ForeignKey(nameof(UserId))]
    public UserInfo User { get; set; }
}

public enum Role
{
    Admin = 1,
    Editor = 2,
    Viewer = 3,
}
```


認証部分

```cs
public class SignInPayload
{
    public required string PublicId { get; set; }
    public required string Password { get; set; }
}

public class SimpleAuthenticationService(
    IDbContextFactory<AppDbContext> dbContextFactory,
    BuildJwtService buildJwtService,
    ILogger<SimpleAuthenticationService> logger
) : AuthenticationService<SignInPayload>
{
    // ログイン処理
    public override async Task<AuthenticationResult> SignInAsync(
        SignInPayload signInPayload,
        CancellationToken cancellationToken = default
    )
    {
        // DBからユーザー情報を取得
        using var dbContext = await dbContextFactory.CreateDbContextAsync();
        var user = await dbContext
            .Users.Include(u => u.LoginPassword)
            .FirstOrDefaultAsync(u => u.UserPublicId == signInPayload.PublicId, cancellationToken);
        // パスワード検証
        var hashedPassword = user?.LoginPassword?.HashedPassword ?? [];
        var salt = user?.LoginPassword?.Salt ?? [];
        var passwordVerify = PasswordHashHelper.Verify(
            signInPayload.Password,
            hashedPassword,
            salt
        );
        // ユーザーが無い OR パスワード不一致なら認証失敗
        if (user == null || user?.LoginPassword == null || !passwordVerify)
        {
            string reason;
            if (user == null)
            {
                reason = "User not found";
            }
            else if (user?.LoginPassword == null)
            {
                reason = "No password data";
            }
            else
            {
                reason = "Incorrect password";
            }
            return Failure("Invalid ID or password.");
        }
        // ------------------
        // 認証成功
        // 得られた情報からClaims/jwtを生成する
        var claims = GenerateClaimsFromUser(user);
        var jwtPair = buildJwtService.BuildJwtPair(claims);
        // DBにTokenを保存する
        dbContext.UserTokens.Add(
            new()
            {
                UserId = user.UserId,
                RefreshToken = jwtPair.RefreshToken!,
                CreatedAt = DateTimeOffset.UtcNow,
                ExpiresAt = jwtPair.RefreshTokenExpiresAt!.Value,
            }
        );
        await dbContext.SaveChangesAsync(cancellationToken);
        return Success(jwtPair);
    }

    // トークン更新
    public override async Task<AuthenticationResult> RefreshJwtPairAsync(
        string refreshToken,
        CancellationToken cancellationToken = default
    )
    {
        // トークンをDBから探す
        using var dbContext = await dbContextFactory.CreateDbContextAsync();
        var userToken = await dbContext
            .UserTokens.Include(ut => ut.User)
            .FirstOrDefaultAsync(ut => ut.RefreshToken == refreshToken);
        if (userToken == null)
        {
            return Failure("Invalid refresh token.");
        }
        if (userToken.ExpiresAt < DateTimeOffset.UtcNow)
        {
            // 有効期限切れの場合、DBから削除する
            dbContext.UserTokens.Remove(userToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            return Failure("Refresh token expired.");
        }
        // 有効であれば新しいJWTペアを生成する
        var claims = GenerateClaimsFromUser(userToken.User);
        var jwtPair = buildJwtService.BuildJwtPair(claims);
        return Success(jwtPair);
    }

    // ユーザー情報からClaimsを生成する
    private static List<Claim> GenerateClaimsFromUser(UserInfo user)
    {
        List<Claim> roleClaims = [];
        var nameClaim = new Claim(ClaimTypes.Name, user.DisplayName ?? "");
        var gidClaim = new Claim(ClaimTypes.NameIdentifier, user.UserPublicId ?? "");
        var emailClaim = new Claim(ClaimTypes.Email, user.Email ?? "");
        foreach (var role in user.Roles)
        {
            roleClaims.Add(new Claim(ClaimTypes.Role, role.Role.Name));
        }
        return [nameClaim, gidClaim, emailClaim, .. roleClaims];
    }
}
```

```cs
public class BuildJwtService
{
    // appsettings.jsonから取得される秘密鍵
    private string SecretKey { get; }

    // トークン有効期限の設定
    private readonly TimeSpan AccessTokenDuration = TimeSpan.FromMinutes(15);

    // リフレッシュトークン有効期限の設定
    private readonly TimeSpan RefreshTokenDuration = TimeSpan.FromDays(30);

    private readonly SigningCredentials _signingCredentials;
    private readonly JwtSecurityTokenHandler _tokenHandler;

    public BuildJwtService(IConfiguration configuration)
    {
        SecretKey =
            configuration.GetValue<string>("Jwt:SecretKey")
            ?? throw new InvalidDataException("Jwt:SecretKey is not configured.");
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SecretKey));
        _signingCredentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);
        _tokenHandler = new JwtSecurityTokenHandler();
    }

    /// <summary>
    /// JWT tokenを生成します。
    /// </summary>
    public JwtPair BuildJwtPair(IEnumerable<Claim> claims)
    {
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
}
```

パスワード生成ユーティリティ
```cs
public static class PasswordHashHelper
{
    /// <summary>
    /// パスワードのハッシュを生成する
    /// </summary>
    /// <param name="password">パスワード</param>
    /// <returns>ハッシュ化されたパスワード</returns>
    public static PasswordHashResult Generate(string password)
    {
        // salt付きSHA256ハッシュを生成する
        var salt = RandomNumberGenerator.GetBytes(16);
        var passwordBytes = System.Text.Encoding.UTF8.GetBytes(password);
        var saltedPassword = salt.Concat(passwordBytes).ToArray();
        var hashBytes = SHA256.HashData(saltedPassword);
        return new PasswordHashResult(hashBytes, salt);
    }

    /// <summary>
    /// パスワードを検証する
    /// </summary>
    /// <param name="password">パスワード</param>
    /// <param name="hashedPassword">ハッシュ化されたパスワード</param>
    /// <param name="salt">ソルト</param>
    /// <returns></returns>
    public static bool Verify(string password, byte[] hashedPassword, byte[] salt)
    {
        var passwordBytes = System.Text.Encoding.UTF8.GetBytes(password);
        var saltedPassword = salt.Concat(passwordBytes).ToArray();
        var computedHash = SHA256.HashData(saltedPassword);
        return computedHash.SequenceEqual(hashedPassword);
    }

    public record PasswordHashResult(byte[] HashedPassword, byte[] Salt);
}
```

Web

Login
```razor
@using App.Web.Auth
@using BitzArt.Blazor.Auth
@page "/login"

<MudTextField Label="Id" @bind-Value="Id" Variant="Variant.Outlined" FullWidth="true" Margin="Margin.Dense" />
<MudTextField Label="Password" @bind-Value="Password" Variant="Variant.Outlined" FullWidth="true" Margin="Margin.Dense" InputType="InputType.Password" />
<MudButton Variant="Variant.Filled" Color="Color.Primary" OnClick="HandleLogin">ログイン</MudButton>

@inject NavigationManager Navigation
@inject IUserService<SignInPayload> UserService
@code {
    [SupplyParameterFromQuery]
    public string? ReturnUrl { get; set; }

    private string Id = "";
    private string Password = "";

    private async Task HandleLogin()
    {
        var payload = new SignInPayload
        {
            PublicId = Id,
            Password = Password
        };
        var result = await UserService.SignInAsync(payload);
        if (result.IsSuccess)
        {
            Navigation.NavigateTo(ReturnUrl ?? "/", forceLoad: true);
        }
        else
        {
            // Handle login failure (e.g., show error message)
        }
    }
}

```

Logout
```razor
@using App.Web.Auth
@using BitzArt.Blazor.Auth
@page "/logout"

@inject NavigationManager Navigation
@inject IUserService<SignInPayload> UserService
@code {
    [SupplyParameterFromQuery]
    public string? ReturnUrl { get; set; }

    protected override async Task OnInitializedAsync()
    {
        // Logout
        await UserService.SignOutAsync();
        // Redirect to the specified ReturnUrl or to the home page
        var redirectUrl = ReturnUrl ?? "/";
        Navigation.NavigateTo(redirectUrl, forceLoad: true);
    }
}
```

Routes
```razor
<Router AppAssembly="typeof(Program).Assembly">
    <Found Context="routeData">
        <AuthorizeRouteView RouteData="routeData" DefaultLayout="typeof(Layout.MainLayout)">
            <NotAuthorized>
                @* ユーザーは認証されているが、権限がない場合は AccessDenied *@
                @* ユーザー自体が認証されていない場合は RedirectTo *@
                @if (context.User != null)
                {
                    <AccessDenied />
                }
                else
                {
                    <RedirectToLogin />
                }
            </NotAuthorized>
        </AuthorizeRouteView>
    </Found>
</Router>
```


Program.cs
```cs
builder.AddBlazorAuth<SimpleAuthenticationService>();

app.MapAuthEndpoints();
```



参考文献
JWT関連
https://qiita.com/asagohan2301/items/cef8bcb969fef9064a5c
https://auth0.com/blog/jp-refresh-tokens-what-are-they-and-when-to-use-them/
https://zenn.dev/ayumukob/articles/640cbf4a1ff3ed
https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-token-claims
