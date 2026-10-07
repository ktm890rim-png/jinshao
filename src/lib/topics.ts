export const TOPICS = [
  { id: "gold", label: "黄金", gh: "XAUUSD pine script", tv: "XAUUSD" },
  { id: "structure", label: "结构", gh: "order block pine script gold", tv: "gold smart money" },
  { id: "momentum", label: "动能", gh: "gold ATR breakout pine script", tv: "gold momentum" },
  { id: "revert", label: "回归", gh: "bollinger mean reversion pine gold", tv: "gold bollinger" },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];

export function topicById(id: string) {
  return TOPICS.find((t) => t.id === id) ?? TOPICS[0];
}
