---
title: "【C#】同じ5行のコードが全く違って見える12の瞬間、に対するC#での回答"
emoji: "🚢"
type: "tech"
topics: ["dotnet"]
published: true
---



こんな記事がTwitterに流れてきました。 
https://zenn.dev/coconala/articles/reasons-for-continuing-to-learn

C#で同じようなことをやってみます。
元記事はおそらくフロントエンド想定なので、こちらも似たような環境を想定していきます。

:::message

C#だと元コードをほぼ変えずに解決できちゃうよ！というのが言いたいだけの記事です。

:::

## 元のコード

javascriptで書かれたコードが元になっています。

```js
async function getUserName(userId) {
  const response = await fetch(`https://api.example.com/users/${userId}`);
  const user = await response.json();
  return user.name;
}
```

まずはこのコードをC#で書いてみます。こんな感じでしょうか。
5行から11行になりましたが、まあ許容範囲でしょう。

```cs
public class GetUserNameService(IHttpClientFactory httpClientFactory)
{
    public async Task<string> GetUserNameAsync(string userId)
    {
        var httpClient = httpClientFactory.CreateClient();
        var response = await httpClient.GetAsync($"https://api.example.com/users/{userId}");
        var userJson = await response.Content.ReadAsStringAsync();
        var user = JsonSerializer.Deserialize<User>(userJson);
        return user.Name;
    }
}
```

## 最終形のコード
C#で元記事の項目をすべて考慮した場合、コードはどうなるか？を考えてみます。
APIの仕様はそのままと仮定しつつ[^1]、極力元記事に寄せていく（不必要なのは除く）と……

[^1]: そこまで話すとキリがないからです。そもそもC#の場合、API叩くよりもMagicOnionとかBlazorServerとかで直接通信したほうが楽な気がしている

```cs diff
public class GetUserNameService(IHttpClientFactory httpClientFactory)
{
-   public async Task<string> GetUserNameAsync(string userId)
+   public async Task<string> GetUserNameAsync(int userId)
    {
        var httpClient = httpClientFactory.CreateClient();
-       var response = await httpClient.GetAsync($"https://api.example.com/users/{userId}");
+       var response = await httpClient.GetAsync($"https://api/users/{userId}");
+       response.EnsureSuccessStatusCode();
        var userJson = await response.Content.ReadAsStringAsync();
        var user = JsonSerializer.Deserialize<User>(userJson);
        return user.Name;
    }
}
```

ほぼ変わってないですね。C#すごい！
というのは誇大広告ですが、実際どのように解決しているかを見ていきます。

### エラーハンドリング
> APIで500エラーが発生すると、どうなるでしょうか？
> エラーレスポンスのJSONに偶然"name": "Internal Server Error"が含まれていたら？

前者は`response.EnsureSuccessStatusCode()`を入れることで解決。
また、いずれにせよ`JsonSerializer.Deserialize`で`User`型にパースできずにコケます。

> Result型（成否を型レベルで保持） のような、エラーを明示的に扱う手法の価値も理解できるようになります。

元記事では`Result`型を返すようにしていましたが、基本的には例外で良いと思います。
それか`string?`にして`null`を返すとか。こちらならNullチェックだけで（簡易的な）エラーハンドリングができます。

### セキュリティ
> userIdに/admin/1が入って来たらどうなるでしょうか？

最低限の対策として、`userId`を`int`にしました。
まあ、そもそもパケット解析やDevTools, dnSpy等で接続先を見られる・変なリクエストを投げられる可能性はあるので、API側での対策は必須です。

### 認証・認可
> 認証（誰であるかの確認）も認可（何ができるかの確認）もなく

C#の良いところとして、DIでこのあたりの設定を後付できます。
なので、`IHttpClientFactory`で拾ってきた`HttpClient`にはすでに認証ヘッダーが付与されている、などが可能です。
元のコードが汚れないのがポイント。

### 信頼性
> 通信先のAPIから応答がない場合、どうなるでしょうか？
> このコードには、タイムアウトもリトライもありません。

`Microsoft.Extensions.Http.Resilience`の`AddStandardResilienceHandler`を使うことで、リトライやタイムアウトが簡単に設定できます。標準で以下のような内容が設定されます。[参考](https://blog.neno.dev/entry/2024/08/08/171524)
* RateLimit: 同時に最大1000
* タイムアウト: 10秒, トータル30秒
* リトライ: 3回、遅延2秒、指数バックオフ
* サーキットブレーカーあり

これも元コードに手を加える必要はありません。`Program.cs`に数行足せばOK。

### 保守性
> 保守性を学んだら、この関数が環境や暗黙知に依存した、引き継ぐのがためらわれるようなコードだと気づきます。
> そして、型安全性、設定の外部化などの必要性が理解できるようになります。

静的型付け言語なので、型安全性は担保されています。素晴らしいですね！
設定の外部化の例としてURLの直書きが挙げられていましたが、こちらも`ServiceDiscovery`を使うことで簡単に解決できます。
エンドポイント名を`http://api`にしておいて、`appsettings.json`や環境変数で実際のURLを切り替えられます。
また、その他設定が必要なら`IConfiguration`をDIで注入すれば良いだけです。
こちらも`Program.cs`に数行足せばOK。

### 可観測性
> 本番環境で「処理が遅い」「エラーが出る」と報告されたら、どうやって調査するのでしょうか？

これもDIで`OpenTelemetry`などを登録しておけば、コードに手を加えずに済みます。
[Aspireで提供されているDashboard](https://learn.microsoft.com/ja-jp/dotnet/aspire/fundamentals/dashboard/overview)はかなり見やすくて便利です。

## 何が言いたいか
.NETのエコシステムがめちゃくちゃ充実していて、元記事のような問題は簡単に解決できちゃってすごいね、という話でした。
ただ解決できるだけでなく、コードをあまり汚さずに済むのもポイントです。これにより余計な判読コストがかかりにくい。
あとは **事前に設定しておけば** 誰が書いてもつまづきポイントが解消されたコードになるのも素晴らしい。[^2]

[^2]: 事前に設定する、というのが難しいのですが。知らないと設定できないので……

今回使ったパッケージはほぼ全部Microsoft提供のものなのもポイントです。そうそう消えないはずなので、長期的に見ても安心。

あと、言語仕様として静的型なので、元記事の問題点のいくつかはそもそも発生しません。素晴らしい。

## 欠点
もちろん欠点もあります。
一番の問題は「ドキュメントが全然ない」ことです。
エコシステムはすごいのに、それを知る方法が初学者目線だとあまり無い！
かくいう自分も全然わかってないです。多分この記事はどこかしら間違ってる。


元記事が一番言いたいであろうポイントの「スキルを身につける」過程がC#の場合難しい！というのが目下の悩みです。

> 自身の経験だけから「がむしゃら」に学ぶのではなく、先人たちが積み重ねてきた知識と経験から学ぶ、「巨人の肩に立とうとする姿勢」 が大切なのかもしれません。

.NETの諸々で巨人の肩には立てているはずなので、あとは視界をクリアにしたい！
日本語のC#/ASP.NETの情報がもっと増えると良いなあと思います。

