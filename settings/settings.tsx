import "../parcel.d.ts";

import { Temporal } from "@js-temporal/polyfill";
import { useComputed, Signal } from "@preact/signals";
import { render } from "preact";
import { useEffect, useRef } from "preact/hooks";
import Sortable from "sortablejs";
import bars from "bundle-text:@fortawesome/fontawesome-free/svgs/solid/bars.svg";

import {
  loadSettings,
  deleteTimezone,
  reorderTimezone,
  signOut,
} from "../api.js";
import {
  getLocationFromTimezone,
  getPathnameFromTimezone,
} from "../saved-timezones.js";

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
        const timezonePathname = (() => {
          try {
            Temporal.TimeZone.from(timezone);
            return getPathnameFromTimezone(timezone);
          } catch (_e) {
            //
          }
        })();

        return (
          <li key={id} className="timezone-row">
            <div
              className="dnd-handle"
              dangerouslySetInnerHTML={{ __html: bars }}
            ></div>

            <div className="timezone-label-wrapper">
              <a
                className={
                  "timezone-label" + timezonePathname ? "" : " invalid"
                }
                href={timezonePathname}
              >
                {label
                  ? `${label} (${getLocationFromTimezone(timezone)})`
                  : getLocationFromTimezone(timezone)}
              </a>
            </div>

            <form action="javascript:void(0)" onSubmit={deleteFormHandler}>
              <input type="hidden" name="id" value={id} />
              <button type="submit">Delete</button>
            </form>
          </li>
        );
      })}
    </ul>
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

  const idInput = form.querySelector<HTMLInputElement>('input[name="id"]');
  if (!idInput) {
    return;
  }

  event.preventDefault();

  deleteTimezone({ id: idInput.value }).then(() => {
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
