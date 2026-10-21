#!/usr/bin/env node
// npm run icons — renders the PWA PNG icons from client/public/*.svg with sharp.
// The PNGs are committed; run this again only after changing the SVGs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/public');
const jobs = [
  { src: 'favicon.svg', out: 'pwa-192.png', size: 192 },
  { src: 'favicon.svg', out: 'pwa-512.png', size: 512 },
  { src: 'icon-source.svg', out: 'pwa-maskable-512.png', size: 512 },
  { src: 'icon-source.svg', out: 'apple-touch-icon.png', size: 180 },
];
for (const { src, out, size } of jobs) {
  await sharp(path.join(pub, src), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(pub, out));
  console.log(`client/public/${out} (${size}x${size})`);
}
