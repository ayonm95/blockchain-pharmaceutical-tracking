# Blockchain-Based Pharmaceutical Tracking

PharmaTree is a blockchain-backed pharmaceutical supply-chain dashboard. It
tracks medicine from manufacturer creation through authorized transfers,
inventory ownership, partial quantities, and final sale.

The project contains:

- A Solidity smart contract with manufacturer and handler roles.
- A Hardhat backend for compilation, testing, local deployment, and Sepolia
  workflows.
- A Next.js dashboard using ethers.js and MetaMask.
- Quantity-aware partial transfers with parent/partition lineage.
- Inventory, transfer, role-management, and sale workflows.

## Architecture

```text
Manufacturer -> PharmaTree.sol -> Handler -> Handler/Pharmacy -> Sold
                         |
                         +-- Unit hierarchy and immutable events
```

The contract stores each unit's parent, root, manufacturer, owner, pending
receiver, status, quantity, and metadata. The frontend reads this state and
uses contract events for timestamps and transfer history.

## Repository layout

```text
backend/
  contracts/PharmaTree.sol   Smart contract
  scripts/                   Deployment and verification scripts
  test/PharmaTree.test.ts    Contract regression tests
frontend/
  src/components/            Dashboard UI and wallet workflows
  src/lib/pharmaTree.ts      ABI and contract configuration
```

## Prerequisites

- Node.js 18 or newer
- npm
- MetaMask
- Git
- Optional: an Infura/Alchemy Sepolia RPC endpoint and funded Sepolia wallet

## Local development

### 1. Install backend dependencies

```bash
cd backend
npm install
```

### 2. Compile and test the contract

```bash
npm run compile
npm test
```

The test suite covers roles, root and child units, transfers, partial
quantities, rejection, and sale state.

### 3. Start a local blockchain

In one terminal:

```bash
cd backend
npm run node
```

Keep this process running. Hardhat prints funded development accounts that can
be imported into a local MetaMask network.

### 4. Deploy locally

In another terminal:

```bash
cd backend
npx hardhat run scripts/deploy.ts --network localhost
```

Copy the printed contract address into the frontend environment file.

### 5. Configure and start the frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open <http://localhost:3000>, connect MetaMask to the local Hardhat network,
and import a Hardhat account. The frontend must use the same chain and
contract address as the backend deployment.

## Frontend environment

Create `frontend/.env.local` from `frontend/.env.example`:

```dotenv
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_PHARMA_TREE_CONTRACT=0xYOUR_LOCAL_CONTRACT
NEXT_PUBLIC_DEPLOYMENT_BLOCK=
```

For Sepolia, use chain ID `11155111`, a public RPC URL, and the deployed
contract address. Never commit `.env.local`.

## Sepolia deployment

Copy the backend template and fill it locally:

```bash
cd backend
cp .env.example .env
```

Required values depend on the selected script. For the fresh manufacturer
deployment, set:

```dotenv
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
SEPOLIA_PRIVATE_KEY_MANUFACTURER=0xYOUR_PRIVATE_KEY
```

Then run:

```bash
npm run deploy:fresh-manufacturer
```

The script deploys a new contract, grants the derived manufacturer address its
role, and updates local backend/frontend environment files. Review the output
before using the new deployment.

Other available workflows:

```bash
npm run deploy:sepolia
npm run verify:sepolia
npm run verify:sepolia-two-wallet
```

Never use a wallet containing real funds for development automation. Use a
dedicated test wallet and keep private keys outside Git.

## Application workflows

1. Admin grants manufacturer or handler roles.
2. A manufacturer creates a root medicine unit.
3. The current owner transfers a full or partial quantity to an authorized
   wallet.
4. The receiver accepts or rejects the pending transfer.
5. Owners can inspect inventory and mark active stock as sold.
6. Manufacturer views preserve lineage; handler views use wallet-local unit
   numbering for received inventory.

The contract enforces authorization and ownership. The frontend also validates
wallet addresses, active ownership, positive whole-number quantities, receiver
roles, and sale quantities before opening MetaMask.

## Verification checklist

```bash
cd backend
npm run compile
npm test

cd ../frontend
npm run build
npm run lint
```

Manual checks:

- Connect a manufacturer wallet.
- Create a unit and verify it appears in Overview and Inventory.
- Grant a handler role.
- Transfer a full and partial quantity.
- Accept the transfer from the receiver wallet.
- Confirm handler-local numbering starts at Unit 1.
- Attempt an unauthorized receiver and an over-quantity transfer.
- Attempt to sell more than the available quantity.
- Mark active stock sold and confirm the status changes.

## Security and public-repository rules

- `.env`, `.env.local`, private keys, RPC project IDs, and API keys are ignored.
- Only placeholder values belong in committed environment templates.
- Do not paste secrets into issues, pull requests, screenshots, or logs.
- Rotate any credential that was accidentally exposed.
- Treat Sepolia private keys as sensitive even though Sepolia is a test network.

## License

No license has been selected yet. Add an explicit license before distributing
the project for reuse.
