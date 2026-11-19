// Robot-only OpenAI-compatible API, configured by the operator on the DSH Host.
export const CUSTOM_PROVIDER = 'shendi-custom'
export const CUSTOM_NAME = '机器人专用 API'

export function readCustomApi(env = process.env) {
  const base = env.SHENDI_LLM_BASE?.trim()
  const model = env.SHENDI_LLM_MODEL?.trim()
  const key = env.SHENDI_LLM_KEY?.trim()
  if (!base && !model && !key) return null
  if (!base || !model) return { error: '机器人专用 API 未配齐：请同时设置 SHENDI_LLM_BASE 和 SHENDI_LLM_MODEL，然后重启 DSH。' }
  let endpoint
  try {
    endpoint = new URL(base)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) throw new Error()
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error()
    endpoint.pathname = endpoint.pathname.replace(/\/+$/, '')
    if (!endpoint.pathname.endsWith('/chat/completions')) endpoint.pathname += '/chat/completions'
  } catch {
    return { error: 'SHENDI_LLM_BASE 必须是 HTTPS 地址（本机可用 HTTP），不能携带用户名、密码、查询参数或片段。' }
  }
  // A pipe is reserved for the panel's provider/model selector key.
  if (model.length > 200 || /[\s|\u0000-\u001f\u007f]/.test(model)) return { error: 'SHENDI_LLM_MODEL 不是有效的模型 ID。' }
  if (key && !/^[\x21-\x7e]+$/.test(key)) return { error: 'SHENDI_LLM_KEY 的格式不正确。' }
  return { endpoint: endpoint.href, model, key }
}

async function readResponse(response) {
  const reader = response.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 1024 * 1024) {
        await reader.cancel().catch(() => {})
        throw new Error('oversize')
      }
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } finally {
    reader.releaseLock()
  }
}

function errorHint(status) {
  if (status === 401 || status === 403) return '检查 API Key 和模型权限。'
  if (status === 404) return '检查 API 地址和模型 ID。'
  if (status === 429) return '检查额度或稍后再试。'
  if (status === 400 || status === 422) return '检查模型是否支持 Chat Completions 及 max_tokens 参数。'
  return '请检查服务商状态和接口配置。'
}

export async function chatCustom(api, selection, request) {
  const messages = request.messages.map(({ role, content }) => ({
    role,
    content: typeof content === 'string' ? content : content.filter((block) => block.type === 'text').map((block) => block.text).join('\n'),
  }))
  if (request.system) messages.unshift({ role: 'system', content: request.system })
  // 不跟随重定向，避免凭据和提示词被发往配置之外的地址。
  const signal = request.signal ?? AbortSignal.timeout(120000)
  let response
  try {
    response = await fetch(api.endpoint, {
      method: 'POST', redirect: 'error', signal,
      headers: { 'content-type': 'application/json', ...(api.key ? { authorization: `Bearer ${api.key}` } : {}) },
      body: JSON.stringify({
        model: api.model, messages, stream: false, max_tokens: request.maxTokens ?? 1200,
      }),
    })
  } catch {
    throw new Error(signal.aborted ? '机器人专用 API 请求超时。' : '无法连接机器人专用 API（或接口返回了重定向）。请检查地址及网络。')
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw new Error(`机器人专用 API 返回 HTTP ${response.status}。${errorHint(response.status)}`)
  }
  let result
  try {
    result = await readResponse(response)
  } catch {
    throw new Error(signal.aborted ? '机器人专用 API 请求超时。' : '机器人专用 API 返回了无效或过大的 JSON。')
  }
  const choice = result?.choices?.[0]
  if (!choice || !choice.message || typeof choice.message !== 'object') {
    throw new Error('机器人专用 API 返回格式不兼容：缺少 choices[0].message。')
  }
  const content = choice.message.content
  let text = typeof content === 'string' ? content.trim() : ''
  // 防止接口、代理或调试模型原样回显 Bearer Key。
  if (api.key) text = text.replaceAll(api.key, '[已隐藏]')
  return { text, finish: choice.finish_reason === 'length' ? { kind: 'max-tokens' } : null, model: selection }
}
