---
title: "コンソール出力をSVGに変換する"
pubDatetime: 2026-02-25T00:19:41+09:00
published: true
tags: ["console", "asciinema", "terminal"]
---

メモ。環境はWindowsで実行することを想定しています。

## 必要な準備
WSLでないと`asciinema`が動かないので、WSLを使えるようにしておきます。
また、aptで`dotnet-sdk-10.0`を使用するためにはUbuntu 24.04以降が必要なので、更新しておきます。

```bash
sudo apt update
sudo apt upgrade
# 22.04 to 24.04
sudo do-release-upgrade
# dotnet SDK 10.0のインストール
sudo apt install -y dotnet-sdk-10.0
```

また、 `asciinema`も必要なので、インストールしておきます。

```bash
sudo apt install -y asciinema
```

`svg-term`も必要なので、npmでインストールしておきます。
自分はnpmがそもそも入ってなかったので,`nvm`から入れました。

```bash
# nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
# シェル再起動してから
# install lts version of node
nvm install --lts
# install svg-term globally
npm install -g svg-term
```

## コンソール出力の記録

```bash
svg-term --out demo.svg --width 80 --height 24 --no-cursor --command "(command)"
```

## 感想
* `asciinema`と`svg-term(npm/node)`の依存があるのがめんどい。
* `asciinema`はWSLでしか動かないのもめんどい。
* デフォで動画しか出力できないのもめんどい。

という感じで、色々とつらい。のでライブラリを作っても良いかも。

