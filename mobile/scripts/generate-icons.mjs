import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, '../assets/images/focus_ai_icon.svg');
const svgBuffer = readFileSync(svgPath);
const out = (name) => join(__dirname, '../assets/images', name);

// Main icon — 1024x1024
await sharp(svgBuffer).resize(1024, 1024).png().toFile(out('icon.png'));
console.log('✓ icon.png');

// Splash icon — 200x200 on transparent
await sharp(svgBuffer).resize(200, 200).png().toFile(out('splash-icon.png'));
console.log('✓ splash-icon.png');

// Favicon — 64x64
await sharp(svgBuffer).resize(64, 64).png().toFile(out('favicon.png'));
console.log('✓ favicon.png');

// Android adaptive foreground — 1024x1024, icon scaled to ~66% (safe zone)
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
})
  .composite([{ input: await sharp(svgBuffer).resize(680, 680).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile(out('android-icon-foreground.png'));
console.log('✓ android-icon-foreground.png');

// Android adaptive background — solid #2c694e
await sharp({
  create: { width: 1024, height: 1024, channels: 3, background: { r: 44, g: 105, b: 78 } }
})
  .png()
  .toFile(out('android-icon-background.png'));
console.log('✓ android-icon-background.png');

// Android monochrome — white bullseye on transparent (for themed icons)
const monoSvg = readFileSync(svgPath, 'utf8')
  .replace(/fill="#2c694e"/g, 'fill="#ffffff"')
  .replace(/fill="#b1f0ce"/g, 'fill="#ffffff"')
  .replace(/stroke="#b1f0ce"/g, 'stroke="#ffffff"')
  .replace(/stroke="#a3e2c0"/g, 'stroke="#ffffff"')
  .replace(/fill="#a3e2c0"/g, 'fill="#ffffff"');

await sharp(Buffer.from(monoSvg)).resize(1024, 1024).png().toFile(out('android-icon-monochrome.png'));
console.log('✓ android-icon-monochrome.png');

console.log('\nAll icons generated.');
