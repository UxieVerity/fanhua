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

// 估计背景到底有多白：看最外一圈像素的 min 通道，取 90 分位
// （取分位而不是最大值，花朵万一压到画边也不会把阈值带偏）
function estimateBackground(img, ring = 3) {
  const { width: w, height: h, data } = img
  const vals = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue
      const i = (y * w + x) * 4
      vals.push(Math.min(data[i], data[i + 1], data[i + 2]))
    }
  }
  vals.sort((a, b) => a - b)
  return vals[Math.floor(vals.length * 0.9)]
}

// 局部平坦度：3x3 邻域内 min 通道的极差。
// 这是「背景 / 花瓣」最可靠的分界线 —— 背景是平滑的（实测极差 0~1），
// 而花瓣哪怕白到 250，也带着笔触纹理（实测极差 20~70）。
export function flatness(img, radius = 1) {
  const { width: w, height: h, data } = img
  const mn = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    mn[p] = Math.min(data[i], data[i + 1], data[i + 2])
  }
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let lo = 255
      let hi = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const v = mn[yy * w + xx]
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      }
      out[y * w + x] = hi - lo
    }
  }
  return out
}

// 局部背景亮度场：生图的背景并不均匀（实测是 254 往 252 缓变），
// 用一个全局阈值必然顾此失彼 —— 卡紧了背景残留，卡松了白花瓣被吃。
// 这里按块统计亮度，插值成逐像素的背景亮度，让阈值贴着背景走。
//
// 关键：只有「局部平坦」的像素参与块统计（见 flatness）。
// 早先直接拿块内全像素取中位数，遇到花瓣又白又大片的图会翻车：
// 块内花瓣占多数时中位数落在花瓣亮度上（实测某块落在 230），
// 阈值跟着掉进花瓣区间（226），洪水填充就顺着花瓣边缘一路吃进去，
// 整片浅色花瓣被啃成透明。筛掉有纹理的像素后，块内只剩下背景那一档；
// 整块被花盖住的格子一个样本都取不到，正好回退成 NaN 交给邻格补。
function localBackground(img, block, pct, fallback, flat, flatTol = 3) {
  const { width: w, height: h, data } = img
  const gw = Math.ceil(w / block)
  const gh = Math.ceil(h / block)
  const field = new Float32Array(gw * gh).fill(NaN)

  for (let by = 0; by < gh; by++) {
    for (let bx = 0; bx < gw; bx++) {
      const vals = []
      for (let y = by * block; y < Math.min(h, (by + 1) * block); y++) {
        for (let x = bx * block; x < Math.min(w, (bx + 1) * block); x++) {
          const p = y * w + x
          if (flat[p] > flatTol) continue
          const i = p * 4
          vals.push(Math.min(data[i], data[i + 1], data[i + 2]))
        }
      }
      if (vals.length >= 16) {
        vals.sort((a, b) => a - b)
        field[by * gw + bx] = vals[Math.floor(vals.length * pct)]
      }
    }
  }

  // 整块被花朵盖住的格子没有样本，用周围格子补
  for (let pass = 0; pass < 8; pass++) {
    let filled = 0
    for (let by = 0; by < gh; by++) {
      for (let bx = 0; bx < gw; bx++) {
        const k = by * gw + bx
        if (!Number.isNaN(field[k])) continue
        let sum = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const y = by + dy
            const x = bx + dx
            if (y < 0 || x < 0 || y >= gh || x >= gw) continue
            const v = field[y * gw + x]
            if (!Number.isNaN(v)) { sum += v; n++ }
          }
        }
        if (n) { field[k] = sum / n; filled++ }
      }
    }
    if (!filled) break
  }
  for (let k = 0; k < field.length; k++) if (Number.isNaN(field[k])) field[k] = fallback

  // 轻度平滑，避免块与块之间出现台阶
  const smooth = Float32Array.from(field)
  for (let by = 0; by < gh; by++) {
    for (let bx = 0; bx < gw; bx++) {
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const y = by + dy
          const x = bx + dx
          if (y < 0 || x < 0 || y >= gh || x >= gw) continue
          sum += field[y * gw + x]
          n++
        }
      }
      smooth[by * gw + bx] = sum / n
    }
  }
  return sampleField({ field: smooth, gw, gh, block }, w, h)
}

// 双线性采样出逐像素的背景亮度
function sampleField(f, w, h) {
  const out = new Float32Array(w * h)
  const { field, gw, gh, block } = f
  for (let y = 0; y < h; y++) {
    const fy = Math.min(gh - 1.001, Math.max(0, y / block - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(gh - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < w; x++) {
      const fx = Math.min(gw - 1.001, Math.max(0, x / block - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(gw - 1, x0 + 1)
      const tx = fx - x0
      const a = field[y0 * gw + x0]
      const b = field[y0 * gw + x1]
      const c = field[y1 * gw + x0]
      const d = field[y1 * gw + x1]
      out[y * w + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty
    }
  }
  return out
}

// 从四边洪水填充：与边框连通、且亮度不低于 limitAt(x,y) 的像素判为背景。
// 用连通性而不是「够白就算背景」，是为了保住花朵内部那些和背景一样白的区域 ——
// 它们被花瓣围住，从边框走不进去。
function floodBackground(img, limitAt) {
  const { width: w, height: h, data } = img
  const bg = new Uint8Array(w * h)
  const stack = []
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (bg[p]) return
    const i = p * 4
    if (Math.min(data[i], data[i + 1], data[i + 2]) < limitAt(x, y)) return
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
  return bg
}

// 抠掉背景，返回带 alpha 的图。
//
// 两个关键点：
//   1. 阈值贴着局部背景走。白花瓣本身就在 240~253 之间，和背景几乎重叠，
//      阈值必须贴着背景，否则整圈花瓣会被当成背景吃掉。
//   2. 只做「是 / 不是背景」的二值判断，不做按「离纯白多远」的渐变过渡。
//      白花的花瓣和背景一样白，任何固定区间的过渡都会把花瓣一起削成半透明，
//      在白底上看是发灰，放到深色底上就是一整圈黑边。
//      边缘的抗锯齿交给后面降采样时的面积平均来完成。
//
export function keyOutBackground(img, opts = {}) {
  const { tol = 4, block = 32, pct = 0.5, flatTol = 3, border = 3, borderTol = 12, peelTol = 25, haloFlat = 8 } = opts
  const debug = opts.debug || null
  const { width: w, height: h, data } = img
  // prompt 要求了透明底，模型可能真给 alpha：全透明像素的 RGB 是未定义的
  // 垃圾值，会污染平坦度和局部背景亮度的统计，先洗成白 —— 亮度洪水会把
  // 它们当背景正常吃掉。半透明的边缘像素不动，那里的 RGB 本来就是花的颜色。
  for (let p = 0; p < w * h; p++) {
    if (data[p * 4 + 3] > 8) continue
    data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = 255
  }
  const strict = estimateBackground(img)
  const flat = flatness(img)
  const level = localBackground(img, block, pct, strict, flat, flatTol)
  // 生图最外一圈常带一条压暗的渲染伪影（实测 249，背景 254，只差几阶）。
  // 它平坦、贴边、又是洪水填充的起点，卡在 tol 外就会整条留下来 ——
  // 一条 1px 的线会被 alphaBBox 算进包围盒，把花挤小、线贴在贴图边缘。
  // 所以最外 border 像素单独放宽到 borderTol：花是居中拍的，那里只可能是背景。
  const bg = floodBackground(img, (x, y) => {
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y)
    return level[y * w + x] - (edge < border ? borderTol : tol)
  })
  // 洗残边：贴着花瓣的过渡带像素九成以上是背景（实测 min 245~248、全不透明），
  // 却因为渐变带亮度非单调（250,244,248,246 再落进花瓣）卡在洪水阈值外 ——
  // 1024 原图 4 倍降采样能把它稀释掉；512 小图只有 2 倍，深色底上就是一圈白锯齿。
  //
  // 从已判定背景再发一场洪水，扩散条件是「平滑且亮度仍接近背景」。
  // 平滑是关键：花瓣哪怕白到 250 也带着笔触纹理，洪水进不去，
  // 所以白花瓣内部不会被啃掉；而过渡带是花瓣与平滑背景的混合，
  // 花瓣占比一低就跟着平滑，正好整条洗掉。连通性仍然兜底：
  // 被花瓣围住的白色区域从外头走不进去，照样保得住。
  // 门槛用 haloFlat 而不是 flatTol：网格图的背景自带噪声（实测极差到 6），
  // 卡在 flatTol=3 会寸步难行；花瓣纹理实测 20 起，8 当中正好是分界。
  const minAt = (p) => Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2])
  const stack = []
  for (let p = 0; p < w * h; p++) if (bg[p]) stack.push(p)
  while (stack.length) {
    const p = stack.pop()
    const x = p % w
    const y = (p - x) / w
    const tryPush = (q) => {
      if (bg[q] || flat[q] > haloFlat) return
      if (minAt(q) < level[q] - peelTol) return
      bg[q] = 1
      stack.push(q)
    }
    if (x > 0) tryPush(p - 1)
    if (x < w - 1) tryPush(p + 1)
    if (y > 0) tryPush(p - w)
    if (y < h - 1) tryPush(p + w)
  }
  const bg2 = opts.debug ? bg.slice() : null
  // 第三场：花瓣凹缝里的白底。缝只有几像素宽，过渡带的 3x3 邻域必然扫到
  // 花瓣，平滑判据在缝里天然失效（实测缝内 flatness 20+），上一场进不去。
  // 这场只看亮度。但亮度单打有风险：白花瓣通体都亮，会顺着手感纹理的缺口
  // 灌满整片花瓣 —— 所以新到的区域按连通块验收：向铅笔描边膨胀 2 轮后做
  // 8 邻域腐蚀 10 轮（约 21px），还剩像素的算「厚」，是白花瓣本体，整块
  // 退回；腐蚀完了的才是缝里夹着的薄层背景，收下。彩色花瓣不亮，洪水
  // 碰不到；白花瓣连着自己的深灰描边，膨胀后量得出真实厚度，也保得住。
  const reached = new Uint8Array(w * h)
  const queue = []
  for (let p = 0; p < w * h; p++) if (bg[p]) queue.push(p)
  while (queue.length) {
    const p = queue.pop()
    const x = p % w
    const y = (p - x) / w
    const tryPush = (q) => {
      if (bg[q] || reached[q]) return
      if (minAt(q) < level[q] - peelTol) return
      reached[q] = 1
      queue.push(q)
    }
    if (x > 0) tryPush(p - 1)
    if (x < w - 1) tryPush(p + 1)
    if (y > 0) tryPush(p - w)
    if (y < h - 1) tryPush(p + w)
  }
  // 连通块标号（8 邻域）
  const comp = new Int32Array(w * h)
  let ncomp = 0
  for (let s = 0; s < w * h; s++) {
    if (!reached[s] || comp[s]) continue
    ncomp++
    comp[s] = ncomp
    const pixels = [s]
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i]
      const x = p % w
      const y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dy && !dx) continue
          const yy = y + dy
          const xx = x + dx
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue
          const q = yy * w + xx
          if (reached[q] && !comp[q]) { comp[q] = ncomp; pixels.push(q) }
        }
      }
    }
  }
  // 候选连通块按「墙的成色」验收。亮色洪水的候选块有两种：
  //   花瓣亮核 —— 洪水从描边缺口灌进白花瓣（115 翠菊实测整片薄瓣被灌满），
  //               它四周的墙是铅笔描边：深灰、低饱和；
  //   瓣间白底 —— 真背景楔缝（116 红翠菊的 15~20px 白口袋），两侧的墙是
  //               花瓣彩色本体或它的抗锯齿边：饱和度高。
  // 灰墙占多数的是花瓣，整块退回；彩墙占多数的是背景，收下。
  // 实测（g01 网格图）：花瓣亮核灰墙占比 0.96~1.00，红翠菊楔缝 0.20~0.32，
  // 判 0.6 两边都留足余量。墙上一块都不沾的（浮在背景里的亮屑）当背景收下。
  const grayWall = new Int32Array(ncomp + 1)
  const satWall = new Int32Array(ncomp + 1)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (!reached[p]) continue
      const c = comp[p]
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        const q = yy * w + xx
        if (bg[q] || reached[q]) continue
        const r = data[q * 4]
        const g = data[q * 4 + 1]
        const b = data[q * 4 + 2]
        if (Math.max(r, g, b) - Math.min(r, g, b) < 32) grayWall[c]++
        else satWall[c]++
      }
    }
  }
  const keep = new Uint8Array(ncomp + 1)
  for (let c = 1; c <= ncomp; c++) {
    const wall = grayWall[c] + satWall[c]
    keep[c] = wall > 0 && grayWall[c] * 5 >= wall * 3
  }
  for (let p = 0; p < w * h; p++) if (reached[p] && !keep[comp[p]]) bg[p] = 1
  const alpha = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) alpha[p] = bg[p] ? 0 : 255
  if (debug) Object.assign(debug, { bg, bg2, reached, comp, keep, ncomp })
  return { width: w, height: h, data, alpha, bgLevel: strict, threshold: strict - tol }
}

// 去掉零星的不透明小碎块：抠图时背景里略暗的噪点会被留下，
// 面积小又跟花朵不连通的，一律当噪点抹掉。
export function removeSpecks(img, minSize = 64) {
  const { width: w, height: h, alpha } = img
  const seen = new Uint8Array(w * h)
  const stack = []
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || alpha[start] === 0) continue
    const comp = []
    seen[start] = 1
    stack.push(start)
    while (stack.length) {
      const p = stack.pop()
      comp.push(p)
      const x = p % w
      const y = (p - x) / w
      if (x > 0 && !seen[p - 1] && alpha[p - 1]) { seen[p - 1] = 1; stack.push(p - 1) }
      if (x < w - 1 && !seen[p + 1] && alpha[p + 1]) { seen[p + 1] = 1; stack.push(p + 1) }
      if (y > 0 && !seen[p - w] && alpha[p - w]) { seen[p - w] = 1; stack.push(p - w) }
      if (y < h - 1 && !seen[p + w] && alpha[p + w]) { seen[p + w] = 1; stack.push(p + w) }
    }
    if (comp.length < minSize) for (const p of comp) alpha[p] = 0
  }
  return img
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

// 成品体检：透明底、没被裁断、居中。有问题返回一句人话，没问题返回 null。
//
// 这一关只能在这里做。发布出去的贴图只有 WebP，而本项目零依赖、没有 WebP 解码器，
// 到了 img/flowers/ 那边就再也看不到像素了 —— 所以几何检查必须留在
// 还能拿到 RGBA 的生成管线里，而不是事后对着成品做。
export function auditSprite(img, size, opts = {}) {
  const { minCoverage = 0.15, maxCoverage = 0.95, minMargin = 2, maxOffset = 0.08 } = opts
  const { width: w, height: h, data } = img

  const alpha = new Uint8Array(w * h)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]

  const box = alphaBBox({ width: w, height: h, alpha })
  if (!box) return '整张图都是透明的'

  const coverage = (box.width * box.height) / (size * size)
  if (coverage < minCoverage) return `内容太小（占画面 ${(coverage * 100).toFixed(0)}%）`
  if (coverage > maxCoverage) {
    return `内容几乎铺满，可能没抠干净背景（占 ${(coverage * 100).toFixed(0)}%）`
  }

  const margin = Math.min(box.x, box.y, size - (box.x + box.width), size - (box.y + box.height))
  if (margin < minMargin) return `内容贴边（最小留白 ${margin}px），可能被裁断`

  const dx = Math.abs(box.x + box.width / 2 - size / 2)
  const dy = Math.abs(box.y + box.height / 2 - size / 2)
  if (dx > size * maxOffset || dy > size * maxOffset) {
    return `内容偏出中心 (${dx.toFixed(0)}, ${dy.toFixed(0)})px`
  }

  return null
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

// 裁出 img 的一个矩形子区。网格生图就是靠它切成单朵小图。
export function crop(img, x, y, w, h) {
  const out = new Uint8Array(w * h * 4)
  for (let r = 0; r < h; r++) {
    const s = ((y + r) * img.width + x) * 4
    out.set(img.data.subarray(s, s + w * 4), r * w * 4)
  }
  return { width: w, height: h, data: out }
}

// 一步到位：擦水印 → 去白底 → 裁到内容 → 居中留白 → 缩放到 outSize 的 RGBA
// 入参既可以是 PNG Buffer（内部解码），也可以是 decodePng/crop 的产物（直接处理）
export function toFlowerSprite(png, outSize = 224, pad = 0.06, masks = []) {
  const img = png instanceof Uint8Array ? decodePng(png) : png
  for (const rect of masks) paintWhite(img, rect)
  const keyed = removeSpecks(keyOutBackground(img))
  const box = alphaBBox(keyed)
  if (!box) throw new Error('整张图都是背景，没有可裁的内容')
  return resizeToSquare(keyed, box, outSize, pad)
}
