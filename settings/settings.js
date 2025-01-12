import { Temporal } from "@js-temporal/polyfill";
import L from "leaflet";
import Sortable from "sortablejs";
import bars from "bundle-text:@fortawesome/fontawesome-free/svgs/solid/bars.svg";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import {
  loadSettings,
  addTimezone,
  deleteTimezone,
  reorderTimezone,
  signOut,
} from "../api";
import {
  getLocationFromTimezone,
  getPathnameFromTimezone,
} from "../saved-timezones";

import { guessTimezone } from "../guess-timezone";

const map = L.map(
  document.getElementById("timezones-edit").querySelector(".timezones-map"),
  {
    minZoom: 1,
    maxZoom: 8,
    maxBounds: [
      [-90, -180],
      [90, 180],
    ],
    maxBoundsViscosity: 1,
    worldCopyJump: true,
  },
).setView([40, 0], 1);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

/** @type AbortController | undefined */
let mapClickRequestAbortController;

/** @type L.Marker | undefined */
let mapMarker;
/** @type L.GeoJSON | undefined */
let mapArea;

map.on("click", async (e) => {
  const { lat, lng } = e.latlng.wrap();

  if (mapClickRequestAbortController) {
    mapClickRequestAbortController.abort();
    mapClickRequestAbortController = undefined;
  }

  mapClickRequestAbortController = new AbortController();
  const { signal } = mapClickRequestAbortController;

  const timezoneResp = await fetch(
    `/api/geotz?` +
      new URLSearchParams({
        lat: lat.toPrecision(3),
        lng: lng.toPrecision(3),
      }),
    { signal },
  );

  const { timezone, geometry } = await timezoneResp.json();

  if (mapMarker) {
    mapMarker.remove();
    mapMarker = undefined;
  }

  if (mapArea) {
    mapArea.remove();
    mapArea = undefined;
  }

  mapMarker = L.marker(e.latlng, {
    icon: new L.Icon.Default({
      iconUrl: markerIcon,
      iconRetinaUrl: markerIcon2x,
      shadowUrl: markerShadow,
    }),
  }).addTo(map);
  mapArea = L.geoJSON(geometry).addTo(map);

  addTimezoneForm.timezone.value = timezone;

  mapClickRequestAbortController = undefined;
});

const sortable = Sortable.create(document.getElementById("timezones-list"), {
  handle: ".dnd-handle",
  ghostClass: "sortable-ghost",
  onEnd(event) {
    const { item, newDraggableIndex } = event;
    const id = item.querySelector('input[name="id"]').value;

    item.classList.add("saving");
    sortable.option("disabled", true);

    reorderTimezone({ id, index: newDraggableIndex }).then(() => {
      updateSavedTimezonesList();
      item.classList.remove("saving");
      sortable.option("disabled", false);
    });
  },
});

const timezones = window.Intl.supportedValuesOf("timeZone");

const datalist = document.getElementById("timezones-datalist");

for (const tz of timezones) {
  const option = document.createElement("option");
  option.value = tz === "Europe/Kiev" ? "Europe/Kyiv" : tz;
  datalist.appendChild(option);
}

const addTimezoneForm = document.getElementById("add-timezone");
addTimezoneForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const form = event.target;
  const timezone = guessTimezone(form.timezone.value);

  if (!timezone) {
    form.timezone.setCustomValidity("Unknown timezone");
    return;
  }

  const label = form.label.value || "";
  addTimezone({ timezone: timezone.toString(), label }).then(() => {
    form.timezone.value = "";
    form.label.value = "";

    updateSavedTimezonesList();
  });
});

addTimezoneForm.addEventListener("input", (event) => {
  const input = event.target;
  const value = input.value;

  if (input.name === "label") {
    return;
  }

  if (!value) {
    input.setCustomValidity("");
    return;
  }

  const timezone = guessTimezone(value);

  input.setCustomValidity(timezone ? "" : "Unknown timezone");
});

document.getElementById("sign-out-button").addEventListener("click", () => {
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
    document.getElementById("sign-out-button").parentNode.hidden = false;
  }

  const list = document.getElementById("timezones-list");
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

function deleteFormHandler(event) {
  const form = event.target;

  event.preventDefault();

  deleteTimezone({ id: form.id.value }).then(() => {
    updateSavedTimezonesList();
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function loadDataForNerds() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const [color, version] = await Promise.all([
    postSWMessage({ type: "GET_COLOR" }),
    postSWMessage({ type: "GET_VERSION" }),
  ]);

  document.getElementById("sw-version").textContent = version;
  document.getElementById("cached-color-square").style.backgroundColor = color;
  document.getElementById("cached-color-text").textContent = color;
}

async function postSWMessage(data) {
  const channel = new MessageChannel();
  const response = new Promise((resolve, reject) => {
    const cleanup = () => {
      channel.port1.removeEventListener("message", handleMessage);
      channel.port1.removeEventListener("messageerror", handleMessage);
      channel.port1.close();
    };

    const handleMessage = (event) => {
      resolve(event.data);
      cleanup();
    };

    const handleError = (event) => {
      reject(event.data);
      cleanup();
    };

    channel.port1.addEventListener("message", handleMessage);
    channel.port1.addEventListener("messageerror", handleError);
    channel.port1.start();
  });

  const registration = await navigator.serviceWorker.ready;
  registration.active.postMessage(data, [channel.port2]);

  return response;
}
