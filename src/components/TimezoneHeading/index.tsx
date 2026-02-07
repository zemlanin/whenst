import { useEffect, useId, useRef } from "preact/hooks";
import { Signal, useComputed, useSignal } from "@preact/signals";
import { Show, For } from "@preact/signals/utils";
import * as classes from "./index.module.css";
import Fuse from "fuse.js";
import { getPathnameFromTimezone } from "../../../shared/from-timezone.js";
import { Temporal } from "@js-temporal/polyfill";

type PaletteOption = {
  url: string;
  title: string;
  subtitle?: string;
};

export function TimezoneHeading({
  defaultValue = "",
  className = "",
  idPrefix = "tzh",
  zonedDateTimeSignal,
}: {
  defaultValue?: string;
  className?: string;
  idPrefix?: string;
  zonedDateTimeSignal?: Signal<Temporal.ZonedDateTime>;
}) {
  const inputSizerText = useSignal(defaultValue);
  const inputSizerWidth = useSignal<number | undefined>(undefined);
  const inputSizerHeight = useSignal<number | undefined>(undefined);
  const inputSizerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!inputSizerRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      requestAnimationFrame(() => {
        for (const entry of entries) {
          inputSizerWidth.value = Math.ceil(entry.borderBoxSize[0].inlineSize);
          inputSizerHeight.value = Math.ceil(entry.borderBoxSize[0].blockSize);
        }
      });
    });
    observer.observe(inputSizerRef.current);
    return () => {
      observer.disconnect();
    };
  }, []);

  const commandsId = idPrefix + useId();
  const formId = idPrefix + useId();
  const collapsedSignal = useSignal(true);
  const optionsSignal = useSignal<PaletteOption[]>([]);
  const expanded = useComputed(
    () => !!optionsSignal.value.length && !collapsedSignal.value,
  );
  const ariaExpanded = useComputed(() => (expanded.value ? "true" : "false"));
  const inputStyle = useComputed(() => {
    const maxWidth = inputSizerWidth.value;
    const collapsed = collapsedSignal.value;

    if (maxWidth === undefined) {
      return `border-color: transparent`;
    }

    if (collapsed) {
      return `max-width: min(${maxWidth}px, 100%)`;
    }

    return `max-width: 100%`;
  });

  return (
    <div
      className={`${classes.main} ${className}`}
      onFocusOut={(event) => {
        const currentTarget = event.currentTarget;
        const relatedTarget = event.relatedTarget;

        const shouldCollapse =
          !relatedTarget ||
          (relatedTarget instanceof HTMLElement &&
            !currentTarget.contains(relatedTarget));

        if (shouldCollapse) {
          collapsedSignal.value = true;

          const timezoneInput = event.currentTarget
            .querySelector("form")
            ?.elements.namedItem("timezone");

          if (timezoneInput instanceof HTMLInputElement) {
            timezoneInput.value = defaultValue;
            inputSizerText.value = defaultValue;
          }
        }
      }}
    >
      <form
        aria-hidden
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();

          if (
            e.submitter &&
            "name" in e.submitter &&
            e.submitter.name === "expand"
          ) {
            collapsedSignal.value = false;
          }

          const firstOption = optionsSignal.peek()[0];
          if (firstOption?.url) {
            collapsedSignal.value = true;

            window.location.href = new URL(
              firstOption.url,
              window.location.href,
            ).toString();
          }
        }}
      ></form>
      <div
        className={classes["input-sizer"]}
        ref={inputSizerRef}
        aria-hidden={true}
      >
        {inputSizerText}
      </div>
      <input
        form={formId}
        defaultValue={defaultValue}
        style={inputStyle}
        onInput={(event) => {
          if (!event.target || !(event.target instanceof HTMLInputElement)) {
            return;
          }

          inputSizerText.value = event.target.value;
          collapsedSignal.value = false;

          loadOptions(event.target.value.trim().replace(/\s+/, " ")).then(
            (options) => {
              optionsSignal.value = options;
            },
          );
        }}
        onFocus={() => {
          collapsedSignal.value = false;
        }}
        onKeyUp={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            collapsedSignal.value = true;
          }
        }}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        role="combobox"
        aria-controls={commandsId}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-expanded={ariaExpanded}
        placeholder="Search"
        name="timezone"
      />

      {zonedDateTimeSignal ? (
        <TimezoneTransitionLabel zonedDateTimeSignal={zonedDateTimeSignal} />
      ) : null}

      <Show when={expanded}>
        <OptionsList
          id={commandsId}
          optionsSignal={optionsSignal}
          inputSizerHeight={inputSizerHeight}
        />
      </Show>
    </div>
  );
}

const pr = new window.Intl.PluralRules("en", { type: "ordinal" });
const pluralSuffixesEn = new Map([
  ["one", "st"],
  ["two", "nd"],
  ["few", "rd"],
  ["other", "th"],
]);

function formatOrdinals(n: number) {
  const rule = pr.select(n);
  const suffix = pluralSuffixesEn.get(rule);
  return `${n}${suffix}`;
}

export function TimezoneTransitionLabel({
  zonedDateTimeSignal,
}: {
  zonedDateTimeSignal: Signal<Temporal.ZonedDateTime>;
}) {
  const closeNextTransitionSignal = useComputed(() => {
    const zonedDateTime = zonedDateTimeSignal.value;
    const nextTransition = zonedDateTime.getTimeZoneTransition("next");

    if (
      nextTransition &&
      nextTransition.since(zonedDateTime).total("days") < 14
    ) {
      return nextTransition;
    }

    return null;
  });

  const nextTransitionDate = useComputed(() => {
    const nextTransition = closeNextTransitionSignal.value;
    if (!nextTransition) {
      return null;
    }

    return formatOrdinals(nextTransition.day);
  });

  const offsetDelta = useComputed(() => {
    const zonedDateTime = zonedDateTimeSignal.value;
    const closeNextTransition = closeNextTransitionSignal.value;

    if (!closeNextTransition) {
      return null;
    }

    const delta = Temporal.Duration.from({
      nanoseconds:
        closeNextTransition.offsetNanoseconds - zonedDateTime.offsetNanoseconds,
    }).round({ largestUnit: "hours" });

    return `${delta.sign === -1 ? "" : "+"}${delta
      .toLocaleString("en", {
        style: "short",
        fractionalDigits: 0,
      })
      .replace(/(\d)\s+([a-z])/i, "$1$2")}`;
  });

  return (
    <Show when={closeNextTransitionSignal}>
      <span className={classes.transitionLabel}>
        &rarr; {offsetDelta.value} on&nbsp;the&nbsp;{nextTransitionDate.value}
      </span>
    </Show>
  );
}

function OptionsList({
  id,
  optionsSignal,
  inputSizerHeight,
}: {
  id: string;
  optionsSignal: Signal<PaletteOption[]>;
  inputSizerHeight: Signal<number | undefined>;
}) {
  const optionsStyle = useComputed(() => {
    const height = inputSizerHeight.value;
    return `top: ${height ? `${height}px` : "auto"}`;
  });

  return (
    <ul id={id} role="listbox" style={optionsStyle}>
      <For each={optionsSignal}>
        {(option) => {
          return (
            <li key={option.url} role="option" tabIndex={-1}>
              <a href={option.url} tabIndex={-1}>
                {option.title}
              </a>
            </li>
          );
        }}
      </For>
    </ul>
  );
}

let fuse:
  | Fuse<{
      timezoneId: string;
      region: string | undefined;
      place: string;
      worldClockEnabled?: boolean;
    }>
  | undefined;

async function loadOptions(query: string) {
  if (!fuse) {
    const { timezones } = (await (
      await fetch("/api/timezones-index")
    ).json()) as {
      timezones: {
        timezoneId: string;
        region: string | undefined;
        place: string;
        worldClockEnabled?: boolean;
      }[];
    };

    fuse = new Fuse(timezones, {
      ignoreDiacritics: true,
      keys: [
        { name: "place", weight: 2 },
        { name: "timezoneId", weight: 1.5 },
        {
          name: "timezoneParts",
          getFn({ timezoneId }) {
            const parts = timezoneId.replace(/_/g, " ").split(/\//g);

            return [...parts, parts.join(" ")];
          },
        },
      ],
      threshold: 0.2,
      ignoreLocation: true,
    });
  }

  const results = fuse.search(query, { limit: 6 });

  return results.map((r) => ({
    url: getPathnameFromTimezone(r.item.timezoneId),
    title: r.item.place,
  }));
}
