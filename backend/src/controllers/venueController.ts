import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../database/db';
import { sendAdminReviewRequest, sendReviewResult } from '../utils/emailService';
import { geocodeAddress } from '../utils/geocoding';
import { AuthRequest } from '../middleware/auth';
import { cleanupUploadedFiles } from '../middleware/upload';
import { removeImageSet } from '../utils/imageVariants';
import {
  PUBLIC_CACHE_KEYS,
  PUBLIC_CACHE_TTL_SECONDS,
  getCachedJson,
  invalidatePublicVenueRelatedCache,
  setCachedJson,
} from '../utils/cache';

const removeUploadedFile = (url: string | null | undefined) => {
  removeImageSet(url);
};

export const createVenueValidation = [
  body('name').trim().notEmpty().withMessage('请输入店铺名称'),
  body('address').trim().notEmpty().withMessage('请输入店铺地址'),
  body('phone').optional({ values: 'falsy' }).isLength({ max: 50 }).withMessage('电话号码过长'),
  body('business_hours').optional({ values: 'falsy' }).isLength({ max: 255 }).withMessage('营业时间描述过长'),
];

// ==========================================================================
// 创建店铺
// ==========================================================================
export const createVenue = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    cleanupUploadedFiles(req);
    return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() });
  }

  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: '请先登录' });

  const { name, address, phone, business_hours, description, nav_guide, latitude, longitude } = req.body;

  try {
    let lat = latitude !== undefined ? parseFloat(latitude) : NaN;
    let lng = longitude !== undefined ? parseFloat(longitude) : NaN;
    if (isNaN(lat) || isNaN(lng)) {
      const geo = await geocodeAddress(address);
      lat = geo.latitude;
      lng = geo.longitude;
    }

    const coverUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await pool.query(
      `INSERT INTO venues (user_id, name, cover_url, address, latitude, longitude, phone, business_hours, description, nav_guide, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending') RETURNING *`,
      [userId, name, coverUrl, address, lat, lng, phone || null, business_hours || null, description || null, nav_guide || null]
    );

    res.status(201).json({ message: '店铺已提交，等待管理员审核', venue: result.rows[0] });

    // 通知管理员有新店铺待审核
    invalidatePublicVenueRelatedCache();
    const userRes = await pool.query('SELECT username FROM users WHERE id=$1', [userId]);
    sendAdminReviewRequest({
      type: '店铺入驻', submitterName: userRes.rows[0]?.username || '', itemName: name,
      details: [
        { label: '地址', value: address },
        { label: '营业时间', value: business_hours || '' },
        { label: '电话', value: phone || '' },
      ],
    });
  } catch (error) {
    cleanupUploadedFiles(req);
    console.error('Create venue error:', error);
    if (error instanceof Error && error.message) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: '创建店铺失败，请联系网站管理员' });
  }
};

// ==========================================================================
// 公开店铺列表（已审核）
// ==========================================================================
export const getPublicVenues = async (req: Request, res: Response) => {
  try {
    const cached = await getCachedJson<{ venues: unknown[] }>(PUBLIC_CACHE_KEYS.venues);
    if (cached) {
      return res.json(cached);
    }

    const result = await pool.query(
      `SELECT v.*, u.username as owner_name FROM venues v
       JOIN users u ON v.user_id = u.id
       WHERE v.status = 'approved' ORDER BY v.created_at DESC`
    );
    const response = { venues: result.rows };
    await setCachedJson(PUBLIC_CACHE_KEYS.venues, response, PUBLIC_CACHE_TTL_SECONDS.venues);
    res.json(response);
  } catch (error) {
    console.error('Get public venues error:', error);
    res.status(500).json({ error: '获取店铺列表失败' });
  }
};

// ==========================================================================
// 获取店铺详情（含导航图片）
// 修复：非 owner/admin 只能查看 approved 状态的店铺
// ==========================================================================
export const getVenueById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT v.*, u.username as owner_name, u.email as owner_email
       FROM venues v JOIN users u ON v.user_id = u.id WHERE v.id = $1`,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: '店铺不存在' });

    const venue = result.rows[0];
    const isOwner = req.userId && req.userId === venue.user_id;
    const isAdmin = req.userRole === 'admin';

    // 非 owner 且非 admin：只能查看已审核的店铺
    if (!isOwner && !isAdmin && venue.status !== 'approved') {
      return res.status(404).json({ error: '店铺不存在' });
    }

    if (!isOwner && !isAdmin) delete venue.owner_email;

    const photosResult = await pool.query(
      `SELECT id, photo_url, caption, sort_order FROM venue_nav_photos
       WHERE venue_id = $1 ORDER BY sort_order ASC, id ASC`,
      [id]
    );
    venue.nav_photos = photosResult.rows;

    res.json({ venue });
  } catch (error) {
    console.error('Get venue error:', error);
    res.status(500).json({ error: '获取店铺详情失败' });
  }
};

// ==========================================================================
// 我的店铺（商户）
// ==========================================================================
export const getMerchantVenues = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM venues WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json({ venues: result.rows });
  } catch (error) {
    console.error('Get merchant venues error:', error);
    res.status(500).json({ error: '获取我的店铺失败' });
  }
};

// ==========================================================================
// 更新店铺
// 修复：管理员可编辑；加入 validationResult 检查
// ==========================================================================
export const updateVenue = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    cleanupUploadedFiles(req);
    return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() });
  }

  const { id } = req.params;
  const userId = req.userId;
  const userRole = req.userRole;
  const { name, address, phone, business_hours, description, nav_guide, latitude: reqLat, longitude: reqLng } = req.body;

  if (!userId) return res.status(401).json({ error: '请先登录' });

  try {
    const checkResult = await pool.query('SELECT * FROM venues WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) return res.status(404).json({ error: '店铺不存在' });

    const oldVenue = checkResult.rows[0];

    // 管理员可编辑任何店铺，其他角色只能编辑自己的
    if (userRole !== 'admin' && oldVenue.user_id !== userId) {
      return res.status(403).json({ error: '无权编辑该店铺' });
    }

    let latitude = oldVenue.latitude;
    let longitude = oldVenue.longitude;

    if (reqLat !== undefined && reqLng !== undefined) {
      const lat = parseFloat(reqLat);
      const lng = parseFloat(reqLng);
      if (!isNaN(lat) && !isNaN(lng)) { latitude = lat; longitude = lng; }
    } else if (address && address !== oldVenue.address) {
      const geo = await geocodeAddress(address);
      latitude = geo.latitude;
      longitude = geo.longitude;
    }

    const coverUrl = req.file ? `/uploads/${req.file.filename}` : oldVenue.cover_url;
    const result = await pool.query(
      `UPDATE venues SET name=$1, cover_url=$2, address=$3, latitude=$4, longitude=$5,
          phone=$6, business_hours=$7, description=$8, nav_guide=$9,
          status='pending', updated_at=CURRENT_TIMESTAMP
       WHERE id=$10 RETURNING *`,
      [name, coverUrl, address, latitude, longitude, phone || null, business_hours || null, description || null, nav_guide || null, id]
    );
    if (req.file && oldVenue.cover_url) removeUploadedFile(oldVenue.cover_url);
    invalidatePublicVenueRelatedCache();

    res.json({ message: '店铺已更新，等待重新审核', venue: result.rows[0] });
  } catch (error) {
    cleanupUploadedFiles(req);
    console.error('Update venue error:', error);
    if (error instanceof Error && error.message) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: '更新店铺失败' });
  }
};

// ==========================================================================
// 删除店铺
// 修复：先删文件再删数据库
// ==========================================================================
export const deleteVenue = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;
  const userRole = req.userRole;

  try {
    const checkResult = await pool.query('SELECT user_id, cover_url FROM venues WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) return res.status(404).json({ error: '店铺不存在' });

    if (userRole !== 'admin' && checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: '无权删除该店铺' });
    }

    // 先删文件，再删数据库记录
    const photos = await pool.query('SELECT photo_url FROM venue_nav_photos WHERE venue_id = $1', [id]);
    photos.rows.forEach((p: { photo_url: string }) => removeUploadedFile(p.photo_url));
    removeUploadedFile(checkResult.rows[0].cover_url);

    await pool.query('DELETE FROM venues WHERE id = $1', [id]);
    invalidatePublicVenueRelatedCache();

    res.json({ message: '店铺已删除' });
  } catch (error) {
    console.error('Delete venue error:', error);
    res.status(500).json({ error: '删除店铺失败' });
  }
};

// ==========================================================================
// 待审核店铺（管理员）
// ==========================================================================
export const getPendingVenues = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT v.*, u.username as owner_name, u.email as owner_email
       FROM venues v JOIN users u ON v.user_id = u.id
       WHERE v.status = 'pending' ORDER BY v.created_at ASC`
    );
    res.json({ venues: result.rows });
  } catch (error) {
    console.error('Get pending venues error:', error);
    res.status(500).json({ error: '获取待审核店铺失败' });
  }
};

// ==========================================================================
// 审核店铺（管理员）
// ==========================================================================
export const updateVenueStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  // 审核备注（可选）：通过/拒绝时由管理员填写，回传给提交者
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';

  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: '无效的状态值' });
  }

  try {
    const result = await pool.query(
      'UPDATE venues SET status=$1, review_note=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *',
      [status, note || null, id]
    );
    invalidatePublicVenueRelatedCache();
    if (result.rows.length === 0) return res.status(404).json({ error: '店铺不存在' });
    res.json({ message: '店铺状态已更新', venue: result.rows[0] });

    // 通知店铺提交者审核结果
    if (status === 'approved' || status === 'rejected') {
      const userRes = await pool.query(
        'SELECT u.email FROM users u JOIN venues v ON v.user_id = u.id WHERE v.id=$1', [id]
      );
      if (userRes.rows[0]) {
        sendReviewResult(userRes.rows[0].email, {
          type: '店铺', itemName: result.rows[0].name, approved: status === 'approved', note,
        });
      }
    }
  } catch (error) {
    console.error('Update venue status error:', error);
    res.status(500).json({ error: '更新店铺状态失败' });
  }
};

// ==========================================================================
// 上传导航图片（多张）
// 修复：使用事务 + SELECT FOR UPDATE 防止并发竞态
// ==========================================================================
export const uploadNavPhotos = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;
  const userRole = req.userRole;
  const captionsRaw = req.body.captions;

  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    return res.status(400).json({ error: '未上传任何图片' });
  }

  const files = req.files as Express.Multer.File[];
  const cleanupFiles = () => files.forEach(f => removeUploadedFile(`/uploads/${f.filename}`));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const venueResult = await client.query(
      'SELECT user_id FROM venues WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (venueResult.rows.length === 0) {
      await client.query('ROLLBACK');
      cleanupFiles();
      return res.status(404).json({ error: '店铺不存在' });
    }

    if (userRole !== 'admin' && venueResult.rows[0].user_id !== userId) {
      await client.query('ROLLBACK');
      cleanupFiles();
      return res.status(403).json({ error: '无权操作该店铺' });
    }

    const existing = await client.query(
      'SELECT COUNT(*) FROM venue_nav_photos WHERE venue_id = $1',
      [id]
    );
    const existingCount = parseInt(existing.rows[0].count, 10);

    if (existingCount + files.length > 10) {
      await client.query('ROLLBACK');
      cleanupFiles();
      return res.status(400).json({ error: `已有 ${existingCount} 张，本次上传将超过 10 张上限` });
    }

    let captions: string[] = [];
    if (typeof captionsRaw === 'string') {
      try { const p = JSON.parse(captionsRaw); if (Array.isArray(p)) captions = p; }
      catch { captions = [captionsRaw]; }
    } else if (Array.isArray(captionsRaw)) {
      captions = captionsRaw;
    }

    const maxOrder = await client.query(
      'SELECT COALESCE(MAX(sort_order), 0) AS max FROM venue_nav_photos WHERE venue_id = $1',
      [id]
    );
    let nextOrder = parseInt(maxOrder.rows[0].max, 10);

    const inserted = [];
    for (let i = 0; i < files.length; i++) {
      nextOrder += 1;
      const result = await client.query(
        `INSERT INTO venue_nav_photos (venue_id, photo_url, caption, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [id, `/uploads/${files[i].filename}`, captions[i] || null, nextOrder]
      );
      inserted.push(result.rows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({ message: `成功上传 ${inserted.length} 张图片`, photos: inserted });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Upload nav photos error:', error);
    cleanupFiles();
    res.status(500).json({ error: '上传导航图片失败' });
  } finally {
    client.release();
  }
};

// ==========================================================================
// 删除导航图片
// ==========================================================================
export const deleteNavPhoto = async (req: AuthRequest, res: Response) => {
  const { id, photoId } = req.params;
  const userId = req.userId;
  const userRole = req.userRole;

  try {
    const venueResult = await pool.query('SELECT user_id FROM venues WHERE id = $1', [id]);
    if (venueResult.rows.length === 0) return res.status(404).json({ error: '店铺不存在' });

    if (userRole !== 'admin' && venueResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: '无权操作该店铺' });
    }

    const photoResult = await pool.query(
      'SELECT photo_url FROM venue_nav_photos WHERE id = $1 AND venue_id = $2',
      [photoId, id]
    );
    if (photoResult.rows.length === 0) return res.status(404).json({ error: '图片不存在' });

    await pool.query('DELETE FROM venue_nav_photos WHERE id = $1', [photoId]);
    removeUploadedFile(photoResult.rows[0].photo_url);

    res.json({ message: '图片已删除' });
  } catch (error) {
    console.error('Delete nav photo error:', error);
    res.status(500).json({ error: '删除图片失败' });
  }
};
