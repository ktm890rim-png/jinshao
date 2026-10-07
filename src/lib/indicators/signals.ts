import type { EvalHit, Side, Signal } from "./types.ts";

function updateStatus(s: Signal, price: number): Signal {
  if (s.status !== "live" || !Number.isFinite(price)) return s;
  if (s.side === "long" && price <= s.stop) return { ...s, status: "stopped" };
  if (s.side === "long" && price >= s.target) return { ...s, status: "target" };
  if (s.side === "short" && price >= s.stop) return { ...s, status: "stopped" };
  if (s.side === "short" && price <= s.target) return { ...s, status: "target" };
  return s;
}

function build(side: Side, group: EvalHit[], price: number, now: number): Signal | null {
  const risks: number[] = [];
  const rewards: number[] = [];
  for (const g of group) {
    if (g.entry == null || g.stop == null || g.target == null) continue;
    const risk = Math.abs(g.entry - g.stop);
    const reward = Math.abs(g.target - g.entry);
    if (risk > 0.2) risks.push(risk);
    if (reward > 0) rewards.push(reward);
  }
  if (!risks.length || !rewards.length) return null;
  const risk = risks.reduce((a, b) => a + b, 0) / risks.length;
  const reward = rewards.reduce((a, b) => a + b, 0) / rewards.length;
  const ids = group.map((g) => g.id).sort();
  const barTime = Math.max(...group.map((g) => g.barTime));
  return {
    id: `${side}:${barTime}:${ids.join("+")}`,
    at: now,
    barTime,
    side,
    names: group.map((g) => g.name),
    indicatorIds: ids,
    entry: price,
    stop: side === "long" ? price - risk : price + risk,
    target: side === "long" ? price + reward : price - reward,
    rr: reward / risk,
    why: group.map((g) => `${g.name}：${g.met.filter((m) => m.ok).map((m) => m.label).join("、") || "条件满足"}`),
    status: "live",
  };
}

export function rollSignals(input: {
  prev: Signal[];
  evals: EvalHit[];
  price: number;
  now: number;
  conflict: boolean;
}): Signal[] {
  const next = input.prev.map((s) => updateStatus(s, input.price));
  if (input.conflict || !Number.isFinite(input.price)) return next;
  const fresh: Signal[] = [];
  for (const side of ["long", "short"] as const) {
    const group = input.evals.filter((e) => e.hit && e.side === side && e.entry != null);
    if (!group.length) continue;
    const made = build(side, group, input.price, input.now);
    if (!made) continue;
    if (next.some((s) => s.id === made.id) || fresh.some((s) => s.id === made.id)) continue;
    const ids = new Set(made.indicatorIds);
    if (next.some((s) => s.status === "live" && s.side === side && s.indicatorIds.some((id) => ids.has(id)))) continue;
    fresh.push(made);
  }
  return [...fresh, ...next].slice(0, 30);
}
