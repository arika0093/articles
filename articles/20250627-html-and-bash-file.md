---
title: "Bashで実行可能なHTMLファイルを作成する"
emoji: "🔥"
type: "tech"
topics: ["html", "bash", "dotfiles"]
published: true
---

## 前置き
皆さんは何かしらの導入スクリプトとして、このようなものを見たことがあるはずです。

```bash
$ curl -sSL https://get.example.com/install.sh | bash
```

危険性については留意が必要ですが、`curl`で取得したスクリプトをそのまま`bash`に渡して実行することでインストールを簡略化できる便利な方法です。

このURLをさらに短くする方法として、`install.sh`ではなく`index.html`に書いても同じ効果を得られます。
ついでに `https`は省略できるので、以下のように書くこともできます。

```bash
$ curl -sSL get.example.com | bash
```

ただ、このやり方だと `https://get.example.com`にアクセスした際、当然ながらスクリプトの中身がそのまま（改行なしで）表示されます。

せっかくならドキュメントのように見せたかったので、HTML兼bashスクリプトが実現できないかと考えました。

## 目標
HTMLファイルの中にbashスクリプトを埋め込んで、

* ブラウザで表示したときは普通のHTMLページとして表示される
* `curl ... | bash`で実行したときはスクリプトとして実行できる

ようなファイルを作成することを目指します。

## 結論
以下のような書式で実現できます。

```bash
#!/bin/bash
:<<"HTML_CONTENT"
<!DOCTYPE html>
<html style="background: #0a0a0a">
<head>
  <!-- Meta tags and styles -->
</head>
<body>
  <!-- Main content -->
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // Remove bash script content
      document.querySelectorAll('*').forEach(el => {
        [...el.childNodes].filter(n => n.nodeType === 3 && 
          (n.textContent.includes('HTML_CONTENT') || n.textContent.includes('#!/bin/bash')))
          .forEach(n => n.remove());
      });
    });
  </script>
</body>
</html>
HTML_CONTENT

# 以下はBashスクリプト
echo "Bash script is running."
```

## 解説
### `bash`スクリプトの中にHTMLを埋め込む
ヒアドキュメントを使います。
ヒアドキュメントは、複数行の文字列を変数に代入するための構文で、以下のように書きます。
```bash
cat <<SAMPLE
ここに複数行の文字列
SAMPLE
```

この例だと`cat`コマンドに複数行の文字列を渡すことができます。
今回は別に何かのコマンドとして実行したいわけではないので、[`:`コマンドを使って何もしない](https://qiita.com/xtetsuji/items/381dc17241bda548045d)ようにしています。
これで`bash`で実行できることはクリアできました。

### 普通のHTMLとして表示する
さて、この状態でブラウザから開くと（当たり前ですが）以下のように`bash`スクリプトの中身がそのまま表示されます。

![](/images/20250627/dotfile-html-2.png)

これらのテキストをDevToolsで確認すると、~~ブラウザからしたら意味不明な文章は~~ テキストノードとして取り扱われていることがわかります。
![DevTools](/images/20250627/bash-devtool.png)

よって、JavaScriptを使って読み込み完了時に当該部分を消しにいけば良さそうです。
HTMLにおいては改行は関係なく一つのテキストノードに突っ込まれるので
`HTML_CONTENT`を含む = 不要な部分になります。

```js
document.addEventListener('DOMContentLoaded', () => {
  // 読み込み完了時に HTML_CONTENTを含むテキストノードを削除
  document.querySelectorAll('*').forEach(el => {
    [...el.childNodes].filter(n => n.nodeType === 3 && 
      (n.textContent.includes('HTML_CONTENT')))
      .forEach(n => n.remove());
  });
});
```

### 一瞬だけ表示されること（ちらつき）を防ぐ
上記のコードを実行すると、ブラウザで開いたときに一瞬だけ`bash`スクリプトの中身が表示されてしまいます。
これを防ぐために、HTMLの`<html>`タグに`style="background: #0a0a0a"`のように黒系の背景色を指定しておきます。
(その後表示するWebページの背景色に合わせます)

最初は`<style>`タグ内に書いていたのですが、~~異常なHTMLのせいなのか~~ `<style>`タグ内のCSSが適用される前に表示されてしまうようです。
そのため、`<html>`タグに直接書いています。

## 成果物
このような感じになります。
https://dotfile.eclairs.cc/

**ブラウザから開いた場合**
![](/images/20250627/dotfile-html-3.png)

**`curl ... | bash`で実行した場合**
![](/images/20250627/dotfile-html-4.png)

## 余談
なんでこんな形で展開したかという話ですが…

自分用の`dotfiles`を展開するとき、URLは覚えてるんですが`curl`のオプションを忘れがちです。あと都度手打ちしたくない。
そういう時に、覚えてるURLを開く→コピペする→ターミナルに貼り付ける、という手順で実行できるようにしたかった。
それなら`install.sh`と`index.html`を別々に用意しても良いじゃん、と言われればその通りですが、なんとなくURLを短くしてみたかった。

というのが背景です。

## 余談の余談
上記内容は、自分の[dotfiles](https://github.com/arika0093/dotfiles)を改修してるときに思いつきました。

何をやってたかというと
* `Claude Code`
	* `alias cc="claude --dangerously-skip-permissions"`
	* ついでに`SuperClaude`
* `playwright-mcp`
	* 日本語フォント+絵文字の導入(`vlgothic`と`noto-color-emoji`)
	* `playwright`のセットアップ(`npx playwright install chromium`)
		* これを毎回やると重いので、スクリプトだけ用意しておいて必要になったら叩く

を自動で展開する機能です。

vscodeのdotfiles設定欄に↑のURLをセットしておけば、任意のdevcontainerを開いたときに上記セットが自動で展開されます。便利！
中身が気になる方は上記レポジトリを見てみてください。
