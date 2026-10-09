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
  }
}

if (failed) {
  console.error(`✗ ${failed} 处失败`)
  process.exit(1)
}
console.log(`✓ ${FLOWER_COUNT} 个花种全部通过（每个 5 个随机种子）`)
