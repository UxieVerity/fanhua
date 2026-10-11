# 繁花 Fanhua 🌸

> 每一次点击，都在指尖开出一朵手绘小花。

繁花是一个零依赖的原生 JS 插件：点击页面任意位置，点击处会随机绽放一朵手绘小花。花来自内置的 **100 张透明底无损 WebP 贴图**——25 种花 × 4 种颜色——所以同一页开出来的花几乎不会重样。

![demo](demo/demo.png)

## 特性

- 🌼 **100 张花贴图**：雏菊、玫瑰、郁金香、樱花、向日葵、莲花、菊花、三色堇、绣球、芍药、牡丹、桔梗、鸢尾、百合、康乃馨……25 种花各配 4 色
- 🎨 **手绘插画质感**：铅笔勾线 + 柔和渐变上色，花朵本体裁切居中、透明底，落在任何背景上都干净
- 📐 **大小可定制**：支持区间随机或固定大小，还能随机旋转
- 📌 **两种定位**：跟随页面滚动，或固定在屏幕上
- ⏳ **可控存活时间**：到时逐渐淡出，也可以选择永驻
- 🪶 **只发无损 WebP**：比同画质的 PNG 小三分之一，而且逐像素无损；100 张合计 5.3 MB
- 📦 **零依赖**：插件本体 ~2KB min+gzip，ESM / CJS / IIFE 三种格式

## 安装

```bash
npm install fanhua
```

或直接用 `<script>` 标签引入 IIFE 版本：

```html
<script src="dist/fanhua.iife.js"></script>
```

花图在 `img/flowers/` 里，跟着插件一起发布即可。

> **浏览器要求**：贴图是无损 WebP，需要浏览器支持 WebP。Chrome 32+ / Firefox 65+ / Safari 14+ / Edge 18+ 都没问题，覆盖率 97% 以上；IE、Safari 13 及更早、以及部分老 Android WebView 开不出花（不报错，只是点了没反应）。如果要覆盖这些环境，自己把 `img/flowers/` 换成 PNG 并把 `src/flowers.js` 里的 `file` 后缀改成 `.png` 即可，插件不关心扩展名。

## 快速上手

```js
// ESM
import Fanhua from 'fanhua'

// 浏览器全局（IIFE）
window.Fanhua

Fanhua.init({
  size: [40, 110],   // 大小范围（px）；也可以传单个数字如 80 表示固定大小
  position: 'page',  // 'page' 随页面滚动 | 'screen' 固定在屏幕上
  duration: 3000,    // 绽放多少毫秒后逐渐淡出；0 = 永驻
})
```

搞定——现在点击页面任意处都会开花。

### 图片路径

插件默认从**自己所在的目录旁边**找图库（`dist/fanhua.iife.js` → `../img/flowers/`），所以在页面上直接引 `dist/` 或 `img/` 时不用管它。目录结构不一样的话，用 `imgBase` 指过去：

```js
Fanhua.init({ imgBase: 'https://cdn.example.com/fanhua/flowers/' })
```

## API

### `Fanhua.init(options?)`

绑定点击监听并应用配置，重复调用会合并配置。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `size` | `number \| [number, number]` | `[40, 110]` | 单个数字 = 每朵花固定为该大小；两个数字 = 在 `[min, max]` 区间内随机 |
| `position` | `'page' \| 'screen'` | `'page'` | `page`：花落在文档上，随页面滚动；`screen`：花钉在视口上，不随滚动移动 |
| `duration` | `number` | `3000` | 绽放多少毫秒后开始逐渐淡出；`0` = 永驻不消失 |
| `rotate` | `number` | `12` | 随机旋转的角度上限（±），`0` = 全部摆正 |
| `imgBase` | `string \| null` | `null` | 图库根路径，`null` = 自动推断 |
| `preload` | `boolean \| number` | `true` | `true` 空闲时预热全部 100 张；`false` 用到才加载；数字 = 只预热 N 张（随机挑） |
| `zIndex` | `number` | `2147483647` | 花朵的层叠层级 |

> 100 张图合计约 5.3 MB。想让首屏更轻，把 `preload` 设成 `false` 或一个较小的数字。

### `Fanhua.setOptions(options?)`

随时更新配置，不必重新 `init`。

```js
Fanhua.setOptions({ duration: 0 }) // 之后开的花永驻
```

### `Fanhua.bloom(clientX, clientY, overrides?)`

在指定视口坐标手动开一朵花，第三个参数可临时覆盖任意配置。

```js
Fanhua.bloom(innerWidth / 2, innerHeight / 2, { size: 120 })
```

### `Fanhua.preload(count?)`

主动预热图库，不传参数就是全部。

### `Fanhua.clear()`

清掉页面上所有的花。

### `Fanhua.destroy()`

移除点击监听（已开的花保留）。

### `Fanhua.FLOWERS` / `Fanhua.FLOWER_COUNT`

图库清单与总数。每条记录形如 `{ id, name, species, file }`，可以拿来自己铺一个花谱：

```js
Fanhua.FLOWERS.forEach((f) => console.log(f.name, f.file))
```

## 花图是怎么来的

先定一张手绘雏菊作为画风锚点（[img/daisy.png](img/daisy.png)），用同一段风格描述生成 25 种花各 4 色，再统一处理成精灵图：

1. 关掉水印出图。prompt 要求**纯黑底**出图，黑底与花色对比大、抠图边缘干净；黑底图在管线入口自动反色成白底，走按白底调好的抠图逻辑，抠完再反回来
2. 从四边洪水填充判为背景——用连通性而不是全局阈值，花瓣内部与背景同色的区域才不会被一起抠掉
3. 按花朵本体裁到包围盒、居中留白、面积平均重采样到 256px（颜色按预乘 alpha 平均，边缘不出深色描边）
4. 逐行挑最省的 PNG 滤波方式后 deflate，落到 `txt2img/sprites/`
5. 转成无损 WebP 落到 `img/flowers/`，中间那批 PNG 到此为止，不跟着发布

第 5 步值得说明一下：PNG 内部已经是 deflate，外面再套 gzip / brotli 基本没有收益（实测 −0.0%），真正省体积的是换编码——同一批图 7.85 MB → 5.33 MB（−32%），且逐像素无损。转码用系统里的 ffmpeg，`scripts/webp.mjs` 里记了两个坑：必须显式 `-pix_fmt bgra`、且不能带 `-preset`，否则 ffmpeg 会悄悄编成有损的 yuva420p，体积看着掉到十分之一，其实色度已经被 4:2:0 降采样了。所以转完会验一遍主 chunk 是不是 `VP8L`。

### 为什么中间还要留一批 PNG

因为**发布出去的 WebP 本项目解不开**。插件零依赖，没有 WebP 解码器，一旦贴图变成 `.webp`，"花有没有被裁断、背景抠干净没"这类需要看像素的检查就再也做不了。所以几何体检放在生成那一步（`scripts/png.mjs` 的 `auditSprite`），趁 PNG 还在手上做完；`npm test` 只负责清单自洽与文件结构——数量、命名、尺寸（从 VP8L 头里读）、以及编码方式是不是无损。

## 生图管线配置（.env）

生图管线在 `txt2img/` 下，调用火山引擎「豆包 Seedream」文生图接口，密钥从仓库根的 `.env` 读取（`.env` 已被 gitignore，不会进版本库）：

```bash
cp .env-example .env    # 然后填入自己的 ARK_API_KEY
```

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `ARK_API_KEY` | 是 | 火山方舟 API key，在[火山方舟控制台](https://console.volcengine.com/ark)开通模型后获取 |
| `ARK_MODEL` | 否 | 生图模型，默认 `doubao-seedream-5-0-flash-260915` |

也可以直接设环境变量 `ARK_API_KEY`，优先级高于 `.env`。

## 本地开发

```bash
npm install
npm run build   # 打包 dist/
npm test        # 图库自检：清单自洽、每张都是尺寸正确的无损 WebP
npm run serve   # 启动 demo：http://localhost:4173
```

生图要装 ffmpeg。`txt2img/raw/`（原始生图，约 190MB）不进版本库，其余脚本与中间产物都在：

```bash
node txt2img/generate.mjs               # 按需补齐缺的花（调接口，花钱）
node txt2img/generate.mjs --from-raw    # 拿 txt2img/raw/ 重跑处理管线，不重新生图
node txt2img/generate.mjs --only g01 --force   # 只重新生成指定网格（试水新 prompt 用）
node scripts/webp.mjs --verify          # 只重转 WebP，并逐像素对一遍中间 PNG
```

打开 demo 后点击页面任意处即可看效果，面板可以实时调整大小范围、定位方式、存活时间与随机旋转；页面底部有全部花的花谱。

## License

[MIT](./LICENSE)
