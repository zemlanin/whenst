const sinon = require("sinon");
const supertest = require("supertest");

describe("smoke", () => {
  let server;
  const slackApi = require("../src/external/slack.js");

  before(() => {
    sinon.stub(slackApi);
  });

  after(() => {
    sinon.restore();
  });

  beforeEach(() => {
    server = require("../index.js").server;
  });

  afterEach(() => {
    server.close();
    sinon.resetBehavior();
  });

  it("should load", async () => {
    await supertest(server).get("/").expect(200);
  });

  it("should fail: csrf", async () => {
    await supertest(server).post("/presets/slack/U010GLS73TJ/use").expect(403);
  });

  it("should call slack", async () => {
    slackApi.apiPost.returns({
      ok: false,
    });

    const code = Math.random().toString();
    await supertest(server).get(`/auth/slack?code=${code}`).expect(302);
    sinon.assert.calledOnce(slackApi.apiPost);
    sinon.assert.calledWith(slackApi.apiPost, "oauth.access", {
      code,
      redirect_uri: sinon.match.any,
      client_id: sinon.match.any,
      client_secret: sinon.match.any,
    });
  });
});
