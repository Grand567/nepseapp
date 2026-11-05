const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = [
  path.join(ROOT, 'src', 'components'),
  path.join(ROOT, 'src', 'views'),
];

function getSourceFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) results = results.concat(getSourceFiles(fullPath));
    else if (/\.(jsx?|tsx?)$/.test(file)) results.push(fullPath);
  }
  return results;
}

const allFiles = TARGET_DIRS.flatMap(getSourceFiles);
const unhandledAsync = [];

for (const file of allFiles) {
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'classProperties', 'dynamicImport', 'optionalChaining', 'nullishCoalescingOperator', 'exportDefaultFrom']
    });
  } catch (_) { continue; }

  traverse(ast, {
    Function(p) {
      if (!p.node.async) return;
      if (!p.node.body || p.node.body.type !== 'BlockStatement') return;
      
      let hasAwait = false;
      p.traverse({
        AwaitExpression() { hasAwait = true; }
      });
      if (!hasAwait) return;

      let hasTry = false;
      for (const stmt of p.node.body.body) {
        if (stmt.type === 'TryStatement') hasTry = true;
      }

      if (!hasTry) {
        let unhandledAwait = false;
        p.traverse({
          AwaitExpression(ap) {
            let insideTry = false;
            let parent = ap.parentPath;
            while (parent && parent !== p) {
              if (parent.isTryStatement()) { insideTry = true; break; }
              parent = parent.parentPath;
            }
            if (!insideTry) unhandledAwait = true;
          }
        });
        if (unhandledAwait) {
          unhandledAsync.push({
            file: path.relative(ROOT, file).replace(/\\/g, '/'),
            line: p.node.loc.start.line
          });
        }
      }
    }
  });
}

console.log('Async functions with unhandled await in UI components:', unhandledAsync.length);
for (const item of unhandledAsync) {
  console.log(`- ${item.file}:${item.line}`);
}
