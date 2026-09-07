import { expect } from "chai";
import { ethers } from "hardhat";
describe("PharmaTree Smart Contract", function () {
  let pharmaTree: any;
  let admin: any;
  let manufacturer: any;
  let distributor: any;
  let pharmacy: any;
  let unauthorized: any;

  // Enums matching Solidity definitions
  enum UnitLevel { Container, Shipment, Batch, Box, IndividualItem }
  enum Status { Active, PendingTransfer, Sold, Rejected }

  beforeEach(async function () {
    [admin, manufacturer, distributor, pharmacy, unauthorized] = await ethers.getSigners();

    const PharmaTreeFactory = await ethers.getContractFactory("PharmaTree", admin);
    pharmaTree = await PharmaTreeFactory.deploy();
    await pharmaTree.waitForDeployment();

    // Register roles
    await pharmaTree.connect(admin).addManufacturer(manufacturer.address);
    await pharmaTree.connect(admin).addHandler(distributor.address);
    await pharmaTree.connect(admin).addHandler(pharmacy.address);
  });

  describe("Admin & Role Authorization", function () {
    it("Should properly assign admin on deployment", async function () {
      expect(await pharmaTree.admin()).to.equal(admin.address);
    });

    it("Should allow admin to add manufacturers and handlers", async function () {
      expect(await pharmaTree.isManufacturer(manufacturer.address)).to.be.true;
      expect(await pharmaTree.isHandler(distributor.address)).to.be.true;
    });

    it("Should prevent non-admins from adding roles", async function () {
      await expect(
        pharmaTree.connect(unauthorized).addManufacturer(unauthorized.address)
      ).to.be.revertedWith("Not admin");

      await expect(
        pharmaTree.connect(unauthorized).addHandler(unauthorized.address)
      ).to.be.revertedWith("Not admin");
    });
  });

  describe("Hierarchical Creation", function () {
    it("Should allow an authorized manufacturer to create a root unit", async function () {
      const tx = await pharmaTree.connect(manufacturer).createRootUnit(
        UnitLevel.Container,
      "IPFS_CID_CONTAINER_METADATA",
      1
      );

      await expect(tx)
        .to.emit(pharmaTree, "UnitCreated")
        .withArgs(1, 0, UnitLevel.Container, manufacturer.address);

      const unit = await pharmaTree.getUnitDetails(1);
      expect(unit.parentId).to.equal(0);
      expect(unit.level).to.equal(UnitLevel.Container);
      expect(unit.manufacturer).to.equal(manufacturer.address);
      expect(unit.currentOwner).to.equal(manufacturer.address);
      expect(unit.status).to.equal(Status.Active);
    });

    it("Should prevent unauthorized users from creating root units", async function () {
      await expect(
        pharmaTree.connect(unauthorized).createRootUnit(UnitLevel.Container, "Meta", 1)
      ).to.be.revertedWith("Only manufacturers can create root units");
    });

    it("Should preserve the sender remainder when transferring a partial quantity", async function () {
      await pharmaTree.connect(manufacturer).createRootUnit(UnitLevel.Batch, "Paracetamol", 100);

      await pharmaTree.connect(manufacturer).initiatePartialTransfer(1, distributor.address, 40);

      const source = await pharmaTree.getUnitDetails(1);
      const split = await pharmaTree.getUnitDetails(2);
      expect(source.quantity).to.equal(60);
      expect(source.status).to.equal(Status.Active);
      expect(split.quantity).to.equal(40);
      expect(split.parentId).to.equal(1);
      expect(split.rootId).to.equal(1);
      expect(split.status).to.equal(Status.PendingTransfer);

      await pharmaTree.connect(distributor).acceptTransfer(2);
      const received = await pharmaTree.getUnitDetails(2);
      expect(received.currentOwner).to.equal(distributor.address);
      expect(received.quantity).to.equal(40);
      expect(received.status).to.equal(Status.Active);
    });

    it("Should allow packing child units under a parent unit", async function () {
      // 1. Create Parent Container (ID 1)
      await pharmaTree.connect(manufacturer).createRootUnit(UnitLevel.Container, "Container-01", 1);

      // 2. Pack 5 Boxes (Child units) under Parent ID 1
      await pharmaTree.connect(manufacturer).createChildUnits(
        1,
        UnitLevel.Box,
        "Box-Metadata",
        5
      );

      expect(await pharmaTree.unitCounter()).to.equal(6); // 1 Parent + 5 Children

      const childUnit = await pharmaTree.getUnitDetails(2);
      expect(childUnit.parentId).to.equal(1);
      expect(childUnit.level).to.equal(UnitLevel.Box);
      expect(childUnit.manufacturer).to.equal(manufacturer.address);
      expect(childUnit.currentOwner).to.equal(manufacturer.address);
    });

    it("Should prevent non-owners from packing children under a parent", async function () {
      await pharmaTree.connect(manufacturer).createRootUnit(UnitLevel.Container, "Container-01", 1);

      await expect(
        pharmaTree.connect(unauthorized).createChildUnits(1, UnitLevel.Box, "Meta", 2)
      ).to.be.revertedWith("Must own the parent to pack children");
    });
  });

  describe("Two-Party Transfer Handshake", function () {
    beforeEach(async function () {
      // Setup: Create a root unit (ID 1)
      await pharmaTree.connect(manufacturer).createRootUnit(UnitLevel.Container, "Batch-001", 1);
    });

    it("Should successfully initiate and accept a transfer", async function () {
      // Step A: Initiate transfer from Manufacturer -> Distributor
      await expect(pharmaTree.connect(manufacturer).initiateTransfer(1, distributor.address))
        .to.emit(pharmaTree, "TransferInitiated")
        .withArgs(1, manufacturer.address, distributor.address);

      let unit = await pharmaTree.getUnitDetails(1);
      expect(unit.status).to.equal(Status.PendingTransfer);
      expect(unit.pendingReceiver).to.equal(distributor.address);

      // Step B: Distributor accepts transfer
      await expect(pharmaTree.connect(distributor).acceptTransfer(1))
        .to.emit(pharmaTree, "TransferCompleted")
        .withArgs(1, manufacturer.address, distributor.address);

      unit = await pharmaTree.getUnitDetails(1);
      expect(unit.currentOwner).to.equal(distributor.address);
      expect(unit.pendingReceiver).to.equal(ethers.ZeroAddress);
      expect(unit.status).to.equal(Status.Active);
    });

    it("Should prevent non-owners from initiating a transfer", async function () {
      await expect(
        pharmaTree.connect(unauthorized).initiateTransfer(1, distributor.address)
      ).to.be.revertedWith("Not the current owner");
    });

    it("Should prevent transfers to unauthorized receivers", async function () {
      await expect(
        pharmaTree.connect(manufacturer).initiateTransfer(1, unauthorized.address)
      ).to.be.revertedWith("Receiver is not authorized");
    });

    it("Should prevent wrong accounts from accepting a transfer", async function () {
      await pharmaTree.connect(manufacturer).initiateTransfer(1, distributor.address);

      await expect(
        pharmaTree.connect(pharmacy).acceptTransfer(1)
      ).to.be.revertedWith("You are not the pending receiver");
    });

    it("Should allow the pending receiver to reject a compromised transfer", async function () {
      await pharmaTree.connect(manufacturer).initiateTransfer(1, distributor.address);

      await expect(pharmaTree.connect(distributor).rejectTransfer(1))
        .to.emit(pharmaTree, "TransferRejected")
        .withArgs(1, manufacturer.address, distributor.address);

      const unit = await pharmaTree.getUnitDetails(1);
      expect(unit.status).to.equal(Status.Rejected);
      expect(unit.pendingReceiver).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Final Sale & Inventory Detachment", function () {
    beforeEach(async function () {
      // Manufacturer -> Distributor -> Pharmacy -> Sold
      await pharmaTree.connect(manufacturer).createRootUnit(UnitLevel.IndividualItem, "Pill-01", 1);
      await pharmaTree.connect(manufacturer).initiateTransfer(1, pharmacy.address);
      await pharmaTree.connect(pharmacy).acceptTransfer(1);
    });

    it("Should allow the current owner to mark an item as sold", async function () {
      await expect(pharmaTree.connect(pharmacy).markAsSold(1))
        .to.emit(pharmaTree, "UnitSold")
        .withArgs(1, pharmacy.address);

      const unit = await pharmaTree.getUnitDetails(1);
      expect(unit.status).to.equal(Status.Sold);
    });

    it("Should prevent initiating a transfer on a sold unit", async function () {
      await pharmaTree.connect(pharmacy).markAsSold(1);

      await expect(
        pharmaTree.connect(pharmacy).initiateTransfer(1, distributor.address)
      ).to.be.revertedWith("Unit not active");
    });
  });
});