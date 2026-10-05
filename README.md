# Ribbon

Shared USDC tabs for a small trusted group, settled in one transaction on [Arc](https://www.arc.io) mainnet.

Someone opens a circle and shares one invite. A member records an expense as an equal split or as exact shares. Nothing is owed until every person in that split confirms the same numbers. One `settle` transaction then pulls USDC from each debtor straight to each creditor. The contract never holds the money. A debtor can also `pay` a single creditor without settling the rest of the circle.

## Why Arc

Arc charges gas in USDC, and a transaction is final in under a second. Settling a few dollars is a normal action, because the fee is a fraction of a cent in the same asset being repaid.

Two Arc details shape the contract:

- Native USDC and the ERC-20 interface are the same balance, but they do not use the same decimals. Wallets show gas at 18 decimals. Ribbon settles only the 6-decimal ERC-20 interface at `0x3600000000000000000000000000000000000000`.
- The public RPC rejects `eth_getLogs` ranges above 10,000 blocks. The ledger lives in contract storage. The invite code is emitted once, in the creation receipt, and only its hash is stored. Recover it from that transaction, not from a log scan.

## DoraHacks description

Paste this into the Arc Microgrants submission:

> Ribbon is a shared USDC tab for two to eight people, deployed on Arc mainnet (chain 5042). A member logs an expense, everyone in the split confirms the exact shares, and one transaction pays each creditor from each debtor. The contract never custodies USDC: `transferFrom` goes debtor to creditor, and a token that returns success without delivering the full amount is rejected. Arc is required for the product, not bolted on. Gas is USDC, so a small repayment does not depend on a volatile fee token, and finality is deterministic in under a second. Balances are stored in the contract because Arc's public RPC refuses log ranges above 10,000 blocks. Amounts use the 6-decimal USDC interface at 0x3600000000000000000000000000000000000000.

Hackathon page: https://dorahacks.io/hackathon/arc-microgrants/detail

The submission needs a public repository, a public builder profile, a short description, and a link to a deployment that is already working on Arc mainnet. A testnet-only deploy is not eligible. Deadline: October 14, 2026 at 23:59 ET.

## Stack

- Solidity 0.8.28, Hardhat, ethers v6
- React 19, Vite, TypeScript, wagmi, viem
- Hono API for wallet-signed display names
- Supabase (Postgres) for those names only. The ledger is the contract. Without Supabase, names live in process memory.

## Setup

```powershell
cd C:\Users\user\ribbon
copy .env.example .env
npm install
npm test
npm run build
```

Fill `.env` from `.env.example`. The commands below assume that file exists.

### 1. Supabase

Create a project and run `supabase/schema.sql` in the SQL editor. Put the project URL in `SUPABASE_URL` and the service-role key in `SUPABASE_SERVICE_ROLE_KEY`. Do not put that key in any `VITE_` variable.

Skipping this is fine for a local demo. Names reset when the API process stops.

### 2. Deploy the contract

Fund the deployer wallet with USDC on the network you are deploying to. Arc uses that USDC as gas.

```powershell
npm run deploy:arc-testnet
npm run deploy:arc
```

`deploy:arc-testnet` is a rehearsal on chain 5042002. Arc Microgrants does not accept it as the submission.

`deploy:arc` deploys to chain 5042. The script checks that `USDC_ADDRESS` has bytecode and `decimals() == 6`, that the deployer has a balance, and that `maxFeePerGas` is at least 20 gwei with a priority fee of 0. It writes `deployments/5042.json` (gitignored) and prints:

```text
VITE_RIBBON_ADDRESS=0x...
RIBBON_ADDRESS=0x...
```

Copy both into `.env`. Then rebuild so the web bundle contains the address:

```powershell
npm run build
npm start
```

`npm start` serves the API and `web/dist` on port 8787. For development, `npm run dev` runs the API on 8787 and Vite on 5173, with `/api` proxied.

The contract on mainnet: `https://explorer.arc.io/address/<VITE_RIBBON_ADDRESS>`

### 3. Publish a public URL

Localhost is not a link a reviewer can open. Host the built app somewhere that serves `web/dist` and `/api`, or run `npm start` on a public host. Set `WEB_ORIGIN` to that site's origin and `VITE_API_URL` only if the API is on a different host. Rebuild after any `VITE_` change.

Connect a browser wallet (MetaMask or Rabby), switch to Arc mainnet, and open a circle. Each member approves the exact USDC they owe, then anyone in the circle can settle.

## Contract

`contracts/Ribbon.sol`

| Action | Who | What it does |
| --- | --- | --- |
| `createCircle(name, salt)` | anyone | Opens a circle of up to 8. Emits the invite code once. |
| `join(circleId, inviteCode)` | invite holder | Joins if the code matches the stored hash. |
| `addExpense(...)` | member | Records a proposal. Empty `shares` means an equal split. Remainder base units go to the first participants. |
| `confirmExpense` | participant | The payer is already confirmed. The last confirmation books the nets. |
| `cancelExpense` | payer or creator | Drops a proposal that is not yet booked. |
| `pay(circleId, creditor, amount)` | debtor | Pays one creditor, up to the overlapping net. |
| `settle(circleId)` | any member | Nets every balance to zero, then pulls USDC. |
| `leave` / `closeCircle` | member / creator | Allowed only with no open balance and no unconfirmed expense. |

Equal split of 100 base units across 3 people is 34, 33, 33. An amount smaller than the participant count reverts, so nobody is assigned 0.

Settlement checks allowance and balance first, requires `transferFrom` to return true, and requires the creditor balance to increase by the full amount. State changes are applied before the token call, and every state-changing entry point uses a reentrancy lock.

## Tests

```powershell
npm test
npm run build
```

`npm test` compiles the contract, exports the ABI into `web/src/abi` and `server/src/abi`, then runs Hardhat, the API tests, and the web unit tests. The committed ABI must match the artifact.

## Environment

See `.env.example` for every variable and which layer reads it.
