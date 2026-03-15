#!/usr/bin/env bun

import { resolve } from 'node:path';
import { watch } from 'node:fs';
import { build } from './build.js';
import { startServer } from './serve.js';

const args = process.argv.slice(2);
const command = args[0];

const USAGE = `Usage:
  dash build                        Build HTML files to dist/
  dash build --script <filepath>    Build with a custom transform script
  dash serve                        Serve dist/ on port 3000
  dash serve --port <number>        Serve on a custom port
  dash serve --watch                Build, serve, and rebuild on changes`;

if (command === 'build') {
  const scriptIdx = args.indexOf('--script');

  if (scriptIdx !== -1) {
    const scriptPath = args[scriptIdx + 1];

    if (!scriptPath) {
      console.error('Error: --script requires a file path');
      process.exit(1);
    }

    const mod = await import(resolve(scriptPath));
    await build(mod.default);
  } else {
    await build();
  }
} else if (command === 'serve') {
  const watching = args.includes('--watch');

  if (watching) {
    await build();

    let debounceTimer;

    watch('.', { recursive: true }, (event, filename) => {
      if (!filename) {
        return;
      }

      if (filename.startsWith('dist/') || filename.startsWith('.')) {
        return;
      }

      if (!filename.endsWith('.html')) {
        return;
      }

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        console.log(`Changed: ${filename}, rebuilding...`);
        await build();
      }, 100);
    });
  }

  const portIdx = args.indexOf('--port');
  const port = portIdx === -1 ? 3000 : Number(args[portIdx + 1]);

  startServer(port);
} else {
  console.log(USAGE);
}
