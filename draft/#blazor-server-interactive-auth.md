---
title: "【C#】"
emoji: "🔐"
type: "tech"
topics: ["csharp", "dotnet", "blazor", "authentication"]
published: false
---



前回に引き続き、Blazorの認証を取り扱います。
今回は以下の制約を設けて認証系を実装します。

* Blazor Server Interactive
* 標準ライブラリのみ
* 資格情報はアプリ内で管理（外部サービスは使わない）
* よくあるケースを抑える（ログイン・ログアウト・権限管理・ユーザー情報更新）


## コード
https://github.com/arika0093/BlazorAuthPlain

## 参考
