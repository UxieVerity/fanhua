// 花朵图库清单 —— 由 txt2img/generate.ts 生成，不要手改。
// 源数据按花种压成一张表（一种花一行、4 色一列），加载时展开成逐朵的
// FLOWERS —— 运行时形态与逐朵写法完全一致，源码/打包体积缩到约 1/3。
// 贴图在 img/flowers/ 下，共 200 张，256x256 透明底无损 WebP。
// 命名规则：编号-花名-颜色.webp，同一种花有多种颜色。

export interface Flower {
  /** 编号，如 '001' */
  id: string
  /** 花名·颜色，如 '雏菊·白' */
  name: string
  /** 花种名，如 '雏菊' */
  species: string
  /** 贴图文件名（相对图库根） */
  file: string
}

export const SPRITE_SIZE = 256

// 一种花一行：cn 中文名、key 拼文件名用的英文、colors 花名里的颜色写法。
// 颜色以花名为准（如 '紫黄双'），文件名里的颜色自动去掉结尾的 '双'。
const SPECIES: { cn: string; key: string; colors: string[] }[] = [
  { cn: '雏菊', key: 'daisy', colors: ['白', '淡粉', '淡黄', '淡紫'] },
  { cn: '玫瑰', key: 'rose', colors: ['深红', '粉', '香槟白', '橙'] },
  { cn: '郁金香', key: 'tulip', colors: ['红', '黄', '紫', '白'] },
  { cn: '樱花', key: 'sakura', colors: ['淡粉', '白', '深粉', '淡黄绿'] },
  { cn: '向日葵', key: 'sunflower', colors: ['金黄', '橙黄', '浅黄', '暗红棕'] },
  { cn: '莲花', key: 'lotus', colors: ['粉', '白', '淡紫', '淡蓝'] },
  { cn: '菊花', key: 'chrysanth', colors: ['黄', '白', '紫', '粉'] },
  { cn: '三色堇', key: 'pansy', colors: ['紫黄双', '蓝紫', '橙黄', '红黄双'] },
  { cn: '绣球花', key: 'hydrangea', colors: ['蓝', '粉', '紫', '白绿'] },
  { cn: '风铃草', key: 'bellflower', colors: ['蓝紫', '白', '粉', '淡紫'] },
  { cn: '芍药', key: 'peony', colors: ['粉', '白', '深红', '珊瑚'] },
  { cn: '牡丹', key: 'treepeony', colors: ['深粉', '白', '紫红', '淡黄'] },
  { cn: '洋桔梗', key: 'lisianthus', colors: ['白', '粉', '紫', '淡绿'] },
  { cn: '鸢尾', key: 'iris', colors: ['蓝紫', '紫', '黄', '白'] },
  { cn: '百合', key: 'lily', colors: ['白', '粉', '橙', '黄'] },
  { cn: '康乃馨', key: 'carnation', colors: ['粉', '红', '白', '淡黄'] },
  { cn: '小苍兰', key: 'freesia', colors: ['黄', '白', '粉', '橙'] },
  { cn: '木槿', key: 'hibiscus', colors: ['红', '粉', '白', '橙黄'] },
  { cn: '山茶花', key: 'camellia', colors: ['红', '粉', '白', '红白复'] },
  { cn: '桔梗', key: 'balloon', colors: ['蓝紫', '白', '粉', '淡紫'] },
  { cn: '矢车菊', key: 'cornflower', colors: ['蓝', '紫', '粉', '白'] },
  { cn: '波斯菊', key: 'cosmos', colors: ['粉', '白', '深红', '橙黄'] },
  { cn: '玉兰', key: 'magnolia', colors: ['白', '粉', '紫', '淡黄'] },
  { cn: '大丽花', key: 'dahlia', colors: ['红', '黄', '紫', '白'] },
  { cn: '银莲花', key: 'anemone', colors: ['红', '白', '蓝紫', '粉'] },
  { cn: '非洲菊', key: 'gerbera', colors: ['橙红', '明黄', '粉', '白'] },
  { cn: '鸡蛋花', key: 'plumeria', colors: ['白', '粉红', '红黄', '淡黄'] },
  { cn: '花毛茛', key: 'ranunculus', colors: ['橙', '粉', '黄', '白'] },
  { cn: '翠菊', key: 'aster', colors: ['蓝紫', '粉', '白', '正红'] },
  { cn: '水仙', key: 'daffodil', colors: ['黄', '白', '橙黄', '奶白'] },
  { cn: '睡莲', key: 'waterlily', colors: ['粉红', '鹅黄', '淡紫', '纯白'] },
  { cn: '虞美人', key: 'poppy', colors: ['正红', '粉', '橙红', '白'] },
  { cn: '倒挂金钟', key: 'fuchsia', colors: ['红紫双', '粉紫', '红白', '紫白'] },
  { cn: '荷包牡丹', key: 'bleedingheart', colors: ['粉', '纯白', '淡红', '红白'] },
  { cn: '番红花', key: 'crocus', colors: ['蓝紫', '明黄', '白', '淡紫'] },
  { cn: '萱草', key: 'daylily', colors: ['橙黄', '正红', '淡黄', '红橙'] },
  { cn: '六出花', key: 'alstroemeria', colors: ['橙', '粉', '黄', '白'] },
  { cn: '朱顶红', key: 'amaryllis', colors: ['正红', '粉', '纯白', '橙红'] },
  { cn: '蝴蝶兰', key: 'phalaenopsis', colors: ['白', '粉紫', '明黄', '紫红'] },
  { cn: '仙客来', key: 'cyclamen', colors: ['粉红', '正红', '纯白', '淡紫'] },
  { cn: '矮牵牛', key: 'petunia', colors: ['蓝紫', '粉红', '紫红', '纯白'] },
  { cn: '万寿菊', key: 'marigold', colors: ['橙黄', '金黄', '明黄', '橙红'] },
  { cn: '龙胆', key: 'gentian', colors: ['深蓝', '蓝紫', '粉紫', '纯白'] },
  { cn: '蜀葵', key: 'hollyhock', colors: ['粉红', '深红', '紫红', '淡黄'] },
  { cn: '大岩桐', key: 'gloxinia', colors: ['红紫', '蓝紫', '粉红', '纯白'] },
  { cn: '非洲堇', key: 'africanviolet', colors: ['蓝紫', '粉紫', '纯白', '深紫'] },
  { cn: '蓝铃花', key: 'bluebell', colors: ['蓝紫', '淡蓝', '粉紫', '纯白'] },
  { cn: '梅花', key: 'plum', colors: ['淡粉', '正红', '纯白', '深粉'] },
  { cn: '秋海棠', key: 'begonia', colors: ['粉红', '正红', '淡黄', '纯白'] },
  { cn: '金盏菊', key: 'calendula', colors: ['明黄', '橙黄', '淡黄', '金橙'] },
]

// 展开花种表：编号按清单顺序连续排（001~200），一种花正好 4 色
let n = 0
export const FLOWERS: Flower[] = SPECIES.flatMap(({ cn, key, colors }) =>
  colors.map((color) => {
    n++
    const id = String(n).padStart(3, '0')
    return {
      id,
      name: `${cn}·${color}`,
      species: cn,
      file: `${id}-${key}-${color.replace(/双$/, '')}.webp`,
    }
  })
)

export const FLOWER_COUNT: number = FLOWERS.length

// 随机抽一朵；传入 rand 可换成自己的随机源（便于测试复现）
export function pickFlower(rand: () => number = Math.random): Flower {
  return FLOWERS[Math.min(FLOWER_COUNT - 1, Math.floor(rand() * FLOWER_COUNT))]
}
