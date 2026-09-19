const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'data', 'genrise.db'));

db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  deadline TEXT,
  link TEXT
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  opportunity_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, opportunity_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(opportunity_id) REFERENCES opportunities(id)
);
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const count = db.prepare('SELECT COUNT(*) AS c FROM opportunities').get().c;
if (count === 0) {
  const insert = db.prepare('INSERT INTO opportunities (title, category, description, deadline, link) VALUES (?, ?, ?, ?, ?)');
  const seed = db.transaction(() => {
    insert.run('Web Development Project Challenge', 'Projects', 'Build a small website and practice HTML, CSS and JavaScript.', 'Open year-round', '#');
    insert.run('Young Innovators Challenge', 'Competitions', 'Share an original idea and explain how it could solve a real problem.', 'Check organizer', '#');
    insert.run('Frontend Learning Track', 'Learning', 'Learn the fundamentals of modern frontend development through guided practice.', 'Open year-round', '#');
    insert.run('Career Exploration Session', 'Career', 'Explore technology careers and the skills commonly used in each role.', 'Check schedule', '#');
  });
  seed();
}

/* A local admin is created automatically if the admins table is empty.
   For deployment, set ADMIN_EMAIL and ADMIN_PASSWORD environment variables. */
const adminCount = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
if (adminCount === 0) {
  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@genrise.local').trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || 'Admin@12345');
  const hash = bcrypt.hashSync(adminPassword, 12);
  db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').run(adminEmail, hash);
  console.log(`Admin account ready: ${adminEmail}`);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in first.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'Admin login required.' });
  next();
}

app.post('/api/signup', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, hash);
    req.session.userId = Number(info.lastInsertRowid);
    req.session.adminId = null;
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'An account with this email already exists.' });
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
  req.session.userId = user.id;
  req.session.adminId = null;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(req.session.userId);
  res.json({ user: user || null });
});

app.get('/api/opportunities', (req, res) => {
  const opportunities = db.prepare('SELECT * FROM opportunities ORDER BY id DESC').all();
  res.json({ opportunities });
});

app.post('/api/opportunities/:id/apply', requireAuth, (req, res) => {
  const opportunityId = Number(req.params.id);
  const opportunity = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(opportunityId);
  if (!opportunity) return res.status(404).json({ error: 'Opportunity not found.' });
  try {
    db.prepare('INSERT INTO applications (user_id, opportunity_id) VALUES (?, ?)').run(req.session.userId, opportunityId);
    res.json({ ok: true, message: 'Opportunity saved to your dashboard.' });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.json({ ok: true, message: 'Already saved to your dashboard.' });
    res.status(500).json({ error: 'Could not save opportunity.' });
  }
});

app.get('/api/my-opportunities', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, a.created_at AS saved_at
    FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
    WHERE a.user_id = ? ORDER BY a.created_at DESC
  `).all(req.session.userId);
  res.json({ opportunities: rows });
});

/* ---------------- ADMIN ---------------- */

app.post('/api/admin/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const admin = db.prepare('SELECT id, email, password_hash FROM admins WHERE email = ?').get(email);
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ error: 'Invalid admin email or password.' });
  }
  req.session.adminId = admin.id;
  req.session.userId = null;
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.adminId = null;
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT id, email, created_at FROM admins WHERE id = ?').get(req.session.adminId);
  res.json({ admin: admin || null });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const opportunities = db.prepare('SELECT COUNT(*) AS count FROM opportunities').get().count;
  const saves = db.prepare('SELECT COUNT(*) AS count FROM applications').get().count;
  res.json({ users, opportunities, saves });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at, COUNT(a.id) AS saved_count
    FROM users u
    LEFT JOIN applications a ON a.user_id = u.id
    GROUP BY u.id
    ORDER BY u.id DESC
  `).all();
  res.json({ users });
});

app.get('/api/admin/applications', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT a.id, a.created_at, u.name AS user_name, u.email AS user_email,
           o.title AS opportunity_title
    FROM applications a
    JOIN users u ON u.id = a.user_id
    JOIN opportunities o ON o.id = a.opportunity_id
    ORDER BY a.id DESC
  `).all();
  res.json({ applications: rows });
});

app.post('/api/admin/opportunities', requireAdmin, (req, res) => {
  const title = String(req.body.title || '').trim();
  const category = String(req.body.category || '').trim();
  const description = String(req.body.description || '').trim();
  const deadline = String(req.body.deadline || '').trim();
  const link = String(req.body.link || '').trim();
  if (!title || !category || !description) return res.status(400).json({ error: 'Title, category and description are required.' });
  const info = db.prepare(`
    INSERT INTO opportunities (title, category, description, deadline, link)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, category, description, deadline, link);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

app.put('/api/admin/opportunities/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const title = String(req.body.title || '').trim();
  const category = String(req.body.category || '').trim();
  const description = String(req.body.description || '').trim();
  const deadline = String(req.body.deadline || '').trim();
  const link = String(req.body.link || '').trim();
  if (!title || !category || !description) return res.status(400).json({ error: 'Title, category and description are required.' });
  const info = db.prepare(`
    UPDATE opportunities SET title = ?, category = ?, description = ?, deadline = ?, link = ?
    WHERE id = ?
  `).run(title, category, description, deadline, link, id);
  if (!info.changes) return res.status(404).json({ error: 'Opportunity not found.' });
  res.json({ ok: true });
});

app.delete('/api/admin/opportunities/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Opportunity not found.' });
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM applications WHERE opportunity_id = ?').run(id);
    db.prepare('DELETE FROM opportunities WHERE id = ?').run(id);
  });
  remove();
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`GenRise running at http://localhost:${PORT}`));
