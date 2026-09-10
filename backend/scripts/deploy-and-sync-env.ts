import fs from "node:fs/promises";
import path from "node:path";
import { ethers } from "hardhat";

async function replaceEnvValue(filePath: string, key: string, value: string) {
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  content = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}\n${line}\n`;
  await fs.writeFile(filePath, content, "utf8");
  console.log(`Updated ${key} in ${filePath}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer wallet configured for Sepolia.");

  const targetManufacturer = deployer.address;
  console.log(`Deploying PharmaTree with deployer: ${deployer.address}`);

  const Factory = await ethers.getContractFactory("PharmaTree", deployer);
  const contract = await Factory.deploy();
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  const deploymentTx = contract.deploymentTransaction();
  const deploymentReceipt = await deploymentTx?.wait(1);

  console.log(`PharmaTree deployed to: ${contractAddress}`);
  console.log(`Deployment Block: ${deploymentReceipt?.blockNumber}`);

  const isMfr = await contract.isManufacturer(targetManufacturer);
  let roleTxHash: string | undefined;
  if (!isMfr) {
    const roleTx = await contract.addManufacturer(targetManufacturer);
    await roleTx.wait(1);
    roleTxHash = roleTx.hash;
    console.log(`Granted MANUFACTURER_ROLE to ${targetManufacturer}`);
  }

  const envPaths = [
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../../frontend/.env.local"),
    path.resolve(__dirname, "../../../blockchain_tracking/.env"),
    path.resolve(__dirname, "../../../blockchain_tracking/.env.local"),
  ];

  for (const envPath of envPaths) {
    if (envPath.endsWith(".env.local")) {
      await replaceEnvValue(envPath, "NEXT_PUBLIC_PHARMA_TREE_CONTRACT", contractAddress);
      if (deploymentReceipt?.blockNumber !== undefined) {
        await replaceEnvValue(envPath, "NEXT_PUBLIC_DEPLOYMENT_BLOCK", String(deploymentReceipt.blockNumber));
      }
      await replaceEnvValue(envPath, "NEXT_PUBLIC_CHAIN_ID", "11155111");
    } else {
      await replaceEnvValue(envPath, "SEPOLIA_CONTRACT_ADDRESS", contractAddress);
      await replaceEnvValue(envPath, "SEPOLIA_CHAIN_ID", "11155111");
    }
  }

  const result = {
    contractAddress,
    deployer: deployer.address,
    manufacturer: targetManufacturer,
    deploymentBlock: deploymentReceipt?.blockNumber,
    roleTxHash,
    network: (await ethers.provider.getNetwork()).chainId.toString(),
  };

  console.log("\n--- DEPLOYMENT SUCCESSFUL ---");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
