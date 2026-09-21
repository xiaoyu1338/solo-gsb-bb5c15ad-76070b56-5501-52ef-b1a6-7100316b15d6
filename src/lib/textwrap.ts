/**
 * 断句模块：在不改变文字内容与顺序的前提下，把字幕文本重新断成若干行，
 * 使每一行的字数不超过 maxLine。
 *
 * 规则：
 * - 文字与顺序完全不变；仅改变断行位置。
 * - 中文/日文/韩文等字符按单字可断；拉丁文按“词”整体移动，不拆词，
 *   仅当单个词本身超长时才按字截开。
 * - 换行处的连接符（影响 CPS 字数统计与逐字比对）：
 *     · 原文是普通空格 → 保留一个空格；
 *     · 原文是硬换行 → 两侧都是拉丁字母/数字时补一个空格，否则不补
 *       （中文换行不凭空产生空格，字数不随断行变化）；
 *     · 单词被强制截开 → 无连接符。
 * - 字符数按 Unicode 码点计（Array.from）。
 */

/** 清洗一行内部：连续非换行空白折叠为一个空格 */
export function normalizeLine(text: string): string {
  return text.replace(/[^\S\n]+/gu, ' ').trim();
}

/** 把原始多行文解析成行（保留换行语义） */
export function originalLines(rawText: string): string[] {
  return rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => normalizeLine(l))
    .filter((l) => l.length > 0);
}

export function charCount(text: string): number {
  return Array.from(text).length;
}

const LATIN_WORD = /[A-Za-z0-9_][A-Za-z0-9_'\-]*/u;
const WHITESPACE = /\s+/u;

const isLatin = (ch: string | undefined): boolean =>
  !!ch && /[A-Za-z0-9]/u.test(ch);

/** 硬换行两侧的连接符：拉丁-拉丁补空格，其余无 */
function hardSep(leftLine: string, rightFirst: string | undefined): string {
  const leftLast = Array.from(leftLine).pop();
  return isLatin(leftLast) && isLatin(rightFirst) ? ' ' : '';
}

/** 原稿行（均为硬换行分隔）连接后的连续文本 */
export function joinHardLines(lines: string[]): string {
  let out = '';
  lines.forEach((line, i) => {
    if (i > 0) out += hardSep(lines[i - 1], Array.from(line)[0]);
    out += line;
  });
  return out;
}

interface Atom {
  text: string;
  kind: 'word' | 'space';
  /** 该空白是否源自换行（硬换行） */
  hard?: boolean;
}

function tokenize(text: string): Atom[] {
  const atoms: Atom[] = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);

    const w = rest.match(LATIN_WORD);
    if (w && w.index === 0) {
      atoms.push({ text: w[0], kind: 'word' });
      i += w[0].length;
      continue;
    }

    const s = rest.match(WHITESPACE);
    if (s && s.index === 0) {
      atoms.push({ text: '', kind: 'space', hard: s[0].includes('\n') });
      i += s[0].length;
      continue;
    }

    const cp = Array.from(rest)[0];
    atoms.push({ text: cp, kind: 'word' });
    i += cp.length;
  }
  return atoms;
}

export interface WrapResult {
  lines: string[];
  /** seps[i] 为 line i 与 line i+1 之间的连接符（' ' 或 ''） */
  seps: string[];
  /** 连接后的连续文本（CPS 字数口径） */
  flat: string;
  /** 逐行、逐码点：该字符的“行归属”是否相对原稿发生变化 */
  movedByLine: boolean[][];
}

/**
 * 贪心断行并给出逐字移动标记。
 */
export function wrapWithDiff(rawText: string, maxLine: number): WrapResult {
  const limit = Math.max(1, Math.floor(maxLine));
  const cleanedLines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => normalizeLine(l))
    .filter((l) => l.length > 0);
  const text = cleanedLines.join('\n');
  if (text.length === 0) {
    return { lines: [''], seps: [], flat: '', movedByLine: [[]] };
  }

  const atoms = tokenize(text);
  const lines: string[] = [];
  const seps: string[] = [];
  let cur = '';
  /** 当前行尾由空白原子产生的连接符（' ' 或 ''），无则为 null */
  let tailSep: string | null = null;

  const nextWordFirst = (idx: number): string | undefined => {
    for (let j = idx + 1; j < atoms.length; j++) {
      if (atoms[j].kind === 'word') return Array.from(atoms[j].text)[0];
    }
    return undefined;
  };

  const pushCur = (sep: string) => {
    const trimmed = cur.replace(/\s+$/u, '');
    if (trimmed.length > 0) {
      lines.push(trimmed);
      seps.push(sep);
    }
    cur = '';
    tailSep = null;
  };

  for (let ai = 0; ai < atoms.length; ai++) {
    const atom = atoms[ai];

    if (atom.kind === 'space') {
      if (cur === '') continue; // 行首空白丢弃
      const sep = atom.hard ? hardSep(cur, nextWordFirst(ai)) : ' ';
      if (charCount(cur) + sep.length <= limit) {
        cur += sep;
        tailSep = sep;
      } else {
        pushCur(sep); // 直接在空白处断行
      }
      continue;
    }

    let piece = atom.text;

    // 行尾已有连接符但放不下该词：撤回连接符并在该处断行
    if (tailSep !== null && charCount(cur) + charCount(piece) > limit) {
      cur = cur.slice(0, cur.length - tailSep.length);
      pushCur(tailSep);
    }

    // 单词（含超长拉丁词）按 limit 强制切片，切片处无连接符
    while (charCount(cur + piece) > limit) {
      const remainCap = limit - charCount(cur);
      if (remainCap > 0) {
        const chars = Array.from(piece);
        cur += chars.slice(0, remainCap).join('');
        piece = chars.slice(remainCap).join('');
      }
      pushCur('');
    }
    cur += piece;
    tailSep = null;
  }
  if (cur.trim().length > 0) pushCur('');
  if (lines.length === 0) {
    lines.push('');
    seps.pop();
  } else {
    seps.pop(); // 最后一次 pushCur 多压了一个尾部连接符
  }

  const flat = joinWith(lines, seps);
  const movedByLine = diffByLine(cleanedLines, lines, seps);

  return { lines, seps, flat, movedByLine };
}

function joinWith(lines: string[], seps: string[]): string {
  let out = '';
  lines.forEach((line, i) => {
    if (i > 0) out += seps[i - 1];
    out += line;
  });
  return out;
}

/** 比较原稿行起点与新行起点，在新行的逐字数组上标记行归属变化 */
function diffByLine(
  oldLines: string[],
  newLines: string[],
  newSeps: string[]
): boolean[][] {
  const oldFlat = joinHardLines(oldLines);
  const newFlat = joinWith(newLines, newSeps);

  const oldStarts = hardLineStarts(oldLines);
  const newStarts = new Map<number, number>(); // flat 偏移 -> 行号
  let off = 0;
  newLines.forEach((line, i) => {
    newStarts.set(off, i);
    off += charCount(line) + (i < newSeps.length ? newSeps[i].length : 0);
  });

  const changedFlat = new Array(Math.max(charCount(oldFlat), charCount(newFlat)))
    .fill(false);
  for (const pos of new Set<number>([...oldStarts, ...newStarts.keys()])) {
    if (oldStarts.has(pos) !== newStarts.has(pos)) changedFlat[pos] = true;
  }

  const movedByLine: boolean[][] = newLines.map(() => []);
  let o = 0;
  newLines.forEach((line, i) => {
    movedByLine[i] = changedFlat.slice(o, o + charCount(line));
    o += charCount(line) + (i < newSeps.length ? newSeps[i].length : 0);
  });
  return movedByLine;
}

function hardLineStarts(lines: string[]): Set<number> {
  const starts = new Set<number>();
  let off = 0;
  lines.forEach((line, i) => {
    starts.add(off);
    off += charCount(line);
    if (i < lines.length - 1) {
      off += hardSep(line, Array.from(lines[i + 1])[0]).length;
    }
  });
  return starts;
}

/** 兼容旧调用：仅返回断好的行 */
export function wrapText(rawText: string, maxLine: number): string[] {
  return wrapWithDiff(rawText, maxLine).lines;
}
