/**
 * GameChanger Wallet MCP Server — Examples Loader
 *
 * Reads and indexes the 93 GCScript example files from the examples/ directory
 * at the root of the repository. Each example is parsed and enriched with a
 * derived category so agents can browse, filter, and retrieve them.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExampleCategory =
  | "payments"
  | "minting"
  | "multisig"
  | "governance"
  | "workspaces"
  | "smart-contracts"
  | "gcfs"
  | "wallet"
  | "keys"
  | "utility";

export interface GCExample {
  /** Filename without the .gcscript extension */
  name: string;
  /** title from the GCScript JSON, or the filename if absent */
  title: string;
  /** description from the GCScript JSON, or empty string */
  description: string;
  /** Derived category */
  category: ExampleCategory;
  /** The raw parsed GCScript object */
  gcscript: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Category inference
// ---------------------------------------------------------------------------

const CATEGORY_RULES: Array<[RegExp, ExampleCategory]> = [
  [/governance|drep|vote\s*del|abstain|no\s*confidence/i, "governance"],
  [/gcfs|dandelion|registration|on-?chain\s*file/i, "gcfs"],
  [/multisig|multi.?sign|kobayashi|roundtable|unimatrix|shared\s*treasury/i, "multisig"],
  [/plutus|smart\s*contract|helios|lock\s*and\s*redeem|deploy.*(script|plutus)/i, "smart-contracts"],
  [/mint|nft|native\s*asset|burn|token\s*mint/i, "minting"],
  [/stake|delegation|withdrawal/i, "payments"],
  [/workspace|addresses\s*in|keys\s*in|official\s*workspace|wallet\s*config|load.*config|save.*config/i, "workspaces"],
  [/key\s*deriv|derivation\s*path|derivation\s*format|child\s*key/i, "keys"],
  [/gift\s*wallet|generate.*wallet|burner|wallet\s*type|wallet\s*deriv/i, "wallet"],
  [/macro|arithmetic|cryptograph|string\s*manip|isl|arguments.*isl|code\s*valid|subroutine/i, "utility"],
  [/pay|send|coin|ada|output|transaction\s*time|transaction\s*pipeline|utxo|ttl/i, "payments"],
];

function inferCategory(name: string, description: string): ExampleCategory {
  const haystack = `${name} ${description}`;
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(haystack)) return category;
  }
  return "utility";
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

let _cache: GCExample[] | null = null;

/**
 * Resolve the examples directory relative to this source file so it works
 * regardless of whether we are running from src/ (dev/test) or dist/ (prod).
 */
function resolveExamplesDir(): string {
  // import.meta.url points to this file: mcp/src/examples.ts (or mcp/dist/examples.js)
  const thisFile = fileURLToPath(import.meta.url);
  // mcp/src/ or mcp/dist/ → mcp/ → repo root → examples/
  return join(dirname(thisFile), "..", "..", "examples");
}

/**
 * Load and cache all examples. Subsequent calls return the cached list.
 */
export async function loadExamples(): Promise<GCExample[]> {
  if (_cache) return _cache;

  const examplesDir = resolveExamplesDir();
  const entries = await readdir(examplesDir);
  const gcscriptFiles = entries.filter((f: string) => f.endsWith(".gcscript"));

  const examples: GCExample[] = [];

  for (const filename of gcscriptFiles) {
    const name = filename.replace(/\.gcscript$/, "");
    try {
      const raw = await readFile(join(examplesDir, filename), "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const title =
        typeof parsed["title"] === "string" ? parsed["title"] : name;
      const description =
        typeof parsed["description"] === "string" ? parsed["description"] : "";
      const category = inferCategory(name, description);
      examples.push({ name, title, description, category, gcscript: parsed });
    } catch {
      // Skip files that fail to parse — do not crash the entire load
    }
  }

  // Sort alphabetically by name for a stable, predictable order
  examples.sort((a, b) => a.name.localeCompare(b.name));

  _cache = examples;
  return _cache;
}

/** Clear the in-memory cache (useful for tests). */
export function clearExamplesCache(): void {
  _cache = null;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Return all examples, optionally filtered by category.
 */
export async function listExamples(
  category?: ExampleCategory
): Promise<Array<Pick<GCExample, "name" | "title" | "description" | "category">>> {
  const all = await loadExamples();
  const filtered = category ? all.filter((e) => e.category === category) : all;
  return filtered.map(({ name, title, description, category: cat }) => ({
    name,
    title,
    description,
    category: cat,
  }));
}

/**
 * Find a single example by exact name (case-insensitive).
 */
export async function getExampleByName(
  name: string
): Promise<GCExample | undefined> {
  const all = await loadExamples();
  return all.find((e) => e.name.toLowerCase() === name.toLowerCase());
}

/**
 * Search examples whose name or description contains all given keywords
 * (case-insensitive, AND logic).
 */
export async function searchExamples(
  keywords: string[]
): Promise<Array<Pick<GCExample, "name" | "title" | "description" | "category">>> {
  if (keywords.length === 0) return listExamples();
  const all = await loadExamples();
  const lower = keywords.map((k) => k.toLowerCase());
  return all
    .filter((e) => {
      const haystack = `${e.name} ${e.title} ${e.description}`.toLowerCase();
      return lower.every((k) => haystack.includes(k));
    })
    .map(({ name, title, description, category }) => ({
      name,
      title,
      description,
      category,
    }));
}

export const ALL_CATEGORIES: ExampleCategory[] = [
  "payments",
  "minting",
  "multisig",
  "governance",
  "workspaces",
  "smart-contracts",
  "gcfs",
  "wallet",
  "keys",
  "utility",
];
