import { signal, useComputed } from "@preact/signals";
import { Temporal } from "@js-temporal/polyfill";
import { ContainerNode, render } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";

import "./index.css";
import { getLocationFromTimezone } from "../saved-timezones";

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

          loadOptions(event.target.value);
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

const ZWSP = "\u200B";
const [localTimezoneRegion] = Temporal.Now.timeZoneId().split("/");
const timezones = window.Intl.supportedValuesOf("timeZone").toSorted((a, b) => {
  if (!localTimezoneRegion) {
    return 0;
  }

  const sameRegionA = a.startsWith(`${localTimezoneRegion}/`);
  const sameRegionB = b.startsWith(`${localTimezoneRegion}/`);

  if ((sameRegionA && sameRegionB) || (!sameRegionA && !sameRegionB)) {
    return 0;
  }

  if (sameRegionA) {
    return -1;
  }

  if (sameRegionB) {
    return 1;
  }

  return 0;
});
timezones.push("unix");

function loadOptions(query: string) {
  const normalizedQuery = normalize(query);

  if (!normalize(query)) {
    optionsSignal.value = [];
    return;
  }

  const queryRewrites: string[] = [];

  if (normalizedQuery.startsWith("kyiv".slice(0, normalizedQuery.length))) {
    queryRewrites.push("kiev".slice(0, normalizedQuery.length));
  }

  if (normalizedQuery.startsWith("saint".slice(0, normalizedQuery.length))) {
    queryRewrites.push(
      normalizedQuery.replace("saint".slice(0, normalizedQuery.length), "st."),
    );
  }

  optionsSignal.value = timezones
    .filter((tz) => {
      return (
        timezoneMatchesQuery(tz, normalizedQuery) ||
        queryRewrites.some((r) => timezoneMatchesQuery(tz, r))
      );
    })
    .map((tz) => ({
      url: `/${tz}`,
      title:
        tz === "unix"
          ? "Unix Epoch"
          : getLocationFromTimezone(tz).replace(/\//g, `/${ZWSP}`),
    }))
    .slice(0, 6);
}

function timezoneMatchesQuery(tz: string, normalizedQuery: string) {
  const normalizedTZ = normalize(tz);
  const normalizedLocation = normalize(getLocationFromTimezone(tz));

  return (
    normalizedTZ.includes(normalizedQuery) ||
    normalizedLocation.includes(normalizedQuery)
  );
}

function normalize(str: string) {
  return str.toLowerCase().trim().replace(/\s+/g, " ");
}
