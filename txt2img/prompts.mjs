// 花种清单。后缀固定不变，保证所有图落在同一种画风里（与 img/daisy.png 那张参考图一致）

const STYLE =
  '手绘彩色铅笔插画风格，正视图俯视花朵，只有花朵本体（花冠），' +
  '没有花茎、叶片、枝条和背景装饰，花朵完整居中，背景为纯黑色，' +
  '细腻的铅笔勾线与柔和渐变上色，纸面质感，插画感，画面干净'

// 第一批：25 种花 × 4 色，旧的单花模式逐张生成的 001~100
export const SPECIES = [
  { key: 'daisy',        cn: '雏菊',   colors: ['白色', '淡粉色', '淡黄色', '淡紫色'] },
  { key: 'rose',         cn: '玫瑰',   colors: ['深红色', '粉色', '香槟白色', '橙色'] },
  { key: 'tulip',        cn: '郁金香', colors: ['红色', '黄色', '紫色', '白色'] },
  { key: 'sakura',       cn: '樱花',   colors: ['淡粉色', '白色', '深粉色', '淡黄绿色'] },
  { key: 'sunflower',    cn: '向日葵', colors: ['金黄色', '橙黄色', '浅黄色', '暗红棕色'] },
  { key: 'lotus',        cn: '莲花',   colors: ['粉色', '白色', '淡紫色', '淡蓝色'] },
  { key: 'chrysanth',    cn: '菊花',   colors: ['黄色', '白色', '紫色', '粉色'] },
  { key: 'pansy',        cn: '三色堇', colors: ['紫黄双色', '蓝紫色', '橙黄色', '红黄双色'] },
  { key: 'hydrangea',    cn: '绣球花', colors: ['蓝色', '粉色', '紫色', '白绿色'] },
  { key: 'bellflower',   cn: '风铃草', colors: ['蓝紫色', '白色', '粉色', '淡紫色'] },
  { key: 'peony',        cn: '芍药',   colors: ['粉色', '白色', '深红色', '珊瑚色'] },
  { key: 'treepeony',    cn: '牡丹',   colors: ['深粉色', '白色', '紫红色', '淡黄色'] },
  { key: 'lisianthus',   cn: '洋桔梗', colors: ['白色', '粉色', '紫色', '淡绿色'] },
  { key: 'iris',         cn: '鸢尾',   colors: ['蓝紫色', '紫色', '黄色', '白色'] },
  { key: 'lily',         cn: '百合',   colors: ['白色', '粉色', '橙色', '黄色'] },
  { key: 'carnation',    cn: '康乃馨', colors: ['粉色', '红色', '白色', '淡黄色'] },
  { key: 'freesia',      cn: '小苍兰', colors: ['黄色', '白色', '粉色', '橙色'] },
  { key: 'hibiscus',     cn: '木槿',   colors: ['红色', '粉色', '白色', '橙黄色'] },
  { key: 'camellia',     cn: '山茶花', colors: ['红色', '粉色', '白色', '红白复色'] },
  { key: 'balloon',      cn: '桔梗',   colors: ['蓝紫色', '白色', '粉色', '淡紫色'] },
  { key: 'cornflower',   cn: '矢车菊', colors: ['蓝色', '紫色', '粉色', '白色'] },
  { key: 'cosmos',       cn: '波斯菊', colors: ['粉色', '白色', '深红色', '橙黄色'] },
  { key: 'magnolia',     cn: '玉兰',   colors: ['白色', '粉色', '紫色', '淡黄色'] },
  { key: 'dahlia',       cn: '大丽花', colors: ['红色', '黄色', '紫色', '白色'] },
  { key: 'anemone',      cn: '银莲花', colors: ['红色', '白色', '蓝紫色', '粉色'] },
]

// 第二批花种：刻意挑的都不在上面库里（避免和已有鲜花重复），编号续接 101 起。
// 新花种按「每格一种花色」打包进 4×4 网格图，一张 2048×2048 出 16 朵（每格 512×512）。
// 加新花种时往数组里追加即可，每 4 种正好铺满一张网格图。
export const SPECIES_EXTRA = [
  { key: 'gerbera',    cn: '非洲菊',   colors: ['橙红色', '明黄色', '粉色', '白色'] },
  { key: 'plumeria',   cn: '鸡蛋花',   colors: ['白色', '粉红色', '红黄色', '淡黄色'] },
  { key: 'ranunculus', cn: '花毛茛',   colors: ['橙色', '粉色', '黄色', '白色'] },
  { key: 'aster',      cn: '翠菊',     colors: ['蓝紫色', '粉色', '白色', '正红色'] },
]

const START_ID_EXTRA = SPECIES.length * 4 + 1

// 从一份花种清单展开成逐朵任务，编号从 startId 连续往后排
function tasksFrom(speciesList, startId) {
  const tasks = []
  let n = startId - 1
  for (const sp of speciesList) {
    for (const color of sp.colors) {
      n++
      const id = String(n).padStart(3, '0')
      const colorCn = color.replace(/(双色|色)$/, '') || color
      tasks.push({
        id,
        file: `${id}-${sp.key}-${colorCn}.png`,
        name: `${sp.cn}·${color.replace(/色$/, '')}`,
        species: sp.cn,
        color,
        // 单花 prompt（旧模式）与网格 prompt 里的逐格描述共用这一句
        flower: `一朵${color}的${sp.cn}`,
        prompt: `一朵${color}的${sp.cn}，${STYLE}`,
      })
    }
  }
  return tasks
}

// 全部任务：001~100（第一批，旧单花模式）+ 101 起（新批次，走网格模式）
export function buildTasks() {
  return [...tasksFrom(SPECIES, 1), ...tasksFrom(SPECIES_EXTRA, START_ID_EXTRA)]
}

// 网格 prompt：逐格点名，格子按行优先编号（左上第 1 格），
// 这个顺序就是切图时的切块顺序，两边必须一致。
function gridPrompt(chunk, grid, cell) {
  const cells = chunk.map((t, i) => {
    const row = Math.floor(i / grid) + 1
    const col = (i % grid) + 1
    return `${row}行${col}列是${t.flower}`
  })
  return (
    `一张 ${grid * cell}×${grid * cell} 均匀网格排布的插画图，共 ${grid * grid} 朵不同的花，` +
    `每格 ${cell}×${cell}，每格正好一朵，花朵大小相近：` +
    cells.join('；') +
    '。每朵花都画在各自格子的正中央，花朵完整不裁切，花与花之间、格与格之间留出明显的空白间隔，' +
    '任何花都不要越过格子边界或碰到邻格的花，画面上不要出现网格线、边框线、分隔线和任何文字、数字、编号，' +
    '不要投影和阴影，格子间隙和图片边缘都要保持纯黑色背景，不要白色底色，' +
    STYLE
  )
}

// 把新批次任务按 grid×grid 张打包成网格任务。一格一种花色，
// 所以一种花必须正好有 grid 种颜色，否则会被网格从中间切断 —— 直接报错提醒改清单。
// 默认 grid=2：文生图接口单张上限 2048，想要 1024×1024 的子图（切出来
// 更清楚、抠图边缘更干净），一张只能装 2×2=4 朵，一种花正好一张。
export function buildGrids(grid = 2, cell = 1024) {
  const all = tasksFrom(SPECIES_EXTRA, START_ID_EXTRA)
  const per = grid * grid
  const batches = []
  for (let i = 0; i < all.length; i += per) {
    const chunk = all.slice(i, i + per)
    if (chunk.length !== per) {
      throw new Error(`新增花种共 ${all.length} 朵，凑不满 ${grid}×${grid}=${per} 朵一整张（差 ${per - chunk.length} 朵）`)
    }
    const counts = {}
    for (const t of chunk) counts[t.species] = (counts[t.species] || 0) + 1
    for (const t of chunk) {
      const sp = SPECIES_EXTRA.find((s) => s.cn === t.species)
      if (counts[t.species] !== sp.colors.length) {
        throw new Error(`「${t.species}」有 ${sp.colors.length} 种颜色，装不进 ${grid}×${grid} 网格，会被从中间切断`)
      }
    }
    batches.push({
      id: `g${String(batches.length + 1).padStart(2, '0')}`,
      grid,
      cell,
      tasks: chunk,
      prompt: gridPrompt(chunk, grid, cell),
    })
  }
  return batches
}
