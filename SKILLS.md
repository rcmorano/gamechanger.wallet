# GameChanger Wallet — AI Agent Skills Reference

This document describes the capabilities, patterns, and domain knowledge that an AI agent needs to work effectively with the GameChanger Wallet ecosystem.

---

## Table of Contents

1. [What is GameChanger Wallet?](#what-is-gamechanger-wallet)
2. [Core Concepts](#core-concepts)
3. [GCScript DSL](#gcscript-dsl)
4. [Inline Scripting Language (ISL)](#inline-scripting-language-isl)
5. [Universal Dapp Connector (UDC)](#universal-dapp-connector-udc)
6. [URL Patterns and Transport](#url-patterns-and-transport)
7. [Cardano Transactions](#cardano-transactions)
8. [Workspaces, Keys and Addresses](#workspaces-keys-and-addresses)
9. [Common Patterns and Recipes](#common-patterns-and-recipes)
10. [Tooling and Libraries](#tooling-and-libraries)
11. [API Reference Locations](#api-reference-locations)

---

## What is GameChanger Wallet?

GameChanger Wallet is a non-custodial, web-based Cardano "meta wallet" that:

- Connects to **all major Cardano wallet types**: seed phrases, Ledger/Trezor hardware wallets, browser extensions (Nami, Eternl, Flint, Vespr, any CIP-30), QR/gift/burner wallets, and shared treasury (multisig) wallets.
- Uses a **JSON-based scripting language (GCScript)** as its API, making it platform-agnostic and dependency-light.
- Communicates via **URLs and QR codes**, enabling connections from web pages, backends, hardware devices, social media, print, NFC, and more.
- Builds and signs Cardano transactions **entirely on the user's device**, not on third-party backends.
- Supports **Cardano Mainnet** and **Pre-Production Testnet**.

Production URL: `https://wallet.gamechanger.finance/`

---

## Core Concepts

| Concept | Description |
|---|---|
| **GCScript** | JSON-based domain-specific language that acts as the wallet's API |
| **UDC** | Universal Dapp Connector — the URL/QR-based transport layer between dapps and the wallet |
| **ISL** | Inline Scripting Language — a JavaScript-like subset for expressions inside GCScript |
| **Workspace** | A named collection of wallet artifacts (keys, addresses, native scripts) under a namespace |
| **GCFS** | GameChanger On-Chain File System — store and retrieve code/data on the Cardano chain |
| **Transport** | How GCScript is delivered: URL, QR code, NFC, or local in-wallet execution |

---

## GCScript DSL

### Overview

GCScript is a **non-Turing-complete, JSON-based programming language** interpreted inside the GameChanger Wallet. Dapps encode GCScript into a URL, the user's wallet decodes and executes it, and returns JSON results.

**Key properties:**
- Every construct is a JSON object with a `"type"` property that names the function.
- Code is organized in `"type":"script"` blocks that act as containers (scopes).
- Results are stored in a local `cache` object with isomorphic structure to the code.
- Only data explicitly exported with `"exportAs"` reaches the global `exports` object.
- The wallet interpreter runs in three stages: **preprocessor → runtime → postprocessor**.

### Hello World

```json
{
  "type": "script",
  "title": "Hello World",
  "description": "Returns 'Hello Cardano!'",
  "exportAs": "myResults",
  "run": {
    "message": {
      "type": "data",
      "value": "Hello Cardano!"
    }
  }
}
```

**Result:**
```json
{
  "exports": {
    "myResults": {
      "message": "Hello Cardano!"
    }
  }
}
```

### Core Functions

| Function | Description |
|---|---|
| `script` | Container / code block. `run` holds child calls. `exportAs` exports cache. |
| `data` | Constant value. Returns `value` as-is. |
| `macro` | Evaluates ISL expressions. Use to pass results of one function to another. |
| `buildTx` | Builds an unsigned Cardano transaction (CBOR hex). |
| `signTxs` | Signs one or more transaction hex strings with the user's private key(s). |
| `submitTxs` | Submits one or more signed transactions to a Cardano node. |
| `getName` | Returns the wallet's display name. |
| `getCurrentAddress` | Returns the current wallet address. |
| `getSpendingPublicKey` | Returns the spending public key info (incl. `pubKeyHashHex`). |
| `getNetworkInfo` | Returns `dltTag`, `networkTag`, and other network metadata. |
| `nativeScript` | Builds a Cardano native script object (minting policy, multisig rule). |
| `importScript` | Imports external GCScript from GCFS or HTTP (preprocessor stage). |

### Script Blocks and Scope

```json
{
  "type": "script",
  "exportAs": "myExport",
  "run": {
    "step1": { "type": "data", "value": "A" },
    "step2": { "type": "data", "value": "B" }
  }
}
```

- `cache.step1` → `"A"` (accessible within the block and child ISL)
- `exports.myExport` → `{ "step1": "A", "step2": "B" }`

### Return Modes

The `"return"` property on `script` controls what gets exported:

```json
"return": { "mode": "last" }
```

| Mode | Behaviour |
|---|---|
| `"all"` | Export entire cache (default) |
| `"last"` | Export only the last entry in `run` |
| `"first"` | Export only the first entry in `run` |

---

## Inline Scripting Language (ISL)

ISL is a **non-Turing-complete subset of JavaScript** embedded inside GCScript string arguments. Any string that begins with `{` and ends with `}` is treated as ISL code.

### Accessing Cache Values

```json
"{get('cache.build.txHex')}"
```

Use `get('cache.<path>')` to read values from the current script block's cache.

### Common ISL Functions

| ISL Call | Description |
|---|---|
| `get('cache.key')` | Read a value from the local cache |
| `sha512(value)` | Compute SHA-512 hash of a string |
| `sha256(value)` | Compute SHA-256 hash |
| `join(sep, ...parts)` | Concatenate strings with a separator |
| `uuid()` | Generate a random UUID |
| `return(value)` | Explicitly return a value and halt ISL block |
| `fail(message)` | Halt with an error message |

### Macro Function (ISL Pipeline)

Use `"type":"macro"` to evaluate ISL and produce a GCScript result:

```json
{
  "type": "macro",
  "run": "{join('-', get('cache.networkInfo.dltTag'), get('cache.networkInfo.networkTag'))}"
}
```

---

## Universal Dapp Connector (UDC)

### What It Does

The UDC packages GCScript into a URL (or QR code) so any platform — desktop, mobile, hardware, social media, print — can connect to the wallet. No JavaScript injection or extensions are required.

**Communication flow:**
1. Dapp encodes GCScript → compressed URL
2. User opens URL → wallet decodes and shows a permission prompt
3. User approves → wallet executes GCScript and returns encoded JSON results

### Encodings

| Format | Header | Description |
|---|---|---|
| gzip (recommended) | `1-` | Base64url-encoded gzip compression |
| base64url | `0-` | No compression, larger URL |

---

## URL Patterns and Transport

### Base Pattern

```
https://wallet.gamechanger.finance/api/2/run/<encoded-payload>?networkTag=<network>
```

### Query Parameters

| Parameter | Values | Description |
|---|---|---|
| `networkTag` | `mainnet`, `preprod` | Target Cardano network |
| `dltTag` | `cardano` | Target DLT (default: `cardano`) |
| `ref` | Cardano address | Optional referrer attribution |

### Returning Data

Scripts may include `"returnURLPattern"` so the wallet redirects back with encoded results:

```json
{
  "type": "script",
  "returnURLPattern": "https://my-dapp.example/result?data={result}",
  "run": { ... }
}
```

The wallet encodes result into `{result}` and redirects to the dapp.

### Opening the Wallet

| Intent | URL |
|---|---|
| Open wallet home (mainnet) | `https://wallet.gamechanger.finance/?networkTag=mainnet` |
| Open wallet home (preprod) | `https://wallet.gamechanger.finance/?networkTag=preprod` |
| Run a GCScript | `https://wallet.gamechanger.finance/api/2/run/<payload>?networkTag=mainnet` |

### Generating URLs Programmatically

**With NPM library:**
```js
import gc from '@gamechanger-finance/gc';
const url = await gc.encode.url({ input: JSON.stringify(gcScript), network: 'mainnet' });
```

**With CLI:**
```bash
gamechanger-cli mainnet encode url -v 2 -f code.gcscript
gamechanger-cli mainnet encode qr  -v 2 -f code.gcscript -o qr.png
```

**Zero-dependency (Vanilla JS):**
```js
function base64urlEncode(str) {
  const percentToByte = (p) => String.fromCharCode(parseInt(p.slice(1), 16));
  return btoa(encodeURIComponent(str).replace(/%[0-9A-F]{2}/g, percentToByte))
    .replace(/\//g, '_').replace(/\+/g, '-').replace(/=+$/, '');
}
const url = `https://wallet.gamechanger.finance/api/2/run/0-${base64urlEncode(JSON.stringify(gcScript))}?networkTag=mainnet`;
```

---

## Cardano Transactions

### The Build → Sign → Submit Pattern

All transactions follow this three-step pattern in GCScript:

```json
{
  "type": "script",
  "run": {
    "build":  { "type": "buildTx",   "tx": { ... } },
    "sign":   { "type": "signTxs",   "detailedPermissions": false, "txs": ["{get('cache.build.txHex')}"] },
    "submit": { "type": "submitTxs", "txs": "{get('cache.sign')}" }
  }
}
```

### Payments

Outputs are defined in `buildTx.tx.outputs`:

```json
{
  "address": "addr1q...",
  "assets": [{ "policyId": "ada", "assetName": "ada", "quantity": "1000000" }]
}
```

- ADA unit: **lovelace** (1 ADA = 1,000,000 lovelace). Always express as a string (BigNum).
- For native tokens: set `policyId` and `assetName` to the token's actual values.

### Minting Tokens and NFTs

```json
{
  "mints": [
    {
      "vkey":     "{get('cache.dependencies.issuer.pubKeyHashHex')}",
      "script":   "{get('cache.dependencies.mintingPolicy.scriptHashHex')}",
      "assets": [
        { "assetName": "MyToken", "quantity": "100" }
      ]
    }
  ]
}
```

Minting requires a **native script** (or Plutus script) as minting policy. Use `"type":"nativeScript"` to build it.

### Native Script Types (Minting Policies / Multisig)

```json
{ "pubKeyHashHex": "<key-hash>" }         // require signature
{ "type": "all",  "scripts": [...] }      // require all
{ "type": "any",  "scripts": [...] }      // require any one
{ "type": "atLeast", "required": 2, "scripts": [...] }  // M-of-N
{ "type": "before", "slot": 12345678 }    // valid before slot
{ "type": "after",  "slot": 12345678 }    // valid after slot
```

### Transaction Metadata (auxiliaryData)

```json
{
  "auxiliaryData": {
    "721": {
      "<policyId>": {
        "<assetName>": { "name": "My NFT", "image": "ipfs://..." }
      }
    }
  }
}
```

### Smart Contracts (Plutus)

Plutus scripts can be:
- **Deployed on-chain** and referenced by `scriptHashHex`.
- **Inline** in the transaction.
- Compiled on-the-fly using **Helios Language** inside a GCScript dapp connection.

Use `buildTx.tx.inputs` with `"redeemer"` for spending, and `"collateral"` for Plutus fees.

---

## Workspaces, Keys and Addresses

### Concept

A **Workspace** is a named collection of wallet _artifacts_ (keys, addresses, native scripts) grouped under a namespace. Workspaces allow:

- Multiple wallet types to coexist in one interface.
- Auditable, shareable, and recoverable wallet configurations.
- Interoperability between personal accounts, hardware wallets, and multisig wallets.

### Key Artifacts

| Artifact | GCScript Function |
|---|---|
| Spending public key | `getSpendingPublicKey` |
| Staking public key | `getStakingPublicKey` |
| Address from keys | derived in `buildTx` or workspace config |
| Native script | `nativeScript` |

### Deriving Keys

```json
{
  "type": "getSpendingPublicKey",
  "index": 0,
  "account": 0
}
```

### Listing Workspace Items

```json
{ "type": "getAddresses" }
{ "type": "getKeys" }
```

---

## Common Patterns and Recipes

### Pattern 1: Send ADA

```json
{
  "type": "script",
  "run": {
    "build":  { "type": "buildTx", "tx": { "outputs": [{ "address": "addr1q...", "assets": [{"policyId":"ada","assetName":"ada","quantity":"2000000"}] }] } },
    "sign":   { "type": "signTxs", "detailedPermissions": false, "txs": ["{get('cache.build.txHex')}"] },
    "submit": { "type": "submitTxs", "txs": "{get('cache.sign')}" }
  }
}
```

### Pattern 2: Get Wallet Info

```json
{
  "type": "script",
  "exportAs": "walletInfo",
  "run": {
    "name":    { "type": "getName" },
    "address": { "type": "getCurrentAddress" },
    "network": { "type": "getNetworkInfo" }
  }
}
```

### Pattern 3: Network-Aware Script

```json
{
  "type": "script",
  "run": {
    "networkInfo": { "type": "getNetworkInfo" },
    "networkKey":  { "type": "macro", "run": "{join('-', get('cache.networkInfo.dltTag'), get('cache.networkInfo.networkTag'))}" }
  }
}
```

### Pattern 4: Mint a Token

```json
{
  "type": "script",
  "run": {
    "dependencies": {
      "type": "script",
      "run": {
        "issuer":        { "type": "getSpendingPublicKey" },
        "mintingPolicy": { "type": "nativeScript", "script": { "pubKeyHashHex": "{get('cache.dependencies.issuer.pubKeyHashHex')}" } }
      }
    },
    "build": {
      "type": "buildTx",
      "tx": {
        "mints": [{ "vkey": "{get('cache.dependencies.issuer.pubKeyHashHex')}", "script": "{get('cache.dependencies.mintingPolicy.scriptHashHex')}", "assets": [{ "assetName": "MyToken", "quantity": "1000" }] }],
        "outputs": [{ "address": "{get('cache.dependencies.issuer.address')}", "assets": [{ "policyId": "{get('cache.dependencies.mintingPolicy.scriptHashHex')}", "assetName": "MyToken", "quantity": "1000" }] }]
      }
    },
    "sign":   { "type": "signTxs",   "detailedPermissions": false, "txs": ["{get('cache.build.txHex')}"] },
    "submit": { "type": "submitTxs", "txs": "{get('cache.sign')}" }
  }
}
```

### Pattern 5: Multi-Party Payment (2 outputs in 1 tx)

```json
{
  "type": "script",
  "run": {
    "build": {
      "type": "buildTx",
      "tx": {
        "outputs": [
          { "address": "addr_test1...", "assets": [{"policyId":"ada","assetName":"ada","quantity":"1000000"}] },
          { "address": "addr_test1...", "assets": [{"policyId":"ada","assetName":"ada","quantity":"1500000"}] }
        ]
      }
    },
    "sign":   { "type": "signTxs",   "detailedPermissions": false, "txs": ["{get('cache.build.txHex')}"] },
    "submit": { "type": "submitTxs", "txs": "{get('cache.sign')}" }
  }
}
```

### Pattern 6: Return Results to a Dapp

```json
{
  "type": "script",
  "returnURLPattern": "https://my-dapp.example/callback?result={result}",
  "exportAs": "txResult",
  "run": {
    "build":  { "type": "buildTx",   "tx": { ... } },
    "sign":   { "type": "signTxs",   "detailedPermissions": false, "txs": ["{get('cache.build.txHex')}"] },
    "submit": { "type": "submitTxs", "txs": "{get('cache.sign')}" },
    "txHash": { "type": "macro",     "run": "{get('cache.build.txHash')}" }
  }
}
```

---

## Tooling and Libraries

| Tool | Description |
|---|---|
| `@gamechanger-finance/gc` (NPM) | Official JS/TS library and CLI for encoding GCScript into URLs, QR codes, HTML, React, and Express boilerplates |
| [Playground IDE](https://wallet.gamechanger.finance/playground) | In-wallet IDE for writing, testing, and deploying GCScript |
| [Inception IDE](https://inception.m2tec.nl/) | Third-party IDE supporting GCScript and Helios Language |
| [Kitchen Sink](https://gclib-kitchen-sink.netlify.app/) | Online tool to generate URLs, QR codes, and code snippets from GCScript |

### CLI Quick Reference

```bash
npm install -g @gamechanger-finance/gc

# Encode a script to a mainnet URL
gamechanger-cli mainnet encode url -v 2 -f script.gcscript

# Encode a script to a QR code image
gamechanger-cli mainnet encode qr -v 2 -f script.gcscript -o qr.png

# Decode a wallet response URL
gamechanger-cli decode msg -v 2 -m "1-H4sI..."
```

---

## API Reference Locations

| Resource | URL |
|---|---|
| GCScript API Reference | https://wallet.gamechanger.finance/doc/api/v2 |
| `script` / top-level API | https://wallet.gamechanger.finance/doc/api/v2/api.html |
| `buildTx` | https://wallet.gamechanger.finance/doc/api/v2/buildTx.html |
| `signTxs` | https://wallet.gamechanger.finance/doc/api/v2/signTxs.html |
| `submitTxs` | https://wallet.gamechanger.finance/doc/api/v2/submitTxs.html |
| `getCurrentAddress` | https://wallet.gamechanger.finance/doc/api/v2/getCurrentAddress.html |
| `getName` | https://wallet.gamechanger.finance/doc/api/v2/getName.html |
| `macro` / ISL | https://wallet.gamechanger.finance/doc/api/v2/macro.html |
| `nativeScript` | https://wallet.gamechanger.finance/doc/api/v2/nativeScript.html |
| JSON Schema | [release/README.md](release/README.md) |
| UDC Overview | [docs/universal-dapp-connector/overview.md](docs/universal-dapp-connector/overview.md) |
| URL Patterns | [docs/universal-dapp-connector/url-patterns.md](docs/universal-dapp-connector/url-patterns.md) |
| GCScript Overview | [docs/gcscript/overview.md](docs/gcscript/overview.md) |
| GCScript Syntax | [docs/gcscript/syntax.md](docs/gcscript/syntax.md) |
| ISL | [docs/gcscript/ISL.md](docs/gcscript/ISL.md) |
| Transactions | [docs/transactions/README.md](docs/transactions/README.md) |
| Workspaces | [docs/workspaces/README.md](docs/workspaces/README.md) |
| 93 Example Dapps | [examples/README.md](examples/README.md) |

---

## Agent Guidance

When helping users with GameChanger Wallet tasks:

1. **Always write GCScript as valid JSON.** Comments (`//`) shown in docs are illustrative only and must be removed from actual GCScript.
2. **Use lovelace for ADA amounts.** Express them as strings (e.g., `"1000000"` for 1 ADA).
3. **Use ISL (`{...}`) to chain results** between `buildTx`, `signTxs`, and `submitTxs`.
4. **Include `networkTag`** on all URLs to make links deterministic.
5. **Build transactions on the user's wallet.** Never ask for private keys or UTXOs from the user.
6. **Test scripts** in [Playground IDE](https://wallet.gamechanger.finance/playground) before distributing.
7. **Use `exportAs`** on script blocks to expose results to the calling dapp.
8. **Prefer gzip encoding** (`1-` prefix) for production URLs to keep them shorter.
9. **Use `returnURLPattern`** when the dapp needs to consume the wallet's response.
10. **Multisig support**: add `options.autoProvision.workspaceNativeScript` and `options.autoOptionalSigners.nativeScript` to `buildTx` for seamless multisig wallet compatibility.
