const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = [
  path.join(ROOT, 'src', 'components'),
  path.join(ROOT, 'src', 'services'),
  path.join(ROOT, 'src', 'views'),
  path.join(ROOT, 'src', 'utils'),
];

const STANDARD_GLOBALS = new Set([
  // JS standard built-ins
  'Array', 'ArrayBuffer', 'AsyncFunction', 'Atomics', 'BigInt', 'BigInt64Array', 'BigUint64Array',
  'Boolean', 'DataView', 'Date', 'Error', 'EvalError', 'Float32Array', 'Float64Array', 'Function',
  'Generator', 'GeneratorFunction', 'Infinity', 'Int16Array', 'Int32Array', 'Int8Array', 'InternalError',
  'Intl', 'JSON', 'Map', 'Math', 'NaN', 'Number', 'Object', 'Promise', 'Proxy', 'RangeError',
  'ReferenceError', 'Reflect', 'RegExp', 'Set', 'SharedArrayBuffer', 'String', 'Symbol', 'SyntaxError',
  'TypeError', 'URIError', 'Uint16Array', 'Uint32Array', 'Uint8Array', 'Uint8ClampedArray', 'WeakMap',
  'WeakSet', 'WebAssembly', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent',
  'escape', 'eval', 'globalThis', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'undefined', 'unescape',
  // Browser globals
  'window', 'document', 'navigator', 'screen', 'location', 'history', 'localStorage', 'sessionStorage',
  'console', 'fetch', 'Response', 'Request', 'Headers', 'AbortController', 'AbortSignal',
  'Blob', 'File', 'FileList', 'FileReader', 'FormData', 'URL', 'URLSearchParams',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  'alert', 'confirm', 'prompt', 'open', 'close', 'scrollTo', 'scrollBy', 'focus', 'blur',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'postMessage',
  'CustomEvent', 'Event', 'EventTarget', 'MessageEvent', 'MouseEvent', 'KeyboardEvent', 'UIEvent', 'StorageEvent',
  'IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'PerformanceObserver', 'EventSource',
  'performance', 'crypto', 'btoa', 'atob', 'indexedDB', 'caches', 'Notification',
  'WebSocket', 'Worker', 'SharedWorker', 'ServiceWorker', 'MessageChannel', 'Audio', 'Image',
  'CanvasRenderingContext2D', 'HTMLCanvasElement', 'HTMLElement', 'Element', 'Node', 'Document',
  'DOMParser', 'XMLSerializer', 'MutationRecord', 'XPathResult', 'TextEncoder', 'TextDecoder',
  // Node globals
  'process', 'global', 'Buffer', 'module', 'exports', 'require', '__dirname', '__filename',
  // React / Vite globals
  'React', 'JSX', 'NodeJS', 'import', 'arguments'
]);

// Recursively find all files in target directories
function getSourceFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getSourceFiles(fullPath));
    } else if (/\.(jsx?|tsx?)$/.test(file)) {
      results.push(fullPath);
    }
  }
  return results;
}

// Check if a path is inside a TypeScript type annotation / declaration
function isTypeContext(idPath) {
  let curr = idPath;
  while (curr) {
    if (
      curr.isTSType() ||
      curr.isTSTypeAnnotation() ||
      curr.isTSTypeReference() ||
      curr.isTSInterfaceDeclaration() ||
      curr.isTSTypeAliasDeclaration() ||
      curr.isTSTypeParameter() ||
      curr.isTSTypeParameterDeclaration() ||
      curr.isTSTypeQuery() ||
      curr.isTSAsExpression() && curr.node.typeAnnotation === idPath.node ||
      curr.isTSTypeAssertion() && curr.node.typeAnnotation === idPath.node
    ) {
      return true;
    }
    curr = curr.parentPath;
  }
  return false;
}

const auditResults = {
  undeclaredIdentifiers: [],
  missingImports: [],
  syntaxErrors: [],
  scannedCount: 0
};

const allFiles = TARGET_DIRS.flatMap(getSourceFiles);
auditResults.scannedCount = allFiles.length;

console.log(`Starting static sentinel audit over ${allFiles.length} files...`);

for (const filePath of allFiles) {
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const code = fs.readFileSync(filePath, 'utf8');

  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'dynamicImport',
        'optionalChaining',
        'nullishCoalescingOperator',
        'exportDefaultFrom'
      ]
    });
  } catch (err) {
    auditResults.syntaxErrors.push({
      file: relPath,
      line: err.loc ? err.loc.line : null,
      message: err.message
    });
    continue;
  }

  // 1. Check imports resolution
  traverse(ast, {
    ImportDeclaration(p) {
      const source = p.node.source.value;
      if (source.startsWith('.')) {
        // Resolve local file
        const dir = path.dirname(filePath);
        const resolvedBase = path.resolve(dir, source);
        const possibleExtensions = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
        const found = possibleExtensions.some(ext => fs.existsSync(resolvedBase + ext));
        if (!found) {
          auditResults.missingImports.push({
            file: relPath,
            line: p.node.loc.start.line,
            source,
            resolvedBase
          });
        }
      }
    },

    // 2. Check undeclared identifiers in runtime code
    Identifier(p) {
      // Must be a referenced identifier (not property key, not declaration, not label)
      if (!p.isReferencedIdentifier()) return;

      // Skip type contexts
      if (isTypeContext(p)) return;

      const name = p.node.name;

      // Skip standard globals
      if (STANDARD_GLOBALS.has(name)) return;

      // Skip JSX closing tag or member expression non-object (e.g. obj.name -> name is not referenced as standalone)
      if (p.parentPath.isMemberExpression() && p.parentKey === 'property' && !p.parentPath.node.computed) {
        return;
      }
      if (p.parentPath.isOptionalMemberExpression() && p.parentKey === 'property' && !p.parentPath.node.computed) {
        return;
      }
      if (p.parentPath.isObjectProperty() && p.parentKey === 'key' && !p.parentPath.node.computed) {
        return;
      }

      // Check if identifier has a binding in its scope chain
      if (!p.scope.hasBinding(name)) {
        auditResults.undeclaredIdentifiers.push({
          file: relPath,
          line: p.node.loc.start.line,
          column: p.node.loc.start.column,
          name
        });
      }
    }
  });
}

// Group undeclared by file and name
const groupedUndeclared = {};
for (const item of auditResults.undeclaredIdentifiers) {
  const key = `${item.file}:${item.name}`;
  if (!groupedUndeclared[key]) {
    groupedUndeclared[key] = {
      file: item.file,
      name: item.name,
      lines: [item.line]
    };
  } else {
    groupedUndeclared[key].lines.push(item.line);
  }
}

console.log('\n================ AUDIT SUMMARY ================');
console.log(`Total files scanned: ${auditResults.scannedCount}`);
console.log(`Syntax errors: ${auditResults.syntaxErrors.length}`);
console.log(`Missing import files: ${auditResults.missingImports.length}`);
console.log(`Undeclared identifier occurrences: ${auditResults.undeclaredIdentifiers.length}`);
console.log(`Unique undeclared identifier entries: ${Object.keys(groupedUndeclared).length}`);

if (auditResults.syntaxErrors.length > 0) {
  console.log('\n--- SYNTAX ERRORS ---');
  console.log(JSON.stringify(auditResults.syntaxErrors, null, 2));
}

if (auditResults.missingImports.length > 0) {
  console.log('\n--- MISSING IMPORT FILES ---');
  console.log(JSON.stringify(auditResults.missingImports, null, 2));
}

if (Object.keys(groupedUndeclared).length > 0) {
  console.log('\n--- UNDECLARED IDENTIFIERS ---');
  for (const item of Object.values(groupedUndeclared)) {
    console.log(`[${item.file}] '${item.name}' at line(s): ${item.lines.join(', ')}`);
  }
}
