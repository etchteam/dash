import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { parse, render, build } from './build.js';
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

  test('applies callback to transform content', async () => {
    await Bun.write(join(tmpDir, 'layout.default.html'), `<body><!--- content ---></body>`);
    await Bun.write(join(tmpDir, 'index.html'), `<!---
title: Test
--->

Hello`);

    await build(({ content }) => `<div class="wrapper">${content}</div>`);

    const output = await Bun.file(join(tmpDir, 'dist', 'index.html')).text();
    expect(output).toContain('<div class="wrapper">Hello</div>');
  });

  test('uses original content when callback returns undefined', async () => {
    await Bun.write(join(tmpDir, 'layout.default.html'), `<body><!--- content ---></body>`);
    await Bun.write(join(tmpDir, 'index.html'), `<!---
title: Test
--->

Hello`);

    await build(() => undefined);

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
});
