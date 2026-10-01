import assert from "node:assert/strict";
import test from "node:test";
import { challengeFor, finishSignIn, startSignIn } from "../src/auth.js";
import { decide } from "../src/decide.js";

const memoryStorage = () => {
	const data = new Map();
	return {
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => data.set(key, value),
		removeItem: (key) => data.delete(key),
	};
};

const options = {
	clientId: "pk_test",
	redirectUri: "https://app.example/",
};

test("challengeFor matches the RFC 7636 test vector", async () => {
	assert.equal(
		await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
		"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
	);
});

test("startSignIn builds a PKCE consent URL and remembers the secrets", async () => {
	const storage = memoryStorage();
	const url = new URL(
		await startSignIn({
			...options,
			models: "typesafe/jev-1.13",
			budget: 1,
			storage,
		}),
	);
	const { verifier, state } = JSON.parse(storage.getItem("jev-triage-oauth"));
	assert.equal(
		url.origin + url.pathname,
		"https://enter.pollinations.ai/authorize",
	);
	assert.equal(url.searchParams.get("client_id"), "pk_test");
	assert.equal(url.searchParams.get("state"), state);
	assert.equal(url.searchParams.get("code_challenge_method"), "S256");
	assert.equal(
		url.searchParams.get("code_challenge"),
		await challengeFor(verifier),
	);
	assert.equal(url.searchParams.get("models"), "typesafe/jev-1.13");
	assert.equal(url.searchParams.get("budget"), "1");
});

test("finishSignIn does nothing when the page is not a callback", async () => {
	assert.equal(
		await finishSignIn({ ...options, search: "", storage: memoryStorage() }),
		null,
	);
});

test("finishSignIn rejects a callback with the wrong state", async () => {
	const storage = memoryStorage();
	await startSignIn({ ...options, models: "m", budget: 1, storage });
	await assert.rejects(
		finishSignIn({ ...options, search: "?code=c&state=forged", storage }),
		/could not be verified/,
	);
	assert.equal(storage.getItem("jev-triage-oauth"), null);
});

test("finishSignIn exchanges the code with the saved verifier", async () => {
	const storage = memoryStorage();
	await startSignIn({ ...options, models: "m", budget: 1, storage });
	const { verifier, state } = JSON.parse(storage.getItem("jev-triage-oauth"));
	let request;
	const token = await finishSignIn({
		...options,
		search: `?code=abc&state=${state}`,
		storage,
		fetchImpl: async (url, init) => {
			request = { url, init };
			return Response.json({ access_token: "sk_user" });
		},
	});
	assert.equal(token, "sk_user");
	assert.equal(request.url, "https://enter.pollinations.ai/api/oauth/token");
	assert.equal(request.init.body.get("grant_type"), "authorization_code");
	assert.equal(request.init.body.get("code"), "abc");
	assert.equal(request.init.body.get("code_verifier"), verifier);
});

test("finishSignIn reports a cancelled consent screen", async () => {
	await assert.rejects(
		finishSignIn({
			...options,
			search: "?error=access_denied",
			storage: memoryStorage(),
		}),
		/cancelled/,
	);
});

const okResponse = {
	answers: {
		market: { type: "score", score: 2 },
		feasibility: { type: "score", score: 2 },
		novelty: { type: "score", score: 2 },
		customer: { type: "choice", choice: "consumers" },
		worthBuilding: { type: "noul", noul: 0.5 },
	},
};

test("decide sends the user's token and returns the reading", async () => {
	let request;
	const result = await decide("idea", "sk_user", async (url, init) => {
		request = { url, init };
		return Response.json(okResponse);
	});
	assert.equal(request.url, "https://gen.pollinations.ai/alpha/decisions");
	assert.equal(request.init.headers.Authorization, "Bearer sk_user");
	assert.equal(JSON.parse(request.init.body).state, "idea");
	assert.equal(result.verdict, "park");
});

test("decide explains running out of Pollen and expired sessions", async () => {
	const failing = (status) => async () => new Response("{}", { status });
	await assert.rejects(decide("i", "t", failing(402)), /out of Pollen/);
	await assert.rejects(
		decide("i", "t", failing(401)),
		(error) => error.status === 401 && /Sign in again/.test(error.message),
	);
});
