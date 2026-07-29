export interface Project {
  id: string;
  name: string;
  product: string; // 目标产品，即采集关键词
  goal: string;
  createdAt: string;
  reviews: Review[];
  insights: Insight[];
  personas: Persona[];
  journeyStages: JourneyStage[];
  competitors: Competitor[];
}

export interface Review {
  id: string;
  content: string;
  platform:
    | 'xiaohongshu'
    | 'weibo'
    | 'taobao'
    | 'jd'
    | 'zhihu'
    | 'douyin'
    | 'smzdm'
    | 'bilibili'
    | 'other';
  rating: 1 | 2 | 3 | 4 | 5;
  keywords: string[];
  painPointType?: '握持' | '清洁' | '重量' | '操作' | '外观' | '噪音' | '价格' | '其他';
  scenario?: string;
  hasImage: boolean;
  sentiment: 'positive' | 'negative' | 'neutral';
  sourceUrl?: string; // 原文链接（可溯源性关键字段）
  authorName?: string; // 脱敏昵称
  reviewDate?: string; // 评价原始发布时间
  likeCount?: number;
  verified: boolean; // false 时前端显示"待核实"标识
  source: 'auto' | 'manual'; // 自动采集 / 手动录入
  note?: string;
  createdAt: string; // 入库时间
  tags?: string[]; // 研究者标签（预设标签 + 自定义）
}

export interface Insight {
  id: string;
  reviewIds: string[];
  quote: string;
  behaviorInsight: string;
  designRequirement: string;
  hmwQuestion: string;
  category: 'ergonomics' | 'form' | 'material' | 'scenario' | 'emotion';
  priority: 'high' | 'medium' | 'low';
  order: number;
  createdAt: string;
}

export interface Persona {
  id: string;
  name: string;
  demographics: string;
  painPoints: string[];
  needs: string[];
  behaviors: string[];
  quote: string;
}

export interface JourneyStage {
  id: string;
  name: string;
  touchpoint: string;
  painPoint: string;
  emotionScore: 1 | 2 | 3 | 4 | 5;
  order: number;
}

export interface Competitor {
  id: string;
  name: string;
  scores: { [dimension: string]: number };
}

export interface LLMSettings {
  baseURL: string;
  apiKey: string;
  model: string;
}
