---
title: "【Blazor】バーコードリーダー対応の入力フォームを作成する"
pubDatetime: 2025-09-10T15:34:03+09:00
modDatetime: 2026-01-25T23:38:59+09:00
published: true
tags: ["dotnet", "blazor", "barcode"]
zenn:
  published: true
  emoji: "🌍️"
  type: "tech"
  topics: ["dotnet", "blazor", "barcode"]
---


表題の通り、バーコードリーダーで読み取った文字列を入力するテキストボックスをBlazorで作成していきます。

## 概要
バーコードリーダーは基本的にキーボードエミュレーションを行うため、テキストボックスにフォーカスが当たっている状態で読み取ると、そのまま文字列が入力されます。
なので大体は普通のテキストボックスで問題ないのですが、性質上以下のような要件が発生しがちです。

* 多くのバーコードリーダーは読み取り完了時に改行コードを送信するため、改行コードを受け取ったら入力完了とみなして何かしらの処理を行いたい
* タブ文字を読み取ることがあるため、フォーカス自動遷移を阻止してそのまま入力したい
* その他、特殊なキーを読み取ることがあるため、必要に応じて入力内容を加工したい

というわけで、これらを満たすためのコンポーネントを作成していきます。

## Blazorだけで実装する
まずはBlazorだけで実装する方法です。
`<input>`要素の`@onkeydown`イベントを利用して、キー入力を監視します。
また、`@onkeydown:preventDefault`を利用して、必要に応じて元々のイベントを無効化します。
（このあたり、ピンと来にくい記法だと思う。。）

```razor
<input type="text" value="@inputText"
       @onkeydown="OnKeyDown" @onkeydown:preventDefault="preventDefault" />

@code {
    // 外部から完了時のイベントを渡す
    [Parameter]
    public EventCallback<string> OnCompleted { get; set; }

    string inputText = "";
    bool preventDefault = false;

    // キーが押されたときのイベント
    private void OnKeyDown(KeyboardEventArgs args)
    {
        var key = args.Key;
        if(key == "Enter")
        {
            // 完了
            preventDefault = true;
            OnCompleted.InvokeAsync(inputText);
            inputText = "";
        }
        else if(key == "Tab")
        {
            // 元々のイベントを無効化して変更
            preventDefault = true;
            inputText += "\t";
        }
        else if(key.Length == 1)
        {
            // 長さ1なら普通の文字のはず…
            preventDefault = true;
            inputText += key;
        }
        else
        {
            // 素通し
            preventDefault = false;
        }
        StateHasChanged();
    }
}
```

## 問題点
上記のコードで大筋は動作しますが、実際にバーコードリーダーで読み取ると以下のような問題が発生します。

* `\`記号があるときに、バーコードリーダーは `Alt` `0` `9` `2` と入力することで`\`記号を入力してる（機種がある）。[^1] [^2]
  * 上記のコードだとそこまで見てないので`092...`となってしまう
* 一部入力が漏れることがある
  * Blazor Serverで動かしているとキー入力1回ごとに呼び出しが発生するため、入力が漏れる？
  * 毎回発生するわけではないが、性質上入力漏れは致命的なので、これも問題

[^1]: [Alt code](https://en.wikipedia.org/wiki/Alt_code) というらしい 
[^2]: DATALOGIC Gryphon 4500 Series

## JavaScriptと組み合わせて実装
というわけで、餅は餅屋、JavaScriptと組み合わせて実装します。
MSLearnの~~超分かりづらい~~[サンプル](https://learn.microsoft.com/ja-jp/aspnet/core/blazor/javascript-interoperability/call-dotnet-from-javascript?view=aspnetcore-9.0#pass-a-dotnetobjectreference-to-a-class-with-multiple-javascript-functions)を参考に組んでみます。

```razor
/* BcdInputWithJavascript.razor */
<input type="text" id="@id" />

@inject IJSRuntime JS
@implements IAsyncDisposable
@code {
    [Parameter]
    public EventCallback<string> OnCompleted { get; set; }

    string id = Guid.NewGuid().ToString();
    DotNetObjectReference<BcdInputWithJavascript>? dotnetReference;
    private IJSObjectReference? module;

    protected override async Task OnInitializedAsync()
    {
        await base.OnInitializedAsync();
        dotnetReference = DotNetObjectReference.Create(this);
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        await base.OnAfterRenderAsync(firstRender);
        if (firstRender)
        {
            module = await JS.InvokeAsync<IJSObjectReference>("import",
                $"./Components/UI/{nameof(BcdInputWithJavascript)}.razor.js");
            await module.InvokeVoidAsync("BarcodeInputManager.register", dotnetReference, id);
        }
    }

    // [JSInvokable]属性を付与するとJS側から呼び出せるようになる
    [JSInvokable]
    public void ComponentOnEnter(string input)
    {
        OnCompleted.InvokeAsync(input);
    }

    async ValueTask IAsyncDisposable.DisposeAsync()
    {
        if(module is not null)
        {
            try
            {
                await module.DisposeAsync();
            }
            catch(JSDisconnectedException)
            {
            }
        }
        dotnetReference?.Dispose();
    }
}
```

```js
// BcdInputWithJavascript.razor.js
export class BarcodeInputManager {
    static register(ref, id) {
        const component = document.getElementById(id);
        component.addEventListener("keydown", (event) => {
            const key = event.key
            if (key == "Enter") {
                // 完了
                ref.invokeMethodAsync('ComponentOnEnter', component.value);
            }
            else if (key == "Tab") {
                // 元々のイベントを無効化して変更
                event.preventDefault();
                component.value = component.value + "\t";
            }
            // console.log(event)
        });
    }
}
```

JavascriptからBlazorのコードを呼び出すのはなかなか煩雑です。
普通にBlazorコンポーネントの関数をJS側から呼び出して終わり、というわけにはいかず、以下の手順を踏む必要があります。

1. Blazor側でmodule(`IJSObjectReference`)を読み込む。
    * globalにJS関数を置けば直接呼び出せるが、名前衝突のリスクがあるので避けたほうが良い
    * 大体は`{ComponentName}.razor.js`という名前で設置しておき、それを相対パスで読み込む
    * この相対パスというのが再利用性が低くて好きじゃない
2. Blazor側で`DotNetObjectReference`を作成する。
    * C#のインスタンスをJS側に渡さないと呼び出せないよね？ということらしい
3. JS側の関数を実行して`DotNetObjectReference`を渡す。
    * 今回はコンポーネントのIDも同時に渡して、イベントハンドラ登録も兼ねてる
4. Blazorの関数を呼びたくなったタイミングで、渡した`DotNetObjectReference`の`invokeMethodAsync`を呼び出す
    * 第一引数はBlazor側の関数名、第二引数以降は引数

うーん、面倒…
まあ基本的には1回書けば済むので、そういうものだと思って割り切るしかないですね。

ともあれ、これでやりたいことは実現できます。


## おまけ
キー入力の確認に便利なツール。
Optionから`ShowEvents`->`KeyDown`だけONにして読み取らせると、どんなキーが送信されているか確認できます。
バーコードスキャンの結果確認はいつもメモ帳にやってましたが、こっちのほうが便利そう。

https://w3c.github.io/uievents/tools/key-event-viewer.html
