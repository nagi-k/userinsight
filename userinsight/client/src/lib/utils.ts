import { Review, Insight } from '../types';

export const uid = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const PLATFORMS: Record<Review['platform'], string> = {
  xiaohongshu: '小红书',
  weibo: '微博',
  taobao: '淘宝',
  jd: '京东',
  zhihu: '知乎',
  douyin: '抖音',
  smzdm: '什么值得买',
  bilibili: 'B站',
  other: '其他',
};

export const PLATFORM_KEYS = Object.keys(PLATFORMS) as Review['platform'][];

export const PAIN_TYPES = ['握持', '清洁', '重量', '操作', '外观', '噪音', '价格', '其他'] as const;

export const SENTIMENT_LABELS: Record<Review['sentiment'], string> = {
  positive: '正面',
  negative: '负面',
  neutral: '中性',
};

export const INSIGHT_CATEGORIES: Record<Insight['category'], string> = {
  ergonomics: '人机工效',
  form: '形态语义',
  material: '材质触感',
  scenario: '场景适配',
  emotion: '情感符号',
};

export const PRIORITY_LABELS: Record<Insight['priority'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export const PRESET_TAGS = ['清洁维护', '便携收纳', '人机交互', '视觉颜值', '材质触感', '价格感知'];

/** 手动录入时的关键词词典匹配 */
export const KEYWORD_DICT = [
  '清洁', '清洗', '水箱', '除垢', '便携', '重量', '收纳', '颜值', '外观', '噪音', '静音',
  '握持', '手感', '操作', '说明书', '预热', '萃取', '压力', '奶泡', '拉花', '胶囊', '兼容',
  '漏水', '售后', '价格', '性价比', '材质', '塑料感', '续航', '温度', '包装', '刻度',
  '露营', '户外', '通勤', '虚标', '物流', '做工',
];

export function sentimentFromRating(rating: number): Review['sentiment'] {
  return rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral';
}

/** 从粘贴文本中识别星级：★★★★ 或 “4星 / 4分” */
export function parseRatingFromText(text: string): number {
  const stars = (text.match(/★/g) || []).length;
  if (stars >= 1 && stars <= 5) return stars;
  const m = text.match(/([1-5])\s*(?:星|分)/);
  if (m) return parseInt(m[1], 10);
  return 0;
}

/** 关键词词典匹配 */
export function matchKeywords(text: string): string[] {
  return KEYWORD_DICT.filter((w) => text.includes(w)).slice(0, 6);
}

/** 昵称脱敏：如 “咖啡控小A” -> “咖***A” */
export function maskName(name: string): string {
  const s = (name || '匿名用户').trim();
  if (s.length <= 1) return s + '***';
  return s[0] + '***' + s[s.length - 1];
}

function bigrams(s: string): Set<string> {
  const clean = s.replace(/\s+/g, '');
  const set = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
  return set;
}

/** 基于二字组的 Jaccard 相似度，用于“疑似重复”检测 */
export function similarity(a: string, b: string): number {
  const sa = bigrams(a);
  const sb = bigrams(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const g of sa) if (sb.has(g)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function fmtDate(s?: string): string {
  return s ? s.slice(0, 10) : '—';
}

export function isValidHttpUrl(s?: string): boolean {
  return !!s && /^https?:\/\/\S+$/.test(s);
}

export function download(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export function reviewsToCSV(reviews: Review[]): string {
  const header = ['内容', '平台', '星级', '情感', '痛点类型', '场景', '关键词', '标签', '来源链接', '脱敏昵称', '评价时间', '点赞数', '是否待核实', '采集方式', '备注', '入库时间'];
  const rows = reviews.map((r) =>
    [
      r.content,
      PLATFORMS[r.platform],
      String(r.rating),
      SENTIMENT_LABELS[r.sentiment],
      r.painPointType || '',
      r.scenario || '',
      r.keywords.join(' '),
      (r.tags || []).join(' '),
      r.sourceUrl || '',
      r.authorName || '',
      r.reviewDate || '',
      r.likeCount != null ? String(r.likeCount) : '',
      r.verified ? '否' : '是',
      r.source === 'auto' ? '自动采集' : '手动录入',
      r.note || '',
      r.createdAt,
    ]
      .map(csvCell)
      .join(',')
  );
  // 加 BOM 保证 Excel 正确识别中文
  return '﻿' + header.map(csvCell).join(',') + '\n' + rows.join('\n');
}

export const SENTIMENT_COLORS: Record<Review['sentiment'], string> = {
  positive: '#6366f1', // indigo-500
  negative: '#f59e0b', // amber-500
  neutral: '#94a3b8',  // slate-400
};

export const CHART_COLORS = ['#1e40af', '#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];
