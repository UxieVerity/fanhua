// 快速自检：图库至少 100 张、每张都能解开、透明底且内容没被裁歪
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FLOWERS, FLOWER_COUNT, SPRITE_SIZE, pickFlower } from '../src/flowers.js'
import { decodePng, alphaBBox } from './png.mjs'

const IMG_DIR = fileURLToPath(new URL('../img/flowers/', import.meta.url))

let failed = 0
const fail = (msg) => {
  console.error(`✗ ${msg}`)
  failed++
}

console.log(`花种总数: ${FLOWER_COUNT}  精灵图边长: ${SPRITE_SIZE}`)
if (FLOWER_COUNT < 100) fail('花种不足 100')

// ---------- 清单本身 ----------

const ids = new Set()
const names = new Set()
const files = new Set()
const bySpecies = new Map()

for (const v of FLOWERS) {
  if (ids.has(v.id)) fail(`编号重复: ${v.id}`)
  if (names.has(v.name)) fail(`花名重复: ${v.name}`)
  if (files.has(v.file)) fail(`文件名重复: ${v.file}`)
  ids.add(v.id)
  names.add(v.name)
  files.add(v.file)
  bySpecies.set(v.species, (bySpecies.get(v.species) || 0) + 1)
}

for (const [sp, n] of bySpecies) {
  if (n < 2) fail(`${sp} 只有 ${n} 种颜色，应当至少 2 种`)
}

// 文件名格式：编号-花名-颜色.png
for (const v of FLOWERS) {
  if (!/^\d{3}-[a-z]+-.+\.png$/.test(v.file)) fail(`文件名不合规: ${v.file}`)
  if (!v.file.startsWith(v.id)) fail(`文件名与编号对不上: ${v.id} / ${v.file}`)
}

// ---------- 图片文件 ----------

const alphaOf = (img) => {
  const a = new Uint8Array(img.width * img.height)
  for (let i = 0; i < a.length; i++) a[i] = img.data[i * 4 + 3]
  return a
}

let totalBytes = 0
let smallest = Infinity
let largest = 0

for (const v of FLOWERS) {
  const path = IMG_DIR + v.file
  if (!existsSync(path)) {
    fail(`缺图: ${v.file}`)
    continue
  }
  const buf = readFileSync(path)
  totalBytes += buf.length
  smallest = Math.min(smallest, buf.length)
  largest = Math.max(largest, buf.length)

  // IHDR: bit depth 在偏移 24，color type 在 25
  if (buf[25] !== 6) fail(`${v.file}: 不是 RGBA（color type ${buf[25]}）`)

  let img
  try {
    img = decodePng(buf)
  } catch (err) {
    fail(`${v.file}: 解不开 —— ${err.message}`)
    continue
  }
  if (img.width !== SPRITE_SIZE || img.height !== SPRITE_SIZE) {
    fail(`${v.file}: 尺寸 ${img.width}x${img.height}，应为 ${SPRITE_SIZE}`)
    continue
  }

  const box = alphaBBox({ width: img.width, height: img.height, alpha: alphaOf(img) })
  if (!box) {
    fail(`${v.file}: 整张图都是透明的`)
    continue
  }
  const coverage = (box.width * box.height) / (SPRITE_SIZE * SPRITE_SIZE)
  if (coverage < 0.15) fail(`${v.file}: 内容太小（占画面 ${(coverage * 100).toFixed(0)}%）`)
  if (coverage > 0.95) fail(`${v.file}: 内容几乎铺满，可能没抠干净背景（占 ${(coverage * 100).toFixed(0)}%）`)

  // 内容必须留边：贴边说明原图里花就被切了
  const margin = Math.min(box.x, box.y, SPRITE_SIZE - (box.x + box.width), SPRITE_SIZE - (box.y + box.height))
  if (margin < 2) fail(`${v.file}: 内容贴边（最小留白 ${margin}px），可能被裁断`)

  // 居中：内容中心离画面中心不该太远
  const dx = Math.abs(box.x + box.width / 2 - SPRITE_SIZE / 2)
  const dy = Math.abs(box.y + box.height / 2 - SPRITE_SIZE / 2)
  if (dx > SPRITE_SIZE * 0.08 || dy > SPRITE_SIZE * 0.08) {
    fail(`${v.file}: 内容偏出中心 (${dx.toFixed(0)}, ${dy.toFixed(0)})px`)
  }
}

// ---------- 目录与清单对得上 ----------

const onDisk = readdirSync(IMG_DIR).filter((f) => f.endsWith('.png'))
for (const f of onDisk) if (!files.has(f)) fail(`img/flowers/${f} 不在清单里`)
for (const f of files) if (!onDisk.includes(f)) fail(`清单里的 ${f} 没有对应文件`)

const manifest = JSON.parse(readFileSync(IMG_DIR + 'manifest.json', 'utf8'))
if (manifest.count !== FLOWER_COUNT) fail(`manifest.json 记了 ${manifest.count} 条，清单里是 ${FLOWER_COUNT} 条`)
if (manifest.size !== SPRITE_SIZE) fail(`manifest.json 边长 ${manifest.size} 与 SPRITE_SIZE ${SPRITE_SIZE} 不一致`)

// ---------- 抽花逻辑 ----------

for (const r of [0, 0.5, 0.999999]) {
  const v = pickFlower(() => r)
  if (!v || !files.has(v.file)) fail(`pickFlower(${r}) 抽到了无效花种`)
}
if (pickFlower(() => 1) !== FLOWERS[FLOWER_COUNT - 1]) fail('pickFlower 在 rand=1 时越界')

if (failed) {
  console.error(`✗ ${failed} 处失败`)
  process.exit(1)
}
console.log(
  `✓ ${FLOWER_COUNT} 个花种全部通过 · ${bySpecies.size} 种花 · ` +
  `共 ${(totalBytes / 1024 / 1024).toFixed(2)} MB（单张 ${(smallest / 1024).toFixed(1)}~${(largest / 1024).toFixed(1)} KB）`
)
