# web-custom-v2 功能还原计划

目标：把上游 `web/` 的完整管理功能逐步移植进 `web-custom-v2`，使 `new_UI` 镜像只打包新界面也不丢功能。

- 基线：上游 `main` = `b20e0566b`（2026-11-13），`new_UI` = `a459f204f`（已合并该上游）。
- 依据：2026-11-13 对 `web/` 与 `web-custom-v2/` 的静态代码对比（未运行界面）。每项开工前，以届时的上游代码为准重新核对。
- 规模参考：渠道页上游约 4.9 万行 / v2 约 4.9 千行；插件上游 92 个文件约 2.3 万行 / v2 19 个文件约 4 千行。

---

## 一、开发约定

每一项都遵守以下规则，验收时逐条检查。

1. **以上游实现为准。** 每个功能先读上游对应文件（下文已标出），确认它调用的接口、配置项名称和数据格式，再按 v2 的组件和样式重写界面。不要照搬上游组件代码，也不要自己猜接口格式。
2. **后端接口优先用专用接口。** 上游有专用接口的（如 `/api/option/model_pricing`、`/api/option/request_policy`、`/api/option/passkey/domains`），必须走专用接口，不要退回逐个写 `PUT /api/option/`。专用接口通常带冲突检测或确认流程。
3. **多语言：** 新增文案用英文作 key，7 种语言都补齐，最后运行 `bun run i18n:sync`。
4. **测试：** 每个功能至少一个 vitest 用例，覆盖"读到的数据正确显示"和"保存时发出的请求正确"。修 bug 的项要先写能复现的用例。
5. **每项完成必跑：** `bun run typecheck`、`bun run lint`、`vitest run`、`bun run build`，并连真实后端在浏览器里走一遍。
6. **提交粒度：** 一个功能一个提交，提交信息写明对应本计划的编号（如 `P1-3`）。每个阶段结束推送一次 `new_UI`，自动构建镜像验证。
7. **路由：** 新增页面路径如果是新的顶级路径，要同步加进后端 `router/web-router.go` 的白名单。

---

## 二、阶段计划

工作量按一个人全职估算，合计约 7–9 周。阶段 0 必须最先做，其余阶段可按业务需要调整顺序。

### 阶段 0：修复已经坏掉的功能（约 2–3 天）

这些问题在新后台上会直接报错或写入错误数据，优先级最高。

| 编号 | 问题 | 处理 | 参考 |
|---|---|---|---|
| P0-1 | 个人访问令牌面板调用已删除的 `GET /api/user/token` | 先下掉旧面板，正式实现见 P5-1 | `profile/identity-api.ts:126`、`components/AccessTokenPanel.tsx` |
| P0-2 | 开启"登录密码加密"后无法用密码登录 | 登录前请求 `/api/user/login/encryption-key`，提交 `password_encrypted` 和 `encryption_key_id`；同时支持 `/api/user/login/verify` | 后端 `controller/user.go:68-77`；上游 `web/src/features/auth` |
| P0-3 | 插件 OAuth 回调页 404 | 新增路由 `/oauth/plugin/$key/callback` | 后端 `service/provider_plugin_login.go:106`；上游 `web/src/routes/_authenticated/oauth/plugin/$key/callback.tsx` |
| P0-4 | 渠道可绑定插件列表混入只做请求转换的插件 | 过滤条件改为 `task !== false \|\| provider === true` | `channels/task-plugin-binding.ts:31`；上游 `web/src/features/channels/api.ts:144` |
| P0-5 | Telegram 登录开不起来 | 改写 `telegram.client_id` / `telegram.client_secret`，去掉旧的 `TelegramBotName/Token` | `auth-security/sections/OAuthSection.tsx`；后端 `setting/system_setting/telegram.go` |
| P0-6 | 保存模型价格会把系统默认价格存成管理员设置 | 临时方案：保存时只提交管理员改过的条目；正式方案见 P2-1 | 后端 `controller/option.go:114-126`、`setting/billing_setting/tiered_billing.go:166-187` |
| P0-7 | 健康检测模式 `auto_ban_only` 被误显示并改写 | 补全三种模式，未知值原样保留 | `models-operations/sections/RoutingReliabilitySection.tsx:50-54`；后端 `setting/operation_setting/monitor_setting.go:19-21` |
| P0-8 | 小问题 | `/api/task/` 去掉末尾斜杠；更新检查的仓库地址改为 `QuantumNous/new-api`；下掉已失效的 `PreConsumedQuota` 设置 | `task-logs/api.ts:205`、`UpdateCheckerSection.tsx:30`、`billing/QuotaSection.tsx` |

### 阶段 1：插件体系（约 2–2.5 周）

上游参考目录：`web/src/features/task-plugins/`、`web/src/features/request-processing/`、`docs/plugin-api/v1.md`。开工前先通读 `docs/plugin-api/v1.md`。

| 编号 | 功能 | 要点 |
|---|---|---|
| P1-1 | 插件类型 | 区分任务、供应商、请求转换三类，列表和详情显示类型标记。参考 `lib/plugin-kinds.ts`、`plugin-kind-switch.tsx`、`plugin-parts-badges.tsx` |
| P1-2 | 供应商插件接入渠道表单 | 按插件的 `channelConfig` 生成配置表单并写入 `plugin_config`；支持 `keyHint`、密钥校验和余额查询 |
| P1-3 | 插件登录与凭据 | `/api/channel/:id/plugin_login`、`/continue`、`/plugin_login/callback`、`/:id/plugin_credentials`，配合 P0-3 的回调页 |
| P1-4 | 请求处理页面 | 新页面：实例列表与编辑（`/api/request_plugin/instances`）、按 `configSchema` 生成配置表单、按模型取值、示例、试运行（`/api/request_plugin/dry_run`）。参考 `request-plugin-*.tsx` |
| P1-5 | 插件市场补齐 | 安装时传 `marketplaceIndexUrl`；可更新提示（去掉固定的 `NO_UPDATES`）；吊销警告；社区安装量；完整性校验；安装确认里显示插件能力 |
| P1-6 | 定价提示 | 启用、切换状态、删除的返回里有定价提示和 `pricing_issues`，要显示出来。参考 `pricing-issue-list.tsx` |
| P1-7 | 插件详情补齐 | 说明文档、更新日志、转发路由、转换配置、元数据卡片、代码查找、官网链接、从 URL 导入、节点同步状态 |

验收：用上游 `plugins/tasks/` 里的示例插件，分别装一个任务插件、一个供应商插件、一个请求转换插件，在新界面里完成安装、配置、绑定渠道、发请求的全流程。

### 阶段 2：计费与定价（约 1.5–2 周）

| 编号 | 功能 | 要点 |
|---|---|---|
| P2-1 | 模型定价编辑器 | 改用 `/api/option/model_pricing`（读、按模型保存、冲突检测、`/issues`、`/preview`、`/convert`）。4 个标签页：模型、未定价、工具价格、上游同步（`/api/ratio_sync/channels`、`/fetch`）。表达式计费为主，旧的按量/按次标为不推荐并提供转换；阶梯计费可视化编辑；插件计费 `billing_setting.plugin_billing_expr`；请求试算。参考 `web/src/features/model-pricing/`、`web/src/features/system-settings/models/model-pricing-sheet.tsx`。必须先读 `.agents/rules/billing.md` |
| P2-2 | 分组定价 4 个标签页 | 定价分组 / 特殊倍率规则（`GroupGroupRatio` 按用户分组展开的表格）/ 分组可见性（`group_ratio_setting.group_special_usable_group`，支持 `+:`、`-:` 规则）/ 自动分组（排序、`MaxTokenAutoGroups`）。参考 `group-ratio-visual-editor.tsx`、`group-special-usable-editor.tsx` |
| P2-3 | 额度预扣 | 新增 `quota_setting.trust_quota_usd`、`quota_setting.pre_consume_multiplier` |
| P2-4 | 支付设置 | Epay RSA（`payment_setting.epay_sign_type`、`epay_merchant_private_key`、`epay_platform_public_key`）；Waffo Pancake 走 `/catalog`、`/pair`、`/save` 流程，不再手填商品 ID；支付方式、金额选项、折扣、Creem 商品改为可视化编辑。参考 `integrations/*-visual-editor.tsx` |

### 阶段 3：系统设置补齐（约 1 周）

| 编号 | 功能 | 要点 |
|---|---|---|
| P3-1 | 新增"请求策略"大类 | 路由与健康两个分区，统一走 `GET/PATCH /api/option/request_policy`；会话模式 `channel_affinity_setting.session_mode`；亲和规则表格与编辑弹窗；缓存统计（`/api/log/channel_affinity_usage_cache`）；`monitor_setting.channel_test_concurrency`。完成后移除 v2 模型分类下旧的"路由可靠性""渠道亲和"。参考 `web/src/features/system-settings/request-policies/`、`general/channel-affinity/` |
| P3-2 | 邮件 | 发信方式切换（SMTP / Resend），`EmailProvider`、`ResendApiKey`、`ResendFrom` |
| P3-3 | 日志 | `log_setting.user_export_enabled`、`log_setting.max_range_days`、`system_task_setting.retention_days` |
| P3-4 | 通行密钥 | `passkey.legacy_rp_ids`；改用 `PUT /api/option/passkey/domains`，移除域名时处理 409 并让管理员确认 |
| P3-5 | 自定义 OAuth | 自动发现（`/api/custom-oauth-provider/discovery`）、访问策略模板 |
| P3-6 | 零散配置 | `TaskPublicAddress`、`oidc.display_name`、`QuotaRemindEnabled`；文档链接移回站点信息 |

### 阶段 4：渠道运维（约 1.5–2 周）

上游参考：`web/src/features/channels/`。

| 编号 | 功能 |
|---|---|
| P4-1 | 渠道类型补齐：VLLM（62）、SGLang（63），并核对 `CHANNEL_TYPE_NAMES` 与后端 `constant/channel.go` 完全一致 |
| P4-2 | 多密钥管理（`/multi_key/manage`）、查看密钥（`/:id/key`） |
| P4-3 | 优先级排序、按标签启用/禁用/编辑（`/tag/*`、`/tag/models`） |
| P4-4 | 一键全部测试（`/test`）、一键更新全部余额（`/update_balance`）及进度轮询 |
| P4-5 | 上游模型更新（`upstream_updates/*`、`upstream_model_update`）、默认地址（`default_base_urls`）、批量操作（`/ops`）、修复（`/fix`） |
| P4-6 | 特定渠道操作：Codex 用量与刷新、Ollama 拉取/删除模型、VLLM/SGLang 状态 |

### 阶段 5：账号、安全与日志（约 1 周）

| 编号 | 功能 |
|---|---|
| P5-1 | 带权限范围的个人访问令牌（`/api/user/access_tokens*`）和 `/security` 页面 |
| P5-2 | 审计日志页面（`/api/audit`、`/api/audit/self`），路径 `/usage-logs/audit` |
| P5-3 | 管理员管理用户：重置 2FA、重置通行密钥、查看和解绑第三方账号 |
| P5-4 | 权限角色编辑（authz 权限目录），去掉 `users/api.ts:27` 的"不支持"标记 |
| P5-5 | 日志行显示请求插件记录；任务产物（`/api/task/:id/artifacts`） |

### 阶段 6：其余页面（约 1 周）

| 编号 | 功能 |
|---|---|
| P6-1 | 用户自助购买订阅（`/subscription/plans`、`/self`、`/self/preference`、各支付方式的 `*/pay`），管理员作废/删除订阅 |
| P6-2 | Creem 充值（`/api/user/creem/pay`）、管理员补单（`/api/user/topup/complete`） |
| P6-3 | 兑换码批量删除（`/api/redemption/batch`） |
| P6-4 | 厂商管理（增删改、`/vendors/operations*`、`/models/vendors` 路由）、预填分组（`/api/prefill_group`） |
| P6-5 | 令牌自动分组可选项改用 `/api/token/auto-groups` |
| P6-6 | 仪表盘的服务状态（`/api/uptime/status`）和公告（`/api/notice`） |
| P6-7 | 系统信息的节点同步（`/api/system-info/sync`）、系统任务历史与详情、系统更新弹窗 |

---

## 三、跟进上游

功能移植完成后，上游每次更新仍可能新增功能，按下面的流程跟进：

1. 合并上游后，列出上一个同步点以来上游前端的改动：
   ```bash
   git diff --stat <上次同步点>..main -- web/src/features web/src/routes
   ```
2. 对每个改动的功能判断：v2 是否已有对应功能？接口或配置项是否变了？把需要跟进的项追加到本文件第四节。
3. 同步点记录在本文件开头的"基线"里，每次跟进后更新。

---

## 四、待跟进清单

（合并上游后发现的新差距追加在这里，格式：日期、上游提交、涉及功能、处理状态。）

---

## 五、需要决定的事项

1. **过渡期的管理功能：** 现在镜像只打包新界面。在阶段 1–5 完成前，渠道高级操作、模型定价、审计日志等只能通过数据库或接口处理。是否在过渡期临时恢复打包上游界面作为备用？
2. **执行顺序：** 本计划默认先插件、后计费。如果分组定价、模型定价更急，可以把阶段 2 提到阶段 1 前面。
3. **是否保留 v2 独有功能：** 如敏感词设置，上游已不在设置页展示但后端仍支持，计划默认保留。
