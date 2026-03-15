<h1 style="text-align:center;font-style:italic;font-weight:900;margin-block:2rem;">
  --- DASH ---
</h1>

A tiny build tool that adds layouts and frontmatter to HTML.

## Installation

Dash requires [Bun](https://bun.sh) to run.

```sh
bun add @etchteam/dash
```

Or with npm:

```sh
npm install @etchteam/dash
```

Or [copy`build.js` source code](build.js) into your project. The entire build tool is a single file.

## Usage

### Build

Build all HTML pages into the `dist/` directory:

```sh
dash build
```

#### `--script`

Use a custom transform script to modify content during build. The script should default-export a function that receives `frontmatter` and `content` and returns the transformed content:

```js
// transform.js
export default function transform({
  frontmatter,
  content
}) {
  // Transform content however you like, e.g. process markdown
  return processedContent;
}
```

```sh
dash build --script transform.js
```

### Serve

Serve the `dist/` directory as a static site. Clean URLs are supported automatically — `/about` will serve `dist/about/index.html`.

```sh
dash serve
```

#### `--port`

Change the port (defaults to 3000):

```sh
dash serve --port 8080
```

#### `--watch`

Build first, then serve and automatically rebuild when HTML source files change:

```sh
dash serve --watch
```

### Programmatic

The `build` function can be imported and used as part of an existing script or build pipeline:

```js
import { build } from '@etchteam/dash';

await build(({ frontmatter, content }) => {
  // Transform content, e.g. process markdown
  return processedContent;
});
```

The callback is optional — calling `await build()` with no arguments runs a standard build.

The `startServer` function is also available for programmatic use:

```js
import { startServer } from '@etchteam/dash/serve';

startServer(8080);
```

## How it works

### Layouts

Create layout files with the naming convention `layout.{name}.html`:

```
layout.default.html
layout.article.html
```

Inside a layout, use three-dash HTML comments as placeholders:

```html
<!DOCTYPE html>
<html>
  <head>
    <title><!--- title ---></title>
  </head>
  <body>
    <!--- content --->
  </body>
</html>
```

`<!--- content --->` is a special placeholder that gets replaced with the page content. All other placeholders are replaced with values from the page's frontmatter.

### Pages

HTML files use a frontmatter-style comment block at the top:

```html
<!---
title: My Page
layout: article
--->

<h1>Hello</h1>
<p>This is my page content.</p>
```

The `layout` key specifies which layout file to use. If omitted, `layout.default.html` is used.

### Frontmatter

Three-dash HTML comments at the top of a file. Key-value pairs, one per line:

```html
<!---
title: Hello World
description: A simple page
author: Etch
--->
```

These values replace matching `<!--- key --->` placeholders in the layout. Because the frontmatter uses valid HTML comment syntax, your pages still work as plain HTML files in the browser.

## Similar tools

For more complex build needs, consider:

- [Eleventy (AKA Build awesome)](https://www.11ty.dev/)
- [Metalsmith](https://metalsmith.io/)
