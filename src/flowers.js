// 花朵生成器 —— 程序化手绘风 SVG
// 每朵花由随机种子驱动：花瓣数量、角度、长短、弧度、勾线位置全部带抖动，
// 即使是同一花种，每次点击长出来的也都不完全一样。
//
// 插画感的来源有三层：
//   1. 墨线：棕黑描边 + 抖动曲线 + 偶尔的"铅笔第二笔"（手绘的骨架）
//   2. 渐变：每朵花自带 defs，花瓣由花心向瓣尖由深到浅，花心有一层暖光
//   3. 层次：花瓣分前后两层、中心有高光，让平面图形浮起来

// ---------- 随机工具 ----------

export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rnd = (r, min, max) => min + r() * (max - min)
const irnd = (r, min, max) => Math.floor(rnd(r, min, max + 1))
const j = (r, v) => 1 + (r() * 2 - 1) * v // 抖动系数

// 墨色：所有花朵共用一种"钢笔墨"的棕黑，统一手绘感
const INK = '#5b4636'
// 调色用的暖白与深棕：渐变不往纯白/纯黑走，保持纸面上的暖调
const WARM = '#fff7ea'
const DEEP = '#2b1d13'

// ---------- 颜色工具 ----------

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

// 两色线性混合，t=0 取 a，t=1 取 b
function mix(a, b, t) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t)
}

const lighten = (hex, t) => mix(hex, WARM, t)
const darken = (hex, t) => mix(hex, DEEP, t)

// 相对亮度 0~1：越亮的颜色越经不起"往白里提"，需要按亮度收着来
function lum(hex) {
  const [r, g, b] = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// ---------- 路径工具 ----------

// 抖动多边形 → 平滑闭合曲线
// 用"过中点画二次贝塞尔"的经典做法：每个采样点只出一个 Q（两个数），
// 比每个点一段三次贝塞尔省掉近一半路径数据 —— 花瓣多了这很关键。
function closedCurve(pts) {
  const n = pts.length
  const mx = (i) => ((pts[i][0] + pts[(i + 1) % n][0]) / 2).toFixed(1)
  const my = (i) => ((pts[i][1] + pts[(i + 1) % n][1]) / 2).toFixed(1)
  let d = `M${mx(n - 1)} ${my(n - 1)}`
  for (let i = 0; i < n; i++) {
    d += `Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx(i)} ${my(i)}`
  }
  return d + 'Z'
}

function wobblyCircle(r, rad, wobble = 0.12) {
  const n = 9
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = rad * j(r, wobble)
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr])
  }
  return closedCurve(pts)
}

// ---------- 花瓣 ----------
// 花瓣轮廓由一条"宽度曲线"生成：t 从瓣根 0 走到瓣尖 1，
// 该处半宽 = hw · sin(π(a+(b−a)t))^k，base 控制瓣根收成一点的速度，
// 最后叠一层正弦波让边缘起伏 —— 参考图里花瓣边缘"活"起来就靠它。
// wave/wn 是波浪的幅度与频率，改成高频小振幅就是流苏边。

const PETAL_SHAPES = {
  round:     { a: 0.06, b: 0.86, k: 0.55, base: 0.20, wave: 0.07, wn: [3, 4] },
  oval:      { a: 0.04, b: 0.94, k: 0.62, base: 0.22, wave: 0.06, wn: [3, 4] },
  cupped:    { a: 0.05, b: 0.82, k: 0.45, base: 0.22, wave: 0.08, wn: [3, 4] },
  pointed:   { a: 0.06, b: 1.00, k: 1.00, base: 0.18, wave: 0.05, wn: [3, 4] },
  lance:     { a: 0.06, b: 1.00, k: 0.85, base: 0.16, wave: 0.05, wn: [3, 4] },
  thin:      { a: 0.06, b: 0.96, k: 0.70, base: 0.20, wave: 0.04, wn: [3, 4], scale: 0.5 },
  strap:     { a: 0.06, b: 0.97, k: 0.75, base: 0.24, wave: 0.04, wn: [3, 4], scale: 0.4 },
  spatulate: { a: 0.03, b: 0.80, k: 0.50, base: 0.42, wave: 0.06, wn: [3, 4] },
  obovate:   { a: 0.04, b: 0.82, k: 0.48, base: 0.32, wave: 0.07, wn: [3, 4] },
  notched:   { a: 0.06, b: 0.94, k: 0.72, base: 0.20, wave: 0.06, wn: [3, 4], notch: true },
  heart:     { a: 0.05, b: 0.90, k: 0.62, base: 0.20, wave: 0.07, wn: [3, 4], notch: true, notchDepth: 0.80 },
  frilled:   { a: 0.05, b: 0.86, k: 0.50, base: 0.22, wave: 0.13, wn: [5, 7] },
  fringed:   { a: 0.05, b: 0.92, k: 0.60, base: 0.22, wave: 0.18, wn: [7, 10] },
  curled:    { a: 0.06, b: 0.88, k: 0.58, base: 0.20, wave: 0.09, wn: [3, 4] },
}

// 当前渲染的细节档位（0~1），由 renderFlower 按显示尺寸设定：
// 小尺寸下少采样、少画叶脉，免得糊成一团
let DETAIL = 1

// 瓣内的放射状叶脉：参考图的"铅笔感"来自它，明暗由排线密度承担。
// 同一片花瓣的所有叶脉并成一条 path（共用描边属性），省掉大量重复标签。
function petalVeins(r, len, hw, ink) {
  const n = Math.max(2, Math.round(irnd(r, 4, 7) * (0.5 + 0.5 * DETAIL)))
  const op = rnd(r, 0.18, 0.36).toFixed(2)
  let d = ''
  for (let i = 0; i < n; i++) {
    const u = ((i + 0.5) / n) * 2 - 1
    const x0 = u * hw * 0.3
    const x1 = u * hw * 0.85
    const y0 = -len * rnd(r, 0.1, 0.2)
    const y1 = -len * rnd(r, 0.58, 0.92)
    const cx = (x0 + x1) * 0.5 + rnd(r, -2, 2)
    d += `M${x0.toFixed(1)} ${y0.toFixed(1)}Q${cx.toFixed(1)} ${((y0 + y1) * 0.5).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="0.5" opacity="${op}"/>`
}

// 以原点为花心、花瓣沿 -y 方向生长，不旋转 —— 花瓣本体
function petalBody(r, len, hw, shape, fill, ink, sw, opts = {}) {
  const S = PETAL_SHAPES[shape] || PETAL_SHAPES.round
  const len2 = len * j(r, 0.06)
  const waveAmp = S.wave * rnd(r, 0.75, 1.3)
  const waveN = irnd(r, S.wn[0], S.wn[1])
  // 采样点要够密才画得出波浪；高频边（皱边/流苏）自然要多采几个点
  const N = Math.max(
    Math.round(11 * (0.65 + 0.35 * DETAIL)),
    Math.min(20, Math.round(waveN * 2.4 + 3))
  )
  const phase = r() * Math.PI * 2
  const scale = hw * (S.scale || 1)
  const half = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    let w = Math.pow(Math.sin(Math.PI * (S.a + (S.b - S.a) * t)), S.k)
    // 瓣根用 smoothstep 收拢：线性 min() 会在 t=base 处留一道折角，
    // 花瓣看上去就成了"圆角矩形"
    const u = Math.min(1, t / S.base)
    w *= u * u * (3 - 2 * u)
    w *= 1 + waveAmp * Math.sin(waveN * Math.PI * t + phase)
    half.push([w * scale, -len2 * t])
  }
  const pts = []
  for (let i = 0; i <= N; i++) pts.push([-half[i][0], half[i][1]])
  if (S.notch) pts.push([rnd(r, -1.5, 1.5), -len2 * (S.notchDepth ?? 0.86)])
  for (let i = N; i >= 1; i--) pts.push([half[i][0], half[i][1]])
  const d = closedCurve(pts)

  let inner = opts.noStroke
    ? `<path d="${d}" fill="${fill}"${opts.opacity ? ` opacity="${opts.opacity}"` : ''}/>`
    : `<path d="${d}" fill="${fill}" stroke="${ink}" stroke-width="${sw}"/>`
  if (!opts.noStroke) {
    if (DETAIL > 0.45) inner += petalVeins(r, len2, hw, ink)
    // 铅笔第二笔：淡淡地再勾一次轮廓，是"手绘感"的关键
    if (r() < 0.3) {
      inner += `<path d="${d}" transform="translate(${rnd(r, -1.2, 1.2).toFixed(1)} ${rnd(r, -1.2, 1.2).toFixed(1)})"` +
        ` fill="none" stroke="${ink}" stroke-width="${(sw * 0.7).toFixed(1)}" opacity="0.25"/>`
    }
  }
  return inner
}

// 以原点为花心、花瓣沿 -y 方向生长，再整体 rotate(a)
function petal(r, a, len, hw, shape, fill, ink, sw, opts = {}) {
  return `<g transform="rotate(${a.toFixed(1)})">${petalBody(r, len, hw, shape, fill, ink, sw, opts)}</g>`
}

// 同一圈里的花瓣共用一份图形：把花瓣本体注册进 <defs>，返回它的 id。
// 花瓣数翻倍而体积几乎不涨，代价只是同圈花瓣形状一致（靠 rotate/scale 拉开差异）。
// id 前缀是这朵花的 uid —— 否则同页多朵花会互相抢到对方的图形。
let PETAL_DEFS = []
let DEF_PREFIX = ''
function petalDef(r, len, hw, shape, fill, ink, sw, opts) {
  const id = `${DEF_PREFIX}x${PETAL_DEFS.length}`
  PETAL_DEFS.push(`<g id="${id}">${petalBody(r, len, hw, shape, fill, ink, sw, opts)}</g>`)
  return id
}

// back 传入时，先在后面铺一层更长、更深的错位花瓣，让花冠饱满起来
function petalRing(r, { count, len, hw, style, fill, ink, sw, shading = null, a0 = 0, back = null }) {
  let s = ''
  if (back) {
    const bIds = [petalDef(r, len * 1.18, hw, style, back, ink, sw * 0.9), petalDef(r, len * 1.18, hw, style, back, ink, sw * 0.9)]
    for (let i = 0; i < count; i++) {
      const a = a0 + ((i + 0.5) * 360) / count + rnd(r, -6, 6)
      s += `<use href="#${bIds[irnd(r, 0, 1)]}" transform="rotate(${a.toFixed(1)})"/>`
    }
  }
  const nv = Math.max(1, Math.min(3, Math.round(count / 5)))
  const ids = []
  for (let k = 0; k < nv; k++) ids.push(petalDef(r, len, hw, style, fill, ink, sw))
  // 内瓣阴影：一片缩小的同形花瓣，半透明压在瓣根，做出层次
  const shadeId = shading ? petalDef(r, len * 0.55, hw * 0.55, style, shading, ink, 0, { noStroke: true, opacity: 0.5 }) : ''
  for (let i = 0; i < count; i++) {
    const a = a0 + (i * 360) / count + rnd(r, -5, 5)
    const sx = rnd(r, 0.9, 1.1)
    const sy = rnd(r, 0.86, 1.12)
    const tf = `rotate(${a.toFixed(1)}) scale(${sx.toFixed(2)} ${sy.toFixed(2)})`
    s += `<use href="#${ids[irnd(r, 0, nv - 1)]}" transform="${tf}"/>`
    if (shading) s += `<use href="#${shadeId}" transform="rotate(${(a + rnd(r, -6, 6)).toFixed(1)}) scale(${sx.toFixed(2)} ${sy.toFixed(2)})"/>`
  }
  return s
}

// ---------- 花心 ----------

function discCenter(r, rad, fill, ink, sw, dots, hl = true) {
  let s = `<path d="${wobblyCircle(r, rad)}" fill="${fill}" stroke="${ink}" stroke-width="${sw}"/>`
  if (hl) {
    // 左上角一抹柔光，花心就有了球面感
    s += `<ellipse cx="${(-rad * 0.24).toFixed(1)}" cy="${(-rad * 0.28).toFixed(1)}"` +
      ` rx="${(rad * 0.52).toFixed(1)}" ry="${(rad * 0.4).toFixed(1)}" fill="#fff8ea" opacity="0.28"/>`
  }
  const n = dots ?? Math.max(6, Math.round(rad * 0.9))
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const rr = rad * rnd(r, 0.15, 0.72)
    s += `<circle cx="${(Math.cos(a) * rr).toFixed(1)}" cy="${(Math.sin(a) * rr).toFixed(1)}"` +
      ` r="${rnd(r, 0.7, 1.5).toFixed(1)}" fill="${ink}" opacity="${rnd(r, 0.3, 0.55).toFixed(2)}"/>`
  }
  return s
}

// 花蕊：放射状的细线 + 顶端小圆点（樱花、梅花、百合…）
function stamens(r, count, len, ink, tip) {
  let s = ''
  for (let i = 0; i < count; i++) {
    const a = ((i * 360) / count + rnd(r, -12, 12)) * (Math.PI / 180)
    const l = len * rnd(r, 0.65, 1.05)
    const x = Math.cos(a) * l
    const y = Math.sin(a) * l
    // 让细线稍微弯一点，别太机械
    const mx = Math.cos(a + rnd(r, -0.25, 0.25)) * l * 0.5
    const my = Math.sin(a + rnd(r, -0.25, 0.25)) * l * 0.5
    s += `<path d="M 0 0 Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}"` +
      ` fill="none" stroke="${ink}" stroke-width="1.1" opacity="0.85"/>`
    const tr = rnd(r, 1.7, 2.6)
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${tr.toFixed(1)}"` +
      ` fill="${tip}" stroke="${ink}" stroke-width="0.6"/>`
    // 花药上的一点高光
    s += `<circle cx="${(x - tr * 0.3).toFixed(1)}" cy="${(y - tr * 0.35).toFixed(1)}"` +
      ` r="${(tr * 0.4).toFixed(1)}" fill="#fff8ea" opacity="0.55"/>`
  }
  return s
}

// 玫瑰的螺旋卷心：几圈不同半径的圆弧
function spiralCenter(r, ink, sw) {
  let s = ''
  for (const rad of [13, 8.5, 4.5]) {
    const a0 = rnd(r, 0, 360) * (Math.PI / 180)
    const a1 = a0 + (Math.PI * 2 * rnd(r, 0.55, 0.75))
    const rr = rad * j(r, 0.1)
    const sx = Math.cos(a0) * rr
    const sy = Math.sin(a0) * rr
    const ex = Math.cos(a1) * rr
    const ey = Math.sin(a1) * rr
    s += `<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${rr.toFixed(1)} ${(rr * rnd(r, 0.85, 1.1)).toFixed(1)} 0 1 1 ${ex.toFixed(1)} ${ey.toFixed(1)}"` +
      ` fill="none" stroke="${ink}" stroke-width="${sw}"/>`
  }
  return s
}

// ---------- 花型 ----------
// 每个 builder 拿到 rng、variety（含配色 p）和渐变引用 g，
// 返回 SVG 内部片段（以 0,0 为花心）。

const BUILDERS = {
  daisy(r, v, g) {
    return petalRing(r, { count: irnd(r, 11, 14), len: 42, hw: 9, style: 'round', fill: g.petal, ink: INK, sw: 2, shading: g.inner, back: g.back }) +
      discCenter(r, 11, g.center, INK, 2)
  },

  cosmos(r, v, g) {
    return petalRing(r, { count: irnd(r, 7, 9), len: 44, hw: 14, style: 'notched', fill: g.petal, ink: INK, sw: 2, shading: g.inner, back: g.back }) +
      discCenter(r, 6.5, g.center, INK, 1.8)
  },

  sunflower(r, v, g) {
    return petalRing(r, { count: 21, len: 44, hw: 8.5, style: 'lance', fill: g.petal, ink: INK, sw: 1.8, shading: g.inner, back: g.back }) +
      `<path d="${wobblyCircle(r, 16)}" fill="#7a4b26" stroke="${INK}" stroke-width="2"/>` +
      discCenter(r, 13, '#7a4b26', INK, 0, 18)
  },

  // 玫瑰：由外向内五层杯状花瓣，每层旋转一个黄金角，越里越小，形成螺旋花心
  rose(r, v, g) {
    let s = ''
    const layers = 5
    for (let i = layers - 1; i >= 0; i--) {
      const t = i / (layers - 1)
      const n = 5 + Math.round(t * 3)
      const len = 18 + t * 27
      const hw = 9 + t * 9
      const a0 = i * 137.5
      const fill = i % 2 ? g.inner : g.petal
      // 每层只留两份花瓣图形，靠 rotate/scale 铺满一圈
      const ids = [petalDef(r, len, hw, 'cupped', fill, INK, 1.8), petalDef(r, len, hw, 'cupped', fill, INK, 1.8)]
      for (let k = 0; k < n; k++) {
        const a = a0 + (k * 360) / n + rnd(r, -9, 9)
        const sx = rnd(r, 0.9, 1.1)
        const sy = rnd(r, 0.92, 1.08)
        s += `<use href="#${ids[irnd(r, 0, 1)]}" transform="rotate(${a.toFixed(1)})` +
          ` scale(${sx.toFixed(2)} ${sy.toFixed(2)})"/>`
      }
    }
    return s + spiralCenter(r, INK, 1.6)
  },

  // 郁金香：杯口张开的三片外瓣 + 中间探出的浅色内瓣
  tulip(r, v, g) {
    let s = petal(r, rnd(r, -36, -28), 51 * j(r, 0.04), 13, 'oval', g.petal, INK, 2)
    s += petal(r, rnd(r, 28, 36), 51 * j(r, 0.04), 13, 'oval', g.petal, INK, 2)
    // 杯内暗部：夹在两侧瓣之间的一小片阴影，让杯口有深度
    s += `<path d="M -8 -10 C -10 -26 -5 -35 0 -37 C 5 -35 10 -26 8 -10 Z" fill="${g.deep}" opacity="0.32"/>`
    s += petal(r, rnd(r, -3, 3), 47 * j(r, 0.04), 14, 'oval', g.petal, INK, 2)
    s += petal(r, rnd(r, -8, 8), 34 * j(r, 0.05), 9, 'oval', g.inner, INK, 1.4)
    // 花瓣之间的分瓣线
    s += `<path d="M 0 -2 Q ${rnd(r, -3, 3).toFixed(1)} -20 ${rnd(r, -5, 5).toFixed(1)} -34" fill="none" stroke="${INK}" stroke-width="1.4" opacity="0.5"/>`
    return s
  },

  cherry(r, v, g) {
    return petalRing(r, { count: 5, len: 38, hw: 15, style: 'notched', fill: g.petal, ink: INK, sw: 2, shading: g.inner, a0: 36 }) +
      stamens(r, irnd(r, 12, 16), 15, INK, v.p.center)
  },

  poppy(r, v, g) {
    return petalRing(r, { count: irnd(r, 4, 5), len: 46, hw: 21, style: 'round', fill: g.petal, ink: INK, sw: 2, shading: g.inner }) +
      `<path d="${wobblyCircle(r, 10)}" fill="#3f2f3a" stroke="${INK}" stroke-width="1.8"/>` +
      discCenter(r, 8, '#3f2f3a', INK, 0, 12)
  },

  lotus(r, v, g) {
    return petalRing(r, { count: 8, len: 44, hw: 13, style: 'pointed', fill: g.petal, ink: INK, sw: 2, shading: g.inner, back: g.back }) +
      petalRing(r, { count: 6, len: 28, hw: 10, style: 'pointed', fill: g.inner, ink: INK, sw: 1.8, a0: 30 }) +
      discCenter(r, 9, '#caa14e', INK, 1.8)
  },

  chrysanthemum(r, v, g) {
    return petalRing(r, { count: 16, len: 46, hw: 8, style: 'spatulate', fill: g.petal, ink: INK, sw: 1.6, back: g.back }) +
      petalRing(r, { count: 13, len: 34, hw: 7.5, style: 'spatulate', fill: g.petal, shading: g.inner, ink: INK, sw: 1.6, a0: 13 }) +
      petalRing(r, { count: 9, len: 22, hw: 7, style: 'round', fill: g.inner, ink: INK, sw: 1.6, a0: 21 }) +
      discCenter(r, 7, g.center, INK, 1.6)
  },

  pansy(r, v, g) {
    // 上方两瓣小、下方三瓣大，是三色堇的标志
    let s = petalRing(r, { count: 1, len: 33, hw: 14, style: 'oval', fill: g.inner, ink: INK, sw: 2, a0: -38 })
    s += petalRing(r, { count: 1, len: 33, hw: 14, style: 'oval', fill: g.inner, ink: INK, sw: 2, a0: 38 })
    s += petalRing(r, { count: 1, len: 41, hw: 15, style: 'oval', fill: g.petal, ink: INK, sw: 2, a0: 138 })
    s += petalRing(r, { count: 1, len: 41, hw: 15, style: 'oval', fill: g.petal, ink: INK, sw: 2, a0: 180 })
    s += petalRing(r, { count: 1, len: 41, hw: 15, style: 'oval', fill: g.petal, ink: INK, sw: 2, a0: 222 })
    // 脸部的深色斑块：只占花心一小片，别糊住整朵花
    s += `<path d="${wobblyCircle(r, 6.5)}" fill="${g.center}" opacity="0.85"/>`
    s += `<circle cx="0" cy="0" r="2.6" fill="#f4dc8e" stroke="${INK}" stroke-width="0.8"/>`
    return s
  },

  // 百合：六片宽尖瓣，不再铺背景层，免得变成十二角星
  lily(r, v, g) {
    return petalRing(r, { count: 6, len: 46, hw: 15, style: 'pointed', fill: g.petal, ink: INK, sw: 2, shading: g.inner, a0: 30 }) +
      stamens(r, 6, 24, INK, '#e08a3c')
  },

  anemone(r, v, g) {
    return petalRing(r, { count: irnd(r, 6, 8), len: 36, hw: 14, style: 'round', fill: g.petal, ink: INK, sw: 2, shading: g.inner, back: g.back }) +
      discCenter(r, 11, '#3a2f3c', INK, 1.8) +
      `<path d="${wobblyCircle(r, 5.5, 0.15)}" fill="none" stroke="#3a2f3c" stroke-width="2" opacity="0.8"/>`
  },

  forgetmenot(r, v, g) {
    return petalRing(r, { count: 5, len: 16, hw: 7, style: 'round', fill: g.petal, ink: INK, sw: 1.6, shading: g.inner, a0: 36 }) +
      discCenter(r, 5, g.center, INK, 1.5, 5)
  },

  // 薰衣草：一根细茎 + 上端收细的密集花穗，两侧交错
  lavender(r, v, g) {
    let s = `<path d="M 0 50 C ${rnd(r, -4, 4).toFixed(1)} 36 ${rnd(r, -4, 4).toFixed(1)} 22 0 6" fill="none" stroke="${INK}" stroke-width="1.8"/>`
    // 两片小叶
    s += `<path d="M 0 42 C -8 36 -12 28 -11 20" fill="none" stroke="${INK}" stroke-width="1.5" opacity="0.85"/>`
    s += `<path d="M 0 42 C 8 36 12 28 11 20" fill="none" stroke="${INK}" stroke-width="1.5" opacity="0.85"/>`
    // 花穗
    const n = 18
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) // 0 底部 → 1 顶部
      const y = 8 - t * 40
      const side = i % 2 === 0 ? 1 : -1
      const spread = 7.5 * (1 - t * 0.7)
      const x = side * spread * rnd(r, 0.45, 1)
      const a = side * rnd(r, 26, 48)
      const rx = (3.0 * (1 - t * 0.22)).toFixed(1)
      const ry = (4.8 * (1 - t * 0.3)).toFixed(1)
      s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx}" ry="${ry}"` +
        ` transform="rotate(${a.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"` +
        ` fill="${i % 3 === 0 ? g.petal : g.inner}" stroke="${INK}" stroke-width="1.1"/>`
    }
    return s
  },

  // 绣球：小花密集成球，远处的先画、近处的压上层，形成饱满的花球
  hydrangea(r, v, g) {
    const p = v.p
    const placed = []
    for (let k = 0, n = irnd(r, 7, 9); k < n; k++) {
      let x = 0
      let y = 0
      for (let t = 0; t < 16; t++) {
        const a = r() * Math.PI * 2
        const rr = Math.sqrt(r()) * 21
        x = Math.cos(a) * rr
        y = Math.sin(a) * rr
        if (placed.every(([px, py]) => (px - x) ** 2 + (py - y) ** 2 > 15 ** 2)) break
      }
      placed.push([x, y])
    }
    placed.sort((A, B) => B[0] ** 2 + B[1] ** 2 - (A[0] ** 2 + A[1] ** 2))
    let s = ''
    for (const [x, y] of placed) {
      const d = Math.hypot(x, y)
      const sc = 1.2 - d / 70
      s += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc.toFixed(2)})">` +
        petalRing(r, { count: 4, len: 12.5, hw: 6.5, style: 'round', fill: r() < 0.3 ? g.inner : g.petal, ink: INK, sw: 1.3, a0: rnd(r, 0, 90) }) +
        `<circle r="1.9" fill="${p.center}"/>` +
        `<circle cx="-0.5" cy="-0.6" r="0.8" fill="#fff8ea" opacity="0.6"/>` +
        '</g>'
    }
    return s
  },

  bluebell(r, v, g) {
    let s = `<path d="M 0 -30 L 0 -10" fill="none" stroke="${INK}" stroke-width="1.8"/>`
    const n = irnd(r, 3, 4)
    for (let i = 0; i < n; i++) {
      // 钟形花吊在花茎下方，外圈的钟垂得更低，保持"倒挂"的姿态
      const a = n === 1 ? 0 : -30 + (i * 60) / (n - 1) + rnd(r, -6, 6)
      const hy = -10 + Math.abs(a) * 0.8
      const x = Math.sin((a * Math.PI) / 180) * 26
      s += `<path d="M ${x.toFixed(1)} ${hy.toFixed(1)} L ${x.toFixed(1)} ${(hy + 7).toFixed(1)}"` +
        ` fill="none" stroke="${INK}" stroke-width="1.3"/>`
      s += `<g transform="translate(${x.toFixed(1)} ${(hy + 7).toFixed(1)}) rotate(${(a * 0.5).toFixed(1)})">` +
        `<path d="M 0 0 C -8 1.5 -9.5 9 -8.5 15 L -4 12 L 0 15.5 L 4 12 L 8.5 15 C 9.5 9 8 1.5 0 0 Z"` +
        ` fill="${i % 2 === 0 ? g.petal : g.inner}" stroke="${INK}" stroke-width="1.6"/>` +
        `<path d="M 0 2 C -5 3.5 -6.5 8 -5.5 12" fill="none" stroke="${INK}" stroke-width="0.9" opacity="0.35"/>` +
        '</g>'
    }
    return s
  },

  carnation(r, v, g) {
    return petalRing(r, { count: 10, len: 40, hw: 13, style: 'frilled', fill: g.petal, ink: INK, sw: 1.8, a0: 8 }) +
      petalRing(r, { count: 8, len: 30, hw: 11, style: 'frilled', fill: g.petal, shading: g.inner, ink: INK, sw: 1.8, a0: 30 }) +
      petalRing(r, { count: 6, len: 20, hw: 8, style: 'round', fill: g.inner, ink: INK, sw: 1.6, a0: 14 }) +
      discCenter(r, 4.5, g.center, INK, 1.5, 0)
  },

  plum(r, v, g) {
    return petalRing(r, { count: 5, len: 24, hw: 13, style: 'round', fill: g.petal, ink: INK, sw: 1.8, shading: g.inner, a0: 36 }) +
      stamens(r, irnd(r, 10, 14), 13, INK, '#d98a3f')
  },
}

// ---------- 配色 ----------
// 16 组手绘蜡笔感的配色；键是颜色的中文名，用于拼接花种名。
// 每种只给三个基色，渐变由它们自动派生。

const PALETTES = {
  雪白: { petal: '#f9f5ec', inner: '#eee4d2', center: '#e9b949' },
  奶油: { petal: '#f7ecd2', inner: '#efdfba', center: '#d99a3d' },
  樱粉: { petal: '#f8c9d4', inner: '#f3afc1', center: '#e0777f' },
  绯红: { petal: '#e5565d', inner: '#d43f4f', center: '#8c2f39' },
  明黄: { petal: '#f6c445', inner: '#efb02f', center: '#9c6b1f' },
  橙橘: { petal: '#f39a4e', inner: '#ea8234', center: '#8f4f1c' },
  珊瑚: { petal: '#f2827a', inner: '#e96a63', center: '#a03a35' },
  淡紫: { petal: '#c3a6e0', inner: '#b08fd2', center: '#6b4a94' },
  紫菀: { petal: '#9b7ec7', inner: '#8665b5', center: '#553a80' },
  天蓝: { petal: '#9ec4e8', inner: '#82adda', center: '#4a6fa5' },
  宝蓝: { petal: '#6f9bd6', inner: '#5583c4', center: '#31517e' },
  雾蓝: { petal: '#b8cfe6', inner: '#9fb8d6', center: '#5d7ea3' },
  绛紫: { petal: '#8e5a7e', inner: '#7a4568', center: '#4e2a44' },
  酒红: { petal: '#a63d4e', inner: '#8e2c3e', center: '#5e1b28' },
  鹅黄: { petal: '#f4dc8e', inner: '#eaca6b', center: '#a67b25' },
  荧白: { petal: '#fdfbf4', inner: '#f2ecdd', center: '#d9a441' },
}

// ---------- 花种表 ----------
// [花型, 中文名, 配色列表] → 组合展开成花种。目前 18 种花型、103 个命名花种。

// 有"朝向"的花型：整体只做小幅摆动，不随机打转
const UPRIGHT_TYPES = new Set(['tulip', 'lavender', 'bluebell'])

const DEFS = [
  ['daisy', '雏菊', ['雪白', '奶油', '樱粉', '绯红', '明黄', '淡紫', '天蓝', '珊瑚', '鹅黄']],
  ['cosmos', '波斯菊', ['樱粉', '明黄', '绛紫', '紫菀', '雾蓝', '宝蓝', '珊瑚', '荧白']],
  ['sunflower', '向日葵', ['明黄', '橙橘', '鹅黄', '珊瑚', '奶油']],
  ['rose', '玫瑰', ['绯红', '酒红', '樱粉', '奶油', '鹅黄', '淡紫', '珊瑚', '绛紫', '荧白']],
  ['tulip', '郁金香', ['绯红', '明黄', '淡紫', '樱粉', '酒红', '宝蓝', '橙橘', '荧白']],
  ['cherry', '樱花', ['樱粉', '荧白', '绯红', '鹅黄', '雾蓝']],
  ['poppy', '虞美人', ['绯红', '橙橘', '明黄', '樱粉', '绛紫']],
  ['lotus', '莲花', ['樱粉', '荧白', '淡紫', '宝蓝', '鹅黄']],
  ['chrysanthemum', '菊花', ['明黄', '荧白', '绛紫', '酒红', '鹅黄', '淡紫', '珊瑚', '橙橘']],
  ['pansy', '三色堇', ['绛紫', '明黄', '宝蓝', '酒红', '淡紫', '绯红']],
  ['lily', '百合', ['荧白', '樱粉', '鹅黄', '橙橘', '淡紫']],
  ['anemone', '银莲花', ['荧白', '绯红', '宝蓝', '淡紫', '雾蓝']],
  ['forgetmenot', '勿忘我', ['天蓝', '雾蓝', '宝蓝', '淡紫']],
  ['lavender', '薰衣草', ['淡紫', '紫菀', '绛紫']],
  ['hydrangea', '绣球', ['雾蓝', '樱粉', '淡紫', '荧白', '天蓝']],
  ['bluebell', '风铃草', ['宝蓝', '天蓝', '雾蓝', '淡紫']],
  ['carnation', '康乃馨', ['樱粉', '绯红', '荧白', '珊瑚', '淡紫']],
  ['plum', '梅花', ['樱粉', '荧白', '绯红', '鹅黄']],
]

export const FLOWERS = DEFS.flatMap(([type, zh, colors]) =>
  colors.map((c) => ({
    type,
    name: `${zh}·${c}`,
    p: PALETTES[c],
    // 有"朝向"的花（带茎、杯状）只允许小幅度摆动，不随便打转
    upright: UPRIGHT_TYPES.has(type),
  }))
)

export const FLOWER_COUNT = FLOWERS.length

export function pickFlower(rand = Math.random) {
  return FLOWERS[Math.floor(rand() * FLOWER_COUNT)]
}

// ---------- 渐变 ----------
// 每朵花自带一组 defs，id 用种子派生，保证同一页面上多朵花互不串色。
// 花瓣：以花心为原点的径向渐变 —— 瓣根深、瓣尖浅，像被从里到外照亮。

function flowerDefs(uid, p, extra = '') {
  // 浅色花瓣少提亮、多压暗，深色花瓣反之 —— 否则白花会糊在纸色里
  const L = lum(p.petal)
  const Li = lum(p.inner)
  return '<defs>' +
    `<radialGradient id="${uid}p" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="56">` +
      `<stop offset="0" stop-color="${darken(p.petal, 0.2 + 0.16 * (1 - L))}"/>` +
      `<stop offset="0.42" stop-color="${p.petal}"/>` +
      `<stop offset="1" stop-color="${lighten(p.petal, 0.06 + 0.34 * (1 - L))}"/>` +
    '</radialGradient>' +
    `<radialGradient id="${uid}b" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="62">` +
      `<stop offset="0" stop-color="${darken(p.petal, 0.34 - 0.1 * L)}"/>` +
      `<stop offset="1" stop-color="${darken(p.petal, 0.14 - 0.06 * L)}"/>` +
    '</radialGradient>' +
    `<radialGradient id="${uid}i" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="46">` +
      `<stop offset="0" stop-color="${darken(p.inner, 0.2 + 0.12 * (1 - Li))}"/>` +
      `<stop offset="1" stop-color="${lighten(p.inner, 0.05 + 0.3 * (1 - Li))}"/>` +
    '</radialGradient>' +
    `<radialGradient id="${uid}c" cx="0.36" cy="0.3" r="0.85">` +
      `<stop offset="0" stop-color="${lighten(p.center, 0.45)}"/>` +
      `<stop offset="0.62" stop-color="${p.center}"/>` +
      `<stop offset="1" stop-color="${darken(p.center, 0.26)}"/>` +
    '</radialGradient>' +
    extra +
    '</defs>'
}

function flowerTheme(uid, p) {
  return {
    petal: `url(#${uid}p)`,
    back: `url(#${uid}b)`,
    inner: `url(#${uid}i)`,
    center: `url(#${uid}c)`,
    deep: darken(p.petal, 0.3),
  }
}

// ---------- 渲染 ----------
// 把一株花渲染成以点击点为中心的 SVG 字符串。

// <use href="#id"> 是整篇文档范围内解析的，所以同一页上两朵花的 id 绝不能撞。
// 光靠种子不够：同一个种子配不同花型，渐变会串色。加一个只增不减的序号兜底。
let RENDER_SEQ = 0

export function renderFlower(variety, sizePx, seed) {
  const r = mulberry32(seed)
  const uid = `f${(seed >>> 0).toString(36)}-${(RENDER_SEQ++).toString(36)}`
  const p = variety.p
  // 小尺寸下收敛细节：叶脉与轮廓采样都变少，否则缩到 40px 会糊
  DETAIL = sizePx >= 96 ? 1 : sizePx >= 64 ? 0.6 : 0.3
  PETAL_DEFS = []
  DEF_PREFIX = uid
  const body = BUILDERS[variety.type](r, variety, flowerTheme(uid, p))
  const rot = variety.upright ? rnd(r, -12, 12) : rnd(r, 0, 360)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 120 120" width="${sizePx}" height="${sizePx}">` +
    flowerDefs(uid, p, PETAL_DEFS.join('')) +
    `<g transform="rotate(${rot})" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
}
