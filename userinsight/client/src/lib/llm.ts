/**
 * 浏览器直连大模型（OpenAI 兼容接口）。
 * 用于无本地后端的场景（如 GitHub Pages 静态托管）：逻辑与 server/index.js 保持一致。
 * 真实性红线：不生成、不缓存任何评价数据；模型无搜索结果时返回空数组，绝不虚构。
 */
import { LLMSettings } from '../types';
import { PLATFORMS, PAIN_TYPES } from './utils';

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

const VALID_PLATFORMS = Object.keys(PLATFORMS);

/** 昵称脱敏：保留首尾字符，中间以 *** 替代 */
function maskName(name: unknown): string {
  const s = String(name || '匿名用户').trim();
  if (s.length <= 1) return s + '***';
  return s[0] + '***' + s[s.length - 1];
}

function bigrams(s: string): Set<string> {
  const clean = String(s).replace(/\s+/g, '');
  const set = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
  return set;
}

/** 基于二字组的 Jaccard 相似度 */
function similarity(a: string, b: string): number {
  const sa = bigrams(a);
  const sb = bigrams(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const g of sa) if (sb.has(g)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** 从模型输出中提取 JSON，容忍前后多余文字与尾逗号 */
function extractJson(text: string, open: string, close: string): unknown {
  if (!text) return null;
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

export interface ChatError extends Error {
  status?: number;
  body?: string;
  endpoint?: string;
}

/** 调用 OpenAI 兼容的 chat/completions 接口 */
async function chat(cfg: LLMSettings, messages: { role: string; content: string }[], temperature = 0.7): Promise<string> {
  const url = cfg.baseURL.replace(/\/+$/, '') + '/chat/completions';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, messages, temperature }),
    });
  } catch (e) {
    clearTimeout(timer);
    const err: ChatError = new Error(
      e instanceof Error && e.name === 'AbortError'
        ? '请求超时（90 秒无响应）'
        : '网络请求失败：无法连接模型接口，或该服务不允许浏览器跨域调用（CORS）'
    );
    err.endpoint = url;
    throw err;
  }
  clearTimeout(timer);
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    const err: ChatError = new Error(`模型接口返回 ${resp.status}`);
    err.status = resp.status;
    err.body = t.slice(0, 500);
    err.endpoint = url;
    throw err;
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const err: ChatError = new Error('模型未返回任何内容');
    err.endpoint = url;
    err.body = JSON.stringify(data).slice(0, 500);
    throw err;
  }
  return content as string;
}

/** 清洗并校验单条评价，结构不合格返回 null */
function cleanReview(raw: Record<string, unknown>): CollectedReview | null {
  if (!raw || typeof raw.content !== 'string') return null;
  const content = raw.content.trim();
  if (content.length < 8) return null;
  const ratingNum = Math.round(Number(raw.rating));
  const rating = ratingNum >= 1 && ratingNum <= 5 ? ratingNum : 3;
  const review: CollectedReview = {
    content: content.slice(0, 500),
    platform: VALID_PLATFORMS.includes(String(raw.platform)) ? String(raw.platform) : 'other',
    rating,
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.map(String).map((k) => k.slice(0, 20)).filter(Boolean).slice(0, 6)
      : [],
    painPointType: (PAIN_TYPES as readonly string[]).includes(String(raw.painPointType))
      ? String(raw.painPointType)
      : undefined,
    scenario: raw.scenario ? String(raw.scenario).slice(0, 50) : undefined,
    hasImage: !!raw.hasImage,
    sourceUrl:
      typeof raw.sourceUrl === 'string' && /^https?:\/\/\S+$/.test(raw.sourceUrl)
        ? raw.sourceUrl
        : undefined,
    authorName: maskName(raw.authorName),
    reviewDate: /^\d{4}-\d{2}(-\d{2})?$/.test(String(raw.reviewDate || ''))
      ? String(raw.reviewDate)
      : undefined,
    likeCount:
      Number.isFinite(+Number(raw.likeCount)) && Number(raw.likeCount) > 0
        ? Math.round(Number(raw.likeCount))
        : undefined,
    sentiment: rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral',
    verified: false,
  };
  review.verified = !!review.sourceUrl;
  return review;
}

export const direct = {
  async testConnection(cfg: LLMSettings): Promise<{ ok: boolean }> {
    await chat(cfg, [{ role: 'user', content: '请仅回复"ok"两个字母' }], 0);
    return { ok: true };
  },

  async collect(
    cfg: LLMSettings,
    params: { keyword: string; platforms: string[]; count: number; focus: string; exclude: string[] }
  ): Promise<{ reviews: CollectedReview[] }> {
    const { keyword, platforms = [], count = 20, focus = '', exclude = [] } = params;
    const batch = Math.min(Math.max(1, count || 20), 20);
    const platformNames = platforms.length
      ? platforms.map((p) => PLATFORMS[p as keyof typeof PLATFORMS] || p).join('、')
      : '各公开平台';

    const systemPrompt =
      '你是一个严谨的用户研究助手，具备联网检索能力，能够检索中文社交网络与电商平台的公开用户评价。' +
      '你只返回真实检索到的公开内容，严禁编造评价、昵称或链接。没有检索结果时必须返回空数组 []。' +
      '你的输出必须是可以被 JSON.parse 直接解析的 JSON，不要输出 Markdown 代码块或其他任何解释性文字。';

    const excludeLines = exclude.length
      ? '\n以下内容已采集过，禁止重复返回：\n' +
        exclude.slice(0, 40).map((c, i) => `${i + 1}. ${String(c).slice(0, 50)}`).join('\n')
      : '';

    const userPrompt =
      `请联网检索关于「${keyword.trim()}」的真实用户评价与讨论，优先来源平台：${platformNames}。` +
      (focus ? `重点关注：${focus.slice(0, 200)}。` : '') +
      `返回最多 ${batch} 条互不重复的评价。` +
      excludeLines +
      '\n每条评价严格使用以下 JSON 结构，组成一个 JSON 数组返回：\n' +
      '[{"content":"评价原文（口语化，20-200字）","platform":"xiaohongshu/weibo/taobao/jd/zhihu/douyin/smzdm/bilibili/other 之一",' +
      '"rating":1到5的整数,"keywords":["关键词1","关键词2"],"painPointType":"握持/清洁/重量/操作/外观/噪音/价格/其他 之一（无则省略该字段）",' +
      '"scenario":"使用场景","hasImage":true或false,"sourceUrl":"原文完整链接","authorName":"用户昵称","reviewDate":"YYYY-MM-DD","likeCount":点赞数}]\n' +
      '要求：1) 每条必须附真实可访问的来源链接 sourceUrl；2) 检索不到足够结果时，有几条返回几条，没有则返回 []；3) 只输出 JSON 数组本身。';

    const text = await chat(cfg, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    const arr = extractJson(text, '[', ']');
    if (!Array.isArray(arr)) {
      const err: ChatError = new Error('模型返回格式异常，无法解析为 JSON 数组，请重试');
      err.body = text.slice(0, 500);
      throw err;
    }
    const seen = new Set(exclude.map((c) => String(c).slice(0, 40)));
    const cleaned: CollectedReview[] = [];
    for (const item of arr) {
      const c = cleanReview(item as Record<string, unknown>);
      if (!c) continue;
      const key = c.content.slice(0, 40);
      if (seen.has(key)) continue;
      if (cleaned.some((x) => similarity(x.content, c.content) > 0.7)) continue;
      seen.add(key);
      cleaned.push(c);
    }
    return { reviews: cleaned.slice(0, batch) };
  },

  async insightDraft(
    cfg: LLMSettings,
    quotes: string[],
    category: string
  ): Promise<{ behaviorInsight: string; designRequirement: string; hmwQuestion: string }> {
    const prompt =
      '你是一名资深工业设计用户研究员。基于以下用户原始评价引语，生成一份结构化设计洞察草稿，' +
      '严格返回可被 JSON.parse 解析的 JSON 对象，不要输出任何其他文字：\n' +
      '{"behaviorInsight":"行为洞察（用户在场景中表现出的真实行为与动机，80字内）",' +
      '"designRequirement":"设计需求（可落地的工业设计改进方向，80字内）",' +
      '"hmwQuestion":"HMW 问题，以「我们如何能够」开头（50字内）"}\n' +
      (category ? `洞察分类方向：${category}。\n` : '') +
      '原始引语：\n' +
      quotes.slice(0, 10).map((q, i) => `${i + 1}. ${String(q).slice(0, 300)}`).join('\n');
    const text = await chat(cfg, [{ role: 'user', content: prompt }], 0.5);
    const obj = extractJson(text, '{', '}') as Record<string, unknown> | null;
    if (!obj || typeof obj !== 'object') {
      const err: ChatError = new Error('模型返回格式异常，无法解析洞察草稿');
      err.body = text.slice(0, 500);
      throw err;
    }
    return {
      behaviorInsight: String(obj.behaviorInsight || ''),
      designRequirement: String(obj.designRequirement || ''),
      hmwQuestion: String(obj.hmwQuestion || ''),
    };
  },

  async personaDraft(
    cfg: LLMSettings,
    product: string,
    summary: string
  ): Promise<{
    name: string;
    demographics: string;
    painPoints: string[];
    needs: string[];
    behaviors: string[];
    quote: string;
  }> {
    const prompt =
      '你是一名资深用户研究员。基于以下关于「' +
      String(product).slice(0, 50) +
      '」的用户评价数据摘要，' +
      '生成一个典型用户画像草稿，严格返回可被 JSON.parse 解析的 JSON 对象，不要输出任何其他文字：\n' +
      '{"name":"画像代号（如「效率至上的早八族」）","demographics":"人口统计特征（年龄段/职业/居住状态等，60字内）",' +
      '"painPoints":["核心痛点1","核心痛点2","核心痛点3"],"needs":["核心需求1","核心需求2","核心需求3"],' +
      '"behaviors":["行为特征1","行为特征2","行为特征3"],"quote":"一句能代表该用户的口语化引语"}\n' +
      '评价数据摘要：\n' +
      String(summary).slice(0, 3000);
    const text = await chat(cfg, [{ role: 'user', content: prompt }], 0.6);
    const obj = extractJson(text, '{', '}') as Record<string, unknown> | null;
    if (!obj || typeof obj !== 'object') {
      const err: ChatError = new Error('模型返回格式异常，无法解析画像草稿');
      err.body = text.slice(0, 500);
      throw err;
    }
    const asArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 6) : [];
    return {
      name: String(obj.name || ''),
      demographics: String(obj.demographics || ''),
      painPoints: asArray(obj.painPoints),
      needs: asArray(obj.needs),
      behaviors: asArray(obj.behaviors),
      quote: String(obj.quote || ''),
    };
  },
};
