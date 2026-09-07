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
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

  const manufacturerKey = ensurePrivateKey(
    "SEPOLIA_PRIVATE_KEY_MANUFACTURER",
    process.env.SEPOLIA_PRIVATE_KEY_MANUFACTURER
  );
  const distributorKey = ensurePrivateKey(
    "SEPOLIA_PRIVATE_KEY_DISTRIBUTOR",
    process.env.SEPOLIA_PRIVATE_KEY_DISTRIBUTOR
  );

  const manufacturerWallet = new ethers.Wallet(manufacturerKey, provider);
  const distributorWallet = new ethers.Wallet(distributorKey, provider);

  const contractAddress = process.env.SEPOLIA_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("Set SEPOLIA_CONTRACT_ADDRESS in .env");
  }

  console.log("Manufacturer wallet:", manufacturerWallet.address);
  console.log("Distributor wallet:", distributorWallet.address);
  console.log("Contract address:", contractAddress);

  const PharmaTree = await ethers.getContractFactory("PharmaTree");
  const manufacturerContract = PharmaTree.connect(manufacturerWallet).attach(contractAddress);
  const distributorContract = PharmaTree.connect(distributorWallet).attach(contractAddress);

  const manufacturerRole = await manufacturerContract.isManufacturer(manufacturerWallet.address);
  const distributorRole = await manufacturerContract.isHandler(distributorWallet.address);

  if (!manufacturerRole) {
    const tx = await manufacturerContract.addManufacturer(manufacturerWallet.address);
    await tx.wait();
    console.log("Manufacturer role granted");
  }

  if (!distributorRole) {
    const tx = await manufacturerContract.addHandler(distributorWallet.address);
    await tx.wait();
    console.log("Distributor role granted");
  }

  const beforeCounter = Number(await manufacturerContract.unitCounter());
  const metadata = `ipfs://demo-medicine-sepolia-${Date.now()}`;
  const quantity = Number(process.env.MEDICINE_QUANTITY ?? "1");

  const createdUnit = await manufacturerContract.createRootUnit(0, metadata, quantity);
  await createdUnit.wait();
  const unitId = Number(await manufacturerContract.unitCounter());
  console.log(`Root unit created as Unit #${unitId} with metadata ${metadata}`);
  console.log("Previous counter:", beforeCounter, "New counter:", unitId);

  const transferTx = await manufacturerContract.initiateTransfer(unitId, distributorWallet.address);
  await transferTx.wait();
  console.log("Transfer initiated");

  const acceptTx = await distributorContract.acceptTransfer(unitId);
  await acceptTx.wait();
  console.log("Transfer accepted");

  const unit = await manufacturerContract.getUnitDetails(unitId);
  console.log("Final unit state:", {
    currentOwner: unit.currentOwner,
    pendingReceiver: unit.pendingReceiver,
    status: unit.status.toString(),
    metadata: unit.metadata,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
