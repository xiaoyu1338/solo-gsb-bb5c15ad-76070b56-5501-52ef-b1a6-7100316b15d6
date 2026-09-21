import type {
  ConflictRule,
  FixParams,
  SolveResult,
  SolvedCue,
  SubtitleCue,
} from '../types';
import { charCount, originalLines, wrapWithDiff } from './textwrap';

/**
 * 求解器
 * ------
 * 对选取的 n 条连续字幕（保持文字与顺序、片段总起止时间不变），联合调整：
 *   1) 断句（每条字幕的换行位置，受“单行字数 L”限制）
 *   2) 毫秒边界（每条的开始/结束时间）
 * 满足：
 *   - 片段首条起点 = 原片段起点；末条终点 = 原片段终点（固定）
 *   - 每条时长 >= 字数 / CPS（每秒字符数限制）
 *   - 相邻两条：start_{i+1} - end_i >= G（最小提示间隔）
 * 目标：总边界移动量 Σ|新边界 - 原边界| 最小。
 *
 * 数学建模（差分约束 + L1 等距回归）：
 *   令 x_0=s1, x_1=e1, x_2=s2, x_3=e2, ..., x_{2n-1}=en（共 2n 个变量）
 *   - 固定：x_0 = S，x_{2n-1} = E
 *   - 相邻变量最小间隔 lower[k] = x[k+1] - x[k]：
 *       lower[2i]   = d_i （s_i 到 e_i 至少 d_i：CPS 最小时长）
 *       lower[2i+1] = G   （e_i 到 s_{i+1} 至少 G：最小提示间隔）
 *   - 令 u_k = x_k - cumLower_k，约束变为 u_0 <= u_1 <= ... <= u_{2n-1}，
 *     u_0、u_{2n-1} 钉死；目标变为对 u 的固定端点 L1 等距回归，
 *     用加权 PAVA（Pool Adjacent Violators Algorithm）取加权中位数全局最优。
 */

const clampInt = (v: number) => Math.max(0, Math.round(v));

export function solveSelection(cues: SubtitleCue[], params: FixParams): SolveResult {
  const n = cues.length;
  const conflicts: ConflictRule[] = [];
  const warnings: ConflictRule[] = [];
  const makeEmpty = (): SolveResult => ({
    ok: conflicts.length === 0,
    solved: [],
    conflicts: [...conflicts, ...warnings],
    stats: {
      totalMovement: 0,
      segmentStart: n ? cues[0].start : 0,
      segmentEnd: n ? cues[n - 1].end : 0,
      requiredDuration: 0,
      availableSpan: n ? cues[n - 1].end - cues[0].start : 0,
      textMovedCount: 0,
    },
  });

  if (n === 0) {
    conflicts.push({
      rule: '未选择字幕',
      detail: '请先选择至少 1 条连续字幕（至多 30 条）。',
      suggestion: '在字幕列表中设置起点与终点，选择需要修复的连续片段。',
    });
    return makeEmpty();
  }
  if (n > 30) {
    conflicts.push({
      rule: '选择数量超限',
      detail: `当前选择了 ${n} 条，单次最多处理 30 条连续字幕。`,
      suggestion: '缩小选择范围后重新计算。',
    });
    return makeEmpty();
  }

  const cps = Math.max(0.1, params.cps);
  const maxLine = Math.max(1, Math.floor(params.lineLength));
  const gap = Math.max(0, Math.round(params.minGap));

  // ---- 第一步：逐条重新断句，得到字数与 CPS 最小时长 ----
  interface Prepared {
    cue: SubtitleCue;
    newLines: string[];
    seps: string[];
    chars: number;
    minDuration: number;
    movedByLine: boolean[][];
    oldLines: string[];
  }

  const prepared: Prepared[] = cues.map((cue) => {
    const w = wrapWithDiff(cue.rawText, maxLine);
    const chars = charCount(w.flat);
    // 时长向上取整到毫秒；空文本给 1ms 占位
    const minDuration =
      chars === 0 ? 1 : Math.max(1, Math.ceil((chars * 1000) / cps));
    return {
      cue,
      newLines: w.lines,
      seps: w.seps,
      chars,
      minDuration,
      movedByLine: w.movedByLine,
      oldLines: originalLines(cue.rawText),
    };
  });

  const S = cues[0].start;
  const E = cues[n - 1].end;
  const span = E - S;

  // 变量 x: [s1, e1, s2, e2, ..., sn, en]，共 2n 个
  const m = 2 * n;
  const lower: number[] = new Array(m - 1).fill(0);
  for (let i = 0; i < n; i++) {
    lower[2 * i] = prepared[i].minDuration; // x[2i+1] - x[2i] >= d_i
    if (i < n - 1) lower[2 * i + 1] = gap; // x[2i+2] - x[2i+1] >= G
  }

  // 累积下界：u_k = x_k - cum[k] 后，u 单调不减
  const cum: number[] = new Array(m).fill(0);
  for (let k = 1; k < m; k++) cum[k] = cum[k - 1] + lower[k - 1];

  const required = cum[m - 1]; // 满足全部约束所需的最小总跨度
  const feasible = required <= span;

  if (!feasible) {
    const deficit = required - span;
    const durationSum = prepared.reduce((a, p) => a + p.minDuration, 0);

    // 逐条诊断：自身原始时长就不够的条目
    prepared.forEach((p) => {
      const ownDuration = p.cue.end - p.cue.start;
      const slack = ownDuration - p.minDuration;
      if (slack < 0) {
        conflicts.push({
          rule: `CPS=${cps} 过严：第 ${p.cue.index} 条时长不足`,
          detail:
            `该条 ${p.chars} 字，原始时长仅 ${ownDuration}ms，` +
            `按每秒字符数 ${cps} 至少需要 ${p.minDuration}ms，自身缺 ${-slack}ms，` +
            `且全片段可借用的时间仍无法弥补总缺口。`,
          suggestion: `调高每秒字符数上限（当前 ${cps}），或放宽单行字数（当前 ${maxLine}）。`,
        });
      }
    });

    // 间隙诊断：原稿相邻间隙距离最小间隔还差多少
    const gapShortfall =
      n > 1
        ? cues.reduce(
            (acc, c, i) =>
              i === 0
                ? acc
                : acc + Math.max(0, gap - (c.start - cues[i - 1].end)),
            0
          )
        : 0;

    conflicts.push({
      rule: '片段总起止固定，约束总时长超出可用跨度',
      detail:
        `片段固定跨度 ${span}ms（${S}ms → ${E}ms）；` +
        `各条按 CPS=${cps} 的最小时长合计 ${durationSum}ms` +
        (n > 1
          ? `，${n - 1} 处最小提示间隔（${gap}ms）合计 ${gap * (n - 1)}ms`
          : '') +
        `，约束共需 ${required}ms，超出可用跨度 ${deficit}ms。` +
        (gapShortfall > 0
          ? ` 原稿相邻间隙距“最小间隔 ${gap}ms”尚缺 ${gapShortfall}ms。`
          : ''),
      suggestion:
        '调高每秒字符数、放宽单行字数或减小最小提示间隔；' +
        '若仍无解，只能放宽片段总起止时间（本工具保证总起止不变，因此无解）。',
    });
  }

  // 原稿脏数据警告（不影响可行性，PAVA 会自动修正）
  for (const cue of cues) {
    if (cue.end < cue.start) {
      warnings.push({
        rule: `原稿时间异常：第 ${cue.index} 条结束早于开始`,
        detail: `start=${cue.start}ms，end=${cue.end}ms。`,
        suggestion: '求解器会在满足其它约束的前提下自动修正该边界。',
      });
    }
  }

  const x = new Array(m).fill(0);

  if (feasible) {
    // ---- 第二步：固定端点 L1 等距回归（加权 PAVA 取加权中位数）----
    // y[0]=S（左钉值），y[m-1]=E-required（右钉值）；
    // 两端给无穷权重，其所在块的加权中位数即被钉死。
    // y 与 cum 均为整数 ⇒ 加权中位数也是整数，不必再取整破坏间隔。
    const y = new Array(m);
    const w = new Array(m).fill(1);
    for (let k = 0; k < m; k++) y[k] = originalX(cues, k) - cum[k];
    w[0] = Number.POSITIVE_INFINITY;
    w[m - 1] = Number.POSITIVE_INFINITY;

    const u = isotonicL1(y, w);
    for (let k = 0; k < m; k++) x[k] = u[k] + cum[k];
    x[0] = S;
    x[m - 1] = E;

    if (import.meta.env.DEV) assertConstraints(x, lower, S, E, cum);
  }

  // ---- 组装结果 ----
  let solved: SolvedCue[] = [];
  let totalMovement = 0;
  let textMovedCount = 0;

  if (feasible) {
    solved = prepared.map((p, i) => {
      const newStart = clampInt(x[2 * i]);
      const newEnd = clampInt(x[2 * i + 1]);
      const duration = Math.max(1, newEnd - newStart);
      return {
        index: p.cue.index,
        oldStart: p.cue.start,
        oldEnd: p.cue.end,
        newStart,
        newEnd,
        oldLines: p.oldLines,
        newLines: p.newLines,
        charCount: p.chars,
        cps: Math.round((p.chars / duration) * 1000 * 10) / 10,
        durationMoved:
          Math.abs(newStart - p.cue.start) + Math.abs(newEnd - p.cue.end),
        textChanged:
          p.newLines.length !== p.oldLines.length ||
          p.newLines.some((l, idx) => l !== p.oldLines[idx]),
        movedByLine: p.movedByLine,
      };
    });

    totalMovement = solved.reduce((a, s) => a + s.durationMoved, 0);
    textMovedCount = prepared.reduce(
      (a, p) => a + p.movedByLine.flat().filter(Boolean).length,
      0
    );
  }

  return {
    ok: feasible,
    solved,
    conflicts: [...conflicts, ...warnings],
    stats: {
      totalMovement,
      segmentStart: S,
      segmentEnd: E,
      requiredDuration: required,
      availableSpan: span,
      textMovedCount,
    },
  };
}

/** 原始边界序列：x[2i]=s_i，x[2i+1]=e_i */
function originalX(cues: SubtitleCue[], k: number): number {
  const i = Math.floor(k / 2);
  return k % 2 === 0 ? cues[i].start : cues[i].end;
}

/**
 * 带权 L1 单调回归（PAVA）。
 * 块值取块内加权中位数；内部点取下中位数（L1 平坦区任一中位数皆最优）。
 * 端点权重 +∞，其所在块的加权中位数必为端点钉值。
 * 块记录在 y 中的下标区间 [lo, hi]，按区间识别端点，避免按值匹配。
 */
function isotonicL1(y: number[], w: number[]): number[] {
  interface Block {
    lo: number;
    hi: number;
    value: number;
  }
  const blocks: Block[] = [];

  for (let i = 0; i < y.length; i++) {
    const blk: Block = { lo: i, hi: i, value: y[i] };
    blocks.push(blk);

    while (blocks.length >= 2) {
      const a = blocks[blocks.length - 2];
      const b = blocks[blocks.length - 1];
      if (a.value <= b.value) break;
      blocks.length -= 2;
      const merged: Block = { lo: a.lo, hi: b.hi, value: 0 };
      merged.value = weightedMedian(
        y.slice(merged.lo, merged.hi + 1),
        w.slice(merged.lo, merged.hi + 1)
      );
      blocks.push(merged);
    }
  }

  const result: number[] = new Array(y.length);
  for (const blk of blocks) {
    for (let k = blk.lo; k <= blk.hi; k++) result[k] = blk.value;
  }
  return result;
}

/** 加权中位数：排序后累计权重首次达到总权重一半（下中位数） */
function weightedMedian(values: number[], weights: number[]): number {
  const pairs = values
    .map((v, i) => ({ v, w: weights[i] }))
    .sort((a, b) => a.v - b.v);
  const total = weights.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total)) {
    // 含钉死点：其值即为唯一中位数（若双钉同块，两钉在可行时必相等）
    return pairs.find((p) => !Number.isFinite(p.w))!.v;
  }
  let acc = 0;
  for (const p of pairs) {
    acc += p.w;
    if (acc >= total / 2) return p.v;
  }
  return pairs[pairs.length - 1].v;
}

/** 开发环境自检：验证约束满足、单调性与端点固定 */
function assertConstraints(
  x: number[],
  lower: number[],
  S: number,
  E: number,
  cum: number[]
): void {
  const errors: string[] = [];
  if (x[0] !== S) errors.push(`起点未固定: ${x[0]} != ${S}`);
  if (x[x.length - 1] !== E)
    errors.push(`终点未固定: ${x[x.length - 1]} != ${E}`);
  for (let k = 0; k < lower.length; k++) {
    if (x[k + 1] - x[k] < lower[k] - 1e-9) {
      errors.push(`间隔约束违反 k=${k}: ${x[k + 1] - x[k]} < ${lower[k]}`);
    }
  }
  const u = x.map((v, i) => v - cum[i]);
  for (let k = 1; k < u.length; k++) {
    if (u[k] + 1e-9 < u[k - 1]) {
      errors.push(`u 非单调 k=${k}: ${u[k - 1]} > ${u[k]}`);
    }
  }
  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[solver] 自检发现问题:\n' + errors.join('\n'));
  }
}
