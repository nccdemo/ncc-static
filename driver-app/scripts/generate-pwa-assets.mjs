import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

function hexToRgb(hex) {
  const h = hex.replace('#', '').trim()
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function lerpColor(c1, c2, t) {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ]
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

function crc32(buf) {
  // Minimal CRC32 implementation for PNG chunks
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  const crc = crc32(Buffer.concat([typeBuf, data]))
  crcBuf.writeUInt32BE(crc, 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function writePng(path, w, h, rgba) {
  // PNG: 8-bit RGBA, no interlace.
  // Each scanline: filter byte 0 + RGBA bytes
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const idat = deflateSync(raw, { level: 9 })
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])

  ensureDir(dirname(path))
  writeFileSync(path, png)
}

function makeCanvas(w, h, fill) {
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4 + 0] = fill[0]
    rgba[i * 4 + 1] = fill[1]
    rgba[i * 4 + 2] = fill[2]
    rgba[i * 4 + 3] = 255
  }
  return { w, h, rgba }
}

function setPixel(canvas, x, y, rgb, a = 255) {
  if (x < 0 || y < 0 || x >= canvas.w || y >= canvas.h) return
  const idx = (y * canvas.w + x) * 4
  canvas.rgba[idx + 0] = rgb[0]
  canvas.rgba[idx + 1] = rgb[1]
  canvas.rgba[idx + 2] = rgb[2]
  canvas.rgba[idx + 3] = a
}

function fillRect(canvas, x, y, w, h, rgb, a = 255) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPixel(canvas, xx, yy, rgb, a)
  }
}

// Tiny 5x7 font (only needed chars)
const FONT_5X7 = {
  N: [
    '10001',
    '11001',
    '10101',
    '10011',
    '10001',
    '10001',
    '10001',
  ],
  C: [
    '01110',
    '10001',
    '10000',
    '10000',
    '10000',
    '10001',
    '01110',
  ],
  D: [
    '11110',
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '11110',
  ],
  R: [
    '11110',
    '10001',
    '10001',
    '11110',
    '10100',
    '10010',
    '10001',
  ],
  I: [
    '11111',
    '00100',
    '00100',
    '00100',
    '00100',
    '00100',
    '11111',
  ],
  V: [
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '01010',
    '00100',
  ],
  E: [
    '11111',
    '10000',
    '10000',
    '11110',
    '10000',
    '10000',
    '11111',
  ],
}

function drawText(canvas, text, x, y, scale, rgb) {
  const chars = text.split('')
  let cx = x
  for (const ch of chars) {
    if (ch === ' ') {
      cx += 6 * scale
      continue
    }
    const glyph = FONT_5X7[ch]
    if (!glyph) {
      cx += 6 * scale
      continue
    }
    for (let gy = 0; gy < glyph.length; gy++) {
      const row = glyph[gy]
      for (let gx = 0; gx < row.length; gx++) {
        if (row[gx] === '1') {
          fillRect(canvas, cx + gx * scale, y + gy * scale, scale, scale, rgb)
        }
      }
    }
    cx += 6 * scale // 5px + 1px spacing
  }
}

function radialGradientBg(canvas, topHex, bottomHex) {
  const top = hexToRgb(topHex)
  const bottom = hexToRgb(bottomHex)
  const cx = canvas.w / 2
  const cy = 0
  const maxD = Math.hypot(cx, canvas.h - cy)
  for (let y = 0; y < canvas.h; y++) {
    for (let x = 0; x < canvas.w; x++) {
      const d = Math.hypot(x - cx, y - cy)
      const t = clamp01(d / maxD)
      const rgb = lerpColor(top, bottom, t)
      setPixel(canvas, x, y, rgb, 255)
    }
  }
}

function makeIcon(size, outPath) {
  const bg = hexToRgb('#0b0f14')
  const blue = hexToRgb('#2563eb')
  const white = hexToRgb('#f9fafb')
  const canvas = makeCanvas(size, size, bg)

  // Text scale tuned per size
  const scale = Math.max(8, Math.floor(size / 32))
  const text = 'NCC'
  const textW = text.length * 6 * scale - 1 * scale
  const textH = 7 * scale
  const x = Math.round((size - textW) / 2)
  const y = Math.round((size - textH) / 2) - Math.round(scale * 0.5)

  drawText(canvas, text, x, y, scale, white)
  // Accent underline
  const lineW = Math.round(textW * 0.78)
  const lineH = Math.max(2, Math.round(scale * 0.6))
  const lineX = Math.round((size - lineW) / 2)
  const lineY = y + textH + Math.round(scale * 0.9)
  fillRect(canvas, lineX, lineY, lineW, lineH, blue)

  writePng(outPath, size, size, canvas.rgba)
}

function makeSplash(w, h, outPath) {
  const canvas = makeCanvas(w, h, [0, 0, 0])
  radialGradientBg(canvas, '#111827', '#020617')

  const blue = hexToRgb('#2563eb')
  const white = hexToRgb('#f9fafb')

  // Logo
  const logoScale = Math.max(10, Math.floor(Math.min(w, h) / 60))
  const logoText = 'NCC'
  const logoW = logoText.length * 6 * logoScale - 1 * logoScale
  const logoH = 7 * logoScale
  const logoX = Math.round((w - logoW) / 2)
  const logoY = Math.round(h * 0.38)
  drawText(canvas, logoText, logoX, logoY, logoScale, white)

  const lineW = Math.round(logoW * 0.74)
  const lineH = Math.max(3, Math.round(logoScale * 0.55))
  const lineX = Math.round((w - lineW) / 2)
  const lineY = logoY + logoH + Math.round(logoScale * 0.9)
  fillRect(canvas, lineX, lineY, lineW, lineH, blue)

  // Subtitle "NCC DRIVER" (simple: draw DRIVER only, keep NCC above)
  const subtitleScale = Math.max(6, Math.floor(logoScale * 0.6))
  const subtitle = 'DRIVER'
  const subW = subtitle.length * 6 * subtitleScale - 1 * subtitleScale
  const subX = Math.round((w - subW) / 2)
  const subY = lineY + Math.round(logoScale * 2.3)
  drawText(canvas, subtitle, subX, subY, subtitleScale, white)

  writePng(outPath, w, h, canvas.rgba)
}

const root = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')
const publicDir = join(root, 'public')
const iconsDir = join(publicDir, 'icons')
ensureDir(iconsDir)

makeIcon(192, join(iconsDir, 'icon-192.png'))
makeIcon(512, join(iconsDir, 'icon-512.png'))
makeIcon(180, join(iconsDir, 'apple-touch-icon.png'))
makeSplash(1170, 2532, join(publicDir, 'splash.png'))

console.log('PWA assets generated in /public')

