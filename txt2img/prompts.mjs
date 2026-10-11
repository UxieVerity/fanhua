// 花种清单。每行一个花种：index 是网格序号 —— 一种花正好占一张 2×2 网格图
// （4 种颜色铺满 4 格），生成脚本用 --index 按这个序号指定生成范围。
// STYLE 后缀固定不变，保证所有图落在同一种画风里。

const STYLE =
  '手绘彩色铅笔插画风格，正视图俯视花朵，只有花朵本体（花冠），' +
  '没有花茎、叶片、枝条和背景装饰，花朵完整居中，背景为纯白色，' +
  '细腻的铅笔勾线与柔和渐变上色，纸面质感，插画感，画面干净'

// index 从 1 连续编到 50；加新花种接着最大的 index 往下写即可。
export const SPECIES = [
  { index: 1,  key: 'daisy',        cn: '雏菊',     colors: ['白色', '淡粉色', '淡黄色', '淡紫色'] },
  { index: 2,  key: 'rose',         cn: '玫瑰',     colors: ['深红色', '粉色', '香槟白色', '橙色'] },
  { index: 3,  key: 'tulip',        cn: '郁金香',   colors: ['红色', '黄色', '紫色', '白色'] },
  { index: 4,  key: 'sakura',       cn: '樱花',     colors: ['淡粉色', '白色', '深粉色', '淡黄绿色'] },
  { index: 5,  key: 'sunflower',    cn: '向日葵',   colors: ['金黄色', '橙黄色', '浅黄色', '暗红棕色'] },
  { index: 6,  key: 'lotus',        cn: '莲花',     colors: ['粉色', '白色', '淡紫色', '淡蓝色'] },
  { index: 7,  key: 'chrysanth',    cn: '菊花',     colors: ['黄色', '白色', '紫色', '粉色'] },
  { index: 8,  key: 'pansy',        cn: '三色堇',   colors: ['紫黄双色', '蓝紫色', '橙黄色', '红黄双色'] },
  { index: 9,  key: 'hydrangea',    cn: '绣球花',   colors: ['蓝色', '粉色', '紫色', '白绿色'] },
  { index: 10, key: 'bellflower',   cn: '风铃草',   colors: ['蓝紫色', '白色', '粉色', '淡紫色'] },
  { index: 11, key: 'peony',        cn: '芍药',     colors: ['粉色', '白色', '深红色', '珊瑚色'] },
  { index: 12, key: 'treepeony',    cn: '牡丹',     colors: ['深粉色', '白色', '紫红色', '淡黄色'] },
  { index: 13, key: 'lisianthus',   cn: '洋桔梗',   colors: ['白色', '粉色', '紫色', '淡绿色'] },
  { index: 14, key: 'iris',         cn: '鸢尾',     colors: ['蓝紫色', '紫色', '黄色', '白色'] },
  { index: 15, key: 'lily',         cn: '百合',     colors: ['白色', '粉色', '橙色', '黄色'] },
  { index: 16, key: 'carnation',    cn: '康乃馨',   colors: ['粉色', '红色', '白色', '淡黄色'] },
  { index: 17, key: 'freesia',      cn: '小苍兰',   colors: ['黄色', '白色', '粉色', '橙色'] },
  { index: 18, key: 'hibiscus',     cn: '木槿',     colors: ['红色', '粉色', '白色', '橙黄色'] },
  { index: 19, key: 'camellia',     cn: '山茶花',   colors: ['红色', '粉色', '白色', '红白复色'] },
  { index: 20, key: 'balloon',      cn: '桔梗',     colors: ['蓝紫色', '白色', '粉色', '淡紫色'] },
  { index: 21, key: 'cornflower',   cn: '矢车菊',   colors: ['蓝色', '紫色', '粉色', '白色'] },
  { index: 22, key: 'cosmos',       cn: '波斯菊',   colors: ['粉色', '白色', '深红色', '橙黄色'] },
  { index: 23, key: 'magnolia',     cn: '玉兰',     colors: ['白色', '粉色', '紫色', '淡黄色'] },
  { index: 24, key: 'dahlia',       cn: '大丽花',   colors: ['红色', '黄色', '紫色', '白色'] },
  { index: 25, key: 'anemone',      cn: '银莲花',   colors: ['红色', '白色', '蓝紫色', '粉色'] },
  { index: 26, key: 'gerbera',      cn: '非洲菊',   colors: ['橙红色', '明黄色', '粉色', '白色'] },
  { index: 27, key: 'plumeria',     cn: '鸡蛋花',   colors: ['白色', '粉红色', '红黄色', '淡黄色'] },
  { index: 28, key: 'ranunculus',   cn: '花毛茛',   colors: ['橙色', '粉色', '黄色', '白色'] },
  { index: 29, key: 'aster',        cn: '翠菊',     colors: ['蓝紫色', '粉色', '白色', '正红色'] },
  { index: 30, key: 'daffodil',     cn: '水仙',     colors: ['黄色', '白色', '橙黄色', '奶白色'] },
  { index: 31, key: 'waterlily',    cn: '睡莲',     colors: ['粉红色', '鹅黄色', '淡紫色', '纯白色'] },
  { index: 32, key: 'poppy',        cn: '虞美人',   colors: ['正红色', '粉色', '橙红色', '白色'] },
  { index: 33, key: 'fuchsia',      cn: '倒挂金钟', colors: ['红紫双色', '粉紫色', '红白色', '紫白色'] },
  { index: 34, key: 'bleedingheart', cn: '荷包牡丹', colors: ['粉色', '纯白色', '淡红色', '红白色'] },
  { index: 35, key: 'crocus',       cn: '番红花',   colors: ['蓝紫色', '明黄色', '白色', '淡紫色'] },
  { index: 36, key: 'daylily',      cn: '萱草',     colors: ['橙黄色', '正红色', '淡黄色', '红橙色'] },
  { index: 37, key: 'alstroemeria', cn: '六出花',   colors: ['橙色', '粉色', '黄色', '白色'] },
  { index: 38, key: 'amaryllis',    cn: '朱顶红',   colors: ['正红色', '粉色', '纯白色', '橙红色'] },
  { index: 39, key: 'phalaenopsis', cn: '蝴蝶兰',   colors: ['白色', '粉紫色', '明黄色', '紫红色'] },
  { index: 40, key: 'cyclamen',     cn: '仙客来',   colors: ['粉红色', '正红色', '纯白色', '淡紫色'] },
  { index: 41, key: 'petunia',      cn: '矮牵牛',   colors: ['蓝紫色', '粉红色', '紫红色', '纯白色'] },
  { index: 42, key: 'marigold',     cn: '万寿菊',   colors: ['橙黄色', '金黄色', '明黄色', '橙红色'] },
  { index: 43, key: 'gentian',      cn: '龙胆',     colors: ['深蓝色', '蓝紫色', '粉紫色', '纯白色'] },
  { index: 44, key: 'hollyhock',    cn: '蜀葵',     colors: ['粉红色', '深红色', '紫红色', '淡黄色'] },
  { index: 45, key: 'gloxinia',     cn: '大岩桐',   colors: ['红紫色', '蓝紫色', '粉红色', '纯白色'] },
  { index: 46, key: 'africanviolet', cn: '非洲堇',  colors: ['蓝紫色', '粉紫色', '纯白色', '深紫色'] },
  { index: 47, key: 'bluebell',     cn: '蓝铃花',   colors: ['蓝紫色', '淡蓝色', '粉紫色', '纯白色'] },
  { index: 48, key: 'plum',         cn: '梅花',     colors: ['淡粉色', '正红色', '纯白色', '深粉色'] },
  { index: 49, key: 'begonia',      cn: '秋海棠',   colors: ['粉红色', '正红色', '淡黄色', '纯白色'] },
  { index: 50, key: 'calendula',    cn: '金盏菊',   colors: ['明黄色', '橙黄色', '淡黄色', '金橙色'] },
]

// 按 index 排好的花种清单，顺便查重 —— 后面的编号、打包都靠这个顺序
function sortedSpecies() {
  const seen = new Set()
  for (const sp of SPECIES) {
    if (seen.has(sp.index)) throw new Error(`花种序号 ${sp.index} 重复（${sp.cn}）`)
    seen.add(sp.index)
  }
  return [...SPECIES].sort((a, b) => a.index - b.index)
}

// 把花种清单展开成逐朵任务，编号从 startId 连续往后排
function tasksFrom(startId) {
  const tasks = []
  let n = startId - 1
  for (const sp of sortedSpecies()) {
    for (const color of sp.colors) {
      n++
      const id = String(n).padStart(3, '0')
      const colorCn = color.replace(/(双色|色)$/, '') || color
      tasks.push({
        id,
        index: sp.index,
        file: `${id}-${sp.key}-${colorCn}.png`,
        name: `${sp.cn}·${color.replace(/色$/, '')}`,
        species: sp.cn,
        color,
        // 网格 prompt 里的逐格描述
        flower: `一朵${color}的${sp.cn}`,
      })
    }
  }
  return tasks
}

// 全部任务：200 朵，编号 001~200 连续
export function buildTasks() {
  return tasksFrom(1)
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
    '不要投影和阴影，花朵使用细黑线描边，白色底色，' +
    STYLE
  )
}

// 一个花种打包成一张网格任务，网格 id 直接取自花种的 index（g01、g30…）。
// 一格一种花色，所以一种花必须正好 grid² 种颜色，否则会被网格从中间切断
// —— 直接报错提醒改清单。
// 默认 grid=2：文生图接口单张上限 2048，想要 1024×1024 的子图（切出来
// 更清楚、抠图边缘更干净），一张只能装 2×2=4 朵，一种花正好一张。
export function buildGrids(grid = 2, cell = 1024) {
  const all = tasksFrom(1)
  const per = grid * grid
  return sortedSpecies().map((sp) => {
    if (sp.colors.length !== per) {
      throw new Error(`「${sp.cn}」有 ${sp.colors.length} 种颜色，装不进 ${grid}×${grid} 网格，会被从中间切断`)
    }
    const chunk = all.filter((t) => t.index === sp.index)
    return {
      id: `g${String(sp.index).padStart(2, '0')}`,
      grid,
      cell,
      tasks: chunk,
      prompt: gridPrompt(chunk, grid, cell),
    }
  })
}
