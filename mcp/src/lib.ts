/**
 * GameChanger Wallet MCP Server — Core Library
 *
 * Pure, testable functions extracted from the MCP server entry point.
 * No MCP SDK imports here — only Cardano / GCScript business logic.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GC_API_BASE = "https://wallet.gamechanger.finance/api/2/run/";

export type Network = "mainnet" | "preprod";

// ---------------------------------------------------------------------------
// URL encoding / decoding helpers
// ---------------------------------------------------------------------------

/**
 * Encode a GCScript object into a base64url wallet URL (no compression, "0-" prefix).
 */
export function encodeGcScriptUrl(gcScript: unknown, network: Network): string {
  const json = JSON.stringify(gcScript);
  const encoded = Buffer.from(json, "utf8").toString("base64url");
  return `${GC_API_BASE}0-${encoded}?networkTag=${network}`;
}

/**
 * Decode a packed wallet result string back to a JSON object.
 * Handles both "0-" (base64url) and "1-" (gzip+base64url) prefixes.
 */
export async function decodeGcResult(packed: string): Promise<unknown> {
  if (packed.startsWith("0-")) {
    const json = Buffer.from(packed.slice(2), "base64url").toString("utf8");
    return JSON.parse(json);
  }
  if (packed.startsWith("1-")) {
    const compressed = Buffer.from(packed.slice(2), "base64url");
    const { gunzip } = await import("node:zlib");
    const { promisify } = await import("node:util");
    const decompressed = await promisify(gunzip)(compressed);
    return JSON.parse(decompressed.toString("utf8"));
  }
  throw new Error(
    "Unsupported encoding prefix. Expected '0-' (base64url) or '1-' (gzip)."
  );
}

// ---------------------------------------------------------------------------
// GCScript validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateGcScript(gcscript: string): ValidationResult {
  const issues: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(gcscript);
  } catch (e) {
    return {
      valid: false,
      issues: [
        `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    issues.push("Root element must be a JSON object.");
  } else {
    const root = parsed as Record<string, unknown>;
    if (!("type" in root)) {
      issues.push("Root object is missing the required 'type' property.");
    }
    if (root["type"] === "script" && !("run" in root)) {
      issues.push("Script blocks must have a 'run' property.");
    }
    if (gcscript.includes("//")) {
      issues.push(
        "Warning: GCScript comments (//) shown in documentation are illustrative only and are not valid JSON. Remove them before use."
      );
    }
  }

  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// GCScript builder functions
// ---------------------------------------------------------------------------

export function buildSendAdaScript(params: {
  toAddress: string;
  lovelace: string;
  title?: string;
  returnUrl?: string;
}): Record<string, unknown> {
  const script: Record<string, unknown> = {
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

export function buildGetWalletInfoScript(params?: {
  returnUrl?: string;
}): Record<string, unknown> {
  const script: Record<string, unknown> = {
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

  if (params?.returnUrl) {
    script["returnURLPattern"] = params.returnUrl;
  }

  return script;
}

export function buildMintTokenScript(params: {
  assetName: string;
  quantity: string;
  toAddress?: string;
  metadata?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    type: "script",
    title: `Mint ${params.quantity} ${params.assetName}`,
    description:
      "Mint native tokens using the user's spending key as minting policy.",
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
              pubKeyHashHex:
                "{get('cache.dependencies.issuer.pubKeyHashHex')}",
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
              script:
                "{get('cache.dependencies.mintingPolicy.scriptHashHex')}",
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
              address:
                params.toAddress ??
                "{get('cache.dependencies.issuer.address')}",
              assets: [
                {
                  policyId:
                    "{get('cache.dependencies.mintingPolicy.scriptHashHex')}",
                  assetName: params.assetName,
                  quantity: params.quantity,
                },
              ],
            },
          ],
          ...(params.metadata ? { auxiliaryData: params.metadata } : {}),
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

export function buildMultiSendScript(
  outputs: Array<{ address: string; lovelace: string }>
): Record<string, unknown> {
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

export function buildStakeDelegationScript(
  poolId: string
): Record<string, unknown> {
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
            { type: "stakeKeyRegistration" },
            { type: "stakeDelegation", poolId },
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
