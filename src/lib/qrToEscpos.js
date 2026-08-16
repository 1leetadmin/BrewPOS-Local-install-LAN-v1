// Resolves a QR code from store settings to ESC/POS bytes.
// Text-type QR codes use native ESC/POS QR generation (GS ( k).
// Image-type QR codes are rasterized to a 1-bit bitmap via canvas and sent
// using the GS v 0 raster image command — ESC/POS can't print arbitrary
// images natively, so we convert the uploaded QR PNG to printer raster data.

import { buildQrEscPosString } from '@/lib/receiptEscpos';

// Convert an image URL to ESC/POS raster image bytes (GS v 0).
// Returns a latin1 string of ESC/POS control characters.
async function imageToEscposRaster(url, targetWidth = 200) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const aspect = img.height / img.width;
    const width = Math.min(targetWidth, 576); // max ~72mm at 8 dots/mm
    const height = Math.round(width * aspect);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    const widthBytes = Math.ceil(width / 8);
    const rasterData = new Uint8Array(widthBytes * height);

    for (let y = 0; y < height; y++) {
      for (let xByte = 0; xByte < widthBytes; xByte++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = xByte * 8 + bit;
          if (x < width) {
            const idx = (y * width + x) * 4;
            const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
            const lum = r * 0.299 + g * 0.587 + b * 0.114;
            if (lum < 128) byte |= (0x80 >> bit); // dark = 1
          }
        }
        rasterData[y * widthBytes + xByte] = byte;
      }
    }

    // GS v 0 — print raster image, normal mode (m=0)
    const xL = widthBytes & 0xFF;
    const xH = (widthBytes >> 8) & 0xFF;
    const yL = height & 0xFF;
    const yH = (height >> 8) & 0xFF;

    const header = [0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH];
    const allBytes = [...header, ...rasterData];
    return allBytes.map(b => String.fromCharCode(b)).join('');
  } catch {
    return '';
  }
}

// Resolve the QR code from receipt printer settings to ESC/POS bytes.
// Returns '' if no QR code is configured or the QR data is empty.
export async function resolveQrEscpos(settings) {
  const rp = settings?.receipt_printer || {};
  if (!rp.qr_enabled || !rp.qr_id) return '';

  const qr = (settings.qr_codes || []).find(q => q.id === rp.qr_id);
  if (!qr) return '';

  if (qr.type === 'text' && qr.text) {
    return buildQrEscPosString(qr.text, 4);
  }

  if (qr.type === 'image' && qr.image_url) {
    return await imageToEscposRaster(qr.image_url, 200);
  }

  return '';
}