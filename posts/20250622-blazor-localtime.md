---
title: "Display and Edit DateTime Correctly with Time Zone Awareness in Blazor Server"
description: "Learn how to handle DateTime in Blazor Server with the BlazorLocalTime library"
tags: "dotnet,csharp,blazor,timezone"
cover_image: ''
canonical_url: null
published: false
---

Blazor Server makes it easy to build web apps with intuitive syntax, but handling dates and times (`DateTime`) requires special attention.

## The Problem

Can you spot the bug in the following code?

```razor
<p>@DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")</p>
```

The answer: **This displays the current time on the server, not the user's local time**. The time is formatted according to the Blazor host server's time zone, which may not match the user's time zone.

This bug occurs when the Blazor host server's time zone ≠ user's time zone. It's a subtle issue that's easy to miss during development.

A similar problem arises with date/time input fields. You can't tell which time zone the entered value refers to.

```razor
<InputDate Type="InputDateType.DateTimeLocal" @bind-Value="dt" />
@code {
	private DateTime dt { get; set; }
	private void SaveToDatabase()
	{
		// Can't correctly convert to UTC (uses server's TZ)
		var utc = dt?.ToUniversalTime();
	}
}
```

## The Solution

To quickly solve these issues, I created a library called `BlazorLocalTime`:
https://github.com/arika0093/BlazorLocalTime

You can see a live demo here:
https://arika0093.github.io/BlazorLocalTime/

### Setup

First, install `BlazorLocalTime` from [NuGet](https://www.nuget.org/packages/BlazorLocalTime):

```bash
dotnet add package BlazorLocalTime
```

Next, register the service in your `Program.cs`:

```csharp
builder.Services.AddBlazorLocalTimeService();
```

Finally, add the following component to `Routes.razor` (or `MainLayout.razor`, etc.):

```razor
@using BlazorLocalTime
<BlazorLocalTimeProvider />
```

### Usage

To display a date/time as a string in the user's local time:

```razor
<LocalTimeText Value="@dt" Format="yyyy-MM-dd HH:mm:ss" />
```

To get the converted value as a `DateTimeOffset`:

```razor
<LocalTime Value="@DateTime.UtcNow" Context="dt">
	@dt.ToString("yyyy-MM-dd HH:mm:ss")
</LocalTime>
```

You can also convert in code:

```razor
@inject ILocalTimeService LocalTimeService
@code {
	private void ButtonClicked()
	{
		var localNow = LocalTimeService.ToLocalTime(DateTime.UtcNow);
	}
}
```

For input forms:

```razor
<LocalTimeForm @bind-Value="Dt" Context="dtf">
	<InputDate Type="InputDateType.DateTimeLocal" @bind-Value="dtf.Value" />
	@* or *@
	<InputDate Type="InputDateType.Date" @bind-Value="dtf.Date" />
	<InputDate Type="InputDateType.Time" @bind-Value="dtf.Time" />
</LocalTimeForm>

@code {
	private DateTime Dt { get; set; } = DateTime.UtcNow;
}
```

You can use it with component libraries like MudBlazor as well.

## How It Works

The approach is similar to [this article](https://www.meziantou.net/convert-datetime-to-user-s-time-zone-with-server-side-blazor-time-provider.htm), but here's an explanation in English.

First, you need to get the user's time zone. Since Blazor can't do this directly, you need to use JavaScript:

```js
export function getBrowserTimeZone() {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
```

Prepare this function in a `.js` file, then call it from Blazor using JS interop (`IJSRuntime`). Pass the result to `ILocalTimeService`. That's why you need to add `<BlazorLocalTimeProvider />` somewhere in your app.

```csharp
public interface ILocalTimeService
{
	TimeZoneInfo? TimeZoneInfo { get; set; }
	public DateTime ToLocalTime(DateTime utcDateTime);
	// and more ...
}

public class BlazorLocalTimeProvider : ComponentBase
{
	private const string JsPath = "./wwwroot/BlazorLocalTimeProvider.razor.js";

	[Inject]
	private IJSRuntime JsRuntime { get; set; } = null!;
	[Inject]
	private ILocalTimeService LocalTimeService { get; set; } = null!;

	protected override async Task OnAfterRenderAsync(bool firstRender)
	{
		if (firstRender)
		{
			await using var module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", JsPath);
			var timeZoneString = await module.InvokeAsync<string>("getBrowserTimeZone");
			var timeZone = TimeZoneInfo.FindSystemTimeZoneById(timeZoneString);
			LocalTimeService.TimeZoneInfo = timeZone;
		}
	}
}
```

Since you want a separate `ILocalTimeService` per user, register it as scoped in DI. That's what `builder.Services.AddBlazorLocalTimeService()` does:

```csharp
public static class BlazorLocalTimeExtension
{
	public static IServiceCollection AddBlazorLocalTimeService(
		this IServiceCollection services)
	{
		services.AddScoped<ILocalTimeService, LocalTimeService>();
		return services;
	}
}
```

Now you can convert from UTC using the obtained `TimeZoneInfo`:

```csharp
public class LocalTimeService : ILocalTimeService
{
	public DateTime ToLocalTime(DateTime utcDateTime)
		=> TimeZoneInfo.ConvertTimeFromUtc(utcDateTime, TimeZoneInfo!);
	// and more...
}
```

Note: On the initial render (`OnInitialized`), the JavaScript function hasn't run yet, so conversion will fail. To handle this, an event handler is used to refresh the component when the time zone is set:

```csharp
public class LocalTimeService : ILocalTimeService
{
	private TimeZoneInfo? _timeZoneInfo;
	public TimeZoneInfo? TimeZoneInfo
	{
		get => _timeZoneInfo;
		set
		{
			_timeZoneInfo = value;
			LocalTimeZoneChanged.Invoke(this, EventArgs.Empty);
		}
	}
	public event EventHandler LocalTimeZoneChanged = delegate { };
}

public sealed partial class LocalTimeText : ComponentBase, IDisposable
{
	[Inject]
	private ILocalTimeService LocalTimeService { get; set; } = null!;

	protected override void OnInitialized()
	{
		LocalTimeService.LocalTimeZoneChanged += OnLocalTimeZoneChanged;
	}

	public void Dispose()
	{
		LocalTimeService.LocalTimeZoneChanged -= OnLocalTimeZoneChanged;
	}

	private void OnLocalTimeZoneChanged(object? sender, EventArgs e)
	{
		StateHasChanged();
	}
}
```

For input forms, different UI libraries use different types (`DateTime`, `DateOnly`, `TimeOnly`, `TimeSpan`), so the library provides a wrapper class to handle all cases:

```csharp
// Class passed to children of <LocalTimeForm>
public record LocalTimeFormValue
{
	private DateTime? _innerValue;

	public required DateTime? Value
	{
		get => _innerValue;
		set
		{
			_innerValue = value;
			ValueChanged.InvokeAsync(value);
		}
	}

	public DateOnly? Date
	{
		get =>
			Value.HasValue
				? new DateOnly(Value.Value.Year, Value.Value.Month, Value.Value.Day)
				: null;
		set => DateChanged.InvokeAsync(value);
	}

	public TimeOnly? Time
	{
		get =>
			Value.HasValue
				? new TimeOnly(Value.Value.Hour, Value.Value.Minute, Value.Value.Second)
				: null;
		set => TimeChanged.InvokeAsync(value);
	}

	public TimeSpan? TimeSpan
	{
		get =>
			Value.HasValue
				? new TimeSpan(Value.Value.Hour, Value.Value.Minute, Value.Value.Second)
				: null;
		set => TimeSpanChanged.InvokeAsync(value);
	}

	public required EventCallback<DateTime?> ValueChanged { get; init; }
	public required EventCallback<DateOnly?> DateChanged { get; init; }
	public required EventCallback<TimeOnly?> TimeChanged { get; init; }
	public required EventCallback<TimeSpan?> TimeSpanChanged { get; init; }
}
```

## Conclusion

Handling time zones in Blazor Server is tricky and repetitive. That's why I made this library. Give it a try!
https://github.com/arika0093/BlazorLocalTime
