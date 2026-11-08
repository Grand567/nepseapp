import { describe, it } from 'node:test';
import assert from 'node:assert';
import { triggerFileDownload } from '../src/utils/fileExport.js';

describe('BUG-081: Native File Export Bridge Verification', () => {
  it('calls NepseAndroidDownloader.saveFile when running inside Android WebView', () => {
    let savedContent = '';
    let savedFilename = '';
    let savedMime = '';

    global.window = {
      NepseAndroidDownloader: {
        saveFile: (content, filename, mimeType) => {
          savedContent = content;
          savedFilename = filename;
          savedMime = mimeType;
          return true;
        }
      }
    };
    global.document = {};

    const testPayload = JSON.stringify({ test: 'whale_archive_data' });
    const testName = 'whale_archive.json';
    const ok = triggerFileDownload(testPayload, testName, 'application/json');

    assert.strictEqual(ok, true, 'Export should succeed via native bridge');
    assert.strictEqual(savedContent, testPayload, 'Content should match');
    assert.strictEqual(savedFilename, testName, 'Filename should match');
    assert.strictEqual(savedMime, 'application/json', 'Mime type should match');

    // Clean up globals
    delete global.window;
    delete global.document;
  });

  it('falls back to DOM link download when running in browser or Electron', () => {
    const originalURL = global.URL;
    let appended = false;
    let clicked = false;
    let removed = false;
    let createdUrl = '';

    global.URL = {
      createObjectURL: () => 'blob:http://localhost/test-uuid',
      revokeObjectURL: (url) => { createdUrl = url; }
    };

    global.document = {
      createElement: (tag) => {
        return {
          tagName: tag,
          href: '',
          setAttribute: (attr, val) => {},
          click: () => { clicked = true; }
        };
      },
      body: {
        appendChild: () => { appended = true; },
        removeChild: () => { removed = true; }
      }
    };
    global.window = {};

    const testPayload = 'csv,data,row';
    const testName = 'test.csv';
    const ok = triggerFileDownload(testPayload, testName, 'text/csv');

    assert.strictEqual(ok, true, 'Export should succeed via DOM link fallback');
    assert.strictEqual(appended, true, 'DOM element was attached');
    assert.strictEqual(clicked, true, 'Click was invoked');
    assert.strictEqual(removed, true, 'DOM element was removed');

    delete global.window;
    delete global.document;
    if (originalURL) {
      global.URL = originalURL;
    } else {
      delete global.URL;
    }
  });
});
