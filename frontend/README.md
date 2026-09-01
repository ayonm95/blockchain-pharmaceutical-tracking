# PharmaTree Frontend

A premium dashboard for the PharmaTree blockchain supply-chain system. It connects to the local Hardhat blockchain, reads contract state, and allows manufacturers and handlers to create medicine units, review inventory, and approve transfer workflows.

## Prerequisites

- Node.js 18+
- A running local Hardhat network from the backend project
- The deployed PharmaTree contract address

## Local setup

From this directory:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Then open http://localhost:3000.

## Required environment variables

```env
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_PHARMA_TREE_CONTRACT=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_PINATA_API_KEY=
NEXT_PUBLIC_PINATA_SECRET_API_KEY=
```

## Backend pairing

Start the contract node from the backend folder:

```bash
cd ../backend
npx hardhat node
```

Deploy the contract:

```bash
cd ../backend
npx hardhat run scripts/deploy.ts --network localhost
```

Then copy the deployed address into `NEXT_PUBLIC_PHARMA_TREE_CONTRACT` in `.env.local`.

## Production notes

- The app reads the deployed contract address from `NEXT_PUBLIC_PHARMA_TREE_CONTRACT`.
- For live environments, set the correct RPC URL and deployed contract address in the host environment.
- Pinata variables are prepared for future metadata/IPFS uploads and are not required for the current local dashboard flow.
