import type { FixParams } from '../types';

interface Props {
  params: FixParams;
  onChange: (p: FixParams) => void;
  selectedCount: number;
  onSolve: () => void;
}

export function ParamsBar({ params, onChange, selectedCount, onSolve }: Props) {
  const set = (patch: Partial<FixParams>) =>
    onChange({ ...params, ...patch });

  return (
    <div className="panel">
      <h2>修复参数</h2>
      <div className="row spread">
        <div className="row">
          <div className="field">
            <label htmlFor="p-cps">每秒字符数 (CPS)</label>
            <input
              id="p-cps"
              type="number"
              min={1}
              max={60}
              step={0.5}
              value={params.cps}
              onChange={(e) => set({ cps: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="p-line">单行字数</label>
            <input
              id="p-line"
              type="number"
              min={1}
              max={200}
              value={params.lineLength}
              onChange={(e) => set({ lineLength: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="p-gap">最小提示间隔 (ms)</label>
            <input
              id="p-gap"
              type="number"
              min={0}
              max={10000}
              step={10}
              value={params.minGap}
              onChange={(e) => set({ minGap: Number(e.target.value) })}
            />
          </div>
          <span className="hint">
            已选 <b>{selectedCount}</b>/30 条连续字幕
          </span>
        </div>
        <button
          className="primary"
          disabled={selectedCount === 0 || selectedCount > 30}
          onClick={onSolve}
        >
          计算最优方案
        </button>
      </div>
    </div>
  );
}
