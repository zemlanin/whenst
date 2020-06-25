const url = require("url");
const assert = require("assert");
const { normalizeStatus } = require("./normalize-status.js");

describe("normalize-status", () => {
  describe("normalizeStatus.BEHAVIOR.default", () => {
    it("should pass", async () => {
      const cases = [
        [
          { status_text: ">", status_emoji: "" },
          {
            status_emoji: "",
            status_text: ">",
          },
        ],
        [
          { status_text: ">", status_emoji: "blush" },
          { status_emoji: "blush", status_text: ">" },
        ],
        [
          { status_text: ">", status_emoji: "😊" },
          { status_emoji: "blush", status_text: ">" },
        ],
        [
          { status_text: "😊", status_emoji: "" },
          { status_emoji: "", status_text: ":blush:" },
        ],
        [
          { status_text: ">", status_emoji: ":blush:" },
          { status_emoji: "blush", status_text: ">" },
        ],
        [
          { status_text: "", status_emoji: ":blush:" },
          { status_emoji: "blush", status_text: "" },
        ],
        [
          { status_text: "", status_emoji: "blush" },
          { status_emoji: "blush", status_text: "" },
        ],
        [
          { status_text: ":blush:", status_emoji: "" },
          { status_emoji: "", status_text: ":blush:" },
        ],
        [
          { status_text: "hello world", status_emoji: "" },
          {
            status_emoji: "",
            status_text: "hello world",
          },
        ],
        [
          { status_text: ":banana: :phone:", status_emoji: "" },
          {
            status_emoji: "",
            status_text: ":banana: :phone:",
          },
        ],
      ];

      for (const [body, result] of cases) {
        assert.strictEqual(
          JSON.stringify(normalizeStatus(body)),
          JSON.stringify(result)
        );

        assert.strictEqual(
          JSON.stringify(normalizeStatus(new url.URLSearchParams(body))),
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
          JSON.stringify(normalizeStatus(body)),
          "{}",
          JSON.stringify(body)
        );

        assert.strictEqual(
          JSON.stringify(normalizeStatus(new url.URLSearchParams(body))),
          "{}",
          JSON.stringify(body)
        );
      }
    });
  });

  describe("normalizeStatus.BEHAVIOR.slack", () => {
    it("should pass", async () => {
      const cases = [
        [
          { status_text: ">", status_emoji: "" },
          {
            status_emoji: "speech_balloon",
            status_text: ">",
            default_status_emoji: true,
          },
        ],
        [
          { status_text: ">", status_emoji: "slack" },
          { status_emoji: "slack", status_text: ">" },
        ],
        [
          { status_text: ">", status_emoji: ":slack:" },
          { status_emoji: "slack", status_text: ">" },
        ],
        [
          { status_text: "", status_emoji: ":slack:" },
          { status_emoji: "slack", status_text: "" },
        ],
        [
          { status_text: "😊", status_emoji: "" },
          { status_emoji: "blush", status_text: "" },
        ],
        [
          { status_text: "", status_emoji: "slack" },
          { status_emoji: "slack", status_text: "" },
        ],
        [
          { status_text: ":slack:", status_emoji: "" },
          { status_emoji: "slack", status_text: "" },
        ],
        [
          { status_text: "hello world", status_emoji: "" },
          {
            status_emoji: "speech_balloon",
            status_text: "hello world",
            default_status_emoji: true,
          },
        ],
        [
          { status_text: ":banana: :phone:", status_emoji: "" },
          {
            status_emoji: "speech_balloon",
            status_text: ":banana: :phone:",
            default_status_emoji: true,
          },
        ],
      ];

      for (const [body, result] of cases) {
        assert.strictEqual(
          JSON.stringify(
            normalizeStatus(body, { behavior: normalizeStatus.BEHAVIOR.slack })
          ),
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
          JSON.stringify(normalizeStatus(body), {
            behavior: normalizeStatus.BEHAVIOR.slack,
          }),
          "{}",
          JSON.stringify(body)
        );
      }
    });
  });

  describe("normalizeStatus.BEHAVIOR.github", () => {
    it("should pass", async () => {
      const cases = [
        [
          { status_text: ">", status_emoji: "" },
          {
            status_emoji: "thought_balloon",
            status_text: ">",
            default_status_emoji: true,
          },
        ],
        [
          { status_text: ">", status_emoji: "octocat" },
          { status_emoji: "octocat", status_text: ">" },
        ],
        [
          { status_text: ">", status_emoji: ":octocat:" },
          { status_emoji: "octocat", status_text: ">" },
        ],
        [
          { status_text: "", status_emoji: ":octocat:" },
          { status_emoji: "octocat", status_text: "" },
        ],
        [
          { status_text: "😊", status_emoji: "" },
          {
            status_emoji: "thought_balloon",
            status_text: ":blush:",
            default_status_emoji: true,
          },
        ],
        [
          { status_text: "", status_emoji: "octocat" },
          { status_emoji: "octocat", status_text: "" },
        ],
        [
          { status_text: ":octocat:", status_emoji: "" },
          {
            status_emoji: "thought_balloon",
            status_text: ":octocat:",
            default_status_emoji: true,
          },
        ],
        [
          { status_text: "hello world", status_emoji: "" },
          {
            status_emoji: "thought_balloon",
            status_text: "hello world",
            default_status_emoji: true,
          },
        ],
        [
          { status_text: ":banana: :phone:", status_emoji: "" },
          {
            status_emoji: "thought_balloon",
            status_text: ":banana: :phone:",
            default_status_emoji: true,
          },
        ],
      ];

      for (const [body, result] of cases) {
        assert.strictEqual(
          JSON.stringify(
            normalizeStatus(body, { behavior: normalizeStatus.BEHAVIOR.github })
          ),
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
          JSON.stringify(normalizeStatus(body), {
            behavior: normalizeStatus.BEHAVIOR.github,
          }),
          "{}",
          JSON.stringify(body)
        );
      }
    });
  });
});
