const assert = require("assert");
const { getOauthState, parseOauthState } = require("./oauth-state.js");

describe("oauth-state", () => {
  it("should parse the same url as it was encoded", () => {
    const sessionId = "15cf5827-92b9-49da-8a30-0dcf43fa3827";

    assert.strictEqual(
      "/",
      parseOauthState(sessionId, getOauthState(sessionId, "/"))
    );
    assert.strictEqual(
      "/accounts/slack/Uxxx",
      parseOauthState(
        sessionId,
        getOauthState(sessionId, "/accounts/slack/Uxxx")
      )
    );
    assert.strictEqual(
      "/presets?page=1",
      parseOauthState(sessionId, getOauthState(sessionId, "/presets?page=1"))
    );
  });

  it("should parse `nextURL === /` if `nextURL` is empty or invalid", () => {
    const sessionId = "d5f08aed-0696-4638-ab59-4fa61db3eaa8";
    assert.strictEqual(
      "/",
      parseOauthState(sessionId, getOauthState(sessionId))
    );
    assert.strictEqual(
      "/",
      parseOauthState(sessionId, getOauthState(sessionId, ""))
    );
    assert.strictEqual(
      "/",
      parseOauthState(sessionId, getOauthState(sessionId, "about:blank"))
    );
    assert.strictEqual(
      "/",
      parseOauthState(
        sessionId,
        getOauthState(sessionId, "https://example.com")
      )
    );
    assert.strictEqual(
      "/",
      parseOauthState(sessionId, getOauthState(sessionId, "//example.com"))
    );
    assert.strictEqual(
      "/",
      parseOauthState(sessionId, getOauthState(sessionId, "/unknown-url"))
    );
    assert.strictEqual(
      "/",
      parseOauthState(sessionId, getOauthState(sessionId, "/../"))
    );
    assert.strictEqual(
      "/",
      parseOauthState(sessionId, getOauthState(sessionId, "/presets/../"))
    );
    assert.strictEqual(
      "/",
      parseOauthState(
        sessionId,
        getOauthState(sessionId, "javascript:alert(1)")
      )
    );
  });

  describe("getOauthState", () => {
    it("should throw on empty session", () => {
      assert.throws(() => getOauthState());
      assert.throws(() => getOauthState(""));
      assert.throws(() => getOauthState(null));
    });
  });

  describe("parseOauthState", () => {
    it("should throw on empty session", () => {
      assert.throws(() => parseOauthState());
      assert.throws(() => parseOauthState(""));
      assert.throws(() => parseOauthState(null));
    });

    it("should throw on empty state", () => {
      const sessionId = "d5f08aed-0696-4638-ab59-4fa61db3eaa8";

      assert.throws(() => parseOauthState(sessionId));
      assert.throws(() => parseOauthState(sessionId, ""));
      assert.throws(() => parseOauthState(sessionId, null));
    });

    it("should throw on invalid state", () => {
      const sessionId = "42689347-6933-4e84-afa4-2bc92021b238";

      assert.throws(() => parseOauthState(sessionId, "https://example.com"));
      assert.throws(() =>
        parseOauthState(sessionId, "3e8a833d73024f4ea59ad61a606b9609")
      );
      assert.throws(() =>
        parseOauthState(sessionId, getOauthState(sessionId, "/") + "1")
      );
    });

    it("should throw on invalid session", () => {
      const sessionId = "42689347-6933-4e84-afa4-2bc92021b238";
      const state = getOauthState(sessionId, "/");

      assert.strictEqual("/", parseOauthState(sessionId, state));
      assert.throws(() => parseOauthState(sessionId + "1", state));
      assert.throws(() =>
        parseOauthState("f34d115e-6990-44bd-9981-85d272902c53", state)
      );
    });
  });
});
