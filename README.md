# Jev Triage

List your ideas, one per line. [Jev](https://gen.pollinations.ai/docs) answers
bounded questions about each one, and this page's code turns the answers into a
verdict and a ranking. Users pay with their own Pollen.

**What Jev decides** (one `POST /alpha/decisions` call per idea):

| Question | Type | Answer |
| --- | --- | --- |
| market, feasibility, novelty | `score` | position on a five-rung scale |
| customer | `choice` | consumers, developers or businesses |
| worth a weekend prototype? | `noul` | probability 0 to 1 |

**What the code decides:** the overall score is the mean of the three scores;
the verdict is `build` at 60% or more, `park` at 35% or more, otherwise `drop`;
ideas are ranked by that probability, then by overall score.

## Bring your own Pollen

Sign-in uses the OAuth code flow with PKCE
([guide](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)).
The key the user approves is limited to `typesafe/jev-1.13`, 1 Pollen and one
day. It stays in memory and is never written to storage or the URL.

## Run your own copy

1. Create an App Key at <https://enter.pollinations.ai/keys> and add this page's
   exact URL as a Redirect URI (`http://localhost:8080/` for local use).
2. Put the `pk_` key in `src/config.js` as `CLIENT_ID`.
3. Serve the folder: `python3 -m http.server 8080` and open
   <http://localhost:8080/>. For hosting, enable GitHub Pages on the main
   branch and register the Pages URL as the Redirect URI.

No build step and no dependencies.

## Tests

```bash
npm test
```

Covers the question builder, answer reading, ranking, the PKCE challenge
(against the RFC 7636 vector), the callback state check and code exchange, and
the decision request and its error messages.
