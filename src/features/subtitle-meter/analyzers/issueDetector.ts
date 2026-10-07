import type { SubtitleCue, SubtitleIssue } from "../models";

interface OverlapPair {
  a: SubtitleCue;
  b: SubtitleCue;
  overlapMs: number;
}

const MIN_GAP_MS = 120;

export function detectIssues(cues: SubtitleCue[]): SubtitleIssue[] {
  const issues: SubtitleIssue[] = [];
  const add = (
    cue: SubtitleCue,
    type: SubtitleIssue["type"],
    severity: SubtitleIssue["severity"],
    message: string,
  ) =>
    issues.push({
      id: `${cue.id}-${type}-${issues.length}`,
      cueId: cue.id,
      type,
      severity,
      message,
    });

  const ordered = [...cues].sort(
    (a, b) => a.startMs - b.startMs || a.index - b.index,
  );

  // 逐条检查自身问题
  ordered.forEach((cue) => {
    const duration = cue.endMs - cue.startMs,
      chars = [...cue.text.replace(/\s/g, "")].length;
    if (!cue.text.trim()) add(cue, "empty", "error", "字幕文本为空");
    if (duration <= 0)
      add(cue, "invalid-time", "error", "结束时间必须晚于开始时间");
    else {
      if (duration < 800)
        add(
          cue,
          "too-short",
          "warning",
          `显示仅 ${(duration / 1000).toFixed(1)} 秒`,
        );
      const cps = chars / (duration / 1000);
      if (cps > 18)
        add(cue, "too-fast", "warning", `阅读速度 ${cps.toFixed(1)} 字/秒`);
    }
    if (chars > 42 || cue.text.split("\n").length > 2)
      add(
        cue,
        "too-long",
        "warning",
        chars > 42 ? `${chars} 字，建议精简` : "超过两行，画面占用较高",
      );
  });

  // 时长非法的条目不参与时间关系判定
  const timed = ordered.filter((cue) => cue.endMs - cue.startMs > 0);

  // 找出所有真正交叠的条目对（含非相邻、连环交叠）。
  // 扫描线：active 保留结束时间晚于当前条目开始时间的在交条目，
  // 交叠时长只取两条真实交集 min(end) - max(start)。
  const pairs: OverlapPair[] = [];
  const active: SubtitleCue[] = [];
  timed.forEach((cue) => {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].endMs <= cue.startMs) {
        active.splice(i, 1);
        continue;
      }
      pairs.push({
        a: active[i],
        b: cue,
        overlapMs: Math.min(active[i].endMs, cue.endMs) - cue.startMs,
      });
    }
    active.push(cue);
  });

  // 每条参与交叠的条目只报一条，列出与它交叠的所有条目及各自真实交叠时长
  const partners = new Map<SubtitleCue, OverlapPair[]>();
  const remember = (cue: SubtitleCue, pair: OverlapPair) => {
    const list = partners.get(cue);
    if (list) list.push(pair);
    else partners.set(cue, [pair]);
  };
  pairs.forEach((pair) => {
    remember(pair.a, pair);
    remember(pair.b, pair);
  });
  const overlappingIds = new Set<string>();
  timed
    .filter((cue) => partners.has(cue))
    .forEach((cue) => {
      overlappingIds.add(cue.id);
      const detail = partners.get(cue)!.map((pair) => {
        const other = pair.a === cue ? pair.b : pair.a;
        return `第 ${other.index} 条（重叠 ${(pair.overlapMs / 1000).toFixed(1)} 秒）`;
      });
      add(cue, "overlap", "error", `与${detail.join("、")}字幕重叠`);
    });

  // 间隔只看按开始时间相邻的一对；自身参与交叠的条目已由重叠覆盖，不再重复提醒
  for (let i = 1; i < timed.length; i++) {
    const prev = timed[i - 1],
      cue = timed[i];
    const gapMs = cue.startMs - prev.endMs;
    if (gapMs >= 0 && gapMs < MIN_GAP_MS && !overlappingIds.has(cue.id))
      add(
        cue,
        "too-short",
        "info",
        `与上一条间隔不足 ${(MIN_GAP_MS / 1000).toFixed(2)} 秒`,
      );
  }

  return issues;
}
