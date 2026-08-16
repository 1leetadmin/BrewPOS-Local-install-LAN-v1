// ============================================================================
// server/local-auth.js
//
// Fully local admin login. Replaces Base44's email/password + Google OAuth.
// Password hashed with Node's built-in crypto (PBKDF2) — no bcrypt/native
// module needed. Session tokens are random strings kept in memory + written
// to disk so a server restart doesn't log everyone out mid-shift.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_ROOT } = require('./data-root');

const DATA_DIR = DATA_ROOT;
const ADMIN_FILE = path.join(DATA_DIR, '_local_admin.json');
const SESSIONS_FILE = path.join(DATA_DIR, '_local_sessions.json');

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin'; // Changed on first login — see forceReset below.

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, useSalt, 100000, 64, 'sha512').toString('hex');
  return { salt: useSalt, hash };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
}

function loadAdmin() {
  ensureDataDir();
  if (!fs.existsSync(ADMIN_FILE)) {
    // First run: create the default local admin account.
    const { salt, hash } = hashPassword(DEFAULT_ADMIN_PASSWORD);
    const admin = {
      id: 'local-admin',
      email: DEFAULT_ADMIN_USERNAME,
      full_name: 'Admin',
      role: 'admin',
      salt,
      hash,
      must_change_password: true,
    };
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(admin, null, 2));
    return admin;
  }
  return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
}

function saveAdmin(admin) {
  ensureDataDir();
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(admin, null, 2));
}

function loadSessions() {
  ensureDataDir();
  if (!fs.existsSync(SESSIONS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveSessions(sessions) {
  ensureDataDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

const LocalAuth = {
  // { email, password } -> { token, user } or throws
  login(email, password) {
    const admin = loadAdmin();
    if (email.trim().toLowerCase() !== admin.email.toLowerCase()) {
      throw new Error('Invalid email or password');
    }
    if (!verifyPassword(password, admin.salt, admin.hash)) {
      throw new Error('Invalid email or password');
    }
    const token = crypto.randomBytes(32).toString('hex');
    const sessions = loadSessions();
    sessions[token] = { userId: admin.id, createdAt: Date.now() };
    saveSessions(sessions);
    const { salt, hash, ...publicUser } = admin;
    return { token, user: { ...publicUser, must_change_password: !!admin.must_change_password } };
  },

  me(token) {
    if (!token) throw new Error('Not authenticated');
    const sessions = loadSessions();
    if (!sessions[token]) throw new Error('Session expired');
    const admin = loadAdmin();
    const { salt, hash, ...publicUser } = admin;
    return publicUser;
  },

  logout(token) {
    const sessions = loadSessions();
    delete sessions[token];
    saveSessions(sessions);
    return { success: true };
  },

  changePassword(token, newPassword) {
    if (!token) throw new Error('Not authenticated');
    const sessions = loadSessions();
    if (!sessions[token]) throw new Error('Session expired');
    const admin = loadAdmin();
    const { salt, hash } = hashPassword(newPassword);
    admin.salt = salt;
    admin.hash = hash;
    admin.must_change_password = false;
    saveAdmin(admin);
    return { success: true };
  },
};

module.exports = LocalAuth;
