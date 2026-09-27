import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { UPLOAD_DIR, getImageVariantFilename, imageVariantSizes, ImageVariant } from './imageVariants';
import { uploadBufferToR2, getR2Key, existsInR2 } from './r2Client';

const VARIANTS: ImageVariant[] = ['original', 'medium', 'preview', 'thumb'];
// 只处理原图（排除已经是变体的文件）
const SOURCE_PATTERN = /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?)$/i;
const VARIANT_PATTERN = /\.(thumb|preview|medium)\.webp$/i;

export interface ReconcileResult {
  scanned: number;
  uploaded: number;   // 实际生成并上传的变体数
  reconciled: number; // 补全的原图数（至少有一个变体缺失）
  skipped: number;    // R2 已齐全跳过的原图数
  failed: number;
  details: { file: string; status: 'reconciled' | 'skipped' | 'failed'; error?: string }[];
}

/**
 * 把单个本地原图转换成 4 个 webp 变体并直传 R2。
 * 已存在的变体默认跳过（force=true 时强制覆盖）。
 * 返回本次实际上传的变体数；0 表示该图在 R2 上已齐全。
 */
export async function reconcileOneFile(
  sourcePath: string,
  options: { force?: boolean } = {}
): Promise<number> {
  const filename = path.basename(sourcePath);
  let uploadedCount = 0;

  await Promise.all(VARIANTS.map(async (variant) => {
    const variantName = getImageVariantFilename(filename, variant);
    const key = getR2Key(variantName);

    if (!options.force) {
      const already = await existsInR2(key);
      if (already) return;
    }

    const config = imageVariantSizes[variant];
    const buffer = await sharp(sourcePath)
      .rotate()
      .resize({ width: config.max, height: config.max, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: config.quality, effort: 4 })
      .toBuffer();

    await uploadBufferToR2(key, buffer, 'image/webp');
    uploadedCount += 1;
  }));

  return uploadedCount;
}

/**
 * 扫描本地 UPLOAD_DIR 下所有原图，对在 R2 上缺变体的图片补全。
 * 用于：① 一次性回填历史孤儿 ② B 站同步后自动对账。
 */
export async function reconcileUploadsToR2(
  options: { force?: boolean; verbose?: boolean } = {}
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    scanned: 0, uploaded: 0, reconciled: 0, skipped: 0, failed: 0, details: [],
  };

  const uploadRoot = path.resolve(UPLOAD_DIR);
  if (!fs.existsSync(uploadRoot)) {
    if (options.verbose) console.log(`[reconcileR2] upload dir 不存在: ${uploadRoot}`);
    return result;
  }

  const files = fs.readdirSync(uploadRoot, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => SOURCE_PATTERN.test(name) && !VARIANT_PATTERN.test(name));

  result.scanned = files.length;

  for (const filename of files) {
    const sourcePath = path.join(uploadRoot, filename);
    try {
      const count = await reconcileOneFile(sourcePath, { force: options.force });
      if (count > 0) {
        result.reconciled += 1;
        result.uploaded += count;
        result.details.push({ file: filename, status: 'reconciled' });
        if (options.verbose) console.log(`[reconcileR2] 补全 ${filename}（${count} 个变体）`);
      } else {
        result.skipped += 1;
      }
    } catch (err: any) {
      result.failed += 1;
      result.details.push({ file: filename, status: 'failed', error: err?.message || String(err) });
      console.warn(`[reconcileR2] 失败 ${filename}:`, err?.message || err);
    }
  }

  if (options.verbose) {
    console.log(`[reconcileR2] 完成: 扫描${result.scanned} 补全${result.reconciled} 上传变体${result.uploaded} 跳过${result.skipped} 失败${result.failed}`);
  }
  return result;
}
