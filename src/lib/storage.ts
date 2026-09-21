import type { FixParams, SubtitleCue } from '../types';

const KEY = 'subtitle-rhythm-fixer:v1';

export interface PersistedState {
  cues: SubtitleCue[];
  fileName: string;
  startIdx: number;
  endIdx: number;
  params: FixParams;
}

export const DEFAULT_PARAMS: FixParams = {
  cps: 17,
  lineLength: 18,
  minGap: 120,
};

export function loadState(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch {
    return {};
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 存储已满或被禁用：静默忽略，不影响使用
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
