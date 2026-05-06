import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import authRoutes from './routes/auth';
import eventRoutes from './routes/events';
import settingsRoutes from './routes/settings';
import venueRoutes from './routes/venues';
import sessionRoutes from './routes/sessions';
import favoriteRoutes from './routes/favorites';
import { startReminderJob } from './utils/reminderJob';

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/favorites', favoriteRoutes);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Dimensional Navigation API is running' });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件过大，请上传小于 5MB 的图片' });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  startReminderJob();
});

export default app;
