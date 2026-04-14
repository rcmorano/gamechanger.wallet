# GameChanger Wallet MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes GameChanger Wallet capabilities as AI-agent tools.

AI agents connected to this server can:
- Generate **GCScript** dapp connections (JSON) for common Cardano operations
- Encode GCScript into **wallet-ready URLs** users can open
- **Decode** wallet response payloads back into readable JSON
- **Browse, search, and retrieve** the 93 built-in GCScript examples from the repository
- Query **documentation** and reference information

---

## Prerequisites

- Node.js 18+
- npm or pnpm

---

## Installation

```bash
cd mcp
npm install
npm run build
```

---

## Running the server

### stdio mode (standard MCP transport)

```bash
npm start
# or during development:
npm run dev
```

The server communicates over **stdin/stdout** using the MCP protocol.

---

## Connecting to an AI agent / host

### Claude Desktop (example)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gamechanger-wallet": {
      "command": "node",
      "args": ["/absolute/path/to/gamechanger.wallet/mcp/dist/index.js"]
    }
  }
}
```

Or using `npx tsx` for development:

```json
{
  "mcpServers": {
    "gamechanger-wallet": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/gamechanger.wallet/mcp/src/index.ts"]
    }
  }
}
```

### VS Code Copilot Agent (`.github/copilot-instructions.md` or settings)

Point to the server binary in your MCP configuration per the VS Code MCP documentation.

---

## Available Tools

| Tool | Description |
|---|---|
| `encode_gcscript_url` | Encode any GCScript JSON into a wallet URL |
| `decode_wallet_response` | Decode packed wallet response back to JSON |
| `generate_send_ada` | Generate a send-ADA GCScript + URL |
| `generate_multi_send` | Generate a multi-recipient ADA payment GCScript + URL |
| `generate_get_wallet_info` | Generate a wallet info retrieval GCScript + URL |
| `generate_mint_token` | Generate a token / NFT minting GCScript + URL |
| `generate_stake_delegation` | Generate a stake delegation GCScript + URL |
| `list_examples` | List the 93 built-in GCScript examples, optionally filtered by category |
| `get_example` | Retrieve a specific example by name — returns GCScript + URL |
| `search_examples` | Search examples by keywords (AND logic across name, title, description) |
| `get_documentation` | Return docs for a topic (gcscript, isl, payments, minting, …) |
| `validate_gcscript` | Validate that a GCScript string is well-formed |
| `list_tools` | List all available tools |

---

## Tool Details

### `encode_gcscript_url`

Encode any GCScript object into a GameChanger Wallet URL.

**Parameters:**
- `gcscript` (string, required) — GCScript as a JSON string
- `network` (enum: `mainnet` | `preprod`, default: `mainnet`)

**Returns:** `{ url, network }`

---

### `decode_wallet_response`

Decode a packed wallet result (the `result` query parameter from a return URL).

**Parameters:**
- `packed` (string, required) — the packed result string (e.g., `0-eyJ0eXBlIj...` or `1-H4sIAAAA...`)

**Returns:** The decoded JSON object

---

### `generate_send_ada`

Generate a GCScript + URL that sends ADA from the user's wallet to a recipient.

**Parameters:**
- `toAddress` (string, required) — Recipient bech32 address
- `lovelace` (string, required) — Amount in lovelace (1 ADA = `"1000000"`)
- `network` (enum, default: `mainnet`)
- `title` (string, optional) — Human-readable title shown in the wallet UI
- `returnUrl` (string, optional) — Return URL pattern with `{result}` placeholder

**Returns:** `{ gcscript, url, network }`

---

### `generate_multi_send`

Generate a GCScript + URL that sends ADA to multiple recipients in one transaction.

**Parameters:**
- `outputs` (array, required) — List of `{ address, lovelace }` objects
- `network` (enum, default: `mainnet`)

**Returns:** `{ gcscript, url, network }`

---

### `generate_get_wallet_info`

Generate a GCScript + URL that retrieves the user's wallet name, address, and network info.

**Parameters:**
- `network` (enum, default: `mainnet`)
- `returnUrl` (string, optional) — Return URL pattern

**Returns:** `{ gcscript, url, network }`

---

### `generate_mint_token`

Generate a GCScript + URL that mints native tokens using the user's spending key as the minting policy.

**Parameters:**
- `assetName` (string, required) — Token name
- `quantity` (string, required) — Number of tokens to mint (e.g., `"1000"`)
- `network` (enum, default: `mainnet`)
- `toAddress` (string, optional) — Destination address (defaults to user's own)
- `nftMetadata` (object, optional) — CIP-25 metadata for NFTs

**Returns:** `{ gcscript, url, network }`

---

### `generate_stake_delegation`

Generate a GCScript + URL for delegating the user's staking key to a pool.

**Parameters:**
- `poolId` (string, required) — Stake pool ID (bech32 or hex)
- `network` (enum, default: `mainnet`)

**Returns:** `{ gcscript, url, network }`

---

### `list_examples`

List the 93 built-in GCScript examples from the repository.

**Parameters:**
- `category` (enum, optional): filter by category — `payments` | `minting` | `multisig` | `governance` | `workspaces` | `smart-contracts` | `gcfs` | `wallet` | `keys` | `utility`

**Returns:** `{ total, category, examples: [{ name, title, description, category }] }`

---

### `get_example`

Retrieve a specific example by name. Returns the full GCScript JSON and an encoded wallet URL.

**Parameters:**
- `name` (string, required) — Example name as returned by `list_examples` or `search_examples` (case-insensitive)
- `network` (enum, default: `mainnet`)

**Returns:** `{ name, title, description, category, gcscript, url, network }`

---

### `search_examples`

Search examples by keywords (AND logic across name, title, and description).

**Parameters:**
- `keywords` (string[], required, min 1) — e.g., `["nft", "mint"]` returns examples containing both keywords

**Returns:** `{ keywords, total, results: [{ name, title, description, category }] }`

---

### `get_documentation`

Return reference documentation for a specific topic.

**Parameters:**
- `topic` (enum, required): `overview` | `gcscript` | `isl` | `url-patterns` | `transactions` | `payments` | `minting` | `multisig` | `workspaces` | `examples` | `skills`

---

### `validate_gcscript`

Validate that a GCScript string is well-formed JSON and has the required structure.

**Parameters:**
- `gcscript` (string, required) — GCScript JSON string to validate

---

## Example Usage (via MCP client)

```
Tool: generate_send_ada
{
  "toAddress": "addr1q9faamq9k6557gve35amtdqph99h9q2txhz07chaxg6uwwgd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqczuqwr",
  "lovelace": "2000000",
  "network": "mainnet",
  "title": "Pay 2 ADA"
}
```

Response:
```json
{
  "gcscript": { "type": "script", ... },
  "url": "https://wallet.gamechanger.finance/api/2/run/0-eyJ0eXBlIjoic2NyaXB0Iiw...?networkTag=mainnet",
  "network": "mainnet"
}
```

---

## Further Reading

- [SKILLS.md](../SKILLS.md) — Comprehensive AI agent skills reference for this repository
- [GCScript API Reference](https://wallet.gamechanger.finance/doc/api/v2)
- [Playground IDE](https://wallet.gamechanger.finance/playground)
- [NPM Library](https://www.npmjs.com/package/@gamechanger-finance/gc)
- [General Documentation](../docs/README.md)
