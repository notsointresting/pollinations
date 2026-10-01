import { buildRequest, readDecision } from "./jev.js";

const DECISIONS_URL = "https://gen.pollinations.ai/alpha/decisions";

export class DecisionError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

const FRIENDLY = {
	401: "Your session expired. Sign in again.",
	402: "You are out of Pollen. Top up at enter.pollinations.ai.",
};

export async function decide(idea, token, fetchImpl = fetch) {
	const response = await fetchImpl(DECISIONS_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(buildRequest(idea)),
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new DecisionError(
			response.status,
			FRIENDLY[response.status] ??
				body.error?.message ??
				`Request failed (${response.status}).`,
		);
	}
	return readDecision(idea, body);
}
