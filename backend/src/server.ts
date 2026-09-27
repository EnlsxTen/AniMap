import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import eventRoutes from './routes/events';
import analyticsRoutes from './routes/analytics';
import settingsRoutes from './routes/settings';
import venueRoutes from './routes/venues';
import sessionRoutes from './routes/sessions';
import favoriteRoutes from './routes/favorites';
import pluginRoutes from './plugins/routes';
import { startAllPlugins } from './plugins';
import { startReminderJob } from './utils/reminderJob';
import { normalizeOriginalFilename } from './utils/imageVariants';

dotenv.config();

// 生产环境必须配置 JWT_SECRET，其他环境给出警告
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is not set');
    process.exit(1);
  } else {
    console.warn('WARNING: JWT_SECRET is not set, using insecure default. Do NOT use this in production.');
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

// 信任 Nginx 反向代理，使 req.ip 能获取真实客户端 IP
app.set('trust proxy', 1);

// 安全 HTTP 头（CSP 留给前端 dist 由 Nginx 设，避免影响接口/上传响应）
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // 允许前端跨 origin 拉 /uploads 图片
}));

// CORS configuration (FRONTEND_URL 支持逗号分隔多个域名)
const productionOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? productionOrigins
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 全局兜底限流：每 IP 每分钟 300 次（写接口由各路由单独再加严限流）
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});
app.use('/api', globalLimiter);

const uploadsRoot = path.join(__dirname, '../public/uploads');

// Static files：给 /uploads 加上 nosniff，防止伪装图片被当 HTML 解析
app.use('/uploads', express.static(uploadsRoot, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  },
}));

app.get('/uploads/:filename', (req: Request, res: Response, next: NextFunction) => {
  const requested = path.basename(req.params.filename);
  if (!/\.(thumb|preview|medium)\.webp$/i.test(requested)) return next();

  // 变体缺失时回退到原图；原图扩展名可能是 jpg/png 等（如爬虫入库的图），逐个尝试
  const normalized = normalizeOriginalFilename(requested);
  const stem = normalized.replace(/\.webp$/i, '');
  const candidates = ['.webp', '.jpg', '.jpeg', '.png', '.gif', '.avif']
    .map((ext) => path.join(uploadsRoot, stem + ext));
  const originalPath = candidates.find((p) => fs.existsSync(p));
  if (!originalPath) return next();
  res.sendFile(originalPath, {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cache-Control': 'public, max-age=3600',
    },
  }, (err) => {
    if (err) next();
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/plugins', pluginRoutes);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Dimensional Navigation API is running' });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件过大，请上传小于 5MB 的图片' });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error(err.stack);
  // 生产环境不回显内部错误信息，避免泄露栈/路径
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({ error: isProd ? '服务器内部错误' : (err.message || 'Something went wrong') });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  startReminderJob();
  startAllPlugins();
});

export default app;
