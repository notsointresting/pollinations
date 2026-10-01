// "Bring your own Pollen": OAuth authorization-code flow with PKCE. The
// access token is a user-approved key, so each user pays for their own calls.

const AUTHORIZE_URL = "https://enter.pollinations.ai/authorize";
const TOKEN_URL = "https://enter.pollinations.ai/api/oauth/token";
const SESSION_KEY = "jev-triage-oauth";

export const base64url = (bytes) =>
	btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");

const randomString = () =>
	base64url(crypto.getRandomValues(new Uint8Array(32)));

export async function challengeFor(verifier) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	);
	return base64url(new Uint8Array(digest));
}

/** Remember the PKCE verifier and CSRF state, and return the consent URL. */
export async function startSignIn({
	clientId,
	redirectUri,
	models,
	budget,
	storage,
}) {
	const verifier = randomString();
	const state = randomString();
	storage.setItem(SESSION_KEY, JSON.stringify({ verifier, state }));
	const params = new URLSearchParams({
		response_type: "code",
		client_id: clientId,
		redirect_uri: redirectUri,
		state,
		code_challenge: await challengeFor(verifier),
		code_challenge_method: "S256",
		models,
		budget: String(budget),
		expiry: "1",
	});
	return `${AUTHORIZE_URL}?${params}`;
}

/**
 * Finish sign-in from the callback query string. Returns the access token, or
 * null when the page was not opened from a callback.
 */
export async function finishSignIn({
	clientId,
	redirectUri,
	search,
	storage,
	fetchImpl = fetch,
}) {
	const query = new URLSearchParams(search);
	const code = query.get("code");
	if (!code && !query.get("error")) return null;

	const saved = JSON.parse(storage.getItem(SESSION_KEY) ?? "null");
	storage.removeItem(SESSION_KEY);
	if (query.get("error")) throw new Error("Sign-in was cancelled.");
	if (!saved || saved.state !== query.get("state")) {
		throw new Error("Sign-in could not be verified. Please try again.");
	}

	const response = await fetchImpl(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			client_id: clientId,
			redirect_uri: redirectUri,
			code_verifier: saved.verifier,
		}),
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok || !body.access_token) {
		throw new Error(body.error_description ?? "Sign-in failed.");
	}
	return body.access_token;
}
