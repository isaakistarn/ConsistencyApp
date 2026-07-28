/**
 * Generates PWA PNG icons (192, 512, apple-touch 180) without any image deps:
 * draws the brand mark (ascending bars on a dark rounded square) into an RGBA
 * buffer and encodes a valid PNG by hand (zlib deflate + CRC32).
 *
 * Run: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(outDir, { recursive: true })

const BG = [9, 9, 11] // zinc-950
const BAR = [52, 211, 153] // emerald-400
const BASE = [39, 39, 42] // zinc-800

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Signed distance to a rounded rectangle centred at (cx, cy). */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

function render(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4)
  const u = size / 64 // design units: 64x64 grid
  // Maskable icons must fill the whole canvas (safe zone is the inner 80%).
  const pad = maskable ? 0 : 0
  const bgRadius = maskable ? 0 : 16 * u
  const shapes = [
    { x: 12, y: 34, w: 8, h: 8, r: 2, color: BAR, alpha: 0.35 },
    { x: 23, y: 27, w: 8, h: 15, r: 2, color: BAR, alpha: 0.6 },
    { x: 34, y: 20, w: 8, h: 22, r: 2, color: BAR, alpha: 0.85 },
    { x: 45, y: 13, w: 8, h: 29, r: 2, color: BAR, alpha: 1 },
    { x: 12, y: 46, w: 41, h: 5, r: 2.5, color: BASE, alpha: 1 },
  ]
  // Shrink artwork toward centre for maskable safe zone.
  const scale = maskable ? 0.72 : 1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // Background rounded square (or full bleed when maskable)
      const dBg = sdRoundRect(
        x + 0.5,
        y + 0.5,
        size / 2,
        size / 2,
        size / 2 - pad,
        size / 2 - pad,
        bgRadius
      )
      let a = maskable ? 1 : Math.min(1, Math.max(0, 0.5 - dBg))
      let [r, g, b] = BG
      if (a > 0) {
        for (const s of shapes) {
          const cx = size / 2 + (s.x + s.w / 2 - 32) * u * scale
          const cy = size / 2 + (s.y + s.h / 2 - 32) * u * scale
          const d = sdRoundRect(
            x + 0.5,
            y + 0.5,
            cx,
            cy,
            (s.w / 2) * u * scale,
            (s.h / 2) * u * scale,
            s.r * u * scale
          )
          const cov = Math.min(1, Math.max(0, 0.5 - d)) * s.alpha
          if (cov > 0) {
            r = r + (s.color[0] - r) * cov
            g = g + (s.color[1] - g) * cov
            b = b + (s.color[2] - b) * cov
          }
        }
      }
      px[i] = r
      px[i + 1] = g
      px[i + 2] = b
      px[i + 3] = Math.round(a * 255)
    }
  }
  return encodePng(size, px)
}

writeFileSync(path.join(outDir, 'pwa-192x192.png'), render(192, { maskable: true }))
writeFileSync(path.join(outDir, 'pwa-512x512.png'), render(512, { maskable: true }))
writeFileSync(path.join(outDir, 'apple-touch-icon.png'), render(180, { maskable: true }))
console.log('Icons generated in public/')
