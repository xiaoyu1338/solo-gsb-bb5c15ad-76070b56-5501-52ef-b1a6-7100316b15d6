import type { SubtitleCue } from '../types';

/** SRT 时间码 "HH:MM:SS,mmm" -> 毫秒 */
export function parseTimeCode(tc: string): number | null {
  const m = tc.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) return null;
  const [, hh, mm, ss, ms] = m;
  return (
    Number(hh) * 3600_000 +
    Number(mm) * 60_000 +
    Number(ss) * 1000 +
    Number(ms.padEnd(3, '0'))
  );
}

/** 毫秒 -> "HH:MM:SS,mmm" */
export function formatTimeCode(ms: number): string {
  const clamp = Math.max(0, Math.round(ms));
  const hh = Math.floor(clamp / 3600_000);
  const mm = Math.floor((clamp % 3600_000) / 60_000);
  const ss = Math.floor((clamp % 60_000) / 1000);
  const mmm = clamp % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(hh)}:${p(mm)}:${p(ss)},${p(mmm, 3)}`;
}

/**
 * 解析 SRT 文本。兼容：
 * - 标准序号 + 时间码 + 文本（空行分隔）
 * - 缺失序号（直接以时间码开头）
 * - 时间码使用 "." 而非 ","
 */
export function parseSRT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    let cursor = 0;
    // 可选的序号行
    if (/^\d+$/.test(lines[0].trim())) cursor = 1;
    if (cursor >= lines.length) continue;

    const tcMatch = lines[cursor].match(
      /(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})/
    );
    if (!tcMatch) continue;

    const start = parseTimeCode(tcMatch[1]);
    const end = parseTimeCode(tcMatch[2]);
    if (start === null || end === null) continue;
    cursor += 1;

    const rawText = lines.slice(cursor).join('\n').trim();
    cues.push({
      index: cues.length + 1,
      start,
      end,
      rawText,
    });
  }
  return cues;
}

/** 导出 SRT：按数组顺序重新编号 */
export function buildSRT(cues: SubtitleCue[]): string {
  return cues
    .map(
      (c, i) =>
        `${i + 1}\n${formatTimeCode(c.start)} --> ${formatTimeCode(c.end)}\n${c.rawText.trim()}`
    )
    .join('\n\n') + '\n';
}
