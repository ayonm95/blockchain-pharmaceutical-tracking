import { ethers } from "hardhat";

async function main() {
  const signers = await ethers.getSigners();
  const admin = signers[0];
  const manufacturer = signers[1] ?? signers[0];
  const distributor = signers[2] ?? signers[0];
  const pharmacy = signers[3] ?? signers[0];

  const PharmaTree = await ethers.getContractFactory("PharmaTree");
  const pharmaTree = await PharmaTree.deploy();
  await pharmaTree.waitForDeployment();

  const contractAddress = await pharmaTree.getAddress();
  console.log("Deployed to:", contractAddress);

  await pharmaTree.connect(admin).addManufacturer(manufacturer.address);
  await pharmaTree.connect(admin).addHandler(distributor.address);
  await pharmaTree.connect(admin).addHandler(pharmacy.address);

  const rootTx = await pharmaTree
    .connect(manufacturer)
    .createRootUnit(0, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbz6y", 1);
  await rootTx.wait();

  const countBefore = await pharmaTree.unitCounter();
  console.log("Unit count after root creation:", countBefore.toString());

  const unit = await pharmaTree.getUnitDetails(1);
  console.log("Created unit:", {
    parentId: unit.parentId.toString(),
    currentOwner: unit.currentOwner,
    manufacturer: unit.manufacturer,
    status: unit.status,
    metadata: unit.metadata,
  });

  const initTx = await pharmaTree.connect(manufacturer).initiateTransfer(1, distributor.address);
  await initTx.wait();

  const pending = await pharmaTree.getUnitDetails(1);
  console.log("Transfer initiated:", {
    pendingReceiver: pending.pendingReceiver,
    status: pending.status,
  });

  const acceptTx = await pharmaTree.connect(distributor).acceptTransfer(1);
  await acceptTx.wait();

  const afterAccept = await pharmaTree.getUnitDetails(1);
  console.log("Transfer accepted:", {
    currentOwner: afterAccept.currentOwner,
    pendingReceiver: afterAccept.pendingReceiver,
    status: afterAccept.status,
  });

  const soldTx = await pharmaTree.connect(distributor).markAsSold(1);
  await soldTx.wait();

  const sold = await pharmaTree.getUnitDetails(1);
  console.log("Final state:", {
    currentOwner: sold.currentOwner,
    status: sold.status,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
