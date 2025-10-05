import { useSignal, useComputed, batch, Signal } from "@preact/signals";

import {
  signOut,
  sqrapInit,
  sqrapStatus,
  accountSignal,
  sendAuthCheckMessage,
  createAccount,
  syncEverything,
} from "../api.js";
import { Show } from "@preact/signals/utils";
import { useId } from "preact/hooks";

export function AccountEdit() {
  return (
    <Show when={accountSignal} fallback={<SignedOut />}>
      <SignedIn />
    </Show>
  );
}

function SignedIn() {
  return (
    <button
      onClick={() => {
        signOut().then(async () => {
          await sendAuthCheckMessage();
        });
      }}
    >
      Sign out
    </button>
  );
}

const SIGN_IN_TAB_ID = "settings-signed-out-sign-in";
const CREATE_ACCOUNT_TAB_ID = "settings-signed-out-create-account";

function SignedOut() {
  const activeTab = useSignal<
    typeof SIGN_IN_TAB_ID | typeof CREATE_ACCOUNT_TAB_ID
  >(SIGN_IN_TAB_ID);
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
            tabIndex={signInTabIndex}
            aria-selected={signInActive}
            onClick={() => {
              activeTab.value = SIGN_IN_TAB_ID;
            }}
            aria-controls={id}
          >
            Sign in
          </button>
          <button
            role="tab"
            tabIndex={createAccountTabIndex}
            aria-selected={createAccountActive}
            onClick={() => {
              activeTab.value = CREATE_ACCOUNT_TAB_ID;
            }}
            aria-controls={id}
          >
            Create account
          </button>
        </div>
      </div>

      <div id={id} style="margin-bottom: 1rem">
        <Show when={signInActive}>
          <SignedOutSignInTab />
        </Show>
        <Show when={createAccountActive}>
          <SignedOutCreateAccountTab />
        </Show>
      </div>
    </>
  );
}

function SignedOutSignInTab() {
  const code = useSignal("");

  const receiverStarting = useSignal(false);
  const startError = useSignal(null);
  const disableStart = useComputed(
    () => receiverStarting.value || !!code.value,
  );
  const startButtonText = useComputed(() => (code.value ? "✔" : "Start"));

  const checkingStatus = useSignal(false);
  const statusError = useSignal(null);
  const disableStatusCheck = useComputed(
    () => !!checkingStatus.value || !!statusError.value || !code.value,
  );
  const checkButtonText = useComputed(() =>
    statusError.value ? "⚠" : "Complete",
  );

  return (
    <ul>
      <li style="margin-block: 0.5rem">
        Using another device:{" "}
        <button
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
      </li>

      {startError.value ? (
        <li style="color: red">Failed to start. Try again</li>
      ) : null}

      {code.value ? (
        <>
          <li style="margin-block: 0.5rem">
            On another device:
            <ol>
              <li style="margin-block: 0.5rem">
                Open <b>{location.origin.replace(/^https?:\/\//, "")}/link</b>
              </li>
              <li style="margin-block: 0.5rem">
                Enter <b>{code}</b> in the “Code” field
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
            <i>
              This will replace when.st data on this device with data from
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
  );
}

function SignedOutCreateAccountTab() {
  const creatingStatus = useSignal(false);
  const creatingError = useSignal("");

  return (
    <div>
      Create an anonymous account to enable sync:{" "}
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
        Create
      </button>
    </div>
  );
}
