import type { Bar } from "./types.ts";

export function resample(bars: Bar[], minutes: number): Bar[] {
  if (minutes <= 5) return bars;
  const ms = minutes * 60_000;
  const out: Bar[] = [];
  for (const b of bars) {
    const bucket = Math.floor(b.t / ms) * ms;
    const last = out[out.length - 1];
    if (!last || last.t !== bucket) out.push({ t: bucket, o: b.o, h: b.h, l: b.l, c: b.c });
    else {
      last.h = Math.max(last.h, b.h);
      last.l = Math.min(last.l, b.l);
      last.c = b.c;
    }
  }
  return out;
}
