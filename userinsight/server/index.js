/**
 * UserInsight 后端服务
 * 职责：
 *  - 转发大模型 API 请求（规避浏览器跨域限制），兼容 OpenAI 格式接口（Kimi / DeepSeek / 通义等）
 *  - /api/collect        智能采集：组装提示词调用具备联网能力的大模型，校验清洗返回结构化评价
 *  - /api/insight-draft  洞察草稿：基于引语生成 行为洞察/设计需求/HMW 草稿
 *  - /api/persona-draft  画像草稿：基于评价摘要生成 Persona 草稿
 *  - /api/test-connection 测试大模型配置可用性
 *
 * 真实性红线：本服务不生成、不缓存任何评价数据；大模型无搜索结果时返回空数组，绝不虚构。
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
async function chat(cfg, messages, temperature = 0.7) {
  const url = cfg.baseURL.replace(/\/+$/, '') + '/chat/completions';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, messages, temperature }),
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
    '你是一个严谨的用户研究助手，具备联网检索能力，能够检索中文社交网络与电商平台的公开用户评价。' +
    '你只返回真实检索到的公开内容，严禁编造评价、昵称或链接。没有检索结果时必须返回空数组 []。' +
    '你的输出必须是可以被 JSON.parse 直接解析的 JSON，不要输出 Markdown 代码块或其他任何解释性文字。';

  const excludeLines = Array.isArray(exclude) && exclude.length
    ? '\n以下内容已采集过，禁止重复返回：\n' + exclude.slice(0, 40).map((c, i) => `${i + 1}. ${String(c).slice(0, 50)}`).join('\n')
    : '';

  const userPrompt =
    `请联网检索关于「${String(keyword).trim()}」的真实用户评价与讨论，优先来源平台：${platformNames}。` +
    (focus ? `重点关注：${String(focus).slice(0, 200)}。` : '') +
    `返回最多 ${batch} 条互不重复的评价。` +
    excludeLines +
    '\n每条评价严格使用以下 JSON 结构，组成一个 JSON 数组返回：\n' +
    '[{"content":"评价原文（口语化，20-200字）","platform":"xiaohongshu/weibo/taobao/jd/zhihu/douyin/smzdm/bilibili/other 之一",' +
    '"rating":1到5的整数,"keywords":["关键词1","关键词2"],"painPointType":"握持/清洁/重量/操作/外观/噪音/价格/其他 之一（无则省略该字段）",' +
    '"scenario":"使用场景","hasImage":true或false,"sourceUrl":"原文完整链接","authorName":"用户昵称","reviewDate":"YYYY-MM-DD","likeCount":点赞数}]\n' +
    '要求：1) 每条必须附真实可访问的来源链接 sourceUrl；2) 检索不到足够结果时，有几条返回几条，没有则返回 []；3) 只输出 JSON 数组本身。';

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
    const text = await chat(cfg, [{ role: 'user', content: prompt }], 0.5);
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
    const text = await chat(cfg, [{ role: 'user', content: prompt }], 0.6);
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

app.listen(PORT, () => {
  console.log(`UserInsight server listening on http://localhost:${PORT}`);
});
