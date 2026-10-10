// WebP 无损转码：把管线产出的 PNG 转成 WebP —— 后者才是发布出去的贴图。
//
//   node scripts/webp.mjs                          # txt2img/sprites/ → img/flowers/
//   node scripts/webp.mjs --force                  # 全部重转
//   node scripts/webp.mjs --verify                 # 转完再逐像素对一遍原图
//   node scripts/webp.mjs --in a/ --out b/         # 换目录
//
// 贴图只发 WebP。PNG 是本管线的中间产物，落在 txt2img/sprites/（不进版本库），
// 比 WebP 大三分之一，没有任何理由跟着发布。
//
// 为什么要转：PNG 内部已经是 deflate，再叠 gzip/brotli 基本没有收益（实测 -0.0%）。
// 真正省体积的是换编码 —— 这 100 张实测 7.85 MB → 5.33 MB（-32%），而且逐像素无损。
//
// 依赖系统里的 ffmpeg（见下面的安装提示）。两个坑，都踩过：
//
//   1. 必须显式 -pix_fmt bgra。不写的话 ffmpeg 会把 RGBA 转成 yuva420p，
//      色度被 4:2:0 降采样，那个「无损」是假的 —— 体积还会假性掉到 1/10，
//      看着特别诱人，实际花瓣边缘已经糊了。
//   2. 不能加 -preset。在这个 ffmpeg 构建上，任何 -preset 都会静默关掉 -lossless，
//      同样退化成 yuva420p 的有损编码，而且不报任何警告。
//
// 两个坑的症状是同一个：文件里的主 chunk 从 VP8L 变成 VP8 / VP8X。
// 所以下面转完会验一遍 fourCC，不是 VP8L 就当失败 —— 免得哪天 ffmpeg 换了行为，
// 悄悄出一整批有损图还没人发现。
import { readFileSync, existsSync, readdirSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { decodePng } from './png.mjs'

const SPRITE_DIR = fileURLToPath(new URL('../txt2img/sprites/', import.meta.url))
const OUT_DIR = fileURLToPath(new URL('../img/flowers/', import.meta.url))

// 无损 RGBA 的唯一正确组合，改动前先读文件头那两条注释
const ENCODE_ARGS = ['-pix_fmt', 'bgra', '-c:v', 'libwebp', '-lossless', '1', '-compression_level', '6']

const ffmpeg = (args) =>
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })

// 目录一律带尾分隔符，拼文件名时不用到处判断
const withSep = (dir) => (dir.endsWith(sep) ? dir : dir + sep)

const NO_FFMPEG = [
  '找不到 ffmpeg。装一个再跑：',
  '    Windows   winget install Gyan.FFmpeg',
  '    macOS     brew install ffmpeg',
  '    Linux     apt install ffmpeg',
].join('\n')

function requireFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  } catch {
    throw new Error(NO_FFMPEG)
  }
}

// 主 chunk 必须是 VP8L（WebP 的无损编码）。掉成 VP8 / VP8X 就是有损了（见文件头）。
// 直接读 fourCC 而不是问 ffprobe：ffprobe 报的是解码后的像素格式，
// 无损解出来叫 argb、有损带 alpha 解出来叫 bgra，反着记很容易搞错。
function isLossless(webp) {
  return readFileSync(webp).subarray(12, 16).toString('latin1') === 'VP8L'
}

// 逐像素对原图。全透明像素的 RGB 不参与渲染，libwebp 会把它们归一化掉，
// 所以只要求 alpha 全等、且 alpha>0 的像素 RGB 全等。
function diff(pngPath, webpPath, tmp) {
  const back = join(tmp, 'back.png')
  ffmpeg(['-i', webpPath, '-pix_fmt', 'rgba', back])
  const a = decodePng(readFileSync(pngPath))
  const b = decodePng(readFileSync(back))
  if (a.width !== b.width || a.height !== b.height) {
    return `尺寸 ${b.width}x${b.height}，应为 ${a.width}x${a.height}`
  }
  for (let p = 0; p < a.width * a.height; p++) {
    const i = p * 4
    if (a.data[i + 3] !== b.data[i + 3]) return `第 ${p} 个像素 alpha 不符`
    if (a.data[i + 3] === 0) continue
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) {
      return `第 ${p} 个像素 RGB 不符`
    }
  }
  return null
}

// 返回 { files, pngBytes, webpBytes, converted, reused, problems }
export function encodeAll({ inDir = SPRITE_DIR, outDir = OUT_DIR, force = false, verify = false } = {}) {
  requireFfmpeg()
  inDir = withSep(inDir)
  outDir = withSep(outDir)

  const names = readdirSync(inDir).filter((f) => f.endsWith('.png')).sort()
  if (!names.length) {
    throw new Error(`${inDir} 里没有 PNG —— 先跑 node txt2img/generate.mjs 产出贴图`)
  }
  mkdirSync(outDir, { recursive: true })

  const tmp = mkdtempSync(join(tmpdir(), 'fanhua-webp-'))
  const problems = []
  let pngBytes = 0
  let webpBytes = 0
  let converted = 0
  let reused = 0

  try {
    names.forEach((name, n) => {
      const pngPath = inDir + name
      const webpPath = outDir + name.replace(/\.png$/, '.webp')
      const pngSize = readFileSync(pngPath).length
      pngBytes += pngSize

      const tag = `[${String(n + 1).padStart(3)}/${names.length}] ${name}`

      if (!force && existsSync(webpPath)) {
        reused++
      } else {
        ffmpeg(['-i', pngPath, ...ENCODE_ARGS, webpPath])
        converted++
      }

      if (!isLossless(webpPath)) {
        problems.push(`${name}: 主 chunk 不是 VP8L —— 无损没生效，编成有损了`)
        return
      }

      const webpSize = readFileSync(webpPath).length
      webpBytes += webpSize

      if (verify) {
        const bad = diff(pngPath, webpPath, tmp)
        if (bad) {
          problems.push(`${name}: ${bad}`)
          return
        }
      }

      const saved = ((webpSize / pngSize - 1) * 100).toFixed(1)
      console.log(`${tag}  ${(pngSize / 1024).toFixed(1)}KB → ${(webpSize / 1024).toFixed(1)}KB  ${saved}%`)
    })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  return { files: names.length, pngBytes, webpBytes, converted, reused, problems }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const argv = process.argv.slice(2)
  const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : fallback
  }

  let r
  try {
    r = encodeAll({
      inDir: flag('in', SPRITE_DIR),
      outDir: flag('out', OUT_DIR),
      force: argv.includes('--force'),
      verify: argv.includes('--verify'),
    })
  } catch (err) {
    console.error(`✗ ${err.message}`)
    process.exit(1)
  }

  const MB = (b) => (b / 1024 / 1024).toFixed(2)
  console.log()
  console.log(`PNG   ${MB(r.pngBytes)} MB`)
  console.log(`WebP  ${MB(r.webpBytes)} MB  (${((r.webpBytes / r.pngBytes - 1) * 100).toFixed(1)}%)`)
  console.log(`转码 ${r.converted} 张，复用 ${r.reused} 张`)

  if (r.problems.length) {
    console.error(`\n✗ ${r.problems.length} 张有问题：`)
    for (const p of r.problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log('✓ 全部通过')
}
