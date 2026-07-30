import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Copy, CheckCircle2, Trash2, X } from 'lucide-react';
import { subscribeErrors, clearErrors, ErrorRecord } from '../lib/errorBus';

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

function recordToText(r: ErrorRecord): string {
  const lines = [
    `时间：${fmtTime(r.time)}`,
    `操作：${r.action}`,
    r.mode ? `调用通道：${r.mode}` : '',
    r.endpoint ? `请求地址：${r.endpoint}` : '',
    r.status !== undefined ? `HTTP 状态：${r.status || '（无响应）'}` : '',
    `错误信息：${r.message}`,
    r.body ? `响应内容：${r.body}` : '',
    r.hint ? `排查建议：${r.hint}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** 全局错误详情面板：固定在页面下方，任何 API 错误 / 运行时错误都会在此给出详细说明 */
export default function ErrorPanel() {
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(-1);

  useEffect(() => subscribeErrors(setErrors), []);

  const latest = errors[0];
  // 新错误到来时自动展开并取消关闭状态
  useEffect(() => {
    if (latest && latest.id !== dismissed) setOpen(true);
  }, [latest?.id]);

  if (!latest || latest.id === dismissed) return null;

  const copyAll = async () => {
    const text = errors.map(recordToText).join('\n\n---\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默失败
    }
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-[90] px-4 pb-3 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto rounded-xl border border-red-200 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden">
        {/* 标题栏 */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-2.5 bg-red-50 text-left hover:bg-red-100/70 transition-colors"
        >
          <AlertTriangle size={15} className="text-red-600 shrink-0" />
          <span className="text-sm font-medium text-red-700">
            {errors.length > 1 ? `${errors.length} 个错误` : '发生错误'} · 最新：{latest.action} — {latest.message}
          </span>
          <span className="flex-1" />
          <span className="text-xs text-red-400">{fmtTime(latest.time)}</span>
          {open ? <ChevronDown size={15} className="text-red-400" /> : <ChevronUp size={15} className="text-red-400" />}
        </button>

        {open && (
          <div className="max-h-[38vh] overflow-y-auto divide-y divide-red-50">
            {errors.map((r) => (
              <div key={r.id} className="px-4 py-3 text-sm space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                  <span>{fmtTime(r.time)}</span>
                  {r.mode && <span className="rounded-full bg-gray-100 px-2 py-0.5">{r.mode}</span>}
                  {r.status !== undefined && (
                    <span className={`rounded-full px-2 py-0.5 font-medium ${r.status === 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>
                      HTTP {r.status === 0 ? '无响应' : r.status}
                    </span>
                  )}
                </div>
                <p className="font-medium text-gray-900">
                  {r.action}：{r.message}
                </p>
                {r.endpoint && (
                  <p className="text-xs text-gray-500 break-all">
                    <span className="text-gray-400">请求地址：</span>{r.endpoint}
                  </p>
                )}
                {r.body && (
                  <pre className="text-xs bg-gray-50 border border-gray-100 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all text-gray-600 max-h-24 overflow-y-auto">
                    {r.body}
                  </pre>
                )}
                {r.hint && (
                  <p className="text-xs text-primary-700 bg-primary-50 rounded-lg px-2.5 py-1.5">
                    排查建议：{r.hint}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 操作栏 */}
        <div className="flex items-center gap-2 px-4 py-2 border-t border-red-100 bg-white">
          <button
            onClick={copyAll}
            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-primary px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
          >
            {copied ? <CheckCircle2 size={13} className="text-green-600" /> : <Copy size={13} />}
            {copied ? '已复制' : '复制全部错误详情'}
          </button>
          <button
            onClick={clearErrors}
            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-red-600 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
          >
            <Trash2 size={13} /> 清空记录
          </button>
          <span className="flex-1" />
          <button
            onClick={() => setDismissed(latest.id)}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
          >
            <X size={13} /> 暂时关闭
          </button>
        </div>
      </div>
    </div>
  );
}
