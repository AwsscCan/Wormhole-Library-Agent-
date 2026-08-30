import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "desktop", "assets", "icon.svg");
const output = path.join(root, "desktop", "assets", "icon.ico");
const pngOutput = path.join(root, "desktop", "assets", "icon.png");
const appIconOutput = path.join(root, "app", "icon.png");
const sizes = [16, 24, 32, 48, 64, 128, 256];

await mkdir(path.dirname(output), { recursive: true });
const svg = await readFile(source);
const images = await Promise.all(sizes.map((size) => sharp(svg)
  .resize(size, size, { fit: "contain" })
  .png({ compressionLevel: 9 })
  .toBuffer()));

const headerSize = 6 + (16 * images.length);
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);

let offset = headerSize;
images.forEach((image, index) => {
  const size = sizes[index];
  const entry = 6 + (index * 16);
  header.writeUInt8(size === 256 ? 0 : size, entry);
  header.writeUInt8(size === 256 ? 0 : size, entry + 1);
  header.writeUInt8(0, entry + 2);
  header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});

await writeFile(output, Buffer.concat([header, ...images]));
const appIcon = await sharp(svg).resize(512, 512, { fit: "contain" }).png({ compressionLevel: 9 }).toBuffer();
await writeFile(pngOutput, appIcon);
await writeFile(appIconOutput, appIcon);
console.log(output);
