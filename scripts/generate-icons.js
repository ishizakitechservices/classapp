import fs from 'fs';
import zlib from 'zlib';

function createPNG(width, height, r, g, b, a = 255) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdr = makeChunk('IHDR', ihdrData);

  // Raw pixel data: each scanline starts with filter byte 0
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter byte: None

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      // Draw rounded background and graduation cap emblem in monochrome
      const cx = width / 2;
      const cy = height / 2;
      const radius = width * 0.45;
      const dist = Math.hypot(x - cx, y - cy);

      // Emblem logic
      const inCapTop = (Math.abs(x - cx) * 0.5 + Math.abs(y - (cy - height * 0.1))) < width * 0.25 && y < cy + height * 0.05;
      const inCapBody = Math.abs(x - cx) < width * 0.22 && y >= cy && y <= cy + height * 0.22;

      if (dist < radius) {
        if (inCapTop || inCapBody) {
          rawData[pixelOffset] = 255;
          rawData[pixelOffset + 1] = 255;
          rawData[pixelOffset + 2] = 255;
          rawData[pixelOffset + 3] = 255;
        } else {
          rawData[pixelOffset] = 16;
          rawData[pixelOffset + 1] = 16;
          rawData[pixelOffset + 2] = 16;
          rawData[pixelOffset + 3] = 255;
        }
      } else {
        rawData[pixelOffset] = 16;
        rawData[pixelOffset + 1] = 16;
        rawData[pixelOffset + 2] = 16;
        rawData[pixelOffset + 3] = 255;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  table[i] = c;
}

// Write the files
fs.writeFileSync('public/pwa-192x192.png', createPNG(192, 192, 16, 16, 16));
fs.writeFileSync('public/pwa-512x512.png', createPNG(512, 512, 16, 16, 16));
fs.writeFileSync('public/pwa-maskable-512x512.png', createPNG(512, 512, 16, 16, 16));
fs.writeFileSync('public/apple-touch-icon.png', createPNG(180, 180, 16, 16, 16));
console.log('Generated PWA PNG icon assets successfully');
