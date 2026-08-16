import { base44 } from '@/api/base44Client';

/**
 * Upload an image or video file to cloud storage via the Base44 UploadFile integration.
 * Returns { success, url } on success, or { success: false, error } on failure.
 */
export async function uploadCdsMedia(file) {
  try {
    const result = await base44.integrations.Core.UploadFile({ file });
    if (result?.file_url) {
      return { success: true, url: result.file_url };
    }
    return { success: false, error: 'No file URL returned' };
  } catch (err) {
    return { success: false, error: err.message || 'Upload failed' };
  }
}

/**
 * Build a list of media files currently referenced in the CDS slide config.
 * Each entry includes the URL, filename, and slide title for display.
 */
export function extractMediaFromSlides(slides = []) {
  const media = [];
  for (const slide of slides) {
    if (slide.media_url) {
      media.push({ url: slide.media_url, filename: urlToFilename(slide.media_url), source: slide.title || 'Slide' });
    }
    if (slide.special_image_url) {
      media.push({ url: slide.special_image_url, filename: urlToFilename(slide.special_image_url), source: `${slide.title || 'Slide'} (special)` });
    }
  }
  // De-duplicate by URL
  const seen = new Set();
  return media.filter(m => {
    if (seen.has(m.url)) return false;
    seen.add(m.url);
    return true;
  });
}

function urlToFilename(url) {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split('/').pop() || url);
  } catch {
    return url.split('/').pop() || url;
  }
}