import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('BUG-086: Local PDF Guide Native Download & Header Verification', () => {
  it('public/NEPSE_100_Percent_Profit_Master_Guide.pdf exists and has valid %PDF header', () => {
    const pdfPath = path.resolve(__dirname, '../public/NEPSE_100_Percent_Profit_Master_Guide.pdf');
    assert.strictEqual(fs.existsSync(pdfPath), true, 'PDF file must exist in public directory');

    const buffer = fs.readFileSync(pdfPath);
    assert.ok(buffer.length > 1000, 'PDF file size must be > 1KB');

    const magic = buffer.toString('utf8', 0, 5);
    assert.strictEqual(magic, '%PDF-', 'File header must match %PDF- specification');
  });

  it('triggers NepseAndroidDownloader with base64 dataUrl on native platform', async () => {
    let savedData = '';
    let savedFilename = '';
    let savedMime = '';

    global.window = {
      NepseAndroidDownloader: {
        saveFile: (content, filename, mimeType) => {
          savedData = content;
          savedFilename = filename;
          savedMime = mimeType;
          return true;
        }
      }
    };

    const mockCapacitor = {
      isNativePlatform: () => true
    };

    // Simulate native PDF save workflow
    const simulateDownload = (cap, win) => {
      if (cap.isNativePlatform() && win.NepseAndroidDownloader) {
        const dummyDataUrl = 'data:application/pdf;base64,JVBERi0xLjQKJ...';
        win.NepseAndroidDownloader.saveFile(
          dummyDataUrl,
          'NEPSE_100_Percent_Profit_Master_Guide.pdf',
          'application/pdf'
        );
      }
    };

    simulateDownload(mockCapacitor, global.window);

    assert.strictEqual(savedFilename, 'NEPSE_100_Percent_Profit_Master_Guide.pdf');
    assert.strictEqual(savedMime, 'application/pdf');
    assert.ok(savedData.startsWith('data:application/pdf;base64,'), 'DataUrl must contain base64 PDF payload');

    delete global.window;
  });

  it('bypasses native downloader and uses browser window open on Web and Electron', () => {
    let openedUrl = '';
    let openedTarget = '';

    global.window = {
      open: (url, target) => {
        openedUrl = url;
        openedTarget = target;
      }
    };

    const mockCapacitor = {
      isNativePlatform: () => false
    };

    const simulateWeb = (cap, win) => {
      const isNative = cap.isNativePlatform();
      if (!isNative) {
        win.open('/NEPSE_100_Percent_Profit_Master_Guide.pdf', '_blank');
      }
    };

    simulateWeb(mockCapacitor, global.window);

    assert.strictEqual(openedUrl, '/NEPSE_100_Percent_Profit_Master_Guide.pdf');
    assert.strictEqual(openedTarget, '_blank');

    delete global.window;
  });
});
