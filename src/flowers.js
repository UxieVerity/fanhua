// 花朵生成器 —— 程序化手绘风 SVG
// 每朵花由随机种子驱动：花瓣数量、角度、长短、弧度、勾线位置全部带抖动，
// 即使是同一花种，每次点击长出来的也都不完全一样。

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

// ---------- 路径工具 ----------

// 抖动多边形 → 平滑闭合曲线
function closedCurve(pts) {
  const n = pts.length
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[i]
    const p1 = pts[(i + 1) % n]
    const dx = p1[0] - p0[0]
    const dy = p1[1] - p0[1]
    d += ` C ${(p0[0] + dx * 0.35).toFixed(1)} ${(p0[1] + dy * 0.35).toFixed(1)}` +
      ` ${(p1[0] - dx * 0.35).toFixed(1)} ${(p1[1] - dy * 0.35).toFixed(1)}` +
      ` ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`
  }
  return d + ' Z'
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
// 以原点为花心、花瓣沿 -y 方向生长，再整体 rotate(a)。
// style: round 圆润 | pointed 尖头 | notched 缺刻(樱花/波斯菊) | thin 细长
function petal(r, a, len, hw, style, fill, ink, sw, opts = {}) {
  const len2 = len * j(r, 0.06)
  const tipX = style === 'pointed' ? rnd(r, -2.5, 2.5) : rnd(r, -hw * 0.25, hw * 0.25)
  let d
  if (style === 'notched') {
    const tipW = hw * 0.5 * j(r, 0.3)
    const dip = len2 * rnd(r, 0.8, 0.9)
    d = `M 0 0 C ${-hw} ${-len2 * 0.28} ${-hw * 1.05} ${-len2 * 0.8} ${-tipW} ${-len2}` +
      ` L ${rnd(r, -1.5, 1.5).toFixed(1)} ${-dip} L ${tipW} ${-len2}` +
      ` C ${hw * 1.05} ${-len2 * 0.82} ${hw} ${-len2 * 0.3} 0 0 Z`
  } else if (style === 'pointed') {
    const c2 = hw * 0.45
    d = `M 0 0 C ${-hw} ${-len2 * 0.25} ${-c2} ${-len2 * 0.85} ${tipX} ${-len2}` +
      ` C ${c2} ${-len2 * 0.85} ${hw} ${-len2 * 0.25} 0 0 Z`
  } else {
    const spread = hw * (style === 'thin' ? 0.55 : 1)
    d = `M 0 0 C ${-spread} ${-len2 * 0.3} ${-spread * 0.9} ${-len2 * 0.8} ${tipX} ${-len2}` +
      ` C ${spread * 0.9} ${-len2 * 0.8} ${spread} ${-len2 * 0.3} 0 0 Z`
  }
  const rot = `rotate(${a.toFixed(1)})`
  let s = opts.noStroke
    ? `<path d="${d}" transform="${rot}" fill="${fill}"${opts.opacity ? ` opacity="${opts.opacity}"` : ''}/>`
    : `<path d="${d}" transform="${rot}" fill="${fill}" stroke="${ink}" stroke-width="${sw}"/>`
  // 铅笔第二笔：淡淡地再勾一次轮廓，是"手绘感"的关键
  if (!opts.noStroke && r() < 0.45) {
    s += `<path d="${d}" transform="${rot} translate(${rnd(r, -1.2, 1.2).toFixed(1)} ${rnd(r, -1.2, 1.2).toFixed(1)})"` +
      ` fill="none" stroke="${ink}" stroke-width="${(sw * 0.7).toFixed(1)}" opacity="0.28"/>`
  }
  return s
}

// 内瓣阴影：一片缩小的同形花瓣，用更深/更浅的颜色做层次
function innerShade(r, a, len, hw, style, fill) {
  return petal(r, a + rnd(r, -6, 6), len * 0.55, hw * 0.55, style, fill, INK, 0, {
    noStroke: true,
    opacity: 0.5,
  })
}

function petalRing(r, { count, len, hw, style, fill, ink, sw, shading = null, a0 = 0 }) {
  let s = ''
  for (let i = 0; i < count; i++) {
    const a = a0 + (i * 360) / count + rnd(r, -5, 5)
    const l = len * rnd(r, 0.86, 1.12)
    const w = hw * rnd(r, 0.82, 1.15)
    s += petal(r, a, l, w, style, fill, ink, sw)
    if (shading) s += innerShade(r, a, l, w, style, shading)
  }
  return s
}

// ---------- 花心 ----------

function discCenter(r, rad, fill, ink, sw, dots) {
  let s = `<path d="${wobblyCircle(r, rad)}" fill="${fill}" stroke="${ink}" stroke-width="${sw}"/>`
  const n = dots ?? Math.max(6, Math.round(rad * 0.9))
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const rr = rad * rnd(r, 0.15, 0.72)
    s += `<circle cx="${(Math.cos(a) * rr).toFixed(1)}" cy="${(Math.sin(a) * rr).toFixed(1)}"` +
      ` r="${rnd(r, 0.7, 1.5).toFixed(1)}" fill="${ink}" opacity="0.5"/>`
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
      ` fill="none" stroke="${ink}" stroke-width="1.2"/>`
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rnd(r, 1.6, 2.6).toFixed(1)}"` +
      ` fill="${tip}" stroke="${ink}" stroke-width="0.6"/>`
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
// 每个 builder 拿到 rng 和 variety（含配色 p），返回 SVG 内部片段（以 0,0 为花心）。

const BUILDERS = {
  daisy(r, v) {
    const p = v.p
    return petalRing(r, { count: irnd(r, 11, 14), len: 42, hw: 9, style: 'round', fill: p.petal, shading: p.inner, ink: INK, sw: 2 }) +
      discCenter(r, 11, p.center, INK, 2)
  },

  cosmos(r, v) {
    const p = v.p
    return petalRing(r, { count: irnd(r, 7, 9), len: 44, hw: 14, style: 'notched', fill: p.petal, shading: p.inner, ink: INK, sw: 2 }) +
      discCenter(r, 6.5, p.center, INK, 1.8)
  },

  sunflower(r, v) {
    const p = v.p
    return petalRing(r, { count: 22, len: 44, hw: 7.5, style: 'pointed', fill: p.petal, shading: p.inner, ink: INK, sw: 1.8 }) +
      `<path d="${wobblyCircle(r, 16)}" fill="#7a4b26" stroke="${INK}" stroke-width="2"/>` +
      discCenter(r, 13, '#7a4b26', INK, 0, 16)
  },

  rose(r, v) {
    const p = v.p
    return petalRing(r, { count: 7, len: 42, hw: 17, style: 'round', fill: p.petal, shading: p.inner, ink: INK, sw: 2, a0: 12 }) +
      petalRing(r, { count: 5, len: 27, hw: 12, style: 'round', fill: p.inner, shading: p.petal, ink: INK, sw: 2, a0: 63 }) +
      spiralCenter(r, INK, 1.8)
  },

  tulip(r, v) {
    const p = v.p
    let s = petalRing(r, { count: 2, len: 40, hw: 14, style: 'round', fill: p.petal, ink: INK, sw: 2, a0: 150 })
    s += petal(r, 0, 46 * j(r, 0.05), 17, 'round', p.petal, INK, 2)
    s += innerShade(r, 0, 46, 17, 'round', p.inner)
    // 花瓣之间的分瓣线
    s += `<path d="M 0 0 Q ${rnd(r, -3, 3).toFixed(1)} -22 ${rnd(r, -5, 5).toFixed(1)} -40" fill="none" stroke="${INK}" stroke-width="1.4" opacity="0.6"/>`
    return s
  },

  cherry(r, v) {
    const p = v.p
    return petalRing(r, { count: 5, len: 38, hw: 15, style: 'notched', fill: p.petal, shading: p.inner, ink: INK, sw: 2, a0: 36 }) +
      stamens(r, irnd(r, 12, 16), 15, INK, p.center)
  },

  poppy(r, v) {
    const p = v.p
    return petalRing(r, { count: irnd(r, 4, 5), len: 46, hw: 21, style: 'round', fill: p.petal, shading: p.inner, ink: INK, sw: 2 }) +
      `<path d="${wobblyCircle(r, 10)}" fill="#3f2f3a" stroke="${INK}" stroke-width="1.8"/>` +
      discCenter(r, 8, '#3f2f3a', INK, 0, 12)
  },

  lotus(r, v) {
    const p = v.p
    return petalRing(r, { count: 8, len: 44, hw: 13, style: 'pointed', fill: p.petal, shading: p.inner, ink: INK, sw: 2 }) +
      petalRing(r, { count: 6, len: 28, hw: 10, style: 'pointed', fill: p.inner, ink: INK, sw: 1.8, a0: 30 }) +
      discCenter(r, 9, '#caa14e', INK, 1.8)
  },

  chrysanthemum(r, v) {
    const p = v.p
    return petalRing(r, { count: 16, len: 46, hw: 8, style: 'thin', fill: p.petal, ink: INK, sw: 1.6 }) +
      petalRing(r, { count: 13, len: 34, hw: 7.5, style: 'thin', fill: p.petal, shading: p.inner, ink: INK, sw: 1.6, a0: 13 }) +
      petalRing(r, { count: 9, len: 22, hw: 7, style: 'thin', fill: p.inner, ink: INK, sw: 1.6, a0: 21 }) +
      discCenter(r, 7, p.center, INK, 1.6)
  },

  pansy(r, v) {
    const p = v.p
    // 上方两瓣小、下方三瓣大，是三色堇的标志
    let s = petalRing(r, { count: 1, len: 30, hw: 16, style: 'round', fill: p.inner, ink: INK, sw: 2, a0: -35 })
    s += petalRing(r, { count: 1, len: 30, hw: 16, style: 'round', fill: p.inner, ink: INK, sw: 2, a0: 35 })
    s += petalRing(r, { count: 1, len: 38, hw: 18, style: 'round', fill: p.petal, ink: INK, sw: 2, a0: 140 })
    s += petalRing(r, { count: 1, len: 38, hw: 18, style: 'round', fill: p.petal, ink: INK, sw: 2, a0: 180 })
    s += petalRing(r, { count: 1, len: 38, hw: 18, style: 'round', fill: p.petal, ink: INK, sw: 2, a0: 220 })
    // 脸部的深色斑块
    s += `<path d="${wobblyCircle(r, 8.5)}" fill="${p.center}" opacity="0.85"/>`
    s += `<circle cx="0" cy="0" r="3" fill="#f4dc8e" stroke="${INK}" stroke-width="0.8"/>`
    return s
  },

  lily(r, v) {
    const p = v.p
    return petalRing(r, { count: 6, len: 48, hw: 12, style: 'pointed', fill: p.petal, shading: p.inner, ink: INK, sw: 2, a0: 30 }) +
      stamens(r, 6, 24, INK, '#e08a3c')
  },

  anemone(r, v) {
    const p = v.p
    return petalRing(r, { count: irnd(r, 6, 8), len: 36, hw: 14, style: 'round', fill: p.petal, shading: p.inner, ink: INK, sw: 2 }) +
      discCenter(r, 11, '#3a2f3c', INK, 1.8) +
      `<path d="${wobblyCircle(r, 5.5, 0.15)}" fill="none" stroke="#3a2f3c" stroke-width="2" opacity="0.8"/>`
  },

  forgetmenot(r, v) {
    const p = v.p
    return petalRing(r, { count: 5, len: 16, hw: 7, style: 'round', fill: p.petal, shading: p.inner, ink: INK, sw: 1.6, a0: 36 }) +
      discCenter(r, 5, '#f2c14e', INK, 1.5, 5)
  },

  lavender(r, v) {
    const p = v.p
    let s = `<path d="M 0 46 C ${rnd(r, -3, 3).toFixed(1)} 34 ${rnd(r, -3, 3).toFixed(1)} 22 0 8" fill="none" stroke="${INK}" stroke-width="1.8"/>`
    // 沿茎上端交错排列的小穗
    for (let i = 0; i < 11; i++) {
      const y = 6 - i * 3.6
      const a = i % 2 === 0 ? rnd(r, 30, 48) : rnd(r, -48, -30)
      s += `<ellipse cx="${(Math.sin((a * Math.PI) / 180) * 4).toFixed(1)}" cy="${y.toFixed(1)}"` +
        ` rx="3.1" ry="5.4" transform="rotate(${a.toFixed(1)} ${(Math.sin((a * Math.PI) / 180) * 4).toFixed(1)} ${y.toFixed(1)})"` +
        ` fill="${i % 3 === 0 ? p.petal : p.inner}" stroke="${INK}" stroke-width="1.1"/>`
    }
    return s
  },

  hydrangea(r, v) {
    const p = v.p
    let s = ''
    const placed = []
    for (let k = 0; k < irnd(r, 5, 6); k++) {
      // 简单的散点：随机位置，离已放下的太近就重试
      let x = 0, y = 0
      for (let t = 0; t < 8; t++) {
        const a = r() * Math.PI * 2
        const rr = rnd(r, 4, 21)
        x = Math.cos(a) * rr
        y = Math.sin(a) * rr
        if (placed.every(([px, py]) => (px - x) ** 2 + (py - y) ** 2 > 22 ** 2)) break
      }
      placed.push([x, y])
      s += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">` +
        petalRing(r, { count: 4, len: 11.5, hw: 5.5, style: 'round', fill: r() < 0.3 ? p.inner : p.petal, ink: INK, sw: 1.4, a0: rnd(r, 0, 90) }) +
        `<circle r="1.7" fill="${p.center}"/>` +
        '</g>'
    }
    return s
  },

  bluebell(r, v) {
    const p = v.p
    let s = `<path d="M 0 -30 L 0 -6" fill="none" stroke="${INK}" stroke-width="1.8"/>`
    const n = irnd(r, 3, 4)
    for (let i = 0; i < n; i++) {
      const a = -50 + (i * 100) / (n - 1) + rnd(r, -8, 8)
      const hy = -8 + Math.abs(a) * 0.16
      const x = Math.sin((a * Math.PI) / 180) * 14
      s += `<path d="M ${x.toFixed(1)} ${hy.toFixed(1)} L ${x.toFixed(1)} ${(hy + 8).toFixed(1)}"` +
        ` fill="none" stroke="${INK}" stroke-width="1.3"/>`
      s += `<g transform="translate(${x.toFixed(1)} ${(hy + 8).toFixed(1)}) rotate(${a.toFixed(1)})">` +
        `<path d="M 0 0 C -8 1.5 -9.5 9 -8.5 15 L -4 12 L 0 15.5 L 4 12 L 8.5 15 C 9.5 9 8 1.5 0 0 Z"` +
        ` fill="${i % 2 === 0 ? p.petal : p.inner}" stroke="${INK}" stroke-width="1.6"/>` +
        '</g>'
    }
    return s
  },

  carnation(r, v) {
    const p = v.p
    return petalRing(r, { count: 10, len: 40, hw: 13, style: 'round', fill: p.petal, ink: INK, sw: 1.8, a0: 8 }) +
      petalRing(r, { count: 8, len: 30, hw: 11, style: 'round', fill: p.petal, shading: p.inner, ink: INK, sw: 1.8, a0: 30 }) +
      petalRing(r, { count: 6, len: 20, hw: 8, style: 'round', fill: p.inner, ink: INK, sw: 1.6, a0: 14 }) +
      discCenter(r, 4.5, p.center, INK, 1.5, 0)
  },

  plum(r, v) {
    const p = v.p
    return petalRing(r, { count: 5, len: 24, hw: 13, style: 'round', fill: p.petal, shading: p.inner, ink: INK, sw: 1.8, a0: 36 }) +
      stamens(r, irnd(r, 10, 14), 13, INK, '#d98a3f')
  },
}

// ---------- 配色 ----------
// 16 组手绘蜡笔感的配色；键是颜色的中文名，用于拼接花种名。

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
// [花型, 中文名, 配色列表] → 组合展开成花种。目前 18 种花型、102 个命名花种。

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
  colors.map((c) => ({ type, name: `${zh}·${c}`, p: PALETTES[c] }))
)

export const FLOWER_COUNT = FLOWERS.length

export function pickFlower(rand = Math.random) {
  return FLOWERS[Math.floor(rand() * FLOWER_COUNT)]
}

// ---------- 渲染 ----------
// 把一株花渲染成以点击点为中心的 SVG 字符串。

export function renderFlower(variety, sizePx, seed) {
  const r = mulberry32(seed)
  const body = BUILDERS[variety.type](r, variety)
  const rot = rnd(r, 0, 360).toFixed(1)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 120 120" width="${sizePx}" height="${sizePx}">` +
    `<g transform="rotate(${rot})" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
}
