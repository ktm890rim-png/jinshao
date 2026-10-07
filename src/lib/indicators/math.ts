export function ema(values: number[], n: number): number[] {
  const out = values.map(() => Number.NaN);
  const k = 2 / (n + 1);
  let prev = Number.NaN;
  const warm: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (!Number.isFinite(prev)) {
      warm.push(v);
      if (warm.length === n) {
        prev = warm.reduce((a, b) => a + b, 0) / n;
        out[i] = prev;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

export function sma(values: number[], n: number): number[] {
  const out = values.map(() => Number.NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function rsi(values: number[], n: number): number[] {
  const out = values.map(() => Number.NaN);
  if (values.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / n;
  let avgL = loss / n;
  out[n] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (n - 1) + g) / n;
    avgL = (avgL * (n - 1) + l) / n;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

export function atr(high: number[], low: number[], close: number[], n: number): number[] {
  const tr = close.map((_, i) => {
    if (i === 0) return high[i] - low[i];
    return Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  });
  const out = tr.map(() => Number.NaN);
  if (tr.length <= n) return out;
  let prev = 0;
  for (let i = 0; i < n; i++) prev += tr[i];
  prev /= n;
  out[n - 1] = prev;
  for (let i = n; i < tr.length; i++) {
    prev = (prev * (n - 1) + tr[i]) / n;
    out[i] = prev;
  }
  return out;
}

export function stdev(values: number[], n: number): number[] {
  const out = values.map(() => Number.NaN);
  for (let i = n - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) sum += values[j];
    const mean = sum / n;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const d = values[j] - mean;
      v += d * d;
    }
    out[i] = Math.sqrt(v / n);
  }
  return out;
}

export function highest(values: number[], n: number): number[] {
  const out = values.map(() => Number.NaN);
  for (let i = n; i < values.length; i++) {
    let m = -Infinity;
    for (let j = i - n; j < i; j++) m = Math.max(m, values[j]);
    out[i] = m;
  }
  return out;
}

export function lowest(values: number[], n: number): number[] {
  const out = values.map(() => Number.NaN);
  for (let i = n; i < values.length; i++) {
    let m = Infinity;
    for (let j = i - n; j < i; j++) m = Math.min(m, values[j]);
    out[i] = m;
  }
  return out;
}

export function roc(values: number[], n: number): number[] {
  const out = values.map(() => Number.NaN);
  for (let i = n; i < values.length; i++) {
    const base = values[i - n];
    if (base !== 0 && Number.isFinite(base)) out[i] = ((values[i] - base) / base) * 100;
  }
  return out;
}
