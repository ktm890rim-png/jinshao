import { create } from "zustand";
import { persist } from "zustand/middleware";
import { goldenCross, type Block, type Wire } from "./graph.ts";

export type LinkKind = "quote" | "flow" | "trade" | "hook";

export type LinkSlot = {
  id: string;
  kind: LinkKind;
  name: string;
  url: string;
  note: string;
};

const seed = goldenCross();

const links: LinkSlot[] = [
  { id: "quote", kind: "quote", name: "现货报价", url: "https://api.gold-api.com/price/XAU", note: "现在值班用的现货。可以换成别的报价地址。" },
  { id: "flow", kind: "flow", name: "订单流", url: "", note: "真盘口要接 ATAS、券商或交易所的逐笔。这里先留地址。" },
  { id: "trade", kind: "trade", name: "交易下单", url: "", note: "券商或桥的地址。只保存，不会自动发单。" },
  { id: "hook", kind: "hook", name: "信号 Webhook", url: "", note: "机器人收进出场指令的地址。" },
];

type AtelierState = {
  blocks: Block[];
  wires: Wire[];
  links: LinkSlot[];
  setBlocks: (blocks: Block[]) => void;
  setWires: (wires: Wire[]) => void;
  setLink: (id: string, patch: Partial<LinkSlot>) => void;
  resetGraph: () => void;
};

export const useAtelier = create<AtelierState>()(
  persist(
    (set) => ({
      blocks: seed.blocks,
      wires: seed.wires,
      links,
      setBlocks: (blocks) => set({ blocks }),
      setWires: (wires) => set({ wires }),
      setLink: (id, patch) =>
        set((s) => ({
          links: s.links.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        })),
      resetGraph: () => {
        const next = goldenCross();
        set({ blocks: next.blocks, wires: next.wires });
      },
    }),
    { name: "jinsao-atelier-v1", skipHydration: true },
  ),
);
