import { px, sideLabel } from "@/lib/format";
import type { QuoteBook } from "@/lib/market";
import type { Pipeline, Seat } from "@/lib/pipeline";
import { QuoteStage, type Tick } from "./quote";

const LOOPS = [
  { id: "micro", name: "微循环", line: "小模型分拣，不发单" },
  { id: "core", name: "主循环", line: "规则起草，只出草稿" },
  { id: "macro", name: "宏循环", line: "只在冲突时上来" },
  { id: "hyper", name: "上层", line: "关着，要人确认" },
  { id: "brief", name: "任务书", line: "你武装的指标" },
] as const;

function tone(seat: Seat): "gold" | "cinnabar" | "dim" {
  if (seat.score < 0.45) return "cinnabar";
  if (seat.live && seat.score >= 0.6) return "gold";
  return "dim";
}

function NodeBox({ x, y, seat }: { x: number; y: number; seat: Seat }) {
  const kind = tone(seat);
  const fill = kind === "gold" ? "#d4a853" : kind === "cinnabar" ? "#c45c4a" : "#241f19";
  const ink = kind === "dim" ? "#f3ecdf" : "#0e0d0b";
  return (
    <g>
      <rect x={x - 46} y={y - 18} width="92" height="36" rx="8" fill={fill} />
      <text x={x} y={y - 2} textAnchor="middle" fill={ink} fontSize="11">
        {seat.name}
      </text>
      <text x={x} y={y + 12} textAnchor="middle" fill={ink} fontSize="9" opacity="0.75">
        {Math.round(seat.score * 100)}
      </text>
    </g>
  );
}

export function GateLine({ pipe }: { pipe: Pipeline | null }) {
  if (!pipe) return null;
  const gate = pipe.seats.find((seat) => seat.id === "gate");
  return (
    <p className="rounded-2xl bg-panel px-4 py-3 text-sm shadow-panel">
      <span className="text-gold">{pipe.phase}</span>
      <span className="text-cream-dim"> · {gate?.note ?? "闸门还没出分"}</span>
    </p>
  );
}

export function CommandDeck({ pipe, book, ticks }: { pipe: Pipeline | null; book: QuoteBook | null; ticks: Tick[] }) {
  if (!pipe) {
    return (
      <div className="space-y-3">
        <QuoteStage book={book} ticks={ticks} />
        <p className="rounded-2xl bg-panel px-4 py-3 text-sm text-cream-dim shadow-panel">K 线还在接，闸门随后就位。报价已经在听。</p>
      </div>
    );
  }
  const seat = (id: string) => pipe.seats.find((item) => item.id === id) as Seat;
  const hot = pipe.verdict !== "hold";
  return (
    <div className="space-y-3">
      <QuoteStage book={book} ticks={ticks} />
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-cream-dim">金哨工程 // 路由与闸门</p>
          <h2 className="text-lg text-cream">九席分工，过不了闸门就没有单</h2>
        </div>
        <p className="text-sm text-gold">{pipe.phase}</p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-panel shadow-panel">
        <svg viewBox="0 0 360 560" className="h-auto w-full">
          <path d="M180 36 C180 70 180 70 180 92" className="trace-live" stroke="#d4a853" fill="none" />
          <path d="M180 110 C180 140 180 140 180 156" className={hot ? "trace-live" : ""} stroke="#f3ecdf" strokeOpacity="0.35" fill="none" />
          <path d="M180 174 C120 200 90 210 64 230" stroke="#f3ecdf" strokeOpacity="0.28" fill="none" />
          <path d="M180 174 C180 200 180 210 180 230" stroke="#f3ecdf" strokeOpacity="0.28" fill="none" />
          <path d="M180 174 C240 200 270 210 296 230" stroke="#f3ecdf" strokeOpacity="0.28" fill="none" />
          <path d="M64 248 C90 280 100 290 120 310" stroke="#f3ecdf" strokeOpacity="0.28" fill="none" />
          <path d="M296 248 C270 280 250 290 240 310" stroke="#f3ecdf" strokeOpacity="0.28" fill="none" />
          <path d="M120 328 C150 360 160 370 180 390" className={pipe.loop === "macro" || pipe.loop === "hyper" ? "trace-live" : ""} stroke="#c45c4a" strokeOpacity="0.8" fill="none" />
          <path d="M240 328 C210 360 200 370 180 390" stroke="#f3ecdf" strokeOpacity="0.28" fill="none" />
          <path d="M180 408 C140 440 130 450 110 470" stroke="#f3ecdf" strokeOpacity="0.28" fill="none" />
          <path d="M180 408 C220 440 230 450 250 470" className={pipe.verdict === "deliver" ? "trace-live" : ""} stroke="#d4a853" fill="none" />
          <path d="M180 488 C180 510 180 510 180 522" className={pipe.verdict === "deliver" ? "trace-live" : ""} stroke="#d4a853" fill="none" />
          <text x="180" y="28" textAnchor="middle" fill="#8a8175" fontSize="10">
            行情请求
          </text>
          <text x="180" y="86" textAnchor="middle" fill="#f3ecdf" fontSize="11">
            结构化状态
          </text>
          <NodeBox x={180} y={166} seat={seat("router")} />
          <NodeBox x={64} y={240} seat={seat("tape")} />
          <NodeBox x={180} y={240} seat={seat("indicator")} />
          <NodeBox x={296} y={240} seat={seat("flow")} />
          <NodeBox x={120} y={318} seat={seat("geo")} />
          <NodeBox x={240} y={318} seat={seat("facts")} />
          <NodeBox x={180} y={400} seat={seat("gate")} />
          <NodeBox x={110} y={478} seat={seat("data")} />
          <NodeBox x={250} y={478} seat={seat("face")} />
          <text x="180" y="546" textAnchor="middle" fill={pipe.verdict === "deliver" ? "#d4a853" : "#8a8175"} fontSize="12">
            {pipe.verdict === "deliver" ? "草稿" : pipe.verdict === "escalate" ? "留在裁决" : "扣住"}
          </text>
        </svg>
      </div>
      <div className="nav-scroll flex gap-2 overflow-x-auto">
        {LOOPS.map((item) => (
          <div
            key={item.id}
            className={"w-36 shrink-0 rounded-2xl px-3 py-2 " + (pipe.loop === item.id ? "bg-gold text-ink" : "bg-panel text-cream")}
          >
            <p className="text-sm">{item.name}</p>
            <p className={"mt-1 text-xs " + (pipe.loop === item.id ? "text-ink" : "text-cream-dim")}>{item.line}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-panel px-3 py-2 shadow-panel">
          <p className="text-xs text-cream-dim">席位负荷</p>
          <div className="mt-2 flex h-12 items-end gap-1">
            {pipe.seats.map((item) => (
              <div key={item.id} className="flex-1 rounded-sm bg-gold" style={{ height: `${Math.max(8, item.score * 100)}%` }} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-panel px-3 py-2 shadow-panel">
          <p className="text-xs text-cream-dim">这一轮</p>
          <p className="mt-2 text-sm text-cream">{pipe.work} 根 K 线</p>
          <p className="text-xs text-cream-dim">{pipe.loop === "micro" ? "没有往上送" : pipe.loop === "core" ? "只出草稿" : "不发单"}</p>
        </div>
        <div className="rounded-2xl bg-panel px-3 py-2 shadow-panel">
          <p className="text-xs text-cream-dim">闸门</p>
          <p className="mt-2 text-lg tabular-nums text-gold">{Math.round((seat("gate").score || 0) * 100)}</p>
        </div>
      </div>
      <div className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
        {pipe.verdict === "deliver" && pipe.entry != null && pipe.stop != null ? (
          <p className="text-sm text-cream">
            {sideLabel(pipe.side === "flat" ? "long" : pipe.side)} · 入场 {px(pipe.entry)} · 止损 {px(pipe.stop)}
            {pipe.targets[0] != null ? ` · 止盈 ${px(pipe.targets[0])}` : ""}
          </p>
        ) : (
          <p className="text-sm text-cream-dim">{pipe.why[0]}</p>
        )}
        <ul className="mt-2 space-y-1">
          {pipe.seats.slice(1, 5).map((item) => (
            <li key={item.id} className="text-xs text-cream-dim">
              {item.name} · {item.note}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
