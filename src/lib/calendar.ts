export type CalEvent = {
  id: string;
  at: number;
  title: string;
  risk: 3 | 4 | 5;
  impact: string;
};

function bj(month: number, day: number, hour: number, minute: number): number {
  return Date.UTC(2026, month - 1, day, hour - 8, minute);
}

/** This week's gold calendar, Beijing time. Jin10's live feed needs their own key. */
export const WEEK: CalEvent[] = [
  { id: "ism", at: bj(10, 5, 22, 0), title: "美国9月ISM服务业PMI", risk: 4, impact: "看服务业、就业和价格。容易动美元和黄金。" },
  { id: "trade", at: bj(10, 6, 20, 30), title: "美国8月贸易帐", risk: 3, impact: "看外贸和需求。对美元有影响，通常不如纪要猛。" },
  { id: "nyfed", at: bj(10, 7, 23, 0), title: "纽约联储消费者预期调查", risk: 3, impact: "看家庭对通胀和就业的预期，帮着判断后面的利率。" },
  { id: "fomc", at: bj(10, 8, 2, 0), title: "美联储FOMC会议纪要", risk: 5, impact: "本周核心。看委员对通胀、利率和后面路径的分歧。措辞没出来之前，不猜方向。" },
  { id: "waller", at: bj(10, 8, 16, 30), title: "美联储理事Waller讲话", risk: 4, impact: "看他对经济、通胀和利率的表态，可能直接打美元和黄金。" },
  { id: "claims", at: bj(10, 8, 20, 30), title: "美国初请失业金人数", risk: 4, impact: "就业的周温度计。就业明显降温时，美元和降息预期会动。" },
  { id: "ca", at: bj(10, 9, 20, 30), title: "加拿大9月就业报告", risk: 3, impact: "主要打加元和加拿大央行预期，黄金会跟着外汇一起晃。" },
  { id: "mich", at: bj(10, 9, 22, 0), title: "美国10月密歇根消费者信心", risk: 4, impact: "信心和通胀预期一起看。对美联储预期、美元和黄金都敏感。" },
];

export type CalendarState = {
  events: CalEvent[];
  next: CalEvent | null;
  block: boolean;
  reason: string;
  risk: number;
};

export function calendarState(now: number): CalendarState {
  const next = WEEK.find((item) => item.at >= now) ?? null;
  const hot = WEEK.find((item) => item.risk >= 4 && item.at - now <= 90 * 60_000 && now - item.at <= 40 * 60_000);
  if (!hot) {
    return {
      events: WEEK,
      next,
      block: false,
      risk: 0,
      reason: next ? `下一件是${next.title}，还没靠近。` : "这张周历上的事都过了。",
    };
  }
  const before = hot.at >= now;
  return {
    events: WEEK,
    next,
    block: true,
    risk: hot.risk,
    reason: before
      ? `${hot.title}还有不到一个半小时，风险 ${hot.risk}。先看日历，不新开仓。`
      : `${hot.title}刚过，点差和波动还没歇。先别进。`,
  };
}

export function awayLabel(at: number, now: number): string {
  const delta = at - now;
  if (delta < -30 * 60_000) return "已过";
  if (delta <= 0) return "刚公布";
  const mins = Math.round(delta / 60_000);
  if (mins < 60) return `${mins}分钟`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours < 24) return rest ? `${hours}小时${rest}分` : `${hours}小时`;
  const days = Math.floor(hours / 24);
  return `${days}天${hours % 24}小时`;
}

export function bjClock(at: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}
