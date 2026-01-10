import { render } from "preact";

import "../../keyboard";
import { accountSignal } from "../../api.js";
import { Show } from "@preact/signals/utils";
import { LinkEnterCode } from "../../components/LinkEnterCode/index.js";

const main = document.querySelector("main");
if (main) {
  render(<LinkPage />, main);
}

function LinkPage() {
  return (
    <Show when={accountSignal} fallback={<LinkCreateAccount />}>
      <>
        <h1>Link</h1>
        <p>Enter the code shown on a device you want to sync to</p>
        <LinkEnterCode />
      </>
    </Show>
  );
}

function LinkCreateAccount() {
  return (
    <>
      <h1>Link</h1>

      <p>
        To sync your settings to another device, you need to enable sync here
        first
      </p>
      <p>
        Go to{" "}
        <b>
          <a href="/settings">Settings</a> &rarr; Sync
        </b>{" "}
        and press <b>Enable sync</b> button
      </p>
    </>
  );
}
