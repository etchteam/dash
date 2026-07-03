import { rm } from 'node:fs/promises';
import { basename, dirname, join, normalize } from 'node:path';

/**
 * Parse frontmatter and content from an HTML file.
 * @param {string} raw - The raw HTML file content.
 * @returns {{ meta: Object, content: string }} Parsed metadata and content.
 */
export function parse(raw) {
  const meta = {};
  const frontmatter = /^<!---\n([\s\S]*?)\n--->/.exec(raw);

  if (!frontmatter) {
    return { meta, content: raw };
  }

  for (const line of frontmatter[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    meta[key.trim()] = rest.join(':').trim();
  }

  return {
    meta,
    content: raw.slice(frontmatter[0].length).trim()
  };
}

/**
 * Render a page by replacing layout placeholders with content and metadata.
 * @param {string} layout - The layout HTML template.
 * @param {Object} meta - Key-value metadata from frontmatter.
 * @param {string} content - The page content.
 * @returns {string} The rendered HTML.
 */
export function render(layout, meta, content) {
  let output = layout.replace('<!--- content --->', content);

  for (const [key, value] of Object.entries(meta)) {
    output = output.replace(`<!--- ${key} --->`, value);
  }

  return output;
}

/**
 * Extract all src/href reference targets from HTML.
 * @param {string} html - The HTML to scan.
 * @returns {string[]} The raw reference strings, in document order.
 */
export function extractRefs(html) {
  const refs = [];
  const re = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match;

  while ((match = re.exec(html)) !== null) {
    refs.push(match[1]);
  }

  return refs;
}

/**
 * Resolve a reference to the source-relative path of a copyable local asset.
 * @param {string} ref - A raw src/href value.
 * @param {string} pagePath - The source path of the page the ref appears in.
 * @returns {string|null} The normalised source-relative path, or null to skip.
 */
export function resolveAsset(ref, pagePath) {
  const target = ref.split(/[?#]/)[0];

  if (!target || target.startsWith('#')) {
    return null;
  }

  if (/^(?:[a-z]+:|\/\/)/i.test(target)) {
    return null;
  }

  if (target.endsWith('.html')) {
    return null;
  }

  const path = target.startsWith('/')
    ? target.slice(1)
    : join(dirname(pagePath), target);

  return normalize(path);
}

/**
 * Build all HTML pages using layout templates.
 * @param {Object} [options]
 * @param {function({ frontmatter: Object, content: string }): string} [options.transform]
 *   Optional transform function. Receives frontmatter and content for each page.
 *   Return a string to replace the content, or undefined to keep the original.
 * @param {boolean} [options.clean=true] - Wipe dist/ before building. Disabled
 *   during watch rebuilds.
 */
export async function build({ transform, clean = true } = {}) {
  if (clean) {
    await rm('dist', { recursive: true, force: true });
  }

  const glob = new Bun.Glob('**/*.html');
  const layouts = {};
  const pages = [];

  for await (const path of glob.scan('.')) {
    if (path.startsWith('dist/') || path.startsWith('node_modules/')) {
      continue;
    }

    if (/^layout\..*\.html$/.test(basename(path))) {
      const name = basename(path).match(/^layout\.(.*)\.html$/)[1];
      layouts[name] = await Bun.file(path).text();
    } else {
      pages.push(path);
    }
  }

  const copied = new Set();

  for (const path of pages) {
    const raw = await Bun.file(path).text();
    let { meta, content } = parse(raw);
    const layoutName = meta.layout || 'default';
    delete meta.layout;
    const layout = layouts[layoutName];

    if (!layout) {
      console.error(`No layout file named "layout.${layoutName}.html" found for ${path}`);
      continue;
    }

    if (typeof transform === 'function') {
      content = transform({ frontmatter: meta, content }) ?? content;
    }

    const rendered = render(layout, meta, content);
    await Bun.write(join('dist', path), rendered);

    for (const ref of extractRefs(rendered)) {
      const src = resolveAsset(ref, path);

      if (!src || copied.has(src)) {
        continue;
      }

      const file = Bun.file(src);

      if (await file.exists()) {
        await Bun.write(join('dist', src), file);
        copied.add(src);
      }
    }
  }
}
