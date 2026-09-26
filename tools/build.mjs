// Concatenates src/*.js (in filename order) into one inline module and
// writes three variants of the page:
//   index.html            standalone page (three.js from jsDelivr)
//   dist/artifact.html    body-only fragment for the claude.ai artifact host
//   dist/test.html        standalone page that loads three.js from a local path
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE_VER = '0.170.0';
const cdn = `https://cdn.jsdelivr.net/npm/three@${THREE_VER}`;

const srcDir = join(root, 'src');
const materialFiles = {
  stone: 'aged-limestone-paving-albedo.jpg',
  plaster: 'warm-lime-plaster-albedo.jpg',
  wood: 'aged-oak-planks-albedo.jpg',
};
const files = readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
const code = files
  .map((f) => `// ---- ${f} ----\n` + readFileSync(join(srcDir, f), 'utf8'))
  .join('\n');

const tpl = readFileSync(join(root, 'src', 'template.html'), 'utf8');
const [head, body] = tpl.split('<!--BODY-->');

function importMap(base) {
  return `<script type="importmap">${JSON.stringify({
    imports: { three: `${base}/build/three.module.js`, 'three/addons/': `${base}/examples/jsm/` },
  })}</script>`;
}

function page(base, full) {
  const assets = Object.fromEntries(Object.entries(materialFiles).map(([key, filename]) => [key,
    (!full || base === cdn) ? `data:image/jpeg;base64,${readFileSync(join(root, 'assets', 'materials', filename)).toString('base64')}` :
      `${base === cdn ? './' : '../'}assets/materials/${filename}`]));
  const pageCode = code.replace('/*MATERIAL_ASSETS*/ {}', JSON.stringify(assets));
  const inner = `${head.trim()}\n${body.trim()}\n${importMap(base)}\n<script type="module">\n${pageCode}\n</script>\n`;
  if (!full) return inner;
  return `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head.trim()}\n</head>\n<body>\n${body.trim()}\n${importMap(base)}\n<script type="module">\n${pageCode}\n</script>\n</body>\n</html>\n`;
}

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'index.html'), page(cdn, true));
writeFileSync(join(root, 'dist', 'artifact.html'), page(cdn, false));
const local = process.env.THREE_LOCAL || './three';
writeFileSync(join(root, 'dist', 'test.html'), page(local, true));
console.log(`built ${files.length} modules, ${code.length} chars`);
