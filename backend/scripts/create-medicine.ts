import { ethers } from "hardhat";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing ${name} in .env`);
  }
  return value;
}

function requirePrivateKey(name: string): string {
  const value = requireEnv(name);
  if (!value.startsWith("0x")) {
    throw new Error(`${name} must start with 0x`);
  }
  if (value.length !== 66) {
    throw new Error(`${name} must be 64 hex chars long after 0x`);
  }
  return value;
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const contractAddress = requireEnv("SEPOLIA_CONTRACT_ADDRESS");
  const manufacturerPrivateKey = requirePrivateKey("SEPOLIA_PRIVATE_KEY_MANUFACTURER");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const manufacturerWallet = new ethers.Wallet(manufacturerPrivateKey, provider);

  const PharmaTree = await ethers.getContractFactory("PharmaTree");
  const contract = PharmaTree.connect(manufacturerWallet).attach(contractAddress);

  const counterBefore = Number(await contract.unitCounter());
  const nextId = counterBefore + 1;

  const metadata = `ipfs://demo-medicine-sepolia-${Date.now()}`;
  const tx = await contract.createRootUnit(0, metadata);
  await tx.wait();

  const counterAfter = Number(await contract.unitCounter());
  const createdUnitId = counterAfter;

  console.log("Rule: The deployer wallet is always manufacturer/admin until you build a real admin panel.");
  console.log("Manufacturer wallet:", manufacturerWallet.address);
  console.log("Contract address:", contractAddress);
  console.log("Units before:", counterBefore);
  console.log("Created metadata:", metadata);
  console.log("New unit created:", createdUnitId);

  const unit = await contract.getUnitDetails(createdUnitId);
  console.log("Final state:", {
    id: createdUnitId,
    manufacturer: unit.manufacturer,
    currentOwner: unit.currentOwner,
    pendingReceiver: unit.pendingReceiver,
    status: Number(unit.status),
    metadata: unit.metadata,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
