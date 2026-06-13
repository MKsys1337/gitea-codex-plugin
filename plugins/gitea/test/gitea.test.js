import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApiUrl,
  contentRoute,
  decodeGiteaContent,
  getGiteaConfig,
  normalizeApiRoute,
  redactSecrets,
  repoRoute,
  toBase64
} from "../src/gitea.js";

test("builds API URLs from instance roots", () => {
  const config = getGiteaConfig({
    GITEA_BASE_URL: "https://gitea.example.com/"
  });

  const url = buildApiUrl(config, "/repos/search", {
    q: "demo",
    private: true,
    empty: "",
    labels: ["bug", "help wanted"]
  });

  assert.equal(
    url.toString(),
    "https://gitea.example.com/api/v1/repos/search?q=demo&private=true&labels=bug&labels=help+wanted"
  );
});

test("accepts routes with or without /api/v1 prefix", () => {
  assert.equal(normalizeApiRoute("repos/search"), "/repos/search");
  assert.equal(normalizeApiRoute("/api/v1/repos/search"), "/repos/search");
});

test("rejects absolute API routes", () => {
  assert.throws(() => normalizeApiRoute("https://example.com/api/v1/user"), /relative/);
});

test("encodes repository and content routes segment by segment", () => {
  assert.equal(repoRoute("My Org", "repo/name"), "/repos/My%20Org/repo%2Fname");
  assert.equal(
    contentRoute("org", "repo", "docs/a file.md"),
    "/repos/org/repo/contents/docs/a%20file.md"
  );
});

test("encodes and decodes Gitea file content", () => {
  const encoded = toBase64("hello\n");
  assert.equal(encoded, "aGVsbG8K");

  assert.deepEqual(
    decodeGiteaContent({
      encoding: "base64",
      content: encoded
    }),
    {
      encoding: "base64",
      content: encoded,
      decoded_content: "hello\n"
    }
  );
});

test("redacts secret-looking response fields", () => {
  assert.deepEqual(
    redactSecrets({
      token: "abc",
      nested: {
        authorization_header: "Bearer abc",
        ok: true
      }
    }),
    {
      token: "[REDACTED]",
      nested: {
        authorization_header: "[REDACTED]",
        ok: true
      }
    }
  );
});
