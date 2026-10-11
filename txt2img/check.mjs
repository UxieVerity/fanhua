// 体检：把 txt2img/sprites/ 的精灵图铺在深色底上拼成对照图，并统计异常
//   node txt2img/check.mjs             # 全部
//   node txt2img/check.mjs 001 022     # 只看几张
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from '../scripts/png.mjs'

const DIR = fileURLToPath(new URL('./sprites/', import.meta.url))
const only = process.argv.slice(2)
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.png'))
  .filter((f) => !only.length || only.some((o) => f.startsWith(o)))
  .sort()

const CELL = 192
const COLS = 10
const rows = Math.ceil(files.length / COLS)
const W = COLS * CELL
const H = rows * CELL
const canvas = new Uint8Array(W * H * 4)
// 深灰底，透明的地方会露出底色
for (let i = 0; i < W * H; i++) {
  canvas[i * 4] = 40
  canvas[i * 4 + 1] = 44
  canvas[i * 4 + 2] = 52
  canvas[i * 4 + 3] = 255
}

const report = []
for (let n = 0; n < files.length; n++) {
  const file = files[n]
  const img = decodePng(readFileSync(DIR + file))
  const { width: w, height: h, data } = img

  // 统计
  let opaque = 0
  let borderOpaque = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= 8) continue
      opaque++
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) borderOpaque++
    }
  }

  // 不透明连通块个数（8 邻域）
  const seen = new Uint8Array(w * h)
  let comps = 0
  let largest = 0
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || data[s * 4 + 3] <= 8) continue
    comps++
    let size = 0
    const stack = [s]
    seen[s] = 1
    while (stack.length) {
      const p = stack.pop()
      size++
      const x = p % w
      const y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const q = ny * w + nx
          if (seen[q] || data[q * 4 + 3] <= 8) continue
          seen[q] = 1
          stack.push(q)
        }
      }
    }
    if (size > largest) largest = size
  }

  // 被花瓣完全围住的透明洞（从画布外圈走不进去的透明区域）
  const bgSeen = new Uint8Array(w * h)
  const stack = []
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (bgSeen[p] || data[p * 4 + 3] > 8) return
    bgSeen[p] = 1
    stack.push(p)
  }
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }
  while (stack.length) {
    const p = stack.pop()
    const x = p % w
    const y = (p - x) / w
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1)
  }
  let holes = 0
  let holePx = 0
  for (let p = 0; p < w * h; p++) {
    if (!bgSeen[p] && data[p * 4 + 3] <= 8) { holes++; holePx++ }
  }

  report.push({
    file: file.slice(0, 28),
    opaque,
    borderOpaque,
    comps,
    largest,
    stray: opaque - largest,
    holes: holes ? `${holes}px` : '',
  })

  const ox = (n % COLS) * CELL
  const oy = Math.floor(n / COLS) * CELL
  for (let y = 0; y < Math.min(h, CELL); y++) {
    for (let x = 0; x < Math.min(w, CELL); x++) {
      const s = (y * w + x) * 4
      const a = data[s + 3] / 255
      if (a === 0) continue
      const d = ((oy + y) * W + (ox + x)) * 4
      for (let k = 0; k < 3; k++) canvas[d + k] = Math.round(data[s + k] * a + canvas[d + k] * (1 - a))
    }
  }
}

console.table(report.filter((r) => r.borderOpaque || r.comps > 1 || r.holes))
console.log(`可疑 ${report.filter((r) => r.borderOpaque || r.comps > 1 || r.holes).length} / ${report.length} 张`)

const out = fileURLToPath(new URL('./check.png', import.meta.url))
writeFileSync(out, encodePng(canvas, W, H, 6))
console.log(`✓ ${out}  (${W}x${H})`)
