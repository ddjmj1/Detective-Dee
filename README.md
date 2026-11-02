# Detective Dee · 神探狄仁杰机器人

DeepSeek Harness 的插件：左侧栏面板，用台词素材回答《神探狄仁杰》剧情问题，并按案件/题型现出题目。
自带台词素材，装完即用；模型可选用 DSH 里已配置的任意一个。

- npm 包：[`dsh-shendi-bot`](https://www.npmjs.com/package/dsh-shendi-bot)
- 市场索引：`https://raw.githubusercontent.com/ddjmj1/Detective-Dee/main/index.json`

## 安装

**通过插件市场（推荐）**

1. 在 DSH 里启用实验性市场界面 `@deepseek-ai/dsh-experimental-plugin-market-bundle`；
2. 在「发现」里把上面的索引 URL 加为市场源；
3. 搜索「神探狄仁杰机器人」，点安装。

**直接按包名安装**

```powershell
# 在 DSH 的插件管理器里用下面这个安装目标
dsh-shendi-bot@1.0.0
```

**本地开发**

把插件源码目录路径交给插件管理器安装，改动即时生效。

## 仓库内容

| 文件 | 说明 |
| --- | --- |
| `index.json` | 插件市场索引（format 1）。`index.json` 自身带图标（data URL），不需要额外图片 |
| `LICENSE` | MIT，仅覆盖插件代码 |

插件源码随 npm 包分发：`index.js`、`client.js`、`lib/*.js`、`locale/*.json`、`icon.svg`，
以及内置素材 `data/corpus.json`、`data/plot.json`、`data/characters.json`、`data/nouns.json`。

## 用法

- **问答**：直接问剧情，回答会附上引用的台词片段；素材里没有的会直说。
- **出题**：选案件、数量、题型（选择题/问答题/台词填空/判断题）、侧重（细节/人物身份/原因目的）。
- **模型**：面板顶部下拉框列出 DSH 里已配置凭据的模型，默认跟随 DSH 自带的 DeepSeek 路由。

## 数据与版权

台词素材来自《神探狄仁杰》第一、二、三部与《神断狄仁杰》，由使用者整理，版权归原剧方所有，
随插件分发仅供剧情交流与学习。插件本身不依赖固定内容：删除 `data/` 或把 `dataDir` 指向自己的
素材目录即可替换。
