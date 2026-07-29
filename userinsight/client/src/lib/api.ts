import { LLMSettings } from '../types';
import { loadSettings } from './storage';

export function getSettings(): LLMSettings {
  return loadSettings();
}

export function hasSettings(): boolean {
  const s = loadSettings();
  return !!(s.baseURL && s.apiKey && s.model);
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const resp = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...getSettings(), ...body }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error((data as { error?: string }).error || `请求失败（HTTP ${resp.status}）`);
  }
  return data as T;
}

export interface CollectedReview {
  content: string;
  platform: string;
  rating: number;
  keywords: string[];
  painPointType?: string;
  scenario?: string;
  hasImage: boolean;
  sentiment: 'positive' | 'negative' | 'neutral';
  sourceUrl?: string;
  authorName?: string;
  reviewDate?: string;
  likeCount?: number;
  verified: boolean;
}

export const api = {
  testConnection: () => post<{ ok: boolean }>('/api/test-connection', {}),
  collect: (params: {
    keyword: string;
    platforms: string[];
    count: number;
    focus: string;
    exclude: string[];
  }) => post<{ reviews: CollectedReview[] }>('/api/collect', params as unknown as Record<string, unknown>),
  insightDraft: (quotes: string[], category: string) =>
    post<{ behaviorInsight: string; designRequirement: string; hmwQuestion: string }>(
      '/api/insight-draft',
      { quotes, category }
    ),
  personaDraft: (product: string, summary: string) =>
    post<{
      name: string;
      demographics: string;
      painPoints: string[];
      needs: string[];
      behaviors: string[];
      quote: string;
    }>('/api/persona-draft', { product, summary }),
};
