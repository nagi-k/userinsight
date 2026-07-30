/**
 * 全局错误总线：收集 API 错误与未捕获的运行时错误，供页面底部错误面板展示。
 */

export interface ErrorRecord {
  id: number;
  time: string; // ISO 时间
  action: string; // 出错的操作，如「测试连接」「智能采集」
  endpoint?: string; // 请求地址
  status?: number; // HTTP 状态码
  message: string; // 错误摘要
  body?: string; // 响应内容摘录
  hint?: string; // 排查建议
  mode?: string; // 调用通道：本地后端 / 浏览器直连 / 页面脚本
}

type Listener = (errors: ErrorRecord[]) => void;

let seq = 0;
let errors: ErrorRecord[] = [];
const listeners = new Set<Listener>();

const MAX_KEEP = 20;

function emit() {
  listeners.forEach((fn) => fn(errors));
}

export function reportError(rec: Omit<ErrorRecord, 'id' | 'time'>) {
  seq += 1;
  errors = [{ ...rec, id: seq, time: new Date().toISOString() }, ...errors].slice(0, MAX_KEEP);
  emit();
}

export function subscribeErrors(fn: Listener): () => void {
  listeners.add(fn);
  fn(errors);
  return () => listeners.delete(fn);
}

export function clearErrors() {
  errors = [];
  emit();
}

/** 根据 HTTP 状态码给出排查建议 */
export function hintForStatus(status?: number, body?: string): string {
  const b = (body || '').toLowerCase();
  if (status === 401 || b.includes('unauthorized') || b.includes('invalid api key') || b.includes('authentication')) {
    return 'API Key 无效或已过期。请检查：1) Key 是否完整复制（以 sk- 开头，无多余空格/换行）；2) 该 Key 是否已在平台控制台被删除或重置。';
  }
  if (status === 402 || b.includes('insufficient') || b.includes('balance')) {
    return '账户余额不足。请登录模型平台控制台充值或确认套餐额度后再试。';
  }
  if (status === 403) {
    return '没有访问权限。请确认该 API Key 已开通对应模型的调用权限。';
  }
  if (status === 404 || (b.includes('model') && b.includes('not') && b.includes('exist')) || b.includes('does not exist')) {
    return '接口地址或模型名称不正确。DeepSeek 的 Base URL 应填 https://api.deepseek.com（或 https://api.deepseek.com/v1），模型名为 deepseek-chat 或 deepseek-reasoner。';
  }
  if (status === 422) {
    return '请求参数不被接受。请检查模型名称是否与平台要求完全一致。';
  }
  if (status === 429) {
    return '请求过于频繁或触发限流。请稍等片刻后重试，或检查账户的速率限制/并发额度。';
  }
  if (status !== undefined && status >= 500) {
    return '模型服务端内部错误（平台侧故障）。通常稍后重试即可恢复；若持续出现请查看平台状态页公告。';
  }
  if (status === 0) {
    return '网络层失败：无法建立连接。请检查：1) Base URL 拼写是否正确（需以 https:// 开头）；2) 当前网络是否能访问该服务；3) 该服务是否允许浏览器跨域调用（DeepSeek / Kimi 均支持浏览器直连）。';
  }
  return '请核对设置页中的 Base URL、API Key、模型名称三项配置，然后点击「测试连接」逐项排查。';
}

// 捕获未处理的脚本错误与 Promise 拒绝，统一进入错误面板
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    reportError({
      action: '页面脚本错误',
      endpoint: e.filename ? `${e.filename}:${e.lineno || 0}` : undefined,
      message: e.message || '未知脚本错误',
      hint: '这是页面自身的运行时错误，与 API 配置无关。可刷新页面重试；若反复出现请截图反馈。',
      mode: '页面脚本',
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string; detail?: Omit<ErrorRecord, 'id' | 'time'> } | undefined;
    // ApiError 已在 api 层上报过，跳过避免重复
    if (reason && reason.detail) return;
    reportError({
      action: '未处理的异步错误',
      message: reason?.message || String(e.reason || '未知错误'),
      hint: '异步操作失败且未被捕获。可重试刚才的操作；若反复出现请截图反馈。',
      mode: '页面脚本',
    });
  });
}
