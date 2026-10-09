// 繁花 fanhua —— 点击页面，在手绘花海里绽放
// 零依赖的原生 JS 插件：每次点击处随机绽放一朵程序化生成的小花。

import { pickFlower, renderFlower, FLOWER_COUNT } from './flowers.js'

const DEFAULTS = {
  size: [40, 110],    // 数字 = 固定大小；[min, max] = 区间随机
  position: 'page',   // 'page' 跟随页面滚动 | 'screen' 固定在屏幕上
  duration: 3000,     // 绽放多少毫秒后开始淡出；0 = 永驻
  zIndex: 2147483647,
}

let opts = { ...DEFAULTS }
let listening = false

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
  transform: translate(-50%, -50%);
  animation: fanhua-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.fanhua svg { display: block; width: 100%; height: 100%; }
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
  const svg = renderFlower(variety, size, (Math.random() * 0xffffffff) >>> 0)

  const el = document.createElement('div')
  el.className = 'fanhua'
  el.innerHTML = svg
  el.title = variety.name

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

const api = { init, setOptions, destroy, clear, bloom, FLOWER_COUNT }
export default api
