import { finishSignIn, startSignIn } from "./auth.js";
import { BUDGET_POLLEN, CLIENT_ID } from "./config.js";
import { decide } from "./decide.js";
import { MAX_IDEAS, MODEL, parseIdeas, rank } from "./jev.js";

const $ = (id) => document.getElementById(id);
const redirectUri = `${location.origin}${location.pathname}`;
let token = null;

const show = (id, visible) => {
	$(id).hidden = !visible;
};

function setStatus(message, isError = false) {
	$("status").textContent = message;
	$("status").dataset.error = String(isError);
}

const percent = (value) => `${Math.round(value * 100)}%`;

function renderResults(results) {
	const body = $("results");
	body.replaceChildren(
		...rank(results).map((result) => {
			const row = document.createElement("tr");
			const cells = [
				result.idea,
				result.verdict,
				percent(result.buildProbability),
				percent(result.composite),
				result.customer,
			];
			for (const text of cells) {
				const cell = document.createElement("td");
				cell.textContent = text;
				row.append(cell);
			}
			row.dataset.verdict = result.verdict;
			return row;
		}),
	);
	show("output", results.length > 0);
}

async function triage() {
	const ideas = parseIdeas($("ideas").value);
	if (ideas.length === 0) return setStatus("Add at least one idea.", true);

	$("run").disabled = true;
	const results = [];
	try {
		for (const [index, idea] of ideas.entries()) {
			setStatus(`Asking Jev about idea ${index + 1} of ${ideas.length}…`);
			results.push(await decide(idea, token));
			renderResults(results);
		}
		setStatus("Done.");
	} catch (error) {
		setStatus(error.message, true);
		if (error.status === 401) signedIn(null);
	} finally {
		$("run").disabled = false;
	}
}

function signedIn(newToken) {
	token = newToken;
	show("signin", token === null);
	show("app", token !== null);
}

async function init() {
	$("limit").textContent = String(MAX_IDEAS);
	$("model").textContent = MODEL;
	$("budget").textContent = String(BUDGET_POLLEN);
	$("signin-button").addEventListener("click", async () => {
		location.href = await startSignIn({
			clientId: CLIENT_ID,
			redirectUri,
			models: MODEL,
			budget: BUDGET_POLLEN,
			storage: sessionStorage,
		});
	});
	$("run").addEventListener("click", triage);

	try {
		const callbackToken = await finishSignIn({
			clientId: CLIENT_ID,
			redirectUri,
			search: location.search,
			storage: sessionStorage,
		});
		// Drop the one-time code from the address bar.
		history.replaceState(null, "", location.pathname);
		signedIn(callbackToken);
	} catch (error) {
		history.replaceState(null, "", location.pathname);
		signedIn(null);
		setStatus(error.message, true);
	}
	if (CLIENT_ID.includes("REPLACE")) {
		setStatus("Set CLIENT_ID in src/config.js before signing in.", true);
	}
}

init();
