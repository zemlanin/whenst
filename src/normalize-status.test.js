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
        [{}, { empty: true, status_emoji: "", status_text: "" }],
        [
          { status_text: "" },
          { empty: true, status_emoji: "", status_text: "" },
        ],
        [
          { status_text: "", status_emoji: "" },
          { empty: true, status_emoji: "", status_text: "" },
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
            warnings: { default_emoji: true },
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
          {
            status_emoji: "blush",
            status_text: "",
            warnings: { text_as_emoji: true },
          },
        ],
        [
          { status_text: "", status_emoji: "slack" },
          { status_emoji: "slack", status_text: "" },
        ],
        [
          { status_text: ":slack:", status_emoji: "" },
          {
            status_emoji: "slack",
            status_text: "",
            warnings: { text_as_emoji: true },
          },
        ],
        [
          { status_text: "hello world", status_emoji: "" },
          {
            status_emoji: "speech_balloon",
            status_text: "hello world",
            warnings: { default_emoji: true },
          },
        ],
        [
          { status_text: ":banana: :phone:", status_emoji: "" },
          {
            status_emoji: "speech_balloon",
            status_text: ":banana: :phone:",
            warnings: { default_emoji: true },
          },
        ],
        [{}, { empty: true, status_emoji: "", status_text: "" }],
        [
          { status_text: "" },
          { empty: true, status_emoji: "", status_text: "" },
        ],
        [
          { status_text: "", status_emoji: "" },
          { empty: true, status_emoji: "", status_text: "" },
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
            warnings: { default_emoji: true },
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
            warnings: { default_emoji: true },
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
            warnings: { default_emoji: true },
          },
        ],
        [
          { status_text: "hello world", status_emoji: "" },
          {
            status_emoji: "thought_balloon",
            status_text: "hello world",
            warnings: { default_emoji: true },
          },
        ],
        [
          { status_text: ":banana: :phone:", status_emoji: "" },
          {
            status_emoji: "thought_balloon",
            status_text: ":banana: :phone:",
            warnings: { default_emoji: true },
          },
        ],
        [{}, { empty: true, status_emoji: "", status_text: "" }],
        [
          { status_text: "" },
          { empty: true, status_emoji: "", status_text: "" },
        ],
        [
          { status_text: "", status_emoji: "" },
          { empty: true, status_emoji: "", status_text: "" },
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
