import pool from '../database/db';
import { sendFavoriteReminder } from './emailService';

const fmtTime = (t: string) => new Date(t).toLocaleString('zh-CN', {
  timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

// 发送指定小时数前的提醒，用 reminder_logs 去重防止重复发送
const sendRemindersForHours = async (hoursLeft: number) => {
  const now = new Date();
  const windowStart = new Date(now.getTime() + hoursLeft * 3600 * 1000);
  const windowEnd = new Date(windowStart.getTime() + 3600 * 1000);
  const remindType = `${hoursLeft}h`;

  try {
    // 展会提醒（排除已发送过的）
    const events = await pool.query(
      `SELECT e.id, e.name, e.start_time, e.address, u.id as user_id, u.email
       FROM events e
       JOIN favorites f ON f.item_type='event' AND f.item_id=e.id
       JOIN users u ON u.id=f.user_id
       WHERE e.start_time >= $1 AND e.start_time < $2 AND e.status='approved'
         AND f.reminder_enabled = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM reminder_logs rl
           WHERE rl.user_id=u.id AND rl.item_type='event' AND rl.item_id=e.id AND rl.remind_type=$3
         )`,
      [windowStart, windowEnd, remindType]
    );

    await Promise.allSettled(events.rows.map(async row => {
      await sendFavoriteReminder(row.email, {
        type: '展会', name: row.name,
        startTime: fmtTime(row.start_time), address: row.address, hoursLeft,
      });
      await pool.query(
        'INSERT INTO reminder_logs (user_id, item_type, item_id, remind_type) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [row.user_id, 'event', row.id, remindType]
      );
    }));

    // 组局提醒（排除已发送过的）
    const sessions = await pool.query(
      `SELECT s.id, s.game_name, s.start_time, s.address, v.name as venue_name, u.id as user_id, u.email
       FROM sessions s
       JOIN favorites f ON f.item_type='session' AND f.item_id=s.id
       JOIN users u ON u.id=f.user_id
       LEFT JOIN venues v ON v.id=s.venue_id
       WHERE s.start_time >= $1 AND s.start_time < $2 AND s.status IN ('open','full')
         AND f.reminder_enabled = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM reminder_logs rl
           WHERE rl.user_id=u.id AND rl.item_type='session' AND rl.item_id=s.id AND rl.remind_type=$3
         )`,
      [windowStart, windowEnd, remindType]
    );

    await Promise.allSettled(sessions.rows.map(async row => {
      await sendFavoriteReminder(row.email, {
        type: '组局', name: row.game_name,
        startTime: fmtTime(row.start_time),
        address: row.venue_name || row.address || '',
        hoursLeft,
      });
      await pool.query(
        'INSERT INTO reminder_logs (user_id, item_type, item_id, remind_type) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [row.user_id, 'session', row.id, remindType]
      );
    }));
  } catch (err) {
    console.error(`[reminderJob] ${hoursLeft}h 提醒发送失败:`, err);
  }
};

export const startReminderJob = () => {
  const run = () => {
    sendRemindersForHours(72);
    sendRemindersForHours(24);
    sendRemindersForHours(2);
  };

  // 对齐到下一个整点（修复漏掉毫秒的问题）
  const now = new Date();
  const msToNextHour = (60 - now.getMinutes()) * 60 * 1000
    - now.getSeconds() * 1000
    - now.getMilliseconds();
  setTimeout(() => {
    run();
    setInterval(run, 3600 * 1000);
  }, msToNextHour);

  console.log(`[reminderJob] 已启动，将在 ${Math.round(msToNextHour / 60000)} 分钟后首次运行`);
};
