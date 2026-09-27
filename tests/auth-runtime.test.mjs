import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import fs from "node:fs/promises";
import path from "node:path";

test("Workers password lifecycle: temporary login, replacement, revocation and logout", async () => {
  const bundle = await build({
    stdin: { contents: `
      import { env } from "cloudflare:workers";
      import * as auth from "./app/lib/server-password-auth";
      import { authenticateActor } from "./app/lib/server-erp-auth";
      import { POST as login } from "./app/api/erp/auth/login/route";
      import { POST as change } from "./app/api/erp/auth/change-password/route";
      import { POST as logout } from "./app/api/erp/auth/logout/route";
      export default { async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/seed") {
          await auth.ensureAuthSchema(env.DB);
          await env.DB.prepare("CREATE TABLE erp_memberships (email TEXT, active INTEGER)").run();
          const hash = await auth.hashPassword("Temporary-test-123!");
          await env.DB.prepare("INSERT INTO erp_users (id,email,password_hash,must_change_password,active,created_at,created_by_email,updated_at,updated_by_email) VALUES ('test','auth@example.invalid',?,1,1,'2026-01-01','test','2026-01-01','test')").bind(hash).run();
          await env.DB.prepare("INSERT INTO erp_memberships VALUES ('auth@example.invalid',1)").run();
          return Response.json({ok:true});
        }
        if (path === "/login") return login(request);
        if (path === "/change") return change(request);
        if (path === "/logout") return logout(request);
        if (path === "/actor") return Response.json(await authenticateActor(request));
        return Response.json(await auth.getSessionIdentity(request));
      }};
    `, resolveDir: process.cwd(), loader: "ts" },
    tsconfigRaw: {}, bundle: true, write: false, format: "esm", platform: "browser",
    external: ["cloudflare:workers"],
    plugins: [{
      name: "auth-source",
      setup(bundler) {
        bundler.onResolve({ filter: /^\./ }, args => ({
          path: path.resolve(args.importer ? path.dirname(args.importer) : process.cwd(), args.path) + ".ts",
          namespace: "auth-source",
        }));
        bundler.onLoad({ filter: /.*/, namespace: "auth-source" }, async args => ({
          contents: await fs.readFile(args.path, "utf8"), loader: "ts",
        }));
      },
    }],
  });
  const mf = new Miniflare({
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-05-22", compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"],
  });
  const call = (path, body, cookie) => mf.dispatchFetch("https://local.test" + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const credentials = password => ({ identifier: "auth@example.invalid", password });
  const cookieFrom = response => response.headers.get("set-cookie")?.split(";")[0];
  try {
    assert.equal((await call("/seed")).status, 200);
    const first = await call("/login", credentials("Temporary-test-123!"));
    assert.equal(first.status, 200);
    assert.equal((await first.json()).data.mustChangePassword, true);
    const oldCookie = cookieFrom(first);
    assert.ok(oldCookie);
    const changed = await call("/change", { newPassword: "Private-test-456!" }, oldCookie);
    assert.equal(changed.status, 200, await changed.clone().text());
    const newCookie = cookieFrom(changed);
    assert.ok(newCookie);
    assert.notEqual(newCookie, oldCookie);
    assert.equal(await (await call("/identity", null, oldCookie)).json(), null);
    assert.equal((await (await call("/identity", null, newCookie)).json()).mustChangePassword, false);
    assert.equal((await call("/login", credentials("Temporary-test-123!"))).status, 401);
    assert.equal((await call("/login", credentials("Private-test-456!"))).status, 200);
    const signedOut = await call("/logout", {}, newCookie);
    assert.equal(signedOut.status, 200);
    assert.match(signedOut.headers.get("set-cookie"), /jinam_erp_session=signed-out;/);
    assert.equal(await (await call("/identity", null, newCookie)).json(), null);
    const externalHeaders = { "oai-authenticated-user-id": "external-test", "oai-authenticated-user-email": "auth@example.invalid" };
    const external = await mf.dispatchFetch("https://local.test/actor", { headers: externalHeaders });
    assert.equal((await external.json()).source, "chatgpt");
    const optedOut = await mf.dispatchFetch("https://local.test/actor", {
      headers: { ...externalHeaders, cookie: cookieFrom(signedOut) },
    });
    assert.equal(await optedOut.json(), null, "external identity must not silently undo explicit ERP logout");
    const signedInAgain = await call("/login", credentials("Private-test-456!"), cookieFrom(signedOut));
    assert.equal(signedInAgain.status, 200);
    assert.equal((await (await call("/actor", null, cookieFrom(signedInAgain))).json()).source, "erp-session");
  } finally {
    await mf.dispose();
  }
});


