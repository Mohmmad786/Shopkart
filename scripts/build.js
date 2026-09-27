const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const outputDir = path.join(projectDir, 'dist');
const files = ['package.json', 'package-lock.json', 'server.js', 'vercel.json', '.env.example'];
const directories = ['public', 'src', 'scripts'];

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(projectDir, file), path.join(outputDir, file));
}

for (const directory of directories) {
  fs.cpSync(path.join(projectDir, directory), path.join(outputDir, directory), { recursive: true });
}

console.log(`Production package created at ${outputDir}`);