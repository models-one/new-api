# new-api · web-custom-v2

基于 `codex/web-custom-v3-development` 的独立前端副本，开发分支为
`codex/requesty-style-redesign`。保留 new-api / QuantumNous 原有项目归属；
原 `web-custom/` 不参与本目录的构建，也没有被修改。

本轮以 Requesty 模型库为参考，完成深石墨灰与琥珀色主题、紧凑侧栏和顶栏，
并重做模型库。其它模块沿用原有接口与页面逻辑，应用统一的新主题。

## 启动与预览

```sh
nvm use 22
cd web-custom-v2
bun install --frozen-lockfile
bun run dev
```

- 设计预览：<http://127.0.0.1:4174/models?preview=1>
- 真实接口：<http://127.0.0.1:4174/models>
- 默认代理：`http://127.0.0.1:3000`；可通过 `API_PROXY_TARGET` 覆盖。
- 完整登录流程：启动时设置 `PUBLIC_PREVIEW_MODE=false`。

`?preview=1` 只在开发模式下提供模型库示例数据，界面会明确标记，价格不代表
供应商实际报价。此模式不向后端发送读写请求，其它业务页面需切换真实接口。
访问不含该参数的链接并整页刷新即可退出。生产构建不包含示例数据模块。

## 模型库交互

表格和卡片切换；模型/供应商/标签搜索；接口、供应商、能力、分组可用性筛选；
按名称或输入/输出价格排序；展开接口和分组详情；复制模型 ID；最多两项对比。
所有价格沿用原接口的分组倍率、按量/按次/阶梯计费规则。

## 验证

```sh
bun run typecheck
bun run lint
bun run i18n:sync
bun run test src/features/models/__tests__/models-page.test.tsx src/components/layout/__tests__/app-shell.test.tsx
bun run build
```

此目录暂未接入 Go 内嵌静态资源或 Docker 生产入口。详细边界见 [DESIGN.md](./DESIGN.md)。
