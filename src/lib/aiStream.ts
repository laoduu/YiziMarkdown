/**
 * AI 流式请求的共用封装。
 *
 * 后端 `ai_chat` 立即返回，正文通过 Tauri 事件推送：
 *   yizi://ai-chunk / ai-thinking / ai-done / ai-error
 *
 * 约定：监听器必须在 done/error 之后才注销 —— 不能在 invoke 返回时注销，
 * 否则流式事件会丢。这里把「先注册、后调用、按 request_id 过滤、结束清理」
 * 封装成一次调用，供文档内 AI 复用（右侧助手仍走自己的实现）。
 */
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invokeTauriOrThrow } from './tauri'

const EVT_CHUNK = 'yizi://ai-chunk'
const EVT_THINKING = 'yizi://ai-thinking'
const EVT_DONE = 'yizi://ai-done'
const EVT_ERROR = 'yizi://ai-error'

/** 与后端 180s HTTP 总超时对齐的兜底（正常路径不会走到） */
const STREAM_TIMEOUT_MS = 200000

interface ChunkPayload { request_id: string; chunk: string }
interface DonePayload { request_id: string; full_text: string; full_thinking?: string }
interface ErrorPayload { request_id: string; error: string }

export interface AIStreamRequest {
  provider: string
  apiFormat?: string | null
  model: string
  baseUrl?: string | null
  messages: Array<{ role: string; content: string }>
}

export interface AIStreamCallbacks {
  onChunk: (text: string) => void
  onThinking?: (text: string) => void
  onDone: (fullText: string) => void
  onError: (message: string) => void
}

export interface AIStreamHandle {
  requestId: string
  /** 请求用户取消（后端会回一个 error: cancelled 事件） */
  cancel: () => void
  /** 立即释放监听器（组件卸载时用） */
  dispose: () => void
}

export async function startAIStream(
  req: AIStreamRequest,
  callbacks: AIStreamCallbacks,
): Promise<AIStreamHandle> {
  const requestId = `inline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const unlisteners: UnlistenFn[] = []
  let finished = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const cleanup = () => {
    if (timer) { clearTimeout(timer); timer = null }
    unlisteners.forEach((u) => { try { u() } catch { /* 已注销 */ } })
    unlisteners.length = 0
  }
  const settle = (fn: () => void) => {
    if (finished) return
    finished = true
    cleanup()
    fn()
  }

  const register = async () => {
    unlisteners.push(await listen<ChunkPayload>(EVT_CHUNK, (e) => {
      if (e.payload.request_id !== requestId) return
      callbacks.onChunk(e.payload.chunk)
    }))
    unlisteners.push(await listen<ChunkPayload>(EVT_THINKING, (e) => {
      if (e.payload.request_id !== requestId || !callbacks.onThinking) return
      callbacks.onThinking(e.payload.chunk)
    }))
    unlisteners.push(await listen<DonePayload>(EVT_DONE, (e) => {
      if (e.payload.request_id !== requestId) return
      settle(() => callbacks.onDone(e.payload.full_text))
    }))
    unlisteners.push(await listen<ErrorPayload>(EVT_ERROR, (e) => {
      if (e.payload.request_id !== requestId) return
      settle(() => callbacks.onError(e.payload.error))
    }))
  }

  const handle: AIStreamHandle = {
    requestId,
    cancel: () => {
      invokeTauriOrThrow('ai_cancel', { requestId }).catch(() => {})
    },
    dispose: () => settle(() => {}),
  }

  try {
    await register()
  } catch (e) {
    settle(() => callbacks.onError(e instanceof Error ? e.message : String(e)))
    return handle
  }

  // 事件系统异常时的兜底：后端超时后不再有事件，避免监听器常驻
  timer = setTimeout(() => {
    settle(() => callbacks.onError('timeout'))
  }, STREAM_TIMEOUT_MS)

  try {
    await invokeTauriOrThrow('ai_chat', {
      request: {
        provider: req.provider,
        api_format: req.apiFormat,
        model: req.model,
        base_url: req.baseUrl ?? null,
        request_id: requestId,
        messages: req.messages,
      },
    })
  } catch (e) {
    settle(() => callbacks.onError(e instanceof Error ? e.message : String(e)))
  }

  return handle
}
