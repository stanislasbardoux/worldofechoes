/* eslint-disable no-console */
/**
 * shrink-maps.mjs
 *
 * Reads any image in `maps-source/`, downsamples to a sane maximum
 * dimension, and writes a WebP into `src/assets/maps/`. The original
 * sources stay outside of `src/` so they are never bundled.
 *
 * Run with:  npm run shrink-maps
 *
 * Tweak MAX_DIM and QUALITY below if you want sharper / smaller output.
 */

import sharp from 'sharp';
import { readdir, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'maps-source');
const DST_DIR = join(ROOT, 'src', 'assets', 'maps');

const MAX_DIM = 6000;   // long edge in pixels
const QUALITY = 86;     // WebP quality (0–100); 86 is visually transparent

function fmt(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' kB';
  return bytes + ' B';
}

async function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(`No source folder at ${SRC_DIR}.`);
    console.error('Put the original PNG/JPG maps in `maps-source/` and re-run.');
    process.exit(1);
  }
  await mkdir(DST_DIR, { recursive: true });

  const all = await readdir(SRC_DIR);
  const inputs = all.filter((f) => /\.(png|jpe?g|webp|tiff?)$/i.test(f));

  if (!inputs.length) {
    console.error(`No image files found in ${SRC_DIR}.`);
    process.exit(1);
  }

  console.log(
    `Shrinking ${inputs.length} image(s): max ${MAX_DIM}px, quality ${QUALITY}.\n`,
  );

  let totalIn = 0;
  let totalOut = 0;

  for (const file of inputs) {
    const srcPath = join(SRC_DIR, file);
    const { name } = parse(file);
    const dstPath = join(DST_DIR, `${name}.webp`);

    const inSize = (await stat(srcPath)).size;
    const meta = await sharp(srcPath).metadata();

    await sharp(srcPath, { limitInputPixels: false })
      .resize(MAX_DIM, MAX_DIM, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: QUALITY, effort: 5 })
      .toFile(dstPath);

    const outSize = (await stat(dstPath)).size;
    totalIn += inSize;
    totalOut += outSize;

    const ratio = inSize / outSize;
    const newMeta = await sharp(dstPath).metadata();

    console.log(
      `  ${file}\n` +
        `    ${meta.width}\u00d7${meta.height} ${fmt(inSize)}` +
        ` \u2192 ${newMeta.width}\u00d7${newMeta.height} ${fmt(outSize)}` +
        ` (${ratio.toFixed(1)}\u00d7 smaller)`,
    );
  }

  const totalRatio = totalIn / totalOut;
  console.log(
    `\nTotal: ${fmt(totalIn)} \u2192 ${fmt(totalOut)} (${totalRatio.toFixed(1)}\u00d7 smaller).`,
  );
  console.log(`Output: ${DST_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
