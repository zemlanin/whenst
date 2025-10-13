import { useEffect, useId, useRef } from "preact/hooks";
import { Signal, useComputed, useSignal } from "@preact/signals";
import { Show, For } from "@preact/signals/utils";
import * as classes from "./index.module.css";
import Fuse from "fuse.js";
import { getPathnameFromTimezone } from "../../../shared/from-timezone.js";

type PaletteOption = {
  url: string;
  title: string;
  subtitle?: string;
};

const WIDE_CHARACTER = "W";

export function TimezoneHeading({
  defaultValue = "",
  className = "",
  idPrefix = "tzh",
}: {
  defaultValue?: string;
  className?: string;
  idPrefix?: string;
}) {
  const inputSizerText = useSignal(defaultValue + WIDE_CHARACTER);
  const inputSizerWidth = useSignal<number | undefined>(undefined);
  const inputSizerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!inputSizerRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      requestAnimationFrame(() => {
        for (const entry of entries) {
          inputSizerWidth.value = Math.ceil(entry.borderBoxSize[0].inlineSize);
        }
      });
    });
    observer.observe(inputSizerRef.current);
    return () => {
      observer.disconnect();
    };
  }, []);

  const commandsId = idPrefix + useId();
  const collapsedSignal = useSignal(true);
  const optionsSignal = useSignal<PaletteOption[]>([]);
  const expanded = useComputed(
    () => !!optionsSignal.value.length && !collapsedSignal.value,
  );
  const ariaExpanded = useComputed(() => (expanded.value ? "true" : "false"));
  const inputStyle = useComputed(() =>
    inputSizerWidth.value === undefined
      ? `border-color: transparent`
      : `max-width: min(${inputSizerWidth.value}px, 100%)`,
  );

  return (
    <form
      className={`${classes.main} ${className}`}
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
      onFocusOut={(event) => {
        if (!event.relatedTarget) {
          collapsedSignal.value = true;
          return;
        }

        if (!(event.relatedTarget instanceof HTMLElement)) {
          return;
        }

        if (!event.currentTarget?.contains(event.relatedTarget)) {
          collapsedSignal.value = true;
        }
      }}
    >
      <div
        className={classes["input-sizer"]}
        ref={inputSizerRef}
        aria-hidden={true}
      >
        {inputSizerText}
      </div>
      <input
        defaultValue={defaultValue}
        style={inputStyle}
        onInput={(event) => {
          if (!event.target || !(event.target instanceof HTMLInputElement)) {
            return;
          }

          inputSizerText.value = event.target.value + WIDE_CHARACTER;
          collapsedSignal.value = false;

          loadOptions(event.target.value.trim().replace(/\s+/, " ")).then(
            (options) => {
              optionsSignal.value = options;
            },
          );
        }}
        onBlur={(event) => {
          if (!event.target || !(event.target instanceof HTMLInputElement)) {
            return;
          }

          if (!event.target.value.trim()) {
            event.target.value = defaultValue;
            inputSizerText.value = defaultValue;
          }
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

      <Show when={expanded}>
        <OptionsList
          id={commandsId}
          optionsSignal={optionsSignal}
          inputSizerWidth={inputSizerWidth}
        />
      </Show>
    </form>
  );
}

function OptionsList({
  id,
  optionsSignal,
  inputSizerWidth,
}: {
  id: string;
  optionsSignal: Signal<PaletteOption[]>;
  inputSizerWidth: Signal<number | undefined>;
}) {
  const optionsStyle = useComputed(() =>
    inputSizerWidth.value === undefined
      ? ``
      : `max-width: min(${inputSizerWidth.value}px, 100%)`,
  );

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
