import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter: nodemailer.Transporter | null = null;

const getTransporter = (): nodemailer.Transporter => {
  if (!transporter) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error('邮件服务未配置：请在 .env 中设置 SMTP_USER 和 SMTP_PASS');
    }
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.qq.com',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
};

// HTML 转义：邮件内容里所有用户可控字段都必须经过它，防止 HTML 注入（例如攻击者把用户名注册为钓鱼链接）
const escapeHtml = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// 校验 URL 是否为 http/https，拒绝 javascript:/data: 等危险协议
const safeUrl = (url: string): string => {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '#';
  } catch {
    return '#';
  }
};

// 统一邮件外壳（Vibrant Block 风格，与站点配色一致）
const emailShell = (title: string, body: string) => `
<div style="max-width:520px;margin:0 auto;font-family:'PingFang SC','Microsoft YaHei',sans-serif;background:#ECFDF5;padding:24px;">
  <div style="background:#fff;border:3px solid #064E3B;border-radius:16px;overflow:hidden;box-shadow:6px 6px 0 #064E3B;">
    <!-- 头部 -->
    <div style="background:#059669;padding:20px 24px;position:relative;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:800;letter-spacing:1px;">AniMap</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${escapeHtml(title)}</p>
    </div>
    <!-- 内容 -->
    <div style="padding:24px;">
      ${body}
    </div>
    <!-- 底部 -->
    <div style="background:#ECFDF5;border-top:2px solid #064E3B;padding:14px 24px;text-align:center;">
      <p style="margin:0;color:#064E3B;font-size:12px;opacity:0.7;">此邮件由AniMap系统自动发送，请勿直接回复</p>
    </div>
  </div>
</div>`;

const infoRow = (label: string, value: string) =>
  `<div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start;">
    <span style="flex-shrink:0;background:#F97316;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;border:2px solid #064E3B;">${escapeHtml(label)}</span>
    <span style="color:#064E3B;font-size:14px;line-height:1.5;">${escapeHtml(value)}</span>
  </div>`;

const actionBtn = (text: string, url: string) =>
  `<div style="text-align:center;margin-top:20px;">
    <a href="${escapeHtml(safeUrl(url))}" style="display:inline-block;background:#F97316;color:#fff;font-weight:700;font-size:15px;padding:12px 32px;border-radius:12px;border:3px solid #064E3B;text-decoration:none;box-shadow:4px 4px 0 #064E3B;">${escapeHtml(text)}</a>
  </div>`;

const send = async (to: string, subject: string, html: string, options: { throwOnError?: boolean } = {}) => {
  // 防邮件头注入：subject 里的换行会被解释为新 header
  const safeSubject = subject.replace(/[\r\n]+/g, ' ');
  try {
    await getTransporter().sendMail({
      from: `"AniMap" <${process.env.SMTP_USER}>`,
      to, subject: safeSubject, html,
    });
    return true;
  } catch (err) {
    console.error(`[email] 发送失败 to=${to}:`, err);
    if (options.throwOnError) throw err;
    return false;
  }
};

// ==========================================================================
// 验证码（保留原有功能，更新为新风格）
// ==========================================================================
export const sendVerificationCode = async (to: string, code: string): Promise<void> => {
  const body = `
    <p style="color:#064E3B;font-size:15px;margin:0 0 16px;">你好，你的验证码是：</p>
    <div style="text-align:center;margin:20px 0;">
      <span style="display:inline-block;padding:14px 36px;font-size:32px;font-weight:900;letter-spacing:8px;color:#F97316;background:#ECFDF5;border-radius:12px;border:3px solid #064E3B;box-shadow:4px 4px 0 #064E3B;">${escapeHtml(code)}</span>
    </div>
    <p style="color:#064E3B;font-size:13px;opacity:0.7;margin:16px 0 0;">验证码 5 分钟内有效，请勿泄露给他人。</p>`;
  await send(to, '【AniMap】你的邮箱验证码', emailShell('邮箱验证', body), { throwOnError: true });
};

// ==========================================================================
// 组局满员通知 → 发布者
// ==========================================================================
// fire-and-forget：不 await，失败只记录日志，不阻塞主流程
export const sendSessionFull = (to: string, info: {
  gameName: string; startTime: string; address: string; totalSeats: number;
}) => {
  const body = `
    <p style="color:#064E3B;font-size:15px;font-weight:700;margin:0 0 16px;">🎉 恭喜！你发布的组局已满员</p>
    ${infoRow('游戏', info.gameName)}
    ${infoRow('时间', info.startTime)}
    ${infoRow('地点', info.address)}
    ${infoRow('人数', `${info.totalSeats} 人已全部到位`)}
    <p style="color:#064E3B;font-size:13px;margin:16px 0 0;opacity:0.8;">请提前准备好游戏材料，期待一场精彩的对局！</p>`;
  send(to, '【AniMap】你的组局已满员 🎉', emailShell('组局满员通知', body));
};

// ==========================================================================
// 有人报名通知 → 发布者
// ==========================================================================
export const sendSessionNewRegistration = (to: string, info: {
  gameName: string; startTime: string; registrantName: string; bookedSeats: number; totalSeats: number;
}) => {
  const body = `
    <p style="color:#064E3B;font-size:15px;font-weight:700;margin:0 0 16px;">有新玩家加入了你的组局</p>
    ${infoRow('游戏', info.gameName)}
    ${infoRow('时间', info.startTime)}
    ${infoRow('新玩家', info.registrantName)}
    ${infoRow('当前人数', `${info.bookedSeats} / ${info.totalSeats}`)}`;
  send(to, '【AniMap】有新玩家加入你的组局', emailShell('组局报名通知', body));
};

// ==========================================================================
// 报名成功确认 → 报名用户
// ==========================================================================
export const sendRegistrationConfirm = (to: string, info: {
  gameName: string; startTime: string; endTime: string; address: string; venueName?: string;
}) => {
  const body = `
    <p style="color:#064E3B;font-size:15px;font-weight:700;margin:0 0 16px;">报名成功，记得准时到场！</p>
    ${infoRow('游戏', info.gameName)}
    ${infoRow('时间', `${info.startTime} - ${info.endTime}`)}
    ${infoRow('地点', info.address)}
    ${info.venueName ? infoRow('店铺', info.venueName) : ''}
    <p style="color:#064E3B;font-size:13px;margin:16px 0 0;opacity:0.8;">如需取消报名，请登录AniMap在"活动中心"操作。</p>`;
  send(to, '【AniMap】报名成功，记得准时到场！', emailShell('报名确认', body));
};

// ==========================================================================
// 收藏提醒 → 收藏用户
// ==========================================================================
export const sendFavoriteReminder = (to: string, info: {
  type: '展会' | '组局'; name: string; startTime: string; address: string; hoursLeft: number;
}) => {
  const body = `
    <p style="color:#064E3B;font-size:15px;font-weight:700;margin:0 0 16px;">你收藏的${escapeHtml(info.type)}还有 ${info.hoursLeft} 小时就要开始了！</p>
    ${infoRow(info.type, info.name)}
    ${infoRow('时间', info.startTime)}
    ${infoRow('地点', info.address)}
    <p style="color:#064E3B;font-size:13px;margin:16px 0 0;opacity:0.8;">记得提前安排好行程，不要错过！</p>`;
  send(to, `【AniMap】你收藏的${info.type}还有 ${info.hoursLeft} 小时开始`, emailShell('收藏提醒', body));
};
// ==========================================================================
export const sendAdminReviewRequest = async (info: {
  type: '商户注册' | '活动发布' | '店铺入驻'; submitterName: string; itemName: string;
  // 可选：提交内容的关键字段，让管理员在邮件里就能看到具体内容（label/value 已由调用方组织）
  details?: { label: string; value: string }[];
}) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;
  const siteUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:3000';
  // 详情区块：调用方传来的关键字段，逐行转义展示（空值跳过）
  const detailRows = (info.details || [])
    .filter((d) => d && d.value != null && String(d.value).trim() !== '')
    .map((d) => infoRow(d.label, String(d.value)))
    .join('');
  const detailBlock = detailRows
    ? `<div style="margin:16px 0;padding:14px 16px;background:#ECFDF5;border:2px solid #064E3B;border-radius:12px;">
        <p style="margin:0 0 10px;color:#064E3B;font-size:12px;font-weight:700;">提交内容</p>
        ${detailRows}
      </div>`
    : '';
  const body = `
    <p style="color:#064E3B;font-size:15px;font-weight:700;margin:0 0 16px;">有新的审核请求待处理</p>
    ${infoRow('类型', info.type)}
    ${infoRow('提交者', info.submitterName)}
    ${infoRow('内容', info.itemName)}
    ${detailBlock}
    ${actionBtn('前往审核后台', `${siteUrl}/admin/reviews`)}`;
  send(adminEmail, `【AniMap】新${info.type}审核请求`, emailShell('审核请求通知', body));
};

// ==========================================================================
// 审核结果通知 → 提交者
// ==========================================================================
export const sendReviewResult = async (to: string, info: {
  type: '活动' | '店铺'; itemName: string; approved: boolean; note?: string;
}) => {
  const statusText = info.approved ? '✅ 审核通过' : '❌ 审核未通过';
  const statusColor = info.approved ? '#059669' : '#ef4444';
  const note = (info.note || '').trim();
  // 备注区块：管理员填写的审核备注（通过/拒绝都可能有），用转义后多行展示
  const noteBlock = note
    ? `<div style="margin:16px 0;padding:14px 16px;background:#ECFDF5;border:2px solid #064E3B;border-radius:12px;">
        <p style="margin:0 0 6px;color:#064E3B;font-size:12px;font-weight:700;">管理员备注</p>
        <p style="margin:0;color:#064E3B;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(note)}</p>
      </div>`
    : '';
  const body = `
    <p style="color:#064E3B;font-size:15px;font-weight:700;margin:0 0 16px;">你提交的${escapeHtml(info.type)}审核结果已出炉</p>
    ${infoRow(info.type, info.itemName)}
    <div style="text-align:center;margin:20px 0;">
      <span style="display:inline-block;padding:10px 28px;font-size:16px;font-weight:800;color:#fff;background:${statusColor};border-radius:12px;border:3px solid #064E3B;box-shadow:4px 4px 0 #064E3B;">${statusText}</span>
    </div>
    ${noteBlock}
    ${info.approved
      ? '<p style="color:#064E3B;font-size:13px;text-align:center;opacity:0.8;">你的内容已在地图上展示，感谢你的贡献！</p>'
      : '<p style="color:#064E3B;font-size:13px;text-align:center;opacity:0.8;">如有疑问，请联系管理员。你可以修改后重新提交。</p>'
    }`;
  send(to, `【AniMap】你的${info.type}审核结果`, emailShell('审核结果通知', body));
};
