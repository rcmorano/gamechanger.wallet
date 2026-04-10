/**
 * Tests for example-params.ts and example-tools.ts
 *
 * Covers:
 *  - slugifyExampleName() for various edge cases
 *  - applyExampleParams() for each apply mode (str, num, args)
 *  - Real example scenarios using actual GCScript files
 *  - EXAMPLE_PARAM_SCHEMAS entries are consistent and well-formed
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import {
  slugifyExampleName,
  applyExampleParams,
  EXAMPLE_PARAM_SCHEMAS,
  type ExampleParamDef,
} from "../example-params.js";

import { loadExamples, clearExamplesCache } from "../examples.js";

// ---------------------------------------------------------------------------
// slugifyExampleName
// ---------------------------------------------------------------------------

describe("slugifyExampleName", () => {
  it("lowercases plain names", () => {
    assert.equal(slugifyExampleName("NFT Minting Demo"), "nft_minting_demo");
  });

  it("strips emoji from the start", () => {
    assert.equal(slugifyExampleName("🚀 Pay me 1 ADA"), "pay_me_1_ada");
  });

  it("handles dashes and extra spaces", () => {
    assert.equal(
      slugifyExampleName("Governance - Vote Delegation - DRep"),
      "governance_vote_delegation_drep"
    );
  });

  it("handles parentheses and special chars", () => {
    assert.equal(
      slugifyExampleName("Delegate Current Address to PEACE (MAINNET)"),
      "delegate_current_address_to_peace_mainnet"
    );
  });

  it("trims leading and trailing underscores", () => {
    // Ensure result uses only lowercase alphanumeric and single underscores
    const result = slugifyExampleName("  Some Example  ");
    assert.match(result, /^[a-z0-9]+(_[a-z0-9]+)*$/);
  });

  it("handles alphanumeric-only input", () => {
    assert.equal(slugifyExampleName("Simple"), "simple");
  });

  it("produces unique slugs for all 93 examples", async () => {
    clearExamplesCache();
    const examples = await loadExamples();
    const slugs = examples.map((e) => slugifyExampleName(e.name));
    const unique = new Set(slugs);
    assert.equal(unique.size, examples.length, "All slugs must be unique");
  });
});

// ---------------------------------------------------------------------------
// applyExampleParams — mode: str
// ---------------------------------------------------------------------------

describe("applyExampleParams — str mode", () => {
  const defs: ExampleParamDef[] = [
    {
      name: "toAddress",
      description: "Recipient address",
      type: "string",
      required: false,
      default: "addr1qABC",
      apply: { kind: "str", findValue: "addr1qABC" },
    },
  ];

  it("replaces the string value when userParam is provided", () => {
    const script = { type: "script", address: "addr1qABC", run: {} };
    const result = applyExampleParams(script, defs, { toAddress: "addr1qXYZ" });
    assert.equal((result as { address: string }).address, "addr1qXYZ");
  });

  it("does not modify the script when userParam is not provided", () => {
    const script = { type: "script", address: "addr1qABC" };
    const result = applyExampleParams(script, defs, {});
    assert.equal((result as { address: string }).address, "addr1qABC");
  });

  it("does not modify the script when userParam is empty string", () => {
    const script = { type: "script", address: "addr1qABC" };
    const result = applyExampleParams(script, defs, { toAddress: "" });
    assert.equal((result as { address: string }).address, "addr1qABC");
  });

  it("does not mutate the original script", () => {
    const script = { type: "script", address: "addr1qABC" };
    const original = JSON.parse(JSON.stringify(script));
    applyExampleParams(script, defs, { toAddress: "addr1qXYZ" });
    assert.deepEqual(script, original);
  });

  it("handles values with JSON-special characters safely", () => {
    const script = { type: "script", label: "addr1qABC" };
    const result = applyExampleParams(script, defs, { toAddress: 'has"quotes' });
    assert.equal((result as { label: string }).label, 'has"quotes');
  });
});

// ---------------------------------------------------------------------------
// applyExampleParams — mode: num
// ---------------------------------------------------------------------------

describe("applyExampleParams — num mode", () => {
  const defs: ExampleParamDef[] = [
    {
      name: "walletCount",
      description: "Number of wallets",
      type: "integer",
      required: false,
      default: "10",
      apply: { kind: "num", findValue: 10, jsonKey: "amount" },
    },
  ];

  it("replaces the number value", () => {
    const script = { type: "script", run: { students: { type: "walletGenerator", amount: 10 } } };
    const result = applyExampleParams(script, defs, { walletCount: "5" });
    const students = (result as { run: { students: { amount: number } } }).run.students;
    assert.equal(students.amount, 5);
  });

  it("ignores non-numeric user input", () => {
    const script = { type: "script", run: { students: { amount: 10 } } };
    const result = applyExampleParams(script, defs, { walletCount: "not-a-number" });
    const students = (result as { run: { students: { amount: number } } }).run.students;
    assert.equal(students.amount, 10);
  });

  it("does not modify when no value provided", () => {
    const script = { type: "script", run: { students: { amount: 10 } } };
    const result = applyExampleParams(script, defs, {});
    const students = (result as { run: { students: { amount: number } } }).run.students;
    assert.equal(students.amount, 10);
  });
});

// ---------------------------------------------------------------------------
// applyExampleParams — mode: args
// ---------------------------------------------------------------------------

describe("applyExampleParams — args mode", () => {
  const defs: ExampleParamDef[] = [
    {
      name: "amount",
      description: "Swap amount",
      type: "string",
      required: false,
      default: "50000000",
      apply: { kind: "args", argsKey: "amount" },
    },
  ];

  it("sets the args key when value is provided", () => {
    const script: Record<string, unknown> = { type: "script", args: { amount: "50000000" } };
    const result = applyExampleParams(script, defs, { amount: "10000000" });
    assert.equal((result.args as Record<string, string>)["amount"], "10000000");
  });

  it("creates args block if script has none", () => {
    const script: Record<string, unknown> = { type: "script" };
    const result = applyExampleParams(script, defs, { amount: "10000000" });
    assert.ok(result.args, "args block should be created");
    assert.equal((result.args as Record<string, string>)["amount"], "10000000");
  });

  it("does not create args block when no value is provided", () => {
    const script: Record<string, unknown> = { type: "script" };
    const result = applyExampleParams(script, defs, {});
    assert.equal(result.args, undefined);
  });

  it("preserves other args keys when setting one", () => {
    const script: Record<string, unknown> = {
      type: "script",
      args: { amount: "50000000", kind: "DRep" },
    };
    const result = applyExampleParams(script, defs, { amount: "1000000" });
    const args = result.args as Record<string, string>;
    assert.equal(args["amount"], "1000000");
    assert.equal(args["kind"], "DRep");
  });
});

// ---------------------------------------------------------------------------
// Real example scenarios using actual GCScript files
// ---------------------------------------------------------------------------

describe("Real example scenarios", () => {
  let examples: Awaited<ReturnType<typeof loadExamples>>;

  before(async () => {
    clearExamplesCache();
    examples = await loadExamples();
  });

  function findExample(name: string) {
    const ex = examples.find((e) => e.name === name);
    assert.ok(ex, `Example "${name}" should exist`);
    return ex!;
  }

  it("🚀 Pay me 1 ADA — replaces toAddress", () => {
    const ex = findExample("🚀 Pay me 1 ADA");
    const defs = EXAMPLE_PARAM_SCHEMAS["🚀 Pay me 1 ADA"]!;
    const newAddr = "addr1qy0000000000000000000000000000000000000000000000000000000000000000000000";
    const result = applyExampleParams(ex.gcscript, defs, { toAddress: newAddr });
    const json = JSON.stringify(result);
    assert.ok(json.includes(newAddr), "New address should be in result");
    assert.ok(
      !json.includes("addr1q9faamq9k6557"),
      "Original demo address should be replaced"
    );
  });

  it("🚀 Pay me 1 ADA — replaces lovelace amount", () => {
    const ex = findExample("🚀 Pay me 1 ADA");
    const defs = EXAMPLE_PARAM_SCHEMAS["🚀 Pay me 1 ADA"]!;
    const result = applyExampleParams(ex.gcscript, defs, { lovelace: "2000000" });
    const json = JSON.stringify(result);
    assert.ok(json.includes('"2000000"'), "New amount should be present");
    assert.ok(!json.includes('"1000000"'), "Original 1000000 should be replaced");
  });

  it("🚀 Pay me 1 ADA — no params yields original script", () => {
    const ex = findExample("🚀 Pay me 1 ADA");
    const defs = EXAMPLE_PARAM_SCHEMAS["🚀 Pay me 1 ADA"]!;
    const result = applyExampleParams(ex.gcscript, defs, {});
    assert.deepEqual(result, ex.gcscript);
  });

  it("NFT Minting Demo — replaces assetName", () => {
    const ex = findExample("NFT Minting Demo");
    const defs = EXAMPLE_PARAM_SCHEMAS["NFT Minting Demo"]!;
    const result = applyExampleParams(ex.gcscript, defs, { assetName: "MyNFT" });
    const json = JSON.stringify(result);
    assert.ok(json.includes('"MyNFT"'), "New asset name should be in result");
    assert.ok(!json.includes('"GameChangerNFT"'), "Original asset name should be replaced");
  });

  it("NFT Minting Demo — replaces toAddress and quantity together", () => {
    const ex = findExample("NFT Minting Demo");
    const defs = EXAMPLE_PARAM_SCHEMAS["NFT Minting Demo"]!;
    const newAddr = "addr1qy111111111111111111111111111111111111111111111111111111111111111111111111";
    const result = applyExampleParams(ex.gcscript, defs, {
      toAddress: newAddr,
      assetName: "SuperNFT",
      quantity: "500",
    });
    const json = JSON.stringify(result);
    assert.ok(json.includes(newAddr));
    assert.ok(json.includes('"SuperNFT"'));
    assert.ok(json.includes('"500"'));
  });

  it("Stake Delegation — replaces poolKeyHashHex", () => {
    const ex = findExample("Stake Delegation");
    const defs = EXAMPLE_PARAM_SCHEMAS["Stake Delegation"]!;
    const newPool = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";
    const result = applyExampleParams(ex.gcscript, defs, { poolKeyHashHex: newPool });
    const json = JSON.stringify(result);
    assert.ok(json.includes(newPool));
    assert.ok(
      !json.includes("9eb76bb591d689dd06304c77c0df7871df76e768577e26af10d32b0c"),
      "Original pool hash should be replaced"
    );
  });

  it("Smart Handles — sets amount in args block", () => {
    const ex = findExample("Smart Handles - Swap ADA to MIN on Minswap");
    const defs = EXAMPLE_PARAM_SCHEMAS["Smart Handles - Swap ADA to MIN on Minswap"]!;
    const result = applyExampleParams(ex.gcscript, defs, { amount: "100000000" });
    const args = (result as { args: Record<string, string> }).args;
    assert.equal(args["amount"], "100000000");
  });

  it("Governance - Vote Delegation - DRep — injects dRepScriptHashHex", () => {
    const ex = findExample("Governance - Vote Delegation - DRep");
    const defs = EXAMPLE_PARAM_SCHEMAS["Governance - Vote Delegation - DRep"]!;
    const newHash = "aabbcc1234567890aabbcc1234567890aabbcc1234567890aabbcc12";
    const result = applyExampleParams(ex.gcscript, defs, {
      dRepScriptHashHex: newHash,
    });
    const args = (result as { args: Record<string, string> }).args;
    assert.equal(args["scriptHashHex"], newHash);
  });

  it("Generate 10 Gift Wallets — replaces walletCount", () => {
    const ex = findExample("Generate 10 Gift Wallets");
    const defs = EXAMPLE_PARAM_SCHEMAS["Generate 10 Gift Wallets"]!;
    const result = applyExampleParams(ex.gcscript, defs, { walletCount: "20" });
    const students = (result as { run: { students: { amount: number } } }).run.students;
    assert.equal(students.amount, 20);
  });

  it("Generate 10 Gift Wallets — replaces namePattern", () => {
    const ex = findExample("Generate 10 Gift Wallets");
    const defs = EXAMPLE_PARAM_SCHEMAS["Generate 10 Gift Wallets"]!;
    const result = applyExampleParams(ex.gcscript, defs, {
      namePattern: "Participant {index}",
    });
    const json = JSON.stringify(result);
    assert.ok(json.includes("Participant {index}"));
    assert.ok(!json.includes("Student {index}"));
  });

  it("Address Impersonator — injects address and name", () => {
    const ex = findExample("Address Impersonator");
    const defs = EXAMPLE_PARAM_SCHEMAS["Address Impersonator"]!;
    const result = applyExampleParams(ex.gcscript, defs, {
      address: "addr1qy_my_address",
      name: "CustomWallet",
    });
    const args = (result as { args: Record<string, string> }).args;
    assert.equal(args["address"], "addr1qy_my_address");
    assert.equal(args["name"], "CustomWallet");
  });

  it("Transaction Pipeline — replaces all three recipient addresses", () => {
    const ex = findExample("Transaction Pipeline");
    const defs = EXAMPLE_PARAM_SCHEMAS["Transaction Pipeline"]!;
    const result = applyExampleParams(ex.gcscript, defs, {
      recipient1Address: "addr1qy_r1_111111111111111111111111111111111111111111111111111",
      recipient2Address: "addr1qy_r2_222222222222222222222222222222222222222222222222222",
      recipient3Address: "addr1qy_r3_333333333333333333333333333333333333333333333333333",
    });
    const json = JSON.stringify(result);
    assert.ok(json.includes("addr1qy_r1_1"));
    assert.ok(json.includes("addr1qy_r2_2"));
    assert.ok(json.includes("addr1qy_r3_3"));
  });

  it("Shared Treasury - 3 of 4 signers - using addresses — replaces member addresses", () => {
    const ex = findExample("Shared Treasury - 3 of 4 signers - using addresses");
    const defs = EXAMPLE_PARAM_SCHEMAS["Shared Treasury - 3 of 4 signers - using addresses"]!;
    const result = applyExampleParams(ex.gcscript, defs, {
      member0Address: "addr1qy_m0_aaa",
      member1Address: "addr1qy_m1_bbb",
    });
    const json = JSON.stringify(result);
    assert.ok(json.includes("addr1qy_m0_aaa"));
    assert.ok(json.includes("addr1qy_m1_bbb"));
  });

  it("Helios One-Shot Mint — injects assetName and quantity", () => {
    const ex = findExample("Helios One-Shot Mint");
    const defs = EXAMPLE_PARAM_SCHEMAS["Helios One-Shot Mint"]!;
    const result = applyExampleParams(ex.gcscript, defs, {
      assetName: "MyCoin",
      quantity: "42",
    });
    const args = (result as { args: Record<string, string> }).args;
    assert.equal(args["asset-name"], "MyCoin");
    assert.equal(args["quantity"], "42");
  });

  it("Write registration to join Dandelion Network — injects all args", () => {
    const ex = findExample("Write registration to join Dandelion Network (GCFS)");
    const defs = EXAMPLE_PARAM_SCHEMAS["Write registration to join Dandelion Network (GCFS)"]!;
    const result = applyExampleParams(ex.gcscript, defs, {
      name: "My Node",
      description: "My description",
      ticker: "MYN",
      nodeUrl: "https://my-node.example.com/",
    });
    const args = (result as { args: Record<string, string> }).args;
    assert.equal(args["name"], "My Node");
    assert.equal(args["ticker"], "MYN");
    assert.equal(args["node-url"], "https://my-node.example.com/");
  });
});

// ---------------------------------------------------------------------------
// EXAMPLE_PARAM_SCHEMAS integrity checks
// ---------------------------------------------------------------------------

describe("EXAMPLE_PARAM_SCHEMAS integrity", () => {
  it("every schema key corresponds to a real example name", async () => {
    clearExamplesCache();
    const examples = await loadExamples();
    const exampleNames = new Set(examples.map((e) => e.name));

    for (const key of Object.keys(EXAMPLE_PARAM_SCHEMAS)) {
      assert.ok(
        exampleNames.has(key),
        `Schema key "${key}" does not match any loaded example`
      );
    }
  });

  it("every param def has a non-empty name and description", () => {
    for (const [exName, defs] of Object.entries(EXAMPLE_PARAM_SCHEMAS)) {
      for (const def of defs) {
        assert.ok(def.name.length > 0, `Empty name in schema for "${exName}"`);
        assert.ok(
          def.description.length > 0,
          `Empty description for param "${def.name}" in "${exName}"`
        );
      }
    }
  });

  it("str apply mode has a non-empty findValue", () => {
    for (const [exName, defs] of Object.entries(EXAMPLE_PARAM_SCHEMAS)) {
      for (const def of defs) {
        if (def.apply.kind === "str") {
          assert.ok(
            def.apply.findValue.length > 0,
            `Empty findValue for "${def.name}" in "${exName}"`
          );
        }
      }
    }
  });

  it("args apply mode has a non-empty argsKey", () => {
    for (const [exName, defs] of Object.entries(EXAMPLE_PARAM_SCHEMAS)) {
      for (const def of defs) {
        if (def.apply.kind === "args") {
          assert.ok(
            def.apply.argsKey.length > 0,
            `Empty argsKey for "${def.name}" in "${exName}"`
          );
        }
      }
    }
  });

  it("num apply mode has valid findValue and jsonKey", () => {
    for (const [exName, defs] of Object.entries(EXAMPLE_PARAM_SCHEMAS)) {
      for (const def of defs) {
        if (def.apply.kind === "num") {
          assert.ok(
            typeof def.apply.findValue === "number" && def.apply.findValue > 0,
            `Invalid findValue for num param "${def.name}" in "${exName}"`
          );
          assert.ok(
            def.apply.jsonKey.length > 0,
            `Empty jsonKey for num param "${def.name}" in "${exName}"`
          );
        }
      }
    }
  });

  it("all param defaults are non-empty strings when present", () => {
    for (const [exName, defs] of Object.entries(EXAMPLE_PARAM_SCHEMAS)) {
      for (const def of defs) {
        if (def.default !== undefined) {
          assert.ok(
            def.default.length > 0,
            `Empty default value for "${def.name}" in "${exName}"`
          );
        }
      }
    }
  });
});
