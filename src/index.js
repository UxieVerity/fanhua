// 繁花 fanhua —— 点击页面，在手绘花海里绽放
// 零依赖的原生 JS 插件：每次点击处随机绽放一朵花。
// 花来自 img/flowers/ 里的 100 张透明底无损 WebP（见 src/flowers.js 清单）。

import { FLOWERS, FLOWER_COUNT, pickFlower } from './flowers.js'

const DEFAULTS = {
  size: [40, 110],    // 数字 = 固定大小；[min, max] = 区间随机
  position: 'page',   // 'page' 跟随页面滚动 | 'screen' 固定在屏幕上
  duration: 3000,     // 绽放多少毫秒后开始淡出；0 = 永驻
  zIndex: 2147483647,
  imgBase: null,      // 图库根路径；null = 自动推断（见 resolveBase）
  preload: true,      // true 全部预热 | false 用到才加载 | 数字 = 只预热 N 张
  rotate: 12,         // 随机旋转角度上限（度），0 = 不旋转
}

let opts = { ...DEFAULTS }
let listening = false

// 打包成 IIFE 时，模块求值的那一刻 document.currentScript 就是插件自己的 <script>，
// 借此把图库路径定位到插件旁边，而不是页面旁边。
const SELF_SRC =
  typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null

// ---------- 图库 ----------

const cache = new Map() // file -> HTMLImageElement

function resolveBase() {
  if (opts.imgBase) return opts.imgBase
  if (SELF_SRC) {
    try {
      // dist/fanhua.iife.js → ../img/flowers/
      return new URL('../img/flowers/', SELF_SRC).href
    } catch {
      /* 落到下面的兜底 */
    }
  }
  if (typeof document !== 'undefined') return new URL('img/flowers/', document.baseURI).href
  return 'img/flowers/'
}

// 取一张花的 <img>，同一张图只请求一次
function imageFor(variety) {
  let img = cache.get(variety.file)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.src = resolveBase() + variety.file
    cache.set(variety.file, img)
  }
  return img
}

// 预热：分批把图下下来，避免一口气糊满带宽
export function preload(count) {
  if (typeof document === 'undefined') return
  const n = count === undefined ? FLOWERS.length : Math.min(count, FLOWERS.length)
  const list = n >= FLOWERS.length ? FLOWERS : shuffle(FLOWERS).slice(0, n)
  let i = 0
  const step = () => {
    const end = Math.min(i + 4, list.length)
    for (; i < end; i++) imageFor(list[i])
    if (i < list.length) setTimeout(step, 120)
  }
  step()
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------- 样式（只注入一次） ----------

const STYLE_ID = 'fanhua-style'

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
@keyframes fanhua-pop {
  0%   { transform: translate(-50%, -50%) scale(0) rotate(-18deg); opacity: 0; }
  60%  { transform: translate(-50%, -50%) scale(1.12) rotate(4deg); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; }
}
.fanhua {
  position: absolute;
  pointer-events: none;
  user-select: none;
  transform: translate(-50%, -50%);
  animation: fanhua-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  /* 一点柔和的投影，让花从纸面上浮起来 */
  filter: drop-shadow(0 5px 7px rgba(91, 70, 54, 0.16));
}
.fanhua img {
  display: block;
  width: 100%;
  height: 100%;
  transform: rotate(var(--fanhua-rot, 0deg));
}
.fanhua.is-fading {
  animation: none;
  opacity: 0 !important;
  transition: opacity 0.65s ease-in;
}
`
  document.head.appendChild(el)
}

// ---------- 参数 ----------

// 归一化 size：非法时返回 null，由调用方回落默认值
function normalizeSize(size) {
  if (typeof size === 'number' && Number.isFinite(size) && size > 0) return [size, size]
  if (
    Array.isArray(size) && size.length === 2 &&
    size.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)
  ) {
    return size[0] <= size[1] ? [size[0], size[1]] : [size[1], size[0]]
  }
  return null
}

// ---------- 绽放 ----------

function fade(el) {
  if (!el.isConnected) return
  el.classList.add('is-fading')
  setTimeout(() => el.remove(), 750)
}

// 在指定位置绽放一朵花；x/y 为视口坐标，会按 position 换算
export function bloom(clientX, clientY, overrides = {}) {
  if (typeof document === 'undefined') return
  const o = { ...opts, ...overrides }

  const range = normalizeSize(o.size) || normalizeSize(DEFAULTS.size)
  const size = Math.round(range[0] + Math.random() * (range[1] - range[0]))

  const variety = pickFlower()
  const source = imageFor(variety)

  const el = document.createElement('div')
  el.className = 'fanhua'
  el.dataset.flower = `${variety.id} ${variety.name}`
  el.title = variety.name
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  if (o.rotate > 0) {
    el.style.setProperty('--fanhua-rot', `${(Math.random() * 2 - 1) * o.rotate}deg`)
  }

  // 用 cloneNode 而不是直接挂缓存里的那个：缓存实例同时只可能在一个位置上
  const img = source.cloneNode(false)
  img.alt = ''
  img.draggable = false
  el.appendChild(img)

  if (o.position === 'screen') {
    el.style.position = 'fixed'
    el.style.left = `${clientX}px`
    el.style.top = `${clientY}px`
  } else {
    // 'page'：绝对定位在文档上，随滚动一起走
    el.style.position = 'absolute'
    el.style.left = `${clientX + window.scrollX}px`
    el.style.top = `${clientY + window.scrollY}px`
  }
  el.style.zIndex = String(o.zIndex)

  document.body.appendChild(el)

  if (o.duration > 0) {
    setTimeout(() => fade(el), o.duration)
  }
}

// ---------- 生命周期 ----------

function onClick(e) {
  if (e.button !== undefined && e.button !== 0) return // 只响应主键
  bloom(e.clientX, e.clientY)
}

export function init(options = {}) {
  opts = { ...opts, ...options }
  if (listening || typeof document === 'undefined') return
  ensureStyle()
  document.addEventListener('click', onClick)
  listening = true

  if (opts.preload) {
    const warm = typeof opts.preload === 'number' ? opts.preload : undefined
    // 让出首屏：空闲时再开始下图片
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => preload(warm))
    else setTimeout(() => preload(warm), 200)
  }
}

// 更新配置，不必重新 init
export function setOptions(options = {}) {
  opts = { ...opts, ...options }
}

// 移除点击监听（已开的花保留）
export function destroy() {
  if (!listening) return
  document.removeEventListener('click', onClick)
  listening = false
}

// 清掉页面上所有的花
export function clear() {
  document.querySelectorAll('.fanhua').forEach((el) => el.remove())
}

const api = { init, setOptions, destroy, clear, bloom, preload, FLOWERS, FLOWER_COUNT }
export default api

// 具名再导一次：IIFE 打包时全局对象取的是模块命名空间，
// 只挂在 default 上会导致 window.Fanhua.FLOWERS 取不到。
export { FLOWERS, FLOWER_COUNT }
