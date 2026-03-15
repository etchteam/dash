import { basename, join } from 'node:path';

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
 * Build all HTML pages using layout templates.
 * @param {function({ frontmatter: Object, content: string }): string} [callback]
 *   Optional transform function. Receives frontmatter and content for each page.
 *   Return a string to replace the content, or undefined to keep the original.
 */
export async function build(callback) {
  const glob = new Bun.Glob('**/*.html');
  const layouts = {};
  const pages = [];

  for await (const path of glob.scan('.')) {
    if (path.startsWith('dist/')) {
      continue;
    }

    if (/^layout\..*\.html$/.test(basename(path))) {
      const name = basename(path).match(/^layout\.(.*)\.html$/)[1];
      layouts[name] = await Bun.file(path).text();
    } else {
      pages.push(path);
    }
  }

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

    if (typeof callback === 'function') {
      content = callback({ frontmatter: meta, content }) ?? content;
    }

    const outPath = join('dist', path);
    await Bun.write(outPath, render(layout, meta, content));
  }
}
