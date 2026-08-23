import { ethers } from "hardhat";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing ${name} in .env`);
  }
  return value;
}

function requireAddress(name: string): string {
  const value = requireEnv(name);
  if (!ethers.isAddress(value)) {
    throw new Error(`${name} is not a valid Ethereum address: ${value}`);
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
  const contractAddress = requireAddress("SEPOLIA_CONTRACT_ADDRESS");
  const manufacturerPrivateKey = requirePrivateKey("SEPOLIA_PRIVATE_KEY_MANUFACTURER");
  const manufacturerAddress = requireAddress("SEPOLIA_MANUFACTURER_ADDRESS");
  const distributorAddress = requireAddress("SEPOLIA_DISTRIBUTOR_ADDRESS");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const manufacturerWallet = new ethers.Wallet(manufacturerPrivateKey, provider);
  const adminWallet = manufacturerWallet;

  if (manufacturerWallet.address.toLowerCase() !== manufacturerAddress.toLowerCase()) {
    throw new Error(
      `SEPOLIA_MANUFACTURER_ADDRESS must match SEPOLIA_PRIVATE_KEY_MANUFACTURER wallet. Expected ${manufacturerWallet.address}, received ${manufacturerAddress}`
    );
  }

  const PharmaTree = await ethers.getContractFactory("PharmaTree");
  const contract = PharmaTree.connect(adminWallet).attach(contractAddress);

  const currentManufacturer = await contract.isManufacturer(manufacturerAddress);
  const currentDistributor = await contract.isHandler(distributorAddress);

  if (!currentManufacturer) {
    const tx = await contract.addManufacturer(manufacturerAddress);
    await tx.wait();
    console.log(`Granted Manufacturer role to ${manufacturerAddress}`);
  } else {
    console.log(`Manufacturer role already present for ${manufacturerAddress}`);
  }

  if (!currentDistributor) {
    const tx = await contract.addHandler(distributorAddress);
    await tx.wait();
    console.log(`Granted Handler role to ${distributorAddress}`);
  } else {
    console.log(`Handler role already present for ${distributorAddress}`);
  }

  console.log("Done.");
  console.log({
    adminWallet: adminWallet.address,
    contractAddress,
    manufacturerAddress,
    distributorAddress,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
