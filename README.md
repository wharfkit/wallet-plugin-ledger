# @wharfkit/wallet-plugin-ledger

A Ledger hardware wallet plugin for use within the `@wharfkit/session` library.

## Overview

This plugin allows users to interact with their Ledger hardware wallet to sign transactions on supported blockchains. It supports various connection methods including WebUSB, WebHID, WebBLE, and node-hid (for Node.js environments).

## Features

- Connect to Ledger devices using multiple transport methods (WebUSB, WebHID, WebBLE)
- Support for EOSIO-based blockchains
- Secure transaction signing with Ledger hardware devices
- Compatible with @wharfkit/session

## Usage

```typescript
import { SessionKit } from '@wharfkit/session'
import { WalletPluginLedger } from '@wharfkit/wallet-plugin-ledger'

// Create a new SessionKit with the Ledger wallet plugin
const kit = new SessionKit({
  appName: 'My App',
  chains: [...],
  walletPlugins: [
    new WalletPluginLedger()
  ]
})

// Login with Ledger
const { session } = await kit.login()

// Sign transactions
const result = await session.transact(...)
```

## Developing

You need [Make](https://www.gnu.org/software/make/), [node.js](https://nodejs.org/en/) and [yarn](https://classic.yarnpkg.com/en/docs/install) installed.

Clone the repository and run `make` to checkout all dependencies and build the project. See the [Makefile](./Makefile) for other useful targets. Before submitting a pull request make sure to run `make lint`.

---

Made with ☕️ & ❤️ by [Greymass](https://greymass.com), if you find this useful please consider [supporting us](https://greymass.com/support-us).
