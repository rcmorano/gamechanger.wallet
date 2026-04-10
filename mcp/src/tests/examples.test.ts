/**
 * Tests for mcp/src/examples.ts — examples loader and query helpers
 *
 * Uses scenarios derived directly from the examples/ directory.
 * Run with:  npm test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import {
  loadExamples,
  listExamples,
  getExampleByName,
  searchExamples,
  clearExamplesCache,
  ALL_CATEGORIES,
  type ExampleCategory,
} from "../examples.js";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

before(() => clearExamplesCache());
after(() => clearExamplesCache());

// ---------------------------------------------------------------------------
// loadExamples
// ---------------------------------------------------------------------------

describe("loadExamples", () => {
  it("loads at least 50 examples", async () => {
    const examples = await loadExamples();
    assert.ok(examples.length >= 50, `Expected ≥50 examples, got ${examples.length}`);
  });

  it("every example has a non-empty name", async () => {
    const examples = await loadExamples();
    for (const ex of examples) {
      assert.ok(ex.name.length > 0, `Empty name found: ${JSON.stringify(ex)}`);
    }
  });

  it("every example has a valid category", async () => {
    const examples = await loadExamples();
    for (const ex of examples) {
      assert.ok(
        (ALL_CATEGORIES as string[]).includes(ex.category),
        `Unknown category '${ex.category}' in example '${ex.name}'`
      );
    }
  });

  it("every example gcscript is a non-null object with a type property", async () => {
    const examples = await loadExamples();
    for (const ex of examples) {
      assert.ok(
        typeof ex.gcscript === "object" && ex.gcscript !== null,
        `gcscript not an object in '${ex.name}'`
      );
      assert.ok(
        "type" in ex.gcscript,
        `gcscript missing 'type' in '${ex.name}'`
      );
    }
  });

  it("examples are sorted alphabetically by name", async () => {
    const examples = await loadExamples();
    for (let i = 1; i < examples.length; i++) {
      assert.ok(
        examples[i].name.localeCompare(examples[i - 1].name) >= 0,
        `Examples not sorted: '${examples[i - 1].name}' should come before '${examples[i].name}'`
      );
    }
  });

  it("caches results (same array reference on second call)", async () => {
    const first = await loadExamples();
    const second = await loadExamples();
    assert.strictEqual(first, second, "loadExamples should return cached array");
  });
});

// ---------------------------------------------------------------------------
// Well-known examples (scenario-based)
// ---------------------------------------------------------------------------

describe("well-known example: '🚀 Pay me 1 ADA'", () => {
  it("is found by exact name", async () => {
    const ex = await getExampleByName("🚀 Pay me 1 ADA");
    assert.ok(ex, "Should find '🚀 Pay me 1 ADA'");
  });

  it("is categorised as 'payments'", async () => {
    const ex = await getExampleByName("🚀 Pay me 1 ADA");
    assert.strictEqual(ex?.category, "payments");
  });

  it("gcscript has type 'script'", async () => {
    const ex = await getExampleByName("🚀 Pay me 1 ADA");
    assert.strictEqual(ex?.gcscript["type"], "script");
  });

  it("gcscript contains a buildTx step", async () => {
    const ex = await getExampleByName("🚀 Pay me 1 ADA");
    assert.ok(ex, "Example should exist");
    const run = ex!.gcscript["run"] as Record<string, unknown>;
    const hasBuildTx = Object.values(run).some(
      (v) => (v as Record<string, unknown>)["type"] === "buildTx"
    );
    assert.ok(hasBuildTx, "Should contain a buildTx step");
  });
});

describe("well-known example: 'NFT Minting Demo'", () => {
  it("is found by exact name", async () => {
    const ex = await getExampleByName("NFT Minting Demo");
    assert.ok(ex);
  });

  it("is categorised as 'minting'", async () => {
    const ex = await getExampleByName("NFT Minting Demo");
    assert.strictEqual(ex?.category, "minting");
  });

  it("gcscript includes CIP-25 auxiliaryData with key '721'", async () => {
    const ex = await getExampleByName("NFT Minting Demo");
    assert.ok(ex);
    const run = ex!.gcscript["run"] as Record<string, unknown>;
    const build = run["build"] as Record<string, unknown>;
    const tx = build["tx"] as Record<string, unknown>;
    const aux = tx["auxiliaryData"] as Record<string, unknown> | undefined;
    assert.ok(aux, "Should have auxiliaryData");
    assert.ok("721" in aux!, "auxiliaryData should have key '721'");
  });
});

describe("well-known example: 'Minimal Coin Sending Demo'", () => {
  it("is found by exact name", async () => {
    const ex = await getExampleByName("Minimal Coin Sending Demo");
    assert.ok(ex);
  });

  it("gcscript run block is an array (minimal style)", async () => {
    const ex = await getExampleByName("Minimal Coin Sending Demo");
    assert.ok(ex);
    assert.ok(Array.isArray(ex!.gcscript["run"]), "Minimal demo uses array-style run");
  });
});

describe("well-known example: 'Stake Delegation'", () => {
  it("is found by exact name", async () => {
    const ex = await getExampleByName("Stake Delegation");
    assert.ok(ex);
  });

  it("category is 'payments' (delegation counts as a payment flow)", async () => {
    const ex = await getExampleByName("Stake Delegation");
    assert.strictEqual(ex?.category, "payments");
  });
});

describe("well-known example: 'Kobayashi Maru Multi Signing Demo'", () => {
  it("is found by exact name", async () => {
    const ex = await getExampleByName("Kobayashi Maru Multi Signing Demo");
    assert.ok(ex);
  });

  it("is categorised as 'multisig'", async () => {
    const ex = await getExampleByName("Kobayashi Maru Multi Signing Demo");
    assert.strictEqual(ex?.category, "multisig");
  });
});

describe("well-known example: 'Governance - Vote Delegation - DRep'", () => {
  it("is found by exact name", async () => {
    const ex = await getExampleByName("Governance - Vote Delegation - DRep");
    assert.ok(ex);
  });

  it("is categorised as 'governance'", async () => {
    const ex = await getExampleByName("Governance - Vote Delegation - DRep");
    assert.strictEqual(ex?.category, "governance");
  });
});

describe("well-known example: 'Run Plutus V2 Script'", () => {
  it("is found by exact name", async () => {
    const ex = await getExampleByName("Run Plutus V2 Script");
    assert.ok(ex);
  });

  it("is categorised as 'smart-contracts'", async () => {
    const ex = await getExampleByName("Run Plutus V2 Script");
    assert.strictEqual(ex?.category, "smart-contracts");
  });
});

describe("well-known example: 'Generate 10 Gift Wallets'", () => {
  it("is found by exact name", async () => {
    const ex = await getExampleByName("Generate 10 Gift Wallets");
    assert.ok(ex);
  });

  it("is categorised as 'wallet'", async () => {
    const ex = await getExampleByName("Generate 10 Gift Wallets");
    assert.strictEqual(ex?.category, "wallet");
  });
});

describe("well-known example: 'GCFS Disk'", () => {
  it("is found by exact name", async () => {
    const ex = await getExampleByName("GCFS Disk");
    assert.ok(ex);
  });

  it("is categorised as 'gcfs'", async () => {
    const ex = await getExampleByName("GCFS Disk");
    assert.strictEqual(ex?.category, "gcfs");
  });
});

describe("well-known example: 'Arithmetic Macros'", () => {
  it("is found by exact name", async () => {
    const ex = await getExampleByName("Arithmetic Macros");
    assert.ok(ex);
  });

  it("is categorised as 'utility'", async () => {
    const ex = await getExampleByName("Arithmetic Macros");
    assert.strictEqual(ex?.category, "utility");
  });
});

// ---------------------------------------------------------------------------
// listExamples
// ---------------------------------------------------------------------------

describe("listExamples", () => {
  it("returns all examples when no category filter is given", async () => {
    const all = await listExamples();
    const loaded = await loadExamples();
    assert.strictEqual(all.length, loaded.length);
  });

  it("returned items have only name, title, description, category (no gcscript)", async () => {
    const all = await listExamples();
    for (const item of all) {
      assert.ok("name" in item);
      assert.ok("title" in item);
      assert.ok("description" in item);
      assert.ok("category" in item);
      assert.ok(!("gcscript" in item), "listExamples should not expose gcscript");
    }
  });

  it("filters by 'minting' category", async () => {
    const minting = await listExamples("minting");
    assert.ok(minting.length > 0, "Expected at least one minting example");
    for (const ex of minting) {
      assert.strictEqual(ex.category, "minting");
    }
    // NFT Minting Demo must be in there
    assert.ok(minting.some((e) => e.name === "NFT Minting Demo"));
  });

  it("filters by 'governance' category", async () => {
    const gov = await listExamples("governance");
    assert.ok(gov.length > 0, "Expected at least one governance example");
    for (const ex of gov) {
      assert.strictEqual(ex.category, "governance");
    }
  });

  it("filters by 'multisig' category", async () => {
    const multi = await listExamples("multisig");
    assert.ok(multi.length > 0, "Expected at least one multisig example");
    for (const ex of multi) {
      assert.strictEqual(ex.category, "multisig");
    }
  });

  it("filters by 'payments' category", async () => {
    const payments = await listExamples("payments");
    assert.ok(payments.length > 0, "Expected at least one payments example");
    for (const ex of payments) {
      assert.strictEqual(ex.category, "payments");
    }
  });

  it("every category has at least one example", async () => {
    for (const cat of ALL_CATEGORIES) {
      const items = await listExamples(cat as ExampleCategory);
      assert.ok(
        items.length > 0,
        `Category '${cat}' has no examples — check inferCategory rules`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// getExampleByName
// ---------------------------------------------------------------------------

describe("getExampleByName", () => {
  it("returns undefined for an unknown name", async () => {
    const ex = await getExampleByName("Totally Non-Existent Example XYZ");
    assert.strictEqual(ex, undefined);
  });

  it("is case-insensitive", async () => {
    const lower = await getExampleByName("nft minting demo");
    const upper = await getExampleByName("NFT MINTING DEMO");
    const exact = await getExampleByName("NFT Minting Demo");
    assert.ok(lower, "Lower-case lookup should work");
    assert.ok(upper, "Upper-case lookup should work");
    assert.strictEqual(lower?.name, exact?.name);
    assert.strictEqual(upper?.name, exact?.name);
  });

  it("returns the full gcscript object", async () => {
    const ex = await getExampleByName("Arithmetic Macros");
    assert.ok(ex?.gcscript && typeof ex.gcscript === "object");
  });
});

// ---------------------------------------------------------------------------
// searchExamples
// ---------------------------------------------------------------------------

describe("searchExamples", () => {
  it("finds examples by a single keyword", async () => {
    const results = await searchExamples(["mint"]);
    assert.ok(results.length > 0, "Should find at least one 'mint' example");
    assert.ok(results.some((e) => e.name.toLowerCase().includes("mint") ||
      e.description.toLowerCase().includes("mint")));
  });

  it("finds examples by multiple keywords (AND logic)", async () => {
    const results = await searchExamples(["nft", "demo"]);
    assert.ok(results.length > 0, "Should find examples with both 'nft' and 'demo'");
    for (const r of results) {
      const haystack = `${r.name} ${r.title} ${r.description}`.toLowerCase();
      assert.ok(haystack.includes("nft"), "Result should contain 'nft'");
      assert.ok(haystack.includes("demo"), "Result should contain 'demo'");
    }
  });

  it("returns empty array for keywords that match nothing", async () => {
    const results = await searchExamples(["zzz_impossible_keyword_12345"]);
    assert.strictEqual(results.length, 0);
  });

  it("finds 'Stake Delegation' by keyword 'delegation'", async () => {
    const results = await searchExamples(["delegation"]);
    assert.ok(results.some((e) => e.name === "Stake Delegation"));
  });

  it("finds gift wallet examples by keyword 'gift'", async () => {
    const results = await searchExamples(["gift"]);
    assert.ok(results.length > 0, "Should find gift wallet examples");
    assert.ok(results.some((e) => e.name.toLowerCase().includes("gift")));
  });

  it("results include name, title, description, category but not gcscript", async () => {
    const results = await searchExamples(["wallet"]);
    for (const r of results) {
      assert.ok("name" in r);
      assert.ok("title" in r);
      assert.ok("description" in r);
      assert.ok("category" in r);
      assert.ok(!("gcscript" in r));
    }
  });

  it("finds 'Kobayashi Maru Multi Signing Demo' by keywords ['kobayashi', 'sign']", async () => {
    const results = await searchExamples(["kobayashi", "sign"]);
    assert.ok(
      results.some((e) => e.name === "Kobayashi Maru Multi Signing Demo"),
      "Should find Kobayashi example"
    );
  });
});
