// src/utils/fileExport.js
/**
 * Unified cross-platform file download utility.
 * - On Native Android APK WebView: uses window.NepseAndroidDownloader.saveFile() to write directly to Downloads.
 * - On Web Browsers and Desktop Electron: falls back to Blob and DOM <a download> click.
 */
export function triggerFileDownload(content, filename, mimeType = 'text/csv;charset=utf-8;') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  // Native Android APK WebView direct save to Android Downloads folder
  try {
    if (window.NepseAndroidDownloader && typeof window.NepseAndroidDownloader.saveFile === 'function') {
      const strContent = typeof content === 'string' ? content : String(content ?? '');
      const ok = window.NepseAndroidDownloader.saveFile(strContent, filename, mimeType);
      if (ok) return true;
    }
  } catch (_) {}

  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}
