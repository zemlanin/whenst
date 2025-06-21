import "../parcel.d.ts";

import { useComputed, Signal } from "@preact/signals";
import { render } from "preact";
import { useEffect, useRef } from "preact/hooks";
import Sortable from "sortablejs";

import Bars from "../icons/bars.svg.js";
import CircleNotch from "../icons/circle-notch.svg.js";
import Check from "../icons/check.svg.js";

import {
  loadSettings,
  deleteTimezone,
  reorderTimezone,
  changeTimezoneLabel,
  signOut,
} from "../api.js";
import { getLocationFromTimezone } from "../shared/from-timezone.js";
import "../keyboard";

import { mountCommandPalette } from "../command-palette/index.js";
import { AddTimezoneForm } from "./add-timezone-form.js";

document.getElementById("sign-out-button")?.addEventListener("click", () => {
  signOut().then(async () => {
    // request new settings to invalidate SW cache
    await loadSettings();
    location.href = "/";
  });
});

type UnpackPromise<T extends PromiseLike<unknown>> =
  T extends PromiseLike<infer R> ? R : never;

type SettingsPayload = UnpackPromise<ReturnType<typeof loadSettings>>;

const settingsSignal = new Signal<SettingsPayload>({
  timezones: [],
  signedIn: false,
});

const savingStateSignal = new Signal<{
  [K in string]?: "initial" | "saving" | "saved";
}>({});

const timezonesEdit = document.getElementById("timezones-edit");
if (timezonesEdit) {
  render(<TimezonesEdit settingsSignal={settingsSignal} />, timezonesEdit);
}

function TimezonesEdit({
  settingsSignal,
}: {
  settingsSignal: Signal<SettingsPayload>;
}) {
  const timezones = useComputed(() => settingsSignal.value.timezones);
  const timezonesListRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const timezonesList = timezonesListRef.current;

    if (!timezonesList) {
      return;
    }

    const sortable = Sortable.create(timezonesList, {
      handle: ".dnd-handle",
      ghostClass: "sortable-ghost",
      onEnd(event) {
        const { item, newDraggableIndex } = event;
        const id =
          item.querySelector<HTMLInputElement>('input[name="id"]')?.value;

        if (!id || newDraggableIndex === undefined) {
          return;
        }

        setSavingState(id, "saving");
        sortable.option("disabled", true);

        reorderTimezone({ id, index: newDraggableIndex }).then(() => {
          updateSavedTimezonesList();
          setSavingState(id, "saved");
          sortable.option("disabled", false);
        });
      },
    });
  }, []);

  return (
    <>
      <div className="timezone-row">
        <AddTimezoneForm updateSavedTimezonesList={updateSavedTimezonesList} />
      </div>
      <ul id="timezones-list" ref={timezonesListRef}>
        {timezones.value.map(({ id, timezone, label }) => {
          return (
            <TimezoneRow key={id} id={id} timezone={timezone} label={label} />
          );
        })}
      </ul>
    </>
  );
}

function setSavingState(id: string, state: "initial" | "saving" | "saved") {
  savingStateSignal.value = {
    ...savingStateSignal.peek(),
    [id]: state,
  };

  if (state === "saved") {
    setTimeout(() => {
      if (savingStateSignal.peek()[id] === "saved") {
        setSavingState(id, "initial");
      }
    }, 1000);
  }
}

function TimezoneRow({
  id,
  timezone,
  label,
}: {
  id: string;
  timezone: string;
  label: string;
}) {
  const className = useComputed(() => {
    const savingState = savingStateSignal.value[id] ?? "initial";

    return (
      "timezone-row" +
      (savingState === "initial"
        ? ""
        : savingState === "saving"
          ? " saving"
          : savingState === "saved"
            ? " saved"
            : "")
    );
  });

  const icon = useComputed(() => {
    const savingState = savingStateSignal.value[id] ?? "initial";

    if (savingState === "saving") {
      return <CircleNotch height="1em" width="1em" />;
    }

    if (savingState === "saved") {
      return <Check height="1em" width="1em" />;
    }

    return <Bars height="1em" width="1em" />;
  });

  return (
    <li className={className}>
      <div className="dnd-handle">{icon}</div>

      <TimezoneLabelForm id={id} timezone={timezone} label={label} />

      <form
        action="javascript:void(0)"
        onSubmit={deleteFormHandler}
        className="delete-form"
      >
        <input type="hidden" name="id" value={id} />
        <button type="submit">Delete</button>
      </form>
    </li>
  );
}

function TimezoneLabelForm({
  id,
  timezone,
  label,
}: {
  id: string;
  timezone: string;
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const tzLocation = (() => {
    try {
      return getLocationFromTimezone(timezone);
    } catch (_e) {
      return undefined;
    }
  })();

  return (
    <form
      action=""
      className="timezone-label-wrapper"
      onSubmit={patchFormHandler}
      ref={formRef}
    >
      <input type="hidden" name="id" value={id} />
      <input
        type="text"
        maxLength={80}
        placeholder={tzLocation}
        value={label || tzLocation}
        className="timezone-label"
        onChange={(event) => {
          const input = event.target as HTMLInputElement | null;

          if (!input) {
            return;
          }

          const label = input.value;

          setSavingState(id, "saving");

          changeTimezoneLabel({ id, label }).then(() => {
            setSavingState(id, "saved");
            updateSavedTimezonesList();
          });
        }}
      />
      {label && label !== tzLocation ? (
        <span className="subtitle">
          {timezone === "Europe/Kiev" ? "Europe/Kyiv" : timezone}
        </span>
      ) : null}
    </form>
  );
}

updateSavedTimezonesList();

async function updateSavedTimezonesList() {
  const { timezones, signedIn } = await loadSettings();

  if (signedIn) {
    const signOutButton = document.getElementById("sign-out-button");
    if (
      signOutButton?.parentNode &&
      "hidden" in signOutButton.parentNode &&
      signOutButton.parentNode.hidden
    ) {
      signOutButton.parentNode.hidden = false;
    }
  }

  settingsSignal.value = { timezones, signedIn };
}

function deleteFormHandler(event: SubmitEvent) {
  const form = event.target as HTMLFormElement | null;

  if (!form) {
    return;
  }

  event.preventDefault();

  const idInput = form.querySelector<HTMLInputElement>('input[name="id"]');
  if (!idInput) {
    return;
  }

  const id = idInput.value;
  setSavingState(id, "saving");

  deleteTimezone({ id }).then(() => {
    setSavingState(id, "saved");
    updateSavedTimezonesList();
  });
}

function patchFormHandler(event: SubmitEvent) {
  const form = event.target as HTMLFormElement | null;

  if (!form) {
    return;
  }

  event.preventDefault();

  const idInput = form.querySelector<HTMLInputElement>('input[name="id"]');
  const labelInput = form.querySelector<HTMLInputElement>(
    'input[name="label"]',
  );
  if (!idInput || !labelInput) {
    return;
  }

  const id = idInput.value;
  const label = labelInput.value;

  setSavingState(id, "saving");

  changeTimezoneLabel({ id, label }).then(() => {
    setSavingState(id, "saved");
    updateSavedTimezonesList();
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function loadDataForNerds() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [color, version] = await Promise.all([
    postSWMessage({ type: "GET_COLOR" }),
    postSWMessage({ type: "GET_VERSION" }),
  ]);

  // document.getElementById("sw-version").textContent = version;
  // document.getElementById("cached-color-square").style.backgroundColor = color;
  // document.getElementById("cached-color-text").textContent = color;
}

async function postSWMessage(data: { type: string }) {
  const channel = new MessageChannel();
  const response = new Promise((resolve, reject) => {
    const cleanup = () => {
      channel.port1.removeEventListener("message", handleMessage);
      channel.port1.removeEventListener("messageerror", handleMessage);
      channel.port1.close();
    };

    const handleMessage = (event: MessageEvent) => {
      resolve(event.data);
      cleanup();
    };

    const handleError = (event: MessageEvent) => {
      reject(event.data);
      cleanup();
    };

    channel.port1.addEventListener("message", handleMessage);
    channel.port1.addEventListener("messageerror", handleError);
    channel.port1.start();
  });

  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage(data, [channel.port2]);

  return response;
}

const cmdRoot = document.getElementById("cmd-root");
if (cmdRoot) {
  mountCommandPalette(cmdRoot);
}

const cmdTitle = document.getElementById("cmd-title");
if (cmdTitle) {
  mountCommandPalette(cmdTitle);
}
