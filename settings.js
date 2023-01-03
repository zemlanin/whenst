import { Temporal } from "@js-temporal/polyfill";

import { loadSettings, addTimezone, deleteTimezone } from "./api";
import {
  STRICT_RELATIVE_UTC_ID_REGEX,
  getLocationFromTimezone,
  getPathnameFromTimezone,
} from "./saved-timezones";

const timezones = Intl.supportedValuesOf("timeZone");

const datalist = document.getElementById("timezones-datalist");

for (const tz of timezones) {
  const option = document.createElement("option");
  option.value = tz === "Europe/Kiev" ? "Europe/Kyiv" : tz;
  datalist.appendChild(option);
}

const addTimezoneForm = document.getElementById("add-timezone");
addTimezoneForm.addEventListener("submit", (event) => {
  const form = event.target;

  event.preventDefault();
  let inputValue = form.timezone.value;
  let timezone;

  const inputLowerCase = inputValue.toLowerCase();

  try {
    timezone = Temporal.TimeZone.from(inputValue).toString();
  } catch (e) {
    if (inputLowerCase === "europe/kyiv" || inputLowerCase === "kyiv") {
      timezone = "Europe/Kiev";
    } else if (inputLowerCase === "utc" || inputLowerCase === "gmt") {
      timezone = "UTC";
    } else if (
      inputLowerCase.match(/^(utc|gmt)[+-][0-1]?[0-9](:[0-5][0-9])?$/)
    ) {
      // ^- RELATIVE_UTC_ID_REGEX

      const offset = inputLowerCase.slice("utc".length);
      const strictOffset = offset.match(STRICT_RELATIVE_UTC_ID_REGEX)
        ? offset
        : `${offset[0]}0${offset.slice(1)}`;

      try {
        timezone = Temporal.TimeZone.from(strictOffset).toString();
      } catch (e) {
        //
      }
    } else {
      const guessTimezones = timezones.filter((v) =>
        v.toLowerCase().includes(inputLowerCase)
      );

      if (guessTimezones.length === 1) {
        timezone = guessTimezones[0];
      }
    }
  }

  if (!timezone) {
    form.timezone.setCustomValidity("Unknown timezone");
    return;
  }

  const label = form.label.value || "";
  addTimezone({ timezone, label }).then(() => {
    form.timezone.value = "";
    form.label.value = "";

    updateSavedTimezonesList();
  });
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

    item.appendChild(anchor);
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
