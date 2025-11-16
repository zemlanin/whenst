import { Temporal } from "@js-temporal/polyfill";
import { ReadonlySignal, useComputed } from "@preact/signals";

import { clockface } from "./index.module.css";

const viewBoxSize = 512;

export function LocationClockface({
  value,
  onChange,
}: {
  value: ReadonlySignal<Temporal.ZonedDateTime>;
  onChange: (value: Temporal.ZonedDateTime) => void;
}) {
  return (
    <svg
      className={clockface}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      onWheelCapture={(e) => {
        if (!e.deltaY) {
          return;
        }

        e.preventDefault();
        const newValue = value.value.add({ seconds: e.deltaY * 5 });
        onChange(newValue);
      }}
    >
      <AMPMComplication value={value} />
      <HourMark hour={1} />
      <HourMark hour={2} />
      <DateComplication value={value} />
      <HourMark hour={4} />
      <HourMark hour={5} />
      <HourMark hour={6} />
      <HourMark hour={7} />
      <HourMark hour={8} />
      <HourMark hour={9} />
      <HourMark hour={10} />
      <HourMark hour={11} />
      <HourHand value={value} />
      <MinuteHand value={value} />
    </svg>
  );
}

function HourMark({ hour }: { hour: number }) {
  const hourMarkWidth = 8;

  return (
    <>
      <rect
        x={viewBoxSize / 2 - hourMarkWidth / 2}
        y={hour % 3 ? -28 : 0}
        width={hourMarkWidth}
        height={hour % 3 ? 24 : 40}
        transformOrigin={`${viewBoxSize / 2}px ${viewBoxSize / 2}px`}
        transform={`rotate(${(hour * 360) / 12})`}
      />
    </>
  );
}

function HourHand({
  value,
}: {
  value: ReadonlySignal<Temporal.ZonedDateTime>;
}) {
  const transform = useComputed(() => {
    const t = value.value;
    const twelveHour = t.hour % 12;

    const hourAngle = 360 / 12;

    const angle = twelveHour * hourAngle + t.minute * (hourAngle / 60);

    return `rotate(${angle})`;
  });

  return (
    <path
      d={`
    M ${viewBoxSize / 2},${viewBoxSize / 2 + 16}
    L ${viewBoxSize / 2},${128}
    z
  `}
      strokeWidth={24}
      stroke="currentColor"
      transformOrigin={`${viewBoxSize / 2}px ${viewBoxSize / 2}px`}
      transform={transform}
    />
  );
}

function MinuteHand({
  value,
}: {
  value: ReadonlySignal<Temporal.ZonedDateTime>;
}) {
  const transform = useComputed(() => {
    const t = value.value;
    const minuteAngle = 360 / 60;

    const angle = t.minute * minuteAngle;

    return `rotate(${angle})`;
  });

  return (
    <path
      d={`
    M ${viewBoxSize / 2},${viewBoxSize / 2 + 16}
    L ${viewBoxSize / 2},${64}
    z
  `}
      strokeWidth={20}
      stroke="currentColor"
      transformOrigin={`${viewBoxSize / 2}px ${viewBoxSize / 2}px`}
      transform={transform}
    />
  );
}

function AMPMComplication({
  value,
}: {
  value: ReadonlySignal<Temporal.ZonedDateTime>;
}) {
  const ampm = useComputed(() => {
    return value.value.hour >= 12 ? "PM" : "AM";
  });

  return (
    <>
      <text
        textAnchor="middle"
        dominantBaseline="hanging"
        style="font-size: 54px"
        x={viewBoxSize / 2}
        y={0}
      >
        {ampm}
      </text>
    </>
  );
}

function DateComplication({
  value,
}: {
  value: ReadonlySignal<Temporal.ZonedDateTime>;
}) {
  const day = useComputed(() => {
    return value.value.day;
  });

  const textXPosition = useComputed(() => {
    return viewBoxSize - (value.value.day >= 10 ? 0 : 12);
  });

  return (
    <>
      <text
        textAnchor="end"
        style="font-size: 54px"
        x={textXPosition}
        y={viewBoxSize / 2 + 20}
      >
        {day}
      </text>
    </>
  );
}
