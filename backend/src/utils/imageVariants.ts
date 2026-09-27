import fs from 'fs';
import path from 'path';

export type ImageVariant = 'original' | 'medium' | 'preview' | 'thumb';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || 'public/uploads';

export const imageVariantSizes: Record<ImageVariant, { max: number; quality: number }> = {
  original: { max: 1920, quality: 82 },
  medium: { max: 720, quality: 78 },
  preview: { max: 540, quality: 82 },
  thumb: { max: 180, quality: 72 },
};

const variantPattern = /\.(thumb|preview|medium)\.webp$/i;

export const normalizeOriginalFilename = (filename: string): string => {
  const safeName = path.basename(filename);
  return safeName.replace(variantPattern, '.webp');
};

export const getImageVariantFilename = (filename: string, variant: ImageVariant): string => {
  const originalName = normalizeOriginalFilename(filename);
  if (variant === 'original') return originalName;

  const ext = path.extname(originalName);
  const stem = ext ? originalName.slice(0, -ext.length) : originalName;
  return `${stem}.${variant}.webp`;
};

export const getImageSetFilenames = (filename: string): string[] => {
  const originalName = normalizeOriginalFilename(filename);
  return [
    getImageVariantFilename(originalName, 'original'),
    getImageVariantFilename(originalName, 'medium'),
    getImageVariantFilename(originalName, 'preview'),
    getImageVariantFilename(originalName, 'thumb'),
  ];
};

export const resolveUploadPath = (filename: string): string => {
  return path.resolve(UPLOAD_DIR, path.basename(filename));
};

export const removeImageSet = (url: string | null | undefined) => {
  if (!url?.startsWith('/uploads/')) return;

  for (const filename of getImageSetFilenames(path.basename(url))) {
    const filePath = resolveUploadPath(filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn('Failed to remove uploaded image:', err);
    }
  }
};
