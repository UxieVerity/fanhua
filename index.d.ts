// 繁花 fanhua 的公开类型声明（与 src/index.ts 的导出保持一致）
// 打包产物 dist/ 是构建时生成的，d.ts 手写维护 —— 公开面很小，变动不频繁。

export interface FanhuaFlower {
  /** 编号，如 '001' */
  id: string
  /** 花名·颜色，如 '雏菊·白' */
  name: string
  /** 花种名，如 '雏菊' */
  species: string
  /** 贴图文件名（相对图库根），如 '001-daisy-白.webp' */
  file: string
}

export interface FanhuaOptions {
  /** 花的大小：单个数字 = 固定大小；[min, max] = 区间随机。默认 [40, 110] */
  size?: number | [number, number]
  /** 'page' 跟随页面滚动（默认）| 'screen' 固定在屏幕上 */
  position?: 'page' | 'screen'
  /** 绽放多少毫秒后开始淡出；0 = 永驻。默认 3000 */
  duration?: number
  /** 花的 z-index。默认 2147483647 */
  zIndex?: number
  /** 图库根路径；不填则按插件脚本位置自动推断 */
  imgBase?: string | null
  /** true 全部预热 | false 用到才加载 | 数字 = 只预热 N 张。默认 true */
  preload?: boolean | number
  /** 随机旋转角度上限（度），0 = 都摆正。默认 12 */
  rotate?: number
}

export declare function init(options?: FanhuaOptions): void
export declare function setOptions(options?: FanhuaOptions): void
/** 移除点击监听（已开的花保留） */
export declare function destroy(): void
/** 清掉页面上所有的花 */
export declare function clear(): void
/** 在指定位置绽放一朵花；x/y 为视口坐标，会按 position 换算 */
export declare function bloom(clientX: number, clientY: number, overrides?: FanhuaOptions): void
/** 预热图库；不传张数 = 全部 */
export declare function preload(count?: number): void

export declare const FLOWERS: FanhuaFlower[]
export declare const FLOWER_COUNT: number

declare const Fanhua: {
  init: typeof init
  setOptions: typeof setOptions
  destroy: typeof destroy
  clear: typeof clear
  bloom: typeof bloom
  preload: typeof preload
  FLOWERS: FanhuaFlower[]
  FLOWER_COUNT: number
}

export default Fanhua
