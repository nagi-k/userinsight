import React, { useMemo } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ComposedChart, Line, Area,
} from 'recharts';
import { useStore } from '../store';
import {
  PLATFORMS, SENTIMENT_LABELS, SENTIMENT_COLORS, CHART_COLORS, PAIN_TYPES,
} from '../lib/utils';
import { EmptyState, cardCls, btnSecondary } from '../components/ui';
import { MessageSquare, Star, ThumbsUp, AlertCircle } from 'lucide-react';

export default function Analytics() {
  const { current } = useStore();
  const reviews = useMemo(() => current?.reviews || [], [current]);

  // 词云数据：关键词词频 + 情感倾向
  const wordCloud = useMemo(() => {
    const map = new Map<string, { count: number; pos: number; neg: number; neu: number }>();
    reviews.forEach((r) => {
      r.keywords.forEach((k) => {
        const entry = map.get(k) || { count: 0, pos: 0, neg: 0, neu: 0 };
        entry.count++;
        if (r.sentiment === 'positive') entry.pos++;
        else if (r.sentiment === 'negative') entry.neg++;
        else entry.neu++;
        map.set(k, entry);
      });
    });
    return [...map.entries()]
      .map(([word, v]) => ({ word, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 36);
  }, [reviews]);

  const sentimentData = useMemo(() => {
    const counts = { positive: 0, negative: 0, neutral: 0 };
    reviews.forEach((r) => counts[r.sentiment]++);
    return (Object.keys(counts) as (keyof typeof counts)[])
      .map((k) => ({ name: SENTIMENT_LABELS[k], value: counts[k], color: SENTIMENT_COLORS[k] }))
      .filter((d) => d.value > 0);
  }, [reviews]);

  const painData = useMemo(() => {
    const counts = new Map<string, number>();
    reviews.forEach((r) => {
      if (r.painPointType) counts.set(r.painPointType, (counts.get(r.painPointType) || 0) + 1);
    });
    return PAIN_TYPES.map((t) => ({ name: t, 数量: counts.get(t) || 0 })).filter((d) => d.数量 > 0);
  }, [reviews]);

  const platformData = useMemo(() => {
    const map = new Map<string, { count: number; ratingSum: number }>();
    reviews.forEach((r) => {
      const e = map.get(r.platform) || { count: 0, ratingSum: 0 };
      e.count++;
      e.ratingSum += r.rating;
      map.set(r.platform, e);
    });
    return [...map.entries()]
      .map(([k, v]) => ({
        name: PLATFORMS[k as keyof typeof PLATFORMS] || k,
        评价数量: v.count,
        平均评分: +(v.ratingSum / v.count).toFixed(2),
      }))
      .sort((a, b) => b.评价数量 - a.评价数量);
  }, [reviews]);

  const trendData = useMemo(() => {
    const map = new Map<string, { pos: number; neg: number; neu: number; ratingSum: number; count: number }>();
    reviews.forEach((r) => {
      if (!r.reviewDate || r.reviewDate.length < 7) return;
      const month = r.reviewDate.slice(0, 7);
      const e = map.get(month) || { pos: 0, neg: 0, neu: 0, ratingSum: 0, count: 0 };
      if (r.sentiment === 'positive') e.pos++;
      else if (r.sentiment === 'negative') e.neg++;
      else e.neu++;
      e.ratingSum += r.rating;
      e.count++;
      map.set(month, e);
    });
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, e]) => ({
        month,
        正面: e.pos,
        负面: e.neg,
        中性: e.neu,
        平均评分: +(e.ratingSum / e.count).toFixed(2),
      }));
  }, [reviews]);

  const stats = useMemo(() => {
    const total = reviews.length;
    const avgRating = total ? +(reviews.reduce((s, r) => s + r.rating, 0) / total).toFixed(1) : 0;
    const positive = total ? Math.round((reviews.filter((r) => r.sentiment === 'positive').length / total) * 100) : 0;
    const painCount = reviews.filter((r) => r.painPointType).length;
    return { total, avgRating, positive, painCount };
  }, [reviews]);

  if (!current) return null;

  if (!reviews.length) {
    return (
      <div className="max-w-6xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-4">分析看板</h1>
        <EmptyState
          title="暂无数据可分析"
          desc="先通过「智能采集」或手动录入积累评价数据，分析看板会基于当前项目真实数据实时计算"
          action={<a href="#/collect" className={btnSecondary}>前往智能采集</a>}
        />
      </div>
    );
  }

  const maxCount = wordCloud[0]?.count || 1;
  const wordStyles = [
    'text-indigo-600 bg-indigo-50/70 border-indigo-100',
    'text-violet-600 bg-violet-50/70 border-violet-100',
    'text-sky-600 bg-sky-50/70 border-sky-100',
    'text-amber-600 bg-amber-50/70 border-amber-100',
    'text-slate-600 bg-slate-100 border-slate-200',
  ];
  const wordColor = (w: { pos: number; neg: number; neu: number }) => {
    if (w.pos > w.neg && w.pos > w.neu) return 0;
    if (w.neg > w.pos && w.neg > w.neu) return 3;
    if (w.neu > w.pos && w.neu > w.neg) return 4;
    return 1;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">分析看板</h1>
          <p className="text-sm text-slate-500 mt-0.5">基于当前项目 {reviews.length} 条评价实时计算</p>
        </div>
        <a href="#/collect" className={btnSecondary}>补充数据</a>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<MessageSquare size={18} />} label="评价总数" value={stats.total} gradient="from-indigo-500 to-violet-500" />
        <StatCard icon={<Star size={18} />} label="平均评分" value={stats.avgRating} suffix="/5" gradient="from-amber-400 to-orange-500" />
        <StatCard icon={<ThumbsUp size={18} />} label="正面占比" value={`${stats.positive}%`} gradient="from-sky-400 to-indigo-500" />
        <StatCard icon={<AlertCircle size={18} />} label="痛点标注" value={stats.painCount} gradient="from-violet-400 to-fuchsia-500" />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* 词云 */}
        <div className={`${cardCls} p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">高频关键词</h2>
            <span className="text-xs text-slate-400">词频越大字号越大</span>
          </div>
          {wordCloud.length ? (
            <div className="flex flex-wrap items-center justify-center gap-3 py-5 min-h-[200px]">
              {wordCloud.map((w) => {
                const styleIdx = wordColor(w);
                const scale = 0.7 + (w.count / maxCount) * 0.55;
                return (
                  <span
                    key={w.word}
                    className={`px-2.5 py-1 rounded-full border font-medium transition-transform hover:scale-105 cursor-default ${wordStyles[styleIdx]}`}
                    style={{ fontSize: `${Math.max(0.7, Math.min(1.1, scale))}rem` }}
                    title={`${w.word}：${w.count} 次（正面 ${w.pos} / 负面 ${w.neg} / 中性 ${w.neu}）`}
                  >
                    {w.word}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-12 text-center">评价暂无关键词，可在评价详情中补充</p>
          )}
          <div className="flex items-center justify-center gap-4 mt-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" />正面语境</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />负面语境</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400" />中性语境</span>
          </div>
        </div>

        {/* 情感分析饼图 */}
        <div className={`${cardCls} p-6`}>
          <h2 className="font-semibold text-slate-900 mb-4">情感分布</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={sentimentData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={4}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {sentimentData.map((d) => <Cell key={d.name} fill={d.color} stroke="none" />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }} />
              <Legend verticalAlign="bottom" height={28} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 痛点分布 */}
        <div className={`${cardCls} p-6`}>
          <h2 className="font-semibold text-slate-900 mb-4">痛点分布</h2>
          {painData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={painData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="painGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }} />
                <Bar dataKey="数量" fill="url(#painGradient)" radius={[8, 8, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 py-12 text-center">暂无痛点类型标注，可在评价库中补充</p>
          )}
        </div>

        {/* 平台对比 */}
        <div className={`${cardCls} p-6`}>
          <h2 className="font-semibold text-slate-900 mb-4">平台对比</h2>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={platformData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="platformBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }} />
              <Legend height={28} />
              <Bar yAxisId="left" dataKey="评价数量" fill="url(#platformBar)" radius={[8, 8, 0, 0]} maxBarSize={40} />
              <Line yAxisId="right" dataKey="平均评分" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 时间趋势 */}
      <div className={`${cardCls} p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">情感时间趋势</h2>
          <span className="text-xs text-slate-400">按评价原始发布时间聚合</span>
        </div>
        {trendData.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={trendData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="posGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="negGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="neuGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }} />
              <Legend height={28} />
              <Area yAxisId="left" type="monotone" dataKey="正面" stackId="s" stroke="#6366f1" fill="url(#posGradient)" strokeWidth={2} />
              <Area yAxisId="left" type="monotone" dataKey="中性" stackId="s" stroke="#94a3b8" fill="url(#neuGradient)" strokeWidth={2} />
              <Area yAxisId="left" type="monotone" dataKey="负面" stackId="s" stroke="#f59e0b" fill="url(#negGradient)" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="平均评分" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-slate-400 py-14 text-center">暂无带原始发布时间的评价，无原始时间的数据不参与该图</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, suffix = '', gradient }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  suffix?: string;
  gradient: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={`shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-md`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">
          {value}<span className="text-sm font-medium text-slate-400 ml-0.5">{suffix}</span>
        </p>
      </div>
    </div>
  );
}
