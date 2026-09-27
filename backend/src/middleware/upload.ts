import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { Request, Response, NextFunction } from 'express';
import { UPLOAD_DIR, getImageVariantFilename, imageVariantSizes, removeImageSet } from '../utils/imageVariants';
import { uploadBufferToR2, getR2Key } from '../utils/r2Client';

const uploadDir = UPLOAD_DIR;

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const tempDir = path.join(uploadDir, '../uploads_temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const random = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${random}${ext}`);
  },
});

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff', '.tif', '.avif']);
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff',
  'image/avif',
  'application/octet-stream',
]);

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTS.has(ext) && !ALLOWED_MIMES.has(file.mimetype)) {
    return cb(new Error('不支持的图片格式，请上传 JPG、PNG、GIF、WebP 或 HEIC 格式'));
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
  },
  fileFilter,
});

export const uploadMultiple = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
    files: 10,
  },
  fileFilter,
});

const cleanupOneFile = (file?: Express.Multer.File) => {
  if (!file) return;
  if (file.filename) {
    removeImageSet(`/uploads/${file.filename}`);
  }
  if (file.path) {
    fs.unlink(file.path, () => {});
  }
};

export const cleanupUploadedFiles = (req: Request) => {
  cleanupOneFile(req.file);

  const files = req.files;
  if (Array.isArray(files)) {
    files.forEach(cleanupOneFile);
    return;
  }

  if (files && typeof files === 'object') {
    Object.values(files).flat().forEach(cleanupOneFile);
  }
};

export async function processImage(filePath: string): Promise<string> {
  const random = crypto.randomBytes(16).toString('hex');
  const outputName = `${Date.now()}-${random}.webp`;

  try {
    const variants = ['original', 'medium', 'preview', 'thumb'] as const;

    // 并发生成所有变体 → buffer → 直传 R2
    await Promise.all(variants.map(async (variant) => {
      const config = imageVariantSizes[variant];
      const filename = getImageVariantFilename(outputName, variant);
      const buffer = await sharp(filePath)
        .rotate()
        .resize({ width: config.max, height: config.max, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: config.quality, effort: 4 })
        .toBuffer();

      await uploadBufferToR2(getR2Key(filename), buffer, 'image/webp');
    }));
  } catch (error) {
    throw error;
  } finally {
    fs.unlink(filePath, () => {});
  }

  return outputName;
}

export function processUploadedFile(_fieldName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const file = req.file;
    if (!file) return next();

    try {
      const outputName = await processImage(file.path);
      req.file!.filename = outputName;
      req.file!.path = path.join(uploadDir, outputName);
      next();
    } catch (err) {
      fs.unlink(file.path, () => {});
      res.status(400).json({ error: '图片处理失败，请确认文件是有效的图片' });
    }
  };
}

export function processUploadedFiles(_fieldName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) return next();

    try {
      for (const file of files) {
        const outputName = await processImage(file.path);
        file.filename = outputName;
        file.path = path.join(uploadDir, outputName);
      }
      next();
    } catch (err) {
      for (const file of files) {
        fs.unlink(file.path, () => {});
      }
      res.status(400).json({ error: '图片处理失败，请确认所有文件都是有效的图片' });
    }
  };
}
