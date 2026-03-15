import { join } from 'node:path';

/**
 * Start a static file server for the dist/ directory.
 * @param {number} [port=3000] - The port to serve on.
 * @returns {import('bun').Server} The Bun server instance.
 */
export function startServer(port = 3000) {
  const distDir = join(process.cwd(), 'dist');

  const server = Bun.serve({
    port,
    async fetch(req) {
      let path = new URL(req.url).pathname;

      if (path.endsWith('/')) {
        path += 'index.html';
      }

      if (!path.includes('.')) {
        path += '/index.html';
      }

      const distFile = Bun.file(join(distDir, path));

      if (await distFile.exists()) {
        return new Response(distFile);
      }

      return new Response('Not found', { status: 404 });
    },
  });

  console.log(`Serving dist/ at http://localhost:${server.port}`);

  return server;
}
