import assert from 'node:assert/strict'
import { test } from 'node:test'
import { promises as fs } from 'node:fs'
import vm from 'node:vm'

// 无头冒烟：按官方 __ModuleLoader__ 契约执行客户端包，
// 验证 factory 可物化、导出插件入口、并以低优先级注册 reasoning.body 槽位。
test('client bundle: 官方加载器契约冒烟', async () => {
  const code = await fs.readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.ok(code.startsWith('window.__ModuleLoader__.load({'), '必须是官方闭包包装格式')

  let registered = null
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(entry) {
          assert.equal(entry.id, 'dsh-novel-break')
          registered = entry
        },
      },
    },
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox)
  assert.ok(registered, '脚本执行应注册 factory')

  // 物化：react / react/jsx-runtime 走外部 require（与官方平台模块一致）
  const React = await import('react')
  const jsxRuntime = await import('react/jsx-runtime')
  const exports = registered.factory((name) => {
    if (name === 'react') return React.default ?? React
    if (name === 'react/jsx-runtime') return jsxRuntime
    throw new Error(`unexpected require: ${name}`)
  })

  assert.equal(exports.name, 'dsh-novel-break-client')
  // vm 上下文中的数组与主上下文原型不同，逐项比较
  assert.deepEqual([...exports.inject], ['slots'])
  assert.equal(typeof exports.apply, 'function')

  // apply：应注入并注册 reasoning.body，priority 低于官方默认 100
  const calls = []
  const ctx = {
    slots: {
      inject(name, cb) {
        calls.push(['inject', name])
        cb()
      },
      register(options, component) {
        calls.push(['register', options, component])
      },
    },
  }
  exports.apply(ctx)
  assert.deepEqual(calls[0], ['inject', 'conversation.chat.reasoning.body'])
  assert.equal(calls[1][0], 'register')
  assert.equal(calls[1][1].name, 'conversation.chat.reasoning.body')
  assert.ok(calls[1][1].priority < 100, 'priority 必须低于官方默认 100 才能接管')
  assert.equal(typeof calls[1][2], 'function')
})
