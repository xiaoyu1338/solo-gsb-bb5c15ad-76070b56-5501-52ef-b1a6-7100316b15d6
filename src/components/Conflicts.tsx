import type { SolveResult } from '../types';

interface Props {
  result: SolveResult;
}

export function Conflicts({ result }: Props) {
  if (result.ok) return null;
  const errors = result.conflicts.filter((c) => !c.rule.includes('原稿时间异常'));
  const warnings = result.conflicts.filter((c) => c.rule.includes('原稿时间异常'));

  return (
    <div className="panel">
      <h2>
        无解：冲突规则
        <span className="badge bad">{errors.length} 项冲突</span>
      </h2>
      <div className="conflict-list">
        {errors.map((c, i) => (
          <div className="conflict-item" key={`e${i}`}>
            <div className="rule">⛔ {c.rule}</div>
            <div>{c.detail}</div>
            <div className="suggestion">建议：{c.suggestion}</div>
          </div>
        ))}
        {warnings.map((c, i) => (
          <div className="conflict-item warning" key={`w${i}`}>
            <div className="rule">⚠️ {c.rule}</div>
            <div>{c.detail}</div>
            <div className="suggestion">{c.suggestion}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
