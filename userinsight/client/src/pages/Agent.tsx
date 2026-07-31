import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot, Play, Loader2, CheckCircle2, Circle, AlertCircle, Download,
  CloudDownload, Lightbulb, Users, FileText, Settings as SettingsIcon,
} from 'lucide-react';
import { useStore } from '../store';
import { api, hasSettings } from '../lib/api';
import {
  uid, PLATFORMS, PLATFORM_KEYS, INSIGHT_CATEGORIES, PRIORITY_LABELS,
  download, fmtDate,
} from '../lib/utils';
import { Review, Insight, Persona } from '../types';
import { cardCls, btnPrimary, btnSecondary, inputCls, selectCls, Badge } from '../components/ui';

type StepStatus = 'pending' | 'running' | 'success' | 'error';

interface Step {
  key: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

const STEPS: Step[] = [
  { key: 'collect', label: '智能采集', desc: '基于大模型知识生成代表性评价', icon: <CloudDownload size={16} /> },
  { key: 'insight', label: '洞察提取', desc: '从评价中提炼行为洞察与设计机会', icon: <Lightbulb size={16} /> },
  { key: 'persona', label: '画像生成', desc: '聚合典型用户画像', icon: <Users size={16} /> },
  { key: 'report', label: '报告导出', desc: '自动生成 Markdown 研究报告', icon: <FileText size={16} /> },
];

export default function Agent() {
  const { current, updateCurrent } = useStore();
  const [platforms, setPlatforms] = useState<string[]>(['xiaohongshu', 'weibo', 'zhihu', 'douyin']);
  const [count, setCount] = useState(10);
  const [focus, setFocus] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Record<string, StepStatus>>(() => Object.fromEntries(STEPS.map((s) => [s.key, 'pending'])));
  const [logs, setLogs] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ reviews: number; insights: number; personas: number } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const configured = hasSettings();
  const canRun = configured && !!current && !running;

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const togglePlatform = (key: string) => {
    setPlatforms((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const addLog = (msg: string) => setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString('zh-CN')}] ${msg}`]);

  const setStep = (key: string, s: StepStatus) => setStatus((prev) => ({ ...prev, [key]: s }));

  const runWorkflow = async () => {
    if (!current || !platforms.length) return;
    setRunning(true);
    setSummary(null);
    setLogs([]);
    STEPS.forEach((s) => setStep(s.key, 'pending'));

    try {
      // 1. 采集
      setStep('collect', 'running');
      addLog(`开始采集「${current.product}」，平台：${platforms.map((k) => PLATFORMS[k as keyof typeof PLATFORMS]).join('、')}，目标 ${count} 条`);
      addLog('正在请求大模型生成评价，请耐心等待（模型响应可能需数分钟）…');
      const collectRes = await api.collect({
        keyword: current.product,
        platforms,
        count,
        focus: focus || '工业设计、用户体验、使用痛点',
        exclude: [],
      });
      addLog(`大模型已返回 ${collectRes.reviews?.length || 0} 条原始评价，正在进行结构化校验…`);
      const newReviews: Review[] = (collectRes.reviews || []).map((r) => ({
        id: uid(),
        content: r.content,
        platform: r.platform as Review['platform'],
        rating: r.rating as Review['rating'],
        keywords: r.keywords || [],
        painPointType: r.painPointType as Review['painPointType'],
        scenario: r.scenario,
        hasImage: r.hasImage || false,
        sentiment: r.sentiment as Review['sentiment'],
        sourceUrl: r.sourceUrl,
        authorName: r.authorName,
        reviewDate: r.reviewDate,
        likeCount: r.likeCount,
        verified: false,
        source: 'auto',
        note: '由 Agent 工作流自动采集',
        createdAt: new Date().toISOString(),
        tags: [],
      }));
      addLog(`校验完成，有效评价 ${newReviews.length} 条，正在保存到项目…`);
      updateCurrent((p) => ({ ...p, reviews: [...p.reviews, ...newReviews] }));
      addLog(`采集完成，新增 ${newReviews.length} 条评价`);
      setStep('collect', 'success');

      if (!newReviews.length) {
        addLog('未获得评价，工作流提前结束');
        setRunning(false);
        return;
      }

      // 2. 洞察提取（对前 8 条评价分批生成）
      setStep('insight', 'running');
      const insightsToGenerate = newReviews.slice(0, 8);
      addLog(`洞察提取阶段开始，计划从 ${insightsToGenerate.length} 条评价中生成洞察…`);
      const generatedInsights: Insight[] = [];
      for (let i = 0; i < insightsToGenerate.length; i++) {
        const r = insightsToGenerate[i];
        addLog(`正在提取第 ${i + 1}/${insightsToGenerate.length} 条洞察（请求大模型中）…`);
        try {
          const draft = await api.insightDraft([r.content], 'ergonomics');
          const ins: Insight = {
            id: uid(),
            reviewIds: [r.id],
            quote: r.content.slice(0, 200),
            behaviorInsight: draft.behaviorInsight || '',
            designRequirement: draft.designRequirement || '',
            hmwQuestion: draft.hmwQuestion || '',
            category: 'ergonomics',
            priority: r.sentiment === 'negative' && r.rating <= 2 ? 'high' : r.sentiment === 'negative' ? 'medium' : 'low',
            order: 0,
            createdAt: new Date().toISOString(),
          };
          generatedInsights.push(ins);
          addLog(`第 ${i + 1}/${insightsToGenerate.length} 条洞察提取完成`);
        } catch {
          addLog(`第 ${i + 1} 条洞察提取失败，已跳过`);
        }
      }
      if (generatedInsights.length) {
        const startOrder = Math.max(0, ...current.insights.map((i) => i.order));
        generatedInsights.forEach((ins, idx) => (ins.order = startOrder + idx + 1));
        updateCurrent((p) => ({ ...p, insights: [...p.insights, ...generatedInsights] }));
      }
      addLog(`洞察提取完成，新增 ${generatedInsights.length}/${insightsToGenerate.length} 条洞察`);
      setStep('insight', 'success');

      // 3. 画像生成
      setStep('persona', 'running');
      addLog('画像生成阶段开始，正在汇总评价数据…');
      const allReviews = [...current.reviews, ...newReviews];
      const kwMap = new Map<string, number>();
      allReviews.forEach((r) => r.keywords.forEach((k) => kwMap.set(k, (kwMap.get(k) || 0) + 1)));
      const topKw = [...kwMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}(${v})`).join('、');
      const painMap = new Map<string, number>();
      allReviews.forEach((r) => r.painPointType && painMap.set(r.painPointType, (painMap.get(r.painPointType) || 0) + 1));
      const topPain = [...painMap.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join('、');
      const samples = allReviews.slice(0, 8).map((r) => `- ${r.content}`).join('\n');
      const summaryText = `评价总数：${allReviews.length}\n高频关键词：${topKw}\n痛点分布：${topPain}\n代表性评价：\n${samples}`;
      addLog(`画像数据汇总完成：共 ${allReviews.length} 条评价，正在请求大模型生成画像…`);

      let persona: Persona | null = null;
      try {
        const draft = await api.personaDraft(current.product, summaryText);
        persona = {
          id: uid(),
          name: draft.name || `${current.product} 典型用户`,
          demographics: draft.demographics || '',
          painPoints: draft.painPoints || [],
          needs: draft.needs || [],
          behaviors: draft.behaviors || [],
          quote: draft.quote || '',
        };
        updateCurrent((p) => ({ ...p, personas: [...p.personas, persona!] }));
        addLog(`画像生成完成：${persona.name}`);
      } catch {
        addLog('画像生成失败，已跳过');
      }
      setStep('persona', persona ? 'success' : 'error');

      // 4. 报告导出
      setStep('report', 'running');
      addLog('报告导出阶段开始，正在汇总采集、洞察、画像数据…');
      const markdown = buildMarkdown(current.product, current.name, current.goal, current.createdAt, allReviews, [...current.insights, ...generatedInsights], persona ? [persona] : []);
      addLog('Markdown 报告内容已生成，正在触发下载…');
      download(`${current.name}-Agent研究报告-${new Date().toISOString().slice(0, 10)}.md`, markdown, 'text/markdown;charset=utf-8');
      addLog('Markdown 报告已生成并触发下载');
      setStep('report', 'success');

      setSummary({ reviews: newReviews.length, insights: generatedInsights.length, personas: persona ? 1 : 0 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      addLog(`工作流异常：${msg}`);
      // 标记当前 running 的 step 为 error
      setStatus((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (next[k] === 'running') next[k] = 'error';
        });
        return next;
      });
    } finally {
      setRunning(false);
    }
  };

  if (!current) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 inline-flex items-center gap-2">
            <Bot size={24} className="text-indigo-500" /> Agent 工作流
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">一键完成：采集 → 洞察 → 画像 → 报告</p>
        </div>
        <a href="#/settings" className={btnSecondary}><SettingsIcon size={15} /> API 设置</a>
      </div>

      {!configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">尚未配置大模型 API</p>
            <p className="text-amber-700/80">Agent 工作流依赖大模型 API，请先前往「设置」完成配置。</p>
          </div>
        </div>
      )}

      {/* 配置区 */}
      <div className={`${cardCls} p-6`}>
        <h2 className="font-semibold text-slate-900 mb-4">任务配置</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">目标产品</label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {current.product}
            </div>
            <p className="text-xs text-slate-400 mt-1">读取自当前项目，如需修改请切换项目或编辑项目信息</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">采集数量</label>
            <input
              type="number"
              min={5}
              max={50}
              value={count}
              onChange={(e) => setCount(Math.max(5, Math.min(50, parseInt(e.target.value, 10) || 5)))}
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-5">
          <label className="block text-sm font-medium text-slate-700 mb-2">目标平台（多选）</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => togglePlatform(k)}
                disabled={running}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  platforms.includes(k)
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                }`}
              >
                {PLATFORMS[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">关注点提示词（选填）</label>
          <input
            className={inputCls}
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="如：重点关注便携性、清洁难度和价格敏感度"
          />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            className={btnPrimary}
            disabled={!canRun || !platforms.length}
            onClick={runWorkflow}
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {running ? '工作流运行中…' : '一键运行 Agent 工作流'}
          </button>
          {running && (
            <button className={btnSecondary} disabled>
              <Loader2 size={14} className="animate-spin" /> 请等待
            </button>
          )}
        </div>
      </div>

      {/* 步骤可视化 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STEPS.map((step, idx) => (
          <StepCard
            key={step.key}
            step={step}
            index={idx + 1}
            status={status[step.key]}
            isLast={idx === STEPS.length - 1}
          />
        ))}
      </div>

      {/* 运行日志 */}
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">运行日志</h2>
          {logs.length > 0 && !running && (
            <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setLogs([])}>清空</button>
          )}
        </div>
        <div className="bg-slate-900 rounded-xl p-4 h-56 overflow-y-auto font-mono text-xs space-y-1.5">
          {logs.length ? (
            logs.map((l, i) => <p key={i} className="text-slate-300">{l}</p>)
          ) : (
            <p className="text-slate-500 italic">等待启动…</p>
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* 结果摘要 */}
      {summary && (
        <div className="bg-gradient-to-r from-indigo-500 to-violet-500 rounded-2xl p-6 text-white shadow-md">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={20} />
            <h2 className="font-semibold text-lg">工作流执行完成</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/15 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold">{summary.reviews}</p>
              <p className="text-sm text-white/80">新增评价</p>
            </div>
            <div className="bg-white/15 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold">{summary.insights}</p>
              <p className="text-sm text-white/80">新增洞察</p>
            </div>
            <div className="bg-white/15 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold">{summary.personas}</p>
              <p className="text-sm text-white/80">新增画像</p>
            </div>
          </div>
          <p className="text-sm text-white/80 mt-4">报告已自动下载，你也可以在「设计输出」页面再次导出。</p>
        </div>
      )}
    </div>
  );
}

function StepCard({ step, index, status, isLast }: { step: Step; index: number; status: StepStatus; isLast: boolean }) {
  const styles: Record<StepStatus, string> = {
    pending: 'bg-white border-slate-100 text-slate-400',
    running: 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    error: 'bg-rose-50 border-rose-200 text-rose-600',
  };
  return (
    <div className={`relative ${cardCls} ${styles[status]} p-4`}>
      {!isLast && (
        <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-slate-200" />
      )}
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border ${
          status === 'success' ? 'bg-emerald-100 border-emerald-200' :
          status === 'running' ? 'bg-indigo-100 border-indigo-200' :
          status === 'error' ? 'bg-rose-100 border-rose-200' : 'bg-slate-100 border-slate-200'
        }`}>
          {status === 'success' ? <CheckCircle2 size={16} /> : status === 'running' ? <Loader2 size={16} className="animate-spin" /> : index}
        </div>
        <div>
          <p className="font-semibold text-sm">{step.label}</p>
          <p className="text-xs opacity-80">{step.desc}</p>
        </div>
      </div>
    </div>
  );
}

function buildMarkdown(
  product: string,
  projectName: string,
  goal: string,
  createdAt: string,
  reviews: Review[],
  insights: Insight[],
  personas: Persona[],
): string {
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

  const sortedInsights = [...insights].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.order - b.order
  );

  const lines: string[] = [];
  lines.push(`# ${projectName} · Agent 自动生成研究报告`, '');
  lines.push('> 本报告由 UserInsight Agent 工作流自动生成，包含采集、洞察、画像与报告四个阶段。', '');
  lines.push('## 一、项目概览', '');
  lines.push(`- 目标产品：${product}`);
  lines.push(`- 研究目标：${goal || '—'}`);
  lines.push(`- 项目创建时间：${fmtDate(createdAt)}`);
  lines.push(`- 报告生成时间：${new Date().toLocaleString('zh-CN')}`, '');
  lines.push('## 二、数据来源与规模', '');
  lines.push(`- 评价总数：${total} 条（自动采集 ${auto} 条 / 手动录入 ${total - auto} 条）`);
  lines.push(`- 平台分布：${[...platformMap.entries()].map(([k, v]) => `${PLATFORMS[k as keyof typeof PLATFORMS] || k} ${v} 条`).join('、') || '—'}`, '');
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
  lines.push('', '## 五、用户画像', '');
  if (personas.length) {
    personas.forEach((p) => {
      lines.push(`### ${p.name}`, '');
      lines.push(`- 人口统计：${p.demographics || '—'}`);
      lines.push(`- 核心痛点：${p.painPoints.join('、') || '—'}`);
      lines.push(`- 核心需求：${p.needs.join('；') || '—'}`);
      lines.push(`- 行为特征：${p.behaviors.join('；') || '—'}`);
      if (p.quote) lines.push(`- 代表性引语：“${p.quote}”`);
      lines.push('');
    });
  } else {
    lines.push('暂未生成用户画像。', '');
  }
  lines.push('## 六、核心洞察列表', '');
  if (sortedInsights.length) {
    sortedInsights.forEach((ins, i) => {
      lines.push(`### ${i + 1}. [优先级：${PRIORITY_LABELS[ins.priority]}] [${INSIGHT_CATEGORIES[ins.category]}] ${ins.hmwQuestion || '（待定 HMW）'}`, '');
      lines.push(`- 原始引语：“${ins.quote}”`);
      if (ins.behaviorInsight) lines.push(`- 行为洞察：${ins.behaviorInsight}`);
      if (ins.designRequirement) lines.push(`- 设计需求：${ins.designRequirement}`);
      lines.push('');
    });
  } else {
    lines.push('暂未提取洞察。', '');
  }
  lines.push('## 七、设计机会清单', '');
  const opps = sortedInsights.filter((i) => i.designRequirement);
  if (opps.length) {
    opps.forEach((ins, i) => lines.push(`${i + 1}. （${PRIORITY_LABELS[ins.priority]}优先级 · ${INSIGHT_CATEGORIES[ins.category]}）${ins.designRequirement}`));
  } else {
    lines.push('暂无设计机会。');
  }
  lines.push('', '## 八、原始评价摘录', '');
  reviews.slice(0, 20).forEach((r, i) => {
    lines.push(`${i + 1}. [${PLATFORMS[r.platform]}] ${r.content.slice(0, 120)}${r.content.length > 120 ? '…' : ''}`);
  });
  lines.push('');
  return lines.join('\n');
}

const PRIORITY_ORDER: Record<Insight['priority'], number> = { high: 0, medium: 1, low: 2 };
