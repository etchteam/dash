import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { parse, render, build, extractRefs, resolveAsset } from './build.js';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

describe('parse', () => {
  test('extracts frontmatter meta and content', () => {
    const raw = `<!---
title: Hello World
description: A test page
--->

<h1>Hello</h1>`;

    const { meta, content } = parse(raw);
    expect(meta).toEqual({ title: 'Hello World', description: 'A test page' });
    expect(content).toBe('<h1>Hello</h1>');
  });

  test('handles no frontmatter', () => {
    const raw = '<p>Just content</p>';
    const { meta, content } = parse(raw);
    expect(meta).toEqual({});
    expect(content).toBe('<p>Just content</p>');
  });

  test('handles colons in values', () => {
    const raw = `<!---
title: Time: 10:30
--->

<p>Content</p>`;

    const { meta } = parse(raw);
    expect(meta.title).toBe('Time: 10:30');
  });
});

describe('render', () => {
  const layout = `<!DOCTYPE html>
<html>
  <head><title><!--- title ---></title></head>
  <body><!--- content ---></body>
</html>`;

  test('replaces content and meta placeholders', () => {
    const result = render(layout, { title: 'Home' }, '<h1>Home</h1>');
    expect(result).toContain('<title>Home</title>');
    expect(result).toContain('<body><h1>Home</h1></body>');
  });

  test('leaves unmatched placeholders as-is', () => {
    const result = render(layout, {}, '<p>Hello</p>');
    expect(result).toContain('<title><!--- title ---></title>');
    expect(result).toContain('<body><p>Hello</p></body>');
  });
});

describe('extractRefs', () => {
  test('pulls both src and href', () => {
    const html = `<link href="css/main.css"><script src='js/app.js'></script>`;
    expect(extractRefs(html)).toEqual(['css/main.css', 'js/app.js']);
  });

  test('ignores markup without src/href', () => {
    expect(extractRefs('<h1>Title</h1><p data-x="y">Text</p>')).toEqual([]);
  });
});

describe('resolveAsset', () => {
  test('skips external, data, mailto, protocol-relative and anchors', () => {
    expect(resolveAsset('https://x.com/a.css', 'index.html')).toBeNull();
    expect(resolveAsset('//cdn.com/a.js', 'index.html')).toBeNull();
    expect(resolveAsset('data:image/png;base64,AAAA', 'index.html')).toBeNull();
    expect(resolveAsset('mailto:a@b.com', 'index.html')).toBeNull();
    expect(resolveAsset('#section', 'index.html')).toBeNull();
  });

  test('skips html pages', () => {
    expect(resolveAsset('about.html', 'index.html')).toBeNull();
  });

  test('resolves page-relative refs against the page directory', () => {
    expect(resolveAsset('img/logo.png', 'blog/post.html')).toBe('blog/img/logo.png');
    expect(resolveAsset('../style.css', 'blog/post.html')).toBe('style.css');
  });

  test('resolves root-relative refs against the project root', () => {
    expect(resolveAsset('/css/main.css', 'blog/post.html')).toBe('css/main.css');
  });

  test('strips query and hash', () => {
    expect(resolveAsset('app.js?v=2', 'index.html')).toBe('app.js');
    expect(resolveAsset('font.woff2#iefix', 'index.html')).toBe('font.woff2');
  });
});

describe('build', () => {
  let tmpDir;
  let originalCwd;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dash-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true });
  });

  test('builds pages into dist/ using layout', async () => {
    await Bun.write(join(tmpDir, 'layout.default.html'), `<!DOCTYPE html>
<html>
  <head><title><!--- title ---></title></head>
  <body><!--- content ---></body>
</html>`);

    await Bun.write(join(tmpDir, 'index.html'), `<!---
title: Home
--->

<h1>Welcome</h1>`);

    await build();

    const output = await Bun.file(join(tmpDir, 'dist', 'index.html')).text();
    expect(output).toContain('<title>Home</title>');
    expect(output).toContain('<body><h1>Welcome</h1></body>');
  });

  test('applies transform to content', async () => {
    await Bun.write(join(tmpDir, 'layout.default.html'), `<body><!--- content ---></body>`);
    await Bun.write(join(tmpDir, 'index.html'), `<!---
title: Test
--->

Hello`);

    await build({ transform: ({ content }) => `<div class="wrapper">${content}</div>` });

    const output = await Bun.file(join(tmpDir, 'dist', 'index.html')).text();
    expect(output).toContain('<div class="wrapper">Hello</div>');
  });

  test('uses original content when transform returns undefined', async () => {
    await Bun.write(join(tmpDir, 'layout.default.html'), `<body><!--- content ---></body>`);
    await Bun.write(join(tmpDir, 'index.html'), `<!---
title: Test
--->

Hello`);

    await build({ transform: () => undefined });

    const output = await Bun.file(join(tmpDir, 'dist', 'index.html')).text();
    expect(output).toContain('<body>Hello</body>');
  });

  test('logs error for missing layout', async () => {
    await Bun.write(join(tmpDir, 'index.html'), `<!---
layout: nonexistent
--->

<p>Content</p>`);

    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args.join(' '));

    await build();

    console.error = originalError;
    expect(errors[0]).toContain('layout.nonexistent.html');
  });

  test('copies referenced local assets into dist at mirrored paths', async () => {
    await Bun.write(join(tmpDir, 'layout.default.html'),
      `<head><link href="css/main.css"></head><body><!--- content ---></body>`);
    await Bun.write(join(tmpDir, 'css', 'main.css'), 'body{color:red}');
    await Bun.write(join(tmpDir, 'img', 'logo.png'), 'PNGDATA');
    await Bun.write(join(tmpDir, 'index.html'), `<!---
title: Home
--->

<img src="img/logo.png">`);

    await build();

    expect(await Bun.file(join(tmpDir, 'dist', 'css', 'main.css')).text()).toBe('body{color:red}');
    expect(await Bun.file(join(tmpDir, 'dist', 'img', 'logo.png')).text()).toBe('PNGDATA');
  });

  test('ignores missing files and external URLs', async () => {
    await Bun.write(join(tmpDir, 'layout.default.html'), `<body><!--- content ---></body>`);
    await Bun.write(join(tmpDir, 'index.html'), `<!---
title: Home
--->

<link href="https://cdn.com/x.css"><img src="missing.png">`);

    await build();

    expect(await Bun.file(join(tmpDir, 'dist', 'missing.png')).exists()).toBe(false);
  });

  test('cleans dist before building', async () => {
    await Bun.write(join(tmpDir, 'layout.default.html'), `<body><!--- content ---></body>`);
    await Bun.write(join(tmpDir, 'dist', 'stale.html'), 'old');
    await Bun.write(join(tmpDir, 'index.html'), `<!---\ntitle: Home\n--->\n\n<p>New</p>`);

    await build();

    expect(await Bun.file(join(tmpDir, 'dist', 'stale.html')).exists()).toBe(false);
    expect(await Bun.file(join(tmpDir, 'dist', 'index.html')).exists()).toBe(true);
  });

  test('leaves stale outputs when clean is disabled', async () => {
    await Bun.write(join(tmpDir, 'layout.default.html'), `<body><!--- content ---></body>`);
    await Bun.write(join(tmpDir, 'dist', 'stale.html'), 'old');
    await Bun.write(join(tmpDir, 'index.html'), `<p>New</p>`);

    await build({ clean: false });

    expect(await Bun.file(join(tmpDir, 'dist', 'stale.html')).exists()).toBe(true);
    expect(await Bun.file(join(tmpDir, 'dist', 'index.html')).exists()).toBe(true);
  });

  test('skips pages inside node_modules', async () => {
    await Bun.write(join(tmpDir, 'layout.default.html'), `<body><!--- content ---></body>`);
    await Bun.write(join(tmpDir, 'node_modules', 'pkg', 'index.html'), '<p>Dep</p>');
    await Bun.write(join(tmpDir, 'index.html'), `<!---\ntitle: Home\n--->\n\n<p>New</p>`);

    await build();

    expect(await Bun.file(join(tmpDir, 'dist', 'node_modules', 'pkg', 'index.html')).exists()).toBe(false);
    expect(await Bun.file(join(tmpDir, 'dist', 'index.html')).exists()).toBe(true);
  });

  test('copies a shared asset once across multiple pages', async () => {
    await Bun.write(join(tmpDir, 'layout.default.html'),
      `<head><link href="/shared.css"></head><body><!--- content ---></body>`);
    await Bun.write(join(tmpDir, 'shared.css'), '.a{}');
    await Bun.write(join(tmpDir, 'index.html'), `<!---\ntitle: A\n--->\n\n<p>A</p>`);
    await Bun.write(join(tmpDir, 'about.html'), `<!---\ntitle: B\n--->\n\n<p>B</p>`);

    await build();

    expect(await Bun.file(join(tmpDir, 'dist', 'shared.css')).text()).toBe('.a{}');
  });
});
