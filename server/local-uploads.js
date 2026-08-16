// ============================================================================
// server/local-uploads.js
//
// Local file storage for uploaded images (menu item photos, staff photos,
// customer-display slides, etc). Replaces Base44's UploadFile integration —
// files are saved to disk on the POS machine and served back over the local
// server, no internet involved.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_ROOT } = require('./data-root');

const UPLOADS_DIR = path.join(DATA_ROOT, 'uploads', 'files');

function ensureDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function safeExt(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

const LocalUploads = {
  // buffer: raw file bytes, originalName: for extension detection
  save(buffer, originalName, port) {
    ensureDir();
    const id = crypto.randomBytes(10).toString('hex');
    const filename = `${id}${safeExt(originalName)}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
    return {
      file_url: `http://localhost:${port}/uploads/files/${filename}`,
    };
  },

  UPLOADS_DIR,
};

module.exports = LocalUploads;
