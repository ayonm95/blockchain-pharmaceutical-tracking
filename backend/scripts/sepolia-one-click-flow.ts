import { ethers } from "hardhat";

function ensurePrivateKey(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing ${name} in .env`);
  }

  if (!value.startsWith("0x")) {
    throw new Error(`${name} must start with 0x and be a 32-byte private key`);
  }

  if (value.length !== 66) {
    throw new Error(`${name} must be 64 hex chars long after 0x`);
  }

  return value;
}

async function main() {
  if (!process.env.SEPOLIA_RPC_URL || !process.env.SEPOLIA_CONTRACT_ADDRESS) {
    throw new Error("Missing env vars: SEPOLIA_RPC_URL, SEPOLIA_CONTRACT_ADDRESS");
  }

  const manufacturerKey = ensurePrivateKey(
    "SEPOLIA_PRIVATE_KEY_MANUFACTURER",
    process.env.SEPOLIA_PRIVATE_KEY_MANUFACTURER
  );
  const distributorKey = ensurePrivateKey(
    "SEPOLIA_PRIVATE_KEY_DISTRIBUTOR",
    process.env.SEPOLIA_PRIVATE_KEY_DISTRIBUTOR
  );

  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const manufacturerWallet = new ethers.Wallet(manufacturerKey, provider);
  const distributorWallet = new ethers.Wallet(distributorKey, provider);
  const contractAddress = process.env.SEPOLIA_CONTRACT_ADDRESS;

  const PharmaTree = await ethers.getContractFactory("PharmaTree");
  const manufacturerContract = PharmaTree.connect(manufacturerWallet).attach(contractAddress);
  const distributorContract = PharmaTree.connect(distributorWallet).attach(contractAddress);

  const isMfr = await manufacturerContract.isManufacturer(manufacturerWallet.address);
  const isHandler = await manufacturerContract.isHandler(distributorWallet.address);

  if (!isMfr) {
    const tx = await manufacturerContract.addManufacturer(manufacturerWallet.address);
    await tx.wait();
    console.log("Manufacturer role granted");
  }

  if (!isHandler) {
    const tx = await manufacturerContract.addHandler(distributorWallet.address);
    await tx.wait();
    console.log("Distributor role granted");
  }

  const beforeCounter = Number(await manufacturerContract.unitCounter());
  const metadata = `ipfs://demo-medicine-sepolia-${Date.now()}`;

  const createTx = await manufacturerContract.createRootUnit(0, metadata);
  await createTx.wait();
  const unitId = Number(await manufacturerContract.unitCounter());

  console.log(`Root medicine created as Unit #${unitId} with metadata ${metadata}`);
  console.log(`Previous counter: ${beforeCounter}; new counter: ${unitId}`);

  const transferTx = await manufacturerContract.initiateTransfer(unitId, distributorWallet.address);
  await transferTx.wait();
  console.log("Transfer initiated from manufacturer to distributor");

  const acceptTx = await distributorContract.acceptTransfer(unitId);
  await acceptTx.wait();
  console.log("Distributor accepted transfer");

  const finalUnit = await manufacturerContract.getUnitDetails(unitId);
  console.log("Final state:", {
    currentOwner: finalUnit.currentOwner,
    pendingReceiver: finalUnit.pendingReceiver,
    status: finalUnit.status.toString(),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
