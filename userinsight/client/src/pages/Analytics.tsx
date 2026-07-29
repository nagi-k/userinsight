import React, { useMemo } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ComposedChart, Line,
} from 'recharts';
import { useStore } from '../store';
import {
  PLATFORMS, SENTIMENT_LABELS, SENTIMENT_COLORS, CHART_COLORS, PAIN_TYPES,
} from '../lib/utils';
import { EmptyState, cardCls, btnSecondary } from '../components/ui';

export default function Analytics() {
  const { current } = useStore();
  const reviews = useMemo(() => current?.reviews || [], [current]);

  // 词云数据：关键词词频 + 情感倾向（正面绿 / 负面红 / 中性灰）
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
      .slice(0, 40);
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

  // 时间趋势：仅使用带评价原始发布时间的数据，按月聚合
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
  const wordColor = (w: { pos: number; neg: number }) =>
    w.pos > w.neg ? '#16a34a' : w.neg > w.pos ? '#dc2626' : '#6b7280';

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">分析看板</h1>
        <p className="text-sm text-gray-500 mt-0.5">基于当前项目 {reviews.length} 条评价实时计算</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* 词云 */}
        <div className={`${cardCls} p-5`}>
          <h2 className="font-semibold text-gray-900 mb-3">高频关键词</h2>
          {wordCloud.length ? (
            <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2 py-4 min-h-[180px]">
              {wordCloud.map((w) => (
                <span
                  key={w.word}
                  className="word-cloud-item font-medium"
                  style={{ fontSize: `${13 + (w.count / maxCount) * 22}px`, color: wordColor(w) }}
                  title={`${w.word}：${w.count} 次（正面 ${w.pos} / 负面 ${w.neg} / 中性 ${w.neu}）`}
                >
                  {w.word}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-10 text-center">评价暂无关键词，可在评价详情中补充</p>
          )}
          <p className="text-xs text-gray-400 text-center">绿色=正面语境 · 红色=负面语境 · 灰色=中性</p>
        </div>

        {/* 情感分析饼图 */}
        <div className={`${cardCls} p-5`}>
          <h2 className="font-semibold text-gray-900 mb-3">情感分析</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {sentimentData.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 痛点分布 */}
        <div className={`${cardCls} p-5`}>
          <h2 className="font-semibold text-gray-900 mb-3">痛点分布</h2>
          {painData.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={painData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="数量" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 py-10 text-center">暂无痛点类型标注，可在评价库中补充</p>
          )}
        </div>

        {/* 平台对比 */}
        <div className={`${cardCls} p-5`}>
          <h2 className="font-semibold text-gray-900 mb-3">平台对比（数量与平均评分）</h2>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={platformData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="评价数量" fill="#1e40af" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Line yAxisId="right" dataKey="平均评分" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 时间趋势 */}
      <div className={`${cardCls} p-5`}>
        <h2 className="font-semibold text-gray-900 mb-3">情感时间趋势（按评价原始发布时间）</h2>
        {trendData.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="正面" stackId="s" fill="#16a34a" maxBarSize={42} />
              <Bar yAxisId="left" dataKey="中性" stackId="s" fill="#9ca3af" maxBarSize={42} />
              <Bar yAxisId="left" dataKey="负面" stackId="s" fill="#dc2626" maxBarSize={42} />
              <Line yAxisId="right" dataKey="平均评分" stroke="#1e40af" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400 py-10 text-center">暂无带原始发布时间的评价，无原始时间的数据不参与该图</p>
        )}
      </div>
    </div>
  );
}
