import { useEffect, useMemo, useState } from 'react';
import type { FixParams, SolveResult, SubtitleCue } from './types';
import { buildSRT, parseSRT } from './lib/srt';
import { solveSelection } from './lib/solver';
import { DEFAULT_PARAMS, clearState, loadState, saveState } from './lib/storage';
import { ImportBar } from './components/ImportBar';
import { CueSelector } from './components/CueSelector';
import { ParamsBar } from './components/ParamsBar';
import { ResultStats } from './components/ResultStats';
import { Conflicts } from './components/Conflicts';
import { CompareView } from './components/CompareView';

const SAMPLE: SubtitleCue[] = [
  {
    index: 1,
    start: 0,
    end: 1600,
    rawText: '欢迎使用字幕节奏修复工具',
  },
  {
    index: 2,
    start: 1700,
    end: 3300,
    rawText: '导入 SRT 后选择最多三十条连续字幕',
  },
  {
    index: 3,
    start: 3400,
    end: 5000,
    rawText: '设置每秒字符数 单行字数 和最小提示间隔',
  },
];

export default function App() {
  const persisted = useMemo(() => loadState(), []);
  const [cues, setCues] = useState<SubtitleCue[]>(persisted.cues ?? []);
  const [fileName, setFileName] = useState<string>(persisted.fileName ?? '');
  const [startIdx, setStartIdx] = useState<number>(persisted.startIdx ?? 0);
  const [endIdx, setEndIdx] = useState<number>(
    persisted.endIdx ?? Math.min(2, (persisted.cues ?? SAMPLE).length - 1)
  );
  const [params, setParams] = useState<FixParams>(
    persisted.params ?? DEFAULT_PARAMS
  );
  const [result, setResult] = useState<SolveResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loadError, setLoadError] = useState<string>('');

  // 数据与配置持久化到浏览器（localStorage）
  useEffect(() => {
    if (cues.length > 0) {
      saveState({ cues, fileName, startIdx, endIdx, params });
    }
  }, [cues, fileName, startIdx, endIdx, params]);

  // 字幕数量变化后把选择范围夹紧到合法区间（至多 30 条）
  useEffect(() => {
    if (cues.length === 0) return;
    const s = Math.min(startIdx, cues.length - 1);
    const maxE = Math.min(cues.length - 1, s + 29);
    const e = Math.min(Math.max(endIdx, s), maxE);
    if (s !== startIdx || e !== endIdx) {
      setStartIdx(s);
      setEndIdx(e);
    }
    // 仅在字幕数量变化时需要收敛
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues.length]);

  // 参数或选择变化后，旧结果失效
  const invalidate =
    <T,>(fn: (arg: T) => void) =>
    (arg: T) => {
      fn(arg);
      setResult(null);
      setConfirmed(false);
    };

  const handleLoad = (content: string, name: string) => {
    const parsed = parseSRT(content);
    if (parsed.length === 0) {
      setLoadError('未能从文件中解析出任何字幕，请确认是标准 SRT 格式。');
      return;
    }
    setLoadError('');
    setCues(parsed);
    setFileName(name);
    setStartIdx(0);
    setEndIdx(Math.min(29, parsed.length - 1));
    setResult(null);
    setConfirmed(false);
  };

  const selected = cues.slice(startIdx, endIdx + 1);
  const selectedCount = selected.length;

  const handleSolve = () => {
    setResult(solveSelection(selected, params));
    setConfirmed(false);
  };

  const handleConfirm = () => {
    if (!result?.ok) return;
    // 确认：把求解后的边界与断句写回所选字幕（其余字幕不动，顺序保持）。
    // 用选择区间内的位置 i 映射，避免之前确认导致的重号问题。
    const next = cues.map((c) => ({ ...c }));
    result.solved.forEach((s, i) => {
      const idx = startIdx + i;
      next[idx] = {
        ...next[idx],
        start: s.newStart,
        end: s.newEnd,
        rawText: s.newLines.join('\n'),
      };
    });
    setCues(next);
    setConfirmed(true);
  };

  const handleExport = () => {
    const blob = new Blob([buildSRT(cues)], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName
      ? fileName.replace(/\.srt$/i, '') + '.fixed.srt'
      : 'subtitle.fixed.srt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    clearState();
    setCues([]);
    setFileName('');
    setResult(null);
    setConfirmed(false);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>字幕节奏修复</h1>
        <p>
          保持文字、顺序与片段总起止不变，联合调整断句与毫秒边界，
          在每秒字符数、单行字数、最小提示间隔限制下求总移动量最小的方案。
          所有数据仅保存在本浏览器中。
        </p>
      </header>

      <ImportBar fileName={fileName} onLoad={handleLoad} />
      {loadError && (
        <div className="conflict-item" style={{ marginBottom: 16 }}>
          {loadError}
        </div>
      )}

      {cues.length === 0 ? (
        <div className="panel">
          <div className="empty-hint">
            还没有导入字幕。你也可以
            <button
              style={{ margin: '0 8px' }}
              onClick={() => {
                setCues(SAMPLE);
                setFileName('示例字幕');
                setStartIdx(0);
                setEndIdx(SAMPLE.length - 1);
              }}
            >
              载入示例
            </button>
            快速体验。
          </div>
        </div>
      ) : (
        <>
          <CueSelector
            cues={cues}
            startIdx={startIdx}
            endIdx={endIdx}
            onChange={(s, e) => {
              setStartIdx(s);
              setEndIdx(e);
              setResult(null);
              setConfirmed(false);
            }}
          />

          <ParamsBar
            params={params}
            onChange={invalidate(setParams)}
            selectedCount={selectedCount}
            onSolve={handleSolve}
          />

          {result && (
            <>
              <ResultStats result={result} />
              <Conflicts result={result} />
              <CompareView result={result} />
              {result.ok && (
                <div className="panel">
                  <div className="row spread">
                    <span className="hint">
                      确认后将把修复方案应用到所选字幕；之后可导出完整 SRT
                      （未选中的字幕原样保留，序号会重新连续编号）。
                    </span>
                    <div className="row">
                      {!confirmed ? (
                        <button className="success" onClick={handleConfirm}>
                          确认应用修复
                        </button>
                      ) : (
                        <span className="badge good">已应用 ✓</span>
                      )}
                      <button onClick={handleExport}>导出 SRT</button>
                      <button onClick={handleClear}>清空数据</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {!result && (
            <div className="panel">
              <div className="row spread">
                <span className="hint">
                  设置参数后点击“计算最优方案”，将在此并排展示原稿与结果。
                </span>
                <button onClick={handleClear}>清空数据</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
