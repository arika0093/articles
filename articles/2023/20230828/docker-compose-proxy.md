---
title: "docker-composeでプロキシ環境を再現する"
pubDatetime: 2025-06-22T21:55:31+09:00
modDatetime: 2026-01-25T23:20:04+09:00
published: true
tags: ["docker", "proxy", "docker-compose", "squid"]
zenn:
  published: true
  emoji: "🌐"
  type: "tech"
---


## TL;DR
1. squidを追加で建てる
2. squidの設定でlocalhostからのアクセスを許容する
3. 外部接続するコンテナ(以下`app`コンテナ)を全てネットワークAに追加
4. ネットワークAを`internal:true`とする
5. squidコンテナをネットワークBに追加
6. ネットワークBは標準設定で作成する
7. `app`コンテナで`HTTPS_PROXY=http://squid:3128`としてプロキシを適用させる

## やりたいこと
* プロキシサーバーを経由して外部インターネットへアクセスしたい。
* プロキシサーバーを経由しない外部接続を全て遮断したい。

要するにEnterprise環境のプロキシをdocker-compose単体で再現する方法。
OSSにプロキシ機能を追加する際、お手軽にテストする方法を実装したかった。

## コード
### docker-compose.yaml

```yaml
version: '3.8'
services:
  app:
    # (省略)
    networks:        # 追加
      - app_internal # 追加
  proxy:
    image: sameersbn/squid:3.5.27-2    
    restart: always
    hostname: squid
    volumes:
      - ./squid.conf:/etc/squid/squid.conf
    ports:
      - "127.0.0.1:3128:3128"
    networks:
      - app_internal
      - proxy_network
      
networks:
  app_internal:
    internal: true
  proxy_network:
```

`app_internal`の中で`internal:true`とすることで、外部接続を禁止するネットワークをお手軽に作成できる。
構成としてはこんなイメージ。

![](https://storage.googleapis.com/zenn-user-upload/d2e6dc3a3c92-20230828.png)

### squid.conf
そのままだと巨大すぎるので、コメント部分を削除して必要部分だけ抜粋。

```py
acl localnet src 10.0.0.0/8	# RFC1918 possible internal network
acl localnet src 172.16.0.0/12	# RFC1918 possible internal network
acl localnet src 192.168.0.0/16	# RFC1918 possible internal network
acl localnet src fc00::/7       # RFC 4193 local private network range
acl localnet src fe80::/10      # RFC 4291 link-local (directly plugged) machines
acl SSL_ports port 443
acl Safe_ports port 80		# http
acl Safe_ports port 21		# ftp
acl Safe_ports port 443		# https
acl Safe_ports port 70		# gopher
acl Safe_ports port 210		# wais
acl Safe_ports port 1025-65535	# unregistered ports
acl Safe_ports port 280		# http-mgmt
acl Safe_ports port 488		# gss-http
acl Safe_ports port 591		# filemaker
acl Safe_ports port 777		# multiling http
acl CONNECT method CONNECT
http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access allow localhost manager
http_access deny manager
http_access allow localnet
http_access allow localhost
http_access allow all
http_port 3128
coredump_dir /var/spool/squid
refresh_pattern ^ftp:		1440	20%	10080
refresh_pattern ^gopher:	1440	0%	1440
refresh_pattern -i (/cgi-bin/|\?) 0	0%	0
refresh_pattern (Release|Packages(.gz)*)$      0       20%     2880
refresh_pattern .		0	20%	4320
```
標準設定のものから`acl localnet ...`部分をCOしただけ。
ポート3128で待ち受けるのを変えたい場合は`http_port 3128`を書き換える。
パスワード設定等はググれば出てくると思う（興味なかったので試してない）。

### 別解
これでもいい。こっちはentrypointで無理やり書き換えるパターン。

```yaml
proxy:
    image: sameersbn/squid:3.5.27-2
    restart: always
    hostname: squid
    ports:
      - "127.0.0.1:3128:3128"
    networks:
      - app_network
      - proxy_network
    # replace squid.conf > localnet access allow (comment out)
    entrypoint: >
      sh -c '
        sed -i -E "s/#\s*(acl localnet src)/acl localnet src/g" /etc/squid/squid.conf
        sed -i -E "s/#\s*(http_access allow localnet)/http_access allow localnet/g" /etc/squid/squid.conf
        /usr/sbin/squid -N
      '
```


## Utility
以下、開発環境でプロキシ有無を切り替えるユーティリティ。
コピペして貼り付ける。

### プロキシを適用する際

```sh
export HTTPS_PROXY=http://squid:3128
export HTTP_PROXY=http://squid:3128
export https_proxy=http://squid:3128
export http_proxy=http://squid:3128
export NO_PROXY=localhost
export no_proxy=localhost
```

### プロキシを外す際
```sh
unset HTTPS_PROXY
unset HTTP_PROXY
unset https_proxy
unset http_proxy
unset NO_PROXY
unset no_proxy
```