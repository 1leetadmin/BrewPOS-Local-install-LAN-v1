import QRCode from 'qrcode';
import { useState, useEffect } from 'react';

export async function generateQrDataUrl(text, size = 100) {
  if (!text) return '';
  try {
    return await QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch {
    return '';
  }
}

export function useQrCode(text, size = 100) {
  const [dataUrl, setDataUrl] = useState('');
  useEffect(() => {
    let active = true;
    generateQrDataUrl(text, size).then(url => {
      if (active) setDataUrl(url);
    });
    return () => { active = false; };
  }, [text, size]);
  return dataUrl;
}

// Resolve the selected QR code from the settings library to a data URL.
// Used by the print path (async).
export async function resolveQrDataUrl(settings) {
  if (!settings?.label_qr_enabled || !settings?.label_qr_id) return '';
  const qr = (settings.qr_codes || []).find(q => q.id === settings.label_qr_id);
  if (!qr) return '';
  if (qr.type === 'image') return qr.image_url || '';
  return generateQrDataUrl(qr.text || '', 120);
}

// Resolve the raw QR text for ESC/POS native QR code generation (BLE/USB/LAN).
// Returns '' for image-type QR codes (ESC/POS can't print arbitrary images natively).
export function resolveQrText(settings) {
  if (!settings?.label_qr_enabled || !settings?.label_qr_id) return '';
  const qr = (settings.qr_codes || []).find(q => q.id === settings.label_qr_id);
  if (!qr) return '';
  if (qr.type === 'image') return '';
  return qr.text || '';
}

// Hook version for React components — resolves the selected QR code
// from the settings library (image URL directly, or generated from text).
export function useSettingsQrCode(settings) {
  const qr = (settings?.qr_codes || []).find(q => q.id === settings?.label_qr_id);
  const text = settings?.label_qr_enabled && qr?.type === 'text' ? (qr.text || '') : '';
  const imageUrl = settings?.label_qr_enabled && qr?.type === 'image' ? (qr.image_url || '') : '';
  const generated = useQrCode(text, 120);
  return imageUrl || generated;
}