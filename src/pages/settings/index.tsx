import { useComputed, useSignal } from "@preact/signals";
import { For, Show } from "@preact/signals/utils";
import { render } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";
import Sortable from "sortablejs";

import Bars from "../../../icons/bars.svg.js";

import {
  deleteWorldClock,
  reorderWorldClock,
  changeWorldClockLabel,
  worldClockSignal,
} from "../../api.js";
import { getLocationFromTimezone } from "../../../shared/from-timezone.js";
import "../../keyboard";

import { AddTimezoneForm } from "./add-timezone-form.js";
import { Sync } from "./Sync.js";

const timezonesEdit = document.getElementById("timezones-edit");
if (timezonesEdit) {
  render(
    <>
      <h2>World clock</h2>
      <TimezonesEdit />
    </>,
    timezonesEdit,
  );
}

const syncEl = document.getElementById("sync");
if (syncEl) {
  render(
    <Show when={worldClockSignal}>
      <>
        <h2>Sync</h2>
        <Sync />
      </>
    </Show>,
    syncEl,
  );
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

        sortable.option("disabled", true);

        const after =
          newDraggableIndex === 0
            ? "0"
            : worldClockSignal.peek()?.[
                // TODO: wtf is this mess
                newDraggableIndex > oldDraggableIndex
                  ? newDraggableIndex
                  : newDraggableIndex - 1
              ]?.position;

        reorderWorldClock({ id, after: after ?? "0" }).then(() => {
          sortable.option("disabled", false);
        });
      },
    });
  }, []);

  const definedWorldClock = useComputed(() => {
    return worldClockSignal.value ?? [];
  });

  return (
    <>
      <div className="timezone-row">
        <AddTimezoneForm />
      </div>
      <ul id="timezones-list" ref={timezonesListRef}>
        <For each={definedWorldClock}>
          {({ id, timezone, label }) => {
            return (
              <TimezoneRow key={id} id={id} timezone={timezone} label={label} />
            );
          }}
        </For>
      </ul>
    </>
  );
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
  return (
    <li className="timezone-row">
      <div className="dnd-handle">
        <Bars height="1em" width="1em" />
      </div>

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
  const labelInputId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const tzLocation = (() => {
    try {
      return getLocationFromTimezone(timezone);
    } catch (_e) {
      return undefined;
    }
  })();

  const labelInputSignal = useSignal(label || tzLocation);
  const showSubtitle = useComputed(() => {
    return (
      labelInputSignal.value && labelInputSignal.value.trim() !== tzLocation
    );
  });

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
        placeholder="Label"
        value={labelInputSignal}
        maxLength={80}
        className="timezone-label"
        id={labelInputId}
        name="label"
        onInput={(event) => {
          const input = event.target as HTMLInputElement | null;

          if (!input) {
            return;
          }

          labelInputSignal.value = input.value;
        }}
        onChange={(event) => {
          const input = event.target as HTMLInputElement | null;

          if (!input) {
            return;
          }

          const label = input.value;

          labelInputSignal.value = label;
          changeWorldClockLabel({ id, label });
        }}
      />
      <Show when={showSubtitle}>
        <label htmlFor={labelInputId} className="subtitle" title={tzLocation}>
          {tzLocation}
        </label>
      </Show>
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

  deleteWorldClock({ id });
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

  changeWorldClockLabel({ id, label });
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
