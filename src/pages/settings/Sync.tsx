import { useSignal, useComputed, batch, Signal } from "@preact/signals";

import {
  signOut,
  sqrapInit,
  sqrapStatus,
  accountSignal,
  sendAuthCheckMessage,
  createAccount,
  syncEverything,
} from "../../api.js";
import { Show } from "@preact/signals/utils";
import { useId } from "preact/hooks";
import { LinkEnterCode } from "../../components/LinkEnterCode/index.js";

export function Sync() {
  return (
    <Show when={accountSignal} fallback={<SignedOut />}>
      <SignedIn />
    </Show>
  );
}

const SIGNED_IN_FROM_HERE_TAB_ID = "settings-signed-in-from-here";
const DISABLE_SYNC_TAB_ID = "settings-signed-in-disable-sync";

function SignedIn() {
  const activeTab = useSignal<
    typeof SIGNED_IN_FROM_HERE_TAB_ID | typeof DISABLE_SYNC_TAB_ID
  >(SIGNED_IN_FROM_HERE_TAB_ID);
  return <SignedInTabs activeTab={activeTab} />;
}

function SignedInTabs({
  activeTab,
}: {
  activeTab: Signal<
    typeof SIGNED_IN_FROM_HERE_TAB_ID | typeof DISABLE_SYNC_TAB_ID
  >;
}) {
  const id = "sit-" + useId();

  const fromHereActive = useComputed(
    () => activeTab.value === SIGNED_IN_FROM_HERE_TAB_ID,
  );
  const fromHereTabIndex = useComputed(() => (fromHereActive.value ? 0 : -1));

  const disableSyncActive = useComputed(
    () => activeTab.value === DISABLE_SYNC_TAB_ID,
  );
  const disableSyncTabIndex = useComputed(() =>
    disableSyncActive.value ? 0 : -1,
  );

  return (
    <>
      <div className="tabs-row" role="tablist">
        <div className="scrolly">
          <button
            role="tab"
            tabIndex={fromHereTabIndex}
            aria-selected={fromHereActive}
            onClick={() => {
              activeTab.value = SIGNED_IN_FROM_HERE_TAB_ID;
            }}
            aria-controls={id}
          >
            From this device
          </button>
          <button
            role="tab"
            tabIndex={disableSyncTabIndex}
            aria-selected={disableSyncActive}
            onClick={() => {
              activeTab.value = DISABLE_SYNC_TAB_ID;
            }}
            aria-controls={id}
          >
            Disable sync
          </button>
        </div>
      </div>

      <div id={id} style="margin-bottom: 1rem">
        <Show when={fromHereActive}>
          <SignedInFromHereSyncTab />
        </Show>
        <Show when={disableSyncActive}>
          <SignedInDisableSyncTab />
        </Show>
      </div>
    </>
  );
}

function SignedInFromHereSyncTab() {
  return (
    <>
      <p>
        To sync your settings to another device, go <i>there</i> to{" "}
        <b>Settings &rarr; Sync &rarr; To this device</b>, press <b>Start</b>{" "}
        button, and follow the instructions to get the sync code
      </p>
      <LinkEnterCode />
    </>
  );
}

function SignedInDisableSyncTab() {
  return (
    <div>
      <p>Stop sharing your settings across devices</p>

      <button
        onClick={() => {
          signOut().then(async () => {
            await sendAuthCheckMessage();
          });
        }}
      >
        Sign out
      </button>
    </div>
  );
}

const SIGN_IN_TAB_ID = "settings-signed-out-sign-in";
const CREATE_ACCOUNT_TAB_ID = "settings-signed-out-create-account";

function SignedOut() {
  const activeTab = useSignal<
    typeof SIGN_IN_TAB_ID | typeof CREATE_ACCOUNT_TAB_ID
  >(CREATE_ACCOUNT_TAB_ID);
  return <SignedOutTabs activeTab={activeTab} />;
}

function SignedOutTabs({
  activeTab,
}: {
  activeTab: Signal<typeof SIGN_IN_TAB_ID | typeof CREATE_ACCOUNT_TAB_ID>;
}) {
  const id = "sot-" + useId();

  const signInActive = useComputed(() => activeTab.value === SIGN_IN_TAB_ID);
  const signInTabIndex = useComputed(() => (signInActive.value ? 0 : -1));

  const createAccountActive = useComputed(
    () => activeTab.value === CREATE_ACCOUNT_TAB_ID,
  );
  const createAccountTabIndex = useComputed(() =>
    createAccountActive.value ? 0 : -1,
  );

  return (
    <>
      <div className="tabs-row" role="tablist">
        <div className="scrolly">
          <button
            role="tab"
            tabIndex={createAccountTabIndex}
            aria-selected={createAccountActive}
            onClick={() => {
              activeTab.value = CREATE_ACCOUNT_TAB_ID;
            }}
            aria-controls={id}
          >
            From this device
          </button>
          <button
            role="tab"
            tabIndex={signInTabIndex}
            aria-selected={signInActive}
            onClick={() => {
              activeTab.value = SIGN_IN_TAB_ID;
            }}
            aria-controls={id}
          >
            To this device
          </button>
        </div>
      </div>

      <div id={id} style="margin-bottom: 1rem">
        <Show when={createAccountActive}>
          <SignedOutCreateAccountTab />
        </Show>
        <Show when={signInActive}>
          <SignedOutSignInTab />
        </Show>
      </div>
    </>
  );
}

function SignedOutSignInTab() {
  const code = useSignal("");

  const receiverStarting = useSignal(false);
  const startError = useSignal(null);
  const hasCode = useComputed(() => !!code.value);
  const disableStart = useComputed(
    () => receiverStarting.value || hasCode.value,
  );
  const startButtonText = useComputed(() => (hasCode.value ? "✔" : "Start"));
  const startButtonClassName = useComputed(() =>
    hasCode.value ? "✔" : "primary",
  );

  const checkingStatus = useSignal(false);
  const statusError = useSignal(null);
  const disableStatusCheck = useComputed(
    () => !!checkingStatus.value || !!statusError.value || !code.value,
  );
  const checkButtonText = useComputed(() =>
    statusError.value ? "⚠" : "Finish",
  );

  return (
    <>
      <p>Sync your settings to another device</p>
      <Show
        when={hasCode}
        fallback={
          <button
            className={startButtonClassName}
            onClick={() => {
              batch(() => {
                startError.value = null;
                receiverStarting.value = true;
              });

              sqrapInit().then(
                async (resp) => {
                  batch(() => {
                    receiverStarting.value = false;
                    code.value = resp.code;
                  });
                },
                (error) => {
                  batch(() => {
                    startError.value = error;
                    receiverStarting.value = false;
                  });
                },
              );
            }}
            disabled={disableStart}
          >
            {startButtonText}
          </button>
        }
      >
        <ul>
          {startError.value ? (
            <li style="color: red">Failed to start. Try again</li>
          ) : null}

          {code.value ? (
            <>
              <li style="margin-block: 0.5rem">
                On another device:
                <ol>
                  <li style="margin-block: 0.5rem">
                    Open{" "}
                    <b>{location.origin.replace(/^https?:\/\//, "")}/link</b> or
                    go to <b>Settings &rarr; Sync &rarr; From this device</b>
                  </li>
                  <li style="margin-block: 0.5rem">
                    Enter <b>{code}</b> in the “sync code” field
                  </li>
                  <li style="margin-block: 0.5rem">Press “Send” button</li>
                </ol>
              </li>

              <li style="margin-block: 0.5rem">
                Press this button:{" "}
                <button
                  className="primary"
                  onClick={() => {
                    batch(() => {
                      checkingStatus.value = true;
                      statusError.value = null;
                    });

                    sqrapStatus({ code: code.peek() }).then(
                      async ({ done }) => {
                        if (done) {
                          await sendAuthCheckMessage();
                          return;
                        }

                        checkingStatus.value = false;
                      },
                      (error) => {
                        batch(() => {
                          statusError.value = error;
                          checkingStatus.value = false;
                        });
                      },
                    );
                  }}
                  disabled={disableStatusCheck}
                >
                  {checkButtonText}
                </button>
                <br />
                <br />
                <i>
                  This will replace settings on this device with settings from
                  another
                </i>
              </li>

              {statusError.value ? (
                <li style="color: red">
                  Failed to check. Update the page and start linking again
                </li>
              ) : null}
            </>
          ) : null}
        </ul>
      </Show>
    </>
  );
}

function SignedOutCreateAccountTab() {
  const creatingStatus = useSignal(false);
  const creatingError = useSignal("");

  return (
    <div>
      <p>Enable sync to share your settings across devices</p>
      <button
        className="primary"
        disabled={creatingStatus}
        onClick={() => {
          batch(() => {
            creatingStatus.value = true;
            creatingError.value = "";
          });

          createAccount()
            .then(async ({ done }) => {
              if (done) {
                await syncEverything();
                await sendAuthCheckMessage();
                return;
              }

              creatingStatus.value = false;
            })
            .catch((error) => {
              batch(() => {
                creatingError.value = error;
                creatingStatus.value = false;
              });
            });
        }}
      >
        Enable sync
      </button>
    </div>
  );
}
