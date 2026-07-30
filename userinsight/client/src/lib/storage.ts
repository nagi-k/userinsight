import { Project, LLMSettings } from '../types';

const DATA_KEY = 'userinsight-data-v1';
const SETTINGS_KEY = 'userinsight-settings-v1';

export interface PersistedData {
  projects: Project[];
  currentId: string | null;
}

export function loadData(): PersistedData | null {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.projects)) return null;
    return parsed as PersistedData;
  } catch {
    return null;
  }
}

/** 返回 true 表示保存成功；false 多为容量不足 */
export function saveData(data: { projects: Project[]; currentId: string | null }): boolean {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify({ projects: data.projects, currentId: data.currentId }));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      baseURL: parsed.baseURL || '',
      apiKey: parsed.apiKey || '',
      model: parsed.model || '',
    };
  } catch {
    return { baseURL: '', apiKey: '', model: '' };
  }
}

export function saveSettings(s: LLMSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // 设置保存失败不阻塞主流程
  }
}
