import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Project, Review } from './types';
import { loadData, saveData } from './lib/storage';
import { createSeedProject } from './lib/seed';
import { uid, similarity, sentimentFromRating, PLATFORMS, PLATFORM_KEYS } from './lib/utils';
import { api } from './lib/api';

export interface PendingReview extends Review {
  checked: boolean;
  dup: boolean;
}

export interface CollectionState {
  projectId: string | null;
  phase: 'idle' | 'running' | 'confirm';
  log: string[];
  error: string;
  pending: PendingReview[];
  params: {
    keyword: string;
    platforms: string[];
    targetCount: number;
    focus: string;
  };
}

interface StoreShape {
  projects: Project[];
  current: Project | null;
  currentId: string | null;
  saveError: string | null;
  globalSearch: string;
  collection: CollectionState;
  setGlobalSearch: (s: string) => void;
  setCurrentId: (id: string) => void;
  addProject: (input: { name: string; product: string; goal: string }) => string;
  deleteProject: (id: string) => void;
  updateProject: (id: string, fn: (p: Project) => Project) => void;
  updateCurrent: (fn: (p: Project) => Project) => void;
  importAll: (projects: Project[], currentId: string | null) => void;
  // 采集任务（跨页面保持运行）
  startCollection: (projectId: string, params: CollectionState['params']) => void;
  startSearchCollection: (projectId: string, params: CollectionState['params'] & { bingApiKey: string }) => void;
  cancelCollection: () => void;
  clearCollection: () => void;
  confirmCollection: () => void;
  setPendingChecked: (id: string, checked: boolean) => void;
  setPendingAllChecked: (checked: boolean) => void;
  removePending: (id: string) => void;
  updatePendingReview: (id: string, fn: (r: PendingReview) => PendingReview) => void;
}

const StoreCtx = createContext<StoreShape | null>(null);

function loadInitial(): { projects: Project[]; currentId: string | null } {
  const persisted = loadData();
  if (persisted) return persisted;
  const seed = createSeedProject();
  return { projects: [seed], currentId: seed.id };
}

const emptyCollection: CollectionState = {
  projectId: null,
  phase: 'idle',
  log: [],
  error: '',
  pending: [],
  params: { keyword: '', platforms: [], targetCount: 50, focus: '' },
};

function nowTime() {
  return new Date().toLocaleTimeString();
}

type AppState = { projects: Project[]; currentId: string | null; collection: CollectionState };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => ({ ...loadInitial(), collection: emptyCollection }));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');

  // 所有数据操作后自动保存到 localStorage；容量不足时提示导出备份
  useEffect(() => {
    const ok = saveData(state);
    setSaveError(ok ? null : '本地存储空间不足，数据可能未保存，请立即通过顶部「备份」导出 JSON 备份');
  }, [state]);

  const value = useMemo<StoreShape>(() => {
    const current = state.projects.find((p) => p.id === state.currentId) || state.projects[0] || null;

    const updateCollection = (patch: Partial<CollectionState>) =>
      setState((s) => ({
        ...s,
        collection: { ...s.collection, ...patch },
      }));

    const pushLog = (line: string) =>
      setState((s) => ({
        ...s,
        collection: { ...s.collection, log: [...s.collection.log, `[${nowTime()}] ${line}`] },
      }));

    const startCollection = (projectId: string, params: CollectionState['params']) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return;

      setState((s) => ({
        ...s,
        collection: {
          projectId,
          phase: 'running',
          log: [`[${nowTime()}] 开始采集…`],
          error: '',
          pending: [],
          params,
        },
      }));

      (async () => {
        const collected: PendingReview[] = [];
        const exclude = project.reviews.map((r) => r.content.slice(0, 40));
        const isDupInLib = (content: string) => project.reviews.some((r) => similarity(r.content, content) > 0.6);

        try {
          let remaining = Math.max(10, params.targetCount);
          let batchNo = 0;
          while (remaining > 0) {
            batchNo++;
            const batchSize = Math.min(10, remaining);
            pushLog(`正在搜集（第 ${batchNo} 批，目标 ${batchSize} 条）…`);
            const data = await api.collect({
              keyword: params.keyword.trim(),
              platforms: params.platforms,
              count: batchSize,
              focus: params.focus.trim(),
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
                platform: (PLATFORM_KEYS as string[]).includes(item.platform)
                  ? (item.platform as Review['platform'])
                  : 'other',
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
                checked: !dup,
                dup,
              });
            }
            pushLog(`本批获得 ${data.reviews.length} 条有效评价（累计 ${collected.length} 条）`);
            remaining = Math.max(10, params.targetCount) - collected.length;
          }
          if (!collected.length) {
            updateCollection({ phase: 'idle', error: '未采集到符合条件的评价，请调整关键词或平台后重试' });
            return;
          }
          pushLog(`采集完成，共 ${collected.length} 条待确认`);
          updateCollection({ phase: 'confirm', pending: collected });
        } catch (e) {
          updateCollection({ phase: 'idle', error: e instanceof Error ? e.message : '采集失败，请重试' });
        }
      })();
    };

    const startSearchCollection = (projectId: string, params: CollectionState['params'] & { bingApiKey: string }) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return;

      setState((s) => ({
        ...s,
        collection: {
          projectId,
          phase: 'running',
          log: [`[${nowTime()}] 开始真实采集（Bing Search）…`],
          error: '',
          pending: [],
          params,
        },
      }));

      (async () => {
        const collected: PendingReview[] = [];
        const exclude = project.reviews.map((r) => r.content.slice(0, 40));
        const isDupInLib = (content: string) => project.reviews.some((r) => similarity(r.content, content) > 0.6);

        try {
          let remaining = Math.max(10, params.targetCount);
          let batchNo = 0;
          while (remaining > 0) {
            batchNo++;
            const batchSize = Math.min(10, remaining);
            pushLog(`正在搜索并提取（第 ${batchNo} 批，目标 ${batchSize} 条）…`);
            const data = await api.searchCollect({
              bingApiKey: params.bingApiKey,
              keyword: params.keyword.trim(),
              platforms: params.platforms,
              count: batchSize,
              focus: params.focus.trim(),
              exclude: exclude.slice(-80),
            });
            pushLog('正在结构化与校验…');
            if (!data.reviews.length) {
              pushLog('搜索引擎已无更多新内容，采集提前结束');
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
                platform: (PLATFORM_KEYS as string[]).includes(item.platform)
                  ? (item.platform as Review['platform'])
                  : 'other',
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
                checked: !dup,
                dup,
              });
            }
            pushLog(`本批获得 ${data.reviews.length} 条有效评价（累计 ${collected.length} 条）`);
            remaining = Math.max(10, params.targetCount) - collected.length;
          }
          if (!collected.length) {
            updateCollection({ phase: 'idle', error: '未采集到符合条件的评价，请调整关键词或平台后重试' });
            return;
          }
          pushLog(`采集完成，共 ${collected.length} 条待确认`);
          updateCollection({ phase: 'confirm', pending: collected });
        } catch (e) {
          updateCollection({ phase: 'idle', error: e instanceof Error ? e.message : '采集失败，请重试' });
        }
      })();
    };

    return {
      projects: state.projects,
      current,
      currentId: current ? current.id : null,
      saveError,
      globalSearch,
      collection: state.collection,
      setGlobalSearch,
      setCurrentId: (id) => setState((s) => ({ ...s, currentId: id })),
      addProject: (input) => {
        const id = uid();
        const project: Project = {
          id,
          name: input.name,
          product: input.product,
          goal: input.goal,
          createdAt: new Date().toISOString(),
          reviews: [],
          insights: [],
          personas: [],
          journeyStages: [],
          competitors: [],
        };
        setState((s) => ({ ...s, projects: [...s.projects, project], currentId: id }));
        return id;
      },
      deleteProject: (id) =>
        setState((s) => {
          const projects = s.projects.filter((p) => p.id !== id);
          return {
            ...s,
            projects,
            currentId: s.currentId === id ? projects[0]?.id ?? null : s.currentId,
          };
        }),
      updateProject: (id: string, fn: (p: Project) => Project) =>
        setState((s) => ({
          ...s,
          projects: s.projects.map((p) => (p.id === id ? fn(p) : p)),
        })),
      updateCurrent: (fn: (p: Project) => Project) =>
        setState((s) => {
          const cur = s.projects.find((p) => p.id === s.currentId) || s.projects[0];
          if (!cur) return s;
          return { ...s, projects: s.projects.map((p) => (p.id === cur.id ? fn(p) : p)) };
        }),
      importAll: (projects: Project[], currentId: string | null) =>
        setState({ projects, currentId: currentId || projects[0]?.id || null, collection: emptyCollection }),
      startCollection,
      startSearchCollection,
      cancelCollection: () => updateCollection({ phase: 'idle', error: '采集已取消' }),
      clearCollection: () => setState((s) => ({ ...s, collection: emptyCollection })),
      confirmCollection: () => {
        const col = state.collection;
        if (!col.projectId || col.phase !== 'confirm') return;
        const toAdd = col.pending
          .filter((p: PendingReview) => p.checked)
          .map(({ checked, dup, ...rest }: PendingReview) => rest as Review);
        if (!toAdd.length) return;
        setState((s) => ({
          ...s,
          projects: s.projects.map((p) =>
            p.id === col.projectId ? { ...p, reviews: [...p.reviews, ...toAdd] } : p
          ),
          collection: emptyCollection,
        }));
      },
      setPendingChecked: (id: string, checked: boolean) =>
        setState((s) => ({
          ...s,
          collection: {
            ...s.collection,
            pending: s.collection.pending.map((p) => (p.id === id ? { ...p, checked } : p)),
          },
        })),
      setPendingAllChecked: (checked: boolean) =>
        setState((s) => ({
          ...s,
          collection: { ...s.collection, pending: s.collection.pending.map((p) => ({ ...p, checked })) },
        })),
      removePending: (id: string) =>
        setState((s) => ({
          ...s,
          collection: {
            ...s.collection,
            pending: s.collection.pending.filter((p) => p.id !== id),
          },
        })),
      updatePendingReview: (id: string, fn: (r: PendingReview) => PendingReview) =>
        setState((s) => ({
          ...s,
          collection: {
            ...s.collection,
            pending: s.collection.pending.map((p) => (p.id === id ? fn(p) : p)),
          },
        })),
    };
  }, [state, saveError, globalSearch]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): StoreShape {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
