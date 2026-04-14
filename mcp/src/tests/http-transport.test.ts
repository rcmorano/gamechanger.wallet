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
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
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
  const streamableTransports = new Map<string, StreamableHTTPServerTransport>();
  const sseTransports = new Map<string, SSEServerTransport>();

  const server: Server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          name: "gamechanger-wallet-mcp",
          transports: { streamableHttp: "/mcp", sse: "/sse" },
        })
      );
      return;
    }

    if (url.pathname === "/mcp") {
      try {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        const existing = sessionId ? streamableTransports.get(sessionId) : undefined;

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
            streamableTransports.set(sid, transport);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) streamableTransports.delete(sid);
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

    // SSE endpoint (legacy clients)
    if (url.pathname === "/sse" && req.method === "GET") {
      try {
        const transport = new SSEServerTransport("/message", res);

        transport.onclose = () => {
          sseTransports.delete(transport.sessionId);
        };

        sseTransports.set(transport.sessionId, transport);

        const mcpServer = new McpServer({ name: "test-gamechanger", version: "0.0.1" });
        mcpServer.tool(
          "ping",
          "Returns pong",
          { message: z.string().optional() },
          async () => ({ content: [{ type: "text" as const, text: "pong" }] })
        );
        await mcpServer.connect(transport);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500).end(String(err));
        }
      }
      return;
    }

    // SSE message ingestion
    if (url.pathname === "/message" && req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId") ?? "";
      const transport = sseTransports.get(sessionId);
      if (!transport) {
        res.writeHead(404).end(JSON.stringify({ error: `No SSE session: ${sessionId}` }));
        return;
      }
      try {
        await transport.handlePostMessage(req, res);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500).end(String(err));
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

  it("GET / returns JSON with name and transport endpoints", async () => {
    const { status, body } = await httpGet(port, "/");
    assert.equal(status, 200);
    const json = JSON.parse(body) as Record<string, unknown>;
    assert.equal(json["name"], "gamechanger-wallet-mcp");
    const transports = json["transports"] as Record<string, string> | undefined;
    assert.ok(transports, "Should have a transports field");
    assert.ok(transports["streamableHttp"], "Should list the streamableHttp endpoint");
    assert.ok(transports["sse"], "Should list the SSE endpoint");
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

// ---------------------------------------------------------------------------
// SSE transport integration tests (legacy clients like Claude Desktop)
// ---------------------------------------------------------------------------

/**
 * Open an SSE connection to the test server.
 * Returns:
 *  - `sessionId`  — extracted from the first "endpoint" event
 *  - `events`     — array of raw "data:" lines received so far
 *  - `close()`    — destroys the underlying socket
 */
function openSseConnection(port: number): Promise<{
  sessionId: string;
  messageEndpoint: string;
  events: string[];
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: "/sse", method: "GET" },
      (res: IncomingMessage) => {
        if (res.statusCode !== 200) {
          reject(new Error(`GET /sse returned ${res.statusCode}`));
          return;
        }
        const ct = res.headers["content-type"] ?? "";
        if (!ct.includes("text/event-stream")) {
          reject(
            new Error(`Expected content-type text/event-stream, got: ${ct}`)
          );
          return;
        }

        const events: string[] = [];
        let resolved = false;
        let buf = "";

        res.on("data", (chunk: Buffer) => {
          buf += chunk.toString();
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data:")) {
              const value = line.slice(5).trim();
              events.push(value);

              if (!resolved && value.startsWith("/message")) {
                resolved = true;
                const u = new URL(value, "http://127.0.0.1");
                const sessionId = u.searchParams.get("sessionId") ?? "";
                resolve({
                  sessionId,
                  messageEndpoint: value,
                  events,
                  close: () => res.destroy(),
                });
              }
            }
          }
        });

        res.on("error", reject);
      }
    );

    req.on("error", reject);
    req.end();
  });
}

describe("HTTP transport — SSE (legacy) endpoint", () => {
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

  it("GET /sse responds with Content-Type: text/event-stream", async () => {
    const { close } = await openSseConnection(port);
    close();
  });

  it("GET /sse endpoint event contains a /message URL with a sessionId", async () => {
    const { sessionId, messageEndpoint, close } = await openSseConnection(port);
    assert.ok(
      typeof sessionId === "string" && sessionId.length > 0,
      "SSE endpoint event should carry a sessionId"
    );
    assert.ok(
      messageEndpoint.startsWith("/message"),
      `messageEndpoint should start with /message, got: ${messageEndpoint}`
    );
    close();
  });

  it("POST /message with valid sessionId returns 202 Accepted", async () => {
    const { sessionId, close } = await openSseConnection(port);

    const initBody = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        clientInfo: { name: "sse-test-client", version: "0.0.1" },
        capabilities: {},
      },
    };

    const { status } = await httpPost(
      port,
      `/message?sessionId=${sessionId}`,
      initBody
    );
    assert.equal(status, 202, "SSE POST /message should return 202 Accepted");

    close();
  });

  it("POST /message with unknown sessionId returns 404", async () => {
    const { status } = await httpPost(
      port,
      `/message?sessionId=nonexistent-session-id`,
      { jsonrpc: "2.0", id: 1, method: "ping", params: {} }
    );
    assert.equal(status, 404, "Unknown sessionId should return 404");
  });

  it("two concurrent SSE connections each get distinct session IDs", async () => {
    const [c1, c2] = await Promise.all([
      openSseConnection(port),
      openSseConnection(port),
    ]);

    assert.ok(c1.sessionId.length > 0, "Connection 1 should have a sessionId");
    assert.ok(c2.sessionId.length > 0, "Connection 2 should have a sessionId");
    assert.notEqual(
      c1.sessionId,
      c2.sessionId,
      "Concurrent SSE connections should have distinct session IDs"
    );

    c1.close();
    c2.close();
  });
});
