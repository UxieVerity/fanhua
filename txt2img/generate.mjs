// 批量生图 → 处理成透明底贴图 → 写 img/flowers/ 与 src/flowers.js
//
// 新批次走「网格模式」：文生图按张计费，单张上限 2048×2048。
// 一张 2048×2048 塞 2×2 = 4 朵花（每格 1024×1024），切开后再逐朵走
// 抠图管线，单朵成本摊薄 4 倍 —— 早期是 4×4=16 朵、每格 512，
// 子图翻大两倍后抠图边缘质量明显更好，代价是摊薄倍数降了。
// prompt 要求纯黑底；白底老图和模型真给透明 alpha 的图也都能处理
//（黑底自动反色成白底再抠，见 scripts/png.mjs 的 normalizeBackground）。
//
//   node txt2img/generate.mjs                 # 补齐缺的（raw 在就不再调接口）
//   node txt2img/generate.mjs --limit 1       # 只跑第一张网格图（试水）
//   node txt2img/generate.mjs --only g01      # 只跑指定网格（逗号分隔可多个）
//   node txt2img/generate.mjs --force         # 无视 raw 重新调接口（重新花钱）
//   node txt2img/generate.mjs --from-raw      # 不调接口，拿 txt2img/raw/ 重跑处理管线
//   node txt2img/generate.mjs --emit-only     # 不调接口，只按现有成品重新生成清单
//   --grid 2 --cell 1024 --size 2048x2048     # 网格规格与出图尺寸（默认即此）
//
// 001~100 是旧的单花模式产物，raw/ 里已有原图，同样「缺成品时先复用 raw、不花钱」；
// 只有连 raw 都没有的才会按单花 prompt 调一次接口。
//
// 网格原图的文件名带上网格规格（g01-2x1024.png），不同规格切法不同，
// 混用会把一张图切错 —— 旧规格的 g01.png（4×4）留在原地不被新代码引用。
//
// 三段产物：raw/ 约 190MB 不进版本库（本机保留，贵，别丢），其余进版本库：
//   txt2img/raw/       生图的原始 PNG —— 网格图 g01-2x1024.png…、旧单花 001.png…（贵，别丢）
//   txt2img/sprites/   处理好的 256px 透明底 PNG（中间产物）
//   img/flowers/       发布出去的无损 WebP
//
// 中间那段的 PNG 是给 scripts/webp.mjs 吃的，也是唯一还能做几何体检的地方 ——
// 发布出去的 WebP 本项目解不开（零依赖，没有 WebP 解码器）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildTasks, buildGrids } from './prompts.mjs'
import { textToImage, loadApiKey, pool } from './api.mjs'
import { decodePng, crop, toFlowerSprite, encodePng, auditSprite } from '../scripts/png.mjs'
import { encodeAll } from '../scripts/webp.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RAW_DIR = fileURLToPath(new URL('./raw/', import.meta.url))
const SPRITE_DIR = fileURLToPath(new URL('./sprites/', import.meta.url))
const OUT_DIR = fileURLToPath(new URL('../img/flowers/', import.meta.url))
const SPRITE_SIZE = 256
const PAD = 0.06

// ---------- 命令行 ----------

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const has = (name) => argv.includes(`--${name}`)

const LIMIT = Number(flag('limit', 0)) || Infinity
const CONCURRENCY = Number(flag('concurrency', 4))
const FORCE = has('force')
const EMIT_ONLY = has('emit-only')
const GRID = Number(flag('grid', 2))
const CELL = Number(flag('cell', 1024))
const SIZE = flag('size', '')
// 接口单张上限 2048，默认规格超了就按上限出图（切图按实际宽高算，不会错位）
const canvas = Math.min(GRID * CELL, 2048)
const GRID_SIZE = SIZE || `${canvas}x${canvas}`
const SINGLE_SIZE = SIZE || '1024x1024'

mkdirSync(RAW_DIR, { recursive: true })
mkdirSync(SPRITE_DIR, { recursive: true })
mkdirSync(OUT_DIR, { recursive: true })

const tasks = buildTasks()
let grids = buildGrids(GRID).slice(0, LIMIT)
const ONLY = flag('only', '')
if (ONLY) {
  const want = new Set(ONLY.split(','))
  grids = grids.filter((g) => want.has(g.id))
  if (!grids.length) {
    console.error(`✗ --only ${ONLY} 没匹配到任何网格，可选：${buildGrids(GRID).map((g) => g.id).join(' ')}`)
    process.exit(1)
  }
}

// 发布出去的是 .webp，所以「这张图有没有」看的是 WebP
const outPath = (file) => `${OUT_DIR}${file.replace(/\.png$/, '.webp')}`
const gridTaskIds = new Set(grids.flatMap((g) => g.tasks.map((t) => t.id)))
// --only 圈定网格范围时，单花批次整个退出本次运行 —— 否则 --force 会把
// 范围外的任务（包括全部老单花）也当成「缺成品」全量重调接口
const singles = ONLY ? [] : tasks.filter((t) => !gridTaskIds.has(t.id))

// ---------- 处理管线 ----------

// 抠图 → 存中间产物 → 体检。img 可以是 PNG Buffer，也可以是已解码/切好的图。
// 体检有问题就直接抛 —— 宁可这轮生图失败，也不能让一张被裁断/没抠干净的图
// 悄悄流到 img/flowers/ 去。
function processSprite(task, img) {
  const sprite = toFlowerSprite(img, SPRITE_SIZE, PAD)
  const png = encodePng(sprite.data, sprite.width, sprite.height)
  writeFileSync(`${SPRITE_DIR}${task.file}`, png)

  const bad = auditSprite(sprite, SPRITE_SIZE)
  if (bad) throw new Error(`${task.file}: ${bad}`)
  return { kb: png.length / 1024 }
}

// 一张网格原图切成 grid×grid 块，每块一朵，顺序与 prompt 里的逐格点名一致
// 原图文件名带上网格规格，不同规格的原图不会串
const gridRawPath = (g) => `${RAW_DIR}${g.id}-${g.grid}x${g.cell}.png`

function processGrid(g) {
  const img = decodePng(readFileSync(gridRawPath(g)))
  const { width: w, height: h } = img
  if (w !== h || w % g.grid !== 0) {
    throw new Error(`${gridRawPath(g)} 是 ${w}x${h}，切不出 ${g.grid}×${g.grid} 的正方网格`)
  }
  const cell = w / g.grid
  g.tasks.forEach((task, i) => {
    const tile = crop(img, (i % g.grid) * cell, Math.floor(i / g.grid) * cell, cell, cell)
    processSprite(task, tile)
  })
  return { cell }
}

// ---------- 生成 ----------

if (has('from-raw')) {
  // 不调接口：单花原图 + 网格原图都重跑处理管线
  // （改了抠图/压缩参数后用这个，不用重新花钱生图）
  const rawSingles = singles.filter((t) => existsSync(`${RAW_DIR}${t.id}.png`))
  const rawGrids = grids.filter((g) => existsSync(gridRawPath(g)))
  console.log(`从 raw 重跑处理管线：单花 ${rawSingles.length} 张，网格 ${rawGrids.length} 张`)
  let n = 0
  for (const task of rawSingles) {
    const info = processSprite(task, readFileSync(`${RAW_DIR}${task.id}.png`))
    n++
    console.log(`[${String(n).padStart(3)}/${rawSingles.length + rawGrids.length * GRID * GRID}] ${task.id} ${task.name}  ${info.kb.toFixed(1)}KB`)
  }
  for (const g of rawGrids) {
    const { cell } = processGrid(g)
    n += g.tasks.length
    console.log(`[${String(n).padStart(3)}/${rawSingles.length + rawGrids.length * GRID * GRID}] ${g.id}  ${g.tasks.length} 朵 × ${cell}px`)
  }
} else if (!EMIT_ONLY) {
  const key = loadApiKey()

  // 网格批次：有花缺成品才动；raw 已在就复用原图，只重跑处理
  const todoGrids = grids.filter((g) => g.tasks.some((t) => FORCE || !existsSync(outPath(t.file))))
  console.log(
    `网格模式 ${GRID}×${GRID}（每格 ${GRID * 512}px），共 ${grids.length} 张，` +
    `待生成 ${todoGrids.length} 张，并发 ${CONCURRENCY}，尺寸 ${GRID_SIZE}`
  )
  await pool(todoGrids, CONCURRENCY, async (g) => {
    const t0 = Date.now()
    const reused = !FORCE && existsSync(gridRawPath(g))
    if (!reused) {
      const png = await textToImage(g.prompt, { key, size: GRID_SIZE })
      writeFileSync(gridRawPath(g), png)
    }
    const { cell } = processGrid(g)
    console.log(
      `[${g.id}] ${g.tasks.length} 朵 × ${cell}px  ${reused ? '（复用原图）' : ''}  ` +
      `${((Date.now() - t0) / 1000).toFixed(1)}s`
    )
  })

  // 旧单花批次：同样缺成品才动，raw 在就复用
  const todoSingles = singles.filter((t) => FORCE || !existsSync(outPath(t.file)))
  if (todoSingles.length) {
    console.log(`单花模式待生成 ${todoSingles.length} 张，尺寸 ${SINGLE_SIZE}`)
  }
  await pool(todoSingles, CONCURRENCY, async (task) => {
    const t0 = Date.now()
    if (FORCE || !existsSync(`${RAW_DIR}${task.id}.png`)) {
      const png = await textToImage(task.prompt, { key, size: SINGLE_SIZE })
      writeFileSync(`${RAW_DIR}${task.id}.png`, png)
    }
    const info = processSprite(task, readFileSync(`${RAW_DIR}${task.id}.png`))
    console.log(
      `[${task.id}] ${task.name}  ${info.kb.toFixed(1)}KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`
    )
  })
}

// ---------- 转成发布用的 WebP ----------
// 要 ffmpeg。没有就到此为止 —— 中间产物在 txt2img/sprites/，装完再跑
// node scripts/webp.mjs 补上就行，不用重新生图。
try {
  const r = encodeAll({ force: true })
  for (const p of r.problems) console.error(`  ✗ ${p}`)
  if (r.problems.length) process.exitCode = 1
  console.log(
    `✓ img/flowers/ 共 ${r.files} 张 WebP，合计 ${(r.webpBytes / 1024 / 1024).toFixed(2)} MB ` +
    `(比 PNG 少 ${((1 - r.webpBytes / r.pngBytes) * 100).toFixed(1)}%)`
  )
} catch (err) {
  console.error(`✗ ${err.message}`)
  console.error('  中间产物在 txt2img/sprites/，装好 ffmpeg 后跑 node scripts/webp.mjs 即可补上')
  process.exit(1)
}

// ---------- 写清单与 src/flowers.js ----------

const entries = buildTasks()
  .filter((t) => existsSync(outPath(t.file)))
  .map((t) => ({ id: t.id, name: t.name, species: t.species, file: t.file.replace(/\.png$/, '.webp') }))

writeFileSync(
  `${OUT_DIR}manifest.json`,
  JSON.stringify({ size: SPRITE_SIZE, count: entries.length, flowers: entries }, null, 2) + '\n'
)

const lines = entries.map(
  (e) => `  { id: '${e.id}', name: '${e.name}', species: '${e.species}', file: '${e.file}' },`
)
writeFileSync(
  `${ROOT}src/flowers.js`,
  `// 花朵图库清单 —— 由 txt2img/generate.mjs 生成，不要手改。
// 贴图在 img/flowers/ 下，共 ${entries.length} 张，${SPRITE_SIZE}x${SPRITE_SIZE} 透明底无损 WebP。
// 命名规则：编号-花名-颜色.webp，同一种花有多种颜色。

export const SPRITE_SIZE = ${SPRITE_SIZE}

export const FLOWERS = [
${lines.join('\n')}
]

export const FLOWER_COUNT = FLOWERS.length

// 随机抽一朵；传入 rand 可换成自己的随机源（便于测试复现）
export function pickFlower(rand = Math.random) {
  return FLOWERS[Math.min(FLOWER_COUNT - 1, Math.floor(rand() * FLOWER_COUNT))]
}
`
)

console.log(`✓ src/flowers.js 已更新（${entries.length} 条）`)
