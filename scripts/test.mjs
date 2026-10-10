// 快速自检：图库至少 100 张、清单自洽、每张都是尺寸正确的无损 WebP
//
// 注意这里查不了「花有没有被裁断、背景抠干净没」—— 那种检查要看到像素，
// 而发布出去的只有 WebP，本项目零依赖、没有 WebP 解码器。几何体检放在生成时做，
// 见 scripts/png.mjs 的 auditSprite。这个脚本管的是清单与文件是否对得上、
// 以及贴图有没有被换编码/改尺寸。
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FLOWERS, FLOWER_COUNT, SPRITE_SIZE, pickFlower } from '../src/flowers.js'

const IMG_DIR = fileURLToPath(new URL('../img/flowers/', import.meta.url))

let failed = 0
const fail = (msg) => {
  console.error(`✗ ${msg}`)
  failed++
}

console.log(`花种总数: ${FLOWER_COUNT}  贴图边长: ${SPRITE_SIZE}`)
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

// 文件名格式：编号-花名-颜色.webp
for (const v of FLOWERS) {
  if (!/^\d{3}-[a-z]+-.+\.webp$/.test(v.file)) fail(`文件名不合规: ${v.file}`)
  if (!v.file.startsWith(v.id)) fail(`文件名与编号对不上: ${v.id} / ${v.file}`)
}

// ---------- 贴图文件 ----------

// VP8L 头：1 字节签名 0x2F，紧接 4 字节小端位流 ——
// 低 14 位是「宽 - 1」，接着 14 位是「高 - 1」，再往后是 alpha 标记与版本号。
// 没有解码器也能拿到尺寸，够用了。
function vp8lSize(buf) {
  const bits = buf[21] | (buf[22] << 8) | (buf[23] << 16) | (buf[24] << 24)
  return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
}

let totalBytes = 0
let smallest = Infinity
let largest = 0
const seen = new Set() // 见过的文件名，用来查孤儿；不合格的也算见过，免得重复报错

for (const v of FLOWERS) {
  const name = v.file
  const path = IMG_DIR + name
  if (!existsSync(path)) {
    fail(`缺图: ${name}`)
    continue
  }
  seen.add(name)

  const buf = readFileSync(path)
  if (buf.subarray(0, 4).toString('latin1') !== 'RIFF' || buf.subarray(8, 12).toString('latin1') !== 'WEBP') {
    fail(`${name}: 不是 WebP 文件`)
    continue
  }

  // 主 chunk 必须是 VP8L。掉成 VP8/VP8X 就是有损编码了，多半是转码参数被改坏
  // —— 见 scripts/webp.mjs 文件头记的那两个 ffmpeg 的坑。
  const fourCC = buf.subarray(12, 16).toString('latin1')
  if (fourCC !== 'VP8L') {
    fail(`${name}: 不是无损 WebP（主 chunk 是 ${fourCC}）`)
    continue
  }

  const { width, height } = vp8lSize(buf)
  if (width !== SPRITE_SIZE || height !== SPRITE_SIZE) {
    fail(`${name}: 尺寸 ${width}x${height}，应为 ${SPRITE_SIZE}`)
    continue
  }

  totalBytes += buf.length
  smallest = Math.min(smallest, buf.length)
  largest = Math.max(largest, buf.length)
}

// ---------- 目录与清单对得上 ----------

const onDisk = readdirSync(IMG_DIR).filter((f) => f.endsWith('.webp'))
for (const f of onDisk) if (!seen.has(f)) fail(`img/flowers/${f} 不在清单里`)
for (const v of FLOWERS) if (!onDisk.includes(v.file)) fail(`清单里的 ${v.file} 没有对应文件`)

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
  `✓ ${FLOWER_COUNT} 个花种全部通过 · ${bySpecies.size} 种花\n` +
  `  无损 WebP 共 ${(totalBytes / 1024 / 1024).toFixed(2)} MB` +
  `（单张 ${(smallest / 1024).toFixed(1)}~${(largest / 1024).toFixed(1)} KB，均 ${SPRITE_SIZE}px）`
)
