import { Signal, useComputed } from "@preact/signals";
import Fuse from "fuse.js/basic";
import { useEffect, useId, useRef } from "preact/hooks";

import Plus from "../icons/plus.svg.js";
import CircleNotch from "../icons/circle-notch.svg.js";
import Check from "../icons/check.svg.js";

import "./add-timezone-form.css";
import { addTimezone } from "../api.js";

const collapsedSignal = new Signal(true);
const activeValueSignal = new Signal("");
const addingStateSignal = new Signal<"initial" | "saving" | "saved">("initial");

export function AddTimezoneForm({
  updateSavedTimezonesList,
}: {
  updateSavedTimezonesList: () => void;
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

  const disabledSignal = useComputed(() => activeValueSignal.value === "");

  const plusIconClassName = useComputed(() => {
    const addingState = addingStateSignal.value;

    return (
      "plus-icon" +
      (addingState === "initial"
        ? ""
        : addingState === "saving"
          ? " saving"
          : addingState === "saved"
            ? " saved"
            : "")
    );
  });

  const icon = useComputed(() => {
    const addingState = addingStateSignal.value;

    if (addingState === "saving") {
      return <CircleNotch height="1em" width="1em" />;
    }

    if (addingState === "saved") {
      return <Check height="1em" width="1em" />;
    }

    return <Plus height="1em" width="1em" />;
  });

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

          const firstOption = optionsSignal.peek()[0];
          if (firstOption?.timezoneId) {
            activeValueSignal.value = firstOption.timezoneId;
            collapsedSignal.value = true;
          }
        }

        if (disabledSignal.peek()) {
          return;
        }

        setAddingState("saving");

        addTimezone({
          id: undefined,
          timezone: activeValueSignal.peek(),
          label: "",
        }).then(() => {
          updateSavedTimezonesList();

          setAddingState("saved");

          for (const input of formRef.current?.querySelectorAll("input") ??
            []) {
            input.value = "";
          }
          optionsSignal.value = [];
          collapsedSignal.value = true;
          activeValueSignal.value = "";
        });
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
      className="add-timezone-form"
    >
      <div className={plusIconClassName}>{icon}</div>
      <AddTimezoneFormMainInput />
      <button type="submit" disabled={disabledSignal} className="primary">
        Add
      </button>
    </form>
  );
}

function setAddingState(state: "initial" | "saving" | "saved") {
  addingStateSignal.value = state;

  if (state === "saved") {
    setTimeout(() => {
      if (addingStateSignal.peek() === "saved") {
        setAddingState("initial");
      }
    }, 1000);
  }
}

const optionsSignal = new Signal<
  {
    title: string;
    timezoneId: string;
    subtitle?: string;
  }[]
>([]);

function AddTimezoneFormMainInput() {
  const commandsId = "atf" + useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const expanded = useComputed(() =>
    optionsSignal.value.length ? "true" : "false",
  );
  const listboxHidden = useComputed(
    () =>
      expanded.value === "false" ||
      collapsedSignal.value ||
      optionsSignal.value.every(
        (option) => option.title === inputRef.current?.value.trim(),
      ),
  );

  return (
    <div className="main-input">
      <input type="hidden" name="timezone-id" value={activeValueSignal} />
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
        placeholder="Add timezone"
        onInput={(event) => {
          if (!event.target || !(event.target instanceof HTMLInputElement)) {
            return;
          }

          collapsedSignal.value = false;

          loadOptions(event.target.value.trim().replace(/\s+/, " ")).then(
            () => {
              const firstOption = optionsSignal.peek()[0];
              if (firstOption?.timezoneId) {
                activeValueSignal.value = firstOption.timezoneId;
              } else {
                activeValueSignal.value = "";
              }
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
      <ul id={commandsId} role="listbox" hidden={listboxHidden}>
        {optionsSignal.value.map((option) => {
          return (
            <li
              key={option.timezoneId}
              role="option"
              tabIndex={-1}
              value={option.timezoneId}
              onClick={() => {
                collapsedSignal.value = true;
                activeValueSignal.value = option.timezoneId;

                if (inputRef.current) {
                  inputRef.current.value = option.title;
                  inputRef.current.focus();
                }
              }}
            >
              {option.title}
            </li>
          );
        })}
      </ul>
    </div>
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
    timezoneId: r.item.timezoneId,
    title: r.item.place,
  }));
}
