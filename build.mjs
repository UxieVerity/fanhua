// 构建脚本：打包出三种格式 —— ESM / CJS / 浏览器 IIFE
import { build } from 'esbuild'

const shared = {
  entryPoints: ['src/index.js'],
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

console.log('✓ dist/fanhua.mjs  dist/fanhua.js  dist/fanhua.iife.js')
