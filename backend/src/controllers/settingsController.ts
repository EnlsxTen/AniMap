import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import pool from '../database/db';
import { AuthRequest } from '../middleware/auth';

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'public/uploads';

const removefile = (filePath: string | null | undefined) => {
  if (!filePath) return;
  try {
    const filename = path.basename(filePath);
    const fullPath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.warn('Failed to remove file:', err);
  }
};

// GET /api/settings/auth-bg — 公开接口，获取登录背景图
export const getAuthBg = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT value FROM settings WHERE key = 'auth_bg_url'"
    );
    const url = result.rows.length > 0 ? result.rows[0].value : null;
    res.json({ url });
  } catch (error) {
    console.error('Get auth bg error:', error);
    res.status(500).json({ error: '获取背景图失败' });
  }
};

// PUT /api/settings/auth-bg — 管理员上传背景图
export const updateAuthBg = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传图片文件' });
  }

  const newUrl = `/uploads/${req.file.filename}`;

  try {
    // 删除旧背景图文件
    const oldResult = await pool.query(
      "SELECT value FROM settings WHERE key = 'auth_bg_url'"
    );
    if (oldResult.rows.length > 0 && oldResult.rows[0].value) {
      removefile(oldResult.rows[0].value);
    }

    // upsert
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('auth_bg_url', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [newUrl]
    );

    res.json({ message: '背景图更新成功', url: newUrl });
  } catch (error) {
    console.error('Update auth bg error:', error);
    res.status(500).json({ error: '更新背景图失败' });
  }
};

// DELETE /api/settings/auth-bg — 管理员删除背景图
export const deleteAuthBg = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT value FROM settings WHERE key = 'auth_bg_url'"
    );
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
