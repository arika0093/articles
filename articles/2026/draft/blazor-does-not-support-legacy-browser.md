---
title: "【Blazor】2026年にIE11対応をやる謎のプロジェクトがあるらしい"
pubDatetime: 2026-09-13T00:47:45+09:00
published: false
tags: ["dotnet", "csharp", "blazor"]
zenn:
  published: false
  emoji: "🦌"
  type: "tech"
---

Blazor Serverというものをご存知でしょうか。
常時サーバー側とWebSocket等で接続しておき、サーバー側でレンダリングした結果をクライアント側に送るという挑戦的なWebフレームワークです。





Blazorは公式にはレガシーブラウザをサポートしていません。
[公式サイト](https://learn.microsoft.com/en-us/aspnet/core/blazor/supported-platforms?view=aspnetcore-10.0)を見るとこのように書かれています。

![](image.png)

雑な表記ですが、まあ要するに最新ブラウザを使うのは**当然**なので、古いブラウザはサポートしませんということです。[^1]

[^1]: 当たり前という考え自体は理解できますが、公共インターネットに繋がっている端末ばかりではないし、閉じた環境ではブラウザの更新とか気軽にできないので、ちょっと残念ではあります。

で、




Spinner blocing



Chromium
https://vikyd.github.io/download-chromium-history-version/
Win_x64 / 85.0.4174.2




https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Static_initialization_blocks


```js
// in .NET 9
class P{
  static{
    this.nextEventDelegatorId=0
  }
  constructor(e){
    this.browserRendererId=e,
    ...
  }
}
```

```js
// in .NET 8
class M { ... }
M.nextEventDelegatorId=0;
class U { ... }
```


https://github.com/dotnet/aspnetcore/tree/main/src/Components/Web.JS
