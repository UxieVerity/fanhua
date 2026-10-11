// 花朵图库清单 —— 由 txt2img/generate.mjs 生成，不要手改。
// 贴图在 img/flowers/ 下，共 0 张，256x256 透明底无损 WebP。
// 命名规则：编号-花名-颜色.webp，同一种花有多种颜色。

export const SPRITE_SIZE = 256

export const FLOWERS = [
]

export const FLOWER_COUNT = FLOWERS.length

// 随机抽一朵；传入 rand 可换成自己的随机源（便于测试复现）
export function pickFlower(rand = Math.random) {
  return FLOWERS[Math.min(FLOWER_COUNT - 1, Math.floor(rand() * FLOWER_COUNT))]
}
