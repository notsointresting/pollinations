import assert from "node:assert/strict";
import test from "node:test";
import {
	buildRequest,
	MAX_IDEAS,
	parseIdeas,
	rank,
	readDecision,
	verdictFor,
} from "../src/jev.js";

const response = (overrides = {}) => ({
	answers: {
		market: { type: "score", score: 4 },
		feasibility: { type: "score", score: 2 },
		novelty: { type: "score", score: 0 },
		customer: { type: "choice", choice: "developers" },
		worthBuilding: { type: "noul", noul: 0.7 },
		...overrides,
	},
});

test("parseIdeas trims, drops blanks and duplicates, and caps the list", () => {
	assert.deepEqual(parseIdeas("  a \n\nb\na\n"), ["a", "b"]);
	const many = Array.from({ length: 25 }, (_, i) => `idea ${i}`).join("\n");
	assert.equal(parseIdeas(many).length, MAX_IDEAS);
});

test("buildRequest asks bounded questions about the idea", () => {
	const request = buildRequest("a thing");
	assert.equal(request.state, "a thing");
	assert.deepEqual(Object.keys(request.questions), [
		"market",
		"feasibility",
		"novelty",
		"customer",
		"worthBuilding",
	]);
	assert.equal(request.questions.market.type, "score");
	assert.equal(request.questions.market.criteria.length, 5);
	assert.deepEqual(Object.keys(request.questions.customer.criteria), [
		"consumers",
		"developers",
		"businesses",
	]);
	assert.equal(request.questions.worthBuilding.type, "noul");
});

test("readDecision normalises scores and averages them", () => {
	const result = readDecision("a thing", response());
	assert.deepEqual(result.scores, { market: 1, feasibility: 0.5, novelty: 0 });
	assert.equal(result.composite, 0.5);
	assert.equal(result.customer, "developers");
	assert.equal(result.buildProbability, 0.7);
	assert.equal(result.verdict, "build");
});

test("readDecision keeps out-of-range answers within 0 to 1", () => {
	const result = readDecision(
		"x",
		response({
			market: { type: "score", score: 9 },
			novelty: { type: "score", score: -1 },
			worthBuilding: { type: "noul", noul: 1.4 },
		}),
	);
	assert.equal(result.scores.market, 1);
	assert.equal(result.scores.novelty, 0);
	assert.equal(result.buildProbability, 1);
});

test("verdictFor splits at the build and park thresholds", () => {
	assert.equal(verdictFor(0.6), "build");
	assert.equal(verdictFor(0.59), "park");
	assert.equal(verdictFor(0.35), "park");
	assert.equal(verdictFor(0.34), "drop");
});

test("rank orders by build probability, then overall score, without mutating", () => {
	const results = [
		{ idea: "b", buildProbability: 0.5, composite: 0.2 },
		{ idea: "a", buildProbability: 0.9, composite: 0.1 },
		{ idea: "c", buildProbability: 0.5, composite: 0.8 },
	];
	assert.deepEqual(
		rank(results).map((r) => r.idea),
		["a", "c", "b"],
	);
	assert.equal(results[0].idea, "b");
});
