/**
 * GameChanger Wallet MCP Server — Example Parameter Schemas
 *
 * Defines which user-supplied parameters each of the 93 built-in GCScript
 * examples accepts, and how those parameters are applied to the raw GCScript
 * before it is encoded into a wallet URL.
 *
 * Application modes
 * -----------------
 *  "args"  — Writes the value into script.args[argsKey].
 *            Works for examples that already use the GCScript args pattern:
 *            {get('args.<key>')}.
 *  "str"   — Does a first-occurrence find-and-replace on the JSON string.
 *            findValue is the exact unquoted value as it appears in the JSON
 *            (e.g. a bech32 address, a pool key hash, an asset name).
 *  "num"   — Replaces a bare JSON numeric literal. findValue is the number as
 *            it appears in the JSON (e.g. 10), and jsonKey is the property name
 *            (e.g. "amount") so the replacement is targeted.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApplyMode =
  | { kind: "args"; argsKey: string }
  | { kind: "str"; findValue: string }
  | { kind: "num"; findValue: number; jsonKey: string };

export interface ExampleParamDef {
  /** Name used in the MCP tool schema (camelCase) */
  name: string;
  /** Human-readable description shown to the agent */
  description: string;
  /** MCP parameter type */
  type: "string" | "integer";
  /** Whether the agent must supply this value */
  required: boolean;
  /** Default / demo value already present in the original script */
  default?: string;
  /** How to apply the value to the GCScript */
  apply: ApplyMode;
}

// ---------------------------------------------------------------------------
// Shared demo constants
// ---------------------------------------------------------------------------

const GC_DEMO_ADDR =
  "addr1q9faamq9k6557gve35amtdqph99h9q2txhz07chaxg6uwwgd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqczuqwr";

// ---------------------------------------------------------------------------
// Parameter schemas
// ---------------------------------------------------------------------------

/**
 * Maps an example's name (the filename without the .gcscript extension) to the
 * list of parameters its MCP tool exposes.  Examples not listed here receive
 * no extra parameters — their tool only accepts the standard `network` field.
 */
export const EXAMPLE_PARAM_SCHEMAS: Record<string, ExampleParamDef[]> = {
  // ── Payments ─────────────────────────────────────────────────────────────

  "🚀 Pay me 1 ADA": [
    {
      name: "toAddress",
      description: "Recipient Cardano address (bech32). Defaults to the demo address.",
      type: "string",
      required: false,
      default: GC_DEMO_ADDR,
      apply: { kind: "str", findValue: GC_DEMO_ADDR },
    },
    {
      name: "lovelace",
      description: "Amount to send in lovelace (1 ADA = 1,000,000 lovelace). Defaults to 1,000,000.",
      type: "string",
      required: false,
      default: "1000000",
      apply: { kind: "str", findValue: "1000000" },
    },
  ],

  "Minimal Coin Sending Demo": [
    {
      name: "toAddress",
      description: "Recipient Cardano address (bech32). Defaults to the demo address.",
      type: "string",
      required: false,
      default: GC_DEMO_ADDR,
      apply: { kind: "str", findValue: GC_DEMO_ADDR },
    },
    {
      name: "lovelace",
      description: "Amount to send in lovelace (1 ADA = 1,000,000 lovelace). Defaults to 1,000,000.",
      type: "string",
      required: false,
      default: "1000000",
      apply: { kind: "str", findValue: "1000000" },
    },
  ],

  "GC Transaction Features": [
    {
      name: "toAddress",
      description: "Recipient Cardano address (bech32). Defaults to the demo address.",
      type: "string",
      required: false,
      default: GC_DEMO_ADDR,
      apply: { kind: "str", findValue: GC_DEMO_ADDR },
    },
  ],

  "Transaction Pipeline": [
    {
      name: "recipient1Address",
      description: "First recipient address (bech32).",
      type: "string",
      required: false,
      default:
        "addr1q98f06pcrsn8x03uw0vlejw684fcu02waffvfscdsz0djgqd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yq2vsyn7",
      apply: {
        kind: "str",
        findValue:
          "addr1q98f06pcrsn8x03uw0vlejw684fcu02waffvfscdsz0djgqd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yq2vsyn7",
      },
    },
    {
      name: "recipient2Address",
      description: "Second recipient / intermediary address (bech32).",
      type: "string",
      required: false,
      default:
        "addr1q9cyzfctymllue5gx93mxnrymlzzxejkzgsrkgwq7upje4gd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqpnzcra",
      apply: {
        kind: "str",
        findValue:
          "addr1q9cyzfctymllue5gx93mxnrymlzzxejkzgsrkgwq7upje4gd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqpnzcra",
      },
    },
    {
      name: "recipient3Address",
      description: "Third recipient address (bech32).",
      type: "string",
      required: false,
      default:
        "addr1qyygq384vhtcys27wedeh7r6jd0arwefvfxt6ggwjld0mjqd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqa24x5g",
      apply: {
        kind: "str",
        findValue:
          "addr1qyygq384vhtcys27wedeh7r6jd0arwefvfxt6ggwjld0mjqd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqa24x5g",
      },
    },
  ],

  "UTXO Generator": [
    {
      name: "lovelacePerUtxo",
      description: "Lovelace amount for each generated UTXO (default 1,000,000 = 1 ADA).",
      type: "string",
      required: false,
      default: "1000000",
      apply: { kind: "str", findValue: "1000000" },
    },
  ],

  // ── Minting ──────────────────────────────────────────────────────────────

  "NFT Minting Demo": [
    {
      name: "toAddress",
      description: "Address to receive the minted NFT. Defaults to the demo address.",
      type: "string",
      required: false,
      default: GC_DEMO_ADDR,
      apply: { kind: "str", findValue: GC_DEMO_ADDR },
    },
    {
      name: "assetName",
      description: "Name of the NFT asset (on-chain). Defaults to \"GameChangerNFT\".",
      type: "string",
      required: false,
      default: "GameChangerNFT",
      apply: { kind: "str", findValue: "GameChangerNFT" },
    },
    {
      name: "quantity",
      description: "Number of tokens to mint. Defaults to \"100\".",
      type: "string",
      required: false,
      default: "100",
      apply: { kind: "str", findValue: "100" },
    },
  ],

  "Keep Calm NFT": [
    {
      name: "assetName",
      description: "On-chain asset name. Defaults to \"KeepCalmUseGC\".",
      type: "string",
      required: false,
      default: "KeepCalmUseGC",
      apply: { kind: "str", findValue: "KeepCalmUseGC" },
    },
    {
      name: "quantity",
      description: "Number of tokens to mint. Defaults to \"100\".",
      type: "string",
      required: false,
      default: "100",
      apply: { kind: "str", findValue: "100" },
    },
  ],

  "Spirois-Montiel-SudoScientist Token Minting Test": [
    {
      name: "assetName",
      description: "On-chain asset name. Defaults to \"TestToken\".",
      type: "string",
      required: false,
      default: "TestToken",
      apply: { kind: "str", findValue: "TestToken" },
    },
  ],

  "Helios One-Shot Mint": [
    {
      name: "assetName",
      description: "On-chain asset name. Defaults to \"KeepCalmAndUseGC\".",
      type: "string",
      required: false,
      default: "KeepCalmAndUseGC",
      apply: { kind: "args", argsKey: "asset-name" },
    },
    {
      name: "quantity",
      description: "Number of tokens to mint. Defaults to \"1\".",
      type: "string",
      required: false,
      default: "1",
      apply: { kind: "args", argsKey: "quantity" },
    },
  ],

  // ── Delegation ───────────────────────────────────────────────────────────

  "Stake Delegation": [
    {
      name: "poolKeyHashHex",
      description:
        "Stake pool key hash (56 hex characters). Defaults to the demo APEX pool hash.",
      type: "string",
      required: false,
      default: "9eb76bb591d689dd06304c77c0df7871df76e768577e26af10d32b0c",
      apply: {
        kind: "str",
        findValue: "9eb76bb591d689dd06304c77c0df7871df76e768577e26af10d32b0c",
      },
    },
  ],

  "Multi Stake Delegation": [
    {
      name: "apexPoolHex",
      description: "Pool key hash for the first delegation (APEX). 56 hex chars.",
      type: "string",
      required: false,
      default: "7facad662e180ce45e5c504957cd1341940c72a708728f7ecfc6e349",
      apply: {
        kind: "str",
        findValue: "7facad662e180ce45e5c504957cd1341940c72a708728f7ecfc6e349",
      },
    },
    {
      name: "alfaPoolHex",
      description: "Pool key hash for the second delegation (ALFA). 56 hex chars.",
      type: "string",
      required: false,
      default: "8ffb4c8e648c0662f2a91157c92feaa95f1a3d2728eaea8257b3d8d9",
      apply: {
        kind: "str",
        findValue: "8ffb4c8e648c0662f2a91157c92feaa95f1a3d2728eaea8257b3d8d9",
      },
    },
    {
      name: "otgPoolHex",
      description: "Pool key hash for the third delegation (OTG). 56 hex chars.",
      type: "string",
      required: false,
      default: "db1018753659a073c43ad75c1f243f97a3896a45b81a61300ea96a9f",
      apply: {
        kind: "str",
        findValue: "db1018753659a073c43ad75c1f243f97a3896a45b81a61300ea96a9f",
      },
    },
  ],

  // ── Governance ───────────────────────────────────────────────────────────

  "Governance - Vote Delegation - DRep": [
    {
      name: "dRepScriptHashHex",
      description:
        "DRep script hash (56 hex characters). Defaults to the demo DRep hash in the script.",
      type: "string",
      required: false,
      default: "199ad2959c8c4e4d50a04a0f3d873b692ff86fbc6a195dd44d17b746",
      apply: { kind: "args", argsKey: "scriptHashHex" },
    },
    {
      name: "kind",
      description: "Vote delegation kind: \"DRep\" | \"Abstain\" | \"NoConfidence\". Defaults to \"DRep\".",
      type: "string",
      required: false,
      default: "DRep",
      apply: { kind: "args", argsKey: "kind" },
    },
  ],

  // ── Gift wallets ─────────────────────────────────────────────────────────

  "Generate 10 Gift Wallets": [
    {
      name: "walletCount",
      description: "Number of gift wallets to generate. Defaults to 10.",
      type: "integer",
      required: false,
      default: "10",
      apply: { kind: "num", findValue: 10, jsonKey: "amount" },
    },
    {
      name: "namePattern",
      description: "Wallet name pattern. Use {index} for the wallet number. Defaults to \"Student {index}\".",
      type: "string",
      required: false,
      default: "Student {index}",
      apply: { kind: "str", findValue: "Student {index}" },
    },
    {
      name: "passwordPattern",
      description: "Password pattern. Use {index} for the wallet number. Defaults to \"PaSsWoRd{index}\".",
      type: "string",
      required: false,
      default: "PaSsWoRd{index}",
      apply: { kind: "str", findValue: "PaSsWoRd{index}" },
    },
  ],

  "Generate 3 Gift Wallets and fund them": [
    {
      name: "walletCount",
      description: "Number of gift wallets to generate and fund. Defaults to 3.",
      type: "integer",
      required: false,
      default: "3",
      apply: { kind: "num", findValue: 3, jsonKey: "amount" },
    },
    {
      name: "lovelacePerWallet",
      description: "Lovelace to send to each wallet (1 ADA = 1,000,000). Defaults to 1,000,000.",
      type: "string",
      required: false,
      default: "1000000",
      apply: { kind: "str", findValue: "1000000" },
    },
  ],

  // ── Smart contracts ───────────────────────────────────────────────────────

  "Smart Handles - Swap ADA to MIN on Minswap": [
    {
      name: "amount",
      description:
        "Amount of lovelace to send for the swap (1 ADA = 1,000,000). Defaults to 50,000,000 (50 ADA).",
      type: "string",
      required: false,
      default: "50000000",
      apply: { kind: "args", argsKey: "amount" },
    },
  ],

  "Deploy Plutus Script": [
    {
      name: "toAddress",
      description: "Address to deploy the Plutus script to. Defaults to the demo address.",
      type: "string",
      required: false,
      default:
        "addr1qxmuaem37em6w7uf2y4u38tppsmqyq6vz4f5syudpnzfduntav86sqsfxyanfcq62yarewag2jtj6uewltfnqmpnxcjs49k43d",
      apply: {
        kind: "str",
        findValue:
          "addr1qxmuaem37em6w7uf2y4u38tppsmqyq6vz4f5syudpnzfduntav86sqsfxyanfcq62yarewag2jtj6uewltfnqmpnxcjs49k43d",
      },
    },
  ],

  // ── Multisig ─────────────────────────────────────────────────────────────

  "Internal Multi Signing Demo": [
    {
      name: "toAddress",
      description: "Recipient address (bech32). Defaults to the demo address.",
      type: "string",
      required: false,
      default: GC_DEMO_ADDR,
      apply: { kind: "str", findValue: GC_DEMO_ADDR },
    },
  ],

  "Kobayashi Maru Multi Signing Demo": [
    {
      name: "toAddress",
      description: "Recipient address (bech32). Defaults to the demo address.",
      type: "string",
      required: false,
      default: GC_DEMO_ADDR,
      apply: { kind: "str", findValue: GC_DEMO_ADDR },
    },
  ],

  "Shared Treasury - 3 of 4 signers - using addresses": [
    {
      name: "member0Address",
      description: "Address of the first signer / member (bech32).",
      type: "string",
      required: false,
      default:
        "addr1q98f06pcrsn8x03uw0vlejw684fcu02waffvfscdsz0djgqd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yq2vsyn7",
      apply: {
        kind: "str",
        findValue:
          "addr1q98f06pcrsn8x03uw0vlejw684fcu02waffvfscdsz0djgqd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yq2vsyn7",
      },
    },
    {
      name: "member1Address",
      description: "Address of the second signer / member (bech32).",
      type: "string",
      required: false,
      default:
        "addr1q9cyzfctymllue5gx93mxnrymlzzxejkzgsrkgwq7upje4gd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqpnzcra",
      apply: {
        kind: "str",
        findValue:
          "addr1q9cyzfctymllue5gx93mxnrymlzzxejkzgsrkgwq7upje4gd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqpnzcra",
      },
    },
    {
      name: "member2Address",
      description: "Address of the third signer / member (bech32).",
      type: "string",
      required: false,
      default:
        "addr1qyygq384vhtcys27wedeh7r6jd0arwefvfxt6ggwjld0mjqd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqa24x5g",
      apply: {
        kind: "str",
        findValue:
          "addr1qyygq384vhtcys27wedeh7r6jd0arwefvfxt6ggwjld0mjqd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqa24x5g",
      },
    },
    {
      name: "member3Address",
      description: "Address of the fourth signer / member (bech32).",
      type: "string",
      required: false,
      default:
        "addr1q9zlzmrvdrlt8f90va74qa4req68shy5kc54s8np4p6a2eqd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqhq5g2r",
      apply: {
        kind: "str",
        findValue:
          "addr1q9zlzmrvdrlt8f90va74qa4req68shy5kc54s8np4p6a2eqd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqhq5g2r",
      },
    },
  ],

  // ── Wallet / identity ─────────────────────────────────────────────────────

  "Address Impersonator": [
    {
      name: "address",
      description: "Cardano address to impersonate (bech32).",
      type: "string",
      required: false,
      default:
        "addr1q98f06pcrsn8x03uw0vlejw684fcu02waffvfscdsz0djgqd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yq2vsyn7",
      apply: { kind: "args", argsKey: "address" },
    },
    {
      name: "name",
      description: "Name to use for the impersonated wallet. Defaults to \"MyOtherWallet\".",
      type: "string",
      required: false,
      default: "MyOtherWallet",
      apply: { kind: "args", argsKey: "name" },
    },
  ],

  "2FA": [
    {
      name: "toAddress",
      description: "Recipient address for the 2FA transaction demo. Defaults to the demo address.",
      type: "string",
      required: false,
      default: GC_DEMO_ADDR,
      apply: { kind: "str", findValue: GC_DEMO_ADDR },
    },
  ],

  // ── GCFS ──────────────────────────────────────────────────────────────────

  "Write registration to join Dandelion Network (GCFS)": [
    {
      name: "name",
      description: "Node group name. Defaults to \"Test Group\".",
      type: "string",
      required: false,
      default: "Test Group",
      apply: { kind: "args", argsKey: "name" },
    },
    {
      name: "description",
      description: "Node group description.",
      type: "string",
      required: false,
      default: "On-chain testing registration of my own Dandelion Lite node",
      apply: { kind: "args", argsKey: "description" },
    },
    {
      name: "ticker",
      description: "Short ticker/identifier for the node group. Defaults to \"test\".",
      type: "string",
      required: false,
      default: "test",
      apply: { kind: "args", argsKey: "ticker" },
    },
    {
      name: "nodeUrl",
      description: "URL of the Dandelion Lite node endpoint.",
      type: "string",
      required: false,
      default: "https://ar03a.gamechanger.finance:2096/",
      apply: { kind: "args", argsKey: "node-url" },
    },
  ],
};

// ---------------------------------------------------------------------------
// Public helper: apply user-supplied params to a raw GCScript object
// ---------------------------------------------------------------------------

/**
 * Clones `gcscript`, applies each user-supplied parameter according to the
 * provided schema definitions, and returns the modified script.
 *
 * Only parameters whose value is a non-empty string are applied.
 * Parameters not found in `userParams` are left unchanged (the original
 * script's default values remain).
 */
export function applyExampleParams(
  gcscript: Record<string, unknown>,
  schemaDefs: ExampleParamDef[],
  userParams: Record<string, string | number | undefined>
): Record<string, unknown> {
  // Work on a JSON round-trip clone to avoid mutating the original
  let jsonStr = JSON.stringify(gcscript);
  const result: Record<string, unknown> = JSON.parse(jsonStr);

  for (const def of schemaDefs) {
    const raw = userParams[def.name];
    if (raw === undefined || raw === "") continue;
    const userValue = String(raw);

    const { apply } = def;

    if (apply.kind === "args") {
      // Inject / override the value in the script's args block
      if (!result.args || typeof result.args !== "object" || Array.isArray(result.args)) {
        result.args = {} as Record<string, string>;
      }
      (result.args as Record<string, string>)[apply.argsKey] = userValue;

    } else if (apply.kind === "str") {
      // Replace the first occurrence of findValue as a bare substring of the
      // JSON string.  Using the raw findValue (no surrounding JSON quotes) is
      // more robust because it handles addresses embedded inside ISL
      // expressions (e.g. {getAddressInfo('addr1q...')}) as well as standalone
      // JSON string values ("addr1q...").
      //
      // JSON.stringify(userValue).slice(1,-1) produces the correctly JSON-escaped
      // representation of the user value without outer quotes.  This is safe for
      // all GCScript parameter types in this file (bech32 addresses, hex hashes,
      // asset names, lovelace amounts) because those values contain only
      // alphanumeric characters, hyphens, underscores, and braces — none of
      // which require additional JSON escaping beyond what JSON.stringify provides.
      const escapedUserValue = JSON.stringify(userValue).slice(1, -1);
      jsonStr = jsonStr.replace(apply.findValue, escapedUserValue);
      // Re-parse after every replacement so subsequent replacements work on
      // the updated JSON.
      Object.assign(result, JSON.parse(jsonStr));

    } else if (apply.kind === "num") {
      // Replace a bare numeric literal: "jsonKey":N → "jsonKey":M
      // JSON.stringify produces no spaces around ":", so match exactly.
      // parseInt returns NaN for non-numeric strings; Number.isFinite(NaN) is
      // false, so invalid user input is silently skipped (original value kept).
      const parsed = def.type === "integer" ? parseInt(userValue, 10) : parseFloat(userValue);
      if (!Number.isFinite(parsed)) continue;
      const needle = `"${apply.jsonKey}":${apply.findValue}`;
      const replacement = `"${apply.jsonKey}":${parsed}`;
      jsonStr = jsonStr.replace(needle, replacement);
      Object.assign(result, JSON.parse(jsonStr));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public helper: convert an example name to a valid MCP tool-name slug
// ---------------------------------------------------------------------------

/**
 * Converts an example display name to a snake_case slug suitable for use as
 * an MCP tool name.
 *
 * Rules:
 *  - Strip all non-ASCII characters (outside the 0x00–0x7F range), including emoji
 *  - Replace runs of non-alphanumeric chars with a single underscore
 *  - Lower-case the result
 *  - Trim leading/trailing underscores
 *
 * Examples:
 *  "🚀 Pay me 1 ADA"            → "pay_me_1_ada"
 *  "NFT Minting Demo"            → "nft_minting_demo"
 *  "Governance - Vote Delegation - DRep" → "governance_vote_delegation_drep"
 */
export function slugifyExampleName(name: string): string {
  return name
    .replace(/[^\x00-\x7F]/g, "")      // strip all non-ASCII characters (emoji, etc.)
    .replace(/[^a-zA-Z0-9]+/g, "_")    // non-alphanumeric → underscore
    .replace(/^_+|_+$/g, "")           // trim boundary underscores
    .toLowerCase();
}
