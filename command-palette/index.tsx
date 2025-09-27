import { Signal, useComputed } from "@preact/signals";
import { For, Show } from "@preact/signals/utils";
import Fuse from "fuse.js/basic";
import { ContainerNode, render } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";

import "./index.css";
import { getPathnameFromTimezone } from "../shared/from-timezone.js";

type PaletteOption = {
  url: string;
  title: string;
  subtitle?: string;
};
let i = 0;

export function mountCommandPalette(parent: ContainerNode) {
  const collapsedSignal = new Signal(true);
  const optionsSignal = new Signal<PaletteOption[]>([]);

  render(
    <CommandPalette
      collapsedSignal={collapsedSignal}
      optionsSignal={optionsSignal}
      idPrefix={`cfp${i++}-`}
    />,
    parent,
  );

  if ("hidden" in parent && parent.hidden) {
    parent.hidden = false;
  }
}

function CommandPalette({
  collapsedSignal,
  optionsSignal,
  idPrefix,
}: {
  collapsedSignal: Signal<boolean>;
  optionsSignal: Signal<PaletteOption[]>;
  idPrefix: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    window.addEventListener("click", (event) => {
      if (
        event.target &&
        event.target instanceof HTMLElement &&
        !formRef.current?.contains(event.target) &&
        !event.target.contains(formRef.current)
      ) {
        collapsedSignal.value = true;
      }
    });
  }, []);

  return (
    <form
      ref={formRef}
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
      className="command-palette"
    >
      <CommandPaletteFields
        collapsedSignal={collapsedSignal}
        optionsSignal={optionsSignal}
        idPrefix={idPrefix}
      />
    </form>
  );
}

function CommandPaletteFields({
  collapsedSignal,
  optionsSignal,
  idPrefix,
}: {
  collapsedSignal: Signal<boolean>;
  optionsSignal: Signal<PaletteOption[]>;
  idPrefix: string;
}) {
  const commandsId = idPrefix + useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const expanded = useComputed(
    () => !!optionsSignal.value.length && !collapsedSignal.value,
  );
  const ariaExpanded = useComputed(() => (expanded.value ? "true" : "false"));

  return (
    <>
      <input
        ref={inputRef}
        name="q"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        role="combobox"
        aria-controls={commandsId}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-expanded={ariaExpanded}
        placeholder="Search"
        onInput={(event) => {
          if (!event.target || !(event.target instanceof HTMLInputElement)) {
            return;
          }

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
      />
      <Show when={expanded}>
        <ul id={commandsId} role="listbox">
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
      </Show>
    </>
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
