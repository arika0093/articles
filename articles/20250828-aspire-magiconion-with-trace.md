---
title: "【C#】MagicOnionのJsonTranscodingでエラー出力を有効にする"
emoji: "🧅"
type: "tech"
topics: ["dotnet", "magiconion", "debug"]
published: false
---

## 


以下のようなエラーになってしまう。

```json
{
  "Code": 13,
  "Detail": "Exception was thrown by handler."
}
```

該当の箇所のコード
https://github.com/Cysharp/MagicOnion/blob/09c7224212c4b1edde8067dfed29a7eda35738f5/src/MagicOnion.Server.JsonTranscoding/MagicOnionJsonTranscodingGrpcMethodBinder.cs#L96

どうやら `options.IsReturnExceptionStackTraceInErrorDetail`を有効にすれば良さそう。

```cs
builder.Services.AddMagicOnion(option =>
{
    option.IsReturnExceptionStackTraceInErrorDetail = builder.Environment.IsDevelopment();
});
```

いけた。

```js
{
  "Code": 13,
  "Detail": "Exception was thrown by handler. (System.InvalidCastException: Unable to cast object ..." // 省略
}
```
