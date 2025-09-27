import "../parcel.d.ts";

import { useComputed, Signal } from "@preact/signals";
import { render } from "preact";
import { useEffect, useRef } from "preact/hooks";
import Sortable from "sortablejs";

import Bars from "../icons/bars.svg.js";
import CircleNotch from "../icons/circle-notch.svg.js";
import Check from "../icons/check.svg.js";

import {
  deleteWorldClock,
  reorderWorldClock,
  changeWorldClockLabel,
  worldClockSignal,
} from "../api.js";
import { getLocationFromTimezone } from "../shared/from-timezone.js";
import "../keyboard";

import { mountCommandPalette } from "../command-palette/index.js";
import { AddTimezoneForm } from "./add-timezone-form.js";
import { AccountEdit } from "./AccountEdit.js";

const savingStateSignal = new Signal<{
  [K in string]?: "initial" | "saving" | "saved";
}>({});

const timezonesEdit = document.getElementById("timezones-edit");
if (timezonesEdit) {
  render(<TimezonesEdit />, timezonesEdit);
}

const accountEdit = document.getElementById("account-edit");
if (accountEdit) {
  render(<AccountEdit />, accountEdit);
}

function TimezonesEdit() {
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
        const { item, newDraggableIndex, oldDraggableIndex } = event;
        const id =
          item.querySelector<HTMLInputElement>('input[name="id"]')?.value;

        if (
          !id ||
          newDraggableIndex === undefined ||
          oldDraggableIndex === undefined ||
          newDraggableIndex === oldDraggableIndex
        ) {
          return;
        }

        setSavingState(id, "saving");
        sortable.option("disabled", true);

        const after =
          newDraggableIndex === 0
            ? "0"
            : worldClockSignal.peek()[
                // TODO: wtf is this mess
                newDraggableIndex > oldDraggableIndex
                  ? newDraggableIndex
                  : newDraggableIndex - 1
              ]?.position;

        reorderWorldClock({ id, after: after ?? "0" }).then(() => {
          setSavingState(id, "saved");
          sortable.option("disabled", false);
        });
      },
    });
  }, []);

  return (
    <>
      <div className="timezone-row">
        <AddTimezoneForm />
      </div>
      <ul id="timezones-list" ref={timezonesListRef}>
        {worldClockSignal.value.map(({ id, timezone, label }) => {
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

          changeWorldClockLabel({ id, label }).then(() => {
            setSavingState(id, "saved");
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

  deleteWorldClock({ id }).then(() => {
    setSavingState(id, "saved");
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

  changeWorldClockLabel({ id, label }).then(() => {
    setSavingState(id, "saved");
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
