import { Signal } from "@preact/signals";

import { clockface } from "./index.module.css";

export function LocationClockface({
  value: _value,
}: {
  value: Signal<string>;
}) {
  return <svg className={clockface}></svg>;
}
