import type { CalendarState } from "./calendar";
import type { ChanRead } from "./chan";
import { px } from "./format";
import type { Side } from "./indicators/types";

export type Confluence = {
  bias: Side | "flat";
  title: string;
  how: string;
};

const sideWord = (side: Side | "flat") => (side === "long" ? "多" : side === "short" ? "空" : "观望");

export function resonate(input: {
  chan: ChanRead;
  cal: CalendarState;
  studySide: Side | "flat";
  studyName: string;
  price: number;
}): Confluence {
  if (input.cal.block) {
    return {
      bias: "flat",
      title: "先看日历",
      how: `${input.cal.reason}缠论现在是${input.chan.point}，也不拿来新开仓。`,
    };
  }
  if (input.chan.bias === "flat") {
    const leaving = input.chan.point === "向下离开" || input.chan.point === "向上离开";
    return {
      bias: "flat",
      title: leaving ? "离开了，但不追" : "结构没共振",
      how: `${input.chan.note}这不是下单指令。`,
    };
  }
  if (input.studySide !== "flat" && input.studySide !== input.chan.bias) {
    return {
      bias: "flat",
      title: "缠论和研习打架",
      how: `缠论是${input.chan.point}，偏${sideWord(input.chan.bias)}。研习里还站着的「${input.studyName}」偏${sideWord(input.studySide)}。两边不一致，不做。`,
    };
  }
  const level = input.chan.entry;
  const stop = input.chan.stop;
  const chased = level != null && Math.abs(input.price - level) > Math.max((input.chan.zg ?? level) - (input.chan.zd ?? level), input.price * 0.002);
  const where =
    level != null && stop != null
      ? `参考进 ${px(level)}，止损 ${px(stop)}。现货 ${px(input.price)}。${chased ? "离参考位远，等回来，不追。" : "还在附近，可以按这个结构看。"}`
      : input.chan.note;
  const agree = input.studySide === input.chan.bias ? `研习「${input.studyName}」同向。` : "研习这会儿没有同向的在场仓，只有结构这一边。";
  return {
    bias: input.chan.bias,
    title: input.studySide === input.chan.bias ? "缠论和研习同向" : `结构偏${sideWord(input.chan.bias)}`,
    how: `${input.chan.point}。${where}${agree}这不是下单指令。`,
  };
}
