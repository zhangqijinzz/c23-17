import { describe, expect, it } from "vitest";
import { detectIssues } from "../analyzers/issueDetector";
import type { SubtitleCue } from "../models";
const cue = (
  id: string,
  startMs: number,
  endMs: number,
  text = "字幕内容",
): SubtitleCue => ({ id, index: Number(id), startMs, endMs, text });

const overlaps = (issues: ReturnType<typeof detectIssues>) =>
  issues.filter((i) => i.type === "overlap");
const gapInfos = (issues: ReturnType<typeof detectIssues>) =>
  issues.filter((i) => i.type === "too-short" && i.severity === "info");

describe("issue detection", () => {
  it("distinguishes touching edges from overlap", () => {
    expect(
      detectIssues([cue("1", 0, 1000, "A"), cue("2", 1000, 2000, "B")]).some(
        (i) => i.type === "overlap",
      ),
    ).toBe(false);
    expect(
      detectIssues([cue("1", 0, 1300, "A"), cue("2", 1000, 2000, "B")]).some(
        (i) => i.type === "overlap",
      ),
    ).toBe(true);
  });
  it("detects empty, short, fast, and long captions", () => {
    const issues = detectIssues([
      cue("1", 0, 100, ""),
      cue("2", 1000, 1300, "这是一个用于检查速度的非常长的字幕内容".repeat(3)),
    ]);
    expect(issues.map((i) => i.type)).toEqual(
      expect.arrayContaining(["empty", "too-short", "too-fast", "too-long"]),
    );
  });

  it("measures overlap as the real intersection, including full containment", () => {
    // 第 1 条 [0,5000] 完全包住第 2 条 [1000,2000]：真实交集只有 1 秒
    const issues = detectIssues([
      cue("1", 0, 5000, "A"),
      cue("2", 1000, 2000, "B"),
    ]);
    const messages = overlaps(issues).map((i) => i.message);
    expect(messages).toHaveLength(2);
    expect(messages.every((m) => m.includes("重叠 1.0 秒"))).toBe(true);
    expect(messages.some((m) => m.includes("4.0 秒"))).toBe(false);
  });

  it("flags every cue in a three-cue chain overlap", () => {
    // [0,2000] [1000,3000] [2000<,4000] 连环交叠
    const issues = detectIssues([
      cue("1", 0, 2000, "A"),
      cue("2", 1000, 3000, "B"),
      cue("3", 2500, 4000, "C"),
    ]);
    const flaggedCueIds = overlaps(issues).map((i) => i.cueId);
    expect(flaggedCueIds.sort()).toEqual(["1", "2", "3"]);
  });

  it("catches overlap with a non-adjacent long cue spanning others", () => {
    // 长条目跨过中间两条，与非相邻条目也交叠
    const issues = detectIssues([
      cue("1", 0, 5000, "A"),
      cue("2", 1000, 1500, "B"),
      cue("3", 2000, 2500, "C"),
    ]);
    const flaggedCueIds = new Set(overlaps(issues).map((i) => i.cueId));
    expect(flaggedCueIds.has("1")).toBe(true);
    expect(flaggedCueIds.has("3")).toBe(true);
  });

  it("keeps clean, non-overlapping cues with sensible gaps quiet", () => {
    const issues = detectIssues([
      cue("1", 0, 1000, "正常的第一条字幕"),
      cue("2", 1200, 2200, "正常的第二条字幕"),
      cue("3", 2400, 3400, "正常的第三条字幕"),
    ]);
    expect(overlaps(issues)).toHaveLength(0);
    expect(gapInfos(issues)).toHaveLength(0);
  });

  it("warns about a small gap only when cues do not overlap", () => {
    const issues = detectIssues([
      cue("1", 0, 1000, "A"),
      cue("2", 1080, 2000, "B"),
    ]);
    expect(gapInfos(issues)).toHaveLength(1);
    expect(overlaps(issues)).toHaveLength(0);
  });

  it("never reports a gap reminder and an overlap on the same cue", () => {
    const issues = detectIssues([
      cue("1", 0, 2000, "A"),
      cue("2", 1500, 3000, "B"),
      cue("3", 3080, 4000, "C"),
    ]);
    // 不存在同一条同时收到 overlap 与间隔 info
    const overlapIds = new Set(overlaps(issues).map((i) => i.cueId));
    const gapIds = new Set(gapInfos(issues).map((i) => i.cueId));
    for (const id of overlapIds) expect(gapIds.has(id)).toBe(false);
  });
});
