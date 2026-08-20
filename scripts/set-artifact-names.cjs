// scripts/set-artifact-names.cjs
//
// Sets electron-builder's NSIS/portable artifactName fields, called from CI
// with plain command-line arguments (process.argv) rather than trying to
// embed this logic inline in a shell step — inline node -e strings mixing
// GitHub Actions ${{ }} substitution, PowerShell's own $-escaping rules, and
// JS template literals (${ext}) that must survive all of it is fragile and
// broke in practice (PowerShell doesn't use backslash to escape $ the way
// bash does, so \${ext} didn't reach Node as the literal string intended).
//
// Usage: node scripts/set-artifact-names.cjs <buildId> [vanilla]
const fs = require('fs');

const buildId = process.argv[2];
const isVanilla = process.argv[3] === 'vanilla';

if (!buildId) {
  console.error('Usage: node set-artifact-names.cjs <buildId> [vanilla]');
  process.exit(1);
}

const suffix = isVanilla ? '-Vanilla' : '';
const pkgPath = 'package.json';
const p = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

p.build.nsis.artifactName = `BrewPOS-Pilot-${buildId}${suffix}-Setup.\${ext}`;
p.build.portable.artifactName = `BrewPOS-Pilot-${buildId}${suffix}-Portable.\${ext}`;

fs.writeFileSync(pkgPath, JSON.stringify(p, null, 2) + '\n');
console.log(`Set artifact names for buildId=${buildId}, vanilla=${isVanilla}`);
console.log('nsis.artifactName:', p.build.nsis.artifactName);
console.log('portable.artifactName:', p.build.portable.artifactName);
