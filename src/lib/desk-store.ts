import { create } from "zustand";
import { persist } from "zustand/middleware";
import { makeId } from "./indicators/parse.ts";
import { seeds } from "./indicators/seeds.ts";
import type { ChatMsg, Indicator, Signal } from "./indicators/types.ts";

type DeskState = {
  indicators: Indicator[];
  signals: Signal[];
  messages: ChatMsg[];
  watchOn: boolean;
  adopt: (list: Indicator[]) => void;
  saveEdits: (ind: Indicator) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  setSignals: (signals: Signal[]) => void;
  setAi: (id: string, text: string) => void;
  push: (role: ChatMsg["role"], text: string) => void;
};

export const useDesk = create<DeskState>()(
  persist(
    (set) => ({
      indicators: seeds,
      signals: [],
      messages: [],
      watchOn: true,
      adopt: (list) =>
        set((s) => {
          const byId = new Map(s.indicators.map((i) => [i.id, i]));
          for (const ind of list) {
            const prev = byId.get(ind.id);
            if (prev) byId.set(ind.id, { ...ind, id: prev.id, armed: prev.armed, sourceNote: ind.sourceNote || prev.sourceNote });
            else byId.set(ind.id, ind);
          }
          return { indicators: [...byId.values()] };
        }),
      saveEdits: (ind) =>
        set((s) => ({
          indicators: s.indicators.map((i) => (i.id === ind.id ? { ...ind, updatedAt: Date.now() } : i)),
        })),
      toggle: (id) =>
        set((s) => ({
          indicators: s.indicators.map((i) => (i.id === id ? { ...i, armed: !i.armed, updatedAt: Date.now() } : i)),
        })),
      remove: (id) => set((s) => ({ indicators: s.indicators.filter((i) => i.id !== id) })),
      setSignals: (signals) => set({ signals }),
      setAi: (id, text) =>
        set((s) => ({
          signals: s.signals.map((sig) => (sig.id === id ? { ...sig, ai: text } : sig)),
        })),
      push: (role, text) =>
        set((s) => ({
          messages: [...s.messages, { id: makeId("m"), role, text, at: Date.now() }].slice(-24),
        })),
    }),
    {
      name: "jinsao-desk-v1",
      skipHydration: true,
      partialize: (s) => ({
        indicators: s.indicators,
        signals: s.signals,
        messages: s.messages,
        watchOn: s.watchOn,
      }),
    },
  ),
);
