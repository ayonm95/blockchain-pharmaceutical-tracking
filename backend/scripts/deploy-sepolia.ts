import { ethers } from "hardhat";

async function main() {
  console.log("Preparing to deploy PharmaTree to Sepolia...");

  // Get the account deploying the contract
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account found. Check your PRIVATE_KEY in the .env file.");
  }

  console.log("Deploying contracts with the account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Compile and deploy the contract
  const PharmaTree = await ethers.getContractFactory("PharmaTree");
  console.log("Deploying PharmaTree...");
  
  const pharmaTree = await PharmaTree.deploy();
  await pharmaTree.waitForDeployment();

  const contractAddress = await pharmaTree.getAddress();
  console.log(`PharmaTree successfully deployed to: ${contractAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});