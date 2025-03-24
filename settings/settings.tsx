import "../parcel.d.ts";

import { useComputed, Signal } from "@preact/signals";
import { render } from "preact";
import { useEffect, useRef } from "preact/hooks";
import Sortable from "sortablejs";
import bars from "bundle-text:@fortawesome/fontawesome-free/svgs/solid/bars.svg";

import {
  loadSettings,
  deleteTimezone,
  reorderTimezone,
  changeTimezoneLabel,
  signOut,
} from "../api.js";
import { getLocationFromTimezone } from "../saved-timezones.js";

import { mountCommandPalette } from "../command-palette/index.js";

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

        item.classList.add("saving");
        sortable.option("disabled", true);

        reorderTimezone({ id, index: newDraggableIndex }).then(() => {
          updateSavedTimezonesList();
          item.classList.remove("saving");
          sortable.option("disabled", false);
        });
      },
    });
  }, []);

  return (
    <ul id="timezones-list" ref={timezonesListRef}>
      {timezones.value.map(({ id, timezone, label }) => {
        return (
          <li key={id} className="timezone-row">
            <div
              className="dnd-handle"
              dangerouslySetInnerHTML={{ __html: bars }}
            ></div>

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
      })}
    </ul>
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
  const location = (() => {
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
        placeholder={location}
        value={label || location}
        className="timezone-label"
        onChange={(event) => {
          const input = event.target as HTMLInputElement | null;

          if (!input) {
            return;
          }

          changeTimezoneLabel({ id, label: input.value }).then(() => {
            updateSavedTimezonesList();
          });
        }}
      />
      {label && label !== location ? (
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

  deleteTimezone({ id: idInput.value }).then(() => {
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

  changeTimezoneLabel({ id: idInput.value, label: labelInput.value }).then(
    () => {
      updateSavedTimezonesList();
    },
  );
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
