import { LLMSettings } from '../types';
import { loadSettings } from './storage';
import { direct, CollectedReview, ChatError } from './llm';
import { reportError, hintForStatus, ErrorRecord } from './errorBus';

export function getSettings(): LLMSettings {
  return loadSettings();
}

export function hasSettings(): boolean {
  const s = loadSettings();
  return !!(s.baseURL && s.apiKey && s.model);
}

export type { CollectedReview };

type ErrorDetail = Omit<ErrorRecord, 'id' | 'time'>;

/** 带完整排查信息的 API 错误 */
export class ApiError extends Error {
  detail: ErrorDetail;
  constructor(detail: ErrorDetail) {
    super(detail.message);
    this.name = 'ApiError';
    this.detail = detail;
  }
}

/** 本地后端不可用（网络失败或代理返回非 JSON）时标记，用于触发浏览器直连兜底 */
class BackendDown extends Error {}

async function backendPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...getSettings(), ...body }),
    });
  } catch {
    throw new BackendDown();
  }
  const text = await resp.text().catch(() => '');
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    // 代理层错误（如后端未启动时 Vite 返回 500 空响应）→ 视为后端不可用
    throw new BackendDown();
  }
  if (!resp.ok) {
    throw new ApiError({
      action: '',
      endpoint: path + '（本地后端转发）',
      status: resp.status,
      message: String(data.error || `请求失败（HTTP ${resp.status}）`),
      body: text.slice(0, 500),
      hint: hintForStatus(resp.status, text),
      mode: '本地后端',
    });
  }
  return data as T;
}

function toApiError(e: unknown, action: string): ApiError {
  if (e instanceof ApiError) {
    e.detail.action = action;
    return e;
  }
  const ce = e as ChatError;
  return new ApiError({
    action,
    endpoint: ce?.endpoint || loadSettings().baseURL + '/chat/completions（浏览器直连）',
    status: ce?.status ?? 0,
    message: ce?.message || '请求失败',
    body: ce?.body,
    hint: hintForStatus(ce?.status ?? 0, ce?.body),
    mode: '浏览器直连',
  });
}

/**
 * 统一调用入口：优先走本地后端转发；后端不可用时自动切换为浏览器直连大模型。
 * 任何失败都会写入全局错误面板。
 */
async function call<T>(
  action: string,
  backend: () => Promise<T>,
  fallback: (cfg: LLMSettings) => Promise<T>
): Promise<T> {
  const cfg = getSettings();
  if (!cfg.baseURL || !cfg.apiKey || !cfg.model) {
    const err = new ApiError({
      action,
      message: '尚未配置大模型 API',
      hint: '请先在「设置」页填写 Base URL、API Key、模型名称，然后点击「测试连接」验证。',
      mode: '配置检查',
    });
    reportError(err.detail);
    throw err;
  }
  try {
    return await backend();
  } catch (e) {
    if (!(e instanceof BackendDown)) {
      const err = toApiError(e, action);
      reportError(err.detail);
      throw err;
    }
    // 后端不可用，尝试浏览器直连
  }
  try {
    return await fallback(cfg);
  } catch (e) {
    const err = toApiError(e, action);
    reportError(err.detail);
    throw err;
  }
}

export const api = {
  testConnection: () =>
    call<{ ok: boolean }>(
      '测试连接',
      () => backendPost('/api/test-connection', {}),
      (cfg) => direct.testConnection(cfg)
    ),
  collect: (params: { keyword: string; platforms: string[]; count: number; focus: string; exclude: string[] }) =>
    call<{ reviews: CollectedReview[] }>(
      '智能采集',
      () => backendPost('/api/collect', params as unknown as Record<string, unknown>),
      (cfg) => direct.collect(cfg, params)
    ),
  searchCollect: (params: { bingApiKey: string; keyword: string; platforms: string[]; count: number; focus: string; exclude: string[] }) =>
    call<{ reviews: CollectedReview[] }>(
      '真实采集（Bing Search）',
      () => backendPost('/api/search-collect', params as unknown as Record<string, unknown>),
      () => {
        const err = new ApiError({
          action: '真实采集（Bing Search）',
          message: '浏览器直连不支持 Bing Search 真实采集',
          hint: '真实采集需要调用 Bing Search API，请在本地启动后端服务（npm run dev）后使用，或部署到支持后端运行的服务器。',
          mode: '浏览器直连',
        });
        reportError(err.detail);
        throw err;
      }
    ),
  insightDraft: (quotes: string[], category: string) =>
    call<{ behaviorInsight: string; designRequirement: string; hmwQuestion: string }>(
      'AI 洞察草稿',
      () => backendPost('/api/insight-draft', { quotes, category }),
      (cfg) => direct.insightDraft(cfg, quotes, category)
    ),
  personaDraft: (product: string, summary: string) =>
    call<{
      name: string;
      demographics: string;
      painPoints: string[];
      needs: string[];
      behaviors: string[];
      quote: string;
    }>(
      'AI 画像草稿',
      () => backendPost('/api/persona-draft', { product, summary }),
      (cfg) => direct.personaDraft(cfg, product, summary)
    ),
  iterationPlanDraft: (
    product: string,
    summary: string,
    insights: { quote: string; behaviorInsight: string; designRequirement: string; hmwQuestion: string; priority: string }[]
  ) =>
    call<{
      summary: string;
      coreProblems: string[];
      items: {
        title: string;
        description: string;
        priority: 'high' | 'medium' | 'low';
        effort: 'small' | 'medium' | 'large';
        impact: string;
        relatedInsight?: string;
        phase: 'short' | 'medium' | 'long';
      }[];
      metrics: string[];
    }>(
      'AI 迭代方案',
      () => backendPost('/api/iteration-plan-draft', { product, summary, insights }),
      (cfg) => direct.iterationPlanDraft(cfg, product, summary, insights)
    ),
};
