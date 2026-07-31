/**
 * 浏览器直连大模型（OpenAI 兼容接口）。
 * 用于无本地后端的场景（如 GitHub Pages 静态托管）。
 * 默认策略：模型基于自身知识生成有代表性的模拟用户评价（用于设计研究早期探索）。
 * 真实网页抓取需额外配置 Bing Search v7 API Key，由后端 /api/search-collect 处理。
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
async function chat(cfg: LLMSettings, messages: { role: string; content: string }[], temperature?: number): Promise<string> {
  const url = cfg.baseURL.replace(/\/+$/, '') + '/chat/completions';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600000);
  const body: Record<string, unknown> = { model: cfg.model, messages };
  if (temperature !== undefined) body.temperature = temperature;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    clearTimeout(timer);
    const err: ChatError = new Error(
      e instanceof Error && e.name === 'AbortError'
        ? '请求超时（600 秒无响应）'
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
    // 不传 temperature：部分模型（如 kimi-k3）仅支持 temperature=1，使用模型默认值更稳妥
    await chat(cfg, [{ role: 'user', content: '请仅回复"ok"两个字母' }]);
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
      '你是一名资深用户研究助手，擅长基于产品知识与用户研究经验，生成具有代表性的模拟用户评价。' +
      '当前环境没有联网检索能力，因此你需要根据对产品的理解，生成符合目标平台风格的典型用户反馈。' +
      '这些评价用于设计研究早期探索，应覆盖正面、负面、中性不同情感，并体现真实用户可能关注的痛点与场景。' +
      '你的输出必须是可以被 JSON.parse 直接解析的 JSON，不要输出 Markdown 代码块或其他任何解释性文字。';

    const excludeLines = exclude.length
      ? '\n以下内容已生成过，避免高度重复：\n' +
        exclude.slice(0, 40).map((c, i) => `${i + 1}. ${String(c).slice(0, 50)}`).join('\n')
      : '';

    const userPrompt =
      `请基于你对「${keyword.trim()}」的理解，生成 ${batch} 条有代表性的模拟用户评价，模拟来源平台：${platformNames}。` +
      (focus ? `重点关注：${focus.slice(0, 200)}。` : '') +
      excludeLines +
      '\n每条评价严格使用以下 JSON 结构，组成一个 JSON 数组返回：\n' +
      '[{"content":"评价原文（口语化，20-200字）","platform":"xiaohongshu/weibo/taobao/jd/zhihu/douyin/smzdm/bilibili/other 之一",' +
      '"rating":1到5的整数,"keywords":["关键词1","关键词2"],"painPointType":"握持/清洁/重量/操作/外观/噪音/价格/其他 之一（无则省略该字段）",' +
      '"scenario":"使用场景","hasImage":true或false,"sourceUrl":"可省略或填示例链接","authorName":"用户昵称","reviewDate":"YYYY-MM-DD","likeCount":点赞数}]\n' +
      '要求：1) 评价应多样化，覆盖不同平台语气和用户场景；2) 没有真实来源链接时 sourceUrl 可省略；3) 只输出 JSON 数组本身。';

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
    const text = await chat(cfg, [{ role: 'user', content: prompt }]);
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
    const text = await chat(cfg, [{ role: 'user', content: prompt }]);
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

  async iterationPlanDraft(
    cfg: LLMSettings,
    product: string,
    summary: string,
    insights: { quote: string; behaviorInsight: string; designRequirement: string; hmwQuestion: string; priority: string }[]
  ): Promise<{
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
  }> {
    const validPriority = (v: unknown): 'high' | 'medium' | 'low' =>
      (v === 'high' || v === 'medium' || v === 'low' ? v : 'medium') as 'high' | 'medium' | 'low';
    const validEffort = (v: unknown): 'small' | 'medium' | 'large' =>
      (v === 'small' || v === 'medium' || v === 'large' ? v : 'medium') as 'small' | 'medium' | 'large';
    const validPhase = (v: unknown): 'short' | 'medium' | 'long' =>
      (v === 'short' || v === 'medium' || v === 'long' ? v : 'short') as 'short' | 'medium' | 'long';

    const insightsText = insights
      .slice(0, 12)
      .map(
        (ins, i) =>
          `${i + 1}. [${ins.priority}优先级] ${ins.behaviorInsight}\n   设计需求：${ins.designRequirement}\n   HMW：${ins.hmwQuestion}`
      )
      .join('\n');

    const prompt =
      '你是一名资深产品策略顾问，基于用户研究成果为企业制定可落地的产品迭代方案。' +
      '请基于以下产品信息、用户洞察摘要和核心洞察，输出一份结构化迭代方案。' +
      '严格返回可被 JSON.parse 解析的 JSON 对象，不要输出任何其他文字：\n' +
      '{"summary":"方案总体概述（120字内）","coreProblems":["核心问题1","核心问题2","核心问题3"],' +
      '"items":[' +
      '{"title":"迭代项标题","description":"具体改进描述（80字内）","priority":"high/medium/low",' +
      '"effort":"small/medium/large","impact":"预期业务/用户价值（60字内）","relatedInsight":"关联的HMW或设计需求","phase":"short/medium/long"}' +
      '],"metrics":["衡量指标1","衡量指标2","衡量指标3"]}\n' +
      '要求：1) 迭代项不少于4条、不超过8条；2) 按优先级和阶段合理排序；3) 改进描述必须具体可执行；4) 每条迭代项必须关联一个洞察依据。\n\n' +
      `产品：${String(product).slice(0, 50)}\n` +
      `研究摘要：\n${String(summary).slice(0, 1500)}\n\n` +
      `核心洞察：\n${insightsText}`;

    const text = await chat(cfg, [{ role: 'user', content: prompt }]);
    const obj = extractJson(text, '{', '}') as Record<string, unknown> | null;
    if (!obj || typeof obj !== 'object') {
      const err: ChatError = new Error('模型返回格式异常，无法解析迭代方案');
      err.body = text.slice(0, 500);
      throw err;
    }
    const asArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 8) : [];
    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    return {
      summary: String(obj.summary || ''),
      coreProblems: asArray(obj.coreProblems),
      items: rawItems
        .map((it: unknown) => {
          const item = it as Record<string, unknown>;
          return {
            title: String(item.title || ''),
            description: String(item.description || ''),
            priority: validPriority(item.priority),
            effort: validEffort(item.effort),
            impact: String(item.impact || ''),
            relatedInsight: item.relatedInsight ? String(item.relatedInsight) : undefined,
            phase: validPhase(item.phase),
          };
        })
        .filter((it) => it.title || it.description),
      metrics: asArray(obj.metrics),
    };
  },
};
