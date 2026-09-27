import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(projectRoot, 'dist-single');
const outputPath = path.join(projectRoot, 'AniMap-demo.html');

const toDataUrl = (mimeType, buffer) => `data:${mimeType};base64,${buffer.toString('base64')}`;
const toPosix = (value) => value.replaceAll(path.sep, '/');

const listFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  }));
  return files.flat();
};

const resolveBuiltAsset = (url) => {
  const cleanUrl = decodeURIComponent(url.split('?')[0]).replace(/^\.?\//, '');
  return path.join(distDir, cleanUrl);
};

process.env.VITE_SINGLE_FILE = 'true';
process.env.VITE_API_URL ||= 'https://animap.top/api';

await build({
  configFile: path.join(projectRoot, 'vite.single.config.ts'),
  mode: 'production',
});

const indexPath = path.join(distDir, 'index.html');
let html = await readFile(indexPath, 'utf8');

const stylesheetTag = html.match(/<link[^>]+rel="stylesheet"[^>]*>/i)?.[0];
const stylesheetUrl = stylesheetTag?.match(/href="([^"]+)"/)?.[1];
if (!stylesheetTag || !stylesheetUrl) {
  throw new Error('Single-file build did not produce an inlineable stylesheet.');
}

const scriptTag = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/i)?.[0];
const scriptUrl = scriptTag?.match(/src="([^"]+)"/)?.[1];
if (!scriptTag || !scriptUrl) {
  throw new Error('Single-file build did not produce an inlineable module script.');
}

const fontPath = path.join(
  projectRoot,
  'public',
  'assets',
  'fonts',
  'AlibabaPuHuiTi-3-65-Medium.subset.woff2',
);
const fontDataUrl = toDataUrl('font/woff2', await readFile(fontPath));
let css = await readFile(resolveBuiltAsset(stylesheetUrl), 'utf8');
css = css.replace(
  /url\((['"]?)(?:\.\.\/|\/)assets\/fonts\/[^)'"]+\.ttf\1\)\s+format\((['"])truetype\2\)/g,
  `url("${fontDataUrl}") format("woff2")`,
);

const javascript = await readFile(resolveBuiltAsset(scriptUrl), 'utf8');
html = html.replace(stylesheetTag, () => `<style>${css}</style>`);
html = html.replace(scriptTag, '');
const safeJavascript = javascript.replace(/<\/script/gi, '<\\/script');
html = html.replace('</body>', () => `<script>${safeJavascript}</script>\n  </body>`);

const iconRoot = path.join(projectRoot, 'public', 'icons');
for (const iconPath of await listFiles(iconRoot)) {
  const publicPath = `/icons/${toPosix(path.relative(iconRoot, iconPath))}`;
  const iconDataUrl = toDataUrl('image/svg+xml', await readFile(iconPath));
  html = html.split(publicPath).join(iconDataUrl);
}

if (html.includes('/assets/fonts/') || /(["'(])\/icons\//.test(html)) {
  throw new Error('Single-file build still contains external font or icon references.');
}

await writeFile(outputPath, html, 'utf8');

const expectedDistDir = path.join(projectRoot, 'dist-single');
if (distDir !== expectedDistDir || path.basename(distDir) !== 'dist-single') {
  throw new Error(`Refusing to remove unexpected build directory: ${distDir}`);
}
await rm(distDir, { recursive: true, force: true });

console.log(`Single HTML written to ${outputPath} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
