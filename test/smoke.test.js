const sinon = require("sinon");
const supertest = require("supertest");

describe("smoke", () => {
  let server;
  const slackApi = require("../src/external/slack.js");
  const config = require("../src/config.js");

  beforeEach(() => {
    sinon.replace(config, "disableHTTPSEnforce", true);
    server = require("../index.js").server;
  });

  afterEach(() => {
    sinon.resetBehavior();
    sinon.restore();
    server.close();
  });

  it("should load landing", async () => {
    await supertest(server).get("/").expect(200);
  });

  it("should load status", async () => {
    await supertest(server)
      .get("/status?status_text=i+hate+emoji&status_emoji=speech_balloon")
      .expect(200);
  });

  it("should fail: csrf", async () => {
    await supertest(server).post("/presets/save").expect(403);
  });

  it("should fail: body", async () => {
    sinon.replace(config, "disableCSRFCheck", true);
    await supertest(server).post("/presets/save").expect(400);
  });

  it("should call slack", async () => {
    sinon.stub(slackApi);
    sinon.replace(config, "disableCSRFCheck", true);

    slackApi.apiPost.returns({
      ok: false,
    });

    const code = Math.random().toString();
    await supertest(server).get(`/auth/slack?code=${code}`).expect(302);
    sinon.assert.calledOnce(slackApi.apiPost);
    sinon.assert.calledWith(slackApi.apiPost, "oauth.access", {
      code,
      redirect_uri: sinon.match((v) => v && v.endsWith("/auth/slack")),
      client_id: sinon.match.any,
      client_secret: sinon.match.any,
    });
  });
});
