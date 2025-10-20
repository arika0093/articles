### BarcodeScanWrapper.razor
```razor
@using Microsoft.JSInterop

<div id="@idComponent" @ref="element" class="barcode-wrapper @Class" style="@Style" tabindex="0">
    @ChildContent
    @if(ShowOverlay)
    {
        <div class="overlay">
            @if(OverlayContent != null)
            {
                @OverlayContent
            }
            else
            {
                <span>
                    ここをタップして、バーコードを読み込みます。
                </span>
            }
        </div>
    }
</div>

@inject IJSRuntime JS
@implements IDisposable
@code {
    [Parameter]
    public RenderFragment? ChildContent { get; set; }

    [Parameter]
    public RenderFragment? OverlayContent { get; set; }

    [Parameter]
    public EventCallback<string> OnScannedCallback { get; set; }

    [Parameter]
    public bool AutoFocus { get; set; } = true;

    [Parameter]
    public bool ShowOverlay { get; set; } = true;

    [Parameter]
    public string? Class { get; set; }

    [Parameter]
    public string? Style { get; set; }

    // ----------------------------
    // 設置場所に応じて変える
    const string RazorPath = "./Components/Components/Common";
    const string JSNamespace = "BarcodeScanner";
    private readonly string idComponent = Guid.NewGuid().ToString();
    private IJSObjectReference module = default!;
    private ElementReference element = default!;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if(firstRender)
        {
            // 初回読み込み時にJavaScriptを実行
            module = await JS.InvokeAsync<IJSObjectReference>("import",
                $"{RazorPath}/{nameof(BarcodeScanWrapper)}.razor.js");
            await module.InvokeVoidAsync($"{JSNamespace}.AddWatchEvent",
                DotNetObjectReference.Create(this), idComponent);
            // フォーカスをあわせる
            if(AutoFocus)
            {
                await element.FocusAsync();
            }
        }
    }

    [JSInvokable]
    public void OnScanned(string recieved)
    {
        OnScannedCallback.InvokeAsync(recieved);
        StateHasChanged();
    }

    public void Dispose()
    {
        module.InvokeVoidAsync($"{JSNamespace}.RemoveWatchEvent", idComponent);
    }
}
```

### BarcodeScanWrapper.razor.css

```css
.barcode-wrapper {
  tab-size: 2;
  flex: 1;
  border: 1px solid #CCC;
  border-radius: 4px;
  padding: 1ex;
  position: relative;
}

  .barcode-wrapper:focus {
    outline: none;
    border-color: #7cb1dc;
    box-shadow: 0 0 4px rgba(102, 175, 233, 0.4);
  }

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  background-color: #404040f0;
  color: #F0F0F0;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
}

.barcode-wrapper:focus .overlay {
  display: none;
}
```

### BarcodeScanWrapper.razor.js

```js
export class BarcodeScanner {
    static AddWatchEvent = async (dotNetHelper, id) => {
        const dom = document.getElementById(id);
        // キーボードのkeydown/keypressイベントを見て
        // Enterキー以外なら queueに貯める
        // Enterキーなら queueの値をDotNetに送信する
        // Tabキーは\tに変換する
        let queue = "";
        dom.addEventListener("keydown", (e) => {
            // Tabキーなら\tに変換
            if (e.key === "Tab") {
                queue += "\t";
                e.stopPropagation();
                e.preventDefault();
                return;
            }
            // それ以外は無視(keypress側で拾う)
        });
        dom.addEventListener("keypress", (e) => {
            // EnterキーならDotNetに送信する
            if (e.key === "Enter") {
                if (queue.length > 0) {
                    dotNetHelper.invokeMethodAsync("OnScanned", queue);
                    queue = "";
                }
                e.preventDefault();
                return;
            }
            // それ以外のキーならqueueに貯める
            if (e.key.length === 1) {
                queue += e.key;
            }
            e.stopPropagation();
            e.preventDefault();
        });
    }
    static RemoveWatchEvent = async (id) => {
        const dom = document.getElementById(id);
        dom.replaceWith(dom.cloneNode(true));
    }
}
```

### (YourUsagePage).razor

```razor
@page "/barcode-scan"

<BarcodeScanWrapper Style="height:400px" OnScannedCallback="OnScannedCallback">
    @(ScannedText ?? "バーコードをスキャン")
</BarcodeScanWrapper>

@code {
    private string? ScannedText { get; set; }

    private void OnScannedCallback(string scanned)
    {
        ScannedText = scanned;
        StateHasChanged();
    }
}
```
