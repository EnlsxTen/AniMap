import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { Request, Response, NextFunction } from 'express';

const uploadDir = process.env.UPLOAD_DIR || 'public/uploads';

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 先存到临时目录，经 sharp 验证转换后再移到正式目录
const tempDir = path.join(uploadDir, '../uploads_temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const random = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${random}${ext}`);
  }
});

// 放宽前置过滤：接受常见图片格式（包括 HEIC），实际验证交给 sharp
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff', '.tif', '.avif']);
const ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif', 'image/bmp', 'image/tiff',
  'image/avif', 'application/octet-stream', // 某些浏览器对 HEIC 报 octet-stream
]);

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTS.has(ext) && !ALLOWED_MIMES.has(file.mimetype)) {
    return cb(new Error('不支持的图片格式，请上传 JPG、PNG、GIF、WebP 或 HEIC 格式'));
  }
  cb(null, true);
};

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') // 10MB（转换前允许更大）
  },
  fileFilter: fileFilter
});

// 多图上传（导航指引图片，最多10张）
export const uploadMultiple = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
    files: 10,
  },
  fileFilter: fileFilter
});

/**
 * 中间件：将上传的图片用 sharp 转换为 WebP，确保浏览器一定能渲染。
 * 同时自动修正 EXIF 旋转、去除元数据。
 */
export async function processImage(filePath: string): Promise<string> {
  const random = crypto.randomBytes(16).toString('hex');
  const outputName = `${Date.now()}-${random}.webp`;
  const outputPath = path.join(uploadDir, outputName);

  await sharp(filePath)
    .rotate() // 自动根据 EXIF 旋转
    .webp({ quality: 82 })
    .toFile(outputPath);

  // 删除临时文件
  fs.unlink(filePath, () => {});

  return outputName;
}

/**
 * Express 中间件：处理单文件上传后的图片转换
 */
export function processUploadedFile(fieldName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const file = req.file;
    if (!file) return next();

    try {
      const outputName = await processImage(file.path);
      // 更新 req.file 信息，让后续 controller 拿到正确路径
      req.file!.filename = outputName;
      req.file!.path = path.join(uploadDir, outputName);
      next();
    } catch (err) {
      // 清理临时文件
      fs.unlink(file.path, () => {});
      res.status(400).json({ error: '图片处理失败，请确认文件是有效的图片' });
    }
  };
}

/**
 * Express 中间件：处理多文件上传后的图片转换
 */
export function processUploadedFiles(fieldName: string) {
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
      // 清理所有临时文件
      for (const file of files) {
        fs.unlink(file.path, () => {});
      }
      res.status(400).json({ error: '图片处理失败，请确认所有文件都是有效的图片' });
    }
  };
}
