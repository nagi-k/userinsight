import { Project, Review, Insight, Persona, JourneyStage, Competitor } from '../types';
import { uid, sentimentFromRating } from './utils';

type ReviewSeed = Omit<Review, 'id' | 'createdAt' | 'source' | 'sentiment' | 'verified' | 'hasImage' | 'keywords' | 'rating'> & {
  rating: 1 | 2 | 3 | 4 | 5;
  keywords?: string[];
  hasImage?: boolean;
  verified?: boolean;
};

/** 示例评价均为手动录入的演示数据（source: 'manual'），与自动采集数据区分 */
function r(seed: ReviewSeed): Review {
  return {
    hasImage: false,
    verified: true,
    keywords: [],
    ...seed,
    id: uid(),
    source: 'manual',
    sentiment: sentimentFromRating(seed.rating),
    createdAt: '2026-07-01T09:00:00.000Z',
  };
}

const seedReviews: Review[] = [
  r({
    content: '颜值真的绝了，奶白色机身放厨房特别出片，早上做一杯拿铁幸福感拉满',
    platform: 'xiaohongshu', rating: 5, keywords: ['颜值', '奶白色', '拿铁'], scenario: '家庭早餐',
    hasImage: true, sourceUrl: 'https://www.xiaohongshu.com/explore/demo01', authorName: '奶***酱',
    reviewDate: '2026-03-12', likeCount: 342, tags: ['视觉颜值'],
  }),
  r({
    content: '咖啡机颜值很高但是水箱太难拆了，清洗一次要十分钟，边角还藏污纳垢',
    platform: 'xiaohongshu', rating: 2, keywords: ['水箱', '清洁'], painPointType: '清洁', scenario: '日常清洁',
    sourceUrl: 'https://www.xiaohongshu.com/explore/demo02', authorName: '桃***子',
    reviewDate: '2026-04-02', likeCount: 108, tags: ['清洁维护'], note: '清洁类高频负评，重点跟进',
  }),
  r({
    content: '萃取挺稳定，油脂不错，就是预热要等快一分钟，早八人等得心急',
    platform: 'weibo', rating: 4, keywords: ['萃取', '预热'], painPointType: '操作', scenario: '工作日早晨',
    sourceUrl: 'https://weibo.com/demo03', authorName: '早***八',
    reviewDate: '2026-02-18', likeCount: 56,
  }),
  r({
    content: '用了三个月就开始漏水，售后说是正常现象不给修，直接拉黑这个品牌',
    platform: 'weibo', rating: 1, keywords: ['漏水', '售后'], painPointType: '其他',
    authorName: '怒***户', reviewDate: '2026-05-06', likeCount: 210, verified: false,
    note: '未附原链接，待核实',
  }),
  r({
    content: '作为入门机中规中矩，压力稳定在15bar左右，但塑料感偏重，握持手感一般',
    platform: 'zhihu', rating: 3, keywords: ['压力', '塑料感', '握持'], painPointType: '握持',
    sourceUrl: 'https://www.zhihu.com/question/demo05', authorName: '器***迷',
    reviewDate: '2026-01-25', likeCount: 89, tags: ['材质触感'],
  }),
  r({
    content: '对比了五台机器最终留下它，噪音控制是最大惊喜，早起做咖啡不会吵醒家人',
    platform: 'zhihu', rating: 5, keywords: ['噪音', '静音'], scenario: '清晨',
    sourceUrl: 'https://www.zhihu.com/question/demo06', authorName: '深***控',
    reviewDate: '2026-03-30', likeCount: 176,
  }),
  r({
    content: '直播买的，说是便携，结果机身加电池快两公斤，通勤根本不想带',
    platform: 'douyin', rating: 2, keywords: ['便携', '重量'], painPointType: '重量', scenario: '通勤',
    hasImage: true, sourceUrl: 'https://www.douyin.com/video/demo07', authorName: '风***子',
    reviewDate: '2026-04-15', likeCount: 430, tags: ['便携收纳'],
  }),
  r({
    content: '操作逻辑简单，我妈看一眼就会用，就是水箱刻度看不清，老人家要凑很近',
    platform: 'douyin', rating: 4, keywords: ['操作', '刻度'], painPointType: '操作', scenario: '家庭共用',
    sourceUrl: 'https://www.douyin.com/video/demo08', authorName: '暖***宝',
    reviewDate: '2026-05-20', likeCount: 95, tags: ['人机交互'],
  }),
  r({
    content: '这个价位能喝到接近咖啡馆的出品，性价比无敌，已经推荐给三个同事',
    platform: 'taobao', rating: 5, keywords: ['性价比', '价格'],
    sourceUrl: 'https://item.taobao.com/demo09', authorName: '省***王',
    reviewDate: '2026-02-10', likeCount: 34, tags: ['价格感知'],
  }),
  r({
    content: '中规中矩，胶囊兼容性一般，第三方胶囊经常卡住，得用手指顶一下',
    platform: 'taobao', rating: 3, keywords: ['胶囊', '兼容'], painPointType: '操作',
    sourceUrl: 'https://item.taobao.com/demo10', authorName: '胶***控',
    reviewDate: '2026-06-01',
  }),
  r({
    content: '噪音大得像拖拉机，实测接近80分贝，客服说是正常范围，无法接受',
    platform: 'jd', rating: 1, keywords: ['噪音'], painPointType: '噪音', scenario: '清晨',
    sourceUrl: 'https://item.jd.com/demo11.html', authorName: '失***者',
    reviewDate: '2026-03-08', likeCount: 67, note: '与知乎好评形成噪音争议，值得深挖',
  }),
  r({
    content: '京东物流快，机器做工不错，就是接水盘太浅，大杯子放不进去，高杯会顶到出口',
    platform: 'jd', rating: 4, keywords: ['物流', '做工'], painPointType: '其他',
    sourceUrl: 'https://item.jd.com/demo12.html', authorName: '杯***子',
    reviewDate: '2026-04-22', likeCount: 21,
  }),
  r({
    content: '站内好价入手，晒单：体积比想象小，收纳进橱柜毫无压力，小户型友好',
    platform: 'smzdm', rating: 5, keywords: ['收纳', '体积', '价格'], scenario: '厨房收纳',
    hasImage: true, sourceUrl: 'https://post.smzdm.com/demo13', authorName: '好***价',
    reviewDate: '2026-01-15', likeCount: 158, tags: ['便携收纳', '价格感知'],
  }),
  r({
    content: '实测连续出杯第三杯温度就掉到80度以下，家庭聚会连着做不够用',
    platform: 'smzdm', rating: 3, keywords: ['温度', '连续出杯'], painPointType: '操作', scenario: '多人聚会',
    sourceUrl: 'https://post.smzdm.com/demo14', authorName: '测***君',
    reviewDate: '2026-05-11', likeCount: 203,
  }),
  r({
    content: '做了拆解视频，内部水路设计规整，但清洁死角多，建议厂家出专用清洁刷',
    platform: 'bilibili', rating: 4, keywords: ['拆解', '清洁'], painPointType: '清洁',
    sourceUrl: 'https://www.bilibili.com/video/demo15', authorName: '拆***主',
    reviewDate: '2026-02-27', likeCount: 512, tags: ['清洁维护'],
  }),
  r({
    content: 'up主实测：宣传20bar实际峰值才15bar，虚标有点败好感',
    platform: 'bilibili', rating: 2, keywords: ['虚标', '压力'], painPointType: '其他',
    sourceUrl: 'https://www.bilibili.com/video/demo16', authorName: '求***p',
    reviewDate: '2026-06-10', likeCount: 980,
  }),
  r({
    content: '奶泡系统时好时坏，打出来的奶泡粗糙，拉花基本靠运气',
    platform: 'xiaohongshu', rating: 3, keywords: ['奶泡', '拉花'], painPointType: '操作', scenario: '周末练习',
    hasImage: true, sourceUrl: 'https://www.xiaohongshu.com/explore/demo17', authorName: '拉***手',
    reviewDate: '2026-03-19', likeCount: 76,
  }),
  r({
    content: '露营带出去用了一次，接移动电源就能用，户外咖啡自由实现了',
    platform: 'weibo', rating: 5, keywords: ['露营', '户外', '便携'], scenario: '户外露营',
    hasImage: true, sourceUrl: 'https://weibo.com/demo18', authorName: '山***风',
    reviewDate: '2026-05-28', likeCount: 264, tags: ['便携收纳'],
  }),
  r({
    content: '说明书翻译腔严重，除垢步骤写得云里雾里，最后还是靠B站视频学会的',
    platform: 'zhihu', rating: 2, keywords: ['说明书', '除垢'], painPointType: '操作',
    sourceUrl: 'https://www.zhihu.com/question/demo19', authorName: '新***手',
    reviewDate: '2026-04-08', likeCount: 45, tags: ['人机交互'],
  }),
  r({
    content: '收货就有划痕，换货来回折腾半个月，包装里连缓冲棉都没有',
    platform: 'taobao', rating: 1, keywords: ['划痕', '包装'], painPointType: '外观',
    sourceUrl: 'https://item.taobao.com/demo20', authorName: '倒***蛋',
    reviewDate: '2026-06-18', likeCount: 12,
  }),
];

const seedInsights: Insight[] = [
  {
    id: uid(),
    reviewIds: [],
    quote: '咖啡机颜值很高但是水箱太难拆了，清洗一次要十分钟，边角还藏污纳垢',
    behaviorInsight: '用户将清洁成本视为长期使用的核心负担，清洁不便会直接抵消外观设计带来的好感，甚至成为弃用导火索。',
    designRequirement: '水箱采用单手快拆结构，内部水路减少直角死角，标配专用清洁刷并支持一键自清洁程序。',
    hmwQuestion: '我们如何能够将整机清洁时间缩短到2分钟以内？',
    category: 'ergonomics', priority: 'high', order: 1, createdAt: '2026-07-02T10:00:00.000Z',
  },
  {
    id: uid(),
    reviewIds: [],
    quote: '直播买的，说是便携，结果机身加电池快两公斤，通勤根本不想带',
    behaviorInsight: '“便携”是用户购买决策关键词，但用户对重量的实际容忍阈值远低于厂商宣传预期，通勤场景对重量极其敏感。',
    designRequirement: '便携版本整机重量控制在1kg以内，电池与机身可分离设计，附赠硬质收纳包。',
    hmwQuestion: '我们如何能够让用户在通勤场景无负担地携带咖啡机？',
    category: 'scenario', priority: 'high', order: 2, createdAt: '2026-07-02T10:05:00.000Z',
  },
  {
    id: uid(),
    reviewIds: [],
    quote: '噪音大得像拖拉机，实测接近80分贝 / 噪音控制是最大惊喜，早起做咖啡不会吵醒家人',
    behaviorInsight: '噪音是家庭清晨场景的首要敏感指标，同一指标的口碑两极分化会直接决定推荐与劝退。',
    designRequirement: '工作噪音控制在65dB以下，增加静音模式并在机身标注实测分贝值。',
    hmwQuestion: '我们如何能够让清晨使用咖啡机不打扰家人休息？',
    category: 'emotion', priority: 'medium', order: 3, createdAt: '2026-07-02T10:10:00.000Z',
  },
  {
    id: uid(),
    reviewIds: [],
    quote: '说明书翻译腔严重，除垢步骤写得云里雾里，最后还是靠B站视频学会的',
    behaviorInsight: '新用户首次上手高度依赖第三方视频内容，官方引导缺失会让用户在学习成本上直接扣分。',
    designRequirement: '提供扫码直达的视频化新手引导与除垢教程，机身关键部位增加图形化操作标识。',
    hmwQuestion: '我们如何能够让新用户不依赖第三方内容完成首次上手？',
    category: 'scenario', priority: 'medium', order: 4, createdAt: '2026-07-02T10:15:00.000Z',
  },
];

const seedPersona: Persona = {
  id: uid(),
  name: '林晓晨 · 效率至上的早八族',
  demographics: '28岁，一线城市互联网公司产品经理，租房独居，朝九晚八，厨房空间有限',
  painPoints: ['清洁', '重量', '噪音'],
  needs: ['3分钟内完成一杯出品', '清洁维护不费力', '早起使用不打扰室友', '小体积易收纳'],
  behaviors: ['工作日早晨高频使用', '小红书重度用户，购买前看20+篇测评', '愿意为颜值付费，但对清洁零容忍', '遇到说明书会直接搜视频教程'],
  quote: '咖啡机颜值很高但是水箱太难拆了，清洗一次要十分钟',
};

const seedJourney: JourneyStage[] = [
  { id: uid(), name: '了解', touchpoint: '小红书笔记 / B站测评视频', painPoint: '参数虚标难以辨别，真实评价难筛选', emotionScore: 3, order: 1 },
  { id: uid(), name: '购买', touchpoint: '电商大促 / 直播间', painPoint: '比价耗时，价格波动大', emotionScore: 3, order: 2 },
  { id: uid(), name: '开箱', touchpoint: '快递开箱', painPoint: '包装简陋，担心运输损伤与划痕', emotionScore: 3, order: 3 },
  { id: uid(), name: '日常使用', touchpoint: '厨房 / 办公室', painPoint: '预热等待久，连续出杯温度衰减', emotionScore: 4, order: 4 },
  { id: uid(), name: '清洁维护', touchpoint: '水槽 / 收纳柜', painPoint: '水箱难拆、死角多，除垢流程看不懂', emotionScore: 2, order: 5 },
];

const seedCompetitors: Competitor[] = [
  {
    id: uid(),
    name: '德龙 EC685',
    scores: { 萃取品质: 4, 清洁便利: 3, 便携性: 2, 外观设计: 4, 性价比: 3 },
  },
  {
    id: uid(),
    name: 'Nespresso Essenza Mini',
    scores: { 萃取品质: 4, 清洁便利: 4, 便携性: 4, 外观设计: 3, 性价比: 2 },
  },
];

export function createSeedProject(): Project {
  return {
    id: uid(),
    name: '智能咖啡机用户体验研究',
    product: '智能咖啡机',
    goal: '挖掘家用咖啡机在清洁、便携与噪音方面的核心痛点，输出下一代产品设计机会点',
    createdAt: '2026-07-01T09:00:00.000Z',
    reviews: seedReviews,
    insights: seedInsights,
    personas: [seedPersona],
    journeyStages: seedJourney,
    competitors: seedCompetitors,
  };
}
