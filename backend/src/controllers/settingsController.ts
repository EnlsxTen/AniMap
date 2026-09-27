import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import pool from '../database/db';
import { AuthRequest } from '../middleware/auth';
import { cleanupUploadedFiles } from '../middleware/upload';
import { removeImageSet } from '../utils/imageVariants';
import { getPublicCacheStats } from '../utils/cache';

const fsp = fs.promises;

const removefile = (filePath: string | null | undefined) => {
  removeImageSet(filePath);
};

// 主页右下角发布悬浮按钮各入口的显示开关
const HOME_FAB_SETTING_KEYS = {
  event: 'home_fab_event_enabled',
  venue: 'home_fab_venue_enabled',
  session: 'home_fab_session_enabled',
  dance: 'home_fab_dance_enabled',
} as const;

type HomeFabKey = keyof typeof HOME_FAB_SETTING_KEYS;

const readSettings = async (keys: string[]) => {
  const result = await pool.query('SELECT key, value FROM settings WHERE key = ANY($1::text[])', [keys]);
  return result.rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
};

const upsertSetting = async (key: string, value: string) => {
  await pool.query(
    'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
    [key, value]
  );
};

export const getAuthBg = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'auth_bg_url'");
    const url = result.rows.length > 0 ? result.rows[0].value : null;
    res.json({ url });
  } catch (error) {
    console.error('Get auth bg error:', error);
    res.status(500).json({ error: '获取背景图失败' });
  }
};

export const updateAuthBg = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传图片文件' });
  }

  const newUrl = `/uploads/${req.file.filename}`;

  try {
    const oldResult = await pool.query("SELECT value FROM settings WHERE key = 'auth_bg_url'");
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('auth_bg_url', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [newUrl]
    );

    res.json({ message: '背景图更新成功', url: newUrl });
    if (oldResult.rows.length > 0 && oldResult.rows[0].value) {
      removefile(oldResult.rows[0].value);
    }
  } catch (error) {
    cleanupUploadedFiles(req);
    console.error('Update auth bg error:', error);
    res.status(500).json({ error: '更新背景图失败' });
  }
};

export const deleteAuthBg = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'auth_bg_url'");
    if (result.rows.length > 0 && result.rows[0].value) {
      removefile(result.rows[0].value);
    }

    await pool.query("DELETE FROM settings WHERE key = 'auth_bg_url'");
    res.json({ message: '背景图已删除' });
  } catch (error) {
    console.error('Delete auth bg error:', error);
    res.status(500).json({ error: '删除背景图失败' });
  }
};

export const getCacheStats = async (_req: AuthRequest, res: Response) => {
  try {
    const stats = await getPublicCacheStats();
    res.json(stats);
  } catch (error) {
    console.error('Get cache stats error:', error);
    res.status(500).json({ error: '获取缓存状态失败' });
  }
};

// 主页发布按钮开关：公开读接口（首页用，无需登录）。默认全部开启，未配置即视为 true。
export const getHomeFabSettings = async (_req: AuthRequest, res: Response) => {
  try {
    const values = await readSettings(Object.values(HOME_FAB_SETTING_KEYS));
    const resolve = (key: HomeFabKey) => values[HOME_FAB_SETTING_KEYS[key]] !== 'false';
    res.json({
      event: resolve('event'),
      venue: resolve('venue'),
      session: resolve('session'),
      dance: resolve('dance'),
    });
  } catch (error) {
    console.error('Get home fab settings error:', error);
    // 读取失败时回退为全部开启，避免首页发布入口因后端异常而消失
    res.json({ event: true, venue: true, session: true, dance: true });
  }
};

// 主页发布按钮开关：管理员写接口
export const updateHomeFabSettings = async (req: AuthRequest, res: Response) => {
  try {
    const keys: HomeFabKey[] = ['event', 'venue', 'session', 'dance'];
    await Promise.all(
      keys.map((key) => {
        const enabled = req.body?.[key] === true;
        return upsertSetting(HOME_FAB_SETTING_KEYS[key], enabled ? 'true' : 'false');
      })
    );

    const values = await readSettings(Object.values(HOME_FAB_SETTING_KEYS));
    const resolve = (key: HomeFabKey) => values[HOME_FAB_SETTING_KEYS[key]] !== 'false';
    res.json({
      message: '主页发布按钮设置已更新',
      event: resolve('event'),
      venue: resolve('venue'),
      session: resolve('session'),
      dance: resolve('dance'),
    });
  } catch (error) {
    console.error('Update home fab settings error:', error);
    res.status(500).json({ error: '更新主页发布按钮设置失败' });
  }
};

// 缩略图巡检与修复
const UPLOADS_DIR = path.resolve(process.env.UPLOAD_DIR || 'public/uploads');

const variantSizes = {
  original: { max: 1920, quality: 82 },
  medium:   { max: 720,  quality: 78 },
  preview:  { max: 540,  quality: 82 },
  thumb:    { max: 180,  quality: 72 },
};

const getVariantName = (base: string, variant: string) =>
  variant === 'original' ? `${base}.webp` : `${base}.${variant}.webp`;

export const checkMissingThumbnails = async (_req: AuthRequest, res: Response) => {
  try {
    const files = await fsp.readdir(UPLOADS_DIR);
    const originals = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    const missing: string[] = [];

    for (const file of originals) {
      const ext = path.extname(file);
      const base = file.slice(0, -ext.length);
      const previewPath = path.join(UPLOADS_DIR, getVariantName(base, 'preview'));
      try { await fsp.access(previewPath); } catch { missing.push(file); }
    }

    res.json({ total: originals.length, missing: missing.length, files: missing });
  } catch (error) {
    console.error('checkMissingThumbnails error:', error);
    res.status(500).json({ error: '检查失败' });
  }
};

export const regenerateMissingThumbnails = async (_req: AuthRequest, res: Response) => {
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const files = await fsp.readdir(UPLOADS_DIR);
    const originals = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));

    for (const file of originals) {
      const ext = path.extname(file);
      const base = file.slice(0, -ext.length);
      const previewPath = path.join(UPLOADS_DIR, getVariantName(base, 'preview'));

      try { await fsp.access(previewPath); skipped++; continue; } catch { /* missing */ }

      const srcPath = path.join(UPLOADS_DIR, file);
      try {
        for (const [variant, config] of Object.entries(variantSizes)) {
          const outPath = path.join(UPLOADS_DIR, getVariantName(base, variant));
          await sharp(srcPath)
            .rotate()
            .resize({ width: config.max, height: config.max, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: config.quality, effort: 4 })
            .toFile(outPath);
        }
        processed++;
      } catch (err) {
        console.error(`regenerate thumbnail failed: ${file}`, err);
        errors++;
      }
    }

    res.json({ processed, skipped, errors, total: originals.length });
  } catch (error) {
    console.error('regenerateMissingThumbnails error:', error);
    res.status(500).json({ error: '修复失败' });
  }
};
