import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

const uploadDir = process.env.UPLOAD_DIR || 'public/uploads';

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const allowedExts = /jpeg|jpg|png|gif|webp/;
  const extname = allowedExts.test(path.extname(file.originalname).toLowerCase());

  if (allowedMimes.includes(file.mimetype) && extname) {
    return cb(null, true);
  } else {
    cb(new Error('仅支持 JPG、PNG、GIF、WebP 格式的图片'));
  }
};

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880') // 5MB default
  },
  fileFilter: fileFilter
});

// 多图上传（导航指引图片，最多10张）
export const uploadMultiple = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880'),
    files: 10,
  },
  fileFilter: fileFilter
});
