---
title: "【Blazor】バーコードリーダー対応の入力フォームを作成する"
emoji: "🌍️"
type: "tech"
topics: ["dotnet", "blazor", "barcode"]
published: false
---

## memo


使用したバーコードリーダー
DATALOGIC Gryphon 4500 Series


バーコードにタブ文字が入っていると勝手に別部位に遷移してしまう
末尾に改行を入れてくれるので、それを使って読み取り完了処理を呼び出したい
→ 自作。

https://w3c.github.io/uievents/tools/key-event-viewer.html
出力確認に便利
Optionから`ShowEvents`->`KeyDown`だけONにして読み取らせる

Blazorだけの例
```razor
<input type="text" value="@inputText"
       @onkeydown="OnKeyDown" @onkeydown:preventDefault="preventDefault" />

@code {
    [Parameter]
    public EventCallback<string> OnCompleted { get; set; }

    string inputText = "";
    bool preventDefault = false;

    private void OnKeyDown(KeyboardEventArgs args)
    {
        var key = args.Key;
        keys.Add(key);
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
            // 普通の文字なので、そのまま反映させる
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


Javascriptと合わせた例
参考: https://learn.microsoft.com/ja-jp/aspnet/core/blazor/javascript-interoperability/call-dotnet-from-javascript?view=aspnetcore-9.0#pass-a-dotnetobjectreference-to-a-class-with-multiple-javascript-functions

```razor
@* https://learn.microsoft.com/ja-jp/aspnet/core/blazor/javascript-interoperability/call-dotnet-from-javascript *@
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
            await module.InvokeVoidAsync("BarcodeInputManager.registor", dotnetReference, id);
        }
    }

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
export class BarcodeInputManager {
    static registor(ref, id) {
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
            else if (key.Length == 1) {
                // 普通の文字なので、そのまま反映させる
                event.preventDefault();
                component.value = component.value + key;
            }
            // console.log(event)
        });
    }
}
```

入力結果が違うことがある

`\`記号があるときに、バーコードリーダーは `Alt` `0` `9` `2` と入力 → `\`記号を入力してる
上記のBlazorだけのコードだとそこまで見てないので`092...`となってしまう
Javascript側でやったほうが良さげ。サーバー間通信も発生しないし。


