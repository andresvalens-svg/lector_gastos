import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const API_BASE = process.env.VITE_API_URL || 'https://lector-gastos.onrender.com';

let js = readFileSync(join(root, 'js/app.js'), 'utf8');
js = js.replace('__API_BASE__', API_BASE);
writeFileSync(join(root, 'js/app.js'), js);
