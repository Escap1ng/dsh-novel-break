// 浏览器端打包：把 client 编译产物打成官方 __ModuleLoader__ 闭包格式（单文件 CJS）。
// 官方契约（dsh-client-modules）：脚本执行只注册 factory，首次 import 时才执行模块体；
// react 等平台模块必须走 require 外部化，不能打进包里。
import { build } from 'esbuild'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const result = await build({
  entryPoints: [path.join(root, 'lib/client/index.js')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['react', 'react/jsx-runtime'],
  write: false,
  legalComments: 'none',
})

const body = result.outputFiles[0].text
const wrapped = `window.__ModuleLoader__.load({
\tid: "dsh-novel-break",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${body}
\t\treturn module.exports;
\t},
});
`

const dest = path.join(root, 'lib/client.js')
await fs.writeFile(dest, wrapped, 'utf8')
console.log('client bundle written:', dest, wrapped.length, 'bytes')
