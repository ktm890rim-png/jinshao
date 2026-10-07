import type { Bar, Side } from "./indicators/types";

type Fx = { i: number; kind: "top" | "bottom"; price: number };
type Bi = { dir: "up" | "down"; from: number; to: number; high: number; low: number };

export type ChanRead = {
  bias: Side | "flat";
  point: string;
  note: string;
  entry: number | null;
  stop: number | null;
  zg: number | null;
  zd: number | null;
  diverge: boolean;
};

function fractals(bars: Bar[]): Fx[] {
  const out: Fx[] = [];
  for (let i = 1; i < bars.length - 1; i++) {
    const a = bars[i - 1];
    const b = bars[i];
    const c = bars[i + 1];
    if (b.h > a.h && b.h > c.h && b.l > a.l && b.l > c.l) out.push({ i, kind: "top", price: b.h });
    else if (b.l < a.l && b.l < c.l && b.h < a.h && b.h < c.h) out.push({ i, kind: "bottom", price: b.l });
  }
  return out;
}

function strokes(fx: Fx[]): Bi[] {
  if (!fx.length) return [];
  const kept: Fx[] = [fx[0]];
  for (let k = 1; k < fx.length; k++) {
    const next = fx[k];
    const cur = kept[kept.length - 1];
    if (next.kind === cur.kind) {
      const stronger = next.kind === "top" ? next.price >= cur.price : next.price <= cur.price;
      if (stronger) kept[kept.length - 1] = next;
      continue;
    }
    if (next.i - cur.i < 4) continue;
    kept.push(next);
  }
  const bis: Bi[] = [];
  for (let i = 1; i < kept.length; i++) {
    const a = kept[i - 1];
    const b = kept[i];
    if (a.kind === "bottom" && b.kind === "top") bis.push({ dir: "up", from: a.i, to: b.i, low: a.price, high: b.price });
    else if (a.kind === "top" && b.kind === "bottom") bis.push({ dir: "down", from: a.i, to: b.i, high: a.price, low: b.price });
  }
  return bis;
}

function power(bars: Bar[], from: number, to: number): number {
  let sum = 0;
  for (let i = from; i <= to && i < bars.length; i++) sum += bars[i].h - bars[i].l;
  return sum;
}

function pivot(bis: Bi[]): { zg: number; zd: number } | null {
  for (let i = bis.length - 3; i >= 0; i--) {
    const three = bis.slice(i, i + 3);
    const zg = Math.min(...three.map((item) => item.high));
    const zd = Math.max(...three.map((item) => item.low));
    if (zg > zd) return { zg, zd };
  }
  return null;
}

function sameDir(bis: Bi[], index: number): Bi | null {
  const dir = bis[index]?.dir;
  for (let i = index - 1; i >= 0; i--) if (bis[i].dir === dir) return bis[i];
  return null;
}

function diverged(bars: Bar[], bis: Bi[], index: number): boolean {
  const cur = bis[index];
  const prev = sameDir(bis, index);
  if (!cur || !prev) return false;
  const weaker = power(bars, cur.from, cur.to) < power(bars, prev.from, prev.to) * 0.9;
  if (!weaker) return false;
  return cur.dir === "up" ? cur.high > prev.high : cur.low < prev.low;
}

export function readChan(bars: Bar[], price: number): ChanRead {
  const empty: ChanRead = {
    bias: "flat",
    point: "笔还不够",
    note: "十五分钟上的分型还叠不出三笔。先不谈买卖点。",
    entry: null,
    stop: null,
    zg: null,
    zd: null,
    diverge: false,
  };
  if (bars.length < 20) return empty;
  const bis = strokes(fractals(bars));
  if (bis.length < 3) return empty;
  const zone = pivot(bis);
  const last = bis[bis.length - 1];
  const prev = bis[bis.length - 2];
  const prev2 = bis[bis.length - 3];
  const diverge = diverged(bars, bis, bis.length - 1);
  const zoneText = zone ? `中枢 ${zone.zd.toFixed(2)} 到 ${zone.zg.toFixed(2)}。` : "最近三笔没有叠出中枢。";

  const far = (level: number) => Math.abs(price - level) > Math.max(zone ? zone.zg - zone.zd : 0, price * 0.002);

  if (zone && last.dir === "down" && last.low > zone.zg) {
    const entry = zone.zg;
    return {
      bias: "long",
      point: "三买",
      zg: zone.zg,
      zd: zone.zd,
      diverge,
      entry,
      stop: last.low,
      note: `${zoneText}向下这一笔没回到中枢里。三买看回踩中枢上沿，止损放在这笔低点下面。${far(entry) ? "现货离开上沿已经远了，不追。" : "现货还在这附近。"}`,
    };
  }
  if (zone && last.dir === "up" && last.high < zone.zd) {
    const entry = zone.zd;
    return {
      bias: "short",
      point: "三卖",
      zg: zone.zg,
      zd: zone.zd,
      diverge,
      entry,
      stop: last.high,
      note: `${zoneText}向上这一笔没回到中枢里。三卖看反抽中枢下沿，止损放在这笔高点上面。${far(entry) ? "现货离开下沿已经远了，不追。" : "现货还在这附近。"}`,
    };
  }
  const prevDownDiv = prev2.dir === "down" && diverged(bars, bis, bis.length - 3);
  if (last.dir === "down" && prev.dir === "up" && prevDownDiv && last.low > prev2.low) {
    return {
      bias: "long",
      point: "二买",
      zg: zone?.zg ?? null,
      zd: zone?.zd ?? null,
      diverge: true,
      entry: last.low,
      stop: prev2.low,
      note: `${zoneText}前面向下那笔背驰之后，这一笔回抽没破前低。二买止损放在一买那个低点下面。${far(last.low) ? "现货离这个低点远，不追。" : ""}`,
    };
  }
  const prevUpDiv = prev2.dir === "up" && diverged(bars, bis, bis.length - 3);
  if (last.dir === "up" && prev.dir === "down" && prevUpDiv && last.high < prev2.high) {
    return {
      bias: "short",
      point: "二卖",
      zg: zone?.zg ?? null,
      zd: zone?.zd ?? null,
      diverge: true,
      entry: last.high,
      stop: prev2.high,
      note: `${zoneText}前面向上那笔背驰之后，这一笔反弹没过前高。二卖止损放在那个高点上面。${far(last.high) ? "现货离这个高点远，不追。" : ""}`,
    };
  }
  if (last.dir === "down" && diverge) {
    return {
      bias: "long",
      point: "一买",
      zg: zone?.zg ?? null,
      zd: zone?.zd ?? null,
      diverge: true,
      entry: last.low,
      stop: last.low - (last.high - last.low) * 0.2,
      note: `${zoneText}这一笔创新低，但笔的力度比前一笔向下的小。只算一买候选，下一笔再破就不算。`,
    };
  }
  if (last.dir === "up" && diverge) {
    return {
      bias: "short",
      point: "一卖",
      zg: zone?.zg ?? null,
      zd: zone?.zd ?? null,
      diverge: true,
      entry: last.high,
      stop: last.high + (last.high - last.low) * 0.2,
      note: `${zoneText}这一笔创新高，但力度比前一笔向上的小。只算一卖候选，下一笔再过就不算。`,
    };
  }
  const inside = zone != null && price <= zone.zg && price >= zone.zd;
  if (zone && last.dir === "down" && (price < zone.zd || last.low < zone.zd)) {
    return {
      bias: "flat",
      point: "向下离开",
      zg: zone.zg,
      zd: zone.zd,
      diverge: false,
      entry: zone.zd,
      stop: null,
      note: `${zoneText}价格到了中枢下面，但这笔没有背驰。三卖要等向上反抽，而且反抽高点不回到 ${zone.zd.toFixed(2)} 里面。现在不追空。`,
    };
  }
  if (zone && last.dir === "up" && (price > zone.zg || last.high > zone.zg)) {
    return {
      bias: "flat",
      point: "向上离开",
      zg: zone.zg,
      zd: zone.zd,
      diverge: false,
      entry: zone.zg,
      stop: null,
      note: `${zoneText}价格到了中枢上面，但这笔没有背驰。三买要等向下回踩，而且回踩低点不进 ${zone.zg.toFixed(2)}。现在不追多。`,
    };
  }
  return {
    bias: "flat",
    point: inside ? "中枢内" : last.dir === "up" ? "向上一笔" : "向下一笔",
    zg: zone?.zg ?? null,
    zd: zone?.zd ?? null,
    diverge: false,
    entry: null,
    stop: null,
    note: inside ? `${zoneText}价格还在中枢里面来回，没有离开，不做。` : `${zoneText}没有背驰，也没有三买三卖。结构没选边。`,
  };
}
