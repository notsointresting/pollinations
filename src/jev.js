// Idea triage: Jev answers bounded questions, this code turns the answers
// into a verdict and a ranking.

export const MODEL = "typesafe/jev-1.13";
export const MAX_IDEAS = 10;

// Score criteria run from lowest to highest rung; Jev returns a position on it.
const SCORE_QUESTIONS = {
	market: {
		instructions: "How big and reachable is the market for this idea?",
		criteria: ["tiny", "small", "medium", "large", "huge"],
	},
	feasibility: {
		instructions:
			"How feasible is it for a small team to ship a first version?",
		criteria: ["very hard", "hard", "moderate", "easy", "trivial"],
	},
	novelty: {
		instructions: "How new is this compared with existing products?",
		criteria: ["copy", "incremental", "fresh", "distinct", "unprecedented"],
	},
};

const CUSTOMERS = {
	consumers: "Everyday people using it for themselves",
	developers: "People who build software",
	businesses: "Companies buying it for their staff or customers",
};

export const SCORE_NAMES = Object.keys(SCORE_QUESTIONS);

export function parseIdeas(text) {
	const lines = text.split("\n").map((line) => line.trim());
	return [...new Set(lines.filter(Boolean))].slice(0, MAX_IDEAS);
}

export function buildRequest(idea) {
	const questions = {};
	for (const [name, { instructions, criteria }] of Object.entries(
		SCORE_QUESTIONS,
	)) {
		questions[name] = { type: "score", instructions, criteria };
	}
	questions.customer = {
		type: "choice",
		instructions: "Who is the primary customer?",
		criteria: CUSTOMERS,
	};
	questions.worthBuilding = {
		type: "noul",
		instructions: "Is this worth building as a weekend prototype?",
	};
	return { model: MODEL, state: idea, questions };
}

export function verdictFor(probability) {
	if (probability >= 0.6) return "build";
	if (probability >= 0.35) return "park";
	return "drop";
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Turn one decision response into the numbers the page shows. */
export function readDecision(idea, response) {
	const { answers } = response;
	const scores = {};
	for (const [name, { criteria }] of Object.entries(SCORE_QUESTIONS)) {
		// A score is a position on the scale; 0 is the lowest rung.
		scores[name] = clamp01(answers[name].score / (criteria.length - 1));
	}
	const composite =
		Object.values(scores).reduce((sum, value) => sum + value, 0) /
		SCORE_NAMES.length;
	const buildProbability = clamp01(answers.worthBuilding.noul);
	return {
		idea,
		scores,
		composite,
		customer: answers.customer.choice,
		buildProbability,
		verdict: verdictFor(buildProbability),
	};
}

/** Best first: likelihood it is worth building, then the overall score. */
export function rank(results) {
	return [...results].sort(
		(a, b) =>
			b.buildProbability - a.buildProbability || b.composite - a.composite,
	);
}
