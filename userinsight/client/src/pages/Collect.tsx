import React, { useEffect, useMemo, useState } from 'react';
import {
  CloudDownload, Loader2, AlertTriangle, ShieldCheck, CheckCircle2, Trash2,
  ExternalLink, ClipboardPaste, Wand2, Info,
} from 'lucide-react';
import { useStore } from '../store';
import { Review } from '../types';
import { api, hasSettings } from '../lib/api';
import {
  PLATFORMS, PLATFORM_KEYS, uid, similarity, sentimentFromRating,
  parseRatingFromText, matchKeywords, SENTIMENT_LABELS,
} from '../lib/utils';
import { Badge, RatingStars, inputCls, selectCls, btnPrimary, btnSecondary, cardCls } from '../components/ui';

interface PendingReview extends Review {
  checked: boolean;
  dup: boolean;
}

type Phase = 'idle' | 'running' | 'confirm';

export default function Collect() {
  const { current, updateCurrent } = useStore();
  const [keyword, setKeyword] = useState(current?.product || '');
  const [platforms, setPlatforms] = useState<string[]>(['xiaohongshu', 'weibo', 'zhihu']);
  const [targetCount, setTargetCount] = useState(50);
  const [focus, setFocus] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingReview[]>([]);

  useEffect(() => {
    if (current) setKeyword(current.product);
    setPhase('idle');
    setPending([]);
    setLog([]);
    setError('');
  }, [current?.id]);

  const configured = hasSettings();

  const togglePlatform = (p: string) =>
    setPlatforms((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  const pushLog = (line: string) => setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${line}`]);

  const startCollect = async () => {
    if (!current) return;
    if (!configured) {
      setError('请先在设置页配置大模型 API Key');
      return;
    }
    if (!keyword.trim()) {
      setError('请输入产品关键词');
      return;
    }
    setError('');
    setPending([]);
    setLog([]);
    setPhase('running');
    const collected: PendingReview[] = [];
    // 排除库内已有内容，避免重复采集
    const exclude = current.reviews.map((r) => r.content.slice(0, 40));
    const isDupInLib = (content: string) => current.reviews.some((r) => similarity(r.content, content) > 0.6);

    try {
      let remaining = Math.max(10, targetCount);
      let batchNo = 0;
      while (remaining > 0) {
        batchNo++;
        const batchSize = Math.min(20, remaining); // 单次最多 20 条，分批避免超时
        pushLog(`正在搜集（第 ${batchNo} 批，目标 ${batchSize} 条）…`);
        const data = await api.collect({
          keyword: keyword.trim(),
          platforms,
          count: batchSize,
          focus: focus.trim(),
          exclude: exclude.slice(-80),
        });
        pushLog('正在结构化与校验…');
        if (!data.reviews.length) {
          pushLog('模型已无更多新内容，采集提前结束');
          break;
        }
        for (const item of data.reviews) {
          const rating = (Math.min(5, Math.max(1, Math.round(item.rating))) || 3) as Review['rating'];
          const content = item.content.trim();
          const dup = isDupInLib(content) || collected.some((c) => similarity(c.content, content) > 0.6);
          exclude.push(content.slice(0, 40));
          collected.push({
            id: uid(),
            content,
            platform: (PLATFORM_KEYS as string[]).includes(item.platform) ? (item.platform as Review['platform']) : 'other',
            rating,
            keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 6) : [],
            painPointType: item.painPointType as Review['painPointType'],
            scenario: item.scenario,
            hasImage: !!item.hasImage,
            sentiment: (item.sentiment as Review['sentiment']) || sentimentFromRating(rating),
            sourceUrl: item.sourceUrl,
            authorName: item.authorName,
            reviewDate: item.reviewDate,
            likeCount: item.likeCount,
            verified: !!item.verified,
            source: 'auto',
            createdAt: new Date().toISOString(),
            tags: [],
            checked: !dup, // 疑似重复默认不勾选
            dup,
          });
        }
        pushLog(`本批获得 ${data.reviews.length} 条有效评价（累计 ${collected.length} 条）`);
        remaining = Math.max(10, targetCount) - collected.length;
      }
      if (!collected.length) {
        setError('未采集到符合条件的评价，请调整关键词或平台后重试');
        setPhase('idle');
        return;
      }
      pushLog(`采集完成，共 ${collected.length} 条待确认`);
      setPending(collected);
      setPhase('confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : '采集失败，请重试');
      setPhase('idle');
    }
  };

  const checkedCount = pending.filter((p) => p.checked).length;

  const confirmImport = () => {
    if (!current) return;
    const toAdd = pending
      .filter((p) => p.checked)
      .map(({ checked, dup, ...rest }) => rest as Review);
    if (!toAdd.length) return;
    updateCurrent((p) => ({ ...p, reviews: [...p.reviews, ...toAdd] }));
    setPending([]);
    setPhase('idle');
    setLog([]);
    window.location.hash = '#/reviews';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">智能采集中心</h1>
        <p className="text-sm text-gray-500 mt-0.5">输入产品关键词，自动从公开渠道搜集用户评价并结构化入库</p>
      </div>

      {/* 合规提示（固定显示） */}
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

      {/* 采集任务创建 */}
      <div className={`${cardCls} p-5`}>
        <h2 className="font-semibold text-gray-900 mb-4">创建采集任务</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">产品关键词</label>
            <input className={inputCls} value={keyword} onChange={(e) => setKeyword(e.target.value)}
              placeholder="默认取项目的目标产品" disabled={phase === 'running'} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">期望采集数量</label>
            <input type="number" min={10} max={200} step={10} className={inputCls} value={targetCount}
              onChange={(e) => setTargetCount(parseInt(e.target.value, 10) || 50)} disabled={phase === 'running'} />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">目标平台（多选）</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_KEYS.map((p) => (
              <button key={p} type="button" onClick={() => togglePlatform(p)} disabled={phase === 'running'}
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
            placeholder="如：重点关注清洁和便携相关反馈" disabled={phase === 'running'} />
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button className={btnPrimary} onClick={startCollect}
            disabled={phase === 'running' || !configured || !keyword.trim() || !platforms.length}>
            {phase === 'running' ? <Loader2 size={16} className="animate-spin" /> : <CloudDownload size={16} />}
            {phase === 'running' ? '采集中…' : '开始采集'}
          </button>
          {!platforms.length && <span className="text-xs text-gray-400">请至少选择一个平台</span>}
        </div>
        {error && (
          <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertTriangle size={15} /> {error}
          </div>
        )}
      </div>

      {/* 实时进度 */}
      {(phase === 'running' || log.length > 0) && (
        <div className={`${cardCls} p-5`}>
          <h2 className="font-semibold text-gray-900 mb-3 inline-flex items-center gap-2">
            {phase === 'running' && <Loader2 size={16} className="animate-spin text-primary" />}
            采集进度
          </h2>
          <div className="bg-gray-900 rounded-lg p-3 text-xs text-green-300 font-mono space-y-1 max-h-48 overflow-y-auto">
            {log.map((line, i) => <p key={i}>{line}</p>)}
          </div>
        </div>
      )}

      {/* 待入库确认列表 */}
      {phase === 'confirm' && (
        <div className={`${cardCls} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">
              待入库列表 <span className="text-sm font-normal text-gray-500">（已选 {checkedCount} / {pending.length} 条）</span>
            </h2>
            <div className="flex gap-2">
              <button className={btnSecondary} onClick={() => setPending((s) => s.map((p) => ({ ...p, checked: true })))}>全选</button>
              <button className={btnSecondary} onClick={() => setPending((s) => s.map((p) => ({ ...p, checked: false })))}>全不选</button>
              <button className={btnPrimary} disabled={!checkedCount} onClick={confirmImport}>
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
                {pending.map((p) => (
                  <tr key={p.id} className={`border-b border-gray-50 ${p.checked ? '' : 'opacity-50'}`}>
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={p.checked}
                        onChange={(e) => setPending((s) => s.map((x) => (x.id === p.id ? { ...x, checked: e.target.checked } : x)))} />
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
                        onChange={(e) => setPending((s) => s.map((x) => (x.id === p.id ? { ...x, platform: e.target.value as Review['platform'] } : x)))}>
                        {PLATFORM_KEYS.map((k) => <option key={k} value={k}>{PLATFORMS[k]}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <select className={selectCls} value={p.rating}
                        onChange={(e) => {
                          const rating = parseInt(e.target.value, 10) as Review['rating'];
                          setPending((s) => s.map((x) => (x.id === p.id ? { ...x, rating, sentiment: sentimentFromRating(rating) } : x)));
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
                        onClick={() => setPending((s) => s.filter((x) => x.id !== p.id))}>
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

/** 手动录入（辅助兜底）：支持单条 / 批量粘贴，基于规则辅助预填 */
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
        // 无法溯源的内容标记为待核实
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
