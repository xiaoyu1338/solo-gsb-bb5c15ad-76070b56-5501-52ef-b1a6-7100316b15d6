/**
 * 求解器测试：约束满足、固定端点、最优性（小规模与线性规划结果暴力比对）、
 * 无解诊断、断句正确性。
 * 运行：npm run test:solver（基于 vite-node 直接执行 TS）
 */
import { solveSelection } from './solver';
import { wrapWithDiff, wrapText, normalizeLine, charCount } from './textwrap';
import { parseSRT, buildSRT } from './srt';
import type { FixParams, SubtitleCue } from '../types';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

function approx(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

/**
 * 精确最优基准（网格 DP）：
 * L1 最优点必可取在某个目标点 y_j = origX_j - cum_j 上（常数段 + 钉点）。
 * 按这些 u 值建网格，用“单调路径 DP”在固定端点、u 单调不减的约束下求最小
 * Σ|u_k - y_k|（与原目标等价，x = u + cum）。
 * 变量数 ≤ 8（n ≤ 4），网格极小，可覆盖全部随机用例。
 */
function dpOptimal(cues: SubtitleCue[], params: FixParams): number | null {
  const n = cues.length;
  const m = 2 * n;
  const d = cues.map((c) => {
    const flat = wrapWithDiff(c.rawText, params.lineLength).flat;
    const chars = charCount(flat);
    return chars === 0 ? 1 : Math.max(1, Math.ceil((chars * 1000) / params.cps));
  });
  const G = Math.max(0, Math.round(params.minGap));
  const S = cues[0].start;
  const E = cues[n - 1].end;
  const lower: number[] = new Array(m - 1).fill(0);
  for (let i = 0; i < n; i++) {
    lower[2 * i] = d[i];
    if (i < n - 1) lower[2 * i + 1] = G;
  }
  const cum = new Array(m).fill(0);
  for (let k = 1; k < m; k++) cum[k] = cum[k - 1] + lower[k - 1];
  if (cum[m - 1] > E - S) return null;

  const y = Array.from({ length: m }, (_, k) => {
    const ci = Math.floor(k / 2);
    return (k % 2 === 0 ? cues[ci].start : cues[ci].end) - cum[k];
  });
  // 候选 u 值：全部目标点 + 两端钉值，排序去重
  const pinnedLeft = S;
  const pinnedRight = E - cum[m - 1];
  const grid = Array.from(
    new Set([...y, pinnedLeft, pinnedRight])
  ).sort((a, b) => a - b);

  const cost = (k: number, g: number) => Math.abs(grid[g] - y[k]);
  // dp[g] = 上一变量取 grid[g] 且此前单调时的最小代价；k=0 钉在 pinnedLeft
  const lg = grid.indexOf(pinnedLeft);
  let dp = grid.map((_, g) => (g === lg ? 0 : Infinity));

  for (let k = 1; k < m; k++) {
    // 前缀最小值：允许 u_k >= u_{k-1}
    const prefixMin: number[] = [];
    let best = Infinity;
    for (let g = 0; g < grid.length; g++) {
      best = Math.min(best, dp[g]);
      prefixMin[g] = best;
    }
    const next = grid.map((_, g) => prefixMin[g] + cost(k, g));
    dp = next;
  }
  const rg = grid.indexOf(pinnedRight);
  return dp[rg] === Infinity ? null : dp[rg];
}

// ---------- 断句测试 ----------
console.log('断句：');
check(
  '纯中文按字断行（贪心 4 字）',
  JSON.stringify(wrapText('今天天气真好啊朋友', 4)) ===
    JSON.stringify(['今天天气', '真好啊朋', '友'])
);
check(
  '拉丁文按词不拆词',
  JSON.stringify(wrapText('hello world foo bar', 9)) === JSON.stringify(['hello', 'world foo', 'bar'])
);
check(
  '超长拉丁词才截开',
  JSON.stringify(wrapText('internationalization', 5)) ===
    JSON.stringify(['inter', 'natio', 'naliz', 'ation'])
);
check(
  '换行/多空格折叠为一空格，内容不变',
  normalizeLine('a   b c') === 'a b c'
);
check(
  '中文硬换行不凭空加空格（字数不随断行变化）',
  wrapWithDiff('今天\n天气', 3).flat === '今天天气'
);
check(
  '西文硬换行补空格',
  wrapWithDiff('Hello\nWorld', 20).flat === 'Hello World'
);
check(
  '中英混排（贪心，不拆拉丁词）',
  JSON.stringify(wrapText('Hello 世界 world', 7)) ===
    JSON.stringify(['Hello 世', '界 world'])
);

// ---------- 求解器测试 ----------
console.log('求解器：');

const params: FixParams = { cps: 20, lineLength: 20, minGap: 100 };

// 例 1：宽松可行，原稿已合规，应零移动
{
  const cues = [
    { index: 1, start: 0, end: 1000, rawText: '一二三四五' }, // 5字, minDur=250
    { index: 2, start: 1100, end: 2000, rawText: '一二三四五六七八' }, // 8字, 400
  ];
  const r = solveSelection(cues, params);
  check('已合规片段零移动', r.ok && r.stats.totalMovement === 0);
}

// 例 2：需要挤压间隙扩大时长
{
  const cues = [
    { index: 1, start: 0, end: 400, rawText: '一二三四五六七八九十' }, // 10字需500ms
    { index: 2, start: 500, end: 1500, rawText: '一二三四' }, // 4字需200
  ];
  const r = solveSelection(cues, params);
  check('挤压间隙后可行', r.ok);
  if (r.ok) {
    const [a, b] = r.solved;
    check('首起点固定', a.newStart === 0);
    check('末终点固定', b.newEnd === 1500);
    check('时长约束', a.newEnd - a.newStart >= 500 && b.newEnd - b.newStart >= 200);
    check('间隔约束', b.newStart - a.newEnd >= 100);
    check('s<=e', r.solved.every((s) => s.newEnd >= s.newStart));
  }
}

// 例 3：无解 —— CPS 过高（需要的总时长超跨度）
{
  const strict: FixParams = { cps: 5, lineLength: 100, minGap: 0 };
  const cues = [
    { index: 1, start: 0, end: 500, rawText: '一二三四五六七八九十' }, // 需2000ms
  ];
  const r = solveSelection(cues, strict);
  check('单条时长不足判无解', !r.ok && r.conflicts.length >= 1);
  check(
    '无解提示毫秒缺口',
    r.conflicts.some((c) => c.detail.includes('1500ms'))
  );
}

// 例 4：无解 —— 间隔要求无法满足
{
  const gap: FixParams = { cps: 1, lineLength: 100, minGap: 500 };
  const cues = [
    { index: 1, start: 0, end: 400, rawText: 'a' },
    { index: 2, start: 500, end: 1000, rawText: 'b' },
  ];
  // 需要 duration 1000ms each（1字@1cps）+ 500 gap = 2500 > 1000
  const r = solveSelection(cues, gap);
  check('间隔+时长超跨度判无解', !r.ok);
}

// 例 5：原稿重叠（脏数据），可行时自动修正
{
  const cues = [
    { index: 1, start: 0, end: 600, rawText: '一二三四' },
    { index: 2, start: 500, end: 1200, rawText: '五六七八' },
  ];
  const r = solveSelection(cues, params);
  check('重叠原稿被修正为可行', r.ok);
  if (r.ok) {
    check(
      '修正后不重叠且有间隔',
      r.solved[1].newStart - r.solved[0].newEnd >= 100
    );
  }
}

// 例 6：n=1，起止固定，仅断句变化
{
  const cues = [{ index: 1, start: 100, end: 2100, rawText: '一二三四五六七八九十' }];
  const p: FixParams = { cps: 20, lineLength: 5, minGap: 0 };
  const r = solveSelection(cues, p);
  check('单条可行且起止固定', r.ok && r.solved[0].newStart === 100 && r.solved[0].newEnd === 2100);
  check('断为两行', r.ok && r.solved[0].newLines.length === 2);
}

// ---------- 最优性：与完全枚举比对（多组随机小规模） ----------
console.log('最优性（网格 DP 比对，覆盖全部可行随机用例）：');
{
  const rng = mulberry32(42);
  let compared = 0;
  for (let trial = 0; trial < 300; trial++) {
    const n = 1 + Math.floor(rng() * 4); // 1..4 条（m ≤ 8）
    const cues: SubtitleCue[] = [];
    let t = Math.floor(rng() * 500);
    for (let i = 0; i < n; i++) {
      const start = t + Math.floor(rng() * 400);
      const end = start + 200 + Math.floor(rng() * 800);
      const chars = 1 + Math.floor(rng() * 10);
      cues.push({
        index: i + 1,
        start,
        end,
        rawText: '字'.repeat(chars),
      });
      t = end;
    }
    const p: FixParams = {
      cps: 5 + Math.floor(rng() * 40),
      lineLength: 2 + Math.floor(rng() * 20),
      minGap: [0, 50, 100, 200][Math.floor(rng() * 4)],
    };
    const r = solveSelection(cues, p);
    if (!r.ok) continue;
    const best = dpOptimal(cues, p);
    if (best === null) continue;
    compared++;
    check(
      `trial ${trial} (n=${n}, slack=${r.stats.availableSpan - r.stats.requiredDuration}) 目标 ${r.stats.totalMovement} = DP最优 ${best}`,
      r.stats.totalMovement === best,
      `got ${r.stats.totalMovement}, best ${best}`
    );
  }
  check(`至少完成 40 组 DP 比对（实际 ${compared}）`, compared >= 40);
}

// ---------- SRT 往返 ----------
console.log('SRT 解析/导出：');
{
  const srt = '1\n00:00:01,500 --> 00:00:02,000\nHello\nWorld\n\n2\n00:00:02.100 --> 00:00:03,000\nFoo\n';
  const cues = parseSRT(srt);
  check('解析两条', cues.length === 2);
  check('毫秒解析', cues[0].start === 1500 && cues[0].end === 2000);
  check('点号毫秒分隔兼容', cues[1].start === 2100);
  check('多行文本保留', cues[0].rawText === 'Hello\nWorld');
  const out = buildSRT(cues);
  check('导出可再解析', parseSRT(out).length === 2);
}

// 空选择与超量
{
  check('空选择无解提示', solveSelection([], params).ok === false);
  const many = Array.from({ length: 31 }, (_, i) => ({
    index: i + 1,
    start: i * 1000,
    end: i * 1000 + 900,
    rawText: 'a',
  }));
  check('超过30条拒绝', solveSelection(many, params).ok === false);
}

void approx;
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
