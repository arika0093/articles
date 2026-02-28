---
title: "コンソール出力を綺麗なSVG画像にするツールを作ってみた"
pubDatetime: 2026-02-26T01:01:21+09:00
modDatetime: 2026-02-26T01:22:43+09:00
published: true
tags: ["dotnet", "console", "terminal"]
zenn:
  published: true
  emoji: "🎨"
  type: "tech"
---

ライブラリの実行結果をREADMEに貼り付けるにあたり、png等の貼り付けだと画質が微妙になりがちです。
そこでsvgで出力できるツールを調べてみて、ほしいものが見つからなかったのでさくっと作ってみました。

## 概要

こんな感じで、背景・ウインドウ枠付きの綺麗なSVGが生成できます。（コマンドには[oh-my-logo](https://zenn.dev/shinshin86/articles/e02fac5d3ae75a)を使わさせていただきました）

![](https://raw.githubusercontent.com/arika0093/articles/refs/heads/main/articles/2026/20260225/cmd-hero.svg)

動画も吐き出せます。
![](https://raw.githubusercontent.com/arika0093/articles/refs/heads/main/articles/2026/20260225/cmd-logo.gif)

## 従来の方法/問題点
コンソール出力をSVGに変換する方法としては、`asciinema`と`svg-term`を組み合わせる方法が一般的です。

```bash
svg-term --out demo.svg --width 80 --height 24 --no-cursor --command "(command)"
```

しかし、個人的に

* `asciinema`と`svg-term(npm/node)`の依存があるのが面倒
* `asciinema`はWSLでしか動かない(Windowsで手軽に生成できない)
* `dotnet tool install`で導入したい
* コンソールの出力をそのまま使いたいことは少なく、適切に切り取りたい
* コマンドが長い！

という点がちょっと気にいりませんでした。そこで自作してみました（AIが99%ぐらいやりました）。

## 作ったツール
その名も`console2svg`です。

https://github.com/arika0093/Console2Svg

`npm`または`dotnet tool`で手軽にインストールできます。

```bash
# npm
npm install -g console2svg
# dotnet
dotnet tool install -g ConsoleToSvg
```

[静的バイナリ](https://github.com/arika0093/console2svg/releases)も配布しているので、そちらをダウンロードして使うこともできます。

## 使い方

以下のように`--`の後ろにコマンドを指定するだけです。

```bash
console2svg -- dotnet
```

そのまま実行すると幅80、高さ24のSVGが生成されます。変更したいときは`-w`と`-h`で指定します。
また、よくあるmac風のwindowをつけることもできます。

```bash
console2svg -w 120 -h 16 -d macos -- dotnet
```

![](https://raw.githubusercontent.com/arika0093/articles/refs/heads/main/articles/2026/20260225/2.svg)

出力が長い場合、そのうちの一部を切り取って使いたいこともあるかと思います。その場合、`crop-top`/`crop-bottom`オプションで切り取りを指定できます。指定方法もいくつかあり、`ch`(行数or文字), `px`(ピクセル), テキスト指定(指定したテキストが出てくるまで)から選べます。

例えば`dotnet --info`の出力は非常に長いので、HostおよびSDKsの情報だけ切り取ってみます。
この際、sdkの情報をピンポイントで切り取るのは難しいので、その下にいる`.NET runtimes installed`の行を基準にして、そこから2行上に切り取ることにします。

```bash
console2svg -w 60 -h 16 --window macos --crop-top "Host" --crop-bottom ".NET runtimes installed:-2" -- dotnet --info
```

![](https://raw.githubusercontent.com/arika0093/articles/refs/heads/main/articles/2026/20260225/4.svg)


`--background`オプションで背景色をグラデーションにしたり、画像を指定することもできます。


```bash
# グラデーション
console2svg -w 100 -h 10 -c -d macos-pc --background "#004060" "#0080c0" --opacity 0.8 -o ./assets/cmd-bg2.svg -- dotnet --version
# 画像
console2svg -w 100 -h 10 -c -d macos-pc --background ./assets/bg.png --opacity 0.8 -o ./assets/cmd-bg3.svg  -- dotnet --version
```

![](https://raw.githubusercontent.com/arika0093/articles/refs/heads/main/articles/2026/20260225/cmd-bg2.svg)
![](https://raw.githubusercontent.com/arika0093/articles/refs/heads/main/articles/2026/20260225/cmd-bg3.svg)


## 何が嬉しいのか

* SVGなので拡大してもきれい！
* 背景やウインドウ枠をつけることで、見栄えが良くなる(そのままドキュメントサイト等に使える！)
* 動画も吐き出せるので、動いている様子も見せられる(マニュアルに最適！)
* 全てコマンドで完結するので、CI等に組み込んで自動生成できる！

といったメリットがあります。
とくにドキュメント等の画像だと、現物のソースコードと画像とで乖離しがち（それでいて差異があると不親切！）なので、CIで自動生成できるのは便利だと思います。

## 感想
1日でできました。AIすごい。~~最近人間の存在価値をよく考えるようになってきました~~
自分用のツールですが、比較的汎用的に使えるように作ったつもりなので、もし興味があれば使ってみてください！
もし気に入ったならstarをお願いします！

https://github.com/arika0093/Console2Svg
