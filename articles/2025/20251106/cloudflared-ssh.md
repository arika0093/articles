---
title: "【日記】Cliudflared経由で外部からSSH接続するメモ"
published: true
---

色んなところに書いてあるので、メモ程度に

## 大まかな手順

### Cloudflare Zero Trust側
* Cloudflareでドメインを取得、もしくは既存ドメインをCloudflareに移管
* Cloudflare Zero Trustのアカウントを作成
* Zero Trust/ネットワーク/トンネル からトンネルを作成
  * 公開されたアプリケーションにSSHを追加
    * ホスト: 任意の名前.mydomain.com
    * サービス: SSH://localhost:22
  * 注意点として、foo.bar.mydomain.com のような **2階層以上のサブドメインは指定できない**
		* 代わりに foo-bar.mydomain.com のようにハイフンで区切る
* 必要に応じてアクセスルールを設定
  * 気になるならやっとく。今回は特に設定しなかった

### サーバー側
* cloudflaredをインストール
  * [Windowsの場合](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/#windows)は `winget install --id Cloudflare.Cloudflared`
* ログイン
	* `cloudflared login` を実行
* トンネルのところに書いてあるコマンド `cloudflared service install ... ` を実行
  * 管理者権限で実行すること
* 再起動する

### クライアント側
* cloudflaredをインストール & ログイン
* `cloudflared tunnel list` でトンネルIDを確認
* `cloudflared access ssh-config <トンネルID>` を実行して `~/.ssh/config` に追記する内容を確認
  * ここは表示だけで、自動で追記はされない
* `~/.ssh/config` に追記
* `ssh <ホスト名>` で接続できる

参考までに、`~/.ssh/config` の例

```
Host sample
  HostName sample.mydomain.com
  ProxyCommand C:\Program Files (x86)\cloudflared\cloudflared.exe access ssh --hostname %h
  User <ユーザー名>
```

## 参考

https://zenn.dev/jij_inc/articles/659fe35813b940

https://qiita.com/guskma/items/8509bc8ad16805b0e732

https://zenn.dev/nakurei/articles/rdp-from-outside-to-windows-using-cloudflare

