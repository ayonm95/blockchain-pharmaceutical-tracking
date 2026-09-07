import { ethers } from 'hardhat';

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const contractAddress = process.env.SEPOLIA_CONTRACT_ADDRESS;
  const manufacturerKey = process.env.SEPOLIA_PRIVATE_KEY_MANUFACTURER;
  const distributorKey = process.env.SEPOLIA_PRIVATE_KEY_DISTRIBUTOR;

  if (!rpcUrl || !contractAddress) {
    throw new Error('Missing SEPOLIA_RPC_URL or SEPOLIA_CONTRACT_ADDRESS in .env');
  }

  if (!manufacturerKey || !distributorKey) {
    throw new Error('Missing SEPOLIA_PRIVATE_KEY_MANUFACTURER or SEPOLIA_PRIVATE_KEY_DISTRIBUTOR in .env');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const manufacturerWallet = new ethers.Wallet(manufacturerKey, provider);
  const distributorWallet = new ethers.Wallet(distributorKey, provider);

  const contract = new ethers.Contract(
    contractAddress,
    [
      'function isManufacturer(address) view returns (bool)',
      'function isHandler(address) view returns (bool)',
      'function unitCounter() view returns (uint256)',
      'function getUnitDetails(uint256) view returns (tuple(uint256 parentId, uint256 rootId, uint8 level, address manufacturer, address currentOwner, address pendingReceiver, uint8 status, uint256 quantity, string metadata))',
      'event UnitCreated(uint256 indexed id, uint256 indexed parentId, uint8 level, address indexed owner)',
      'event TransferInitiated(uint256 indexed id, address indexed from, address indexed to)',
      'event TransferCompleted(uint256 indexed id, address indexed from, address indexed to)',
      'event TransferRejected(uint256 indexed id, address indexed from, address indexed rejectedBy)',
      'event UnitSold(uint256 indexed id, address indexed soldBy)'
    ],
    provider
  );

  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - 2000);

  const mfrRole = await contract.isManufacturer(manufacturerWallet.address);
  const distRole = await contract.isHandler(distributorWallet.address);
  const counter = await contract.unitCounter();

  console.log('Network block:', latestBlock);
  console.log('Contract address:', contractAddress);
  console.log('Manufacturer wallet:', manufacturerWallet.address);
  console.log('Distributor wallet:', distributorWallet.address);
  console.log('Manufacturer role:', mfrRole);
  console.log('Distributor role:', distRole);
  console.log('Unit counter:', counter.toString());

  const createdLogs = await contract.queryFilter(contract.filters.UnitCreated(), fromBlock, 'latest');
  const transferInitiatedLogs = await contract.queryFilter(contract.filters.TransferInitiated(), fromBlock, 'latest');
  const transferCompletedLogs = await contract.queryFilter(contract.filters.TransferCompleted(), fromBlock, 'latest');
  const transferRejectedLogs = await contract.queryFilter(contract.filters.TransferRejected(), fromBlock, 'latest');
  const soldLogs = await contract.queryFilter(contract.filters.UnitSold(), fromBlock, 'latest');

  const recentUnits = [] as any[];
  for (let i = 1; i <= Number(counter); i++) {
    const detail = await contract.getUnitDetails(BigInt(i));
    recentUnits.push({
      id: i,
      manufacturer: detail.manufacturer,
      currentOwner: detail.currentOwner,
      pendingReceiver: detail.pendingReceiver,
      status: Number(detail.status),
      metadata: detail.metadata,
    });
  }

  console.log('Created logs in last 2000 blocks:', createdLogs.length);
  console.log('Transfer initiated logs:', transferInitiatedLogs.length);
  console.log('Transfer completed logs:', transferCompletedLogs.length);
  console.log('Transfer rejected logs:', transferRejectedLogs.length);
  console.log('Sold logs:', soldLogs.length);
  console.log('Recent unit state:');
  console.log(JSON.stringify(recentUnits, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
