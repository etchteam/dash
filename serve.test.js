import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from './serve.js';
import { join } from 'node:path';

describe('startServer', () => {
  let server;

  beforeAll(async () => {
    await Bun.write(join(import.meta.dir, 'dist', 'index.html'), '<h1>Home</h1>');
    await Bun.write(join(import.meta.dir, 'dist', 'about', 'index.html'), '<h1>About</h1>');
    await Bun.write(join(import.meta.dir, 'dist', 'style.css'), 'body { color: red; }');

    server = startServer(0);
  });

  afterAll(() => {
    server.stop(true);
  });

  test('serves files from dist/', async () => {
    const res = await fetch(`http://localhost:${server.port}/index.html`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<h1>Home</h1>');
  });

  test('returns 404 for missing files', async () => {
    const res = await fetch(`http://localhost:${server.port}/nonexistent.html`);
    expect(res.status).toBe(404);
  });

  test('appends index.html to trailing slash', async () => {
    const res = await fetch(`http://localhost:${server.port}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<h1>Home</h1>');
  });

  test('appends /index.html to clean URLs', async () => {
    const res = await fetch(`http://localhost:${server.port}/about`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<h1>About</h1>');
  });

  test('serves non-html files', async () => {
    const res = await fetch(`http://localhost:${server.port}/style.css`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('body { color: red; }');
  });
});
