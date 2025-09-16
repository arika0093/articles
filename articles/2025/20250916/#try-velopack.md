---
title: "【C#】実行ファイルの自動アップデートを提供するVelopackを試してみる"
emoji: "🤖"
type: "tech"
topics: ["zenn", "csharp", "velopack"]
published: false
---

頒布したアプリケーションを手動で更新したり、やってもらうのは面倒なので、自動でアップデートできる仕組みを入れたい。
調べてみたらSquirrelの後継である[Velopack](https://github.com/velopack/velopack)があったので、試してみる。
https://github.com/velopack/velopack

今回はコンソールアプリで試す。


NuGetから`velopack`をインストールする。
また、バージョン管理のために`Nerdbank.GitVersioning`も入れておく。

```bash
dotnet add package velopack
dotnet add package Nerdbank.GitVersioning
```

今回は`gitea`を使用していく。`github`やファイルサーバー、S3なども使えるのでホスティング先はかなり融通が効く。


```csharp
using Velopack;
using Velopack.Exceptions;
using Velopack.Sources;

// Main処理の先頭に追加
VelopackApp.Build().Run();

// この関数はいつ呼んでもいい。
// 例えば定期的に呼び出すとか、アプリケーション更新チェックのボタンを押したときとか。
await UpdateCheck();

Console.WriteLine($"This Assembly Version is: {ThisAssembly.AssemblyInformationalVersion}");


async Task UpdateCheck()
{
    const string RepoUrl = "http://my-gitea-server.example.com/user/TryVelopack";
    try
    {
        var giteaSource = new GiteaSource(repoUrl: RepoUrl, accessToken: null, prerelease: true);
        var mgr = new UpdateManager(giteaSource);
        // check for new version
        var newVersion = await mgr.CheckForUpdatesAsync();
        if(newVersion == null){
            // no update available
            return;
        }
        // download new version
        Console.WriteLine($"new version available! :: {newVersion.TargetFullRelease.Version}");
        await mgr.DownloadUpdatesAsync(newVersion);
        // install new version and restart app
        mgr.ApplyUpdatesAndRestart(newVersion);
    }
    catch(NotInstalledException)
    {
        // 開発中などはインストールされていないため、無視
    }
}
```

GitHub ActionsでGiteaのリリースに自動アップロードするようにする。


```yml
name: Deploy to Gitea Releases

on:
  push:
    branches:
      - main

permissions:
  contents: write

jobs:
  deploy-to-gitea-releases:
    runs-on: windows-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
        with:
          # gitversioningを使用するために履歴全体が必要
          fetch-depth: 0

      - name: Set up dotnet 9.0
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: 9.0.x

      # GitVersioningからバージョン情報を取得
      - uses: dotnet/nbgv@master
        id: nbgv

      # publish application
      # 自己解凍形式で発行、Windows x64 向け
      - name: Publish Application
        run: dotnet publish TryVelopack/TryVelopack.csproj -c Release -o publish -r win-x64 --self-contained true

      # Velopackでリリースを生成
      - name: Create Release
        run: |
          dotnet tool install -g vpk
          vpk download gitea --repoUrl ${{ env.VPK_REPO_URL }}
          vpk pack -u ${{ env.IDENTIFIER }} -v ${{ steps.nbgv.outputs.SemVer2 }} -p publish --mainExe ${{ env.APPLICATION_EXE }}
          vpk upload gitea --repoUrl ${{ env.VPK_REPO_URL }}
        env:
          # ID, 重複しないようにする。
          IDENTIFIER: try-velopack
          # 実行ファイルを明示的に指定する必要あり
          APPLICATION_EXE: TryVelopack.exe
          # VPKの設定
          VPK_REPO_URL: http://my-gitea-server.example.com/${{ gitea.repository }}
          VPK_RELEASE_NAME: Release ${{ steps.nbgv.outputs.SemVer2 }}
          VPK_TAG: v${{ steps.nbgv.outputs.SemVer2 }}
          VPK_TARGET_COMMITISH: ${{ github.ref }}
          VPK_PUBLISH: true
          VPK_TOKEN: ${{ secrets.GITEA_TOKEN }}
          # プレリリースなら含める、そうでない場合は空文字
          VPK_PRE: ${{ contains(steps.nbgv.outputs.SemVer2, '-') && 'true' || '' }}
          # イントラネット環境で動かしてるなら、プロキシを経由しないほうが良さげ
          # (ファイルのアップロードで落ちる)
          NO_PROXY: "my-gitea-server.example.com"
```

うまくいくとこうなる。
![](image.png)

`try-velopack-win-Setup.exe`をダウンロードして実行すると、デスクトップにショートカットが生える。
ファイルの場所を開いてみると、`AppData\Local\(IDENTIFIER)\current`にインストールされる模様。

実行してみる。
![](image-1.png)

うまくリリースできていそう。

ここでアップデートを入れてみる。
区切り線をいれて、最後に`ReadKey`で待ち受けるようにしてみた。

```csharp diff
+Console.WriteLine("----------------------------------");
Console.WriteLine($"This Assembly Version is: {ThisAssembly.AssemblyInformationalVersion}");
+Console.WriteLine("----------------------------------");
+Console.ReadKey();
```

これで再度コミット+Push。

![](image-2.png)
`0.1.0-alpha.9`がリリースされているのがわかる。
また、差分パッケージ(`-delta.nupkg`)も生成されている。これを使って高速アップデートができるということらしい。


ここで、さっきインストールしたアプリを再度実行。
すると、新バージョンを自動で検知してインストールプロセスが走る。

![](image-3.png)

そして、更新が完了すると自動で再起動してくれる。


![](image-4.png)
無事に更新されていることがわかる。

なお、格納先のフォルダ(`AppData\Local\(IDENTIFIER)\current`)を何らかのアプリが開いていると更新に失敗する。まではいいのだが、延々と再起動を繰り返すので注意が必要。
