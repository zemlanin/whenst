import { ReadonlySignal, useComputed, Signal } from "@preact/signals";

import { clockface } from "./index.module.css";
import { For } from "@preact/signals/utils";

export function UnixClockface({
  value,
  onChange,
  isLiveClockSignal,
}: {
  value: ReadonlySignal<number>;
  onChange: (value: number) => void;
  isLiveClockSignal: Signal<boolean>;
}) {
  const binary = useComputed(() => {
    const bin = value.value.toString(2).padStart(64, "0");
    const lastOne = bin.lastIndexOf("1");

    return bin.split("").map((digit, index) => ({
      digit,
      index,
      isLive: isLiveClockSignal.value && index === lastOne,
    }));
  });

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
        {({ digit, index, isLive }) => {
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
              fill={
                digit === "1"
                  ? isLive
                    ? "var(--primary)"
                    : "currentColor"
                  : "none"
              }
            />
          );
        }}
      </For>
    </svg>
  );
}
