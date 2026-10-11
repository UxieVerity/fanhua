// 豆包 Seedream 文生图接口封装
// key 从仓库根的 .env 读（模板见 .env-example），进程环境变量里已有的则优先
// —— 密钥只存在一个地方，也不会进命令行
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

// 极简 .env 解析：每行 KEY=VALUE，# 开头是注释，值两边的引号剥掉；
// 只往缺失的环境变量里填，不覆盖已有的
function loadDotEnv() {
  const path = ROOT + '.env'
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m || process.env[m[1]] !== undefined) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadDotEnv()

const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
const MODEL = process.env.ARK_MODEL || 'doubao-seedream-5-0-flash-260915'

export function loadApiKey() {
  if (process.env.ARK_API_KEY) return process.env.ARK_API_KEY
  throw new Error('没有 API key：复制 .env-example 为 .env 并填入 ARK_API_KEY（或直接设同名环境变量）')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 生成一张图，返回 PNG Buffer
export async function textToImage(prompt, { key, size = '1024x1024', retries = 3 } = {}) {
  const body = JSON.stringify({
    model: MODEL,
    prompt,
    response_format: 'b64_json',
    output_format: 'png', // 默认吐 JPEG，显式要 PNG，省得自己解 JPEG
    size,
    watermark: false, // 水印关掉，省得回头再抠
    stream: false,
  })

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body,
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
      const json = JSON.parse(text)
      const item = json?.data?.[0]
      if (!item) throw new Error(`返回里没有图片: ${text.slice(0, 300)}`)
      if (item.b64_json) return Buffer.from(item.b64_json, 'base64')
      if (item.url) {
        const img = await fetch(item.url)
        if (!img.ok) throw new Error(`下载失败 HTTP ${img.status}`)
        return Buffer.from(await img.arrayBuffer())
      }
      throw new Error(`未知的返回格式: ${Object.keys(item).join(',')}`)
    } catch (err) {
      if (attempt >= retries) throw err
      const wait = 2000 * (attempt + 1)
      console.warn(`  ↻ 第 ${attempt + 1} 次失败（${err.message.slice(0, 120)}），${wait}ms 后重试`)
      await sleep(wait)
    }
  }
}

// 固定并发的任务池
export async function pool(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}
