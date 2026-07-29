import React, { useMemo, useState } from 'react';
import { Plus, Trash2, FolderOpen, MessageSquare, Lightbulb, CheckCircle2 } from 'lucide-react';
import { useStore } from '../store';
import { PLATFORMS, fmtDate } from '../lib/utils';
import { Modal, EmptyState, inputCls, btnPrimary, cardCls } from '../components/ui';

export default function Dashboard() {
  const { projects, current, currentId, setCurrentId, addProject, deleteProject } = useStore();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', product: '', goal: '' });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!current) return null;
    const total = current.reviews.length;
    const pos = current.reviews.filter((r) => r.sentiment === 'positive').length;
    const neg = current.reviews.filter((r) => r.sentiment === 'negative').length;
    const neu = total - pos - neg;
    const byPlatform = new Map<string, number>();
    current.reviews.forEach((r) => byPlatform.set(r.platform, (byPlatform.get(r.platform) || 0) + 1));
    return { total, pos, neg, neu, byPlatform: [...byPlatform.entries()].sort((a, b) => b[1] - a[1]) };
  }, [current]);

  const submitNew = () => {
    if (!form.name.trim() || !form.product.trim()) return;
    addProject({ name: form.name.trim(), product: form.product.trim(), goal: form.goal.trim() });
    setForm({ name: '', product: '', goal: '' });
    setShowNew(false);
  };

  const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">研究项目</h1>
          <p className="text-sm text-gray-500 mt-0.5">管理你的用户研究项目，点击卡片切换当前项目</p>
        </div>
        <button className={btnPrimary} onClick={() => setShowNew(true)}>
          <Plus size={16} /> 新建项目
        </button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="还没有研究项目"
          desc="创建第一个项目，输入目标产品后即可开始采集用户评价"
          action={<button className={btnPrimary} onClick={() => setShowNew(true)}><Plus size={16} /> 新建项目</button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => {
            const active = p.id === currentId;
            return (
              <div
                key={p.id}
                className={`${cardCls} p-4 cursor-pointer transition-all hover:shadow-md ${active ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setCurrentId(p.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen size={18} className={active ? 'text-primary' : 'text-gray-400'} />
                    <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
                  </div>
                  {active && <span className="shrink-0 text-xs text-primary bg-primary-50 rounded-full px-2 py-0.5">当前</span>}
                </div>
                <p className="text-sm text-gray-500 mt-2">目标产品：{p.product}</p>
                <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                  <span className="inline-flex items-center gap-1"><MessageSquare size={13} /> {p.reviews.length} 条评价</span>
                  <span>创建于 {fmtDate(p.createdAt)}</span>
                  <button
                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                    title="删除项目"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.id); }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {current && stats && (
        <div className={`${cardCls} p-5`}>
          <h2 className="font-semibold text-gray-900 mb-4">项目概览 · {current.name}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-500">总评价数</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-500">情感分布（正 / 负 / 中）</p>
              <p className="text-sm font-semibold mt-2">
                <span className="text-green-600">{pct(stats.pos, stats.total)}%</span>
                <span className="text-gray-400"> / </span>
                <span className="text-red-600">{pct(stats.neg, stats.total)}%</span>
                <span className="text-gray-400"> / </span>
                <span className="text-gray-500">{pct(stats.neu, stats.total)}%</span>
              </p>
              <div className="flex h-1.5 rounded-full overflow-hidden mt-2 bg-gray-200">
                <div className="bg-green-500" style={{ width: `${pct(stats.pos, stats.total)}%` }} />
                <div className="bg-red-500" style={{ width: `${pct(stats.neg, stats.total)}%` }} />
                <div className="bg-gray-400" style={{ width: `${pct(stats.neu, stats.total)}%` }} />
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-500">已提取洞察</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 inline-flex items-center gap-2">
                <Lightbulb size={20} className="text-amber-500" /> {current.insights.length}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-500 mb-2">来源平台数据量</p>
              {stats.byPlatform.length === 0 && <p className="text-xs text-gray-400">暂无数据</p>}
              <div className="space-y-1 max-h-20 overflow-y-auto">
                {stats.byPlatform.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-gray-600">{PLATFORMS[k as keyof typeof PLATFORMS] || k}</span>
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(v / stats.total) * 100}%` }} />
                    </div>
                    <span className="text-gray-500">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <Modal title="新建研究项目" onClose={() => setShowNew(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">项目名称 *</label>
              <input className={inputCls} placeholder="如：便携咖啡机用户体验研究" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">目标产品（采集关键词）*</label>
              <input className={inputCls} placeholder="如：便携咖啡机" value={form.product}
                onChange={(e) => setForm({ ...form, product: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">研究目标</label>
              <textarea className={inputCls} rows={3} placeholder="如：挖掘清洁与便携相关痛点，输出设计机会点"
                value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button className={btnPrimary} disabled={!form.name.trim() || !form.product.trim()} onClick={submitNew}>
                <CheckCircle2 size={16} /> 创建项目
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="删除项目" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-gray-600">
            确定删除项目「{projects.find((p) => p.id === confirmDelete)?.name}」吗？
            项目下的评价、洞察、画像、旅程与竞品数据将一并删除，且不可恢复。
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <button className={btnPrimary} style={{ background: '#dc2626' }}
              onClick={() => { deleteProject(confirmDelete); setConfirmDelete(null); }}>
              确认删除
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
