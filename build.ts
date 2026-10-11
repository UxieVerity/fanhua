// 构建脚本：打包出三种格式 —— ESM / CJS / 浏览器 IIFE
import { build } from 'esbuild'
import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const shared = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['es2018'],
}

await Promise.all([
  build({ ...shared, format: 'esm', outfile: 'dist/fanhua.mjs' }),
  build({ ...shared, format: 'cjs', outfile: 'dist/fanhua.js' }),
  build({ ...shared, format: 'iife', globalName: 'Fanhua', outfile: 'dist/fanhua.iife.js' }),
])

// 类型声明跟产物放一起：手写在根上的 index.d.ts 是唯一源，构建时拷进来
// —— dist 是打包产物，从 src 直接发 d.ts 会把 .ts 后缀导入一起带出去
copyFileSync(
  fileURLToPath(new URL('./index.d.ts', import.meta.url)),
  fileURLToPath(new URL('./dist/fanhua.d.ts', import.meta.url))
)

console.log('✓ dist/fanhua.mjs  dist/fanhua.js  dist/fanhua.iife.js  dist/fanhua.d.ts')
