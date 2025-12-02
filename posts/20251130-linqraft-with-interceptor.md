---
title: Achieve Prisma-like Developer Experience in EF Core! Introduction to Linqraft
description: Learn about Linqraft, a C# library that enhances EF Core with Prisma-like features using interceptors and source generators.
tags: 'dotnet,csharp,efcore,interceptor'
cover_image: ''
canonical_url: null
published: true
---


The other day, I released a C# library called [Linqraft](https://arika0093.github.io/Linqraft/)! In this article, I'd like to introduce it.
![Top page that I put some effort into creating](https://raw.githubusercontent.com/arika0093/articles/refs/heads/main/articles/2025/20251130/image-1.png)

## Motivation
C# is a [wonderful language](https://blog.neno.dev/entry/2025/04/14/130323). With powerful type safety, a rich standard library, and the ability to handle everything from GUI app development to web development, I think it's an excellent language for almost any purpose.

However, there's something about C# that has been frustrating me on a daily basis.

That is: "**Defining classes is tedious!**" and "**Writing Select queries is tedious!**"

Since C# is a statically-typed language, you basically have to define all the classes you want to use. While this is unavoidable to some extent, having to define derived classes every time is extremely tedious.
Especially when using an ORM (Object-Relational Mapping) for database access, the shape of data you want must be defined as a **DTO** (Data Transfer Object) every time, resulting in writing similar class definitions over and over again.

Let's compare this with [Prisma](https://www.prisma.io/), a TypeScript ORM. In Prisma, you can write:

```typescript
// user type is automatically generated from schema file
const users = await prisma.user.findMany({
  // Specify the data you want with select
  select: {
    id: true,
    name: true,
    posts: {
      // You can also specify related table data with select
      select: {
        title: true,
      },
    },
  },
});

// The type of users automatically becomes: (automatically done for you!)
// This type can also be easily reused
type Users = {
  id: number;
  name: string;
  posts: {
    title: string;
  }[];
}[];
```

If you try to do the same thing in C#'s EF Core, it looks like this:

```csharp
// Assume Users type is defined in a separate file
var users = dbContext.Users
    // Specifying the data you want with Select is the same
    .Select(u => new UserWithPostDto
    {
        Id = u.Id,
        Name = u.Name,
        // Child classes are also specified with Select in the same way
        Posts = u.Posts.Select(p => new PostDto { Title = p.Title }).ToList()
    })
    .ToList();

// You have to define the DTO class yourself!
public class UserWithPostDto
{
    public int Id { get; set; }
    public string Name { get; set; }
    public List<PostDto> Posts { get; set; }
}
// Same for child classes
public class PostDto
{
    public string Title { get; set; }
}
// Since we already have a User class, it seems like it could be auto-generated from there...
```

In this regard, Prisma is clearly easier and more convenient. Even though we're already defining the Users type as a class[^1], it feels frustrating to have to manually define derived DTO classes.

[^1]: Think of it as defining the schema (Prisma's schema) as classes in C#. This part isn't too painful.

The above scale is still tolerable, but it gets even more painful in more complex cases.

```csharp
var result = dbContext.Orders
    .Select(o => new OrderDto
    {
        Id = o.Id,
        Customer = new CustomerDto
        {
            CustomerId = o.Customer.Id,
            CustomerName = o.Customer.Name,
            // Tedious part
            CustomerAddress = o.Customer.Address != null
                ? o.Customer.Address.Location
                : null,
            // Wrap in another DTO because we don't want to check every time
            AdditionalInfo = o.Customer.AdditionalInfo != null
                ? new CustomerAdditionalInfoDto
                {
                    InfoDetail = o.Customer.AdditionalInfo.InfoDetail,
                    CreatedAt = o.Customer.AdditionalInfo.CreatedAt
                }
                : null
        },
        Items = o.Items.Select(i => new OrderItemDto
        {
            ProductId = i.ProductId,
            Quantity = i.Quantity,
            // Same for arrays. Hard to read...
            ProductComments = i.CommentInfo != null
                ? i.CommentInfo.Comments.Select(c => new ProductCommentDto
                {
                    CommentText = c.CommentText,
                    CreatedBy = c.CreatedBy
                }).ToList()
                : new List<ProductCommentDto>()
        }).ToList()
    })
    .ToList();

// Not shown here, but all DTO class definitions used above also need to be defined
```

First of all, there are already 5 DTOs in the above example, which is extremely tedious. But even more annoying is the "null checking".
First, EF Core's Select expressions **cannot use `?.` (null-conditional operator)**. Specifically, it cannot be used inside `Expression<...>`.
Therefore, you have to write code that uses ternary operators to check for null, and if it's not null, access the member below it.

For child classes alone, you can simply write `o.A != null ? o.A.B : null`, but as this gets deeper to grandchild classes and great-grandchild classes, the null checking code keeps growing and becomes very hard to read.

```csharp
// Unbelievably hard to read
Property = o.A != null && o.A.B != null && o.A.B.C != null
    ? o.A.B.C.D
    : null
```

The same applies when picking up array values in child classes (which can be null), requiring tedious code.

```csharp
// Give me a break
Items = o.Child != null
    ? o.Child.Items.Select(i => new ItemDto{ /* ... */ }).ToList()
    : new List<ItemDto>()
```

What do you think? I really hate this.

## What I Wanted

Looking at the Prisma example above again, it has roughly the following features (using TypeScript language features as well):

* When you write a query once, the corresponding type is generated
* You can write `?.` directly in queries without worrying about null checking

After thinking about it, I realized that by combining **anonymous types**, **source generators**, and **interceptors**, these features could be achieved.

## Attempting the Implementation
### Using Anonymous Types

Are you familiar with C#'s anonymous types? It's a feature where the compiler automatically generates a corresponding class when you write `new { ... }` as shown below.

```csharp
// Don't write a type name after new
var anon = new
{
    Id = 1,
    Name = "Alice",
    IsActive = true
};
```

Some of you may not have used this much, but it's very convenient for defining disposable classes in `Select` queries.

```csharp
var users = dbContext.Users
    .Select(u => new
    {
        Id = u.Id,
        Name = u.Name,
        Posts = u.Posts.Select(p => new { Title = p.Title }).ToList()
    })
    .ToList();

// You can access and use it normally
var user = users[0];
Console.WriteLine(user.Name);
foreach(var post in user.Posts)
{
    Console.WriteLine(post.Title);
}
```

However, as it's called an "anonymous" type, the actual type name doesn't exist, so it **cannot be used as method arguments or return values**. This restriction is quite painful, so it surprisingly doesn't have many opportunities to shine.

### Auto-generating Corresponding Classes
This means that if we create a **source generator that automatically generates corresponding classes** based on what's defined with anonymous types, wouldn't that work? This is a natural progression. Linqraft achieves exactly this.

Specifically, using a specific method name (`SelectExpr`) as a hook point, it **automatically generates class definitions based on the anonymous type** passed as an argument.
Since it would be inconvenient if you couldn't specify the generated class name, it's designed to allow you to specify the class name as a generic type argument.

```csharp
var users = dbContext.Users
    // In this case, auto-generate a class called UserDto
    .SelectExpr<User,UserDto>(u => new
    {
        Id = u.Id,
        Name = u.Name,
        Posts = u.Posts.Select(p => new { Title = p.Title }).ToList()
    })
    .ToList();

// ---
// A class like this is auto-generated
public class UserDto
{
    public int Id { get; set; }
    public string Name { get; set; }
    public List<PostDto_Hash1234> Posts { get; set; }
}
// Child classes are also auto-generated
// Hash value is automatically added to avoid name conflicts
public class PostDto_Hash1234
{
    public string Title { get; set; }
}
```

You just look at the elements of the passed anonymous type and generate the corresponding class definition using Roslyn API (though it's quite difficult!). Simple, right?

At this point, we've achieved automatic class generation, but we need to replace the behavior of the called `SelectExpr` to work like a normal `Select`.
This is where interceptors come in.

### Replacing Processing with Interceptors
Did you know that C# has a feature called interceptors?
Since it's such a niche area, few people probably know about it, but it's a feature that allows you to hook specific method calls and replace them with arbitrary processing.
It was preview-released in .NET 8 and became stable in .NET 9.

Even if I say that, it might be hard to imagine, so let's consider code like this:

```csharp
// Pattern calling a very time-consuming process with constant values
var result1 = "42".ComputeSomething();   // case 1
var result2 = "420".ComputeSomething();  // case 2
var result3 = "4200".ComputeSomething(); // case 3
```

Since it's being called with constant values, we should be able to calculate the results at compile time. In such cases, by pre-implementing interceptors in combination with source generators, you can replace calls like this:

```csharp
// Imagine this class is auto-generated by Source Generator.
// Public level can be file
file static class PreExecutedInterceptor
{
    // Get the hash value of the call site using Roslyn API and attach InterceptsLocationAttribute
    [global::System.Runtime.CompilerServices.InterceptsLocationAttribute(1, "(hash of case1)")]
    // Function name can be random. Arguments and return value should be the same as the original function
    public static int ComputeSomething_Case1(this string value)
    {
        // Pre-calculate and return the result for case 1
        return 84;
    }

    // Same for case 2 and 3
    [global::System.Runtime.CompilerServices.InterceptsLocationAttribute(1, "(hash of case2)")]
    public static int ComputeSomething_Case2(this string value) => 168;

    [global::System.Runtime.CompilerServices.InterceptsLocationAttribute(1, "(hash of case3)")]
    public static int ComputeSomething_Case3(this string value) => 336;
}
```

While defining as a regular extension method would cause definition duplication, using interceptors allows you to **replace different processing for each call site**.

Linqraft uses this mechanism to intercept `SelectExpr` calls and replace them with regular `Select`.

```csharp
// Suppose there's a call like this
var orders = dbContext.Orders
    .SelectExpr<Order,OrderDto>(o => new
    {
        Id = o.Id,
        CustomerName = o.Customer?.Name,
        CustomerAddress = o.Customer?.Address?.Location,
    })
    .ToList();
```

```csharp
// Example of generated code
file static partial class GeneratedExpression
{
    [global::System.Runtime.CompilerServices.InterceptsLocationAttribute(1, "hash of SelectExpr call")]
    // Need to keep the base anonymous type conversion query, so selector is also taken as an argument (not actually used)
    public static IQueryable<TResult> SelectExpr_0ED9215A_7FE9B5FF<TIn, TResult>(
        this IQueryable<TIn> query,
        Func<TIn, object> selector)
    {
        // Can only receive <TIn> by specification, but we actually know the original type so cast it
        var matchedQuery = query as object as IQueryable<global::Order>;
        // Convert the pseudo-query to a regular Select
        // Map to the auto-generated DTO class created earlier
        var converted = matchedQuery.Select(s => new global::OrderDto
        {
            Id = s.Id,
            // Mechanically replace null-conditional operator with regular ternary operator check
            CustomerName = s.Customer != null ? s.Customer.Name : null,
            CustomerAddress = s.Customer != null && s.Customer.Address != null
                ? s.Customer.Address.Location
                : null,
        });
        // Can only return <TResult> by specification so cast again
        return converted as object as IQueryable<TResult>;
    }
}
```

This allows users to write queries easily with the feeling of a regular `Select`!

### And Towards Zero Dependencies
With the above measures, all calls to `SelectExpr` are completely intercepted by separately generated code. As a result, the original `SelectExpr` body has nothing to do and exists only for editor completion.

If so, if we output that dummy method itself with a source generator, we shouldn't need a reference to Linqraft itself! So that's what we do.

```csharp
public static void ExportAll(IncrementalGeneratorPostInitializationContext context)
{
    context.AddSource("SelectExprExtensions.g.cs", SelectExprExtensions);
}

const string SelectExprExtensions = $$""""
    {{CommonHeader}}

    using System;
    using System.Collections.Generic;
    using System.Linq;

    /// <summary>
    /// Dummy expression methods for Linqraft to compile correctly.
    /// </summary>
    internal static class SelectExprExtensions
    {
        /// <summary>
        /// Create select expression method, usable nullable operators, and generate instance DTOs.
        /// </summary>
        public static IQueryable<TResult> SelectExpr<TIn, TResult>(this IQueryable<TIn> query, Func<TIn, TResult> selector)
            where TIn : class => throw InvalidException;

        // Other variants are also included here
    }
    """";
```

Then, if you enable `DevelopmentDependency`, you can make it a package that's not included in the actual build output at all!
```xml
<PropertyGroup>
  <DevelopmentDependency>true</DevelopmentDependency>
</PropertyGroup>
```

In fact, when you install Linqraft via nuget etc., it should look like this. This means it's a development-only package.
```xml
<PackageReference Include="Linqraft" Version="0.4.0">
  <PrivateAssets>all</PrivateAssets>
  <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
</PackageReference>
```

## Analyzer for Replacing Existing Code
Now, some of you who have heard the story so far may want to try it right away!
For those people, Linqraft also provides a **Roslyn Analyzer that automatically replaces existing `Select` queries with `SelectExpr`**.
It's very easy to use - just right-click on the Select query part and replace it in one go from Quick Actions.
![](https://raw.githubusercontent.com/arika0093/Linqraft/refs/heads/main/assets/replace-codefix-sample.gif)

## Summary
So, by using Linqraft to write queries simply like this:
* Corresponding DTO classes are automatically generated,
* You can write without worrying about null checking,
* Plus it has zero dependencies, so it's no different from hand-written code,
* Migration is reasonably easy.

```csharp
// Zero dependencies!
var orders = dbContext.Orders
    .SelectExpr<Order, OrderDto>(o => new
    {
        Id = o.Id,
        // You can write with ?.!
        CustomerName = o.Customer?.Name,
        CustomerAddress = o.Customer?.Address?.Location,
    })
    .ToList();
// OrderDto class and its contents are auto-generated!
```

I hate to say it myself, but I think we've created a pretty useful library.
Please try it out! If you like it, please give us a star.
https://github.com/arika0093/Linqraft

## Side Note
I also put some effort into the introduction web page. Specifically, you can test functionality on the web page!
I also implemented a feature that parses Token information with Roslyn and feeds it into Monaco Editor for syntax highlighting.

![Playground screen](https://raw.githubusercontent.com/arika0093/articles/refs/heads/main/articles/2025/20251130/image.png)

Please check this out as well.
https://arika0093.github.io/Linqraft/
