/**
 * GameChanger Wallet MCP Server — Per-Example Tool Registrar
 *
 * Registers one MCP tool per built-in GCScript example.  Each tool:
 *  - Is named  example_<slug>  (snake_case derived from the example name)
 *  - Accepts a `network` parameter (mainnet | preprod)
 *  - Accepts any example-specific parameters defined in EXAMPLE_PARAM_SCHEMAS
 *  - Returns { name, title, description, category, gcscript, url, network }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadExamples } from "./examples.js";
import { encodeGcScriptUrl } from "./lib.js";
import {
  applyExampleParams,
  slugifyExampleName,
  EXAMPLE_PARAM_SCHEMAS,
  type ExampleParamDef,
} from "./example-params.js";

// ---------------------------------------------------------------------------
// Zod schema helpers
// ---------------------------------------------------------------------------

/** Build a Zod object schema from an example's parameter definitions. */
function buildZodSchema(
  defs: ExampleParamDef[]
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {
    network: z
      .enum(["mainnet", "preprod"])
      .default("mainnet")
      .describe("Cardano network. Defaults to mainnet."),
  };

  for (const def of defs) {
    let field: z.ZodTypeAny;

    if (def.type === "integer") {
      field = z
        .number()
        .int()
        .positive()
        .describe(def.description);
    } else {
      field = z.string().min(1).describe(def.description);
    }

    if (!def.required) {
      field = field.optional();
    }

    shape[def.name] = field;
  }

  return shape;
}

// ---------------------------------------------------------------------------
// Main registration function
// ---------------------------------------------------------------------------

/**
 * Loads all 93 built-in examples and registers one MCP tool for each.
 *
 * Tool names follow the pattern  example_<slug>  where <slug> is derived from
 * the example's filename (without .gcscript).
 *
 * Call this once during server startup, after the McpServer is created but
 * before it starts listening.
 */
export async function registerExampleTools(server: McpServer): Promise<void> {
  const examples = await loadExamples();

  for (const example of examples) {
    const slug = slugifyExampleName(example.name);
    const toolName = `example_${slug}`;

    const paramDefs: ExampleParamDef[] =
      EXAMPLE_PARAM_SCHEMAS[example.name] ?? [];

    const zodShape = buildZodSchema(paramDefs);

    // Build a concise description for the tool
    const toolDescription = [
      example.title,
      example.description
        ? example.description.slice(0, 200) +
          (example.description.length > 200 ? "…" : "")
        : "",
    ]
      .filter(Boolean)
      .join(" — ");

    server.tool(
      toolName,
      toolDescription,
      zodShape,
      async (params: Record<string, unknown>) => {
        try {
          const network = (params["network"] as "mainnet" | "preprod") ?? "mainnet";

          // Apply user-supplied parameters to the raw GCScript
          const modifiedScript = applyExampleParams(
            example.gcscript,
            paramDefs,
            params as Record<string, string | number | undefined>
          );

          const url = encodeGcScriptUrl(modifiedScript, network);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    name: example.name,
                    title: example.title,
                    description: example.description,
                    category: example.category,
                    gcscript: modifiedScript,
                    url,
                    network,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );
  }
}

// ---------------------------------------------------------------------------
// Re-export helpers for consumers (e.g. tests)
// ---------------------------------------------------------------------------

export { slugifyExampleName, applyExampleParams, EXAMPLE_PARAM_SCHEMAS };
