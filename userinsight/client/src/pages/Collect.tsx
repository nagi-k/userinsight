import React, { useEffect, useMemo, useState } from 'react';
import {
  CloudDownload, Loader2, AlertTriangle, ShieldCheck, CheckCircle2, Trash2,
  ExternalLink, ClipboardPaste, Wand2, Info,
} from 'lucide-react';
import { useStore } from '../store';
import { Review } from '../types';
import { hasSettings } from '../lib/api';
import {
  PLATFORMS, PLATFORM_KEYS, uid, parseRatingFromText, matchKeywords, SENTIMENT_LABELS,
  sentimentFromRating,
} from '../lib/utils';
import { Badge, RatingStars, inputCls, selectCls, btnPrimary, btnSecondary, cardCls } from '../components/ui';

export default function Collect() {
  const {
    current,
    collection,
    startCollection,
    cancelCollection,
    clearCollection,
    confirmCollection,
    setPendingChecked,
    setPendingAllChecked,
    removePending,
    updatePendingReview,
  } = useStore();

  // 表单状态（仅在未运行时与 collection.params 同步）
  const [keyword, setKeyword] = useState(current?.product || '');
  const [platforms, setPlatforms] = useState<string[]>(['xiaohongshu', 'weibo', 'zhihu']);
  const [targetCount, setTargetCount] = useState(50);
  const [focus, setFocus] = useState('');

  const configured = hasSettings();
  const isRunningHere = collection.phase === 'running' && collection.projectId === current?.id;
  const isConfirmHere = collection.phase === 'confirm' && collection.projectId === current?.id;
  const isBusyElsewhere = collection.phase !== 'idle' && collection.projectId !== current?.id;

  // 当切换到当前项目时，把表单回填为本次采集参数；当前无采集时默认用项目名
  useEffect(() => {
    if (!current) return;
    if (collection.projectId === current.id) {
      setKeyword(collection.params.keyword || current.product);
      setPlatforms(collection.params.platforms.length ? collection.params.platforms : ['xiaohongshu', 'weibo', 'zhihu']);
      setTargetCount(collection.params.targetCount || 50);
      setFocus(collection.params.focus || '');
    } else {
      setKeyword(current.product);
      setPlatforms(['xiaohongshu', 'weibo', 'zhihu']);
      setTargetCount(50);
      setFocus('');
    }
  }, [current?.id, collection.projectId]);

  const togglePlatform = (p: string) =>
    setPlatforms((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  const start = () => {
    if (!current) return;
    if (!configured) return;
    if (!keyword.trim()) return;
    if (!platforms.length) return;
    startCollection(current.id, { keyword, platforms, targetCount, focus });
  };

  const checkedCount = collection.pending.filter((p) => p.checked).length;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">智能采集中心</h1>
        <p className="text-sm text-gray-500 mt-0.5">输入产品关键词，自动从公开渠道搜集用户评价并结构化入库</p>
      </div>

      {/* 合规提示 */}
      <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 text-blue-800 text-sm px-4 py-2.5">
        <ShieldCheck size={16} className="shrink-0" />
        采集内容来自公开渠道，仅供学术研究使用。平台不包含任何需要登录、绕过验证码或违反 robots 协议的爬虫；昵称等个人信息一律脱敏存储。
      </div>

      {!configured && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-2.5">
          <AlertTriangle size={16} className="shrink-0" />
          尚未配置大模型 API，「智能采集」不可用。请先到
          <a href="#/settings" className="font-medium underline">设置页</a>
          配置 baseURL、API Key 与模型名称；其余功能不受影响。
        </div>
      )}

      {isBusyElsewhere && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-2.5">
          <Loader2 size={16} className="shrink-0 animate-spin" />
          当前有其他项目正在采集，切换到「智能采集」对应项目可查看进度；
          <button className="font-medium underline" onClick={cancelCollection}>取消全部采集</button>
        </div>
      )}

      {/* 采集任务创建 */}
      <div className={`${cardCls} p-5`}>
        <h2 className="font-semibold text-gray-900 mb-4">创建采集任务</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">产品关键词</label>
            <input className={inputCls} value={keyword} onChange={(e) => setKeyword(e.target.value)}
              placeholder="默认取项目的目标产品" disabled={isRunningHere} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">期望采集数量</label>
            <input type="number" min={10} max={200} step={10} className={inputCls} value={targetCount}
              onChange={(e) => setTargetCount(parseInt(e.target.value, 10) || 50)} disabled={isRunningHere} />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">目标平台（多选）</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_KEYS.map((p) => (
              <button key={p} type="button" onClick={() => togglePlatform(p)} disabled={isRunningHere}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  platforms.includes(p)
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-primary/50'
                }`}>
                {PLATFORMS[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">关注点提示词（选填）</label>
          <input className={inputCls} value={focus} onChange={(e) => setFocus(e.target.value)}
            placeholder="如：重点关注清洁和便携相关反馈" disabled={isRunningHere} />
        </div>
        <div className="mt-5 flex items-center gap-3">
          {isRunningHere ? (
            <button className={btnSecondary} onClick={cancelCollection}>
              <AlertTriangle size={16} /> 停止采集
            </button>
          ) : (
            <button className={btnPrimary} onClick={start}
              disabled={!configured || !keyword.trim() || !platforms.length || collection.phase === 'running'}>
              <CloudDownload size={16} />
              开始采集
            </button>
          )}
          {!platforms.length && <span className="text-xs text-gray-400">请至少选择一个平台</span>}
        </div>
        {collection.error && (
          <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertTriangle size={15} /> {collection.error}
          </div>
        )}
      </div>

      {/* 实时进度（任何页面切换回来都能看到） */}
      {(isRunningHere || (collection.log.length > 0 && collection.projectId === current?.id)) && (
        <div className={`${cardCls} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 inline-flex items-center gap-2">
              {isRunningHere && <Loader2 size={16} className="animate-spin text-primary" />}
              采集进度
            </h2>
            {isRunningHere && (
              <span className="text-xs text-gray-400">离开本页后仍可继续运行，切换回来即可查看</span>
            )}
          </div>
          <div className="bg-gray-900 rounded-lg p-3 text-xs text-green-300 font-mono space-y-1 max-h-48 overflow-y-auto">
            {collection.log.map((line, i) => <p key={i}>{line}</p>)}
          </div>
        </div>
      )}

      {/* 待入库确认列表 */}
      {isConfirmHere && (
        <div className={`${cardCls} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">
              待入库列表 <span className="text-sm font-normal text-gray-500">（已选 {checkedCount} / {collection.pending.length} 条）</span>
            </h2>
            <div className="flex gap-2">
              <button className={btnSecondary} onClick={() => setPendingAllChecked(true)}>全选</button>
              <button className={btnSecondary} onClick={() => setPendingAllChecked(false)}>全不选</button>
              <button className={btnPrimary} disabled={!checkedCount} onClick={() => { confirmCollection(); window.location.hash = '#/reviews'; }}>
                <CheckCircle2 size={16} /> 确认入库（{checkedCount}）
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-2 w-8"></th>
                  <th className="py-2 pr-3">内容</th>
                  <th className="py-2 pr-3 w-28">平台</th>
                  <th className="py-2 pr-3 w-20">星级</th>
                  <th className="py-2 pr-3 w-20">溯源</th>
                  <th className="py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {collection.pending.map((p) => (
                  <tr key={p.id} className={`border-b border-gray-50 ${p.checked ? '' : 'opacity-50'}`}>
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={p.checked}
                        onChange={(e) => setPendingChecked(p.id, e.target.checked)} />
                    </td>
                    <td className="py-2 pr-3">
                      <p className="line-clamp-2 text-gray-800">{p.content}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.dup && <Badge color="amber">疑似重复</Badge>}
                        {p.keywords.map((k) => <Badge key={k}>{k}</Badge>)}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <select className={selectCls} value={p.platform}
                        onChange={(e) => updatePendingReview(p.id, (x) => ({ ...x, platform: e.target.value as Review['platform'] }))}>
                        {PLATFORM_KEYS.map((k) => <option key={k} value={k}>{PLATFORMS[k]}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <select className={selectCls} value={p.rating}
                        onChange={(e) => {
                          const rating = parseInt(e.target.value, 10) as Review['rating'];
                          updatePendingReview(p.id, (x) => ({ ...x, rating, sentiment: sentimentFromRating(rating) }));
                        }}>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} 星</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      {p.sourceUrl ? (
                        <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                          <ExternalLink size={13} /> 原文
                        </a>
                      ) : (
                        <Badge color="amber">待核实</Badge>
                      )}
                    </td>
                    <td className="py-2">
                      <button className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                        onClick={() => removePending(p.id)}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ManualEntry />
    </div>
  );
}

/** 手动录入（辅助兜底） */
function ManualEntry() {
  const { current, updateCurrent } = useStore();
  const [content, setContent] = useState('');
  const [platform, setPlatform] = useState<Review['platform']>('other');
  const [ratingChoice, setRatingChoice] = useState('auto');
  const [scenario, setScenario] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');

  const lines = useMemo(() => content.split('\n').map((l) => l.trim()).filter((l) => l.length >= 4), [content]);
  const parsedHint = useMemo(() => {
    if (!lines.length) return '';
    const r = parseRatingFromText(lines[0]);
    const kw = matchKeywords(lines[0]);
    return `首条预填：${r ? `${r} 星（${SENTIMENT_LABELS[sentimentFromRating(r)]}）` : '未识别到星级，默认 3 星'}${kw.length ? `；关键词：${kw.join('、')}` : ''}`;
  }, [lines]);

  if (!current) return null;

  const submit = () => {
    if (!lines.length) return;
    const now = new Date().toISOString();
    const reviews: Review[] = lines.map((line) => {
      const auto = parseRatingFromText(line);
      const rating = (ratingChoice === 'auto' ? (auto || 3) : parseInt(ratingChoice, 10)) as Review['rating'];
      return {
        id: uid(),
        content: line,
        platform,
        rating,
        keywords: matchKeywords(line),
        scenario: scenario.trim() || undefined,
        hasImage: false,
        sentiment: sentimentFromRating(rating),
        sourceUrl: sourceUrl.trim() || undefined,
        reviewDate: reviewDate || undefined,
        verified: !!sourceUrl.trim(),
        source: 'manual',
        note: note.trim() || undefined,
        createdAt: now,
        tags: [],
      };
    });
    updateCurrent((p) => ({ ...p, reviews: [...p.reviews, ...reviews] }));
    setContent('');
    setNote('');
    setMsg(`已录入 ${reviews.length} 条评价（手动录入）`);
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className={`${cardCls} p-5`}>
      <h2 className="font-semibold text-gray-900 mb-1 inline-flex items-center gap-2">
        <ClipboardPaste size={17} className="text-primary" /> 手动录入
      </h2>
      <p className="text-xs text-gray-400 mb-4 inline-flex items-center gap-1">
        <Info size={12} /> 用于补充需要登录才能查看的平台内容；每行一条，支持 “★★★★” 或 “4星 / 4分” 自动识别星级
      </p>
      <textarea className={inputCls} rows={4} value={content} onChange={(e) => setContent(e.target.value)}
        placeholder={'粘贴评价内容，每行一条，例如：\n★★★★ 萃取稳定油脂不错，就是预热有点慢\n水箱太难拆了，清洗一次要十分钟，2星不能再多'} />
      {parsedHint && (
        <p className="mt-2 text-xs text-gray-500 inline-flex items-center gap-1">
          <Wand2 size={12} className="text-primary" /> {parsedHint}
        </p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">平台</label>
          <select className={selectCls + ' w-full'} value={platform} onChange={(e) => setPlatform(e.target.value as Review['platform'])}>
            {PLATFORM_KEYS.map((k) => <option key={k} value={k}>{PLATFORMS[k]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">星级</label>
          <select className={selectCls + ' w-full'} value={ratingChoice} onChange={(e) => setRatingChoice(e.target.value)}>
            <option value="auto">自动识别（默认 3 星）</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} 星</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">使用场景（选填）</label>
          <input className={inputCls} value={scenario} onChange={(e) => setScenario(e.target.value)} placeholder="如：通勤" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">来源链接（选填，无链接将标记“待核实”）</label>
          <input className={inputCls} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">评价原始发布时间（选填）</label>
          <input type="date" className={inputCls} value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">研究者备注（选填）</label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button className={btnPrimary} disabled={!lines.length} onClick={submit}>
          <CheckCircle2 size={16} /> 录入 {lines.length ? `${lines.length} 条` : ''}
        </button>
        {lines.length > 0 && <RatingStars value={parseRatingFromText(lines[0]) || 3} />}
        {msg && <span className="text-sm text-green-600">{msg}</span>}
      </div>
    </div>
  );
}
