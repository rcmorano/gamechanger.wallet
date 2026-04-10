#!/usr/bin/env node
/**
 * GameChanger Wallet MCP Server
 *
 * Exposes GameChanger Wallet capabilities as MCP tools so that AI agents can:
 *  - Generate GCScript dapp connections (JSON)
 *  - Encode GCScript into wallet-ready URLs
 *  - Decode wallet response URLs
 *  - Query documentation and example patterns
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const GC_API_BASE = "https://wallet.gamechanger.finance/api/2/run/";
/**
 * Encode a GCScript object into a base64url wallet URL (no compression).
 * This matches the "0-" (base64url, no gzip) encoding supported by GCW v2.
 */
function encodeGcScriptUrl(gcScript, network) {
    const json = JSON.stringify(gcScript);
    // Node-native base64url (no external deps needed)
    const encoded = Buffer.from(json, "utf8").toString("base64url");
    const payload = `0-${encoded}`;
    return `${GC_API_BASE}${payload}?networkTag=${network}`;
}
/**
 * Decode a packed wallet result string (base64url or gzip) back to a JSON
 * string. Handles both "0-" (base64url) and "1-" (gzip) prefixes.
 */
async function decodeGcResult(packed) {
    if (packed.startsWith("0-")) {
        const b64 = packed.slice(2);
        const json = Buffer.from(b64, "base64url").toString("utf8");
        return JSON.parse(json);
    }
    if (packed.startsWith("1-")) {
        const b64 = packed.slice(2);
        const compressed = Buffer.from(b64, "base64url");
        // Use Node built-in zlib
        const { gunzip } = await import("node:zlib");
        const { promisify } = await import("node:util");
        const gunzipAsync = promisify(gunzip);
        const decompressed = await gunzipAsync(compressed);
        return JSON.parse(decompressed.toString("utf8"));
    }
    throw new Error("Unsupported encoding prefix. Expected '0-' (base64url) or '1-' (gzip).");
}
// ---------------------------------------------------------------------------
// GCScript template builders
// ---------------------------------------------------------------------------
function buildSendAdaScript(params) {
    const script = {
        type: "script",
        title: params.title ?? "Send ADA",
        description: "Send ADA to an address on Cardano.",
        exportAs: "sendAdaResult",
        return: { mode: "last" },
        run: {
            build: {
                type: "buildTx",
                tx: {
                    outputs: [
                        {
                            address: params.toAddress,
                            assets: [
                                {
                                    policyId: "ada",
                                    assetName: "ada",
                                    quantity: params.lovelace,
                                },
                            ],
                        },
                    ],
                },
            },
            sign: {
                type: "signTxs",
                detailedPermissions: false,
                txs: ["{get('cache.build.txHex')}"],
            },
            submit: {
                type: "submitTxs",
                txs: "{get('cache.sign')}",
            },
            txHash: {
                type: "macro",
                run: "{get('cache.build.txHash')}",
            },
        },
    };
    if (params.returnUrl) {
        script["returnURLPattern"] = params.returnUrl;
    }
    return script;
}
function buildGetWalletInfoScript() {
    return {
        type: "script",
        title: "Get Wallet Info",
        description: "Retrieve wallet name, current address, and network info.",
        exportAs: "walletInfo",
        run: {
            name: { type: "getName" },
            address: { type: "getCurrentAddress" },
            network: { type: "getNetworkInfo" },
        },
    };
}
function buildMintTokenScript(params) {
    const mintScript = {
        type: "script",
        title: `Mint ${params.quantity} ${params.assetName}`,
        description: "Mint native tokens using the user's spending key as minting policy.",
        exportAs: "mintResult",
        return: { mode: "last" },
        run: {
            dependencies: {
                type: "script",
                run: {
                    issuer: { type: "getSpendingPublicKey" },
                    mintingPolicy: {
                        type: "nativeScript",
                        script: {
                            pubKeyHashHex: "{get('cache.dependencies.issuer.pubKeyHashHex')}",
                        },
                    },
                },
            },
            build: {
                type: "buildTx",
                tx: {
                    mints: [
                        {
                            vkey: "{get('cache.dependencies.issuer.pubKeyHashHex')}",
                            script: "{get('cache.dependencies.mintingPolicy.scriptHashHex')}",
                            assets: [
                                {
                                    assetName: params.assetName,
                                    quantity: params.quantity,
                                },
                            ],
                        },
                    ],
                    outputs: [
                        {
                            address: params.toAddress ?? "{get('cache.dependencies.issuer.address')}",
                            assets: [
                                {
                                    policyId: "{get('cache.dependencies.mintingPolicy.scriptHashHex')}",
                                    assetName: params.assetName,
                                    quantity: params.quantity,
                                },
                            ],
                        },
                    ],
                    ...(params.metadata
                        ? {
                            auxiliaryData: params.metadata,
                        }
                        : {}),
                },
            },
            sign: {
                type: "signTxs",
                detailedPermissions: false,
                txs: ["{get('cache.build.txHex')}"],
            },
            submit: {
                type: "submitTxs",
                txs: "{get('cache.sign')}",
            },
            txHash: {
                type: "macro",
                run: "{get('cache.build.txHash')}",
            },
        },
    };
    return mintScript;
}
function buildMultiSendScript(outputs) {
    return {
        type: "script",
        title: "Multi-recipient ADA payment",
        description: "Send ADA to multiple addresses in a single transaction.",
        exportAs: "multiSendResult",
        return: { mode: "last" },
        run: {
            build: {
                type: "buildTx",
                tx: {
                    outputs: outputs.map((o) => ({
                        address: o.address,
                        assets: [
                            { policyId: "ada", assetName: "ada", quantity: o.lovelace },
                        ],
                    })),
                },
            },
            sign: {
                type: "signTxs",
                detailedPermissions: false,
                txs: ["{get('cache.build.txHex')}"],
            },
            submit: {
                type: "submitTxs",
                txs: "{get('cache.sign')}",
            },
            txHash: {
                type: "macro",
                run: "{get('cache.build.txHash')}",
            },
        },
    };
}
function buildStakeDelegationScript(poolId) {
    return {
        type: "script",
        title: "Delegate Stake",
        description: `Delegate staking key to pool ${poolId}.`,
        exportAs: "delegationResult",
        return: { mode: "last" },
        run: {
            build: {
                type: "buildTx",
                tx: {
                    certificates: [
                        {
                            type: "stakeKeyRegistration",
                        },
                        {
                            type: "stakeDelegation",
                            poolId,
                        },
                    ],
                },
            },
            sign: {
                type: "signTxs",
                detailedPermissions: false,
                txs: ["{get('cache.build.txHex')}"],
            },
            submit: {
                type: "submitTxs",
                txs: "{get('cache.sign')}",
            },
            txHash: {
                type: "macro",
                run: "{get('cache.build.txHash')}",
            },
        },
    };
}
// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------
const server = new McpServer({
    name: "gamechanger-wallet",
    version: "1.0.0",
});
// ---------------------------------------------------------------------------
// Tool: encode_gcscript_url
// ---------------------------------------------------------------------------
server.tool("encode_gcscript_url", "Encode any GCScript JSON object into a GameChanger Wallet URL that can be opened by a user to execute the script.", {
    gcscript: z
        .string()
        .describe("GCScript as a JSON string (the script to encode into the URL)."),
    network: z
        .enum(["mainnet", "preprod"])
        .default("mainnet")
        .describe("Target Cardano network. Defaults to 'mainnet'."),
}, async ({ gcscript, network }) => {
    let parsed;
    try {
        parsed = JSON.parse(gcscript);
    }
    catch {
        return {
            isError: true,
            content: [{ type: "text", text: "Invalid JSON provided for gcscript." }],
        };
    }
    const url = encodeGcScriptUrl(parsed, network);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ url, network }, null, 2),
            },
        ],
    };
});
// ---------------------------------------------------------------------------
// Tool: decode_wallet_response
// ---------------------------------------------------------------------------
server.tool("decode_wallet_response", "Decode a packed wallet response string (from a returnURL ?result= parameter) back to readable JSON.", {
    packed: z
        .string()
        .describe("The packed result value from the wallet response URL (e.g., the value of the 'result' query parameter)."),
}, async ({ packed }) => {
    try {
        const decoded = await decodeGcResult(packed);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(decoded, null, 2),
                },
            ],
        };
    }
    catch (err) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: `Decoding failed: ${err instanceof Error ? err.message : String(err)}`,
                },
            ],
        };
    }
});
// ---------------------------------------------------------------------------
// Tool: generate_send_ada
// ---------------------------------------------------------------------------
server.tool("generate_send_ada", "Generate a GCScript that sends ADA from the user's wallet to a recipient address, and return the corresponding wallet URL.", {
    toAddress: z.string().describe("Recipient Cardano address (bech32)."),
    lovelace: z
        .string()
        .describe("Amount to send in lovelace as a string (1 ADA = 1000000 lovelace)."),
    network: z
        .enum(["mainnet", "preprod"])
        .default("mainnet")
        .describe("Target Cardano network."),
    title: z
        .string()
        .optional()
        .describe("Optional human-readable title shown in the wallet UI."),
    returnUrl: z
        .string()
        .optional()
        .describe("Optional return URL pattern, e.g. 'https://myapp.example/callback?result={result}'. The wallet will redirect here after execution."),
}, async ({ toAddress, lovelace, network, title, returnUrl }) => {
    const script = buildSendAdaScript({ toAddress, lovelace, title, returnUrl });
    const url = encodeGcScriptUrl(script, network);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ gcscript: script, url, network }, null, 2),
            },
        ],
    };
});
// ---------------------------------------------------------------------------
// Tool: generate_multi_send
// ---------------------------------------------------------------------------
server.tool("generate_multi_send", "Generate a GCScript that sends ADA to multiple recipients in a single Cardano transaction.", {
    outputs: z
        .array(z.object({
        address: z.string().describe("Recipient Cardano address (bech32)."),
        lovelace: z
            .string()
            .describe("Amount in lovelace as a string (1 ADA = 1000000 lovelace)."),
    }))
        .min(1)
        .describe("List of recipients with their addresses and amounts."),
    network: z
        .enum(["mainnet", "preprod"])
        .default("mainnet")
        .describe("Target Cardano network."),
}, async ({ outputs, network }) => {
    const script = buildMultiSendScript(outputs);
    const url = encodeGcScriptUrl(script, network);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ gcscript: script, url, network }, null, 2),
            },
        ],
    };
});
// ---------------------------------------------------------------------------
// Tool: generate_get_wallet_info
// ---------------------------------------------------------------------------
server.tool("generate_get_wallet_info", "Generate a GCScript that retrieves the user's wallet name, current address, and network info.", {
    network: z
        .enum(["mainnet", "preprod"])
        .default("mainnet")
        .describe("Target Cardano network."),
    returnUrl: z
        .string()
        .optional()
        .describe("Optional return URL pattern with {result} placeholder."),
}, async ({ network, returnUrl }) => {
    let script = buildGetWalletInfoScript();
    if (returnUrl) {
        script = { ...script, returnURLPattern: returnUrl };
    }
    const url = encodeGcScriptUrl(script, network);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ gcscript: script, url, network }, null, 2),
            },
        ],
    };
});
// ---------------------------------------------------------------------------
// Tool: generate_mint_token
// ---------------------------------------------------------------------------
server.tool("generate_mint_token", "Generate a GCScript that mints native tokens using the user's spending key as the minting policy.", {
    assetName: z
        .string()
        .describe("The asset name (token name) to mint."),
    quantity: z
        .string()
        .describe("Number of tokens to mint as a string (e.g., '1000')."),
    network: z
        .enum(["mainnet", "preprod"])
        .default("mainnet")
        .describe("Target Cardano network."),
    toAddress: z
        .string()
        .optional()
        .describe("Address to send minted tokens to. Defaults to the user's own spending address."),
    nftMetadata: z
        .record(z.unknown())
        .optional()
        .describe("Optional CIP-25 NFT metadata object to attach to the transaction under key '721'."),
}, async ({ assetName, quantity, network, toAddress, nftMetadata }) => {
    const metadata = nftMetadata
        ? { "721": { "<policyId>": { [assetName]: nftMetadata } } }
        : undefined;
    const script = buildMintTokenScript({
        assetName,
        quantity,
        toAddress,
        metadata,
    });
    const url = encodeGcScriptUrl(script, network);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ gcscript: script, url, network }, null, 2),
            },
        ],
    };
});
// ---------------------------------------------------------------------------
// Tool: generate_stake_delegation
// ---------------------------------------------------------------------------
server.tool("generate_stake_delegation", "Generate a GCScript that delegates the user's staking key to a Cardano stake pool.", {
    poolId: z
        .string()
        .describe("Stake pool ID in bech32 (pool1...) or hex format."),
    network: z
        .enum(["mainnet", "preprod"])
        .default("mainnet")
        .describe("Target Cardano network."),
}, async ({ poolId, network }) => {
    const script = buildStakeDelegationScript(poolId);
    const url = encodeGcScriptUrl(script, network);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ gcscript: script, url, network }, null, 2),
            },
        ],
    };
});
// ---------------------------------------------------------------------------
// Tool: get_documentation
// ---------------------------------------------------------------------------
server.tool("get_documentation", "Return documentation, code examples, or reference information about a specific GameChanger Wallet topic.", {
    topic: z
        .enum([
        "overview",
        "gcscript",
        "isl",
        "url-patterns",
        "transactions",
        "payments",
        "minting",
        "multisig",
        "workspaces",
        "examples",
        "skills",
    ])
        .describe("Topic to retrieve documentation for."),
}, async ({ topic }) => {
    const docs = {
        overview: `# GameChanger Wallet Overview

GameChanger Wallet is a non-custodial Cardano "meta wallet" that supports all major wallet types
via a JSON-based scripting language (GCScript) delivered through URLs and QR codes.

- Production URL: https://wallet.gamechanger.finance/
- API Reference: https://wallet.gamechanger.finance/doc/api/v2
- Playground IDE: https://wallet.gamechanger.finance/playground
- NPM Library: https://www.npmjs.com/package/@gamechanger-finance/gc

Supported networks: Cardano Mainnet, Pre-Production Testnet.
Supported wallet types: seed phrases, Ledger, Trezor, Nami, Eternl, Flint, Vespr, CIP-30 extensions, multisig/shared treasury, QR/gift/burner wallets.`,
        gcscript: `# GCScript DSL

GCScript is a non-Turing-complete JSON-based domain-specific language interpreted by the GameChanger Wallet.

## Basic structure
Every construct is a JSON object with a "type" property naming the function.
The top-level (and all container) function is "script". Its "run" property holds a map of child calls.

\`\`\`json
{
  "type": "script",
  "title": "My Dapp",
  "exportAs": "results",
  "run": {
    "name":    { "type": "getName" },
    "address": { "type": "getCurrentAddress" }
  }
}
\`\`\`

## Cache and exports
- Each "script" block has a local "cache" storing child results.
- Only results exported with "exportAs" reach the global "exports" object returned to dapps.

## Key functions
- data           — constant value
- macro          — ISL expression evaluator
- buildTx        — build a Cardano transaction
- signTxs        — sign transaction(s)
- submitTxs      — submit to Cardano node
- getName        — wallet name
- getCurrentAddress — current address
- getSpendingPublicKey — spending public key
- getNetworkInfo — DLT and network info
- nativeScript   — build a native script

API docs: https://wallet.gamechanger.finance/doc/api/v2`,
        isl: `# Inline Scripting Language (ISL)

ISL is a non-Turing-complete JavaScript subset embedded inside GCScript string arguments.
Any string starting with { and ending with } is treated as ISL.

## Reading cache values
"{get('cache.build.txHex')}"

## Common functions
- get(path)           — read from cache (e.g. 'cache.build.txHex')
- sha512(val)         — SHA-512 hash
- sha256(val)         — SHA-256 hash
- join(sep, ...parts) — string concatenation
- uuid()              — generate UUID
- return(val)         — explicit return
- fail(msg)           — error halt

## The macro function
Use "type":"macro" to run ISL and produce a GCScript result:
\`\`\`json
{
  "type": "macro",
  "run": "{join('-', get('cache.networkInfo.dltTag'), get('cache.networkInfo.networkTag'))}"
}
\`\`\``,
        "url-patterns": `# URL Patterns

Base: https://wallet.gamechanger.finance/api/2/run/<payload>?networkTag=<network>

## Encodings
- 0-<base64url>   : no compression (fallback)
- 1-<base64url>   : gzip compression (recommended)

## Query parameters
- networkTag=mainnet|preprod   : target network
- dltTag=cardano               : target DLT
- ref=<address>                : optional referrer

## Return URLs
Add returnURLPattern to script:
\`\`\`json
{ "returnURLPattern": "https://my-dapp.example/cb?result={result}" }
\`\`\`
The wallet replaces {result} with the encoded JSON results and redirects.

## Generation
Using NPM lib: gc.encode.url({ input: JSON.stringify(script), network: 'mainnet' })
Using CLI:     gamechanger-cli mainnet encode url -v 2 -f script.gcscript`,
        transactions: `# Cardano Transactions in GCScript

All transactions follow build → sign → submit:

\`\`\`json
{
  "build":  { "type": "buildTx",   "tx": { ... } },
  "sign":   { "type": "signTxs",   "detailedPermissions": false, "txs": ["{get('cache.build.txHex')}"] },
  "submit": { "type": "submitTxs", "txs": "{get('cache.sign')}" }
}
\`\`\`

buildTx.tx supports: outputs, mints, certificates, withdrawals, auxiliaryData, collateral, inputs.
ADA amounts are always in lovelace expressed as strings (1 ADA = "1000000").
Multisig: add options.autoProvision.workspaceNativeScript and options.autoOptionalSigners.nativeScript.`,
        payments: `# Payments

An output defines who to pay, how much and what:
\`\`\`json
{
  "address": "addr1q...",
  "assets": [{ "policyId": "ada", "assetName": "ada", "quantity": "2000000" }]
}
\`\`\`

- policyId + assetName = "ada" for ADA/tADA.
- For native tokens set real policyId and assetName values.
- quantity is always a BigNum string.
- Multiple outputs in one tx are supported.`,
        minting: `# Minting Tokens and NFTs

Native assets require a minting policy (native script or Plutus script).
Self-sovereign minting with user's own key:

\`\`\`json
{
  "dependencies": {
    "type": "script",
    "run": {
      "issuer":        { "type": "getSpendingPublicKey" },
      "mintingPolicy": { "type": "nativeScript", "script": { "pubKeyHashHex": "{get('cache.dependencies.issuer.pubKeyHashHex')}" } }
    }
  },
  "build": {
    "type": "buildTx",
    "tx": {
      "mints": [{ "vkey": "...", "script": "...", "assets": [{"assetName":"Token","quantity":"1000"}] }]
    }
  }
}
\`\`\`

NFT metadata follows CIP-25: auxiliaryData.721.<policyId>.<assetName>.`,
        multisig: `# Multi-Signatures

Native scripts support M-of-N signers:
\`\`\`json
{ "type": "atLeast", "required": 2, "scripts": [
  { "pubKeyHashHex": "<key1>" },
  { "pubKeyHashHex": "<key2>" },
  { "pubKeyHashHex": "<key3>" }
]}
\`\`\`

For seamless multisig in buildTx add:
\`\`\`json
"options": {
  "autoProvision":     { "workspaceNativeScript": true },
  "autoOptionalSigners": { "nativeScript": true }
}
\`\`\`

Unimatrix Sync enables private obfuscated channels for coordinating multi-party signing without a central backend.`,
        workspaces: `# Workspaces

Workspaces are named collections of wallet artifacts (keys, addresses, native scripts).
They allow multiple wallet types to coexist, be audited, shared, and recovered.

Artifacts:
- Keys (spending, staking, child keys)
- Addresses (personal, multisig, script)
- Native scripts

Key derivation: getSpendingPublicKey, getStakingPublicKey accept account and index parameters.
List workspace items: getAddresses, getKeys.`,
        examples: `# Example Dapps

70+ open source GCScript example dapps live in the examples/ directory of this repo.
Each example has: .gcscript, .html (with lib), .html (no lib), .md, .png.

Categories include:
- Payments (minimal, multi-output, pipeline)
- NFT / Token Minting
- Stake Delegation and Withdrawal
- Multisig (Kobayashi Maru, Shared Treasury, Unimatrix)
- Workspaces and Key Derivation
- Governance (DRep, Vote Delegation)
- Smart Contracts (Plutus V2/V3, Helios)
- GCFS (On-chain file system)
- CIP-8 Data Signing
- Cryptographic / Arithmetic Macros
- Gift Wallet Generation
- Search, Import, Export demos`,
        skills: `See SKILLS.md at the root of this repository for a comprehensive AI agent skills reference covering GCScript, ISL, UDC, transactions, workspaces, patterns, and tooling.`,
    };
    const content = docs[topic] ?? `No documentation found for topic: ${topic}`;
    return {
        content: [{ type: "text", text: content }],
    };
});
// ---------------------------------------------------------------------------
// Tool: validate_gcscript
// ---------------------------------------------------------------------------
server.tool("validate_gcscript", "Validate that a GCScript string is well-formed JSON and has the required 'type' property on the root object.", {
    gcscript: z.string().describe("GCScript JSON string to validate."),
}, async ({ gcscript }) => {
    const issues = [];
    let parsed;
    try {
        parsed = JSON.parse(gcscript);
    }
    catch (e) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
                },
            ],
        };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        issues.push("Root element must be a JSON object.");
    }
    else {
        const root = parsed;
        if (!("type" in root)) {
            issues.push("Root object is missing the required 'type' property.");
        }
        if (root["type"] === "script" && !("run" in root)) {
            issues.push("Script blocks must have a 'run' property.");
        }
        // Warn about JS comments that are not valid JSON
        if (gcscript.includes("//")) {
            issues.push("Warning: GCScript comments (//) shown in documentation are illustrative only and are not valid JSON. Remove them before use.");
        }
    }
    if (issues.length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: "GCScript is valid. No issues found.",
                },
            ],
        };
    }
    return {
        content: [
            {
                type: "text",
                text: `Validation issues:\n${issues.map((i) => `- ${i}`).join("\n")}`,
            },
        ],
    };
});
// ---------------------------------------------------------------------------
// Tool: list_tools
// ---------------------------------------------------------------------------
server.tool("list_tools", "List all available MCP tools provided by the GameChanger Wallet MCP server.", {}, async () => {
    const tools = [
        {
            name: "encode_gcscript_url",
            description: "Encode any GCScript JSON object into a wallet-ready URL.",
        },
        {
            name: "decode_wallet_response",
            description: "Decode a packed wallet result string back to JSON.",
        },
        {
            name: "generate_send_ada",
            description: "Generate a send-ADA GCScript + URL.",
        },
        {
            name: "generate_multi_send",
            description: "Generate a multi-recipient ADA payment GCScript + URL.",
        },
        {
            name: "generate_get_wallet_info",
            description: "Generate a wallet info retrieval GCScript + URL.",
        },
        {
            name: "generate_mint_token",
            description: "Generate a token/NFT minting GCScript + URL.",
        },
        {
            name: "generate_stake_delegation",
            description: "Generate a stake delegation GCScript + URL.",
        },
        {
            name: "get_documentation",
            description: "Return documentation for a topic: overview, gcscript, isl, url-patterns, transactions, payments, minting, multisig, workspaces, examples, skills.",
        },
        {
            name: "validate_gcscript",
            description: "Validate that a GCScript string is well-formed.",
        },
        {
            name: "list_tools",
            description: "List all available MCP tools.",
        },
    ];
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(tools, null, 2),
            },
        ],
    };
});
// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write("GameChanger Wallet MCP Server running on stdio\n");
}
main().catch((err) => {
    process.stderr.write(`Fatal error: ${err}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map