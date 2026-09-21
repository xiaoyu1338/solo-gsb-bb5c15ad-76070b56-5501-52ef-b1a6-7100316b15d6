export interface SubtitleCue {
  /** 解析时的原始序号（从 1 开始） */
  index: number;
  /** 起始时间（毫秒） */
  start: number;
  /** 结束时间（毫秒） */
  end: number;
  /** 原始多行文本（\n 分隔），保持导入时的文字 */
  rawText: string;
}

export interface FixParams {
  /** 每秒字符数上限 */
  cps: number;
  /** 单行字数上限 */
  lineLength: number;
  /** 最小提示间隔（毫秒，上一条结束到下一条开始） */
  minGap: number;
}

export interface SolvedCue {
  index: number;
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  oldLines: string[];
  newLines: string[];
  charCount: number;
  cps: number;
  durationMoved: number;
  textChanged: boolean;
  /** 逐行、逐码点：该字符是否发生了“跨行移动”（用于高亮移动的文字） */
  movedByLine: boolean[][];
}

export interface SolveResult {
  ok: boolean;
  solved: SolvedCue[];
  conflicts: ConflictRule[];
  stats: {
    totalMovement: number;
    segmentStart: number;
    segmentEnd: number;
    requiredDuration: number;
    availableSpan: number;
    textMovedCount: number;
  };
}

export interface ConflictRule {
  rule: string;
  detail: string;
  suggestion: string;
}
