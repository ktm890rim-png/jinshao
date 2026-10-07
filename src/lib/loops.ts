type LoopId = "brief" | "micro" | "core" | "macro" | "hyper";

/** What each loop is allowed to do. Hyper stays off until a person confirms. */
export const LOOP_POLICY = {
  micro: { model: "small", temp: 0, maxPasses: 60, tools: false, canEmit: "none" },
  core: { model: "rules", checker: "small", temp: 0, maxPasses: 12, canEmit: "draft" },
  macro: { model: "mid", temp: 0.3, maxPasses: 1, onlyIf: "conflict", canEmit: "none" },
  hyper: { model: "strong", temp: 0.3, maxPasses: 1, enabled: false, humanConfirm: true, canEmit: "none" },
} as const;

export function loopEmit(loop: LoopId): "none" | "draft" {
  if (loop === "core") return "draft";
  return "none";
}

export function loopLine(loop: LoopId): string {
  if (loop === "micro") return "小模型分拣，不用工具，不发单";
  if (loop === "core") return "规则起草，小模型核对，只出草稿";
  if (loop === "macro") return "只有冲突才上来，不发单";
  if (loop === "hyper") return "关着。要人确认才往下走";
  return "任务书";
}
