```xml
<ItemGroup>
  <PackageReference Include="mvdmio.Tailwind.NET" Version="2.0.7" />
</ItemGroup>
```

mkdir `Tailwind`

TailWind/tailwind.input.css
```css
@import "tailwindcss";
```

Components/App.razor
```html
<link rel="stylesheet" href="@Assets["tailwind.output.css"]" />
```

```razor
@page "/"

<PageTitle>Home</PageTitle>

<div class="flex h-dvh flex-col items-center justify-center">
    <h1 class="p-2 font-bold text-5xl">Hello, world!</h1>
    <p class="">Welcome to your new app.</p>
</div>
```


Build

![](https://imgur.com/ybCaiI1.png)
