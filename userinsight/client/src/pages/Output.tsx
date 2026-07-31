import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip,
} from 'recharts';
import { Plus, Trash2, Download, Target, GitCompareArrows, FileText, Rocket, Loader2, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { Competitor, Insight, IterationPlan, IterationItem } from '../types';
import {
  uid, PLATFORMS, SENTIMENT_LABELS, INSIGHT_CATEGORIES, PRIORITY_LABELS,
  CHART_COLORS, download, fmtDate,
} from '../lib/utils';
import { Badge, EmptyState, inputCls, btnPrimary, btnSecondary, cardCls } from '../components/ui';

const PRIORITY_ORDER: Record<Insight['priority'], number> = { high: 0, medium: 1, low: 2 };

export default function Output() {
  const { current } = useStore();
  if (!current) return null;
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">设计输出中心</h1>
        <p className="text-sm text-gray-500 mt-0.5">将研究结论转化为设计机会与可交付报告</p>
      </div>
      <OpportunityList />
      <IterationPlanSection />
      <CompetitorMatrix />
      <ReportSection />
    </div>
  );
}

/* ---------------- 设计机会清单 ---------------- */

function OpportunityList() {
  const { current } = useStore();
  const opportunities = useMemo(
    () =>
      (current?.insights || [])
        .filter((i) => i.designRequirement || i.hmwQuestion)
        .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.order - b.order),
    [current]
  );
  return (
    <div className={`${cardCls} p-5`}>
      <h2 className="font-semibold text-gray-900 mb-4 inline-flex items-center gap-2">
        <Target size={17} className="text-primary" /> 设计机会清单
        <span className="text-xs font-normal text-gray-400">按优先级自动排序</span>
      </h2>
      {!opportunities.length ? (
        <p className="text-sm text-gray-400 py-6 text-center">暂无设计机会：请先在洞察工坊完善洞察的「设计需求」</p>
      ) : (
        <div className="space-y-3">
          {opportunities.map((ins, idx) => (
            <div key={ins.id} className="flex gap-3 rounded-lg border border-gray-100 p-4 hover:border-primary/30 transition-colors">
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                ins.priority === 'high' ? 'bg-red-50 text-red-600' : ins.priority === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'
              }`}>
                {idx + 1}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  <Badge color={ins.priority === 'high' ? 'red' : ins.priority === 'medium' ? 'amber' : 'gray'}>
                    优先级：{PRIORITY_LABELS[ins.priority]}
                  </Badge>
                  <Badge color="blue">{INSIGHT_CATEGORIES[ins.category]}</Badge>
                </div>
                {ins.designRequirement && <p className="text-sm font-medium text-gray-900">{ins.designRequirement}</p>}
                {ins.hmwQuestion && <p className="text-sm text-primary mt-1">{ins.hmwQuestion}</p>}
                {ins.quote && <p className="text-xs text-gray-400 mt-1.5 line-clamp-1">依据：“{ins.quote}”</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- 竞品对比矩阵 ---------------- */

function CompetitorMatrix() {
  const { current, updateCurrent } = useStore();
  const [newName, setNewName] = useState('');
  const [newDim, setNewDim] = useState('');

  const competitors = current?.competitors || [];
  const dimensions = useMemo(
    () => [...new Set(competitors.flatMap((c) => Object.keys(c.scores)))],
    [competitors]
  );

  if (!current) return null;

  const addCompetitor = () => {
    const name = newName.trim();
    if (!name) return;
    const scores: Record<string, number> = {};
    dimensions.forEach((d) => (scores[d] = 3));
    updateCurrent((p) => ({ ...p, competitors: [...p.competitors, { id: uid(), name, scores }] }));
    setNewName('');
  };

  const addDimension = () => {
    const d = newDim.trim();
    if (!d || dimensions.includes(d)) return;
    updateCurrent((p) => ({
      ...p,
      competitors: p.competitors.map((c) => ({ ...c, scores: { ...c.scores, [d]: 3 } })),
    }));
    setNewDim('');
  };

  const removeDimension = (d: string) =>
    updateCurrent((p) => ({
      ...p,
      competitors: p.competitors.map((c) => {
        const scores = { ...c.scores };
        delete scores[d];
        return { ...c, scores };
      }),
    }));

  const setScore = (id: string, dim: string, value: number) =>
    updateCurrent((p) => ({
      ...p,
      competitors: p.competitors.map((c) =>
        c.id === id ? { ...c, scores: { ...c.scores, [dim]: value } } : c
      ),
    }));

  const radarData = dimensions.map((d) => {
    const row: Record<string, string | number> = { dimension: d };
    competitors.forEach((c) => (row[c.name] = c.scores[d] ?? 0));
    return row;
  });

  return (
    <div className={`${cardCls} p-5`}>
      <h2 className="font-semibold text-gray-900 mb-4 inline-flex items-center gap-2">
        <GitCompareArrows size={17} className="text-primary" /> 竞品对比矩阵
      </h2>
      <div className="flex flex-wrap gap-2 mb-4">
        <input className={inputCls + ' !w-48'} placeholder="竞品名称" value={newName}
          onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCompetitor()} />
        <button className={btnSecondary} onClick={addCompetitor}><Plus size={14} /> 添加竞品</button>
        <input className={inputCls + ' !w-48'} placeholder="对比维度（如：清洁便利）" value={newDim}
          onChange={(e) => setNewDim(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDimension()} />
        <button className={btnSecondary} onClick={addDimension} disabled={!competitors.length}><Plus size={14} /> 添加维度</button>
      </div>

      {!competitors.length ? (
        <p className="text-sm text-gray-400 py-6 text-center">添加竞品后，可自定义对比维度并按 1-5 分打分</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3">维度</th>
                  {competitors.map((c) => (
                    <th key={c.id} className="py-2 pr-3">
                      <div className="flex items-center gap-1">
                        <span className="max-w-[120px] truncate">{c.name}</span>
                        <button className="text-gray-300 hover:text-red-500"
                          onClick={() => updateCurrent((p) => ({ ...p, competitors: p.competitors.filter((x) => x.id !== c.id) }))}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dimensions.map((d) => (
                  <tr key={d} className="border-b border-gray-50">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1">
                        <span>{d}</span>
                        <button className="text-gray-300 hover:text-red-500" onClick={() => removeDimension(d)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                    {competitors.map((c) => (
                      <td key={c.id} className="py-2 pr-3">
                        <select
                          className="rounded border border-gray-300 px-1.5 py-1 text-sm"
                          value={c.scores[d] ?? 3}
                          onChange={(e) => setScore(c.id, d, parseInt(e.target.value, 10))}
                        >
                          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            {dimensions.length >= 3 ? (
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fontSize: 10 }} />
                  {competitors.map((c, i) => (
                    <Radar key={c.id} name={c.name} dataKey={c.name}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.25} />
                  ))}
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-10">至少 3 个维度可绘制雷达图</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 报告预览与导出 ---------------- */

function buildMarkdown(project: NonNullable<ReturnType<typeof useStore>['current']>): string {
  if (!project) return '';
  const reviews = project.reviews;
  const total = reviews.length;
  const auto = reviews.filter((r) => r.source === 'auto').length;
  const pos = reviews.filter((r) => r.sentiment === 'positive').length;
  const neg = reviews.filter((r) => r.sentiment === 'negative').length;
  const neu = total - pos - neg;
  const pct = (n: number) => (total ? ((n / total) * 100).toFixed(1) : '0');

  const platformMap = new Map<string, number>();
  reviews.forEach((r) => platformMap.set(r.platform, (platformMap.get(r.platform) || 0) + 1));

  const painMap = new Map<string, number>();
  reviews.forEach((r) => r.painPointType && painMap.set(r.painPointType, (painMap.get(r.painPointType) || 0) + 1));
  const painTop = [...painMap.entries()].sort((a, b) => b[1] - a[1]);

  const insights = [...project.insights].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.order - b.order
  );
  const stages = [...project.journeyStages].sort((a, b) => a.order - b.order);
  const links = reviews.filter((r) => r.sourceUrl);

  const lines: string[] = [];
  lines.push(`# ${project.name} · 研究报告`, '');
  lines.push('## 一、项目概览', '');
  lines.push(`- 目标产品：${project.product}`);
  lines.push(`- 研究目标：${project.goal || '—'}`);
  lines.push(`- 项目创建时间：${fmtDate(project.createdAt)}`);
  lines.push(`- 报告生成时间：${new Date().toLocaleString('zh-CN')}`, '');
  lines.push('## 二、数据来源与规模', '');
  lines.push(`- 评价总数：${total} 条（自动采集 ${auto} 条 / 手动录入 ${total - auto} 条）`);
  lines.push(`- 平台分布：${[...platformMap.entries()].map(([k, v]) => `${PLATFORMS[k as keyof typeof PLATFORMS] || k} ${v} 条`).join('、') || '—'}`);
  lines.push('- 合规说明：采集内容来自公开渠道，仅供学术研究使用；昵称等个人信息已脱敏。', '');
  lines.push('## 三、情感分析', '');
  lines.push(`- 正面：${pos} 条（${pct(pos)}%）`);
  lines.push(`- 负面：${neg} 条（${pct(neg)}%）`);
  lines.push(`- 中性：${neu} 条（${pct(neu)}%）`, '');
  lines.push('## 四、痛点分析', '');
  if (painTop.length) {
    painTop.forEach(([k, v], i) => lines.push(`${i + 1}. **${k}**：${v} 条`));
  } else {
    lines.push('暂无痛点类型标注。');
  }
  lines.push('');
  lines.push('## 五、用户画像', '');
  if (project.personas.length) {
    project.personas.forEach((p) => {
      lines.push(`### ${p.name}`, '');
      lines.push(`- 人口统计：${p.demographics || '—'}`);
      lines.push(`- 核心痛点：${p.painPoints.join('、') || '—'}`);
      lines.push(`- 核心需求：${p.needs.join('；') || '—'}`);
      lines.push(`- 行为特征：${p.behaviors.join('；') || '—'}`);
      if (p.quote) lines.push(`- 代表性引语：“${p.quote}”`);
      lines.push('');
    });
  } else {
    lines.push('暂未创建用户画像。', '');
  }
  lines.push('## 六、用户旅程', '');
  if (stages.length) {
    lines.push('| 阶段 | 触点 | 痛点 | 情绪分值 |', '| --- | --- | --- | --- |');
    stages.forEach((s) => lines.push(`| ${s.name} | ${s.touchpoint || '—'} | ${s.painPoint || '—'} | ${s.emotionScore}/5 |`));
    lines.push('');
  } else {
    lines.push('暂未构建用户旅程。', '');
  }
  lines.push('## 七、核心洞察列表', '');
  if (insights.length) {
    insights.forEach((ins, i) => {
      lines.push(`### ${i + 1}. [优先级：${PRIORITY_LABELS[ins.priority]}] [${INSIGHT_CATEGORIES[ins.category]}] ${ins.hmwQuestion || '（待定 HMW）'}`, '');
      lines.push(`- 原始引语：“${ins.quote}”`);
      if (ins.behaviorInsight) lines.push(`- 行为洞察：${ins.behaviorInsight}`);
      if (ins.designRequirement) lines.push(`- 设计需求：${ins.designRequirement}`);
      lines.push('');
    });
  } else {
    lines.push('暂未提取洞察。', '');
  }
  lines.push('## 八、设计机会清单', '');
  const opps = insights.filter((i) => i.designRequirement);
  if (opps.length) {
    opps.forEach((ins, i) => lines.push(`${i + 1}. （${PRIORITY_LABELS[ins.priority]}优先级 · ${INSIGHT_CATEGORIES[ins.category]}）${ins.designRequirement}`));
  } else {
    lines.push('暂无设计机会。');
  }
  lines.push('');
  lines.push('## 九、附录：数据来源链接清单', '');
  if (links.length) {
    links.forEach((r, i) =>
      lines.push(`${i + 1}. [${PLATFORMS[r.platform]}] ${r.sourceUrl}（${fmtDate(r.reviewDate)}，${r.rating} 星）`)
    );
  } else {
    lines.push('无可溯源链接。');
  }
  lines.push('');
  return lines.join('\n');
}

function ReportSection() {
  const { current } = useStore();
  if (!current) return null;
  const reviews = current.reviews;
  const pos = reviews.filter((r) => r.sentiment === 'positive').length;
  const neg = reviews.filter((r) => r.sentiment === 'negative').length;
  const neu = reviews.length - pos - neg;
  const painMap = new Map<string, number>();
  reviews.forEach((r) => r.painPointType && painMap.set(r.painPointType, (painMap.get(r.painPointType) || 0) + 1));
  const painTop = [...painMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const insights = [...current.insights].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.order - b.order
  );
  const stages = [...current.journeyStages].sort((a, b) => a.order - b.order);

  return (
    <div className={`${cardCls} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 inline-flex items-center gap-2">
          <FileText size={17} className="text-primary" /> 报告预览
        </h2>
        <button className={btnPrimary}
          onClick={() => download(`${current.name}-研究报告.md`, buildMarkdown(current), 'text/markdown;charset=utf-8')}>
          <Download size={15} /> 导出 Markdown 报告
        </button>
      </div>

      <div className="space-y-5 text-sm">
        <section>
          <h3 className="font-bold text-gray-900 border-l-4 border-primary pl-2 mb-2">一、项目概览</h3>
          <p className="text-gray-600">目标产品：{current.product} ｜ 创建时间：{fmtDate(current.createdAt)}</p>
          <p className="text-gray-600">研究目标:{current.goal || '—'}</p>
        </section>
        <section>
          <h3 className="font-bold text-gray-900 border-l-4 border-primary pl-2 mb-2">二、数据来源与规模</h3>
          <p className="text-gray-600">
            共 {reviews.length} 条评价（自动采集 {reviews.filter((r) => r.source === 'auto').length} /
            手动录入 {reviews.filter((r) => r.source === 'manual').length}）
          </p>
        </section>
        <section>
          <h3 className="font-bold text-gray-900 border-l-4 border-primary pl-2 mb-2">三、情感分析</h3>
          <p className="text-gray-600">
            <span className="text-green-600 font-medium">正面 {pos}</span> ｜
            <span className="text-red-600 font-medium"> 负面 {neg}</span> ｜
            <span className="text-gray-500 font-medium"> 中性 {neu}</span>
          </p>
        </section>
        <section>
          <h3 className="font-bold text-gray-900 border-l-4 border-primary pl-2 mb-2">四、痛点分析（Top 榜）</h3>
          {painTop.length ? (
            <ol className="list-decimal list-inside space-y-1 text-gray-600">
              {painTop.map(([k, v]) => <li key={k}><span className="font-medium text-red-600">{k}</span>：{v} 条</li>)}
            </ol>
          ) : <p className="text-gray-400">暂无痛点标注</p>}
        </section>
        <section>
          <h3 className="font-bold text-gray-900 border-l-4 border-primary pl-2 mb-2">五、用户画像</h3>
          {current.personas.length ? (
            <div className="space-y-2">
              {current.personas.map((p) => (
                <p key={p.id} className="text-gray-600">
                  <span className="font-medium text-gray-900">{p.name}</span>（{p.demographics}）— 痛点：{p.painPoints.join('、') || '—'}
                </p>
              ))}
            </div>
          ) : <p className="text-gray-400">暂未创建画像</p>}
        </section>
        <section>
          <h3 className="font-bold text-gray-900 border-l-4 border-primary pl-2 mb-2">六、用户旅程</h3>
          {stages.length ? (
            <p className="text-gray-600">
              {stages.map((s) => `${s.name}(${s.emotionScore}/5)`).join(' → ')}
            </p>
          ) : <p className="text-gray-400">暂未构建旅程</p>}
        </section>
        <section>
          <h3 className="font-bold text-gray-900 border-l-4 border-primary pl-2 mb-2">七、核心洞察列表（{insights.length}）</h3>
          {insights.length ? (
            <ol className="list-decimal list-inside space-y-1.5 text-gray-600">
              {insights.map((ins) => (
                <li key={ins.id}>
                  <Badge color={ins.priority === 'high' ? 'red' : ins.priority === 'medium' ? 'amber' : 'gray'}>
                    {PRIORITY_LABELS[ins.priority]}
                  </Badge>{' '}
                  <span className="font-medium">{ins.hmwQuestion || '（待定 HMW）'}</span>
                  {ins.designRequirement && <span className="text-gray-500"> — {ins.designRequirement}</span>}
                </li>
              ))}
            </ol>
          ) : <p className="text-gray-400">暂未提取洞察</p>}
        </section>
        <section>
          <h3 className="font-bold text-gray-900 border-l-4 border-primary pl-2 mb-2">八、附录</h3>
          <p className="text-gray-600">数据来源链接共 {reviews.filter((r) => r.sourceUrl).length} 条，详见导出的 Markdown 报告。</p>
        </section>
      </div>
    </div>
  );
}

/* ---------------- 产品迭代方案 ---------------- */

const EFFORT_LABELS: Record<IterationItem['effort'], string> = { small: '小', medium: '中', large: '大' };
const PHASE_LABELS: Record<IterationItem['phase'], string> = { short: '近期', medium: '中期', long: '远期' };

function buildIterationMarkdown(plan: IterationPlan, project: NonNullable<ReturnType<typeof useStore>['current']>): string {
  const lines: string[] = [];
  lines.push(`# ${project.name} · 产品迭代方案`, '');
  lines.push('## 方案概述', '');
  lines.push(plan.summary || '—', '');
  lines.push('## 核心问题', '');
  if (plan.coreProblems.length) {
    plan.coreProblems.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  } else {
    lines.push('暂无核心问题。');
  }
  lines.push('', '## 迭代建议', '');
  if (plan.items.length) {
    plan.items.forEach((it, i) => {
      lines.push(`${i + 1}. **${it.title}**（${PHASE_LABELS[it.phase]} · 优先级：${PRIORITY_LABELS[it.priority]} · 投入：${EFFORT_LABELS[it.effort]}）`);
      lines.push(`   ${it.description}`);
      lines.push(`   预期价值：${it.impact}`);
      if (it.relatedInsight) lines.push(`   关联洞察：${it.relatedInsight}`);
      lines.push('');
    });
  } else {
    lines.push('暂无迭代建议。');
  }
  lines.push('## 衡量指标', '');
  if (plan.metrics.length) {
    plan.metrics.forEach((m, i) => lines.push(`${i + 1}. ${m}`));
  } else {
    lines.push('暂无衡量指标。');
  }
  lines.push('', `生成时间：${new Date(plan.createdAt).toLocaleString('zh-CN')}`);
  return lines.join('\n');
}

function IterationPlanSection() {
  const { current, updateCurrent } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  if (!current) return null;

  const plan = current.iterationPlan;
  const reviews = current.reviews;
  const insights = current.insights;
  const canGenerate = !!reviews.length && !!insights.length;

  const generatePlan = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError('');
    try {
      const { api } = await import('../lib/api');
      const kwMap = new Map<string, number>();
      reviews.forEach((r) => r.keywords.forEach((k) => kwMap.set(k, (kwMap.get(k) || 0) + 1)));
      const topKw = [...kwMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}(${v})`).join('、');
      const painMap = new Map<string, number>();
      reviews.forEach((r) => r.painPointType && painMap.set(r.painPointType, (painMap.get(r.painPointType) || 0) + 1));
      const topPain = [...painMap.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join('、');
      const summaryText = `评价总数：${reviews.length}\n高频关键词：${topKw}\n痛点分布：${topPain}`;
      const insightInputs = insights.slice(0, 12).map((ins) => ({
        quote: ins.quote,
        behaviorInsight: ins.behaviorInsight,
        designRequirement: ins.designRequirement,
        hmwQuestion: ins.hmwQuestion,
        priority: ins.priority,
      }));
      const draft = await api.iterationPlanDraft(current.product, summaryText, insightInputs);
      updateCurrent((p) => ({
        ...p,
        iterationPlan: {
          summary: draft.summary || '',
          coreProblems: draft.coreProblems || [],
          items: draft.items || [],
          metrics: draft.metrics || [],
          createdAt: new Date().toISOString(),
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${cardCls} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 inline-flex items-center gap-2">
          <Rocket size={17} className="text-primary" /> 产品迭代方案
        </h2>
        <div className="flex items-center gap-2">
          {plan && (
            <button
              className={btnSecondary}
              onClick={() => download(`${current.name}-产品迭代方案.md`, buildIterationMarkdown(plan, current), 'text/markdown;charset=utf-8')}
            >
              <Download size={15} /> 导出方案
            </button>
          )}
          <button
            className={btnPrimary}
            disabled={!canGenerate || loading}
            onClick={generatePlan}
            title={canGenerate ? '基于当前评价和洞察生成迭代方案' : '需要先有评价和洞察数据'}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? '生成中…' : plan ? '重新生成方案' : 'AI 生成迭代方案'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!plan ? (
        <div className="text-center py-10 text-gray-400">
          <Rocket size={40} className="mx-auto mb-3 text-gray-300" />
          <p>暂无迭代方案</p>
          <p className="text-xs mt-1">点击右上角按钮，基于当前评价和洞察自动生成</p>
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="font-bold text-gray-900 border-l-4 border-primary pl-2 mb-2">方案概述</h3>
            <p className="text-sm text-gray-600">{plan.summary || '—'}</p>
          </section>
          <section>
            <h3 className="font-bold text-gray-900 border-l-4 border-primary pl-2 mb-2">核心问题</h3>
            {plan.coreProblems.length ? (
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                {plan.coreProblems.map((p, i) => <li key={i}>{p}</li>)}
              </ol>
            ) : <p className="text-sm text-gray-400">暂无核心问题</p>}
          </section>
          <section>
            <h3 className="font-bold text-gray-900 border-l-4 border-primary pl-2 mb-2">
              迭代建议（{plan.items.length} 条）
            </h3>
            {plan.items.length ? (
              <div className="space-y-3">
                {plan.items.map((it, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-100 p-4 hover:border-primary/30 transition-colors">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-semibold text-gray-900">{it.title}</span>
                      <Badge color={it.priority === 'high' ? 'red' : it.priority === 'medium' ? 'amber' : 'gray'}>
                        {PRIORITY_LABELS[it.priority]}优先级
                      </Badge>
                      <Badge color="blue">{PHASE_LABELS[it.phase]}</Badge>
                      <Badge color="gray">投入 {EFFORT_LABELS[it.effort]}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-1.5">{it.description}</p>
                    <p className="text-xs text-gray-500">预期价值：{it.impact}</p>
                    {it.relatedInsight && <p className="text-xs text-primary mt-1.5">关联洞察：{it.relatedInsight}</p>}
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-400">暂无迭代建议</p>}
          </section>
          <section>
            <h3 className="font-bold text-gray-900 border-l-4 border-primary pl-2 mb-2">衡量指标</h3>
            {plan.metrics.length ? (
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                {plan.metrics.map((m, i) => <li key={i}>{m}</li>)}
              </ol>
            ) : <p className="text-sm text-gray-400">暂无衡量指标</p>}
          </section>
        </div>
      )}
    </div>
  );
}
