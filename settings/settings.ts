import "../parcel.d.ts";

import { Temporal } from "@js-temporal/polyfill";
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

const timezonesList = document.getElementById("timezones-list");
if (timezonesList) {
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
}

document.getElementById("sign-out-button")?.addEventListener("click", () => {
  signOut().then(async () => {
    // request new settings to invalidate SW cache
    await loadSettings();
    location.href = "/";
  });
});

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

  const list = document.getElementById("timezones-list");
  if (!list) {
    return;
  }

  for (const item of list.querySelectorAll("li")) {
    list.removeChild(item);
  }

  for (const { id, timezone, label } of timezones) {
    const item = document.createElement("li");
    item.className = "timezone-row";

    const dndBars = document.createElement("div");
    dndBars.className = "dnd-handle";
    dndBars.innerHTML = bars;

    const labelWrapper = document.createElement("div");
    labelWrapper.className = "timezone-label-wrapper";

    const anchor = document.createElement("a");
    anchor.className = "timezone-label";
    anchor.innerText = label
      ? `${label} (${getLocationFromTimezone(timezone)})`
      : getLocationFromTimezone(timezone);

    try {
      Temporal.TimeZone.from(timezone);
      anchor.href = getPathnameFromTimezone(timezone);
    } catch (_e) {
      anchor.className += " invalid";
    }

    labelWrapper.appendChild(anchor);

    const form = document.createElement("form");
    form.action = "javascript:void(0)";
    const idInput = document.createElement("input");
    idInput.name = "id";
    idInput.type = "hidden";
    idInput.value = id;
    form.appendChild(idInput);

    const deleteButton = document.createElement("button");
    deleteButton.type = "submit";
    deleteButton.textContent = "Delete";
    form.appendChild(deleteButton);

    form.addEventListener("submit", deleteFormHandler);

    item.appendChild(dndBars);
    item.appendChild(labelWrapper);
    item.appendChild(form);

    list.appendChild(item);
  }
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
