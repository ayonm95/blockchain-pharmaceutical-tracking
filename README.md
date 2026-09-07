# Blockchain-Based Pharmaceutical Tracking

PharmaTree is a blockchain-backed pharmaceutical supply-chain dashboard. It
tracks medicine creation, ownership, authorized transfers, partial quantities,
lineage, inventory, and final sale.

## Repository layout

```text
contracts/PharmaTree.sol   Solidity contract
scripts/                   Deployment and verification scripts
test/PharmaTree.test.ts    Hardhat regression tests
src/                       Next.js dashboard
public/                    Frontend assets
```

The repository intentionally uses one root project. There are no separate
`frontend/` or `backend/` folders.

## Prerequisites

- Node.js 18+
- npm
- MetaMask
- Optional Sepolia RPC endpoint and funded test wallet

## Local setup

```bash
npm install
npm run compile
npm test
npm run lint
npm run build
```

Start the local blockchain in one terminal:

```bash
npm run node
```

Deploy in another terminal:

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

Copy the printed address into `.env.local.example`, save the result as
`.env.local`, and start the dashboard:

```bash
cp .env.local.example .env.local
npm run dev
```

Open <http://localhost:3000>, connect MetaMask to `http://127.0.0.1:8545`
(chain ID `31337`), and import a funded account printed by Hardhat.

## Environment files

`.env.example` contains backend deployment variables. `.env.local.example`
contains browser variables:

```dotenv
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_PHARMA_TREE_CONTRACT=0xYOUR_DEPLOYED_CONTRACT_ADDRESS
NEXT_PUBLIC_DEPLOYMENT_BLOCK=
NEXT_PUBLIC_PINATA_API_KEY=
NEXT_PUBLIC_PINATA_SECRET_API_KEY=
```

Never commit `.env` or `.env.local`. Only placeholder templates belong in Git.

## Sepolia deployment

```bash
cp .env.example .env
npm run deploy:fresh-manufacturer
```

Set `SEPOLIA_RPC_URL`, `SEPOLIA_PRIVATE_KEY_MANUFACTURER`, and the other
required values in `.env` first. Use a dedicated test wallet and never use a
wallet containing real funds.

Available workflows:

```bash
npm run deploy:sepolia
npm run verify:sepolia
npm run verify:sepolia-two-wallet
```

## Application workflow

1. Admin grants manufacturer or handler roles.
2. A manufacturer creates a root medicine unit.
3. The owner transfers a full or partial quantity to an authorized wallet.
4. The receiver accepts or rejects the pending transfer.
5. Owners inspect inventory and mark active stock as sold.
6. Manufacturer views preserve lineage; handler views use wallet-local numbering.

The contract enforces roles, ownership, quantities, and transfer handshakes.
The dashboard validates addresses, stock, quantities, and receiver roles before
opening MetaMask.

## Validation

```bash
npm run compile
npm test
npm run lint
npm run build
```

Manual checks should cover creating medicine, granting a handler role, full and
partial transfers, accept/reject flows, over-quantity validation, and sale
status changes.

## Security

Do not commit private keys, RPC project IDs, API keys, `.env` files, build
output, or dependency directories. Rotate credentials immediately if exposed.

## License

No license has been selected yet. Add an explicit license before redistribution.
