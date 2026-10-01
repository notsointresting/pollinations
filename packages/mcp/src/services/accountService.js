import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

/** Call an /account route with the caller's key and return its JSON as text. */
async function accountRequest(path, context, { params, ...options } = {}) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl(path, params),
        options,
        context,
    );
    return createMCPResponse([createTextContent(data, true)]);
}

const jsonRequest = (method, body) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

async function getBalance(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/balance"),
        {},
        context,
    );
    return createMCPResponse([
        createTextContent(
            {
                pollen: data.balance,
                note: "Pollen balance for the authenticated key. Key-scoped when the key has its own budget, otherwise account-wide.",
            },
            true,
        ),
    ]);
}

async function getUsage({ daily, days, limit, model }, context) {
    if (!daily) {
        return accountRequest("/account/usage", context, {
            params: { days, limit, models: model },
        });
    }
    // The daily endpoint has no model filter, so apply it to the rows here
    // like `polli usage --daily --model` does.
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/usage/daily", { days }),
        {},
        context,
    );
    if (model) {
        const wanted = model.split(",");
        data.usage = data.usage.filter((row) => wanted.includes(row.model));
        data.count = data.usage.length;
    }
    return createMCPResponse([createTextContent(data, true)]);
}

const getEarnings = ({ days }, context) =>
    accountRequest("/account/earnings", context, { params: { days } });

const listQuests = (_params, context) =>
    accountRequest("/account/quests", context);

const listKeys = (_params, context) => accountRequest("/account/keys", context);

async function createKey(params, context) {
    const { name, type, expiresIn, models, budget, permissions } = params;
    const { redirectUri, earnings } = params;
    if ((redirectUri || earnings) && type !== "publishable") {
        throw new Error("redirectUri and earnings require type publishable.");
    }
    return accountRequest(
        "/account/keys",
        context,
        jsonRequest("POST", {
            name,
            type,
            expiresIn,
            allowedModels: models,
            pollenBudget: budget,
            accountPermissions: permissions,
            redirectUris: redirectUri,
            earningsEnabled: earnings,
        }),
    );
}

const revokeKey = ({ id }, context) =>
    accountRequest(`/account/keys/${encodeURIComponent(id)}`, context, {
        method: "DELETE",
    });

const daysSchema = (fallback) =>
    z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe(
            `Rolling window in days, max 90${fallback ? `. Default ${fallback}` : ""}`,
        );

const KEY_PERMISSION_NOTE =
    "Requires an API key with 'account:keys' permission.";

export const accountTools = [
    [
        "getBalance",
        "Get the current Pollen balance for the authenticated API key. " +
            "Returns key-scoped balance if the key has its own budget, otherwise account-wide. " +
            "Requires an API key with 'account:usage' permission.",
        {},
        getBalance,
    ],
    [
        "getUsage",
        "Get request history (default) or a per-day summary (daily=true) with tokens, cost and model. " +
            "Like `polli usage --history` / `--daily`. " +
            "Requires an API key with 'account:usage' permission.",
        {
            daily: z
                .boolean()
                .optional()
                .describe("Return one row per day, model and key"),
            days: daysSchema(),
            limit: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe("Number of history records. Ignored when daily"),
            model: z
                .string()
                .optional()
                .describe(
                    "Filter by model id; comma-separate several. Use listModels for the live list",
                ),
        },
        getUsage,
    ],
    [
        "getEarnings",
        "Get developer earnings from BYOP apps and community models. " +
            "Like `polli earnings`. Requires an API key with 'account:usage' permission.",
        { days: daysSchema(30) },
        getEarnings,
    ],
    [
        "listQuests",
        "List quests with their status and Pollen rewards. Like `polli quests`. " +
            "Requires an API key with 'account:usage' permission.",
        {},
        listQuests,
    ],
    [
        "listKeys",
        `List the account's API keys with permissions, budget and last use. Like \`polli keys list\`. ${KEY_PERMISSION_NOTE}`,
        {},
        listKeys,
    ],
    [
        "createKey",
        "Create an API key. The full key is returned only once in this response. " +
            `Like \`polli keys create\`. ${KEY_PERMISSION_NOTE}`,
        {
            name: z.string().min(1).describe("Key name"),
            type: z
                .enum(["secret", "publishable"])
                .optional()
                .describe("Key type. Default secret"),
            expiresIn: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe("Expiry in seconds, max 365 days"),
            models: z
                .array(z.string())
                .optional()
                .describe("Restrict the key to these model ids"),
            budget: z.number().min(0).optional().describe("Pollen budget cap"),
            permissions: z
                .array(z.string())
                .optional()
                .describe(
                    "Account permissions, for example profile, usage. 'keys' lets the new key create keys",
                ),
            redirectUri: z
                .array(z.string())
                .optional()
                .describe("Allowed BYOP redirect URIs. Publishable keys only"),
            earnings: z
                .boolean()
                .optional()
                .describe("Enable developer earnings. Publishable keys only"),
        },
        createKey,
    ],
    [
        "revokeKey",
        `Revoke an API key by id. Use listKeys to find the id. Like \`polli keys revoke\`. ${KEY_PERMISSION_NOTE}`,
        { id: z.string().min(1).describe("Key id from listKeys") },
        revokeKey,
    ],
];
