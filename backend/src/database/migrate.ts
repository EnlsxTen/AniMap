import pool from './db';
import bcrypt from 'bcryptjs';

const createTables = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        role VARCHAR(20) DEFAULT 'merchant',
        approval_status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending'
    `);

    // token_version：每次密码修改/账号被拒时 +1，配合 JWT 中的 tokenVersion 实现 token 吊销
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0
    `);

    await client.query(`
      UPDATE users
      SET approval_status = COALESCE(NULLIF(approval_status, ''), 'approved')
      WHERE approval_status IS NULL OR approval_status = ''
    `);

    // Events table（默认展示 7 天，与业务规则一致）
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        poster_url VARCHAR(500),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        venue_name VARCHAR(255) NOT NULL,
        address VARCHAR(500) NOT NULL,
        latitude DECIMAL(10, 7) NOT NULL,
        longitude DECIMAL(10, 7) NOT NULL,
        ticket_price VARCHAR(100),
        description TEXT,
        display_until TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days',
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      ALTER TABLE events
      ADD COLUMN IF NOT EXISTS display_until TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days'
    `);

    await client.query(`
      UPDATE events
      SET display_until = COALESCE(display_until, end_time)
      WHERE display_until IS NULL
    `);

    // 购票链接（商家可填，详情页"立即购票"按钮使用）
    await client.query(`
      ALTER TABLE events
      ADD COLUMN IF NOT EXISTS ticket_url VARCHAR(500)
    `);

    // Venues table（店铺）
    await client.query(`
      CREATE TABLE IF NOT EXISTS venues (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        cover_url VARCHAR(500),
        address VARCHAR(500) NOT NULL,
        latitude DECIMAL(10, 7) NOT NULL,
        longitude DECIMAL(10, 7) NOT NULL,
        phone VARCHAR(50),
        business_hours VARCHAR(255),
        description TEXT,
        nav_guide TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Venue navigation photos（店铺导航指引图片，一对多）
    await client.query(`
      CREATE TABLE IF NOT EXISTS venue_nav_photos (
        id SERIAL PRIMARY KEY,
        venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
        photo_url VARCHAR(500) NOT NULL,
        caption VARCHAR(255),
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_venues_status ON venues(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_venues_user_id ON venues(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_venue_nav_photos_venue_id ON venue_nav_photos(venue_id)`);

    // Sessions table（组局活动）
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        game_name VARCHAR(255) NOT NULL,
        game_type VARCHAR(50) DEFAULT 'boardgame',
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        total_seats INTEGER NOT NULL,
        booked_seats INTEGER DEFAULT 0,
        difficulty VARCHAR(20) DEFAULT 'beginner',
        description TEXT,
        price_per_person VARCHAR(100),
        address VARCHAR(500),
        latitude DECIMAL(10, 7),
        longitude DECIMAL(10, 7),
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Session registrations（报名记录）
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_registrations (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        seats INTEGER DEFAULT 1,
        note VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, user_id)
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_venue_id ON sessions(venue_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_session_registrations_session_id ON session_registrations(session_id)`);

    // Favorites table（收藏）
    await client.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        item_type VARCHAR(20) NOT NULL,
        item_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, item_type, item_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id)`);
    await client.query(`ALTER TABLE favorites ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT FALSE`);

    // Reminder logs（提醒去重记录）
    await client.query(`
      CREATE TABLE IF NOT EXISTS reminder_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        item_type VARCHAR(20) NOT NULL,
        item_id INTEGER NOT NULL,
        remind_type VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, item_type, item_id, remind_type)
      )
    `);

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_display_until ON events(display_until)`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users(approval_status)`);

    // Settings table (key-value store for site configuration)
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 初始化管理员账号（仅当环境变量配置且 admin 不存在时）
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';

    if (adminEmail && adminPassword) {
      const existing = await client.query('SELECT id FROM users WHERE role = $1', ['admin']);
      if (existing.rows.length === 0) {
        // 检查邮箱是否已被非管理员占用，避免静默提权
        const emailExisting = await client.query('SELECT id, role FROM users WHERE email = $1', [adminEmail.toLowerCase()]);
        if (emailExisting.rows.length > 0) {
          console.warn(`[migrate] ADMIN_EMAIL ${adminEmail} 已被角色 ${emailExisting.rows[0].role} 的用户占用，跳过管理员种子。请更换 ADMIN_EMAIL 或手动处理。`);
        } else {
          const hashed = await bcrypt.hash(adminPassword, 10);
          await client.query(
            `INSERT INTO users (email, password, username, role, approval_status)
             VALUES ($1, $2, $3, 'admin', 'approved')`,
            [adminEmail.toLowerCase(), hashed, adminUsername]
          );
          console.log(`[migrate] Admin user seeded: ${adminEmail}`);
        }
      } else {
        console.log('[migrate] Admin already exists, skip seeding.');
      }
    } else {
      console.log('[migrate] ADMIN_EMAIL/ADMIN_PASSWORD not set, skip admin seeding.');
    }

    await client.query('COMMIT');
    console.log('Database tables created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

createTables()
  .then(async () => {
    console.log('Migration completed');
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Migration failed:', error);
    await pool.end();
    process.exit(1);
  });
