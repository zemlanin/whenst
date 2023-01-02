import { loadSettings, addTimezone, deleteTimezone } from "./api";

const timezones = Intl.supportedValuesOf("timeZone");

const datalist = document.getElementById("timezones-datalist");

for (const tz of timezones) {
  if (tz === "UTC") {
    continue;
  }
  const option = document.createElement("option");
  option.value = tz === "Europe/Kiev" ? "Europe/Kyiv" : tz;
  datalist.appendChild(option);
}

const addTimezoneForm = document.getElementById("add-timezone");
addTimezoneForm.addEventListener("submit", (event) => {
  const form = event.target;

  event.preventDefault();
  let timezone = form.timezone.value;
  const label = form.label.value || "";

  if (!timezones.includes(timezone)) {
    if (
      timezone.toLowerCase() === "europe/kyiv" ||
      timezone.toLowerCase() === "kyiv"
    ) {
      timezone = "Europe/Kiev";
    } else {
      const guessTimezones = timezones.filter((v) =>
        v.toLowerCase().includes(timezone.toLowerCase())
      );

      if (guessTimezones.length === 1) {
        timezone = guessTimezones[0];
      }
    }
  }

  if (!timezone) {
    form.timezone.setCustomValidity("Unknown timezone");
  }

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
    const TZstring = timezone.toString();
    anchor.href = `/${TZstring === "Europe/Kiev" ? "Europe/Kyiv" : TZstring}`;
    anchor.innerText = label
      ? `${label} (${getLocationFromTimezone(timezone)})`
      : getLocationFromTimezone(timezone);

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

function getLocationFromTimezone(tz) {
  const parts = tz.toString().split("/");

  const location = parts.length === 3 ? `${parts[1]}/${parts[2]}` : parts[1];

  if (location === "Kiev") {
    return "Kyiv";
  } else if (location === "Sao_Paulo") {
    return "São Paulo";
  }

  return location.replace(/^St_/, "St. ").replace(/_/g, " ");
}
