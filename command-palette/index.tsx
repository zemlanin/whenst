import { signal, useComputed } from "@preact/signals";
import Fuse from "fuse.js/basic";
import { ContainerNode, render } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";

import "./index.css";
import { getPathnameFromTimezone } from "../shared/from-timezone.js";

export function mountCommandPalette(parent: ContainerNode) {
  render(<CommandPalette />, parent);

  if ("hidden" in parent && parent.hidden) {
    parent.hidden = false;
  }
}

const collapsedSignal = signal(true);

function CommandPalette() {
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
      <CommandPaletteFields />
    </form>
  );
}

const optionsSignal = signal<
  {
    url: string;
    title: string;
    subtitle?: string;
  }[]
>([]);

function CommandPaletteFields() {
  const commandsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const expanded = useComputed(() =>
    optionsSignal.value.length ? "true" : "false",
  );
  const listboxHidden = useComputed(
    () => expanded.value === "false" || collapsedSignal.value,
  );

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
        aria-expanded={expanded}
        placeholder="Search"
        onInput={(event) => {
          if (!event.target || !(event.target instanceof HTMLInputElement)) {
            return;
          }

          collapsedSignal.value = false;

          void loadOptions(event.target.value.trim().replace(/\s+/, " "));
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
      <ul id={commandsId} role="listbox" hidden={listboxHidden}>
        {optionsSignal.value.map((option) => {
          return (
            <li key={option.url} role="option" tabIndex={-1}>
              <a href={option.url} tabIndex={-1}>
                {option.title}
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
}

let fuse:
  | Fuse<{
      timezoneId: string;
      region: string | undefined;
      place: string;
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

  optionsSignal.value = results.map((r) => ({
    url: getPathnameFromTimezone(r.item.timezoneId),
    title: r.item.place,
  }));
}
