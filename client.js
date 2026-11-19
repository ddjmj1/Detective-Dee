window.__ModuleLoader__.load({
  id: 'dsh-shendi-bot',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'shendi'
    const API = '/shendi-bot/api'
    const CUSTOM_PROVIDER = 'shendi-custom'

    const DICT = {
      'zh-CN': {
        'panel.title': '神探狄仁杰机器人',
        'panel.subtitle': '《神探狄仁杰》剧情问答与出题',
        'tab.ask': '问答',
        'tab.quiz': '出题',
        'ask.placeholder': '问一个剧情问题，例如：李元芳的链子刀是哪来的？',
        'ask.send': '提问',
        'ask.thinking': '正在检索台词并组织回答…',
        'ask.empty': '根据本地台词素材回答；找不到相关依据时会说明。',
        'model.label': '模型',
        'model.auto': '自动',
        'model.refresh': '刷新模型',
        'model.loading': '正在加载模型…',
        'model.unavailable': '所选模型未列出，请检查配置或刷新后重选。',
        'model.help': '在 DSH「设置 → 模型」添加自有 API，再点“刷新模型”。也可用 SHENDI_LLM_* 环境变量配置机器人专用 API。',
        'model.privacy': '问题、同一模型下的近期对话和相关素材会发给所选提供方。',
        'model.custom': '机器人专用 API',
        'quiz.fallbackNotice': '部分题目未能由模型生成，已显示本地备用题。',
        'ask.history': '清空对话',
        'evidence.title': '台词依据',
        'evidence.none': '这次没有引用台词片段。',
        'quiz.cases': '案件',
        'quiz.all': '全部',
        'quiz.count': '数量',
        'quiz.forms': '题型',
        'quiz.settings': '侧重',
        'quiz.generate': '出题',
        'quiz.generating': '正在出题…',
        'quiz.show': '显示答案',
        'quiz.hide': '收起答案',
        'quiz.again': '换一题',
        'quiz.copy': '复制',
        'quiz.copied': '已复制',
        'quiz.empty': '选好案件和题型，点“出题”。',
        'quiz.answer': '答案',
        'quiz.explanation': '解析',
        'quiz.evidence': '依据',
        'quiz.fallback': '备用题',
        'status.loading': '正在载入台词索引…',
        'status.failed': '素材未就绪',
        'status.chunks': '台词块',
        'status.cases': '案件',
        'status.chars': '人物',
        'status.nouns': '专名',
        'status.novel': '小说段',
      },
      en: {
        'panel.title': 'Detective Di Bot',
        'panel.subtitle': 'Detective Di plot Q&A and quiz builder',
        'tab.ask': 'Ask',
        'tab.quiz': 'Quiz',
        'ask.placeholder': 'Ask a plot question, e.g. where did Li Yuanfang get his chain blade?',
        'ask.send': 'Ask',
        'ask.thinking': 'Searching the transcripts and composing an answer…',
        'ask.empty': 'The bot looks for evidence in the local transcripts before answering.',
        'model.label': 'Model',
        'model.auto': 'Automatic',
        'model.refresh': 'Refresh models',
        'model.loading': 'Loading models…',
        'model.unavailable': 'The selected model is not listed. Check your settings or refresh and select it again.',
        'model.help': 'Add your API in DSH Settings → Models, then select Refresh models. For a bot-only API, set the SHENDI_LLM_* environment variables.',
        'model.privacy': 'Your question, recent exchanges on the same model, and relevant excerpts go to the selected provider.',
        'model.custom': 'Bot-only API',
        'quiz.fallbackNotice': 'The model could not generate some questions, so local fallback questions are shown.' ,
        'ask.history': 'Clear chat',
        'evidence.title': 'Transcript evidence',
        'evidence.none': 'No transcript excerpt was cited this time.',
        'quiz.cases': 'Cases',
        'quiz.all': 'All',
        'quiz.count': 'Count',
        'quiz.forms': 'Form',
        'quiz.settings': 'Focus',
        'quiz.generate': 'Build questions',
        'quiz.generating': 'Building questions…',
        'quiz.show': 'Show answer',
        'quiz.hide': 'Hide answer',
        'quiz.again': 'Another',
        'quiz.copy': 'Copy',
        'quiz.copied': 'Copied',
        'quiz.empty': 'Pick cases and forms, then build questions.',
        'quiz.answer': 'Answer',
        'quiz.explanation': 'Why',
        'quiz.evidence': 'Evidence',
        'quiz.fallback': 'Fallback',
        'status.loading': 'Loading the transcript index…',
        'status.failed': 'Corpus unavailable',
        'status.chunks': 'chunks',
        'status.cases': 'cases',
        'status.chars': 'people',
        'status.nouns': 'terms',
        'status.novel': 'novel paras',
      },
    }

    const CSS = `
.sd-root{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}
.sd-header{display:flex;align-items:center;gap:12px;padding:14px 20px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.sd-mark{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-brand-primary);flex:none}
.sd-headtext{min-width:0;flex:1}
.sd-title{font-size:15px;font-weight:600;letter-spacing:.2px}
.sd-sub{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sd-meta{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.sd-pill{font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:2px 8px;white-space:nowrap}
.sd-pill.warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.sd-tabs{display:flex;gap:4px;padding:8px 20px 0}
.sd-toolbar{display:flex;align-items:center;gap:8px;padding:8px 20px 0;flex-wrap:wrap}
.sd-toolbar-label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.sd-model-select{min-width:0;max-width:min(360px,100%);text-overflow:ellipsis}
.sd-meta{min-width:0;max-width:50%}
.sd-pill{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.sd-mini{overflow-wrap:anywhere}
.sd-tab{appearance:none;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;padding:5px 12px;border-radius:7px;cursor:pointer}
.sd-tab:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.sd-tab[aria-selected="true"]{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-weight:600}
.sd-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:12px 20px 16px;gap:10px}
.sd-banner{border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);border-radius:8px;padding:8px 10px;font-size:12px;background:var(--dsw-alias-bg-layer-1)}
.sd-chat{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:4px 2px 6px}
.sd-msg{display:flex;gap:9px;align-items:flex-start;max-width:100%}
.sd-msg.user{flex-direction:row-reverse}
.sd-avatar{width:26px;height:26px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:11px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
.sd-msg.user .sd-avatar{color:var(--dsw-alias-brand-primary)}
.sd-bubble{min-width:0;max-width:min(760px,88%);border-radius:11px;padding:9px 12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.sd-msg.user .sd-bubble{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.sd-text{white-space:pre-wrap;word-break:break-word}
.sd-text p{margin:0 0 7px}
.sd-text p:last-child{margin-bottom:0}
.sd-foot{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:7px;padding-top:7px;border-top:1px dashed var(--dsw-alias-border-l1)}
.sd-link{appearance:none;border:none;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12px;cursor:pointer;padding:0}
.sd-link:hover{text-decoration:underline}
.sd-mini{font-size:11px;color:var(--dsw-alias-label-secondary)}
.sd-evidence{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.sd-ev{border-left:2px solid var(--dsw-alias-border-l2);padding:2px 0 2px 9px}
.sd-ev-head{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}
.sd-tag{font-size:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:0 5px;color:var(--dsw-alias-label-secondary)}
.sd-tag.flash{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.sd-ev-text{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;margin-top:2px}
.sd-typing{display:inline-flex;gap:3px;align-items:center}
.sd-dot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-label-secondary);animation:sd-blink 1.2s infinite ease-in-out}
.sd-dot:nth-child(2){animation-delay:.18s}
.sd-dot:nth-child(3){animation-delay:.36s}
@keyframes sd-blink{0%,80%,100%{opacity:.25}40%{opacity:1}}
.sd-composer{display:flex;gap:8px;align-items:flex-end;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;padding:8px;background:var(--dsw-alias-bg-layer-1)}
.sd-input{flex:1;min-height:38px;max-height:140px;resize:none;border:none;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5;padding:4px 6px}
.sd-btn{appearance:none;font:inherit;font-size:13px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);padding:7px 14px;cursor:pointer;white-space:nowrap}
.sd-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l2)}
.sd-btn:disabled{opacity:.55;cursor:default}
.sd-btn.primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:600}
.sd-btn.ghost{background:transparent}
.sd-suggest{display:flex;flex-wrap:wrap;gap:6px}
.sd-sug{appearance:none;font:inherit;font-size:12px;border:1px dashed var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:3px 10px;cursor:pointer}
.sd-sug:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary)}
.sd-quiz{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:2px}
.sd-controls{display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;padding:12px;background:var(--dsw-alias-bg-layer-1)}
.sd-row{display:flex;gap:10px;align-items:flex-start}
.sd-rowlabel{font-size:12px;color:var(--dsw-alias-label-secondary);width:52px;flex:none;padding-top:3px}
.sd-chips{display:flex;flex-wrap:wrap;gap:6px;flex:1;min-width:0}
.sd-chip{appearance:none;font:inherit;font-size:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:3px 10px;cursor:pointer}
.sd-chip:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.sd-chip[aria-pressed="true"]{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:600}
.sd-select{font:inherit;font-size:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:7px;padding:3px 8px}
.sd-cards{display:flex;flex-direction:column;gap:10px}
.sd-card{border:1px solid var(--dsw-alias-border-l1);border-radius:11px;padding:12px 14px;background:var(--dsw-alias-bg-layer-1)}
.sd-card-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:7px}
.sd-index{font-size:11px;font-weight:700;color:var(--dsw-alias-brand-primary)}
.sd-question{font-size:13.5px;font-weight:600;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.sd-options{display:flex;flex-direction:column;gap:4px;margin-top:8px}
.sd-option{display:flex;gap:7px;font-size:13px;color:var(--dsw-alias-label-secondary)}
.sd-option b{color:var(--dsw-alias-label-primary);font-weight:600}
.sd-option.correct b,.sd-option.correct{color:var(--dsw-alias-state-success-primary)}
.sd-answer{margin-top:9px;border-top:1px dashed var(--dsw-alias-border-l1);padding-top:8px;display:flex;flex-direction:column;gap:5px}
.sd-answer .k{color:var(--dsw-alias-label-secondary);font-size:11px}
.sd-answer .v{color:var(--dsw-alias-label-primary);font-size:13px;white-space:pre-wrap;word-break:break-word}
.sd-card-actions{display:flex;gap:8px;margin-top:10px}
.sd-empty{color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center;padding:24px 0}
@media (max-width:640px){.sd-header{padding:12px 14px 8px}.sd-body{padding:10px 14px 14px}.sd-toolbar{padding:8px 14px 0}.sd-model-select{max-width:220px}.sd-meta{display:none}}
`

    function translateFactory(ctx) {
      let t = null
      try {
        const locale = ctx.get('locale')
        if (locale && typeof locale.register === 'function') {
          for (const [tag, dict] of Object.entries(DICT)) {
            try {
              locale.register(NS, tag, dict)
            } catch {
              // 语言包注册失败不影响面板
            }
          }
          if (typeof locale.bind === 'function') t = locale.bind(NS)
        }
      } catch {
        t = null
      }
      return (key, fallback) => {
        if (!t) return fallback
        try {
          const value = t(key)
          return value && value !== key ? value : fallback
        } catch {
          return fallback
        }
      }
    }

    async function api(path, body) {
      const init = body === undefined
        ? { method: 'GET' }
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      let response
      try {
        response = await fetch(`${API}${path}`, init)
      } catch (error) {
        throw new Error(`连不上面板接口：${error && error.message ? error.message : '网络错误'}`)
      }
      if (response.status === 404) {
        throw new Error('面板后端接口没有注册（HTTP 404）：刷新页面即可；仍不行就重启 DSH')
      }
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error(`接口返回的不是 JSON（HTTP ${response.status}）`)
      }
      if (!data || data.ok !== true) throw new Error((data && data.error) || `请求失败（HTTP ${response.status}）`)
      return data
    }

    /** 'provider|model' -> { provider, model }，空串表示跟随自动路由。 */
    function routeParts(route) {
      const text = String(route || '')
      const at = text.indexOf('|')
      if (at <= 0) return {}
      return { provider: text.slice(0, at), model: text.slice(at + 1) }
    }

    function Mark() {
      return h('svg', { width: 20, height: 20, viewBox: '0 0 64 64', 'aria-hidden': true, style: { display: 'block' } },
        h('circle', { cx: 27, cy: 27, r: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 4 }),
        h('path', { d: 'M19 24.5h16M19 29.5h12M19 34.5h9', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.75 }),
        h('path', { d: 'M39.2 39.2 51 51', stroke: 'currentColor', strokeWidth: 6, strokeLinecap: 'round' }))
    }

    function SidebarIcon(props) {
      const size = Number(props && props.size) || 20
      return h('svg', {
        width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': true,
        style: { display: 'block', color: props && props.active ? 'var(--dsw-alias-brand-primary)' : 'currentColor' },
      },
      h('circle', { cx: 27, cy: 27, r: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 3.6 }),
      h('path', { d: 'M19 24.5h16M19 29.5h12M19 34.5h9', stroke: 'currentColor', strokeWidth: 2.8, strokeLinecap: 'round', opacity: 0.8 }),
      h('path', { d: 'M39.2 39.2 51 51', stroke: 'currentColor', strokeWidth: 5.2, strokeLinecap: 'round' }))
    }

    function Chip(props) {
      return h('button', {
        type: 'button',
        className: 'sd-chip',
        'aria-pressed': props.active ? 'true' : 'false',
        onClick: props.onClick,
        title: props.title || props.label,
      }, props.label)
    }

    function Paragraphs(props) {
      const parts = String(props.text || '').split(/\n{2,}/).filter((part) => part.trim())
      const nodes = (parts.length > 0 ? parts : ['']).map((part, index) => h('p', { key: index }, part))
      return h('div', { className: 'sd-text' }, nodes)
    }

    function EvidenceList(props) {
      const t = props.t
      if (!props.items || props.items.length === 0) {
        return h('div', { className: 'sd-mini' }, t('evidence.none', '这次没有引用台词片段。'))
      }
      return h('div', { className: 'sd-evidence' }, props.items.map((item, index) => h('div', { className: 'sd-ev', key: index },
        h('div', { className: 'sd-ev-head' },
          h('span', null, [item.season, item.case, item.scene].filter(Boolean).join(' · ')),
          item.flash ? h('span', { className: 'sd-tag flash' }, '插叙回忆') : null),
        h('div', { className: 'sd-ev-text' }, item.excerpt))))
    }

    function Message(props) {
      const { message, t } = props
      const [showEvidence, setShowEvidence] = React.useState(false)
      const isUser = message.role === 'user'
      return h('div', { className: `sd-msg ${isUser ? 'user' : 'assistant'}` },
        h('div', { className: 'sd-avatar' }, isUser ? '我' : h('div', { style: { transform: 'scale(.62)' } }, h(Mark))),
        h('div', { className: 'sd-bubble' },
          message.pending
            ? h('div', { className: 'sd-mini' }, t('ask.thinking', '正在检索台词并组织回答…'),
              h('span', { className: 'sd-typing', style: { marginLeft: 6 } },
                h('span', { className: 'sd-dot' }), h('span', { className: 'sd-dot' }), h('span', { className: 'sd-dot' })))
            : h(Paragraphs, { text: message.content }),
          !message.pending && !isUser && message.evidence && message.evidence.length > 0
            ? h('div', { className: 'sd-foot' },
              h('button', {
                type: 'button', className: 'sd-link',
                onClick: () => setShowEvidence((value) => !value),
              }, `${t('evidence.title', '台词依据')}（${message.evidence.length}）`),
              message.meta && message.meta.case ? h('span', { className: 'sd-mini' }, `《${message.meta.case}》`) : null,
              message.meta && message.meta.model ? h('span', { className: 'sd-mini' }, `· ${message.meta.model}`) : null)
            : null,
          showEvidence ? h(EvidenceList, { items: message.evidence, t }) : null))
    }

    function QuizCard(props) {
      const { item, index, t } = props
      const [open, setOpen] = React.useState(false)
      const [copied, setCopied] = React.useState(false)
      const letters = ['A', 'B', 'C', 'D']
      const optionRows = letters.filter((letter) => item.options && item.options[letter]).map((letter) => {
        const correct = open && item.letter === letter
        return h('div', { key: letter, className: `sd-option${correct ? ' correct' : ''}` },
          h('b', null, `${letter}.`), h('span', null, item.options[letter]))
      })
      const copy = async () => {
        const lines = [`${index + 1}. ${item.question}`]
        if (item.options && item.options.A) {
          for (const letter of letters) if (item.options[letter]) lines.push(`${letter}. ${item.options[letter]}`)
        }
        lines.push(`答案：${item.answer}`)
        if (item.explanation) lines.push(`解析：${item.explanation}`)
        try {
          await navigator.clipboard.writeText(lines.join('\n'))
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        } catch {
          setCopied(false)
        }
      }
      return h('div', { className: 'sd-card' },
        h('div', { className: 'sd-card-head' },
          h('span', { className: 'sd-index' }, String(index + 1).padStart(2, '0')),
          h('span', { className: 'sd-tag' }, item.form === 'choice' ? '选择题' : item.form === 'quote' ? '台词填空' : item.form === 'judge' ? '判断题' : '问答题'),
          h('span', { className: 'sd-tag' }, item.setting === 'identity' ? '人物/身份' : item.setting === 'reason' ? '原因/目的' : '细节'),
          h('span', { className: 'sd-tag' }, item.difficulty || '中档'),
          item.case ? h('span', { className: 'sd-tag' }, `《${item.case}》`) : null,
          item.flash ? h('span', { className: 'sd-tag flash' }, '插叙回忆') : null,
          item.fallback ? h('span', { className: 'sd-tag' }, t('quiz.fallback', '备用题')) : null),
        h('div', { className: 'sd-question' }, item.question),
        optionRows.length > 0 ? h('div', { className: 'sd-options' }, optionRows) : null,
        open
          ? h('div', { className: 'sd-answer' },
            h('div', null, h('span', { className: 'k' }, `${t('quiz.answer', '答案')}：`), h('span', { className: 'v' }, item.answer)),
            item.explanation ? h('div', null, h('span', { className: 'k' }, `${t('quiz.explanation', '解析')}：`), h('span', { className: 'v' }, item.explanation)) : null,
            item.evidence ? h('div', null, h('span', { className: 'k' }, `${t('quiz.evidence', '依据')}：`), h('span', { className: 'v' }, item.evidence)) : null)
          : null,
        h('div', { className: 'sd-card-actions' },
          h('button', { type: 'button', className: 'sd-btn ghost', onClick: () => setOpen((value) => !value) },
            open ? t('quiz.hide', '收起答案') : t('quiz.show', '显示答案')),
          h('button', { type: 'button', className: 'sd-btn ghost', onClick: copy, disabled: !item.answer },
            copied ? t('quiz.copied', '已复制') : t('quiz.copy', '复制')),
          h('button', { type: 'button', className: 'sd-btn ghost', onClick: () => props.onAgain(index), disabled: props.busy },
            t('quiz.again', '换一题'))))
    }

    // 面板由 slot 实例化，拿不到我们自己的 props；Client 上下文在这里落一份。
    let panelTranslator = null

    function ShendiPanel() {
      const [t, setT] = React.useState(() => (key, fallback) => fallback)
      const [status, setStatus] = React.useState(null)
      const [statusError, setStatusError] = React.useState('')
      const [tab, setTab] = React.useState('ask')

      const [messages, setMessages] = React.useState([])
      const [input, setInput] = React.useState('')
      const [asking, setAsking] = React.useState(false)
      const [askError, setAskError] = React.useState('')
      const listRef = React.useRef(null)

      const [cases, setCases] = React.useState([])
      const [count, setCount] = React.useState(3)
      const [forms, setForms] = React.useState(['choice'])
      const [settings, setSettings] = React.useState(['detail'])
      const [quizItems, setQuizItems] = React.useState([])
      const [quizBusy, setQuizBusy] = React.useState(false)
      const [quizError, setQuizError] = React.useState('')
      const [quizDiagnostic, setQuizDiagnostic] = React.useState('')
      const [statusNonce, setStatusNonce] = React.useState(0)

      // 模型选择：'' = 自动（DSH 自带 DeepSeek / 默认模型），'provider|model' = 手动指定
      const [route, setRoute] = React.useState(() => {
        try {
          return window.localStorage.getItem('shendi-bot.route') || ''
        } catch {
          return ''
        }
      })
      const [modelGroups, setModelGroups] = React.useState([])
      const [modelsLoading, setModelsLoading] = React.useState(true)
      const [modelsError, setModelsError] = React.useState('')


      React.useEffect(() => {
        if (panelTranslator) setT(() => panelTranslator)
      }, [])

      React.useEffect(() => {
        let alive = true
        setModelsLoading(true)
        setModelsError('')
        api(statusNonce ? '/models?refresh=1' : '/models')
          .then((data) => {
            if (!alive) return
            setModelGroups(Array.isArray(data.providers) ? data.providers : [])
          })
          .catch((error) => {
            if (alive) setModelsError(error.message)
          })
          .finally(() => { if (alive) setModelsLoading(false) })
        return () => {
          alive = false
        }
      }, [statusNonce])

      React.useEffect(() => {
        let alive = true
        api('/status')
          .then((data) => {
            if (!alive) return
            setStatus(data)
            setStatusError('')
          })
          .catch((error) => {
            if (!alive) return
            setStatusError(error.message)
          })
        return () => {
          alive = false
        }
      }, [statusNonce])

      React.useEffect(() => {
        const node = listRef.current
        if (node) node.scrollTop = node.scrollHeight
      }, [messages])

      const toggle = (list, value) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value])

      const chooseRoute = (value) => {
        setRoute(value)
        try {
          if (value) window.localStorage.setItem('shendi-bot.route', value)
          else window.localStorage.removeItem('shendi-bot.route')
        } catch {
          // 存不了就只在本次会话里生效
        }
      }

      const manualRoute = routeParts(route)
      const routeMissing = Boolean(route && !modelGroups.some((group) =>
        group.id === manualRoute.provider && group.models?.includes(manualRoute.model)))
      const routeBlocked = Boolean(route && (modelsLoading || routeMissing))
      const effectiveModel = route ? (!routeBlocked ? manualRoute : null) : status?.model

      const send = async (text) => {
        const question = String(text ?? input).trim()
        if (!question || asking || routeBlocked) return
        const previous = messages.at(-1)
        const historyRoute = effectiveModel && previous?.meta?.provider === effectiveModel.provider && previous?.meta?.model === effectiveModel.model
          ? { provider: effectiveModel.provider, model: effectiveModel.model } : undefined
        const history = []
        if (historyRoute) {
          for (let i = messages.length - 1; i > 0 && history.length < 6; i -= 2) {
            const entry = messages[i]
            if (entry.meta?.provider !== historyRoute.provider || entry.meta?.model !== historyRoute.model) break
            history.unshift(...[messages[i - 1], entry].map(({ role, content }) => ({ role, content })))
          }
        }
        const userMessage = { id: `u${Date.now()}`, role: 'user', content: question }
        const pending = { id: `p${Date.now()}`, role: 'assistant', content: '', pending: true }
        setMessages((prev) => [...prev, userMessage, pending])
        setInput('')
        setAsking(true)
        setAskError('')
        try {
          const data = await api('/ask', { question, history, historyRoute, ...routeParts(route) })
          setMessages((prev) => prev.map((message) => message.id === pending.id
            ? { id: pending.id, role: 'assistant', content: data.answer, evidence: data.evidence, meta: data.meta }
            : message))
        } catch (error) {
          setAskError(error.message)
          setMessages((prev) => prev.map((message) => message.id === pending.id
            ? { id: pending.id, role: 'assistant', content: `这次没答上来：${error.message}` }
            : message))
        } finally {
          setAsking(false)
        }
      }

      const buildQuiz = async () => {
        if (quizBusy || routeBlocked) return
        setQuizBusy(true)
        setQuizError('')
        try {
          const data = await api('/quiz', { cases, count, forms, settings, ...routeParts(route) })
          setQuizDiagnostic(data.meta?.diagnostics?.[0] || '')
          setQuizItems(data.items.map((item, index) => ({ ...item, key: `${Date.now()}-${index}` })))
        } catch (error) {
          setQuizError(error.message)
        } finally {
          setQuizBusy(false)
        }
      }

      const again = async (index) => {
        if (quizBusy || routeBlocked) return
        setQuizBusy(true)
        setQuizError('')
        try {
          const data = await api('/quiz', { cases, count: 1, forms, settings, ...routeParts(route) })
          if (data.meta?.diagnostics?.[0]) setQuizDiagnostic(data.meta.diagnostics[0])
          const item = data.items && data.items[0]
          if (item) {
            setQuizItems((prev) => prev.map((existing, position) => (position === index ? { ...item, key: `${Date.now()}-${position}` } : existing)))
          }
        } catch (error) {
          setQuizError(error.message)
        } finally {
          setQuizBusy(false)
        }
      }

      const stats = status && status.stats ? status.stats : null
      const suggestions = [
        '李元芳的链子刀是哪来的？',
        '邗沟覆船案整个案子的来龙去脉是什么？',
        '黑衣社是谁建立的？',
        '狄仁杰为什么要在彭泽审周二？',
      ]

      const modelLabel = (model) => model.provider === CUSTOM_PROVIDER
        ? `${t('model.custom', '机器人专用 API')} / ${model.model}`
        : `${model.provider}/${model.model}`

      const headerMeta = []
      if (statusError) headerMeta.push(h('span', { className: 'sd-pill warn', key: 'warn' }, t('status.failed', '素材未就绪')))
      else if (!status) headerMeta.push(h('span', { className: 'sd-pill', key: 'loading' }, t('status.loading', '正在载入台词索引…')))
      else if (stats) {
        headerMeta.push(h('span', { className: 'sd-pill', key: 'chunks' }, `${stats.chunks} ${t('status.chunks', '台词块')}`))
        headerMeta.push(h('span', { className: 'sd-pill', key: 'cases' }, `${stats.cases} ${t('status.cases', '案件')}`))
        headerMeta.push(h('span', { className: 'sd-pill', key: 'chars' }, `${stats.characters} ${t('status.chars', '人物')}`))
        if (stats.novel && stats.novel.available) {
          headerMeta.push(h('span', {
            className: 'sd-pill',
            key: 'novel',
            title: `原著 ${stats.novel.volumes} 部 / ${stats.novel.chapters} 章，仅用于补充台词没交代的细节`,
          }, `${stats.novel.paragraphs} ${t('status.novel', '小说段')}`))
        }
        if (effectiveModel) {
          headerMeta.push(h('span', {
            className: 'sd-pill', key: 'model',
            title: t('model.privacy', '问题、同一模型下的近期对话和相关素材会发给所选提供方。'),
          }, modelLabel(effectiveModel)))
        } else if (status.modelError) {
          headerMeta.push(h('span', { className: 'sd-pill warn', key: 'model', title: status.modelError }, '未配置模型'))
        }
      }

      const automatic = t('model.auto', '自动')
      const autoLabel = status?.model ? `${automatic} · ${modelLabel(status.model)}` : automatic
      const modelOptions = [h('option', { key: 'auto', value: '' }, autoLabel)]
      if (routeMissing) modelOptions.push(h('option', { key: 'missing', value: route, disabled: true }, modelLabel(manualRoute)))
      for (const group of modelGroups) {
        if (!group || !Array.isArray(group.models) || group.models.length === 0) continue
        modelOptions.push(h('optgroup', { key: group.id, label: group.id === CUSTOM_PROVIDER ? t('model.custom', '机器人专用 API') : (group.name || group.id) },
          group.models.map((model) => h('option', {
            key: `${group.id}|${model}`,
            value: `${group.id}|${model}`,
          }, model))))
      }
      const toolbar = h('div', { className: 'sd-toolbar' },
        h('label', { className: 'sd-toolbar-label', htmlFor: 'sd-model' }, t('model.label', '模型')),
        h('select', {
          id: 'sd-model', className: 'sd-select sd-model-select', value: route,
          disabled: asking || quizBusy, onChange: (event) => chooseRoute(event.target.value),
        }, modelOptions),
        h('button', {
          type: 'button', className: 'sd-btn ghost', disabled: modelsLoading,
          onClick: () => setStatusNonce((value) => value + 1),
        }, t('model.refresh', '刷新模型')),
        h('div', { className: 'sd-mini', style: { flexBasis: '100%' }, role: 'status' },
          modelsLoading ? t('model.loading', '正在加载模型…') : modelsError ||
          (routeMissing ? t('model.unavailable', '所选模型未列出，请检查配置或刷新后重选。') :
            (!route && status?.modelError ? status.modelError : t('model.privacy', '问题、同一模型下的近期对话和相关素材会发给所选提供方。')))),
        h('div', { className: 'sd-mini', style: { flexBasis: '100%' } }, t('model.help', '在 DSH「设置 → 模型」添加自有 API，再点“刷新模型”。也可用 SHENDI_LLM_* 环境变量配置机器人专用 API。')))

      const askPane = h('div', { className: 'sd-body', style: { display: tab === 'ask' ? 'flex' : 'none' } },
        statusError
          ? h('div', { className: 'sd-banner' },
            `${t('status.failed', '素材未就绪')}：${statusError} `,
            h('button', {
              type: 'button',
              className: 'sd-link',
              style: { marginLeft: 6 },
              onClick: () => setStatusNonce((value) => value + 1),
            }, '重试'))
          : null,
        askError ? h('div', { className: 'sd-banner' }, askError) : null,
        h('div', { className: 'sd-chat', ref: listRef },
          messages.length === 0
            ? h('div', { className: 'sd-empty' },
              h('div', { style: { marginBottom: 10 } }, t('ask.empty', '根据本地台词素材回答；找不到相关依据时会说明。')),
              h('div', { className: 'sd-suggest' }, suggestions.map((text) => h('button', {
                key: text, type: 'button', className: 'sd-sug', disabled: asking || routeBlocked, onClick: () => send(text),
              }, text))))
            : messages.map((message) => h(Message, { key: message.id, message, t }))),
        h('div', { className: 'sd-suggest' },
          messages.length > 0
            ? h('button', {
              type: 'button', className: 'sd-sug', onClick: () => { setMessages([]); setAskError('') },
            }, t('ask.history', '清空对话'))
            : null),
        h('div', { className: 'sd-composer' },
          h('textarea', {
            className: 'sd-input',
            value: input,
            rows: 1,
            placeholder: t('ask.placeholder', '问一个剧情问题，例如：李元芳的链子刀是哪来的？'),
            onChange: (event) => setInput(event.target.value),
            onKeyDown: (event) => {
              const composing = Boolean(event.nativeEvent && event.nativeEvent.isComposing)
              if (event.key === 'Enter' && !event.shiftKey && !composing) {
                event.preventDefault()
                send()
              }
            },
          }),
          h('button', {
            type: 'button', className: 'sd-btn primary', onClick: () => send(), disabled: asking || routeBlocked || !input.trim(),
          }, asking ? '…' : t('ask.send', '提问'))))

      const quizPane = h('div', { className: 'sd-body', style: { display: tab === 'quiz' ? 'flex' : 'none' } },
        quizError ? h('div', { className: 'sd-banner', role: 'alert' }, quizError) : null,
        quizItems.some((item) => item.fallback) ? h('div', { className: 'sd-mini', role: 'status' },
          t('quiz.fallbackNotice', '部分题目未能由模型生成，已显示本地备用题。'), quizDiagnostic ? ` ${quizDiagnostic}` : null) : null,
        h('div', { className: 'sd-controls' },
          h('div', { className: 'sd-row' },
            h('span', { className: 'sd-rowlabel' }, t('quiz.cases', '案件')),
            h('div', { className: 'sd-chips' },
              h(Chip, {
                label: t('quiz.all', '全部'),
                active: cases.length === 0,
                onClick: () => setCases([]),
                title: '全部案件',
              }),
              (status && status.cases ? status.cases : []).map((item) => h(Chip, {
                key: item.name,
                label: item.name,
                title: `${item.season} · ${item.brief || ''}`,
                active: cases.includes(item.name),
                onClick: () => setCases((prev) => toggle(prev, item.name)),
              })))),
          h('div', { className: 'sd-row' },
            h('span', { className: 'sd-rowlabel' }, t('quiz.forms', '题型')),
            h('div', { className: 'sd-chips' },
              [['choice', '选择题'], ['open', '问答题'], ['quote', '台词填空'], ['judge', '判断题']].map(([value, label]) => h(Chip, {
                key: value, label, active: forms.includes(value), onClick: () => setForms((prev) => toggle(prev, value)),
              })))),
          h('div', { className: 'sd-row' },
            h('span', { className: 'sd-rowlabel' }, t('quiz.settings', '侧重')),
            h('div', { className: 'sd-chips' },
              [['detail', '细节'], ['identity', '人物/身份'], ['reason', '原因/目的']].map(([value, label]) => h(Chip, {
                key: value, label, active: settings.includes(value), onClick: () => setSettings((prev) => toggle(prev, value)),
              })))),
          h('div', { className: 'sd-row', style: { alignItems: 'center' } },
            h('span', { className: 'sd-rowlabel' }, t('quiz.count', '数量')),
            h('select', {
              className: 'sd-select',
              value: String(count),
              onChange: (event) => setCount(Number(event.target.value)),
            }, [1, 2, 3, 4, 5, 6, 8, 10].map((value) => h('option', { key: value, value: String(value) }, `${value} 道`))),
            h('div', { style: { flex: 1 } }),
            h('button', {
              type: 'button', className: 'sd-btn primary', onClick: buildQuiz, disabled: quizBusy || routeBlocked,
            }, quizBusy ? t('quiz.generating', '正在出题…') : t('quiz.generate', '出题')))),
        h('div', { className: 'sd-quiz' },
          quizItems.length === 0
            ? h('div', { className: 'sd-empty' }, quizBusy ? t('quiz.generating', '正在出题…') : t('quiz.empty', '选好案件和题型，点“出题”。'))
            : h('div', { className: 'sd-cards' }, quizItems.map((item, index) => h(QuizCard, {
              key: item.key || index, item, index, t, busy: quizBusy || routeBlocked, onAgain: again,
            })))))

      return h('div', { className: 'sd-root' },
        h('style', null, CSS),
        h('header', { className: 'sd-header' },
          h('div', { className: 'sd-mark' }, h(Mark)),
          h('div', { className: 'sd-headtext' },
            h('div', { className: 'sd-title' }, t('panel.title', '神探狄仁杰机器人')),
            h('div', { className: 'sd-sub' }, t('panel.subtitle', '《神探狄仁杰》剧情问答与出题'))),
          h('div', { className: 'sd-meta' }, headerMeta)),
        h('nav', { className: 'sd-tabs', role: 'tablist' },
          h('button', {
            type: 'button', role: 'tab', className: 'sd-tab', 'aria-selected': tab === 'ask' ? 'true' : 'false',
            onClick: () => setTab('ask'),
          }, t('tab.ask', '问答')),
          h('button', {
            type: 'button', role: 'tab', className: 'sd-tab', 'aria-selected': tab === 'quiz' ? 'true' : 'false',
            onClick: () => setTab('quiz'),
          }, t('tab.quiz', '出题'))),
        toolbar,
        askPane,
        quizPane)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const tr = translateFactory(ctx)
        panelTranslator = tr
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'shendi-bot',
          order: 20,
          label: () => tr('panel.title', '神探狄仁杰机器人'),
        }, SidebarIcon))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'shendi-bot',
        }, ShendiPanel))
      },
    }
  },
})

