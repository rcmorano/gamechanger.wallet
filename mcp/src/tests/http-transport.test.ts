/**
 * Tests for HTTP transport support
 *
 * Verifies:
 *  - parseCliArgs() parses --http, --port=N, --host=X flags correctly
 *  - Health check endpoint GET / returns expected JSON
 *  - Unknown routes return 404
 *  - POST /mcp processes an MCP initialize request and returns 200 + session ID
 *  - Multiple concurrent clients each get distinct session IDs
 *  - POST /mcp rejects requests without a valid session or initialize payload
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http, { type IncomingMessage, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Inline parseCliArgs (mirrors src/index.ts — tested independently)
// ---------------------------------------------------------------------------

interface CliArgs {
  http: boolean;
  port: number;
  host: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const isHttp = args.includes("--http");
  const portArg = args.find((a) => a.startsWith("--port="));
  const hostArg = args.find((a) => a.startsWith("--host="));
  const port = portArg ? parseInt(portArg.split("=")[1], 10) : 3000;
  const host = hostArg ? hostArg.split("=")[1] : "127.0.0.1";
  return { http: isHttp, port, host };
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

describe("parseCliArgs", () => {
  it("defaults to stdio mode on port 3000 / 127.0.0.1", () => {
    const result = parseCliArgs(["node", "index.js"]);
    assert.equal(result.http, false);
    assert.equal(result.port, 3000);
    assert.equal(result.host, "127.0.0.1");
  });

  it("--http enables HTTP mode", () => {
    const result = parseCliArgs(["node", "index.js", "--http"]);
    assert.equal(result.http, true);
  });

  it("--port= overrides the default port", () => {
    const result = parseCliArgs(["node", "index.js", "--http", "--port=8080"]);
    assert.equal(result.port, 8080);
  });

  it("--host= overrides the default host", () => {
    const result = parseCliArgs(["node", "index.js", "--http", "--host=0.0.0.0"]);
    assert.equal(result.host, "0.0.0.0");
  });

  it("all flags together", () => {
    const result = parseCliArgs([
      "node",
      "index.js",
      "--http",
      "--port=9000",
      "--host=::1",
    ]);
    assert.equal(result.http, true);
    assert.equal(result.port, 9000);
    assert.equal(result.host, "::1");
  });

  it("--http absent when only --port is given", () => {
    const result = parseCliArgs(["node", "index.js", "--port=4000"]);
    assert.equal(result.http, false);
    assert.equal(result.port, 4000);
  });
});

// ---------------------------------------------------------------------------
// HTTP server factory — mirrors the multi-session pattern in src/index.ts
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function startTestServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const server: Server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({ name: "gamechanger-wallet-mcp", endpoint: "/mcp" })
      );
      return;
    }

    if (url.pathname === "/mcp") {
      try {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        const existing = sessionId ? transports.get(sessionId) : undefined;

        if (existing) {
          await existing.handleRequest(req, res);
          return;
        }

        const body = await readBody(req);

        if (!isInitializeRequest(body)) {
          res.writeHead(400, { "Content-Type": "application/json" }).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32000, message: "Bad Request: No valid session ID" },
              id: null,
            })
          );
          return;
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) transports.delete(sid);
        };

        const mcpServer = new McpServer({ name: "test-gamechanger", version: "0.0.1" });
        mcpServer.tool(
          "ping",
          "Returns pong",
          { message: z.string().optional() },
          async () => ({ content: [{ type: "text" as const, text: "pong" }] })
        );
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500).end(JSON.stringify({ error: String(err) }));
        }
      }
      return;
    }

    res.writeHead(404).end("Not found");
  });

  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const close = () =>
        new Promise<void>((res, rej) =>
          server.close((err) => (err ? rej(err) : res()))
        );
      resolve({ port, close });
    });
  });
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function httpGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET" },
      (res: IncomingMessage) => {
        let body = "";
        res.on("data", (c: Buffer) => (body += c.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function httpPost(
  port: number,
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const raw = JSON.stringify(body);
    const options = {
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(raw),
        Accept: "application/json, text/event-stream",
        ...extraHeaders,
      },
    };
    const req = http.request(options, (res: IncomingMessage) => {
      let data = "";
      res.on("data", (c: Buffer) => (data += c.toString()));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[] | undefined>,
          body: data,
        })
      );
    });
    req.on("error", reject);
    req.write(raw);
    req.end();
  });
}

const INIT_REQUEST = (id: number, clientName: string) => ({
  jsonrpc: "2.0",
  id,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    clientInfo: { name: clientName, version: "0.0.1" },
    capabilities: {},
  },
});

// ---------------------------------------------------------------------------
// HTTP integration — health check and routing
// ---------------------------------------------------------------------------

describe("HTTP transport — health check and routing", () => {
  let port = 0;
  let closeServer: () => Promise<void>;

  before(async () => {
    const s = await startTestServer();
    port = s.port;
    closeServer = s.close;
  });

  after(async () => {
    await closeServer?.();
  });

  it("binds to an available port", () => {
    assert.ok(port > 0, `Expected a positive port number, got ${port}`);
  });

  it("GET / returns JSON with name and endpoint", async () => {
    const { status, body } = await httpGet(port, "/");
    assert.equal(status, 200);
    const json = JSON.parse(body) as Record<string, string>;
    assert.equal(json["name"], "gamechanger-wallet-mcp");
    assert.ok(json["endpoint"], "Should have an endpoint field");
  });

  it("GET /unknown-path returns 404", async () => {
    const { status } = await httpGet(port, "/unknown-path");
    assert.equal(status, 404);
  });

  it("POST /mcp without session ID and non-initialize body returns 400", async () => {
    const { status } = await httpPost(port, "/mcp", { not: "valid" });
    assert.equal(status, 400, "Should reject non-initialize request without session ID");
  });
});

// ---------------------------------------------------------------------------
// HTTP integration — MCP protocol handshake
// ---------------------------------------------------------------------------

describe("HTTP transport — MCP initialize handshake", () => {
  let port = 0;
  let closeServer: () => Promise<void>;

  before(async () => {
    const s = await startTestServer();
    port = s.port;
    closeServer = s.close;
  });

  after(async () => {
    await closeServer?.();
  });

  it("POST /mcp initialize returns HTTP 200", async () => {
    const { status } = await httpPost(port, "/mcp", INIT_REQUEST(1, "client-1"));
    assert.equal(status, 200, "Initialize should return HTTP 200");
  });

  it("POST /mcp initialize response includes mcp-session-id header", async () => {
    const { headers } = await httpPost(port, "/mcp", INIT_REQUEST(2, "client-2"));
    const sessionId = headers["mcp-session-id"];
    assert.ok(
      typeof sessionId === "string" && sessionId.length > 0,
      "Initialize response should include a non-empty mcp-session-id header"
    );
  });

  it("POST /mcp with invalid JSON-RPC returns a non-200 status", async () => {
    const { status } = await httpPost(port, "/mcp", { not: "valid-jsonrpc" });
    assert.notEqual(status, 200, "Invalid JSON-RPC payload should not return HTTP 200");
  });

  it("two concurrent sessions each get distinct session IDs", async () => {
    const [r1, r2] = await Promise.all([
      httpPost(port, "/mcp", INIT_REQUEST(3, "client-a")),
      httpPost(port, "/mcp", INIT_REQUEST(4, "client-b")),
    ]);

    const sid1 = r1.headers["mcp-session-id"];
    const sid2 = r2.headers["mcp-session-id"];
    assert.ok(typeof sid1 === "string" && sid1.length > 0, "Session 1 should have an ID");
    assert.ok(typeof sid2 === "string" && sid2.length > 0, "Session 2 should have an ID");
    assert.notEqual(sid1, sid2, "Concurrent sessions should have distinct session IDs");
  });

  it("subsequent requests with session ID are accepted", async () => {
    // Initialize a new session
    const initResp = await httpPost(port, "/mcp", INIT_REQUEST(5, "client-c"));
    const sessionId = initResp.headers["mcp-session-id"] as string;
    assert.ok(sessionId, "Should receive session ID");

    // Send initialized notification (no response expected from server)
    const notifBody = {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    };
    const notifResp = await httpPost(port, "/mcp", notifBody, {
      "mcp-session-id": sessionId,
    });
    // Notifications may return 202 Accepted or 200 OK
    assert.ok(
      notifResp.status === 200 || notifResp.status === 202,
      `Expected 200 or 202 for notification, got ${notifResp.status}`
    );
  });
});
