import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, CloudDownload, Database, BarChart3, Lightbulb, FileOutput,
  Settings as SettingsIcon, Search, Download, Upload, AlertTriangle, FlaskConical, Bot,
} from 'lucide-react';
import { useStore } from './store';
import { Project } from './types';
import { download } from './lib/utils';
import Dashboard from './pages/Dashboard';
import Collect from './pages/Collect';
import Reviews from './pages/Reviews';
import Analytics from './pages/Analytics';
import Insights from './pages/Insights';
import Output from './pages/Output';
import Agent from './pages/Agent';
import Settings from './pages/Settings';

const NAV = [
  { path: '/', label: '仪表盘', icon: LayoutDashboard },
  { path: '/collect', label: '智能采集', icon: CloudDownload },
  { path: '/reviews', label: '评价库', icon: Database },
  { path: '/analytics', label: '分析看板', icon: BarChart3 },
  { path: '/insights', label: '洞察工坊', icon: Lightbulb },
  { path: '/agent', label: 'Agent', icon: Bot },
  { path: '/output', label: '设计输出', icon: FileOutput },
  { path: '/settings', label: '设置', icon: SettingsIcon },
];

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const path = hash.replace(/^#/, '');
  return path.startsWith('/') ? path : '/';
}

export default function App() {
  const route = useHashRoute();
  const {
    projects, current, currentId, setCurrentId, saveError,
    globalSearch, setGlobalSearch, importAll,
  } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState('');

  const exportBackup = () => {
    const payload = {
      app: 'UserInsight',
      version: 1,
      exportedAt: new Date().toISOString(),
      projects,
      currentId,
    };
    download(`userinsight-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const list: Project[] = Array.isArray(parsed) ? parsed : parsed.projects;
        if (!Array.isArray(list) || !list.length || !list[0].name || !Array.isArray(list[0].reviews)) {
          throw new Error('bad format');
        }
        importAll(list, parsed.currentId || list[0].id);
        setImportMsg('导入成功');
      } catch {
        setImportMsg('导入失败：文件格式不正确');
      }
      setTimeout(() => setImportMsg(''), 3000);
    };
    reader.readAsText(file);
  };

  const renderPage = () => {
    if (!current) return <Dashboard />;
    switch (route) {
      case '/collect': return <Collect />;
      case '/reviews': return <Reviews />;
      case '/analytics': return <Analytics />;
      case '/insights': return <Insights />;
      case '/agent': return <Agent />;
      case '/output': return <Output />;
      case '/settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 侧边栏 */}
      <aside className="w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="flex items-center gap-2 px-5 h-14 border-b border-gray-100">
          <FlaskConical size={20} className="text-primary" />
          <span className="font-bold text-gray-900">UserInsight</span>
        </div>
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {NAV.map((item) => {
            const active = route === item.path || (item.path !== '/' && route.startsWith(item.path));
            return (
              <a
                key={item.path}
                href={`#${item.path}`}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-primary-50 text-primary' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <item.icon size={17} />
                {item.label}
              </a>
            );
          })}
        </nav>
        <p className="px-5 py-3 text-xs text-gray-400 border-t border-gray-100">用户研究平台 v1.0</p>
      </aside>

      {/* 主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏 */}
        <header className="h-14 shrink-0 bg-white border-b border-gray-200 flex items-center gap-3 px-5">
          {current ? (
            <select
              value={current.id}
              onChange={(e) => setCurrentId(e.target.value)}
              className="max-w-[240px] truncate rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
              title="切换当前项目"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-gray-400">暂无项目</span>
          )}
          {current && (
            <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
              评价 {current.reviews.length} 条
            </span>
          )}
          <div className="flex-1" />
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && route !== '/reviews') window.location.hash = '#/reviews';
              }}
              placeholder="全局搜索评价内容 / 关键词…"
              className="w-64 rounded-lg border border-gray-300 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={exportBackup}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary px-2 py-1.5 rounded-lg hover:bg-gray-100"
            title="导出全部项目数据为 JSON 备份"
          >
            <Download size={16} /> 备份
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary px-2 py-1.5 rounded-lg hover:bg-gray-100"
            title="从 JSON 备份导入恢复"
          >
            <Upload size={16} /> 导入
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFile} />
        </header>

        {saveError && (
          <div className="shrink-0 flex items-center gap-2 bg-red-50 text-red-700 text-sm px-5 py-2 border-b border-red-100">
            <AlertTriangle size={15} /> {saveError}
          </div>
        )}
        {importMsg && (
          <div className="shrink-0 bg-blue-50 text-blue-700 text-sm px-5 py-2 border-b border-blue-100">{importMsg}</div>
        )}

        <main className="flex-1 overflow-y-auto p-6">{renderPage()}</main>
      </div>
    </div>
  );
}
