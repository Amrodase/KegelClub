import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import webPush from 'web-push';
import { createServer as createHttpServer } from 'http';
import { Server } from 'socket.io';

const { Pool } = pg;

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';

dotenv.config();

// Fix for Aiven self-signed certificate issue, handled in Pool config now
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = 'Kegelverein App';
const ORIGIN = process.env.APP_URL || `http://${RP_ID}:3000`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage();

const upload = multer({ storage });

// const { Pool } = pg;

// Aiven PostgreSQL Connection
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not defined in environment variables!');
} else {
  console.log('DATABASE_URL is defined.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.DATABASE_CA_CERT,
  }
});

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET environment variable is not defined.');
  process.exit(1);
}

async function initDb() {
  console.log('Initializing database...');
  try {
    const client = await pool.connect();
    console.log('Successfully connected to database');
    client.release();
  } catch (err) {
    console.error('Database connection error:', err);
  }
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'member',
        email VARCHAR(255),
        webauthn_credential_id TEXT,
        webauthn_public_key TEXT,
        webauthn_counter BIGINT DEFAULT 0,
        pudel INTEGER DEFAULT 0,
        gewonnen INTEGER DEFAULT 0,
        verloren INTEGER DEFAULT 0,
        abwesend INTEGER DEFAULT 0,
        klingeln INTEGER DEFAULT 0,
        open_amount DECIMAL(10,2) DEFAULT 0,
        total_donations DECIMAL(10,2) DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS club_settings (
        id INTEGER PRIMARY KEY,
        club_name VARCHAR(255),
        logo_url TEXT,
        banner_url TEXT,
        primary_color VARCHAR(50),
        secondary_color VARCHAR(50),
        vapid_public_key TEXT,
        vapid_private_key TEXT
      );

      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'news',
        poll_options JSONB DEFAULT '[]',
        multiple_choice BOOLEAN DEFAULT FALSE,
        archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS poll_votes (
        id SERIAL PRIMARY KEY,
        news_id INTEGER REFERENCES news(id) ON DELETE CASCADE,
        member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
        options JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(news_id, member_id)
      );

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(endpoint)
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        time TIME NOT NULL,
        location VARCHAR(255),
        description TEXT,
        reminder_sent BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Check and alter club_settings to ensure columns exist
    const settingsTableRes = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='club_settings'");
    const settingsCols = settingsTableRes.rows.map(row => row.column_name);
    if (!settingsCols.includes('vapid_public_key')) await pool.query('ALTER TABLE club_settings ADD COLUMN vapid_public_key TEXT');
    if (!settingsCols.includes('vapid_private_key')) await pool.query('ALTER TABLE club_settings ADD COLUMN vapid_private_key TEXT');

    const apptTableRes = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='appointments'");
    if (!apptTableRes.rows.some(row => row.column_name === 'reminder_sent')) {
      await pool.query('ALTER TABLE appointments ADD COLUMN reminder_sent BOOLEAN DEFAULT FALSE');
    }
    
    const chatTableRes = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='chat_messages'");
    const chatCols = chatTableRes.rows.map(row => row.column_name);
    if (!chatCols.includes('image_url')) {
      await pool.query('ALTER TABLE chat_messages ADD COLUMN image_url TEXT');
      await pool.query('ALTER TABLE chat_messages ALTER COLUMN content DROP NOT NULL');
    }

    // Default VAPID keys setup
    const settingsRow = await pool.query('SELECT * FROM club_settings LIMIT 1');
    let vapidPublic = settingsRow.rows[0]?.vapid_public_key;
    let vapidPrivate = settingsRow.rows[0]?.vapid_private_key;
    
    if (!vapidPublic || !vapidPrivate) {
      const keys = webPush.generateVAPIDKeys();
      vapidPublic = keys.publicKey;
      vapidPrivate = keys.privateKey;
      if (settingsRow.rows.length === 0) {
        await pool.query('INSERT INTO club_settings (club_name, vapid_public_key, vapid_private_key) VALUES ($1, $2, $3)', ['Kegelverein', vapidPublic, vapidPrivate]);
      } else {
        await pool.query('UPDATE club_settings SET vapid_public_key = $1, vapid_private_key = $2', [vapidPublic, vapidPrivate]);
      }
    }
    
    webPush.setVapidDetails('mailto:admin@kegelverein.local', vapidPublic, vapidPrivate);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointment_attendance (
        id SERIAL PRIMARY KEY,
        appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
        member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'attending',
        UNIQUE(appointment_id, member_id)
      );

      CREATE TABLE IF NOT EXISTS cash_register (
        id SERIAL PRIMARY KEY,
        member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        description TEXT,
        type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS kv_sessions (
        id SERIAL PRIMARY KEY,
        member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        pudel INTEGER DEFAULT 0,
        gewonnen INTEGER DEFAULT 0,
        verloren INTEGER DEFAULT 0,
        klingeln INTEGER DEFAULT 0,
        spende DECIMAL(10,2) DEFAULT 0,
        gezahlt BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default admin if not exists
    const adminCheck = await pool.query('SELECT * FROM members WHERE username = $1', ['admin']);
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO members (username, password, name, role) VALUES ($1, $2, $3, $4)',
        ['admin', hashedPassword, 'Administrator', 'admin']
      );
      console.log('Default admin user created: admin / admin123');
    }

    // Insert default settings if not exists
    const settingsCheck = await pool.query('SELECT * FROM club_settings WHERE id = 1');
    if (settingsCheck.rows.length === 0) {
      await pool.query(
        'INSERT INTO club_settings (id, club_name, logo_url, primary_color, secondary_color) VALUES (1, $1, $2, $3, $4)',
        ['Mein Kegelverein', '/icon-192.png', '#fbbf24', '#0f172a']
      );
    }

    await pool.query(`
      -- Rename old transaction table if it exists
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'cash_register') THEN
          -- Check if it's the transaction table by column check
          IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cash_register' AND column_name = 'amount') THEN
              ALTER TABLE cash_register RENAME TO cash_transactions;
          END IF;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS cash_register (
        id SERIAL PRIMARY KEY,
        member_id INTEGER REFERENCES members(id) UNIQUE,
        total_played INTEGER DEFAULT 0,
        total_paid DECIMAL(10,2) DEFAULT 0,
        open_amount DECIMAL(10,2) DEFAULT 0,
        total_donations DECIMAL(10,2) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
        content TEXT,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Migrate old member data to new cash_register
      INSERT INTO cash_register (member_id, open_amount, total_donations)
      SELECT id, open_amount, total_donations
      FROM members
      ON CONFLICT (member_id) DO NOTHING;
    `);

    await pool.query(`
      ALTER TABLE members ADD COLUMN IF NOT EXISTS pudel INTEGER DEFAULT 0;
      ALTER TABLE members ADD COLUMN IF NOT EXISTS gewonnen INTEGER DEFAULT 0;
      ALTER TABLE members ADD COLUMN IF NOT EXISTS verloren INTEGER DEFAULT 0;
      ALTER TABLE members ADD COLUMN IF NOT EXISTS abwesend INTEGER DEFAULT 0;
      ALTER TABLE members ADD COLUMN IF NOT EXISTS klingeln INTEGER DEFAULT 0;
      ALTER TABLE members ADD COLUMN IF NOT EXISTS open_amount DECIMAL(10,2) DEFAULT 0;
      ALTER TABLE members ADD COLUMN IF NOT EXISTS total_donations DECIMAL(10,2) DEFAULT 0;
      
      ALTER TABLE news ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'news';
      ALTER TABLE news ADD COLUMN IF NOT EXISTS poll_options JSONB DEFAULT '[]';
      ALTER TABLE news ADD COLUMN IF NOT EXISTS multiple_choice BOOLEAN DEFAULT FALSE;
      ALTER TABLE news ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
    `);

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

async function startServer() {
  console.log('Starting server...');
  await initDb();
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(uploadDir));

  app.use((req, res, next) => {
    console.log(`Request: ${req.method} ${req.url}`);
    next();
  });

  // --- MIDDLEWARE ---
  const authenticateToken = (req: any, res: any, next: any) => {
    console.log('Auth header:', req.headers['authorization']);
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      console.log('Auth token MISSING');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        console.log('Auth token INVALID:', err.message);
        return res.status(403).json({ error: 'Forbidden' });
      }
      req.user = user;
      next();
    });
  };

  const isAdmin = (req: any, res: any, next: any) => {
    console.log(`Admin check for user: ${req.user?.username}, role: ${req.user?.role}`);
    if (req.user?.role !== 'admin') {
      console.log('Admin check FAILED');
      return res.status(403).json({ error: 'Admin access required' });
    }
    console.log('Admin check PASSED');
    next();
  };

  // --- WEB PUSH API ---
  app.get('/api/push/vapid-public-key', (req, res) => {
    pool.query('SELECT vapid_public_key FROM club_settings LIMIT 1', (err, result) => {
      if (err || result.rows.length === 0) return res.status(500).send('Error');
      res.json({ publicKey: result.rows[0].vapid_public_key });
    });
  });

  app.post('/api/push/subscribe', authenticateToken, async (req, res) => {
    const subscription = req.body;
    const memberId = (req as any).user.id;
    try {
      const endpoint = subscription.endpoint;
      const p256dh = subscription.keys.p256dh;
      const auth = subscription.keys.auth;
      
      await pool.query(
        `INSERT INTO push_subscriptions (member_id, endpoint, p256dh, auth) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (endpoint) DO UPDATE 
         SET member_id = EXCLUDED.member_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
        [memberId, endpoint, p256dh, auth]
      );
      res.json({ success: true });
    } catch(err) {
      console.error('Error saving subscription', err);
      res.status(500).json({ error: 'Error saving subscription' });
    }
  });

  // Background Cron Job for Reminders
  setInterval(async () => {
    try {
      const dbSettingsObj = await pool.query('SELECT vapid_public_key, vapid_private_key FROM club_settings LIMIT 1');
      if (dbSettingsObj.rows.length === 0) return;
      
      const vPub = dbSettingsObj.rows[0].vapid_public_key;
      const vPriv = dbSettingsObj.rows[0].vapid_private_key;
      if (!vPub || !vPriv) return;
      
      webPush.setVapidDetails('mailto:admin@kegelverein.local', vPub, vPriv);

      // Find appointments exactly 2 days from now that haven't been sent yet
      // using AT TIME ZONE or simple date math
      const query = `
        SELECT id, date, time, description 
        FROM appointments 
        WHERE date = CURRENT_DATE + INTERVAL '2 days' 
        AND reminder_sent = FALSE
      `;
      const appts = await pool.query(query);
      
      if (appts.rows.length > 0) {
        const subscriptions = await pool.query('SELECT endpoint, p256dh, auth FROM push_subscriptions');
        
        for (const appt of appts.rows) {
          const payload = JSON.stringify({
            title: 'Erinnerung: Anstehender Termin!',
            body: `Dein nächster Termin findet in 2 Tagen (am ${new Date(appt.date).toLocaleDateString('de-DE')} um ${appt.time} Uhr) statt.`,
            url: `/appointments`
          });
          
          for (const sub of subscriptions.rows) {
            try {
              await webPush.sendNotification({
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
              }, payload);
            } catch (err: any) {
              if (err.statusCode === 410) {
                await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
              }
            }
          }
          await pool.query('UPDATE appointments SET reminder_sent = TRUE WHERE id = $1', [appt.id]);
        }
      }
    } catch (err) {
      console.error('Interval reminder check failed', err);
    }
  }, 1000 * 60 * 60); // Check every hour

  // --- API ROUTES ---

  // Image Uploads
  app.post('/api/admin/upload-logo', authenticateToken, isAdmin, (req, res, next) => {
    upload.single('logo')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }, async (req, res) => {
    console.log('Upload logo route reached');
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    // Write the buffer to a file
    const filename = 'logo-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(req.file.originalname);
    const filePath = path.join(uploadDir, filename);
    await fs.promises.writeFile(filePath, req.file.buffer);

    const logoUrl = `/uploads/${filename}`;
    try {
      await pool.query('UPDATE club_settings SET logo_url = $1 WHERE id = 1', [logoUrl]);
      res.json({ success: true, url: logoUrl });
    } catch (err) {
      res.status(500).json({ error: 'Error updating logo' });
    }
  });

  // RESTRICTED: Disabled debug routes
  app.get('/api/debug_members', authenticateToken, isAdmin, (req, res) => res.status(403).json({ error: 'Disabled' }));                

  app.get('/api/test', (req, res) => {
    res.json({ success: true });
  });

  app.post('/api/admin/upload-banner', authenticateToken, isAdmin, (req, res, next) => {
    upload.single('banner')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }, async (req, res) => {
    console.log('Upload banner route reached');
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    // Write the buffer to a file
    const filename = 'banner-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(req.file.originalname);
    const filePath = path.join(uploadDir, filename);
    await fs.promises.writeFile(filePath, req.file.buffer);

    const bannerUrl = `/uploads/${filename}`;
    try {
      await pool.query('UPDATE club_settings SET banner_url = $1 WHERE id = 1', [bannerUrl]);
      res.json({ success: true, url: bannerUrl });
    } catch (err) {
      res.status(500).json({ error: 'Error updating banner' });
    }
  });

  // WebAuthn Challenges Store (In-memory for demo, use Redis/Session in production)
  const challenges = new Map<string, string>();

  // WebAuthn Registration
  app.get('/api/auth/webauthn/register-options', authenticateToken, async (req, res) => {
    const user = (req as any).user;
    try {
      const result = await pool.query('SELECT * FROM members WHERE id = $1', [user.id]);
      const dbUser = result.rows[0];
      
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userID: dbUser.id.toString(),
        userName: dbUser.username,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      });

      challenges.set(dbUser.id.toString(), options.challenge);
      res.json(options);
    } catch (err) {
      res.status(500).json({ error: 'Error generating registration options' });
    }
  });

  app.post('/api/auth/webauthn/register-verify', authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const body: RegistrationResponseJSON = req.body;
    const expectedChallenge = challenges.get(user.id.toString());

    if (!expectedChallenge) return res.status(400).json({ error: 'No challenge found' });

    try {
      const verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
      });

      if (verification.verified && verification.registrationInfo) {
        const info = verification.registrationInfo as any;
        const { credentialID, credentialPublicKey, counter } = info;
        await pool.query(
          'UPDATE members SET webauthn_credential_id = $1, webauthn_public_key = $2, webauthn_counter = $3 WHERE id = $4',
          [Buffer.from(credentialID).toString('base64'), Buffer.from(credentialPublicKey).toString('base64'), counter, user.id]
        );
        res.json({ success: true });
      } else {
        res.status(400).json({ error: 'Verification failed' });
      }
    } catch (err) {
      res.status(500).json({ error: 'Error verifying registration' });
    } finally {
      challenges.delete(user.id.toString());
    }
  });

  // WebAuthn Authentication
  app.get('/api/auth/webauthn/login-options', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Username required' });

    try {
      const result = await pool.query('SELECT * FROM members WHERE username = $1', [username]);
      const dbUser = result.rows[0];
      if (!dbUser || !dbUser.webauthn_credential_id) return res.status(400).json({ error: 'User not found or no passkey registered' });

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials: [{
          id: Buffer.from(dbUser.webauthn_credential_id, 'base64').toString('base64url'),
        }],
        userVerification: 'preferred',
      });

      challenges.set(dbUser.username, options.challenge);
      res.json(options);
    } catch (err) {
      res.status(500).json({ error: 'Error generating login options' });
    }
  });

  app.post('/api/auth/webauthn/login-verify', async (req, res) => {
    const { username, response }: { username: string, response: AuthenticationResponseJSON } = req.body;
    const expectedChallenge = challenges.get(username);

    if (!expectedChallenge) return res.status(400).json({ error: 'No challenge found' });

    try {
      const result = await pool.query('SELECT * FROM members WHERE username = $1', [username]);
      const dbUser = result.rows[0];

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        authenticator: {
          credentialID: Buffer.from(dbUser.webauthn_credential_id, 'base64'),
          credentialPublicKey: Buffer.from(dbUser.webauthn_public_key, 'base64'),
          counter: dbUser.webauthn_counter,
        },
      } as any);

      if (verification.verified) {
        await pool.query('UPDATE members SET webauthn_counter = $1 WHERE id = $2', [verification.authenticationInfo.newCounter, dbUser.id]);
        const token = jwt.sign({ id: dbUser.id, username: dbUser.username, role: dbUser.role }, JWT_SECRET);
        res.json({ token, user: { id: dbUser.id, name: dbUser.name, role: dbUser.role, username: dbUser.username } });
      } else {
        res.status(400).json({ error: 'Verification failed' });
      }
    } catch (err) {
      res.status(500).json({ error: 'Error verifying login' });
    } finally {
      challenges.delete(username);
    }
  });
  // Login
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body; // 'username' here is actually the name entered in the UI
    console.log(`Login attempt for user: ${username}`);
    try {
      // Look up by name since username is null for most members
      const result = await pool.query('SELECT * FROM members WHERE LOWER(name) = LOWER($1)', [username]);
      const user = result.rows[0];

      if (!user) {
        console.log(`User not found: ${username}`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        console.log(`Login successful for user: ${username}`);
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
        res.json({ token, user: { id: user.id, name: user.name, role: user.role, username: user.username } });
      } else {
        console.log(`Invalid password for user: ${username}`);
        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query('SELECT id, name, role, username FROM members WHERE id = $1', [(req as any).user.id]);
      if (result.rows.length > 0) {
        res.json(result.rows[0]);
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // DB Status route
  // RESTRICTED: Disabled debug routes
  app.get('/api/debug/db-status', (req, res) => res.status(403).json({ error: 'Disabled' }));

  // Debug route to list users (REMOVE IN PRODUCTION)
  // RESTRICTED: Disabled debug routes
  app.get('/api/debug/users', (req, res) => res.status(403).json({ error: 'Disabled' }));

  // Dashboard Stats
  app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
      const memberId = (req as any).user.id;
      const stats = await pool.query(`
        SELECT 
          m.id, m.username, m.name, m.role, m.email, 
          m.stats_pudel, 
          m.stats_won, 
          m.stats_lost, 
          m.stats_absent,
          m.stats_klingeln,
          coalesce(cr.open_amount, 0)::float as open_amount, 
          coalesce(cr.total_donations, 0)::float as total_donations,
          coalesce(cr.total_paid, 0)::float as total_paid
        FROM members m
        LEFT JOIN cash_register cr ON m.id = cr.member_id
        WHERE m.id = $1
      `, [memberId]);
      const totalStats = await pool.query(`
        SELECT 
          COALESCE(SUM(cr.open_amount), 0)::float as total_open,
          COALESCE(SUM(cr.total_donations), 0)::float as total_donations,
          COALESCE(SUM(cr.total_paid), 0)::float as total_paid
        FROM cash_register cr
        JOIN members m ON cr.member_id = m.id
        WHERE (m.username IS NULL OR m.username != 'admin') AND m.name NOT IN ('Administrator', 'Administratot')
      `);
      
      // Fetch ranking (all members except admin/system users)
      const ranking = await pool.query(`
        SELECT 
          m.id, 
          m.name, 
          m.username,
          m.role,
          m.stats_pudel, 
          m.stats_won, 
          m.stats_lost, 
          m.stats_absent,
          m.stats_klingeln,
          coalesce(cr.open_amount, 0)::float as open_amount,
          coalesce(cr.total_donations, 0)::float as total_donations,
          coalesce(cr.total_paid, 0)::float as total_paid
        FROM members m
        LEFT JOIN cash_register cr ON m.id = cr.member_id
        WHERE (m.username IS NULL OR m.username != 'admin') AND m.name NOT IN ('Administrator', 'Administratot')
        ORDER BY m.stats_won DESC, m.stats_pudel ASC
      `);

      console.log(`Fetched ${ranking.rows.length} members for ranking`);

      res.json({
        personal: stats.rows[0],
        finance: { 
          open_amount: stats.rows[0]?.open_amount || 0, 
          total_donations: stats.rows[0]?.total_donations || 0 
        },
        clubTotal: totalStats.rows[0].total_paid || 0,
        clubTotalDonations: totalStats.rows[0].total_donations || 0,
        clubTotalOpen: totalStats.rows[0].total_open || 0,
        ranking: ranking.rows
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
      res.status(500).json({ error: 'Error fetching stats' });
    }
  });

  // News & Polls
  app.get('/api/news', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM news WHERE archived = false OR archived IS NULL ORDER BY created_at DESC');
      
      const newsItems = result.rows;
      
      // Fetch votes for polls
      const pollIds = newsItems.filter(n => n.type === 'poll').map(n => n.id);
      if (pollIds.length > 0) {
        const votesResult = await pool.query(
          'SELECT news_id, member_id, options FROM poll_votes WHERE news_id = ANY($1)',
          [pollIds]
        );
        
        const votesByNewsId = votesResult.rows.reduce((acc: any, vote: any) => {
          if (!acc[vote.news_id]) acc[vote.news_id] = [];
          acc[vote.news_id].push({
            member_id: vote.member_id,
            options: vote.options // This is an array of strings
          });
          return acc;
        }, {});
        
        newsItems.forEach(n => {
          if (n.type === 'poll') {
            n.votes = votesByNewsId[n.id] || [];
          }
        });
      }
      
      res.json(newsItems);
    } catch (err) {
      console.error('Error fetching news:', err);
      res.status(500).json({ error: 'Error fetching news' });
    }
  });

  app.post('/api/news/:id/vote', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { options } = req.body;
    const memberId = (req as any).user.id;
    
    if (!Array.isArray(options)) {
      return res.status(400).json({ error: 'Options must be an array' });
    }
    
    try {
      await pool.query(
        `INSERT INTO poll_votes (news_id, member_id, options) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (news_id, member_id) 
         DO UPDATE SET options = EXCLUDED.options, created_at = CURRENT_TIMESTAMP`,
        [id, memberId, JSON.stringify(options)]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Error saving vote:', err);
      res.status(500).json({ error: 'Error saving vote' });
    }
  });

  app.post('/api/admin/news', authenticateToken, isAdmin, async (req, res) => {
    const { title, content, type, poll_options, multiple_choice, send_push } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    try {
      await pool.query(
        'INSERT INTO news (title, content, type, poll_options, multiple_choice) VALUES ($1, $2, $3, $4, $5)',
        [title, content, type || 'news', JSON.stringify(poll_options || []), multiple_choice || false]
      );
      
      if (send_push) {
        const subscriptions = await pool.query('SELECT endpoint, p256dh, auth FROM push_subscriptions');
        const payload = JSON.stringify({
          title: type === 'poll' ? 'Neue Umfrage!' : 'Wichtige Info: ' + title,
          body: type === 'poll' ? title : 'Es gibt neue Vereins-News.',
          url: '/'
        });
        
        for (const sub of subscriptions.rows) {
          try {
            await webPush.sendNotification({
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            }, payload);
          } catch (err: any) {
            if (err.statusCode === 410) {
              await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
            }
          }
        }
      }
      
      res.json({ success: true });
    } catch (err) {
      console.error('Error creating news:', err);
      res.status(500).json({ error: 'Error creating news' });
    }
  });

  app.put('/api/admin/news/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { title, content, type, poll_options, multiple_choice } = req.body;
    try {
      await pool.query(
        'UPDATE news SET title = $1, content = $2, type = $3, poll_options = $4, multiple_choice = $5 WHERE id = $6',
        [title, content, type, JSON.stringify(poll_options || []), multiple_choice || false, id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating news:', err);
      res.status(500).json({ error: 'Error updating news' });
    }
  });

  app.delete('/api/admin/news/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    console.log(`DELETE request received for news ID: ${id} from user: ${req.user?.username}`);
    try {
      const result = await pool.query('DELETE FROM news WHERE id = $1', [id]);
      console.log(`Delete result for ID ${id}:`, result.rowCount);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting news:', err);
      res.status(500).json({ error: 'Error deleting news' });
    }
  });

  app.put('/api/admin/news/:id/archive', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('UPDATE news SET archived = true WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error archiving news:', err);
      res.status(500).json({ error: 'Error archiving news' });
    }
  });

  // Appointments
  app.get('/api/appointments', authenticateToken, async (req: any, res) => {
    try {
      const result = await pool.query(`
        SELECT a.*, 
          (SELECT COUNT(*) FROM members WHERE (username IS NULL OR username != 'admin') AND name NOT IN ('Administrator', 'Administratot')) - (SELECT COUNT(*) FROM appointment_attendance aa WHERE aa.appointment_id = a.id AND aa.status = 'absent') as attending_count,
          (SELECT COUNT(*) FROM appointment_attendance aa WHERE aa.appointment_id = a.id AND aa.status = 'absent') as absent_count,
          COALESCE((SELECT status FROM appointment_attendance aa WHERE aa.appointment_id = a.id AND aa.member_id = $1), 'attending') as user_status
        FROM appointments a 
        ORDER BY date ASC
      `, [req.user.id]);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching appointments:', err);
      res.status(500).json({ error: 'Error fetching appointments' });
    }
  });

  app.post('/api/appointments/:id/attendance', authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'attending' or 'absent'
    
    if (!['attending', 'absent'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    try {
      await pool.query(`
        INSERT INTO appointment_attendance (appointment_id, member_id, status)
        VALUES ($1, $2, $3)
        ON CONFLICT (appointment_id, member_id)
        DO UPDATE SET status = EXCLUDED.status
      `, [id, req.user.id, status]);
      
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating attendance:', err);
      res.status(500).json({ error: 'Error updating attendance' });
    }
  });

  // Settings
  app.get('/api/settings', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM club_settings LIMIT 1');
      res.json(result.rows[0] || {});
    } catch (err) {
      res.status(500).json({ error: 'Error fetching settings' });
    }
  });

  // --- ADMIN ROUTES ---

  // Members Management
  app.get('/api/admin/members', authenticateToken, isAdmin, async (req, res) => {
    try {
      const result = await pool.query("SELECT id, name, role, username, email FROM members WHERE (username IS NULL OR username != 'admin') AND name NOT IN ('Administrator', 'Administratot') ORDER BY name ASC");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: 'Error fetching members' });
    }
  });

  app.post('/api/admin/members', authenticateToken, isAdmin, async (req, res) => {
    const { username, password, name, role } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password and name are required' });
    }
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO members (username, password, name, role) VALUES ($1, $2, $3, $4)',
        [username, hashedPassword, name, role || 'member']
      );
      res.json({ success: true });
    } catch (err) {
      if ((err as any).code === '23505') {
        return res.status(400).json({ error: 'Username already exists' });
      }
      res.status(500).json({ error: 'Error creating member' });
    }
  });

  app.patch('/api/admin/members/:id/role', authenticateToken, isAdmin, async (req, res) => {
    const { role } = req.body;
    try {
      await pool.query('UPDATE members SET role = $1 WHERE id = $2', [role, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error updating role' });
    }
  });

  app.post('/api/admin/members/:id/password-override', authenticateToken, isAdmin, async (req, res) => {
    const { newPassword } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE members SET password = $1 WHERE id = $2', [hashedPassword, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error overriding password' });
    }
  });

  // Club Settings
  app.put('/api/admin/settings', authenticateToken, isAdmin, async (req, res) => {
    const { club_name, logo_url, banner_url, primary_color, secondary_color } = req.body;
    try {
      await pool.query(`
        INSERT INTO club_settings (id, club_name, logo_url, banner_url, primary_color, secondary_color)
        VALUES (1, $1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          club_name = EXCLUDED.club_name,
          logo_url = EXCLUDED.logo_url,
          banner_url = EXCLUDED.banner_url,
          primary_color = EXCLUDED.primary_color,
          secondary_color = EXCLUDED.secondary_color
      `, [club_name, logo_url, banner_url, primary_color, secondary_color]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error updating settings' });
    }
  });

  // Appointments (Single & Recurring)
  app.post('/api/admin/appointments', authenticateToken, isAdmin, async (req, res) => {
    const { date, time, location, description, recurring, repetitions } = req.body;
    try {
      const startDate = new Date(date);
      const count = recurring ? Math.min(repetitions || 1, 12) : 1;
      
      for (let i = 0; i < count; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + (i * 28)); // Every 4 weeks
        await pool.query(
          'INSERT INTO appointments (date, time, location, description) VALUES ($1, $2, $3, $4)',
          [currentDate.toISOString().split('T')[0], time, location, description]
        );
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error creating appointments' });
    }
  });

  // Cash & Stats Management
  app.get('/api/admin/sessions', authenticateToken, isAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT s.*, m.name as member_name 
        FROM kv_sessions s 
        JOIN members m ON s.member_id = m.id 
        WHERE (m.username IS NULL OR m.username != 'admin') AND m.name NOT IN ('Administrator', 'Administratot')
        ORDER BY s.date DESC
      `);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: 'Error fetching sessions' });
    }
  });

  app.post('/api/admin/sessions', authenticateToken, isAdmin, async (req, res) => {
    const { member_id, date, pudel, gewonnen, verloren, klingeln, spende, gezahlt } = req.body;
    try {
      await pool.query(`
        INSERT INTO kv_sessions (member_id, date, pudel, gewonnen, verloren, klingeln, spende, gezahlt)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [member_id, date, pudel, gewonnen, verloren, klingeln || 0, spende, gezahlt]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error creating session' });
    }
  });

  app.put('/api/admin/sessions/:id', authenticateToken, isAdmin, async (req, res) => {
    const { pudel, gewonnen, verloren, klingeln, spende, gezahlt } = req.body;
    try {
      await pool.query(`
        UPDATE kv_sessions 
        SET pudel = $1, gewonnen = $2, verloren = $3, klingeln = $4, spende = $5, gezahlt = $6 
        WHERE id = $7
      `, [pudel, gewonnen, verloren, klingeln || 0, spende, gezahlt, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error updating session' });
    }
  });

  app.delete('/api/admin/sessions/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
      await pool.query('DELETE FROM kv_sessions WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error deleting session' });
    }
  });

  // --- HELPERS ---
  const validateNumber = (val: any, min = 0) => {
    const n = parseFloat(val);
    return !isNaN(n) && n >= min;
  };

  // Admin: Cash Booking
  app.post('/api/admin/cash', authenticateToken, isAdmin, async (req, res) => {
    const { member_id, amount, description, spende } = req.body;
    
    if (!member_id || !validateNumber(amount)) {
      return res.status(400).json({ error: 'Ungültige Eingabe: Mitglied und positiver Betrag erforderlich.' });
    }

    try {
      await pool.query('BEGIN');
      await pool.query(
        'INSERT INTO cash_transactions (member_id, amount, description, type) VALUES ($1, $2, $3, $4)',
        [member_id, amount, description, spende ? 'spende' : 'beitrag']
      );
      
      if (spende) {
        await pool.query('UPDATE cash_register SET total_donations = total_donations + $1 WHERE member_id = $2', [amount, member_id]);
      } else {
        await pool.query('UPDATE cash_register SET open_amount = open_amount + $1 WHERE member_id = $2', [amount, member_id]);
      }
      
      await pool.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error('Error booking cash:', err);
      res.status(500).json({ error: 'Error booking cash' });
    }
  });

  // Admin: Stats Update
  app.put('/api/admin/members/:id/stats', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { pudel, gewonnen, verloren, abwesend, klingeln } = req.body;
    
    if (!validateNumber(pudel) || !validateNumber(gewonnen) || !validateNumber(verloren) || !validateNumber(abwesend) || !validateNumber(klingeln)) {
      return res.status(400).json({ error: 'Statistiken dürfen nicht negativ sein.' });
    }

    try {
      await pool.query(
        'UPDATE members SET pudel = $1, gewonnen = $2, verloren = $3, abwesend = $4, klingeln = $5 WHERE id = $6',
        [pudel, gewonnen, verloren, abwesend, klingeln, id]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error updating stats' });
    }
  });

  // Password Reset
  app.post('/api/auth/reset-password', async (req, res) => {
    const { username, newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein.' });
    }

    try {
      const result = await pool.query('SELECT * FROM members WHERE username = $1', [username]);
      const user = result.rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE members SET password = $1 WHERE username = $2', [hashedPassword, username]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error resetting password' });
    }
  });

  // --- CHAT API ---
  app.post('/api/chat/upload', authenticateToken, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      
      const fileName = `chat_${Date.now()}_${req.file.originalname}`;
      const uploadPath = path.join(process.cwd(), 'public', 'uploads', fileName);
      
      if (!fs.existsSync(path.join(process.cwd(), 'public', 'uploads'))) {
        fs.mkdirSync(path.join(process.cwd(), 'public', 'uploads'), { recursive: true });
      }

      fs.writeFileSync(uploadPath, req.file.buffer);
      res.json({ url: `/uploads/${fileName}` });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  app.get('/api/chat/messages', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT m.id, m.content, m.image_url, m.created_at, mem.name as user_name, mem.id as user_id
        FROM chat_messages m
        JOIN members mem ON m.member_id = mem.id
        ORDER BY m.created_at DESC
        LIMIT 50
      `);
      res.json(result.rows.reverse());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error fetching messages' });
    }
  });

  app.delete('/api/chat/messages/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const memberId = req.user.id;
      const isAdmin = req.user.role === 'admin';

      // Check ownership
      const check = await pool.query('SELECT member_id FROM chat_messages WHERE id = $1', [id]);
      if (check.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
      
      if (check.rows[0].member_id !== memberId && !isAdmin) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      await pool.query('DELETE FROM chat_messages WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error deleting message' });
    }
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      root: process.cwd(),
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get(/^\/(?!api).*/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request entity too large' });
    }
    res.status(500).json({ error: 'Internal Server Error' });
  });

  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    socket.on('join_chat', () => {
      socket.join('global_chat');
    });

    socket.on('send_message', async (data) => {
      const { member_id, content, image_url } = data;
      try {
        const result = await pool.query(
          'INSERT INTO chat_messages (member_id, content, image_url) VALUES ($1, $2, $3) RETURNING id, created_at',
          [member_id, content || null, image_url || null]
        );
        
        const userResult = await pool.query('SELECT name FROM members WHERE id = $1', [member_id]);
        const userName = userResult.rows[0].name;

        const newMessage = {
          id: result.rows[0].id,
          content,
          image_url,
          created_at: result.rows[0].created_at,
          user_name: userName,
          user_id: member_id
        };

        io.to('global_chat').emit('receive_message', newMessage);

        // Send push notifications to all other members
        const subscriptions = await pool.query('SELECT endpoint, p256dh, auth, member_id FROM push_subscriptions WHERE member_id != $1', [member_id]);
        
        if (subscriptions.rows.length > 0) {
          const payload = JSON.stringify({
            title: `Neue Nachricht von ${userName}`,
            body: content || (image_url ? '📷 Bild empfangen' : ''),
            url: `/chat`
          });

          for (const sub of subscriptions.rows) {
            try {
              await webPush.sendNotification({
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
              }, payload);
            } catch (err: any) {
              if (err.statusCode === 410) {
                await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error saving message:', err);
      }
    });

    socket.on('delete_message', (messageId) => {
      io.to('global_chat').emit('message_deleted', messageId);
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
