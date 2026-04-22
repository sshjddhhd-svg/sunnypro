const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const fcaNestedModules = path.join(
  __dirname, '..', 'node_modules', '@dongdev', 'fca-unofficial', 'node_modules'
);

function patchGradientString() {
  const targetDir = path.join(fcaNestedModules, 'gradient-string');
  if (!fs.existsSync(targetDir)) return;

  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  if (pkg.version === '2.0.2') {
    console.log('[postinstall] gradient-string already patched to v2.0.2.');
    return;
  }

  console.log(`[postinstall] Replacing gradient-string v${pkg.version} (ESM) with CJS v2.0.2...`);
  const tmpDir = path.join(require('os').tmpdir(), 'gradient-fix-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  execSync('npm install gradient-string@2.0.2 --no-save', { cwd: tmpDir, stdio: 'pipe' });
  const srcDir = path.join(tmpDir, 'node_modules', 'gradient-string');
  execSync(`cp -r ${srcDir}/. ${targetDir}/`, { stdio: 'pipe' });
  console.log('[postinstall] gradient-string patched to CJS v2.0.2.');
}

function removeNestedEsmChalk() {
  const chalkDir = path.join(fcaNestedModules, 'chalk');
  if (!fs.existsSync(chalkDir)) {
    console.log('[postinstall] Nested ESM chalk not present, skipping removal.');
    return;
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(chalkDir, 'package.json'), 'utf8'));
  if (pkg.type === 'module') {
    execSync(`rm -rf ${chalkDir}`, { stdio: 'pipe' });
    console.log(`[postinstall] Removed nested ESM chalk v${pkg.version} (will fall back to root CJS chalk).`);
  }
}

try {
  if (!fs.existsSync(fcaNestedModules)) {
    console.log('[postinstall] FCA nested node_modules not found, skipping.');
    process.exit(0);
  }
  patchGradientString();
  removeNestedEsmChalk();
} catch (e) {
  console.log('[postinstall] patch error (non-fatal):', e.message);
}
