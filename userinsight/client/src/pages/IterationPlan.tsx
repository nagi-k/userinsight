import React, { useMemo, useState } from 'react';
import {
  Rocket, Sparkles, Download, Plus, Trash2, Check, X, Edit2, Loader2,
  ChevronDown, ChevronUp, Save, Copy,
} from 'lucide-react';
import { useStore } from '../store';
import { IterationPlan as IterationPlanType, IterationItem } from '../types';
import {
  uid, download, fmtDate,
} from '../lib/utils';
import { Badge, inputCls, btnPrimary, btnSecondary, cardCls } from '../components/ui';

const PRIORITY_ORDER: Record<IterationItem['priority'], number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABELS: Record<IterationItem['priority'], string> = { high: '高', medium: '中', low: '低' };
const EFFORT_LABELS: Record<IterationItem['effort'], string> = { small: '小', medium: '中', large: '大' };
const PHASE_LABELS: Record<IterationItem['phase'], string> = { short: '近期', medium: '中期', long: '远期' };

export default function IterationPlanPage() {
  const { current } = useStore();
  if (!current) {
    return (
      <div className="max-w-7xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900">产品迭代方案</h1>
        <p className="text-sm text-gray-500 mt-2">请先创建或选择一个项目</p>
      </div>
    );
  }
  return <IterationPlanWorkspace />;
}

function IterationPlanWorkspace() {
  const { current, updateCurrent } = useStore();
  const plans = current!.iterationPlans || [];
  const [activePlanId, setActivePlanId] = useState<string | null>(plans.find((p) => p.isActive)?.id || plans[0]?.id || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 筛选
  const [priorityFilter, setPriorityFilter] = useState<IterationItem['priority'] | 'all'>('all');
  const [phaseFilter, setPhaseFilter] = useState<IterationItem['phase'] | 'all'>('all');
  const [hideDone, setHideDone] = useState(false);

  const activePlan = useMemo(
    () => plans.find((p) => p.id === activePlanId) || plans[0] || null,
    [plans, activePlanId]
  );

  const updateActivePlan = (fn: (plan: IterationPlanType) => IterationPlanType) => {
    if (!activePlan) return;
    updateCurrent((p) => ({
      ...p,
      iterationPlans: p.iterationPlans.map((plan) => (plan.id === activePlan.id ? fn(plan) : plan)),
    }));
  };

  const generatePlan = async () => {
    if (!current) return;
    const reviews = current.reviews;
    const insights = current.insights;
    if (!reviews.length || !insights.length) return;
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
      const newPlan: IterationPlanType = {
        id: uid(),
        name: `迭代方案 v${plans.length + 1}`,
        summary: draft.summary || '',
        coreProblems: draft.coreProblems || [],
        items: (draft.items || []).map((it) => ({ ...it, id: uid(), done: false })),
        metrics: draft.metrics || [],
        createdAt: new Date().toISOString(),
        isActive: true,
      };
      updateCurrent((p) => ({
        ...p,
        iterationPlans: [...p.iterationPlans.map((pl) => ({ ...pl, isActive: false })), newPlan],
      }));
      setActivePlanId(newPlan.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const deletePlan = (id: string) => {
    if (!confirm('确定删除该迭代方案？')) return;
    updateCurrent((p) => {
      const remaining = p.iterationPlans.filter((pl) => pl.id !== id);
      if (remaining.length && !remaining.some((pl) => pl.isActive)) {
        remaining[0].isActive = true;
      }
      return { ...p, iterationPlans: remaining };
    });
  };

  const duplicatePlan = (plan: IterationPlanType) => {
    const copy: IterationPlanType = {
      ...plan,
      id: uid(),
      name: `${plan.name} 副本`,
      createdAt: new Date().toISOString(),
      isActive: true,
      items: plan.items.map((it) => ({ ...it, id: uid(), done: false })),
    };
    updateCurrent((p) => ({
      ...p,
      iterationPlans: [...p.iterationPlans.map((pl) => ({ ...pl, isActive: false })), copy],
    }));
    setActivePlanId(copy.id);
  };

  const exportPlan = (plan: IterationPlanType) => {
    const lines: string[] = [];
    lines.push(`# ${current!.name} · ${plan.name}`, '');
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
        lines.push(`${i + 1}. **${it.title}**（${PHASE_LABELS[it.phase]} · 优先级：${PRIORITY_LABELS[it.priority]} · 投入：${EFFORT_LABELS[it.effort]}）${it.done ? '【已完成】' : ''}`);
        lines.push(`   ${it.description}`);
        lines.push(`   预期价值：${it.impact}`);
        if (it.relatedInsight) lines.push(`   关联洞察：${it.relatedInsight}`);
        if (it.note) lines.push(`   备注：${it.note}`);
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
    lines.push('', `生成时间：${fmtDate(plan.createdAt)}`);
    download(`${current!.name}-${plan.name}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  };

  const filteredItems = useMemo(() => {
    if (!activePlan) return [];
    return activePlan.items.filter((it) => {
      if (priorityFilter !== 'all' && it.priority !== priorityFilter) return false;
      if (phaseFilter !== 'all' && it.phase !== phaseFilter) return false;
      if (hideDone && it.done) return false;
      return true;
    });
  }, [activePlan, priorityFilter, phaseFilter, hideDone]);

  const completionRate = useMemo(() => {
    if (!activePlan || !activePlan.items.length) return 0;
    return Math.round((activePlan.items.filter((it) => it.done).length / activePlan.items.length) * 100);
  }, [activePlan]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <Rocket size={20} className="text-primary" /> 产品迭代方案
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">基于研究洞察输出可落地的产品迭代计划</p>
        </div>
        <div className="flex items-center gap-2">
          {activePlan && (
            <button className={btnSecondary} onClick={() => exportPlan(activePlan)}>
              <Download size={15} /> 导出当前方案
            </button>
          )}
          <button
            className={btnPrimary}
            disabled={loading || !current!.reviews.length || !current!.insights.length}
            onClick={generatePlan}
            title={current!.reviews.length && current!.insights.length ? '基于当前评价和洞察生成迭代方案' : '需要先有评价和洞察数据'}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? '生成中…' : activePlan ? '重新生成方案' : 'AI 生成迭代方案'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {!plans.length ? (
        <div className={`${cardCls} p-10 text-center text-gray-400`}>
          <Rocket size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-base font-medium text-gray-600">暂无迭代方案</p>
          <p className="text-sm mt-1">点击右上角按钮，基于当前评价和洞察自动生成</p>
        </div>
      ) : (
        <>
          {/* 版本标签 */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap transition-colors ${
                  activePlan?.id === plan.id ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                onClick={() => setActivePlanId(plan.id)}
              >
                {plan.name}
                <button
                  className={`opacity-0 group-hover:opacity-100 transition-opacity ${activePlan?.id === plan.id ? 'text-white/80 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                  onClick={(e) => { e.stopPropagation(); duplicatePlan(plan); }}
                  title="复制方案"
                >
                  <Copy size={12} />
                </button>
                {plans.length > 1 && (
                  <button
                    className={`opacity-0 group-hover:opacity-100 transition-opacity ${activePlan?.id === plan.id ? 'text-white/80 hover:text-white' : 'text-gray-400 hover:text-red-500'}`}
                    onClick={(e) => { e.stopPropagation(); deletePlan(plan.id); }}
                    title="删除方案"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {activePlan && (
            <>
              <PlanHeader plan={activePlan} onChange={updateActivePlan} />

              {/* 进度与筛选 */}
              <div className={`${cardCls} p-4`}>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">完成进度</span>
                    <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${completionRate}%` }} />
                    </div>
                    <span className="text-sm font-medium text-gray-900">{completionRate}%</span>
                  </div>
                  <div className="h-4 w-px bg-gray-200" />
                  <select
                    className={inputCls + ' !w-28 !py-1'}
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value as IterationItem['priority'] | 'all')}
                  >
                    <option value="all">全部优先级</option>
                    <option value="high">高优先级</option>
                    <option value="medium">中优先级</option>
                    <option value="low">低优先级</option>
                  </select>
                  <select
                    className={inputCls + ' !w-28 !py-1'}
                    value={phaseFilter}
                    onChange={(e) => setPhaseFilter(e.target.value as IterationItem['phase'] | 'all')}
                  >
                    <option value="all">全部阶段</option>
                    <option value="short">近期</option>
                    <option value="medium">中期</option>
                    <option value="long">远期</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="rounded border-gray-300" />
                    隐藏已完成
                  </label>
                </div>
              </div>

              {/* 迭代项列表 */}
              <div className="space-y-3">
                {filteredItems.map((it) => (
                  <IterationItemCard
                    key={it.id}
                    item={it}
                    onChange={(next) => updateActivePlan((plan) => ({ ...plan, items: plan.items.map((x) => (x.id === it.id ? next : x)) }))}
                    onDelete={() => updateActivePlan((plan) => ({ ...plan, items: plan.items.filter((x) => x.id !== it.id) }))}
                  />
                ))}
                {filteredItems.length === 0 && (
                  <div className={`${cardCls} p-6 text-center text-gray-400`}>没有符合条件的迭代项</div>
                )}
              </div>

              <button
                className={btnSecondary + ' w-full justify-center'}
                onClick={() => updateActivePlan((plan) => ({
                  ...plan,
                  items: [...plan.items, { id: uid(), title: '', description: '', priority: 'medium', effort: 'small', impact: '', phase: 'short', done: false }],
                }))}
              >
                <Plus size={15} /> 添加迭代项
              </button>

              <MetricsEditor plan={activePlan} onChange={updateActivePlan} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function PlanHeader({ plan, onChange }: { plan: IterationPlanType; onChange: (fn: (plan: IterationPlanType) => IterationPlanType) => void }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(plan.name);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summary, setSummary] = useState(plan.summary);

  return (
    <div className={`${cardCls} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        {editingName ? (
          <div className="flex items-center gap-2">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button
              className={btnPrimary}
              onClick={() => { onChange((p) => ({ ...p, name })); setEditingName(false); }}
            >
              <Check size={14} />
            </button>
            <button className={btnSecondary} onClick={() => { setName(plan.name); setEditingName(false); }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            {plan.name}
            <button className="text-gray-400 hover:text-primary" onClick={() => setEditingName(true)}>
              <Edit2 size={14} />
            </button>
          </h2>
        )}
        <span className="text-xs text-gray-400">创建于 {fmtDate(plan.createdAt)}</span>
      </div>

      {editingSummary ? (
        <div className="space-y-2">
          <textarea className={inputCls} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          <div className="flex items-center gap-2">
            <button className={btnPrimary} onClick={() => { onChange((p) => ({ ...p, summary })); setEditingSummary(false); }}>
              <Save size={14} /> 保存
            </button>
            <button className={btnSecondary} onClick={() => { setSummary(plan.summary); setEditingSummary(false); }}>取消</button>
          </div>
        </div>
      ) : (
        <div className="group relative">
          <p className="text-sm text-gray-600 pr-8">{plan.summary || '暂无概述'}</p>
          <button className="absolute right-0 top-0 text-gray-400 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setEditingSummary(true)}>
            <Edit2 size={14} />
          </button>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">核心问题</h3>
        <EditableStringList
          items={plan.coreProblems}
          onChange={(items) => onChange((p) => ({ ...p, coreProblems: items }))}
          placeholder="添加核心问题"
        />
      </div>
    </div>
  );
}

function IterationItemCard({
  item,
  onChange,
  onDelete,
}: {
  item: IterationItem;
  onChange: (item: IterationItem) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(!item.title);
  const [draft, setDraft] = useState(item);

  const save = () => {
    onChange(draft);
    setEditing(false);
  };

  const toggleDone = () => onChange({ ...item, done: !item.done });

  if (editing) {
    return (
      <div className={`${cardCls} p-4 space-y-3`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="迭代项标题" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <select className={inputCls} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as IterationItem['priority'] })}>
            <option value="high">高优先级</option>
            <option value="medium">中优先级</option>
            <option value="low">低优先级</option>
          </select>
          <select className={inputCls} value={draft.phase} onChange={(e) => setDraft({ ...draft, phase: e.target.value as IterationItem['phase'] })}>
            <option value="short">近期</option>
            <option value="medium">中期</option>
            <option value="long">远期</option>
          </select>
          <select className={inputCls} value={draft.effort} onChange={(e) => setDraft({ ...draft, effort: e.target.value as IterationItem['effort'] })}>
            <option value="small">投入小</option>
            <option value="medium">投入中</option>
            <option value="large">投入大</option>
          </select>
        </div>
        <textarea className={inputCls} rows={2} placeholder="具体改进描述" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <input className={inputCls} placeholder="预期价值" value={draft.impact} onChange={(e) => setDraft({ ...draft, impact: e.target.value })} />
        <input className={inputCls} placeholder="关联洞察（可选）" value={draft.relatedInsight || ''} onChange={(e) => setDraft({ ...draft, relatedInsight: e.target.value })} />
        <input className={inputCls} placeholder="备注（可选）" value={draft.note || ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        <div className="flex items-center gap-2">
          <button className={btnPrimary} onClick={save}><Save size={14} /> 保存</button>
          <button className={btnSecondary} onClick={() => { setDraft(item); setEditing(false); }}>取消</button>
          <button className={btnSecondary + ' ml-auto text-red-600 hover:bg-red-50'} onClick={onDelete}><Trash2 size={14} /> 删除</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${cardCls} p-4 transition-opacity ${item.done ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={toggleDone}
          className={`mt-0.5 shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${item.done ? 'bg-primary border-primary text-white' : 'border-gray-300 hover:border-primary'}`}
        >
          {item.done && <Check size={12} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`font-semibold text-gray-900 ${item.done ? 'line-through text-gray-400' : ''}`}>{item.title || '未命名迭代项'}</span>
            <Badge color={item.priority === 'high' ? 'red' : item.priority === 'medium' ? 'amber' : 'gray'}>
              {PRIORITY_LABELS[item.priority]}优先级
            </Badge>
            <Badge color="blue">{PHASE_LABELS[item.phase]}</Badge>
            <Badge color="gray">投入 {EFFORT_LABELS[item.effort]}</Badge>
          </div>
          <p className={`text-sm text-gray-600 ${item.done ? 'line-through text-gray-400' : ''}`}>{item.description}</p>
          <p className="text-xs text-gray-500 mt-1">预期价值：{item.impact || '—'}</p>
          {item.relatedInsight && <p className="text-xs text-primary mt-1.5">关联洞察：{item.relatedInsight}</p>}
          {item.note && <p className="text-xs text-gray-400 mt-1">备注：{item.note}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-gray-400 hover:text-primary rounded" onClick={() => setEditing(true)} title="编辑">
            <Edit2 size={14} />
          </button>
          <button className="p-1.5 text-gray-400 hover:text-red-500 rounded" onClick={onDelete} title="删除">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricsEditor({ plan, onChange }: { plan: IterationPlanType; onChange: (fn: (plan: IterationPlanType) => IterationPlanType) => void }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className={`${cardCls} p-5`}>
      <button className="flex items-center justify-between w-full" onClick={() => setExpanded((v) => !v)}>
        <h3 className="font-semibold text-gray-900">衡量指标</h3>
        {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {expanded && (
        <div className="mt-3">
          <EditableStringList
            items={plan.metrics}
            onChange={(items) => onChange((p) => ({ ...p, metrics: items }))}
            placeholder="添加衡量指标"
          />
        </div>
      )}
    </div>
  );
}

function EditableStringList({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditingValue(items[idx] || '');
  };

  const save = () => {
    if (editingIdx === null) return;
    const next = [...items];
    next[editingIdx] = editingValue.trim();
    onChange(next.filter(Boolean));
    setEditingIdx(null);
  };

  return (
    <ol className="list-decimal list-inside space-y-2">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-gray-600">
          {editingIdx === i ? (
            <div className="flex items-center gap-2 mt-1">
              <input className={inputCls + ' !py-1'} value={editingValue} onChange={(e) => setEditingValue(e.target.value)} autoFocus />
              <button className={btnPrimary + ' !py-1'} onClick={save}><Check size={14} /></button>
              <button className={btnSecondary + ' !py-1'} onClick={() => setEditingIdx(null)}><X size={14} /></button>
            </div>
          ) : (
            <span className="group flex items-center gap-2">
              <span className="cursor-pointer hover:text-primary" onClick={() => startEdit(i)}>{item}</span>
              <button className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
                <Trash2 size={12} />
              </button>
            </span>
          )}
        </li>
      ))}
      <li className="list-none">
        <button
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          onClick={() => { onChange([...items, '']); startEdit(items.length); }}
        >
          <Plus size={14} /> {placeholder}
        </button>
      </li>
    </ol>
  );
}
