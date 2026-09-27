import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { UPLOAD_DIR, getImageVariantFilename, imageVariantSizes } from '../utils/imageVariants';

const variantPattern = /\.(thumb|preview|medium)\.webp$/i;
const supportedPattern = /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?)$/i;

async function generateVariant(sourcePath: string, outputPath: string, max: number, quality: number) {
  await sharp(sourcePath)
    .rotate()
    .resize({
      width: max,
      height: max,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
    .toFile(outputPath);
}

async function main() {
  const uploadRoot = path.resolve(UPLOAD_DIR);
  if (!fs.existsSync(uploadRoot)) {
    console.log(`Upload directory does not exist: ${uploadRoot}`);
    return;
  }

  const files = fs.readdirSync(uploadRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => supportedPattern.test(name) && !variantPattern.test(name));

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const force = process.env.FORCE_IMAGE_VARIANTS === '1';

  for (const filename of files) {
    const sourcePath = path.join(uploadRoot, filename);

    for (const variant of ['medium', 'preview', 'thumb'] as const) {
      const outputName = getImageVariantFilename(filename, variant);
      const outputPath = path.join(uploadRoot, outputName);
      if (fs.existsSync(outputPath) && !force) {
        skipped += 1;
        continue;
      }

      try {
        const config = imageVariantSizes[variant];
        await generateVariant(sourcePath, outputPath, config.max, config.quality);
        generated += 1;
      } catch (err) {
        failed += 1;
        console.warn(`Failed to generate ${variant} for ${filename}:`, err);
      }
    }
  }

  console.log(JSON.stringify({ scanned: files.length, generated, skipped, failed }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
