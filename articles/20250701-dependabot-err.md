---
title: "dependabotのエラーを解決する備忘録"
emoji: "🔧"
type: "tech"
topics: ["dotnet", "github", "dependabot"]
published: true
---



本当にしょうもない内容なのですが、ちょっとハマったので。 

## エラー内容

dependabotが以下のようなエラーを出していました。

```
Your .github/dependabot.yml contained invalid details
Dependabot encountered the following error when parsing your .github/dependabot.yml:

The property '#/' did not contain a required property of 'updates'

Please update the config file to conform with Dependabot's specification.
```

で、自分の`dependabot.yml`はというと

```yaml
version: 2
updates:
  - package-ecosystem: "nuget"
    directory: "/"
    schedule:
      interval: "weekly"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

`updates`あるじゃん！となり、他のシンタックスも正しそうだし… ここでしばらく混乱。
エラーメッセージでググっても謎だし、どういうこっちゃ？と。

## オチ
UTF-8 **with BOM** で保存していたのが原因でした。

言われれば本当にしょうもない内容なんですが、全然気づかないと沼にハマってしまうので備忘録メモ。

dotnetの文化圏は(Microsoftの影響もあって)BOM付きUTF-8も普通に使う風潮があるので、保存するときは気をつけましょう。
