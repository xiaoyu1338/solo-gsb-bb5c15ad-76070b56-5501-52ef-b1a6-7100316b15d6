import type { SubtitleCue } from '../types';
import { formatTimeCode } from '../lib/srt';

interface Props {
  cues: SubtitleCue[];
  startIdx: number;
  endIdx: number;
  onChange: (startIdx: number, endIdx: number) => void;
}

const MAX_SELECT = 30;

export function CueSelector({ cues, startIdx, endIdx, onChange }: Props) {
  if (cues.length === 0) return null;

  const inRange = (i: number) => i >= startIdx && i <= endIdx;

  const handleRowClick = (i: number, shiftKey: boolean) => {
    if (shiftKey) {
      // 设为终点，夹在 [起点, 起点+29] 之间
      const next = Math.min(
        cues.length - 1,
        Math.max(startIdx, Math.min(i, startIdx + MAX_SELECT - 1))
      );
      onChange(startIdx, next);
    } else {
      // 设为起点，终点默认保持长度，夹到合法范围
      const length = Math.min(
        MAX_SELECT,
        cues.length - i,
        Math.max(1, endIdx - startIdx + 1)
      );
      onChange(i, i + length - 1);
    }
  };

  return (
    <div className="panel">
      <div className="row spread" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>选择连续字幕（至多 {MAX_SELECT} 条）</h2>
        <div className="row">
          <div className="field">
            <label>起点</label>
            <select
              value={startIdx}
              onChange={(e) => {
                const s = Number(e.target.value);
                const length = Math.min(
                  MAX_SELECT,
                  cues.length - s,
                  Math.max(1, endIdx - startIdx + 1)
                );
                onChange(s, s + length - 1);
              }}
            >
              {cues.map((c, i) => (
                <option key={i} value={i}>
                  #{c.index}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>终点</label>
            <select
              value={endIdx}
              onChange={(e) => onChange(startIdx, Number(e.target.value))}
            >
              {cues.map((c, i) => (
                <option
                  key={i}
                  value={i}
                  disabled={i < startIdx || i > startIdx + MAX_SELECT - 1}
                >
                  #{c.index}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => onChange(0, Math.min(MAX_SELECT - 1, cues.length - 1))}
          >
            前 30 条
          </button>
        </div>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        点击行设为起点；按住 Shift 点击行设为终点。
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 56 }}>序号</th>
              <th style={{ width: 200 }}>开始</th>
              <th style={{ width: 200 }}>结束</th>
              <th>文字</th>
            </tr>
          </thead>
          <tbody>
            {cues.map((c, i) => (
              <tr
                key={i}
                className={
                  'clickable' +
                  (inRange(i) ? ' selected' : '') +
                  (i === startIdx ? ' range-head' : '') +
                  (i === endIdx ? ' range-tail' : '')
                }
                onClick={(e) => handleRowClick(i, e.shiftKey)}
              >
                <td>
                  #{c.index}
                  {i === startIdx && <span className="badge info">起</span>}
                  {i === endIdx && startIdx !== endIdx && (
                    <span className="badge info">止</span>
                  )}
                </td>
                <td className="cue-time">{formatTimeCode(c.start)}</td>
                <td className="cue-time">{formatTimeCode(c.end)}</td>
                <td className="text-cell">{c.rawText.replace(/\n/g, ' / ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
