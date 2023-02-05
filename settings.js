import { Temporal } from "@js-temporal/polyfill";
import Sortable from "sortablejs";
import bars from "bundle-text:@fortawesome/fontawesome-free/svgs/solid/bars.svg";

import {
  loadSettings,
  addTimezone,
  deleteTimezone,
  reorderTimezone,
} from "./api";
import {
  getLocationFromTimezone,
  getPathnameFromTimezone,
} from "./saved-timezones";

import { guessTimezone } from "./guess-timezone";

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

const timezones = Intl.supportedValuesOf("timeZone");

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

updateSavedTimezonesList();

async function updateSavedTimezonesList() {
  const { timezones } = await loadSettings();

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
    } catch (e) {
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
