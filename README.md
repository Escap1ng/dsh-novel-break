# dsh-novel-break：思维链间隙读小说插件

## 目标

在 DeepSeek Harness（dsh）的 Web 界面中，把模型思维链按块切分，在块与块之间插入小说段落——等 Agent 干活时顺便追更。小说支持导入本地 txt / epub 文件。

## 核心原则

**纯显示层插件**：只改思维链的展示方式，小说内容不进入模型上下文，不影响任务执行、不额外消耗 token。（实现模式参考社区插件 dsh-think-translate）

## 功能设计

1. **多格式导入**：配置小说文件路径（txt / epub）。txt 自动识别 UTF-8/GBK 编码，按“第X章/第X节”切章；epub 按 spine 阅读顺序提取章节，书名取自 OPF 元数据，章节名取自 NCX 目录（无目录时回退正文标题）。章内按固定字数分块（默认 400 字，可调）。
2. **分块插入**：监听思维链流式输出，在自然块边界（段落结束、工具调用间隙）插入小说卡片；每 N 个思维块插一次（可配），思维链很短时不插。
3. **卡片交互**：小说渲染为可折叠卡片，样式与思维链区分；支持“换一段 / 下一章 / 暂停·继续”（暂停为全局开关，本会话内记忆）。
4. **进度记忆**：按书持久化阅读位置，重启 DSH、切换会话都能接着读；同一思维块回放/刷新时从会话缓存恢复卡片，不重复消耗阅读进度。
5. **配置项**：书名、txt 路径、每块字数、插入间隔、总开关（Schemastery schema，cordis.yml 热更新）。

## 项目结构

```
src/
  index.ts          宿主端入口：加载小说，注册 /_novel/state、/_novel/next、/_novel/skip-chapter 同源路由
  config.ts         Schemastery 配置 schema（enabled / novelPath / chunkSize / insertEvery / minReasoningChars）
  novel/
    parser.ts       编码探测（UTF-8/GBK/BOM）+ 切章 + 按字数分块（txt/epub 共用）
    epub.ts         epub 解包：container → OPF（metadata/manifest/spine）→ NCX 章节名 → 纯文本提取
    library.ts      书库：顺序出块、游标推进、跳章
    progress.ts     阅读进度持久化（文件名+大小指纹，临时文件原子写入）
  client/
    index.ts        浏览器端入口：priority 50 接管 reasoning.body 槽位，配置节流刷新（30s）
    NovelCard.tsx   可折叠小说卡片（换一段/下一章/暂停），会话缓存回放去重
    types.ts        最小槽位契约类型（联调时替换为官方类型）
test/               node:test 单元测试（21 个用例，含加载器契约冒烟与跳章用例）
scripts/            构建与真实环境测试脚本（build-client / start-test-web / test.patch.yml）
cordis.patch.yml    --patch 本地加载配置
```

## 当前进度

- [x] 钩子调研：确认官方 `conversation.chat.reasoning.body` single 槽（默认实现 priority 100），低值接管即可只处理思维块正文、原文经官方工厂槽照常渲染；宿主路由采用 `webServer.register` + `ctx.effect` 工厂模式（参考 dsh-think-translate 的实测教训：effect 必须传返回 disposer 的工厂，否则路由注册即被注销）
- [x] 框架代码完成
- [x] epub 导入支持（spine 顺序 / OPF 书名 / NCX 章节名 / 相对路径归一化），17 个单元测试全部通过（解析器 / epub / 进度存储 / 书库）
- [x] 真实 DSH 环境联调（0.2.2-rc.1，隔离 DSH_HOME）：宿主路由 /_novel/state 与 /_novel/next 实测通过，书籍加载、顺序出块、进度持久化与重启恢复全部验证；浏览器端已按官方 `__ModuleLoader__` 闭包契约用 esbuild 打包（react 外部化），服务器正确下发并通过无头加载器冒烟测试。剩余：真人打开 Web UI 观察卡片渲染效果
- [x] 卡片交互补全：换一段 / 下一章（宿主 /_novel/skip-chapter 实测通过，含最后一章与方法限制边界）/ 全局暂停·继续；配置热更新 30 秒内生效；回放去重（sessionStorage 按思维块指纹缓存）
- [ ] 设置页 section（settings.section 槽位）
- [ ] 打包 bundle 并 `dsh plugin add` 安装实测

## 本地开发

```sh
npm install
npm test    # 编译 + 单元测试
npx @deepseek-ai/dsh web --patch ./cordis.patch.yml
```

本地调试时把 `cordis.patch.yml` 中的 `name` 改为编译产物的 `file://` 绝对路径，并在 `config.novelPath` 填入小说 txt / epub 的绝对路径。

真实环境测试（隔离 DSH_HOME，不影响桌面版）：

```powershell
powershell -File scripts/start-test-web.ps1
# 按输出的带 token 地址打开浏览器；插件接口：/_novel/state、/_novel/next
```

注意：桌面版（Electron）禁用了 RunAsNode，其 CLI 无法在普通终端使用；测试用 npm 版 `@deepseek-ai/dsh`（devDependency，与桌面版同代 0.2.2）。浏览器端产物必须是官方 `window.__ModuleLoader__.load({id, factory})` 闭包格式，`npm run build` 会自动完成打包。

## 风险与对策

- DSH 处于开发者预览期，官方明示会有破坏性更新：锁定适配版本；UI 钩子失效时静默降级（不插小说，但绝不影响主界面）。
- 流式输出的块边界不一定对齐语义段落，需要缓冲策略，这是阅读体验的关键。
- epub 解析为面向阅读场景的轻量实现：不支持 DRM 保护的文件；NCX 嵌套目录只取每层首个章节名（小说目录通常平铺，影响有限）。

## 许可证

Apache License 2.0，见 [LICENSE](./LICENSE)。

Copyright 2026 Escap1ng
