# 神探狄仁杰机器人（DSH 插件）

DeepSeek Harness 的左侧栏面板：在 DSH 界面里和「神探狄仁杰机器人」对话，
依据台词素材回答剧情问题，按案件/题型/侧重现出题目；台词没演到的空白，用原著小说做**辅助补充**。

**素材随包提供**：51,253 句台词、2,539 个检索块、10 个案件及原著小说补充。无需启动 QQ 机器人或另建索引；模型问答和原创出题需要可用的模型。此插件只在 DSH 本机 Web 面板运行，不连接 QQ，也不管理 QQ 群积分。

- **左侧栏入口**：`sidebar.panellist` 注册 `shendi-bot`，对应 `main` 面板的 `shendi-bot`，
  与「插件」「任务」同级。
- **问答**：先检索台词、剧情纲要与人物档案，再交给模型综合；素材里没有的会直说，不凭印象编剧情。
  台词定位成功后才用小说补动作/心理/表情，并标明“小说补充”；小说独有的内容走“小说独有模式”。
- **出题**：可选案件、数量、题型（选择题 / 问答题 / 台词填空 / 判断题）、侧重（细节 / 人物身份 / 原因目的），
  题目带答案解析与台词依据；模型返回空时退化成「台词接龙」选择题。出题只用台词，不用小说。
## 安装

**方式一（最短）**：在 DSH 的「插件」页点「安装」，安装目标填

```
dsh-shendi-bot
```

确认后刷新页面，左侧栏就会出现「神探狄仁杰机器人」。

**方式二（插件市场）**：先启用实验性市场界面 `@deepseek-ai/dsh-experimental-plugin-market-bundle`，
再在「发现」里添加索引源

```
https://raw.githubusercontent.com/ddjmj1/Detective-Dee/main/index.json
```

（访问 GitHub 慢时可用镜像 `https://cdn.jsdelivr.net/gh/ddjmj1/Detective-Dee@main/index.json`），
搜索「神探狄仁杰机器人」安装。

**升级**：包名不变，第三方插件不会自动升级；在插件页卸载旧版后安装新版，或从市场点更新。
替换后建议完全退出并重启 DSH，再刷新浏览器。

### 推荐：使用 DSH「设置 → 模型」

1. 在 DSH「设置 → 模型」添加自己的提供方，填写服务商给出的 API 地址、模型 ID 和 API Key，并保存。
2. 从左侧打开「神探狄仁杰机器人」，点「刷新模型」，在「模型」下拉框中选刚添加的模型。此选择只影响机器人面板，不会改普通 DSH 会话的默认模型。若选择「自动」，且没有配置机器人专用 API 或显式指定插件模型，则优先跟随 DSH 的默认模型。
3. 在「问答」里试问“李元芳的链子刀是哪来的？”，或在「出题」里选一题测试。看见「备用题」表示模型未能生成合格题目，显示的是本地题，不代表 API 已连通。

### 可选：只给机器人配置专用 API

在**启动 DSH Host 的环境**设置以下变量（与 QQ 机器人变量同名，但不读取 QQ 的配置文件）：

| 变量 | 用途 | 示例 |
| --- | --- | --- |
| `SHENDI_LLM_BASE` | OpenAI 兼容 API 根地址，通常带 `/v1`；也接受完整的 `/chat/completions` 地址 | `https://api.example.com/v1` |
| `SHENDI_LLM_MODEL` | 服务商要求的准确模型 ID | `your-model-id` |
| `SHENDI_LLM_KEY` | Bearer API Key；接口无需认证时可不设 | 在本机安全设置，不要粘贴到聊天 |

Windows 桌面端可在「编辑账户的环境变量」添加这三项，随后从托盘退出 DSH 并重新启动；CLI 部署则在启动 DSH 的终端或进程管理器中设置。地址必须使用 HTTPS，本机回环地址允许 HTTP。接口须支持非流式 Chat Completions，含 `max_tokens` 字段和 `choices[0].message.content` 响应。

配置完成后，「自动」会优先用「机器人专用 API」；也可在下拉框选它，或显式改选 DSH 提供方。原先保存的手选项不会被自动改掉。修改或移除变量后需重启 DSH。401/403 优先检查密钥和模型权限，404 检查地址和模型 ID，429 检查额度。

## 内置素材

`data/` 里是五份 JSON（未压缩约 32 MB，压缩后约 7 MB）：

| 文件 | 用途 | 主要字段 |
| --- | --- | --- |
| `corpus.json` | 台词与检索块 | `utterances[]`（逐句）、`chunks[]`（检索块，带 `start/end` 指向 utterances）、`pairs[]` |
| `plot.json` | 剧情纲要 | `beats{}`（剧情单元）、`cases{}`（案件梗概与一句话简介） |
| `characters.json` | 人物档案 | `characters[]`、`alias_index{}`、`ambiguous{}` |
| `nouns.json` | 专有名词 | `entries[]`（释义、台词出处、首次案件） |
| `novel.json` | 原著小说（可选） | `volumes[]`（部）、`chapters[]`（章，带案件/部/回目）、`paragraphs[]`（段，≤450 字，带 `dialogue` 标记） |

`novel.json` 是**低优先级补充层**，规则和 QQ 机器人一致：

1. 首轮只查台词/人物/专名，小说不参与；用户明确说“小说/原著”时才直接进小说层；
2. 台词定位到具体段落后，按台词长句与小说段落的公共子串做**同场景对齐**，只补动作、打斗、心理、表情；
3. 台词、人物、专名里都没有的主体，或整段经过只在小说里，走**小说独有模式**，回答必须先说明“台词里没直接演”；
4. 回答里用到小说必须写“小说补充：/小说里写”，不能用「」当台词引用；冲突时以台词/剧情纲要为准；
5. **出题、提示一律不用小说**。

运行时按下面的顺序找素材目录：

1. 插件配置 `dataDir`（可相对包目录，也可绝对路径）；
2. 环境变量 `SHENDI_DATA_DIR`；
3. `<包目录>/../data`（本地开发时放最新素材的地方）；
4. `<包目录>/data`（包内自带的快照）。

想换成自己的素材：把同样四份 JSON 放进 `../data`，或设置 `dataDir` 指过去即可，
不用改代码。素材更新后无需重启——每次请求前会比对文件 mtime/大小，变了就重建索引（约 0.3 秒）。

### 素材来源与版权

这份素材由使用者在本地整理（台词来自《神探狄仁杰》第一、二、三部与《神断狄仁杰》，
人物与专名资料为人工整理），**版权归原剧方所有**，随插件分发仅供剧情交流与学习使用。
如果你对素材的再分发有顾虑，或想换用自己的版本，删除 `data/` 并把 `dataDir` 指到你自己的目录即可，
插件本身不依赖任何固定内容。

## 配置

在 profile 的 `cordis.patch.yml` 里按行 id 覆盖：

```yaml
- id: shendi-bot
  name: 'dsh-shendi-bot'
  config:
    # dataDir: '/absolute/path/to/data'
    preferNative: false         # 未配置专用 API 时优先跟随 DSH 默认模型
    # provider: deepseek-official   # 想钉死某条路由时再填这两个
    # model: deepseek-flash
    maxEvidenceChars: 5600      # 拼进提示词的台词上限（字）
    maxAnswerTokens: 1500
    quizMaxTokens: 1600
    requestTimeoutMs: 120000
    quizTimeoutMs: 90000
```

## 模型与隐私

手选优先；在「自动」模式下，顺序为：机器人专用 API → 插件显式配置的 `provider` + `model` → DSH 默认模型 → 第一个可发现的模型。旧配置显式设置 `preferNative: true` 时，会在检查 DSH 默认模型前先查官方路由。专用 API 配置不完整会提示修正，不会静默改用 DSH；已选路由调用失败时也不会向其他服务商重发。出题失败可退回本地备用题。

DSH 模型的 Key 由 DSH 管理；专用 API 的 Key 由 Host 环境提供，不写入插件设置、浏览器存储或接口状态。浏览器只记忆手选的提供方和模型 ID。模型请求会把用户问题、同一模型下的必要近期对话与检索出的片段发送给对应服务商；切换模型时不会转发之前模型的对话。

## 接口

同源 JSON，均返回 `{ ok, ... }`：

- `GET  /shendi-bot/api/status` — 素材统计、案件清单、当前路由与来源
- `POST /shendi-bot/api/ask` — `{ question, history?, historyRoute?, provider?, model? }` → `{ answer, evidence, meta }`；`historyRoute` 的 `provider` / `model` 必须和实际路由一致才会使用历史。
- `POST /shendi-bot/api/quiz` — `{ cases, count, forms, settings, provider?, model? }` → `{ items, meta }`
- `GET  /shendi-bot/api/models` — DSH 模型、机器人专用模型（若已配置）和自动路由；`?refresh=1` 重新读取 DSH 模型目录。

插件只支持本机 Web 面板，不通过公网或跨源页面提供模型中转。

## 限制

- 检索是台词行二元组 BM25 + 人物/专名命中 + 案件内聚，没有分词词典；素材质量决定回答质量。
- 整案梗概来自 `plot.json`，是离线压缩的结果，极少数细节可能与原台词有出入。
- 小说与剧集不完全对应，个别表述、人物细节会有出入；插件按“台词/剧情纲要优先、小说只补空白”的口径回答，
  小说独有的内容会写明“小说补充”。
- 出题不建题库，每次现抽台词块现生成。
- 首次打开面板时会在内存里建索引（约 0.4 秒、约 200 MB 常驻），之后是毫秒级检索。

## 许可证

插件代码为 MIT；台词素材及其衍生的 `data/*.json` 不在该许可范围内，见上文「素材来源与版权」。
