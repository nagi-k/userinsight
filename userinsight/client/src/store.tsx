import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Project } from './types';
import { loadData, saveData } from './lib/storage';
import { createSeedProject } from './lib/seed';
import { uid } from './lib/utils';

interface StoreShape {
  projects: Project[];
  current: Project | null;
  currentId: string | null;
  saveError: string | null;
  globalSearch: string;
  setGlobalSearch: (s: string) => void;
  setCurrentId: (id: string) => void;
  addProject: (input: { name: string; product: string; goal: string }) => string;
  deleteProject: (id: string) => void;
  updateProject: (id: string, fn: (p: Project) => Project) => void;
  updateCurrent: (fn: (p: Project) => Project) => void;
  importAll: (projects: Project[], currentId: string | null) => void;
}

const StoreCtx = createContext<StoreShape | null>(null);

function loadInitial(): { projects: Project[]; currentId: string | null } {
  const persisted = loadData();
  if (persisted) return persisted;
  const seed = createSeedProject();
  return { projects: [seed], currentId: seed.id };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(loadInitial);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');

  // 所有数据操作后自动保存到 localStorage；容量不足时提示导出备份
  useEffect(() => {
    const ok = saveData(state);
    setSaveError(ok ? null : '本地存储空间不足，数据可能未保存，请立即通过顶部「备份」导出 JSON 备份');
  }, [state]);

  const value = useMemo<StoreShape>(() => {
    const current = state.projects.find((p) => p.id === state.currentId) || state.projects[0] || null;
    return {
      projects: state.projects,
      current,
      currentId: current ? current.id : null,
      saveError,
      globalSearch,
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
        setState((s) => ({ projects: [...s.projects, project], currentId: id }));
        return id;
      },
      deleteProject: (id) =>
        setState((s) => {
          const projects = s.projects.filter((p) => p.id !== id);
          return {
            projects,
            currentId: s.currentId === id ? projects[0]?.id ?? null : s.currentId,
          };
        }),
      updateProject: (id, fn) =>
        setState((s) => ({
          ...s,
          projects: s.projects.map((p) => (p.id === id ? fn(p) : p)),
        })),
      updateCurrent: (fn) =>
        setState((s) => {
          const cur = s.projects.find((p) => p.id === s.currentId) || s.projects[0];
          if (!cur) return s;
          return { ...s, projects: s.projects.map((p) => (p.id === cur.id ? fn(p) : p)) };
        }),
      importAll: (projects, currentId) =>
        setState({ projects, currentId: currentId || projects[0]?.id || null }),
    };
  }, [state, saveError, globalSearch]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): StoreShape {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
