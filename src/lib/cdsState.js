import { base44 } from '@/api/base44Client';

// Mirrors the POS cart + display state into StoreSettings so the public CDS
// (/display) can poll it. Fire-and-forget: the POS is the only writer and the
// CDS only reads, so a failed write just means the CDS updates on the next poll.
export function setCDSDisplay(settingsId, patch) {
  if (!settingsId) return Promise.resolve();
  return base44.entities.StoreSettings.update(settingsId, patch).catch(() => {});
}