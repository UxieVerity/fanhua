// 快速自检：花种数量 ≥ 100，且每个花种都能渲染出合法 SVG
import { FLOWERS, FLOWER_COUNT, renderFlower } from '../src/flowers.js'

let failed = 0

console.log(`花种总数: ${FLOWER_COUNT}`)
if (FLOWER_COUNT < 100) {
  console.error('✗ 花种不足 100')
  process.exit(1)
}

const names = new Set()
for (let i = 0; i < FLOWER_COUNT; i++) {
  const v = FLOWERS[i]
  if (names.has(v.name)) {
    console.error(`✗ 花种名重复: ${v.name}`)
    failed++
  }
  names.add(v.name)

  for (let s = 0; s < 5; s++) {
    const svg = renderFlower(v, 80, i * 1000 + s)
    if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) {
      console.error(`✗ ${v.name} seed=${s}: SVG 结构不完整`)
      failed++
    }
    if (/NaN|undefined|Infinity/.test(svg)) {
      console.error(`✗ ${v.name} seed=${s}: SVG 中含 NaN/undefined`)
      failed++
    }
    // <use href="#id"> 与 url(#id) 都必须在本文档里解析得到，
    // 且 id 不能重复 —— 同页多朵花时 id 撞车会互相串色
    const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
    const idSet = new Set(ids)
    if (idSet.size !== ids.length) {
      console.error(`✗ ${v.name} seed=${s}: SVG 内有重复 id`)
      failed++
    }
    for (const m of svg.matchAll(/(?:url\(#|href="#)([^)"]+)/g)) {
      if (!idSet.has(m[1])) {
        console.error(`✗ ${v.name} seed=${s}: 引用了解析不到的 id #${m[1]}`)
        failed++
      }
    }
  }
}

// 同一种子配不同花型时，两朵花的 id 不能重叠（否则后一朵会取到前一朵的渐变/花瓣）
{
  const a = FLOWERS.find((v) => v.type === 'daisy')
  const b = FLOWERS.find((v) => v.type === 'poppy')
  const idsOf = (svg) => new Set([...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))
  const ia = idsOf(renderFlower(a, 80, 7))
  const ib = idsOf(renderFlower(b, 80, 7))
  const shared = [...ia].filter((x) => ib.has(x))
  if (shared.length) {
    console.error(`✗ 同种子不同花型存在 id 冲突: ${shared.slice(0, 3).join(', ')}`)
    failed++
  }
}

if (failed) {
  console.error(`✗ ${failed} 处失败`)
  process.exit(1)
}
console.log(`✓ ${FLOWER_COUNT} 个花种全部通过（每个 5 个随机种子）`)
