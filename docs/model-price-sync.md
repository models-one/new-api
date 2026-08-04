# 模型价格自动同步

该功能定时拉取一份 LiteLLM 格式的价格表（`model_prices_and_context_window.json`），把上游按 token 计价的美元单价换算成 new-api 的倍率，合并进 `ModelRatio` / `CompletionRatio` / `CacheRatio` / `CreateCacheRatio`。

它以「系统任务」的形式运行（类型 `price_sync`），因此只在主节点执行、跨多个 master 用数据库租约去重，每次运行都会在 **系统信息 › 系统任务** 留下一条记录。

> ⚠️ 倍率就是售价。启用前请先用「预览变更（试运行）」看一遍会改什么。

## 换算口径

new-api 的倍率单位是 `1 === $0.002 / 1K tokens`，即 1 倍率 = $2 / 1M tokens：

| 目标字段 | 来源字段 | 公式 |
| --- | --- | --- |
| `model_ratio` | `input_cost_per_token` | `input × 1000 × ratio_setting.USD` |
| `completion_ratio` | `output_cost_per_token` | `output ÷ input` |
| `cache_ratio` | `cache_read_input_token_cost` | `cache_read ÷ input` |
| `create_cache_ratio` | `cache_creation_input_token_cost` | `cache_creation ÷ input` |

只有按文本 token 计价的条目会被换算（`mode` 为 `chat` / `responses` / `completion`）。embedding、图像、音频、realtime 条目计价单位不同，一律跳过。

如果管理员把 `QuotaPerUnit` 改成了非默认值，倍率口径就不再是 $2/1M，此时任务会直接报错中止，而不是按错误口径写入。

## 配置项

位置：**系统设置 › 模型 › 模型价格同步**（DB 键前缀 `price_sync_setting.`）

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `false` | 总开关。关闭时不会创建任何任务 |
| `source_url` | 内置地址 | LiteLLM 格式价格表地址，留空用内置值 |
| `interval_hours` | `6` | 同步间隔，最小 1 小时 |
| `apply_mode` | `decrease_only` | `decrease_only` / `all` / `dry_run` |
| `only_known_models` | `true` | 只更新本站已经定价的模型，不引入新模型 |
| `exclude_models` | `deepseek-*` | 逗号分隔，结尾 `*` 为前缀匹配，永不同步 |
| `min_source_models` | `50` | 上游可用模型数低于此值视为被截断，拒绝本次同步 |

`apply_mode` 无法识别或为空时，一律回退到 `decrease_only`，不会退化成「全量写入」。

### 为什么 deepseek 默认排除

上游价格表给 `deepseek-chat` / `deepseek-reasoner` 报的是折扣时段价，与渠道实际成本对不上（reasoner 差了约一半）。需要同步时请自行核对后再从排除列表移除。

## 涨价保护

`decrease_only` 下，一个模型只有在**四类 token 的单价都没有上涨**时才会被写入：输入、输出、缓存读、缓存写。任何一类涨价，整个模型都会被留到「待人工确认」列表里，只记录不写入，日志形如：

```
[PriceSync] 涨价未自动应用（需人工确认） gpt-4.1: 输出 $4.0000 -> $8.0000 /1M
```

只比输入/输出是不够的：一个模型的缓存读倍率从 0.1 涨到 0.12，输入输出可以完全不动，但缓存命中多的流量实际就是涨价了。

## 会被跳过的模型

任务结果里的 `skipped` 计数对应这些原因：

- `excluded` — 命中排除列表
- `not_priced_locally` — `only_known_models=true` 且本站未定价
- `per_call_priced` — 该模型在 `ModelPrice` 里按次计费，倍率是死配置
- `tiered_billing` — 该模型走表达式计费，绕开倍率
- `already_in_sync` — 换算结果与现值一致
- `completion_ratio_locked` — 该模型族的 completion 倍率被代码硬编码锁定（`gpt-5`、`o1*`、`claude-3*` 等），写进去也不会生效，因此只上报不写入
- `unusable_value` — 上游值缺失、为 0、为负、NaN 或 Inf。**0 一律按「表里没这条数据」处理，不会当成免费**：把主倍率写成 0 会让该模型所有 token 都不计费，而 `decrease_only` 会把它当成一次降价放行

## 安全约束

倍率选项是**整表覆盖**写入的：JSON 里少一个模型，那个模型就不再有价格，会落到 37.5 的未知模型兜底（约 $75/1M）。因此写入前会：

1. **以数据库里已保存的那份为合并基准**，而不是本进程的内存快照——选项在多节点之间只靠每 `SYNC_FREQUENCY` 秒轮询数据库传播，内存可能落后于另一个节点刚做的改价，基于旧快照做整表覆盖会把那次改价悄悄回滚；
2. 只增改、不删除；
3. 序列化后立刻反序列化校验，条目数必须一致（写坏的 JSON 会先落库再清空内存，必须挡在写库之前）；
4. 合并后条目数若少于合并前，直接报错中止。

任务结果里的逐模型明细有条数上限（超出部分只计数），避免大批量首次同步把 `TEXT` 列撑爆导致整条运行记录写不进去；完整清单始终在系统日志里。

上游地址由管理员配置但由后台无人值守地拉取，因此走的是带 SSRF 校验的 HTTP 客户端，并限制响应体大小与超时。

## 手动触发

- 界面：**模型价格同步** 卡片里的「预览变更（试运行）」/「立即同步」
- 接口：`POST /api/system-task/price-sync?dry_run=true`（需 root 权限）

已有同类任务在运行时返回 409。手动触发不受总开关限制，方便在正式启用前先试运行。

## 手动比对

同一份价格表也作为「LiteLLM 官方价格表」预设接入了 **倍率同步** 功能，可以在那里逐条查看差异、勾选后再应用——涨价需要人工确认时走这条路径。
