import { Temporal } from "@js-temporal/polyfill";
import {
  ReadonlySignal,
  Signal,
  useComputed,
  useSignal,
} from "@preact/signals";

import { clockface } from "./index.module.css";
import { Show } from "@preact/signals/utils";

const viewBoxSize = 512;

export function LocationClockface({
  value,
  onChange,
  isLiveClockSignal,
}: {
  value: ReadonlySignal<Temporal.ZonedDateTime>;
  onChange: (value: Temporal.ZonedDateTime) => void;
  isLiveClockSignal: Signal<boolean>;
}) {
  const ongoingTouches = useSignal(
    new Map<
      number,
      {
        pageX: number;
        pageY: number;
        centerPostX: number;
        centerPostY: number;
      }
    >(),
  );

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
        const newValue = value.value.add({ seconds: Math.round(e.deltaY) * 5 });
        onChange(newValue);
      }}
      onTouchStart={(e) => {
        const boundingRect = e.currentTarget.getBoundingClientRect();
        const centerPostX = boundingRect.left + boundingRect.width / 2;
        const centerPostY = boundingRect.top + boundingRect.height / 2;

        for (const touch of e.changedTouches) {
          ongoingTouches.value.set(touch.identifier, {
            pageX: touch.pageX,
            pageY: touch.pageY,
            centerPostX,
            centerPostY,
          });
        }
      }}
      onTouchMove={(e) => {
        e.preventDefault();

        let delta = 0;

        for (const touch of e.changedTouches) {
          const ongoingTouch = ongoingTouches.value.get(touch.identifier);

          if (!ongoingTouch) {
            continue;
          }

          const {
            pageX: originalX,
            pageY: originalY,
            centerPostX,
            centerPostY,
          } = ongoingTouch;

          ongoingTouches.value.set(touch.identifier, {
            pageX: touch.pageX,
            pageY: touch.pageY,
            centerPostX,
            centerPostY,
          });

          const originalRelX = originalX - centerPostX;
          const originalRelY = originalY - centerPostY;

          const newRelX = touch.pageX - centerPostX;
          const newRelY = touch.pageY - centerPostY;

          const originalAngle = Math.atan(originalRelX / originalRelY);
          const newAngle = Math.atan(newRelX / newRelY);

          delta +=
            (originalAngle < newAngle ? -1 : +1) *
            Math.round(
              Math.sqrt(
                Math.pow(touch.pageY - originalY, 2) +
                  Math.pow(touch.pageX - originalX, 2),
              ),
            );
        }

        if (delta) {
          const newValue = value.value.add({ seconds: delta * 10 });
          onChange(newValue);
        }
      }}
      onTouchEnd={(e) => {
        for (const touch of e.changedTouches) {
          ongoingTouches.value.delete(touch.identifier);
        }
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
      <Show when={isLiveClockSignal}>
        <>
          <SecondHand value={value} />
          <HandsPost />
        </>
      </Show>
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
        fill="currentColor"
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

    const angle = t.minute * minuteAngle + t.second * (minuteAngle / 60);

    return `rotate(${angle})`;
  });

  return (
    <path
      d={`
        M ${viewBoxSize / 2},${viewBoxSize / 2 + 16}
        L ${viewBoxSize / 2},${64}
      `}
      strokeWidth={20}
      stroke="currentColor"
      transformOrigin={`${viewBoxSize / 2}px ${viewBoxSize / 2}px`}
      transform={transform}
    />
  );
}

function SecondHand({
  value,
}: {
  value: ReadonlySignal<Temporal.ZonedDateTime>;
}) {
  const transform = useComputed(() => {
    const t = value.value;
    const secondAngle = 360 / 60;

    const angle = t.second * secondAngle;

    return `rotate(${angle})`;
  });

  return (
    <path
      d={`
        M ${viewBoxSize / 2},${viewBoxSize / 2 + 16}
        L ${viewBoxSize / 2},${48}
      `}
      strokeWidth={6}
      stroke="var(--primary)"
      transformOrigin={`${viewBoxSize / 2}px ${viewBoxSize / 2}px`}
      transform={transform}
    />
  );
}

function HandsPost() {
  return (
    <circle
      cx={viewBoxSize / 2}
      cy={viewBoxSize / 2}
      r={10}
      fill="var(--primary)"
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
        y={-6}
        fill="currentColor"
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
        fill="currentColor"
      >
        {day}
      </text>
    </>
  );
}
