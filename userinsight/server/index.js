/**
 * UserInsight 后端服务
 * 职责：
 *  - 转发大模型 API 请求（规避浏览器跨域限制），兼容 OpenAI 格式接口（Kimi / DeepSeek / 通义等）
 *  - /api/collect        智能采集：调用大模型基于自身知识生成有代表性的模拟用户评价，用于设计研究早期探索
 *  - /api/search-collect 真实采集：需配置 Bing Search v7 API Key，先搜索公开网页再提取真实用户评价
 *  - /api/insight-draft  洞察草稿：基于引语生成 行为洞察/设计需求/HMW 草稿
 *  - /api/persona-draft  画像草稿：基于评价摘要生成 Persona 草稿
 *  - /api/test-connection 测试大模型配置可用性
 *
 * 注意：/api/collect 默认生成模拟评价；需要真实网页数据请使用 /api/search-collect 并配置 Bing API Key。
 */
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '4mb' }));

const VALID_PLATFORMS = ['xiaohongshu', 'weibo', 'taobao', 'jd', 'zhihu', 'douyin', 'smzdm', 'bilibili', 'other'];
const VALID_PAIN_TYPES = ['握持', '清洁', '重量', '操作', '外观', '噪音', '价格', '其他'];
const PLATFORM_NAMES = {
  xiaohongshu: '小红书', weibo: '微博', taobao: '淘宝', jd: '京东', zhihu: '知乎',
  douyin: '抖音', smzdm: '什么值得买', bilibili: 'B站', other: '其他',
};

/** 昵称脱敏：保留首尾字符，中间以 *** 替代，如 “咖啡控小A” -> “咖***A” */
function maskName(name) {
  const s = String(name || '匿名用户').trim();
  if (s.length <= 1) return s + '***';
  return s[0] + '***' + s[s.length - 1];
}

function bigrams(s) {
  const clean = String(s).replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
  return set;
}

/** 基于二字组的 Jaccard 相似度 */
function similarity(a, b) {
  const sa = bigrams(a);
  const sb = bigrams(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const g of sa) if (sb.has(g)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** 从模型输出中提取 JSON（数组或对象），容忍前后多余文字 */
function extractJson(text, open, close) {
  if (!text) return null;
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      // 容忍尾逗号等常见格式瑕疵
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

/** 调用 OpenAI 兼容的 chat/completions 接口 */
async function chat(cfg, messages, temperature) {
  const url = cfg.baseURL.replace(/\/+$/, '') + '/chat/completions';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600000);
  const body = { model: cfg.model, messages };
  if (temperature !== undefined) body.temperature = temperature;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`模型接口返回 ${resp.status}：${t.slice(0, 200)}`);
    }
    const data = await resp.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('模型未返回任何内容');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** 校验请求体中的大模型配置 */
function requireConfig(req, res) {
  const { baseURL, apiKey, model } = req.body || {};
  if (!baseURL || !apiKey || !model) {
    res.status(400).json({ error: '请先在设置页配置大模型 API Key' });
    return null;
  }
  return { baseURL: String(baseURL), apiKey: String(apiKey), model: String(model) };
}

/** 清洗并校验单条评价，结构不合格返回 null */
function cleanReview(raw) {
  if (!raw || typeof raw.content !== 'string') return null;
  const content = raw.content.trim();
  if (content.length < 8) return null;
  const ratingNum = Math.round(Number(raw.rating));
  const rating = ratingNum >= 1 && ratingNum <= 5 ? ratingNum : 3;
  const review = {
    content: content.slice(0, 500),
    platform: VALID_PLATFORMS.includes(raw.platform) ? raw.platform : 'other',
    rating,
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String).map((k) => k.slice(0, 20)).filter(Boolean).slice(0, 6) : [],
    painPointType: VALID_PAIN_TYPES.includes(raw.painPointType) ? raw.painPointType : undefined,
    scenario: raw.scenario ? String(raw.scenario).slice(0, 50) : undefined,
    hasImage: !!raw.hasImage,
    sourceUrl: typeof raw.sourceUrl === 'string' && /^https?:\/\/\S+$/.test(raw.sourceUrl) ? raw.sourceUrl : undefined,
    authorName: maskName(raw.authorName),
    reviewDate: /^\d{4}-\d{2}(-\d{2})?$/.test(raw.reviewDate || '') ? raw.reviewDate : undefined,
    likeCount: Number.isFinite(+raw.likeCount) && +raw.likeCount > 0 ? Math.round(+raw.likeCount) : undefined,
  };
  review.sentiment = rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral';
  // 可溯源性：无原文链接的一律标记为待核实
  review.verified = !!review.sourceUrl;
  return review;
}

/** 调用 Bing Search v7 API 搜索公开网页 */
async function bingSearch(apiKey, query, count = 10) {
  const url = new URL('https://api.bing.microsoft.com/v7.0/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(Math.max(1, count), 50)));
  url.searchParams.set('mkt', 'zh-CN');
  url.searchParams.set('setLang', 'zh');
  url.searchParams.set('safeSearch', 'Off');
  const resp = await fetch(url.toString(), {
    headers: { 'Ocp-Apim-Subscription-Key': apiKey },
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`Bing Search 返回 ${resp.status}：${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  return (data && data.webPages && data.webPages.value) || [];
}

/** 将多个网页摘要拼接成一段上下文文本 */
function buildSearchContext(pages) {
  return pages
    .map((p, i) => `[网页${i + 1}]\n标题：${p.name || ''}\n链接：${p.url || ''}\n摘要：${p.snippet || ''}`)
    .join('\n\n');
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/test-connection', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  try {
    await chat(cfg, [{ role: 'user', content: '请仅回复"ok"两个字母' }], 0);
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: '连接失败：' + (e.name === 'AbortError' ? '请求超时' : e.message) });
  }
});

app.post('/api/collect', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  const { keyword, platforms = [], count = 20, focus = '', exclude = [] } = req.body || {};
  if (!keyword || !String(keyword).trim()) {
    return res.status(400).json({ error: '缺少产品关键词' });
  }
  const batch = Math.min(Math.max(1, parseInt(count, 10) || 20), 20);
  const platformNames = (Array.isArray(platforms) && platforms.length
    ? platforms.map((p) => PLATFORM_NAMES[p] || p).join('、')
    : '各公开平台');

  const systemPrompt =
    '你是一名资深用户研究助手，擅长基于产品知识与用户研究经验，生成具有代表性的模拟用户评价。' +
    '当前环境没有联网检索能力，因此你需要根据对产品的理解，生成符合目标平台风格的典型用户反馈。' +
    '这些评价用于设计研究早期探索，应覆盖正面、负面、中性不同情感，并体现真实用户可能关注的痛点与场景。' +
    '你的输出必须是可以被 JSON.parse 直接解析的 JSON，不要输出 Markdown 代码块或其他任何解释性文字。';

  const excludeLines = Array.isArray(exclude) && exclude.length
    ? '\n以下内容已生成过，避免高度重复：\n' + exclude.slice(0, 40).map((c, i) => `${i + 1}. ${String(c).slice(0, 50)}`).join('\n')
    : '';

  const userPrompt =
    `请基于你对「${String(keyword).trim()}」的理解，生成 ${batch} 条有代表性的模拟用户评价，模拟来源平台：${platformNames}。` +
    (focus ? `重点关注：${String(focus).slice(0, 200)}。` : '') +
    excludeLines +
    '\n每条评价严格使用以下 JSON 结构，组成一个 JSON 数组返回：\n' +
    '[{"content":"评价原文（口语化，20-200字）","platform":"xiaohongshu/weibo/taobao/jd/zhihu/douyin/smzdm/bilibili/other 之一",' +
    '"rating":1到5的整数,"keywords":["关键词1","关键词2"],"painPointType":"握持/清洁/重量/操作/外观/噪音/价格/其他 之一（无则省略该字段）",' +
    '"scenario":"使用场景","hasImage":true或false,"sourceUrl":"可省略或填示例链接","authorName":"用户昵称","reviewDate":"YYYY-MM-DD","likeCount":点赞数}]\n' +
    '要求：1) 评价应多样化，覆盖不同平台语气和用户场景；2) 没有真实来源链接时 sourceUrl 可省略；3) 只输出 JSON 数组本身。';

  try {
    const text = await chat(cfg, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    const arr = extractJson(text, '[', ']');
    if (!Array.isArray(arr)) {
      return res.status(502).json({ error: '模型返回格式异常，无法解析为 JSON 数组，请重试' });
    }
    const seen = new Set((Array.isArray(exclude) ? exclude : []).map((c) => String(c).slice(0, 40)));
    const cleaned = [];
    for (const item of arr) {
      const c = cleanReview(item);
      if (!c) continue; // 丢弃结构不合格的记录
      const key = c.content.slice(0, 40);
      if (seen.has(key)) continue;
      if (cleaned.some((x) => similarity(x.content, c.content) > 0.7)) continue; // 批内去重
      seen.add(key);
      cleaned.push(c);
    }
    res.json({ reviews: cleaned.slice(0, batch) });
  } catch (e) {
    res.status(502).json({ error: e.name === 'AbortError' ? '采集请求超时，请重试' : '采集失败：' + e.message });
  }
});

/**
 * 真实采集：先调用 Bing Search 搜索公开网页，再用大模型从网页摘要中提取结构化评价。
 * 需要用户自备 Bing Search v7 API Key。
 */
app.post('/api/search-collect', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  const { bingApiKey, keyword, platforms = [], count = 20, focus = '', exclude = [] } = req.body || {};
  if (!bingApiKey) {
    return res.status(400).json({ error: '缺少 Bing Search API Key，请先在设置页配置' });
  }
  if (!keyword || !String(keyword).trim()) {
    return res.status(400).json({ error: '缺少产品关键词' });
  }
  const batch = Math.min(Math.max(1, parseInt(count, 10) || 20), 20);
  const selectedPlatforms = Array.isArray(platforms) && platforms.length ? platforms : VALID_PLATFORMS;
  const platformNames = selectedPlatforms.map((p) => PLATFORM_NAMES[p] || p).join('、');

  // 为每个平台分别搜索，提升结果覆盖率
  const searchQueries = selectedPlatforms.map((p) => {
    const name = PLATFORM_NAMES[p] || '';
    return `${String(keyword).trim()} ${name} 用户评价 评测`;
  });
  // 额外加一条通用搜索
  searchQueries.push(`${String(keyword).trim()} 用户评价 评测`);

  let pages = [];
  try {
    const results = await Promise.all(
      searchQueries.map((q) => bingSearch(String(bingApiKey), q, Math.min(5, Math.ceil(15 / searchQueries.length))))
    );
    const seen = new Set();
    for (const list of results) {
      for (const p of list) {
        if (!p.url || seen.has(p.url)) continue;
        seen.add(p.url);
        pages.push(p);
      }
    }
  } catch (e) {
    return res.status(502).json({ error: '搜索失败：' + e.message });
  }

  if (!pages.length) {
    return res.json({ reviews: [] });
  }

  const context = buildSearchContext(pages.slice(0, 15));

  const systemPrompt =
    '你是一名严谨的用户研究助手。下面提供了通过搜索引擎获取的若干公开网页摘要。' +
    '请仅根据这些摘要内容，提取或归纳真实用户评价。' +
    '严禁编造网页中没有的内容、昵称或链接。如果摘要中没有任何可用评价，请返回空数组 []。' +
    '输出必须是可以被 JSON.parse 直接解析的 JSON 数组，不要输出 Markdown 代码块或其他解释性文字。';

  const excludeLines = Array.isArray(exclude) && exclude.length
    ? '\n以下内容已采集过，禁止重复返回：\n' + exclude.slice(0, 40).map((c, i) => `${i + 1}. ${String(c).slice(0, 50)}`).join('\n')
    : '';

  const userPrompt =
    `产品关键词：「${String(keyword).trim()}」\n` +
    `优先平台：${platformNames}。\n` +
    (focus ? `重点关注：${String(focus).slice(0, 200)}。\n` : '') +
    `请从以下网页摘要中，提取最多 ${batch} 条互不重复的真实用户评价。` +
    excludeLines +
    '\n\n网页摘要：\n' +
    context +
    '\n\n每条评价使用以下 JSON 结构，组成 JSON 数组返回：\n' +
    '[{"content":"评价原文（口语化，20-200字，必须来自网页摘要）","platform":"xiaohongshu/weibo/taobao/jd/zhihu/douyin/smzdm/bilibili/other 之一（根据摘要推断，无法推断则填 other）",' +
    '"rating":1到5的整数,"keywords":["关键词1","关键词2"],"painPointType":"握持/清洁/重量/操作/外观/噪音/价格/其他 之一（无则省略该字段）",' +
    '"scenario":"使用场景","hasImage":true或false,"sourceUrl":"原文完整链接（来自网页摘要）","authorName":"用户昵称（摘要中有则填，无则省略）","reviewDate":"YYYY-MM-DD（有则填）","likeCount":点赞数}\n' +
    '要求：1) 每条评价必须能在网页摘要中找到依据；2) 不要返回网页中没有的内容；3) 没有可用评价时返回 []；4) 只输出 JSON 数组本身。';

  try {
    const text = await chat(cfg, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    const arr = extractJson(text, '[', ']');
    if (!Array.isArray(arr)) {
      return res.status(502).json({ error: '模型返回格式异常，无法解析为 JSON 数组，请重试' });
    }
    const seen = new Set((Array.isArray(exclude) ? exclude : []).map((c) => String(c).slice(0, 40)));
    const cleaned = [];
    for (const item of arr) {
      const c = cleanReview(item);
      if (!c) continue;
      const key = c.content.slice(0, 40);
      if (seen.has(key)) continue;
      if (cleaned.some((x) => similarity(x.content, c.content) > 0.7)) continue;
      seen.add(key);
      cleaned.push(c);
    }
    res.json({ reviews: cleaned.slice(0, batch) });
  } catch (e) {
    res.status(502).json({ error: e.name === 'AbortError' ? '采集请求超时，请重试' : '采集失败：' + e.message });
  }
});

app.post('/api/insight-draft', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  const { quotes = [], category = '' } = req.body || {};
  if (!Array.isArray(quotes) || !quotes.length) {
    return res.status(400).json({ error: '缺少原始引语' });
  }
  const prompt =
    '你是一名资深工业设计用户研究员。基于以下用户原始评价引语，生成一份结构化设计洞察草稿，' +
    '严格返回可被 JSON.parse 解析的 JSON 对象，不要输出任何其他文字：\n' +
    '{"behaviorInsight":"行为洞察（用户在场景中表现出的真实行为与动机，80字内）",' +
    '"designRequirement":"设计需求（可落地的工业设计改进方向，80字内）",' +
    '"hmwQuestion":"HMW 问题，以「我们如何能够」开头（50字内）"}\n' +
    (category ? `洞察分类方向：${category}。\n` : '') +
    '原始引语：\n' + quotes.slice(0, 10).map((q, i) => `${i + 1}. ${String(q).slice(0, 300)}`).join('\n');
  try {
    const text = await chat(cfg, [{ role: 'user', content: prompt }]);
    const obj = extractJson(text, '{', '}');
    if (!obj || typeof obj !== 'object') {
      return res.status(502).json({ error: '模型返回格式异常，无法解析洞察草稿' });
    }
    res.json({
      behaviorInsight: String(obj.behaviorInsight || ''),
      designRequirement: String(obj.designRequirement || ''),
      hmwQuestion: String(obj.hmwQuestion || ''),
    });
  } catch (e) {
    res.status(502).json({ error: e.name === 'AbortError' ? '请求超时，请重试' : '生成失败：' + e.message });
  }
});

app.post('/api/persona-draft', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  const { product = '', summary = '' } = req.body || {};
  const prompt =
    '你是一名资深用户研究员。基于以下关于「' + String(product).slice(0, 50) + '」的用户评价数据摘要，' +
    '生成一个典型用户画像草稿，严格返回可被 JSON.parse 解析的 JSON 对象，不要输出任何其他文字：\n' +
    '{"name":"画像代号（如「效率至上的早八族」）","demographics":"人口统计特征（年龄段/职业/居住状态等，60字内）",' +
    '"painPoints":["核心痛点1","核心痛点2","核心痛点3"],"needs":["核心需求1","核心需求2","核心需求3"],' +
    '"behaviors":["行为特征1","行为特征2","行为特征3"],"quote":"一句能代表该用户的口语化引语"}\n' +
    '评价数据摘要：\n' + String(summary).slice(0, 3000);
  try {
    const text = await chat(cfg, [{ role: 'user', content: prompt }]);
    const obj = extractJson(text, '{', '}');
    if (!obj || typeof obj !== 'object') {
      return res.status(502).json({ error: '模型返回格式异常，无法解析画像草稿' });
    }
    const asArray = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 6) : []);
    res.json({
      name: String(obj.name || ''),
      demographics: String(obj.demographics || ''),
      painPoints: asArray(obj.painPoints),
      needs: asArray(obj.needs),
      behaviors: asArray(obj.behaviors),
      quote: String(obj.quote || ''),
    });
  } catch (e) {
    res.status(502).json({ error: e.name === 'AbortError' ? '请求超时，请重试' : '生成失败：' + e.message });
  }
});

app.post('/api/iteration-plan-draft', async (req, res) => {
  const cfg = requireConfig(req, res);
  if (!cfg) return;
  const { product = '', summary = '', insights = [] } = req.body || {};
  const validPriority = (v) => (v === 'high' || v === 'medium' || v === 'low' ? v : 'medium');
  const validEffort = (v) => (v === 'small' || v === 'medium' || v === 'large' ? v : 'medium');
  const validPhase = (v) => (v === 'short' || v === 'medium' || v === 'long' ? v : 'short');

  const insightsText = (Array.isArray(insights) ? insights : [])
    .slice(0, 12)
    .map(
      (ins, i) =>
        `${i + 1}. [${validPriority(ins.priority)}优先级] ${ins.behaviorInsight || ''}\n   设计需求：${ins.designRequirement || ''}\n   HMW：${ins.hmwQuestion || ''}`
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

  try {
    const text = await chat(cfg, [{ role: 'user', content: prompt }]);
    const obj = extractJson(text, '{', '}');
    if (!obj || typeof obj !== 'object') {
      return res.status(502).json({ error: '模型返回格式异常，无法解析迭代方案' });
    }
    const asArray = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 8) : []);
    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    res.json({
      summary: String(obj.summary || ''),
      coreProblems: asArray(obj.coreProblems),
      items: rawItems
        .map((it) => ({
          title: String(it.title || ''),
          description: String(it.description || ''),
          priority: validPriority(it.priority),
          effort: validEffort(it.effort),
          impact: String(it.impact || ''),
          relatedInsight: it.relatedInsight ? String(it.relatedInsight) : undefined,
          phase: validPhase(it.phase),
        }))
        .filter((it) => it.title || it.description),
      metrics: asArray(obj.metrics),
    });
  } catch (e) {
    res.status(502).json({ error: e.name === 'AbortError' ? '请求超时，请重试' : '生成失败：' + e.message });
  }
});

app.listen(PORT, () => {
  console.log(`UserInsight server listening on http://localhost:${PORT}`);
});
