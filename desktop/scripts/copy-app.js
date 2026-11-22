// Copies the web app (../site/app and ../site/assets) into ./app for packaging
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', '..', 'site'), dst = path.join(__dirname, '..', 'app');
fs.rmSync(dst, { recursive: true, force: true });
for (const d of ['app', 'assets']) fs.cpSync(path.join(src, d), path.join(dst, d), { recursive: true });
console.log('Copied web app into', dst);
