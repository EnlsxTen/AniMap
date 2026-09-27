// AniMap 本地演示数据种子（幂等：有数据则跳过）
const { Client } = require('pg');

async function main() {
  const c = new Client({ host: '127.0.0.1', port: 5432, user: 'postgres', password: 'postgres', database: 'animap' });
  await c.connect();

  const admin = await c.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
  if (admin.rowCount === 0) { console.error('no admin user found, run migrate first'); process.exit(1); }
  const uid = admin.rows[0].id;

  const cnt = await c.query('SELECT COUNT(*)::int AS n FROM events');
  if (cnt.rows[0].n > 0) { console.log('demo data already present, skip'); await c.end(); return; }

  // 店铺
  const venues = [
    ['梦现主题咖啡', '北京市朝阳区次元路 88 号', 116.4613, 39.9067, '10:00-22:00', 'ACG 主题咖啡，常设桌游区与周边展示墙'],
    ['漫界桌游俱乐部', '北京市朝阳区动漫大道 12 号 3 层', 116.4736, 39.9215, '13:00-次日 02:00', '剧本杀 / 桌游 / 卡牌对战综合馆'],
    ['雫の庭院女仆店', '北京市海淀区中关村大街 5 号 B1', 116.3168, 39.9832, '11:00-21:00', '女仆咖啡与合照打卡，周末有宅舞快闪'],
  ];
  const venueIds = [];
  for (const [name, address, lng, lat, hours, desc] of venues) {
    const r = await c.query(
      `INSERT INTO venues (user_id, name, address, longitude, latitude, business_hours, description, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'approved') RETURNING id`,
      [uid, name, address, lng, lat, hours, desc]
    );
    venueIds.push(r.rows[0].id);
  }

  // 活动（全部未开始，display_until 覆盖到活动结束）
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  const events = [
    ['星海动漫嘉年华 · 秋季场', venueIds[0], '梦现主题咖啡', '北京市朝阳区次元路 88 号', 116.4613, 39.9067,
     new Date(now + 3 * day), new Date(now + 4 * day), '¥68 预售 / ¥88 现场', '本地年度大型同人展，包含 120+ 社团摊位、舞台 Live 与 Guest 见面会。'],
    ['国风音乐会 · 幻夜篇', venueIds[2], '雫の庭院女仆店', '北京市海淀区中关村大街 5 号 B1', 116.3168, 39.9832,
     new Date(now + 10 * day), new Date(now + 10 * day + 4 * 3600 * 1000), '¥120', '二次元国风交响音乐会，曲目覆盖热门番剧 OST。'],
    ['模型手办交流市集', venueIds[1], '漫界桌游俱乐部', '北京市朝阳区动漫大道 12 号 3 层', 116.4736, 39.9215,
     new Date(now + 16 * day), new Date(now + 17 * day), '免费入场', '高达 / 食玩 / 手办涂装交流，现场提供喷漆体验区。'],
  ];
  const eventIds = [];
  for (const [name, vid, vname, address, lng, lat, start, end, price, desc] of events) {
    const r = await c.query(
      `INSERT INTO events (user_id, name, poster_url, start_time, end_time, venue_name, address, longitude, latitude,
        ticket_price, description, display_until, status)
       VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,'approved') RETURNING id`,
      [uid, name, start, end, vname, address, lng, lat, price, desc, end]
    );
    eventIds.push(r.rows[0].id);
  }

  // 组局（挂在店铺上）
  const sessions = [
    [venueIds[0], '血色钟塔 · 6 人本', 'murder_mystery', new Date(now + 2 * day), new Date(now + 2 * day + 5 * 3600 * 1000), 6, 2, 'intermediate', '还原推凶本，新手可玩，含 DM 主持。', '¥158/人', 116.4613, 39.9067],
    [venueIds[1], '卡坦岛新手场', 'boardgame', new Date(now + 5 * day), new Date(now + 5 * day + 3 * 3600 * 1000), 4, 1, 'beginner', '规则教学 + 双局连打，赢楼层小奖品。', '¥48/人', 116.4736, 39.9215],
    [venueIds[1], '游戏王.edison 周例赛', 'card', new Date(now + 7 * day), new Date(now + 7 * day + 4 * 3600 * 1000), 8, 3, 'advanced', '瑞士轮 3 轮，自备卡组，赛前 15 分钟签到。', '¥30/人', 116.4736, 39.9215],
  ];
  for (const [vid, gname, gtype, start, end, seats, booked, diff, desc, price, lng, lat] of sessions) {
    await c.query(
      `INSERT INTO sessions (venue_id, user_id, game_name, game_type, start_time, end_time, total_seats, booked_seats,
        difficulty, description, price_per_person, address, longitude, latitude, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'店内举办',$12,$13,'open')`,
      [vid, uid, gname, gtype, start, end, seats, booked, diff, desc, price, lng, lat]
    );
  }

  console.log(`seeded: ${venues.length} venues, ${events.length} events, ${sessions.length} sessions`);
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
