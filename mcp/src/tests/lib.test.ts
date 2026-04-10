/**
 * Tests for mcp/src/lib.ts — pure helper functions
 *
 * Uses Node.js built-in test runner (node:test).
 * Run with:  npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  GC_API_BASE,
  encodeGcScriptUrl,
  decodeGcResult,
  validateGcScript,
  buildSendAdaScript,
  buildGetWalletInfoScript,
  buildMintTokenScript,
  buildMultiSendScript,
  buildStakeDelegationScript,
} from "../lib.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ALICE = "addr1q9faamq9k6557gve35amtdqph99h9q2txhz07chaxg6uwwgd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqczuqwr";
const BOB   = "addr_test1vrv2myc3je5q7fxfnajjgj4qnynhdp82rsylnj2lm8yawtswwgyaw";
const POOL  = "pool14wk2m2af7y4gkxea7yes73z5j68vvpnk0mgdkr97wxtpqx73l4c";

// ---------------------------------------------------------------------------
// URL encoding / decoding
// ---------------------------------------------------------------------------

describe("encodeGcScriptUrl", () => {
  it("produces a URL with the GC API base", () => {
    const script = { type: "script", run: {} };
    const url = encodeGcScriptUrl(script, "mainnet");
    assert.ok(url.startsWith(GC_API_BASE), `URL should start with ${GC_API_BASE}`);
  });

  it("includes networkTag query param", () => {
    const url = encodeGcScriptUrl({ type: "script", run: {} }, "preprod");
    assert.ok(url.includes("networkTag=preprod"), "URL should include networkTag=preprod");
  });

  it("uses '0-' base64url prefix in payload", () => {
    const url = encodeGcScriptUrl({ type: "data", value: "hello" }, "mainnet");
    const payload = url.replace(GC_API_BASE, "").split("?")[0];
    assert.ok(payload.startsWith("0-"), "Payload should start with '0-'");
  });

  it("round-trips: encode then decode returns original object", async () => {
    const script = { type: "script", title: "Round-trip test", run: {} };
    const url = encodeGcScriptUrl(script, "mainnet");
    const payload = url.replace(GC_API_BASE, "").split("?")[0];
    const decoded = await decodeGcResult(payload);
    assert.deepStrictEqual(decoded, script);
  });
});

describe("decodeGcResult", () => {
  it("decodes a 0- (base64url) payload", async () => {
    const data = { foo: "bar", baz: 42 };
    const encoded = "0-" + Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
    const result = await decodeGcResult(encoded);
    assert.deepStrictEqual(result, data);
  });

  it("throws on unsupported prefix", async () => {
    await assert.rejects(
      () => decodeGcResult("9-abc123"),
      /Unsupported encoding prefix/
    );
  });

  it("throws on invalid base64url JSON", async () => {
    const invalid = "0-" + Buffer.from("not-json", "utf8").toString("base64url");
    await assert.rejects(() => decodeGcResult(invalid));
  });
});

// ---------------------------------------------------------------------------
// GCScript validation
// ---------------------------------------------------------------------------

describe("validateGcScript", () => {
  it("validates a minimal valid script", () => {
    const result = validateGcScript(JSON.stringify({ type: "script", run: {} }));
    assert.ok(result.valid, "Minimal script should be valid");
    assert.strictEqual(result.issues.length, 0);
  });

  it("validates a data function", () => {
    const result = validateGcScript(JSON.stringify({ type: "data", value: "hello" }));
    assert.ok(result.valid);
  });

  it("flags invalid JSON", () => {
    const result = validateGcScript("not json {{{");
    assert.ok(!result.valid);
    assert.ok(result.issues[0].includes("Invalid JSON"));
  });

  it("flags a root array", () => {
    const result = validateGcScript("[1, 2, 3]");
    assert.ok(!result.valid);
    assert.ok(result.issues.some((i) => i.includes("JSON object")));
  });

  it("flags missing type property", () => {
    const result = validateGcScript(JSON.stringify({ run: {} }));
    assert.ok(!result.valid);
    assert.ok(result.issues.some((i) => i.includes("'type'")));
  });

  it("flags script block without 'run' property", () => {
    const result = validateGcScript(JSON.stringify({ type: "script" }));
    assert.ok(!result.valid);
    assert.ok(result.issues.some((i) => i.includes("'run'")));
  });

  it("warns about JS-style comments", () => {
    const script = `{ "type": "script", "run": {} // comment\n}`;
    // JSON.parse will fail here actually, so this covers the invalid JSON path
    const result = validateGcScript(script);
    assert.ok(!result.valid);
  });
});

// ---------------------------------------------------------------------------
// Builder: buildSendAdaScript
// ---------------------------------------------------------------------------

describe("buildSendAdaScript", () => {
  it("returns a script with correct structure", () => {
    const script = buildSendAdaScript({ toAddress: ALICE, lovelace: "1000000" });
    assert.strictEqual(script["type"], "script");
    assert.ok(script["run"], "Should have run property");
    const run = script["run"] as Record<string, unknown>;
    assert.ok(run["build"], "Should have build step");
    assert.ok(run["sign"],  "Should have sign step");
    assert.ok(run["submit"],"Should have submit step");
  });

  it("sets the recipient address in the output", () => {
    const script = buildSendAdaScript({ toAddress: ALICE, lovelace: "2000000" });
    const run = script["run"] as Record<string, unknown>;
    const build = run["build"] as Record<string, unknown>;
    const tx = build["tx"] as Record<string, unknown>;
    const outputs = tx["outputs"] as Array<Record<string, unknown>>;
    assert.strictEqual(outputs[0]["address"], ALICE);
  });

  it("sets the correct lovelace quantity", () => {
    const script = buildSendAdaScript({ toAddress: ALICE, lovelace: "5000000" });
    const run = script["run"] as Record<string, unknown>;
    const build = run["build"] as Record<string, unknown>;
    const tx = build["tx"] as Record<string, unknown>;
    const outputs = tx["outputs"] as Array<Record<string, unknown>>;
    const assets = outputs[0]["assets"] as Array<Record<string, unknown>>;
    assert.strictEqual(assets[0]["quantity"], "5000000");
  });

  it("uses custom title when provided", () => {
    const script = buildSendAdaScript({ toAddress: ALICE, lovelace: "1000000", title: "My Payment" });
    assert.strictEqual(script["title"], "My Payment");
  });

  it("uses default title when not provided", () => {
    const script = buildSendAdaScript({ toAddress: ALICE, lovelace: "1000000" });
    assert.strictEqual(script["title"], "Send ADA");
  });

  it("adds returnURLPattern when returnUrl is provided", () => {
    const returnUrl = "https://example.com/cb?result={result}";
    const script = buildSendAdaScript({ toAddress: ALICE, lovelace: "1000000", returnUrl });
    assert.strictEqual(script["returnURLPattern"], returnUrl);
  });

  it("does not add returnURLPattern when not provided", () => {
    const script = buildSendAdaScript({ toAddress: ALICE, lovelace: "1000000" });
    assert.ok(!("returnURLPattern" in script));
  });

  it("produces valid GCScript JSON", () => {
    const script = buildSendAdaScript({ toAddress: ALICE, lovelace: "1000000" });
    const result = validateGcScript(JSON.stringify(script));
    assert.ok(result.valid, `Validation issues: ${result.issues.join(", ")}`);
  });

  it("encodes to a wallet URL that contains the address", async () => {
    const script = buildSendAdaScript({ toAddress: ALICE, lovelace: "1000000" });
    const url = encodeGcScriptUrl(script, "mainnet");
    const payload = url.replace(GC_API_BASE, "").split("?")[0];
    const decoded = await decodeGcResult(payload) as Record<string, unknown>;
    const run = decoded["run"] as Record<string, unknown>;
    const build = run["build"] as Record<string, unknown>;
    const tx = build["tx"] as Record<string, unknown>;
    const outputs = tx["outputs"] as Array<Record<string, unknown>>;
    assert.strictEqual(outputs[0]["address"], ALICE);
  });
});

// ---------------------------------------------------------------------------
// Builder: buildGetWalletInfoScript
// ---------------------------------------------------------------------------

describe("buildGetWalletInfoScript", () => {
  it("returns a script with type 'script'", () => {
    const script = buildGetWalletInfoScript();
    assert.strictEqual(script["type"], "script");
  });

  it("run block calls getName, getCurrentAddress, getNetworkInfo", () => {
    const script = buildGetWalletInfoScript();
    const run = script["run"] as Record<string, unknown>;
    assert.ok(run["name"]);
    assert.ok(run["address"]);
    assert.ok(run["network"]);
    assert.strictEqual((run["name"] as Record<string, string>)["type"], "getName");
    assert.strictEqual((run["address"] as Record<string, string>)["type"], "getCurrentAddress");
    assert.strictEqual((run["network"] as Record<string, string>)["type"], "getNetworkInfo");
  });

  it("adds returnURLPattern when provided", () => {
    const returnUrl = "https://dapp.example/?result={result}";
    const script = buildGetWalletInfoScript({ returnUrl });
    assert.strictEqual(script["returnURLPattern"], returnUrl);
  });

  it("produces valid GCScript JSON", () => {
    const result = validateGcScript(JSON.stringify(buildGetWalletInfoScript()));
    assert.ok(result.valid, result.issues.join(", "));
  });
});

// ---------------------------------------------------------------------------
// Builder: buildMintTokenScript
// ---------------------------------------------------------------------------

describe("buildMintTokenScript", () => {
  it("returns a script with type 'script'", () => {
    const script = buildMintTokenScript({ assetName: "MyToken", quantity: "100" });
    assert.strictEqual(script["type"], "script");
  });

  it("title contains assetName and quantity", () => {
    const script = buildMintTokenScript({ assetName: "GCToken", quantity: "999" });
    assert.ok((script["title"] as string).includes("GCToken"));
    assert.ok((script["title"] as string).includes("999"));
  });

  it("mints section contains the assetName and quantity", () => {
    const script = buildMintTokenScript({ assetName: "TestToken", quantity: "500" });
    const run = script["run"] as Record<string, unknown>;
    const build = run["build"] as Record<string, unknown>;
    const tx = build["tx"] as Record<string, unknown>;
    const mints = tx["mints"] as Array<Record<string, unknown>>;
    const assets = mints[0]["assets"] as Array<Record<string, unknown>>;
    assert.strictEqual(assets[0]["assetName"], "TestToken");
    assert.strictEqual(assets[0]["quantity"], "500");
  });

  it("uses custom toAddress when provided", () => {
    const script = buildMintTokenScript({ assetName: "T", quantity: "1", toAddress: ALICE });
    const run = script["run"] as Record<string, unknown>;
    const build = run["build"] as Record<string, unknown>;
    const tx = build["tx"] as Record<string, unknown>;
    const outputs = tx["outputs"] as Array<Record<string, unknown>>;
    assert.strictEqual(outputs[0]["address"], ALICE);
  });

  it("uses ISL default address when toAddress not provided", () => {
    const script = buildMintTokenScript({ assetName: "T", quantity: "1" });
    const run = script["run"] as Record<string, unknown>;
    const build = run["build"] as Record<string, unknown>;
    const tx = build["tx"] as Record<string, unknown>;
    const outputs = tx["outputs"] as Array<Record<string, unknown>>;
    assert.ok(
      (outputs[0]["address"] as string).startsWith("{get("),
      "Default address should be an ISL expression"
    );
  });

  it("attaches auxiliaryData when metadata is provided", () => {
    const metadata = { "721": { policyId: { TestNFT: { name: "Test" } } } };
    const script = buildMintTokenScript({ assetName: "TestNFT", quantity: "1", metadata });
    const run = script["run"] as Record<string, unknown>;
    const build = run["build"] as Record<string, unknown>;
    const tx = build["tx"] as Record<string, unknown>;
    assert.ok(tx["auxiliaryData"], "Should have auxiliaryData");
  });

  it("produces valid GCScript JSON", () => {
    const result = validateGcScript(JSON.stringify(buildMintTokenScript({ assetName: "T", quantity: "1" })));
    assert.ok(result.valid, result.issues.join(", "));
  });
});

// ---------------------------------------------------------------------------
// Builder: buildMultiSendScript
// ---------------------------------------------------------------------------

describe("buildMultiSendScript", () => {
  const twoRecipients = [
    { address: ALICE, lovelace: "1000000" },
    { address: BOB,   lovelace: "2000000" },
  ];

  it("returns a script with type 'script'", () => {
    const script = buildMultiSendScript(twoRecipients);
    assert.strictEqual(script["type"], "script");
  });

  it("builds one output per recipient", () => {
    const script = buildMultiSendScript(twoRecipients);
    const run = script["run"] as Record<string, unknown>;
    const build = run["build"] as Record<string, unknown>;
    const tx = build["tx"] as Record<string, unknown>;
    const outputs = tx["outputs"] as Array<Record<string, unknown>>;
    assert.strictEqual(outputs.length, 2);
  });

  it("assigns correct addresses and amounts", () => {
    const script = buildMultiSendScript(twoRecipients);
    const run = script["run"] as Record<string, unknown>;
    const build = run["build"] as Record<string, unknown>;
    const tx = build["tx"] as Record<string, unknown>;
    const outputs = tx["outputs"] as Array<Record<string, unknown>>;
    assert.strictEqual(outputs[0]["address"], ALICE);
    assert.strictEqual(
      ((outputs[0]["assets"] as Array<Record<string, unknown>>)[0])["quantity"],
      "1000000"
    );
    assert.strictEqual(outputs[1]["address"], BOB);
    assert.strictEqual(
      ((outputs[1]["assets"] as Array<Record<string, unknown>>)[0])["quantity"],
      "2000000"
    );
  });

  it("produces valid GCScript JSON", () => {
    const result = validateGcScript(JSON.stringify(buildMultiSendScript(twoRecipients)));
    assert.ok(result.valid, result.issues.join(", "));
  });
});

// ---------------------------------------------------------------------------
// Builder: buildStakeDelegationScript
// ---------------------------------------------------------------------------

describe("buildStakeDelegationScript", () => {
  it("returns a script with type 'script'", () => {
    const script = buildStakeDelegationScript(POOL);
    assert.strictEqual(script["type"], "script");
  });

  it("description contains poolId", () => {
    const script = buildStakeDelegationScript(POOL);
    assert.ok((script["description"] as string).includes(POOL));
  });

  it("certificates block includes stakeKeyRegistration and stakeDelegation", () => {
    const script = buildStakeDelegationScript(POOL);
    const run = script["run"] as Record<string, unknown>;
    const build = run["build"] as Record<string, unknown>;
    const tx = build["tx"] as Record<string, unknown>;
    const certs = tx["certificates"] as Array<Record<string, unknown>>;
    assert.ok(certs.some((c) => c["type"] === "stakeKeyRegistration"));
    assert.ok(certs.some((c) => c["type"] === "stakeDelegation"));
  });

  it("stakeDelegation certificate references the given poolId", () => {
    const script = buildStakeDelegationScript(POOL);
    const run = script["run"] as Record<string, unknown>;
    const build = run["build"] as Record<string, unknown>;
    const tx = build["tx"] as Record<string, unknown>;
    const certs = tx["certificates"] as Array<Record<string, unknown>>;
    const del = certs.find((c) => c["type"] === "stakeDelegation") as Record<string, unknown>;
    assert.strictEqual(del["poolId"], POOL);
  });

  it("produces valid GCScript JSON", () => {
    const result = validateGcScript(JSON.stringify(buildStakeDelegationScript(POOL)));
    assert.ok(result.valid, result.issues.join(", "));
  });
});
