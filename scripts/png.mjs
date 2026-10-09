// 零依赖 PNG 编解码 + 图像处理（仅覆盖生成管线需要的子集）
// 解码：8bit / 非隔行 / 灰度·灰度+A·RGB·RGBA
// 编码：8bit RGBA，逐行自适应滤波 + deflate
import { inflateSync, deflateSync } from 'node:zlib'

// ---------- CRC32 ----------

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

// ---------- 解码 ----------

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

// 读 PNG → { width, height, data: RGBA Uint8Array }
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG')
  let off = 8
  let ihdr = null
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const body = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      ihdr = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      }
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }
  if (!ihdr) throw new Error('缺少 IHDR')
  if (ihdr.depth !== 8) throw new Error(`不支持的位深 ${ihdr.depth}`)
  if (ihdr.interlace !== 0) throw new Error('不支持隔行 PNG')
  const ch = CHANNELS[ihdr.colorType]
  if (!ch) throw new Error(`不支持的颜色类型 ${ihdr.colorType}`)

  const { width: w, height: h } = ihdr
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const px = Buffer.alloc(stride * h)

  // 逐行反滤波
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = px.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= ch ? prev[i - ch] : 0
      let v = line[i]
      if (ft === 1) v += a
      else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) v += paeth(a, b, c)
      cur[i] = v & 0xff
    }
  }

  // 统一转成 RGBA
  const out = new Uint8Array(w * h * 4)
  for (let i = 0, n = w * h; i < n; i++) {
    const s = i * ch
    const d = i * 4
    if (ch === 1) {
      out[d] = out[d + 1] = out[d + 2] = px[s]
      out[d + 3] = 255
    } else if (ch === 2) {
      out[d] = out[d + 1] = out[d + 2] = px[s]
      out[d + 3] = px[s + 1]
    } else if (ch === 3) {
      out[d] = px[s]
      out[d + 1] = px[s + 1]
      out[d + 2] = px[s + 2]
      out[d + 3] = 255
    } else {
      out[d] = px[s]
      out[d + 1] = px[s + 1]
      out[d + 2] = px[s + 2]
      out[d + 3] = px[s + 3]
    }
  }
  return { width: w, height: h, data: out }
}

// ---------- 编码 ----------

function chunk(type, body) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, crc])
}

// 逐行挑最省的滤波方式（最小绝对差启发式），比固定 None 小 30%~50%
function filterScanlines(rgba, w, h) {
  const bpp = 4
  const stride = w * bpp
  const out = Buffer.alloc((stride + 1) * h)
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)]
  for (let y = 0; y < h; y++) {
    const line = rgba.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? rgba.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= bpp ? prev[i - bpp] : 0
      const v = line[i]
      cand[0][i] = v
      cand[1][i] = (v - a) & 0xff
      cand[2][i] = (v - b) & 0xff
      cand[3][i] = (v - ((a + b) >> 1)) & 0xff
      cand[4][i] = (v - paeth(a, b, c)) & 0xff
    }
    let best = 0
    let bestScore = Infinity
    for (let f = 0; f < 5; f++) {
      let score = 0
      const c = cand[f]
      for (let i = 0; i < stride; i++) {
        const d = c[i]
        score += d < 128 ? d : 256 - d
      }
      if (score < bestScore) {
        bestScore = score
        best = f
      }
    }
    out[y * (stride + 1)] = best
    cand[best].copy(out, y * (stride + 1) + 1)
  }
  return out
}

// RGBA Uint8Array → PNG Buffer
export function encodePng(rgba, w, h, level = 9) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // RGBA
  const filtered = filterScanlines(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length), w, h)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(filtered, { level })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- 图像处理 ----------

// 从四边洪水填充，把「与边框连通的近白像素」判为背景。
// 用连通性而不是全局阈值：花瓣内部的高光即使接近纯白也不会被抠掉。
export function keyOutBackground(img, opts = {}) {
  const { hi = 250, lo = 236 } = opts
  const { width: w, height: h, data } = img
  const isWhite = (i) => {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    return Math.min(r, g, b) >= lo
  }
  const bg = new Uint8Array(w * h)
  const stack = []
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (bg[p] || !isWhite(p * 4)) return
    bg[p] = 1
    stack.push(p)
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  while (stack.length) {
    const p = stack.pop()
    const x = p % w
    const y = (p - x) / w
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }

  // 背景 → 全透明；贴着背景的一圈按「离纯白多远」做柔和过渡，保住抗锯齿边缘
  const alpha = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) alpha[p] = bg[p] ? 0 : 255
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (bg[p]) continue
      let nearBg = false
      if (x > 0 && bg[p - 1]) nearBg = true
      else if (x < w - 1 && bg[p + 1]) nearBg = true
      else if (y > 0 && bg[p - w]) nearBg = true
      else if (y < h - 1 && bg[p + w]) nearBg = true
      if (!nearBg) continue
      const i = p * 4
      const min = Math.min(data[i], data[i + 1], data[i + 2])
      const t = (hi - min) / (hi - lo) // hi(纯白) → 0，lo(实色) → 1
      alpha[p] = Math.max(0, Math.min(255, Math.round(t * 255)))
    }
  }
  return { width: w, height: h, data, alpha }
}

// 按 alpha 求内容包围盒
export function alphaBBox(img, threshold = 8) {
  const { width: w, height: h, alpha } = img
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] <= threshold) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

// 面积平均重采样（先水平后垂直）。颜色按预乘 alpha 平均，避免边缘出现深色描边。
export function resizeToSquare(img, box, outSize, pad = 0.06) {
  const { width: w, data, alpha } = img
  const side = Math.max(box.width, box.height) * (1 + pad * 2)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const x0 = cx - side / 2
  const y0 = cy - side / 2

  // 预乘
  const pm = new Float32Array(outSize * outSize * 4)
  const scale = side / outSize

  for (let oy = 0; oy < outSize; oy++) {
    const sy0 = y0 + oy * scale
    const sy1 = sy0 + scale
    const iy0 = Math.max(0, Math.floor(sy0))
    const iy1 = Math.min(img.height - 1, Math.ceil(sy1) - 1)
    for (let ox = 0; ox < outSize; ox++) {
      const sx0 = x0 + ox * scale
      const sx1 = sx0 + scale
      const ix0 = Math.max(0, Math.floor(sx0))
      const ix1 = Math.min(w - 1, Math.ceil(sx1) - 1)
      let r = 0, g = 0, b = 0, a = 0, wsum = 0
      for (let sy = iy0; sy <= iy1; sy++) {
        const wy = Math.min(sy1, sy + 1) - Math.max(sy0, sy)
        if (wy <= 0) continue
        for (let sx = ix0; sx <= ix1; sx++) {
          const wx = Math.min(sx1, sx + 1) - Math.max(sx0, sx)
          if (wx <= 0) continue
          const wt = wx * wy
          const p = sy * w + sx
          const av = alpha[p] / 255
          const i = p * 4
          r += data[i] * av * wt
          g += data[i + 1] * av * wt
          b += data[i + 2] * av * wt
          a += av * wt
          wsum += wt
        }
      }
      const o = (oy * outSize + ox) * 4
      if (wsum === 0 || a === 0) continue
      pm[o] = r / a
      pm[o + 1] = g / a
      pm[o + 2] = b / a
      pm[o + 3] = (a / wsum) * 255
    }
  }

  const out = new Uint8Array(outSize * outSize * 4)
  for (let i = 0; i < outSize * outSize; i++) {
    const o = i * 4
    out[o] = Math.max(0, Math.min(255, Math.round(pm[o])))
    out[o + 1] = Math.max(0, Math.min(255, Math.round(pm[o + 1])))
    out[o + 2] = Math.max(0, Math.min(255, Math.round(pm[o + 2])))
    out[o + 3] = Math.max(0, Math.min(255, Math.round(pm[o + 3])))
  }
  return { width: outSize, height: outSize, data: out }
}

// 把一块区域涂成纯白（相对坐标 0~1）。用来擦掉角落的水印：
// 涂白之后它会和边框连成一片，被洪水填充一起判成背景。
export function paintWhite(img, rect) {
  const { width: w, height: h, data } = img
  const x0 = Math.max(0, Math.floor(rect.x * w))
  const y0 = Math.max(0, Math.floor(rect.y * h))
  const x1 = Math.min(w, Math.ceil((rect.x + rect.w) * w))
  const y1 = Math.min(h, Math.ceil((rect.y + rect.h) * h))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
    }
  }
}

// 一步到位：擦水印 → 去白底 → 裁到内容 → 居中留白 → 缩放到 outSize 的 RGBA
export function toFlowerSprite(pngBuffer, outSize = 224, pad = 0.06, masks = []) {
  const img = decodePng(pngBuffer)
  for (const rect of masks) paintWhite(img, rect)
  const keyed = keyOutBackground(img)
  const box = alphaBBox(keyed)
  if (!box) throw new Error('整张图都是背景，没有可裁的内容')
  return resizeToSquare(keyed, box, outSize, pad)
}
