import React, { useState } from 'react';
import { Loader2, PlugZap, CheckCircle2, AlertTriangle, KeyRound, Search } from 'lucide-react';
import { loadSettings, saveSettings } from '../lib/storage';
import { api, ApiError } from '../lib/api';
import { inputCls, btnPrimary, btnSecondary, cardCls } from '../components/ui';

export default function Settings() {
  const [form, setForm] = useState(loadSettings);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; detail?: Record<string, unknown> } | null>(null);

  const settings = () => ({
    baseURL: form.baseURL.trim(),
    apiKey: form.apiKey.trim(),
    model: form.model.trim(),
    bingApiKey: form.bingApiKey?.trim() || '',
  });

  const save = () => {
    saveSettings(settings());
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const test = async () => {
    saveSettings(settings());
    setTesting(true);
    setTestResult(null);
    try {
      await api.testConnection();
      setTestResult({ ok: true, msg: '连接成功，配置可用' });
    } catch (e) {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const msg = e instanceof Error ? e.message : '连接失败';
      setTestResult({ ok: false, msg, detail });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">设置</h1>
        <p className="text-sm text-gray-500 mt-0.5">配置大模型 API，用于「智能采集」与「AI 辅助生成」</p>
      </div>

      <div className={`${cardCls} p-5 space-y-4`}>
        <h2 className="font-semibold text-gray-900 inline-flex items-center gap-2">
          <KeyRound size={16} className="text-primary" /> 大模型 API 配置
        </h2>
        <p className="text-xs text-gray-400">
          兼容 OpenAI 格式的接口（Kimi / DeepSeek / 通义千问等）。配置仅保存在浏览器 localStorage，
          由本地后端服务转发调用，不会上传到任何第三方。「智能采集」需要模型具备联网搜索能力。
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
          <input className={inputCls} value={form.baseURL}
            onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
            placeholder="如：https://api.moonshot.cn/v1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
          <input type="password" className={inputCls} value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder="sk-…" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">模型名称</label>
          <input className={inputCls} value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="如：kimi-k2-0905-preview / deepseek-chat" />
        </div>

        <div className="border-t border-gray-100 pt-4">
          <h3 className="font-semibold text-gray-900 inline-flex items-center gap-2 mb-3">
            <Search size={16} className="text-primary" /> 真实采集配置（可选）
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            开启真实采集需要 Bing Search v7 API Key。用于从公开网页中抓取真实用户评价。
            可在 <a href="https://portal.azure.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Azure Portal</a> 申请，每月有 1000 次免费额度。
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bing Search API Key</label>
            <input type="password" className={inputCls} value={form.bingApiKey || ''}
              onChange={(e) => setForm({ ...form, bingApiKey: e.target.value })}
              placeholder="Bing Search v7 API Key" />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button className={btnPrimary} onClick={save}>
            <CheckCircle2 size={15} /> 保存配置
          </button>
          <button className={btnSecondary} onClick={test}
            disabled={testing || !form.baseURL.trim() || !form.apiKey.trim() || !form.model.trim()}>
            {testing ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />}
            测试连接
          </button>
          {saved && <span className="text-sm text-green-600">已保存</span>}
        </div>
        {testResult && (
          <div className={`text-sm rounded-lg px-3 py-2 space-y-1 ${
            testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}>
            <div className="flex items-center gap-2">
              {testResult.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              {testResult.msg}
            </div>
            {!testResult.ok && testResult.detail && (
              <div className="text-xs opacity-90 space-y-0.5 pl-5">
                {!!testResult.detail.endpoint && <p>端点：{String(testResult.detail.endpoint)}</p>}
                {!!testResult.detail.status && <p>状态码：{String(testResult.detail.status)}</p>}
                {!!testResult.detail.body && <p>响应：{String(testResult.detail.body)}</p>}
                {!!testResult.detail.hint && <p>提示：{String(testResult.detail.hint)}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
