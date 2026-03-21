---
title: "【C#】MagicOnionのJsonTranscodingを使ってみる"
emoji: "🧅"
type: "tech"
topics: ["dotnet", "magiconion", "debug"]
published: true
---

:::message
この記事は[ブログ](https://eclairs.cc/posts/2025/20250828/aspire-magiconion-with-trace)でも公開しています。
:::


## まえがき 
[MagicOnion](https://github.com/Cysharp/MagicOnion)のサーバー開発を行う際に、動作確認用のUIがあると便利です。
公式に[JsonTranscoding](https://cysharp.github.io/MagicOnion/ja/integration/json-transcoding)という機能が用意されています。
というわけで早速これを使ってみます。[^1]

[^1]: 公式ドキュメントは内容があまり無いので、探り探り……

## 導入
まず`MagicOnion.Server.JsonTranscoding.Swagger`をNuGetから導入します。

```
dotnet add package MagicOnion.Server.JsonTranscoding.Swagger
```

次に`Program.cs`を以下のように修正します。

```cs
// 前略
var isDevelopment = builder.Environment.IsDevelopment();
var magicOnion = builder.Services.AddMagicOnion();
if (isDevelopment)
{
    // 開発時専用でSwaggerを有効化
    magicOnion.AddJsonTranscoding();
    builder.Services.AddMagicOnionJsonTranscodingSwagger();
    builder.Services.AddSwaggerGen();
}

var app = builder.Build();
if (isDevelopment)
{
    // 開発時専用でSwaggerを有効化
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        // ルートパスでSwagger UIを表示する
        c.RoutePrefix = "";
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API V1");
    });
}
// 後略
```

もしHTTPSでホストしていない場合、HTTP/2で動かしているとSwaggerUIが動作しないので、`appsettings.json`を修正します。

```diff json
{
  "Kestrel": {
    "Endpoints": {
      "http": {
        "Url": "http://localhost:5110",
        "Protocols": "Http2"
+     },
+     "swagger": {
+       "Url": "http://localhost:5111",
+       "Protocols": "Http1"
      }
    }
  }
}
```

## 動かしてみる
Aspireで動かしてみます。動かし方は[こちらの記事](https://zenn.dev/arika/articles/20250822-aspire-magiconion)を参考にしてください。
https://zenn.dev/arika/articles/20250822-aspire-magiconion

起動すると以下のような表示になります。
![](aspire-server-with-swagger.png)

で、`http://localhost:5111`にアクセスすると...

![](aspire-swagger2.png)

とこのようにAPIを叩けるようになります。これは便利。

## 例外発生時にスタックトレースを出す

このままだと例外発生時にスタックトレースが表示されません。具体的には以下のようなエラーが帰ってきます。
![](/images/20250828/swagger-err.png)

Debug実行していても例外発生で止まってくれないのも相まって、なかなか不便！
というわけで、スタックトレースを表示する方法を探しました。[^2]

[^2]: ソースコードを読んで探りました。そしてこの記事を書いてる途中に[ドキュメントの端に書いてある](https://cysharp.github.io/MagicOnion/ja/fundamentals/exceptions-and-status-codes#%E3%82%B5%E3%83%BC%E3%83%90%E3%83%BC%E4%B8%8A%E3%81%A7%E3%81%AE%E6%9C%AA%E5%87%A6%E7%90%86%E3%81%AE%E4%BE%8B%E5%A4%96)ことに気づきました

どうやら `options.IsReturnExceptionStackTraceInErrorDetail`を有効にすれば良さそう。
というわけで、以下のように追記します。

```diff cs
var isDevelopment = builder.Environment.IsDevelopment();
-var magicOnion = builder.Services.AddMagicOnion();
+var magicOnion = builder.Services.AddMagicOnion(option =>
+{
+    option.IsReturnExceptionStackTraceInErrorDetail = isDevelopment;
+});
```

すると……

![](/images/20250828/swagger-err-withtrace.png)

いけました。これでデバッグが捗ります。[^3]

[^3]: 本番環境では無効にしておきましょう。言うまでもないことですが。

## クライアント側で表示する
これはドキュメントにも書いてありますが、以下のようにして受け取れます。

```cs
try {
    await sampleService.GetSampleData();
}
catch(RpcException ex) {
    // = StatusCode.Unknown
    Console.WriteLine($"Code: {ex.Status.StatusCode}");
    // この中にスタックトレースが入る
    Console.WriteLine($"Error: {ex.Status.Detail}");
}
```
