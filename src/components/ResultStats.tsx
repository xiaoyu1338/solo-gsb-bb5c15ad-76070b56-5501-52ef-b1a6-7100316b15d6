import type { SolveResult } from '../types';

interface Props {
  result: SolveResult;
}

export function ResultStats({ result }: Props) {
  if (!result.ok) return null;
  const { stats, solved } = result;
  const maxCps = solved.reduce((a, s) => Math.max(a, s.cps), 0);
  const movedBorders = solved.filter(
    (s) => s.newStart !== s.oldStart || s.newEnd !== s.oldEnd
  ).length;
  const movedTexts = solved.filter((s) => s.textChanged).length;

  return (
    <div className="panel">
      <h2>
        求解成功
        <span className="badge good">满足全部限制</span>
      </h2>
      <div className="stat-grid">
        <div className="stat">
          总边界移动量 <b>{stats.totalMovement}</b> ms（最优）
        </div>
        <div className="stat">
          移动边界的字幕 <b>{movedBorders}</b> 条
        </div>
        <div className="stat">
          调整断句的字幕 <b>{movedTexts}</b> 条
        </div>
        <div className="stat">
          跨行移动的文字 <b>{stats.textMovedCount}</b> 字
        </div>
        <div className="stat">
          实际峰值 <b>{maxCps}</b> CPS
        </div>
        <div className="stat">
          约束最小时长 / 可用跨度{' '}
          <b>
            {stats.requiredDuration}/{stats.availableSpan}
          </b>{' '}
          ms
        </div>
      </div>
      <p className="hint">
        片段总起止 {stats.segmentStart}ms → {stats.segmentEnd}ms 保持不变；
        文字内容与顺序不变，仅调整断句与毫秒边界。
      </p>
    </div>
  );
}
