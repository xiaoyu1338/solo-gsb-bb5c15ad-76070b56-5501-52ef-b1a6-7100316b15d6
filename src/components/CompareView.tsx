import type { SolveResult } from '../types';
import { formatTimeCode } from '../lib/srt';

interface Props {
  result: SolveResult;
}

function fmtDelta(ms: number): string {
  if (ms === 0) return '±0';
  return (ms > 0 ? '+' : '') + ms + 'ms';
}

/** 带逐字“移动”高亮的文本：↵ 标记断行位置（文字与顺序不变） */
function MovedText({
  flat,
  moved,
}: {
  flat: string;
  moved: boolean[];
}) {
  const chars = Array.from(flat);
  // 渲染单行片段；逐字“行归属变化”由父组件按行传入 moved 数组
  return (
    <>
      {chars.map((ch, i) =>
        moved[i] ? (
          <mark className="moved" key={i}>
            {ch}
          </mark>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </>
  );
}

export function CompareView({ result }: Props) {
  if (!result.ok) return null;
  const { solved } = result;

  return (
    <div className="panel">
      <h2>原稿 vs 修复结果</h2>
      <p className="hint">
        <mark className="moved">黄色</mark>
        标注因断句调整而“跨行移动”的文字；时间后的绿/红徽章为边界相对原稿的位移；
        ↵ 表示换行位置。
      </p>
      <div className="compare">
        {/* 原稿 */}
        <div className="compare-pane">
          <h3>原稿</h3>
          {solved.map((s) => (
            <div className="cue-card" key={s.index}>
              <div className="cue-time">
                #{s.index}　{formatTimeCode(s.oldStart)} →{' '}
                {formatTimeCode(s.oldEnd)}
                <span className="hint">
                  {' '}
                  （{s.oldEnd - s.oldStart}ms）
                </span>
              </div>
              <div className="cue-lines">
                {s.oldLines.map((line, i) => (
                  <div className="cue-line" key={i}>
                    {line}
                    {i < s.oldLines.length - 1 && <span> ↵</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 结果 */}
        <div className="compare-pane">
          <h3>修复结果</h3>
          {solved.map((s) => {
            const ds = s.newStart - s.oldStart;
            const de = s.newEnd - s.oldEnd;
            const oldBreaks = s.oldLines.length;
            return (
              <div className="cue-card" key={s.index}>
                <div className="cue-time">
                  #{s.index}　{formatTimeCode(s.newStart)} →{' '}
                  {formatTimeCode(s.newEnd)}
                  <span className="hint">
                    {' '}
                    （{s.newEnd - s.newStart}ms，{s.cps} CPS）
                  </span>
                  <span className={'badge ' + (ds === 0 ? 'info' : ds > 0 ? 'good' : 'bad')}>
                    起 {fmtDelta(ds)}
                  </span>
                  <span className={'badge ' + (de === 0 ? 'info' : de > 0 ? 'good' : 'bad')}>
                    止 {fmtDelta(de)}
                  </span>
                  {s.textChanged && (
                    <span className="badge warn">断句 {oldBreaks}→{s.newLines.length} 行</span>
                  )}
                </div>
                <div className="cue-lines">
                  {s.newLines.map((line, i) => {
                    const moved = s.movedByLine[i] ?? [];
                    const changedLine = moved.some(Boolean);
                    return (
                      <div
                        className={'cue-line' + (changedLine ? ' break-changed' : '')}
                        key={i}
                      >
                        <MovedText flat={line} moved={moved} />
                        {i < s.newLines.length - 1 && <span> ↵</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
