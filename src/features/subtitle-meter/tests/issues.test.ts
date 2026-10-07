import { describe, expect, it } from "vitest";
import { detectIssues } from "../analyzers/issueDetector";
import type { SubtitleCue } from "../models";
const cue = (
  id: string,
  startMs: number,
  endMs: number,
  text: string,
): SubtitleCue => ({ id, index: Number(id), startMs, endMs, text });
const gapIssues = (cues: SubtitleCue[]) =>
  detectIssues(cues).filter(
    (i) => i.type === "overlap" || i.type === "too-short",
  );
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
  it("measures only the real intersection when one cue contains another", () => {
    const issues = detectIssues([
      cue("1", 0, 5000, "外层"),
      cue("2", 1000, 3000, "内层"),
    ]);
    const overlaps = issues.filter((i) => i.type === "overlap");
    expect(overlaps).toHaveLength(2);
    expect(overlaps.every((i) => i.message.includes("2.0 秒"))).toBe(true);
  });
  it("flags every cue in a three-way chain, including non-adjacent pairs", () => {
    const issues = detectIssues([
      cue("1", 0, 4000, "第一条"),
      cue("2", 1000, 2000, "第二条"),
      cue("3", 3000, 5000, "第三条"),
    ]);
    const flagged = new Set(
      issues.filter((i) => i.type === "overlap").map((i) => i.cueId),
    );
    expect([...flagged].sort()).toEqual(["1", "2", "3"]);
    // 第 3 条与第 1 条并不相邻，但同样交叠，必须被指出
    expect(
      issues.some(
        (i) => i.cueId === "3" && i.message.includes("与第 1 条字幕重叠"),
      ),
    ).toBe(true);
  });
  it("does not report normal, non-overlapping cues with adequate gaps", () => {
    const issues = gapIssues([
      cue("1", 0, 2000, "正常甲"),
      cue("2", 2120, 4120, "正常乙"),
      cue("3", 4240, 6240, "正常丙"),
    ]);
    expect(issues).toEqual([]);
    // 首尾相接既不算重叠，也不算间隔不足
    expect(
      gapIssues([cue("1", 0, 1000, "甲"), cue("2", 1000, 2000, "乙")]),
    ).toEqual([]);
  });
  it("never emits both an overlap and a gap reminder for one cue", () => {
    // 第 2 条与第 3 条交叠，同时与第 1 条只隔 50ms
    const issues = detectIssues([
      cue("1", 0, 1000, "前一条"),
      cue("2", 1050, 5000, "交叠条"),
      cue("3", 2000, 3000, "后一条"),
    ]);
    const cue2 = issues.filter((i) => i.cueId === "2");
    expect(cue2.some((i) => i.type === "overlap")).toBe(true);
    expect(cue2.some((i) => i.type === "too-short")).toBe(false);
  });
  it("still warns about a genuinely too-short gap between disjoint cues", () => {
    const issues = detectIssues([
      cue("1", 0, 1000, "甲"),
      cue("2", 1050, 2000, "乙"),
    ]);
    expect(
      issues.some(
        (i) => i.type === "too-short" && i.message.includes("间隔不足"),
      ),
    ).toBe(true);
  });
});
