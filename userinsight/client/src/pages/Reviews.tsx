import React, { useMemo, useState } from 'react';
import { Trash2, ExternalLink, Download, CopyCheck, Tag, Plus, X } from 'lucide-react';
import { useStore } from '../store';
import { Review } from '../types';
import {
  PLATFORMS, PLATFORM_KEYS, PAIN_TYPES, SENTIMENT_LABELS, PRESET_TAGS,
  similarity, reviewsToCSV, download, fmtDate, sentimentFromRating,
} from '../lib/utils';
import { Badge, EmptyState, Modal, RatingStars, selectCls, inputCls, btnSecondary, cardCls } from '../components/ui';

type SortKey = 'createdAt' | 'reviewDate' | 'rating' | 'platform';

export default function Reviews() {
  const { current, updateCurrent, globalSearch, setGlobalSearch } = useStore();
  const [filters, setFilters] = useState({ platform: '', rating: '', sentiment: '', pain: '', verified: '', tag: '' });
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [dupMode, setDupMode] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const reviews = current?.reviews || [];

  const dupIds = useMemo(() => {
    if (!dupMode) return new Set<string>();
    const ids = new Set<string>();
    for (let i = 0; i < reviews.length; i++) {
      for (let j = i + 1; j < reviews.length; j++) {
        if (similarity(reviews[i].content, reviews[j].content) > 0.6) {
          // 保留先入库的，标记后者为疑似重复
          ids.add(reviews[j].id);
        }
      }
    }
    return ids;
  }, [dupMode, reviews]);

  const filtered = useMemo(() => {
    const kw = globalSearch.trim().toLowerCase();
    const list = reviews.filter((r) => {
      if (filters.platform && r.platform !== filters.platform) return false;
      if (filters.rating && r.rating !== parseInt(filters.rating, 10)) return false;
      if (filters.sentiment && r.sentiment !== filters.sentiment) return false;
      if (filters.pain && r.painPointType !== filters.pain) return false;
      if (filters.verified === 'pending' && r.verified) return false;
      if (filters.verified === 'ok' && !r.verified) return false;
      if (filters.tag && !(r.tags || []).includes(filters.tag)) return false;
      if (kw) {
        const hay = (r.content + ' ' + r.keywords.join(' ') + ' ' + (r.tags || []).join(' ')).toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'rating') return (a.rating - b.rating) * dir;
      if (sortKey === 'platform') return a.platform.localeCompare(b.platform) * dir;
      const av = (sortKey === 'reviewDate' ? a.reviewDate : a.createdAt) || '';
      const bv = (sortKey === 'reviewDate' ? b.reviewDate : b.createdAt) || '';
      return av.localeCompare(bv) * dir;
    });
  }, [reviews, filters, globalSearch, sortKey, sortDir]);

  if (!current) return null;

  const patchReview = (id: string, patch: Partial<Review>) =>
    updateCurrent((p) => ({
      ...p,
      reviews: p.reviews.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

  const deleteReview = (id: string) =>
    updateCurrent((p) => ({ ...p, reviews: p.reviews.filter((r) => r.id !== id) }));

  const deleteDups = () => {
    if (!dupIds.size) return;
    updateCurrent((p) => ({ ...p, reviews: p.reviews.filter((r) => !dupIds.has(r.id)) }));
    setDupMode(false);
  };

  const allTags = [...new Set([...PRESET_TAGS, ...reviews.flatMap((r) => r.tags || [])])];
  const detail = reviews.find((r) => r.id === detailId) || null;

  const sentimentColor = (s: Review['sentiment']) =>
    s === 'positive' ? 'text-green-600' : s === 'negative' ? 'text-red-600' : 'text-gray-500';

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">评价库</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {reviews.length} 条，当前筛选 {filtered.length} 条</p>
        </div>
        <div className="flex gap-2">
          <button className={btnSecondary} onClick={() => setDupMode((v) => !v)}>
            <CopyCheck size={15} /> {dupMode ? `疑似重复 ${dupIds.size} 条` : '查找相似重复'}
          </button>
          {dupMode && dupIds.size > 0 && (
            <button className={btnSecondary + ' text-red-600 border-red-200'} onClick={deleteDups}>
              删除疑似重复
            </button>
          )}
          <button className={btnSecondary} disabled={!filtered.length}
            onClick={() => download(`reviews-${current.product}-${new Date().toISOString().slice(0, 10)}.csv`, reviewsToCSV(filtered), 'text/csv;charset=utf-8')}>
            <Download size={15} /> 导出 CSV
          </button>
        </div>
      </div>

      {/* 筛选与排序 */}
      <div className={`${cardCls} p-3 flex flex-wrap items-center gap-2`}>
        <select className={selectCls} value={filters.platform} onChange={(e) => setFilters({ ...filters, platform: e.target.value })}>
          <option value="">全部平台</option>
          {PLATFORM_KEYS.map((k) => <option key={k} value={k}>{PLATFORMS[k]}</option>)}
        </select>
        <select className={selectCls} value={filters.rating} onChange={(e) => setFilters({ ...filters, rating: e.target.value })}>
          <option value="">全部星级</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} 星</option>)}
        </select>
        <select className={selectCls} value={filters.sentiment} onChange={(e) => setFilters({ ...filters, sentiment: e.target.value })}>
          <option value="">全部情感</option>
          <option value="positive">正面</option>
          <option value="negative">负面</option>
          <option value="neutral">中性</option>
        </select>
        <select className={selectCls} value={filters.pain} onChange={(e) => setFilters({ ...filters, pain: e.target.value })}>
          <option value="">全部痛点</option>
          {PAIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={selectCls} value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })}>
          <option value="">全部标签</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={selectCls} value={filters.verified} onChange={(e) => setFilters({ ...filters, verified: e.target.value })}>
          <option value="">溯源状态</option>
          <option value="ok">已溯源</option>
          <option value="pending">待核实</option>
        </select>
        <input
          className={inputCls + ' !w-56'}
          placeholder="关键词搜索（内容 / 关键词 / 标签）"
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
        />
        <div className="flex-1" />
        <span className="text-xs text-gray-400">排序</span>
        <select className={selectCls} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          <option value="createdAt">入库时间</option>
          <option value="reviewDate">评价时间</option>
          <option value="rating">星级</option>
          <option value="platform">平台</option>
        </select>
        <button className={selectCls} onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
          {sortDir === 'asc' ? '升序 ↑' : '降序 ↓'}
        </button>
      </div>

      {/* 表格 */}
      {!filtered.length ? (
        <EmptyState
          title={reviews.length ? '没有符合筛选条件的评价' : '评价库为空'}
          desc={reviews.length ? '调整筛选条件或清空搜索关键词' : '前往「智能采集」搜集公开渠道评价，或使用手动录入补充'}
          action={!reviews.length ? <a href="#/collect" className={btnSecondary}>前往智能采集</a> : undefined}
        />
      ) : (
        <div className={`${cardCls} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50/60">
                <th className="py-2.5 px-3 min-w-[280px]">内容</th>
                <th className="py-2.5 px-3 w-24">平台</th>
                <th className="py-2.5 px-3 w-24">星级</th>
                <th className="py-2.5 px-3 w-24">情感</th>
                <th className="py-2.5 px-3 w-24">痛点</th>
                <th className="py-2.5 px-3 w-28">时间</th>
                <th className="py-2.5 px-3 w-20">溯源</th>
                <th className="py-2.5 px-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50/60 ${dupMode && dupIds.has(r.id) ? 'bg-amber-50/60' : ''}`}>
                  <td className="py-2.5 px-3 cursor-pointer" onClick={() => setDetailId(r.id)}>
                    <p className="line-clamp-2 text-gray-800">{r.content}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {dupMode && dupIds.has(r.id) && <Badge color="amber">疑似重复</Badge>}
                      {r.source === 'auto' ? <Badge color="blue">自动采集</Badge> : <Badge>手动录入</Badge>}
                      {(r.tags || []).map((t) => (
                        <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-xs">
                          <Tag size={10} /> {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-gray-600">{PLATFORMS[r.platform]}</td>
                  <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                    <select className={selectCls + ' !py-1 !px-1.5 text-xs'} value={r.rating}
                      onChange={(e) => {
                        const rating = parseInt(e.target.value, 10) as Review['rating'];
                        patchReview(r.id, { rating, sentiment: sentimentFromRating(rating) });
                      }}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} 星</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 px-3">
                    <select className={selectCls + ` !py-1 !px-1.5 text-xs font-medium ${sentimentColor(r.sentiment)}`} value={r.sentiment}
                      onChange={(e) => patchReview(r.id, { sentiment: e.target.value as Review['sentiment'] })}>
                      <option value="positive">正面</option>
                      <option value="negative">负面</option>
                      <option value="neutral">中性</option>
                    </select>
                  </td>
                  <td className="py-2.5 px-3">
                    <select className={selectCls + ' !py-1 !px-1.5 text-xs'} value={r.painPointType || ''}
                      onChange={(e) => patchReview(r.id, { painPointType: (e.target.value || undefined) as Review['painPointType'] })}>
                      <option value="">—</option>
                      {PAIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-gray-500">
                    <div>发布 {fmtDate(r.reviewDate)}</div>
                    <div>入库 {fmtDate(r.createdAt)}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    {r.sourceUrl ? (
                      <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                        <ExternalLink size={12} /> 原文
                      </a>
                    ) : (
                      <Badge color="amber">待核实</Badge>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <button className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="删除"
                      onClick={() => deleteReview(r.id)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <ReviewDetail
          review={detail}
          allTags={allTags}
          onClose={() => setDetailId(null)}
          onPatch={(patch) => patchReview(detail.id, patch)}
        />
      )}
    </div>
  );
}

function ReviewDetail({
  review, allTags, onClose, onPatch,
}: {
  review: Review;
  allTags: string[];
  onClose: () => void;
  onPatch: (patch: Partial<Review>) => void;
}) {
  const [customTag, setCustomTag] = useState('');
  const tags = review.tags || [];

  const toggleTag = (t: string) =>
    onPatch({ tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] });

  const addCustomTag = () => {
    const t = customTag.trim();
    if (!t || tags.includes(t)) return;
    onPatch({ tags: [...tags, t] });
    setCustomTag('');
  };

  return (
    <Modal title="评价详情" onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <p className="text-gray-900 leading-relaxed">{review.content}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
            <RatingStars value={review.rating} />
            <Badge color="blue">{PLATFORMS[review.platform]}</Badge>
            {review.scenario && <Badge>场景：{review.scenario}</Badge>}
            {review.authorName && <span>昵称：{review.authorName}（已脱敏）</span>}
            {review.likeCount != null && <span>点赞 {review.likeCount}</span>}
            {review.hasImage && <span>含图片</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label className="block text-xs text-gray-500 mb-1">情感倾向</label>
            <select className={selectCls + ' w-full'} value={review.sentiment}
              onChange={(e) => onPatch({ sentiment: e.target.value as Review['sentiment'] })}>
              <option value="positive">正面</option>
              <option value="negative">负面</option>
              <option value="neutral">中性</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">痛点类型</label>
            <select className={selectCls + ' w-full'} value={review.painPointType || ''}
              onChange={(e) => onPatch({ painPointType: (e.target.value || undefined) as Review['painPointType'] })}>
              <option value="">无</option>
              {PAIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">研究者标签</label>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => (
              <button key={t} type="button" onClick={() => toggleTag(t)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  tags.includes(t) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                }`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input className={inputCls + ' !w-48'} placeholder="自定义标签" value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomTag()} />
            <button className={btnSecondary} onClick={addCustomTag}><Plus size={14} /> 添加</button>
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-50 text-indigo-600 text-xs">
                {t}
                <button onClick={() => toggleTag(t)}><X size={11} /></button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">关键词</label>
          <p className="text-sm text-gray-700">{review.keywords.length ? review.keywords.join('、') : '—'}</p>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">来源链接</label>
          {review.sourceUrl ? (
            <a href={review.sourceUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline text-sm break-all">
              <ExternalLink size={14} /> {review.sourceUrl}
            </a>
          ) : (
            <Badge color="amber">待核实 · 无来源链接</Badge>
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">研究者备注</label>
          <textarea className={inputCls} rows={2} value={review.note || ''}
            onChange={(e) => onPatch({ note: e.target.value || undefined })} placeholder="记录你的观察与判断…" />
        </div>

        <p className="text-xs text-gray-400">
          评价时间：{fmtDate(review.reviewDate)} · 入库时间：{fmtDate(review.createdAt)} · {review.source === 'auto' ? '自动采集' : '手动录入'}
        </p>
      </div>
    </Modal>
  );
}
