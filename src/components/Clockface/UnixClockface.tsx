import { ReadonlySignal, useComputed } from "@preact/signals";

import { clockface } from "./index.module.css";
import { For } from "@preact/signals/utils";

export function UnixClockface({
  value,
  onChange,
}: {
  value: ReadonlySignal<number>;
  onChange: (value: number) => void;
}) {
  const binary = useComputed(() =>
    value.value
      .toString(2)
      .padStart(64, "0")
      .split("")
      .map((digit, index) => ({ digit, index })),
  );

  return (
    <svg
      className={clockface}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      onWheelCapture={(e) => {
        if (!e.deltaY) {
          return;
        }

        e.preventDefault();
        const newValue = value.value + e.deltaY;
        onChange(newValue);
      }}
    >
      <For each={binary}>
        {({ digit, index }) => {
          const size = 64;
          const x = index % 8;
          const y = Math.floor(index / 8);

          return (
            <rect
              key={index}
              x={x * size}
              y={y * size}
              width={size}
              height={size}
              fill={digit === "1" ? "currentColor" : "none"}
            />
          );
        }}
      </For>
    </svg>
  );
}
