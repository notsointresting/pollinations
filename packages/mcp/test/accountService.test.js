import assert from "node:assert/strict";
import test from "node:test";
import { accountTools } from "../src/services/accountService.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };
const tool = (name) => accountTools.find(([n]) => n === name)[3];

/** Stub fetch, run `fn`, and return the single request it made. */
async function request(t, response, fn) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: new URL(String(url)), init });
        return response instanceof Response
            ? response
            : Response.json(response);
    };
    const result = await fn();
    assert.equal(calls.length, 1);
    return { ...calls[0], result };
}

const text = (result) => JSON.parse(result.content[0].text);

test("getUsage requests request history with filters", async (t) => {
    const body = { usage: [{ model: "openai" }], count: 1 };
    const { url, init, result } = await request(t, body, () =>
        tool("getUsage")({ days: 7, limit: 5, model: "openai,flux" }, CONTEXT),
    );
    assert.equal(url.pathname, "/account/usage");
    assert.equal(url.searchParams.get("days"), "7");
    assert.equal(url.searchParams.get("limit"), "5");
    assert.equal(url.searchParams.get("models"), "openai,flux");
    assert.equal(init.headers.Authorization, "Bearer sk_test");
    assert.deepEqual(text(result), body);
});

test("getUsage daily filters rows by model client-side", async (t) => {
    const body = {
        usage: [{ model: "openai" }, { model: "flux" }],
        count: 2,
    };
    const { url, result } = await request(t, body, () =>
        tool("getUsage")({ daily: true, days: 3, model: "flux" }, CONTEXT),
    );
    assert.equal(url.pathname, "/account/usage/daily");
    assert.equal(url.searchParams.get("days"), "3");
    assert.equal(url.searchParams.has("models"), false);
    assert.deepEqual(text(result), { usage: [{ model: "flux" }], count: 1 });
});

test("getEarnings passes the window", async (t) => {
    const { url } = await request(t, { daily: [], perEntity: [] }, () =>
        tool("getEarnings")({ days: 30 }, CONTEXT),
    );
    assert.equal(url.pathname, "/account/earnings");
    assert.equal(url.searchParams.get("days"), "30");
});

test("listQuests and listKeys read their routes", async (t) => {
    const quests = await request(t, { quests: [] }, () =>
        tool("listQuests")({}, CONTEXT),
    );
    assert.equal(quests.url.pathname, "/account/quests");
    const keys = await request(t, { data: [] }, () =>
        tool("listKeys")({}, CONTEXT),
    );
    assert.equal(keys.url.pathname, "/account/keys");
});

test("createKey posts the CLI's request body", async (t) => {
    const { url, init, result } = await request(
        t,
        { id: "k1", key: "sk_new" },
        () =>
            tool("createKey")(
                {
                    name: "bot",
                    type: "secret",
                    models: ["openai"],
                    budget: 5,
                    permissions: ["usage"],
                },
                CONTEXT,
            ),
    );
    assert.equal(url.pathname, "/account/keys");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(init.body), {
        name: "bot",
        type: "secret",
        allowedModels: ["openai"],
        pollenBudget: 5,
        accountPermissions: ["usage"],
    });
    assert.equal(text(result).key, "sk_new");
});

test("createKey rejects publishable-only options on secret keys", async () => {
    await assert.rejects(
        tool("createKey")({ name: "bot", earnings: true }, CONTEXT),
        /require type publishable/,
    );
});

test("revokeKey deletes the key by id", async (t) => {
    const { url, init } = await request(t, { success: true }, () =>
        tool("revokeKey")({ id: "abc/../def" }, CONTEXT),
    );
    assert.equal(url.pathname, "/account/keys/abc%2F..%2Fdef");
    assert.equal(init.method, "DELETE");
});

test("returns the API's permission error message", async (t) => {
    const forbidden = new Response(
        JSON.stringify({
            error: { message: "API key lacks account:keys permission" },
        }),
        { status: 403 },
    );
    await request(t, forbidden, () =>
        assert.rejects(
            tool("listKeys")({}, CONTEXT),
            /API key lacks account:keys permission/,
        ),
    );
});

test("tools require an API key before calling the API", async () => {
    for (const [name, , , handler] of accountTools) {
        const args = name === "createKey" ? { name: "bot" } : { id: "k1" };
        await assert.rejects(handler(args, {}), /API key required/, name);
    }
});
