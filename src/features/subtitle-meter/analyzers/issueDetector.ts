import type { SubtitleCue, SubtitleIssue } from "../models";
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
  const ordered = [...cues].sort((a, b) => a.startMs - b.startMs);
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
  // 重叠：遍历所有成对组合（不只是相邻），交叠长度取两端交集，
  // 严格大于 0 才算重叠；每一对交叠的双方都要被指出。
  const overlapping = new Set<SubtitleCue>();
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i];
    for (let j = i + 1; j < ordered.length; j++) {
      const b = ordered[j];
      if (b.startMs >= a.endMs) break;
      const overlapMs =
        Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
      if (overlapMs <= 0) continue;
      const seconds = (overlapMs / 1000).toFixed(1);
      add(a, "overlap", "error", `与第 ${b.index} 条字幕重叠 ${seconds} 秒`);
      add(b, "overlap", "error", `与第 ${a.index} 条字幕重叠 ${seconds} 秒`);
      overlapping.add(a);
      overlapping.add(b);
    }
  }
  // 间隔：只看显示顺序相邻且首尾分离（gap > 0）的两条；
  // 条目自身参与了任何重叠时，不再给它发间隔提醒，避免两种口径重复。
  for (let i = 1; i < ordered.length; i++) {
    const cue = ordered[i],
      prev = ordered[i - 1];
    if (overlapping.has(cue)) continue;
    const gap = cue.startMs - prev.endMs;
    if (gap > 0 && gap < 120)
      add(cue, "too-short", "info", "与上一条间隔不足 0.12 秒");
  }
  return issues;
}
