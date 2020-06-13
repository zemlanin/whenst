const url = require("url");
const assert = require("assert");
const { processPresetForm } = require("./common.js");

describe("/presets/slack/common", () => {
  describe("processPresetForm", () => {
    it("should pass", async () => {
      const cases = [
        [
          { status_text: ">", status_emoji: "" },
          { status_emoji: ":speech_balloon:", status_text: ">" },
        ],
        [
          { status_text: ">", status_emoji: "slack" },
          { status_emoji: ":slack:", status_text: ">" },
        ],
        [
          { status_text: ">", status_emoji: ":slack:" },
          { status_emoji: ":slack:", status_text: ">" },
        ],
        [
          { status_text: "", status_emoji: ":slack:" },
          { status_emoji: ":slack:", status_text: "" },
        ],
        [
          { status_text: "", status_emoji: "slack" },
          { status_emoji: ":slack:", status_text: "" },
        ],
        [
          { status_text: ":slack:", status_emoji: "" },
          { status_emoji: ":slack:", status_text: "" },
        ],
        [
          { status_text: "hello world", status_emoji: "" },
          { status_emoji: ":speech_balloon:", status_text: "hello world" },
        ],
        [
          { status_text: ":banana: :phone:", status_emoji: "" },
          {
            status_emoji: ":speech_balloon:",
            status_text: ":banana: :phone:",
          },
        ],
      ];

      for (const [body, result] of cases) {
        assert.strictEqual(
          JSON.stringify(processPresetForm(new url.URLSearchParams(body))),
          JSON.stringify(result)
        );
      }
    });

    it("should fail", async () => {
      const cases = [
        {},
        { status_text: "" },
        { status_text: "", status_emoji: "" },
        { status_text: "", status_emoji: ":banana: :phone:" },
        { status_text: "", status_emoji: "::" },
      ];

      for (const body of cases) {
        assert.strictEqual(
          JSON.stringify(processPresetForm(new url.URLSearchParams(body))),
          "{}",
          JSON.stringify(body)
        );
      }
    });
  });
});
