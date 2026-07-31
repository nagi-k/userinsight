import React, { useMemo, useState } from 'react';
import {
  DndContext, closestCenter, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Lightbulb, Users, Route, GripVertical, Trash2, Pencil, Sparkles, Loader2,
  Plus, ArrowUp, ArrowDown, CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useStore } from '../store';
import { Insight, Persona, JourneyStage, Review } from '../types';
import { api, hasSettings } from '../lib/api';
import {
  uid, PLATFORMS, PLATFORM_KEYS, INSIGHT_CATEGORIES, PRIORITY_LABELS,
  PAIN_TYPES,
} from '../lib/utils';
import { Badge, EmptyState, Modal, RatingStars, inputCls, selectCls, btnPrimary, btnSecondary, cardCls } from '../components/ui';

type Tab = 'insights' | 'personas' | 'journey';

export default function Insights() {
  const { current } = useStore();
  const [tab, setTab] = useState<Tab>('insights');
  if (!current) return null;
  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">洞察工坊</h1>
          <p className="text-sm text-gray-500 mt-0.5">从原始评价中提炼设计洞察，沉淀画像与旅程</p>
        </div>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {([
            ['insights', '洞察卡片', Lightbulb],
            ['personas', '用户画像', Users],
            ['journey', '用户旅程', Route],
          ] as [Tab, string, React.ElementType][]).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === key ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'insights' && <InsightWorkspace />}
      {tab === 'personas' && <PersonaPanel />}
      {tab === 'journey' && <JourneyPanel />}
    </div>
  );
}

/* ---------------- 洞察卡片工作区 ---------------- */

function InsightWorkspace() {
  const { current, updateCurrent } = useStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [platformFilter, setPlatformFilter] = useState('');
  const [editing, setEditing] = useState<Insight | null>(null);
  const [aiBatchLoading, setAiBatchLoading] = useState(false);
  const [aiBatchError, setAiBatchError] = useState('');
  const [aiBatchProgress, setAiBatchProgress] = useState('');

  if (!current) return null;
  const insights = [...current.insights].sort((a, b) => a.order - b.order);
  const reviews = current.reviews.filter((r) => !platformFilter || r.platform === platformFilter);

  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const extractInsight = () => {
    const picked = current.reviews.filter((r) => selected.includes(r.id));
    if (!picked.length) return;
    const quote = picked.map((r) => r.content).join(' / ').slice(0, 600);
    const insight: Insight = {
      id: uid(),
      reviewIds: picked.map((r) => r.id),
      quote,
      behaviorInsight: '',
      designRequirement: '',
      hmwQuestion: '',
      category: 'ergonomics',
      priority: 'medium',
      order: Math.max(0, ...current.insights.map((i) => i.order)) + 1,
      createdAt: new Date().toISOString(),
    };
    updateCurrent((p) => ({ ...p, insights: [...p.insights, insight] }));
    setSelected([]);
    setEditing(insight);
  };

  const categoryFromReview = (r: Review): Insight['category'] => {
    if (r.painPointType === '握持' || r.painPointType === '重量' || r.painPointType === '操作') return 'ergonomics';
    if (r.painPointType === '外观') return 'form';
    if (r.painPointType === '清洁') return 'material';
    if (r.painPointType === '噪音' || r.painPointType === '价格') return 'scenario';
    if (r.painPointType === '其他') return 'emotion';
    return 'ergonomics';
  };

  const priorityFromReview = (r: Review): Insight['priority'] => {
    if (r.rating <= 2) return 'high';
    if (r.rating === 3) return 'medium';
    return 'low';
  };

  const batchGenerateInsights = async () => {
    const picked = current.reviews.filter((r) => selected.includes(r.id));
    if (!picked.length) return;
    setAiBatchLoading(true);
    setAiBatchError('');
    setAiBatchProgress('');
    const generated: Insight[] = [];
    try {
      const baseOrder = Math.max(0, ...current.insights.map((i) => i.order));
      for (let i = 0; i < picked.length; i++) {
        const r = picked[i];
        setAiBatchProgress(`正在生成第 ${i + 1}/${picked.length} 条洞察…`);
        try {
          const draft = await api.insightDraft([r.content], INSIGHT_CATEGORIES[categoryFromReview(r)]);
          generated.push({
            id: uid(),
            reviewIds: [r.id],
            quote: r.content.slice(0, 200),
            behaviorInsight: draft.behaviorInsight || '',
            designRequirement: draft.designRequirement || '',
            hmwQuestion: draft.hmwQuestion || '',
            category: categoryFromReview(r),
            priority: priorityFromReview(r),
            order: baseOrder + i + 1,
            createdAt: new Date().toISOString(),
          });
        } catch (e) {
          // 单条失败继续生成下一条
          setAiBatchProgress(`第 ${i + 1} 条洞察生成失败，已跳过`);
        }
      }
      if (generated.length) {
        updateCurrent((p) => ({ ...p, insights: [...p.insights, ...generated] }));
      }
      setSelected([]);
    } catch (e) {
      setAiBatchError(e instanceof Error ? e.message : '批量生成失败');
    } finally {
      setAiBatchLoading(false);
      setAiBatchProgress('');
    }
  };

  const saveInsight = (ins: Insight) => {
    updateCurrent((p) => ({ ...p, insights: p.insights.map((i) => (i.id === ins.id ? ins : i)) }));
    setEditing(null);
  };

  const deleteInsight = (id: string) =>
    updateCurrent((p) => ({ ...p, insights: p.insights.filter((i) => i.id !== id) }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = insights.map((i) => i.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const moved = arrayMove(insights, from, to).map((ins, idx) => ({ ...ins, order: idx + 1 }));
    updateCurrent((p) => ({ ...p, insights: moved }));
  };

  const priorityColor = (p: Insight['priority']) =>
    p === 'high' ? 'red' : p === 'medium' ? 'amber' : 'gray';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* 左侧：原始评价列表 */}
      <div className={`${cardCls} p-4 lg:col-span-2 flex flex-col max-h-[70vh]`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-gray-900 text-sm">原始评价</h3>
          <select className={selectCls + ' !py-1 text-xs'} value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
            <option value="">全部平台</option>
            {PLATFORM_KEYS.map((k) => <option key={k} value={k}>{PLATFORMS[k]}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {reviews.map((r) => (
            <label key={r.id}
              className={`block rounded-lg border p-2.5 cursor-pointer transition-colors ${
                selected.includes(r.id) ? 'border-primary bg-primary-50/60' : 'border-gray-200 hover:border-primary/40'
              }`}>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} />
                <div className="min-w-0">
                  <p className="text-xs text-gray-800 line-clamp-3">{r.content}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <RatingStars value={r.rating} size={11} />
                    <span className="text-[11px] text-gray-400">{PLATFORMS[r.platform]}</span>
                    {r.painPointType && <Badge color="red">{r.painPointType}</Badge>}
                  </div>
                </div>
              </div>
            </label>
          ))}
          {!reviews.length && <p className="text-xs text-gray-400 text-center py-8">暂无评价数据</p>}
        </div>
        <div className="mt-3 space-y-2">
          <button className={btnPrimary + ' justify-center w-full'} disabled={!selected.length || aiBatchLoading} onClick={extractInsight}>
            <Lightbulb size={15} /> 提取洞察（已选 {selected.length} 条）
          </button>
          <button
            className={btnSecondary + ' justify-center w-full'}
            disabled={!selected.length || aiBatchLoading || !hasSettings()}
            onClick={batchGenerateInsights}
            title={hasSettings() ? '为每条选中的评价自动生成 AI 洞察' : '请先在设置页配置大模型 API'}
          >
            {aiBatchLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {aiBatchLoading ? 'AI 生成中…' : '批量 AI 生成洞察'}
          </button>
          {aiBatchLoading && aiBatchProgress && (
            <p className="text-xs text-primary text-center">{aiBatchProgress}</p>
          )}
          {aiBatchError && <p className="text-xs text-red-600 text-center">{aiBatchError}</p>}
        </div>
      </div>

      {/* 右侧：洞察卡片列表（拖拽排序） */}
      <div className="lg:col-span-3 space-y-3">
        {!insights.length ? (
          <EmptyState title="还没有洞察卡片" desc="在左侧勾选一条或多条评价，点击「提取洞察」生成结构化卡片" />
        ) : (
          <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={insights.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {insights.map((ins) => (
                <SortableInsightCard
                  key={ins.id}
                  insight={ins}
                  priorityColor={priorityColor(ins.priority) as 'red' | 'amber' | 'gray'}
                  onEdit={() => setEditing(ins)}
                  onDelete={() => deleteInsight(ins.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {editing && (
        <InsightEditor insight={editing} onClose={() => setEditing(null)} onSave={saveInsight} />
      )}
    </div>
  );
}

function SortableInsightCard({
  insight, priorityColor, onEdit, onDelete,
}: {
  insight: Insight;
  priorityColor: 'red' | 'amber' | 'gray';
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: insight.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style}
      className={`${cardCls} p-4 flex gap-3 ${isDragging ? 'opacity-70 shadow-lg z-10 relative' : ''}`}>
      <button {...attributes} {...listeners}
        className="shrink-0 self-start mt-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
        <GripVertical size={18} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <Badge color="blue">{INSIGHT_CATEGORIES[insight.category]}</Badge>
          <Badge color={priorityColor}>优先级：{PRIORITY_LABELS[insight.priority]}</Badge>
          <span className="text-xs text-gray-400">关联 {insight.reviewIds.length} 条评价</span>
        </div>
        <p className="text-sm text-gray-500 italic line-clamp-2">“{insight.quote}”</p>
        {insight.hmwQuestion && <p className="text-sm font-semibold text-primary mt-2">{insight.hmwQuestion}</p>}
        {insight.behaviorInsight && <p className="text-sm text-gray-700 mt-1"><span className="font-medium">行为洞察：</span>{insight.behaviorInsight}</p>}
        {insight.designRequirement && <p className="text-sm text-gray-700 mt-1"><span className="font-medium">设计需求：</span>{insight.designRequirement}</p>}
        {!insight.behaviorInsight && !insight.designRequirement && !insight.hmwQuestion && (
          <p className="text-xs text-gray-400 mt-2">草稿卡片：点击编辑完善内容，或使用 AI 辅助生成</p>
        )}
      </div>
      <div className="shrink-0 flex flex-col gap-1">
        <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="编辑" onClick={onEdit}><Pencil size={15} /></button>
        <button className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="删除" onClick={onDelete}><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function InsightEditor({
  insight, onClose, onSave,
}: {
  insight: Insight;
  onClose: () => void;
  onSave: (ins: Insight) => void;
}) {
  const [form, setForm] = useState<Insight>(insight);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const configured = hasSettings();

  const aiDraft = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const draft = await api.insightDraft([form.quote], INSIGHT_CATEGORIES[form.category]);
      setForm((f) => ({
        ...f,
        behaviorInsight: draft.behaviorInsight || f.behaviorInsight,
        designRequirement: draft.designRequirement || f.designRequirement,
        hmwQuestion: draft.hmwQuestion || f.hmwQuestion,
      }));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Modal title="编辑洞察卡片" onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">原始引语（自动填入所选评价）</label>
            <button className={btnSecondary + ' !py-1 !px-2 text-xs'} onClick={aiDraft}
              disabled={!configured || aiLoading || !form.quote.trim()}
              title={configured ? '基于引语生成行为洞察 / 设计需求 / HMW 草稿' : '请先在设置页配置大模型 API'}>
              {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              AI 辅助生成
            </button>
          </div>
          <textarea className={inputCls} rows={3} value={form.quote}
            onChange={(e) => setForm({ ...form, quote: e.target.value })} />
          {!configured && <p className="text-xs text-gray-400 mt-1">未配置大模型 API，AI 辅助不可用，可手动填写以下字段</p>}
          {aiError && <p className="text-xs text-red-600 mt-1">{aiError}</p>}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">行为洞察</label>
          <textarea className={inputCls} rows={2} value={form.behaviorInsight}
            onChange={(e) => setForm({ ...form, behaviorInsight: e.target.value })}
            placeholder="用户在场景中表现出的真实行为与动机" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">设计需求</label>
          <textarea className={inputCls} rows={2} value={form.designRequirement}
            onChange={(e) => setForm({ ...form, designRequirement: e.target.value })}
            placeholder="可落地的工业设计改进方向" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">HMW 问题（How Might We）</label>
          <input className={inputCls} value={form.hmwQuestion}
            onChange={(e) => setForm({ ...form, hmwQuestion: e.target.value })}
            placeholder="我们如何能够…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">洞察分类</label>
            <select className={selectCls + ' w-full'} value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as Insight['category'] })}>
              {Object.entries(INSIGHT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">优先级</label>
            <select className={selectCls + ' w-full'} value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as Insight['priority'] })}>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end">
          <button className={btnPrimary} onClick={() => onSave(form)}>
            <CheckCircle2 size={15} /> 保存
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- 用户画像生成器 ---------------- */

const emptyPersonaForm = {
  name: '', demographics: '', painPoints: [] as string[], needs: '', behaviors: '', quote: '',
};

function PersonaPanel() {
  const { current, updateCurrent } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyPersonaForm);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const configured = hasSettings();

  if (!current) return null;

  // 项目评价中出现过的痛点类型，供快捷选取
  const painOptions = [...new Set(current.reviews.map((r) => r.painPointType).filter(Boolean))] as string[];

  const openNew = () => {
    setEditingId(null);
    setForm(emptyPersonaForm);
    setAiError('');
    setShowForm(true);
  };

  const openEdit = (p: Persona) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      demographics: p.demographics,
      painPoints: p.painPoints,
      needs: p.needs.join('\n'),
      behaviors: p.behaviors.join('\n'),
      quote: p.quote,
    });
    setAiError('');
    setShowForm(true);
  };

  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);

  const save = () => {
    if (!form.name.trim()) return;
    const persona: Persona = {
      id: editingId || uid(),
      name: form.name.trim(),
      demographics: form.demographics.trim(),
      painPoints: form.painPoints,
      needs: lines(form.needs),
      behaviors: lines(form.behaviors),
      quote: form.quote.trim(),
    };
    updateCurrent((p) => ({
      ...p,
      personas: editingId ? p.personas.map((x) => (x.id === editingId ? persona : x)) : [...p.personas, persona],
    }));
    setShowForm(false);
  };

  const aiDraft = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const reviews = current.reviews;
      const kwMap = new Map<string, number>();
      reviews.forEach((r) => r.keywords.forEach((k) => kwMap.set(k, (kwMap.get(k) || 0) + 1)));
      const topKw = [...kwMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}(${v})`).join('、');
      const painMap = new Map<string, number>();
      reviews.forEach((r) => r.painPointType && painMap.set(r.painPointType, (painMap.get(r.painPointType) || 0) + 1));
      const topPain = [...painMap.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join('、');
      const samples = reviews.slice(0, 6).map((r) => `- ${r.content}`).join('\n');
      const summary = `评价总数：${reviews.length}\n高频关键词：${topKw}\n痛点分布：${topPain}\n代表性评价：\n${samples}`;
      const draft = await api.personaDraft(current.product, summary);
      setForm((f) => ({
        ...f,
        name: draft.name || f.name,
        demographics: draft.demographics || f.demographics,
        painPoints: draft.painPoints.length ? draft.painPoints : f.painPoints,
        needs: draft.needs.length ? draft.needs.join('\n') : f.needs,
        behaviors: draft.behaviors.length ? draft.behaviors.join('\n') : f.behaviors,
        quote: draft.quote || f.quote,
      }));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">共 {current.personas.length} 个画像</p>
        <button className={btnPrimary} onClick={openNew}><Plus size={15} /> 新建画像</button>
      </div>
      {!current.personas.length ? (
        <EmptyState title="还没有用户画像" desc="基于评价数据创建典型用户画像，也可使用 AI 生成草稿" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {current.personas.map((p) => (
            <div key={p.id} className={`${cardCls} p-5`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-primary-50 text-primary flex items-center justify-center font-bold">
                    {p.name.slice(0, 1)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{p.name}</h3>
                    <p className="text-xs text-gray-500">{p.demographics}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" onClick={() => openEdit(p)}><Pencil size={14} /></button>
                  <button className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                    onClick={() => updateCurrent((pr) => ({ ...pr, personas: pr.personas.filter((x) => x.id !== p.id) }))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {p.quote && <p className="text-sm text-gray-500 italic mt-3">“{p.quote}”</p>}
              <div className="grid grid-cols-1 gap-2 mt-3 text-sm">
                {!!p.painPoints.length && (
                  <p><span className="font-medium text-red-600">核心痛点：</span>{p.painPoints.join('、')}</p>
                )}
                {!!p.needs.length && (
                  <p><span className="font-medium text-green-700">核心需求：</span>{p.needs.join('；')}</p>
                )}
                {!!p.behaviors.length && (
                  <p><span className="font-medium text-gray-700">行为特征：</span>{p.behaviors.join('；')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editingId ? '编辑画像' : '新建画像'} onClose={() => setShowForm(false)} wide>
          <div className="space-y-4">
            <div className="flex justify-end">
              <button className={btnSecondary + ' !py-1 !px-2 text-xs'} onClick={aiDraft}
                disabled={!configured || aiLoading || !current.reviews.length}
                title={configured ? '基于评价数据生成画像草稿' : '请先在设置页配置大模型 API'}>
                {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                基于评价数据生成画像草稿
              </button>
            </div>
            {aiError && <p className="text-xs text-red-600">{aiError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">姓名 / 代号 *</label>
                <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如：林晓晨 · 效率至上的早八族" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">人口统计</label>
                <input className={inputCls} value={form.demographics} onChange={(e) => setForm({ ...form, demographics: e.target.value })}
                  placeholder="年龄 / 职业 / 居住状态" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">核心痛点（可从评价痛点标签快捷选取）</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(painOptions.length ? painOptions : [...PAIN_TYPES]).map((t) => (
                  <button key={t} type="button"
                    onClick={() => setForm((f) => ({ ...f, painPoints: f.painPoints.includes(t) ? f.painPoints.filter((x) => x !== t) : [...f.painPoints, t] }))}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      form.painPoints.includes(t) ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">核心需求（每行一条）</label>
              <textarea className={inputCls} rows={3} value={form.needs} onChange={(e) => setForm({ ...form, needs: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">行为特征（每行一条）</label>
              <textarea className={inputCls} rows={3} value={form.behaviors} onChange={(e) => setForm({ ...form, behaviors: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">代表性引语</label>
              <input className={inputCls} value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} />
            </div>
            <div className="flex justify-end">
              <button className={btnPrimary} disabled={!form.name.trim()} onClick={save}>
                <CheckCircle2 size={15} /> 保存画像
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------- 用户旅程图编辑器 ---------------- */

function JourneyPanel() {
  const { current, updateCurrent } = useStore();
  if (!current) return null;
  const stages = [...current.journeyStages].sort((a, b) => a.order - b.order);

  const patchStage = (id: string, patch: Partial<JourneyStage>) =>
    updateCurrent((p) => ({
      ...p,
      journeyStages: p.journeyStages.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const move = (id: string, dir: -1 | 1) => {
    const idx = stages.findIndex((s) => s.id === id);
    const target = idx + dir;
    if (idx === -1 || target < 0 || target >= stages.length) return;
    const moved = arrayMove(stages, idx, target).map((s, i) => ({ ...s, order: i + 1 }));
    updateCurrent((p) => ({ ...p, journeyStages: moved }));
  };

  const addStage = () =>
    updateCurrent((p) => ({
      ...p,
      journeyStages: [
        ...p.journeyStages,
        { id: uid(), name: `阶段 ${p.journeyStages.length + 1}`, touchpoint: '', painPoint: '', emotionScore: 3, order: p.journeyStages.length + 1 },
      ],
    }));

  const chartData = stages.map((s) => ({ name: s.name, 情绪分值: s.emotionScore }));

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 text-sm">阶段编辑</h3>
          <button className={btnSecondary} onClick={addStage}><Plus size={14} /> 添加阶段</button>
        </div>
        {!stages.length ? (
          <p className="text-sm text-gray-400 text-center py-6">点击「添加阶段」开始构建用户旅程</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-2 w-32">阶段名称</th>
                <th className="py-2 pr-2">触点</th>
                <th className="py-2 pr-2">痛点</th>
                <th className="py-2 pr-2 w-28">情绪分值</th>
                <th className="py-2 w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s, idx) => (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="py-2 pr-2">
                    <input className={inputCls + ' !py-1.5'} value={s.name} onChange={(e) => patchStage(s.id, { name: e.target.value })} />
                  </td>
                  <td className="py-2 pr-2">
                    <input className={inputCls + ' !py-1.5'} value={s.touchpoint} onChange={(e) => patchStage(s.id, { touchpoint: e.target.value })} />
                  </td>
                  <td className="py-2 pr-2">
                    <input className={inputCls + ' !py-1.5'} value={s.painPoint} onChange={(e) => patchStage(s.id, { painPoint: e.target.value })} />
                  </td>
                  <td className="py-2 pr-2">
                    <select className={selectCls + ' w-full'} value={s.emotionScore}
                      onChange={(e) => patchStage(s.id, { emotionScore: parseInt(e.target.value, 10) as JourneyStage['emotionScore'] })}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} 分</option>)}
                    </select>
                  </td>
                  <td className="py-2">
                    <div className="flex gap-0.5">
                      <button className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30" disabled={idx === 0}
                        onClick={() => move(s.id, -1)}><ArrowUp size={14} /></button>
                      <button className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30" disabled={idx === stages.length - 1}
                        onClick={() => move(s.id, 1)}><ArrowDown size={14} /></button>
                      <button className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                        onClick={() => updateCurrent((p) => ({
                          ...p,
                          journeyStages: p.journeyStages.filter((x) => x.id !== s.id).map((x, i) => ({ ...x, order: i + 1 })),
                        }))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={`${cardCls} p-5`}>
        <h3 className="font-semibold text-gray-900 text-sm mb-3">情绪曲线（自动绘制）</h3>
        {stages.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="情绪分值" stroke="#1e40af" strokeWidth={2.5} dot={{ r: 5, fill: '#1e40af' }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">添加阶段后自动绘制情绪曲线</p>
        )}
      </div>

      {stages.some((s) => s.painPoint) && (
        <div className={`${cardCls} p-5`}>
          <h3 className="font-semibold text-gray-900 text-sm mb-3">各阶段痛点汇总</h3>
          <ul className="space-y-1.5 text-sm">
            {stages.filter((s) => s.painPoint).map((s) => (
              <li key={s.id} className="flex gap-2">
                <Badge color="blue">{s.name}</Badge>
                <span className="text-gray-700">{s.painPoint}</span>
                <span className="text-xs text-gray-400">（情绪 {s.emotionScore}/5）</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
