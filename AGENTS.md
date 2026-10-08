# Ribbon

This folder is the entire project. Codex should open `C:\Users\user\ribbon` and stay inside it. Do not create a second app, and do not look in other folders under `C:\Users\user` (The Vault, wallet bots, and the rest are unrelated).

Read `.env` in this folder and use every value in it. It already contains the Arc deployer key, the Supabase project URL, and the Supabase service-role key. Do not replace `.env` with `.env.example`.

## Live deployment

Arc mainnet, chain id 5042. Already deployed. Do not run `npm run deploy:arc` again unless the user explicitly wants a new contract.

| Item | Value |
| --- | --- |
| Contract | `0x6c1c2d5ff7ffD40C5315A8B803Cd4C5ed0a6e59b` |
| Creation tx | `0x98aebf732a035079ae974601918615a08568fb3757ccc2c928e693381ebd1c77` |
| Deployer | `0x90C4bA084d6B2D084b87f61a1d1AC755495c1682` |
| USDC (6 decimals) | `0x3600000000000000000000000000000000000000` |
| Record | `deployments/5042.json` |
| Explorer | https://explorer.arc.io/address/0x6c1c2d5ff7ffD40C5315A8B803Cd4C5ed0a6e59b |
| Transaction | https://explorer.arc.io/tx/0x98aebf732a035079ae974601918615a08568fb3757ccc2c928e693381ebd1c77 |
| RPC | https://rpc.mainnet.arc.io |
| GitHub | https://github.com/Sdbaby1/ribbon |

`VITE_RIBBON_ADDRESS` and `RIBBON_ADDRESS` in `.env` are the contract above. The built site is `web/dist`. The API build is `server/dist`. `npm start` serves both on port 8787.

Supabase is already created. `supabase/schema.sql` has been applied. `public.profiles` has RLS enabled and no policies. The service-role key in `.env` bypasses RLS. The browser must never receive that key. `SUPABASE_URL` has no `/rest/v1/` suffix.

## What is left

The hackathon is Arc Microgrants: https://dorahacks.io/hackathon/arc-microgrants/detail

Deadline: October 14, 2026 at 23:59 ET. The submission needs this public repo, a public builder profile, the description in `README.md`, and a public URL of the app running against the mainnet contract above. Localhost does not count. A testnet deploy does not count.

## Commands

Run these from this folder in PowerShell. Chain commands with `;`.

```powershell
npm install
npm test
npm run build
npm start
```

`npm start` loads `.env` from this folder and opens http://localhost:8787.

To pack a copy that includes `.env`, `deployments/`, and the built `web/dist` and `server/dist`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\export-project.ps1
```

The archive is `export\ribbon-full.zip`. `node_modules`, `artifacts`, `cache`, and `typechain-types` are left out because `npm install` and `npm test` restore them from `package-lock.json`.

## Code notes

- `web/vite.config.ts` sets `envDir` to the repo root. Workspace builds run with the working directory `web/`, and the shared `.env` is one level up.
- `server/src/index.ts` loads `../../.env` for the same reason.
- Gas on Arc is USDC. Native balance is 18 decimals. Ribbon settles only the 6-decimal ERC-20 interface. Do not use `address(0)` as the token.
- The public RPC rejects `eth_getLogs` ranges above 10,000 blocks. The ledger is in the contract. The invite code is only in the creation receipt.
- GitHub is public. `.env` and `export/` are gitignored so a push does not publish the deployer key. The files are still on disk in this folder, and the zip includes them.
