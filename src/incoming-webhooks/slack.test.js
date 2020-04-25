const assert = require("assert");
const crypto = require("crypto");

const supertest = require("supertest");

const FAKE_SIGNING_SECRET = "8f742231b10e8888abcd99yyyzzz85a5";
const EMPTY_BODY = JSON.stringify({ empty: true });

function getSignatureHeaders(body = EMPTY_BODY, timestamp = new Date()) {
  const signatureHmac = crypto.createHmac("sha256", FAKE_SIGNING_SECRET);

  const ts = (+new Date(timestamp) / 1000).toString();

  signatureHmac.update("v0:" + ts + ":" + body);

  return {
    timestamp: ts,
    signature: "v0=" + signatureHmac.digest("hex"),
  };
}

describe("slack", () => {
  let server;

  const config = require("../config.js");
  const ogSlackConfig = config.slack;

  before(() => {
    config.slack = {
      ...ogSlackConfig,
      signing_secret: FAKE_SIGNING_SECRET,
    };
  });

  after(() => {
    config.slack = ogSlackConfig;
  });

  beforeEach(() => {
    server = require("../../index.js").server;
  });

  afterEach(() => {
    server.close();
    // sinon.resetBehavior();
  });

  it("should 400 on empty headers", async () => {
    await supertest(server).post("/incoming-webhooks/slack").expect(400);
  });

  it("should 400 on old timestamp", async () => {
    const { timestamp, signature } = getSignatureHeaders(
      EMPTY_BODY,
      new Date("2012-04-17T18:01:00.000Z")
    );

    await supertest(server)
      .post("/incoming-webhooks/slack")
      .set("X-Slack-Signature", signature)
      .set("X-Slack-Request-Timestamp", timestamp)
      .set("Content-Type", "application/json")
      .send(EMPTY_BODY)
      .expect(400);
  });

  it("should 400 on empty body", async () => {
    const { timestamp, signature } = getSignatureHeaders();

    await supertest(server)
      .post("/incoming-webhooks/slack")
      .set("X-Slack-Signature", signature)
      .set("X-Slack-Request-Timestamp", timestamp)
      .set("Content-Type", "application/json")
      .send("")
      .expect(400);
  });

  it("should 400 on unknown type", async () => {
    const body = JSON.stringify({
      token: "deprecated token param",
      type: "bla_bla_bla",
    });
    const { timestamp, signature } = getSignatureHeaders(body);

    await supertest(server)
      .post("/incoming-webhooks/slack")
      .set("X-Slack-Signature", signature)
      .set("X-Slack-Request-Timestamp", timestamp)
      .set("Content-Type", "application/json")
      .send(body)
      .expect(400);
  });

  it("should repeat a challenge", async () => {
    const challenge = Math.random().toString();
    const body = JSON.stringify({
      token: "deprecated token param",
      challenge: challenge,
      type: "url_verification",
    });
    const { timestamp, signature } = getSignatureHeaders(body);

    await supertest(server)
      .post("/incoming-webhooks/slack")
      .set("X-Slack-Signature", signature)
      .set("X-Slack-Request-Timestamp", timestamp)
      .set("Content-Type", "application/json")
      .send(body)
      .expect(200)
      .then((resp) => {
        assert.strictEqual(resp.body.challenge, challenge);
      });
  });

  it("should respond with nothing", async () => {
    const body = JSON.stringify({
      token: "deprecated token param",
      event: {
        type: "name_of_event",
        event_ts: "1234567890.123456",
        user: "UXXXXXXX1",
      },
      type: "event_callback",
    });
    const { timestamp, signature } = getSignatureHeaders(body);

    await supertest(server)
      .post("/incoming-webhooks/slack")
      .set("X-Slack-Signature", signature)
      .set("X-Slack-Request-Timestamp", timestamp)
      .set("Content-Type", "application/json")
      .send(body)
      .expect(200)
      .then((resp) => {
        assert.strictEqual(JSON.stringify(resp.body), "{}");
      });
  });
});
