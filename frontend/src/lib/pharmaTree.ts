export const PHARMA_TREE_ABI = [
  "function admin() view returns (address)",
  "function unitCounter() view returns (uint256)",
  "function isManufacturer(address) view returns (bool)",
  "function isHandler(address) view returns (bool)",
  "function addManufacturer(address _mfr)",
  "function addHandler(address _handler)",
  "function removeManufacturer(address _mfr)",
  "function removeHandler(address _handler)",
  "function createRootUnit(uint8 _level, string _metadata) returns (uint256)",
  "function createChildUnits(uint256 _parentId, uint8 _childLevel, string _metadata, uint256 _count)",
  "function initiateTransfer(uint256 _id, address _receiver)",
  "function acceptTransfer(uint256 _id)",
  "function rejectTransfer(uint256 _id)",
  "function markAsSold(uint256 _id)",
  "function getChildren(uint256 _parentId) view returns (uint256[])",
  "function getUnitDetails(uint256 _id) view returns (tuple(uint256 parentId, uint256 rootId, uint8 level, address manufacturer, address currentOwner, address pendingReceiver, uint8 status, uint256 quantity, string metadata))",

  "event UnitCreated(uint256 indexed id, uint256 indexed parentId, uint8 level, address indexed owner)",
  "event TransferInitiated(uint256 indexed id, address indexed from, address indexed to)",
  "event TransferCompleted(uint256 indexed id, address indexed from, address indexed to)",
  "event TransferRejected(uint256 indexed id, address indexed from, address indexed rejectedBy)",
  "event UnitSold(uint256 indexed id, address indexed soldBy)"
] as const;
export const PHARMA_TREE_CONTRACT = process.env.NEXT_PUBLIC_PHARMA_TREE_CONTRACT || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const UNIT_LEVELS = [
  "Container",
  "Shipment",
  "Batch",
  "Box",
  "IndividualItem",
] as const;

export const UNIT_STATUS = ["Active", "PendingTransfer", "Sold", "Rejected"] as const;

export function unitLevelToName(level: number) {
  return UNIT_LEVELS[level] ?? "Unknown";
}

export function unitStatusToName(status: number) {
  return UNIT_STATUS[status] ?? "Unknown";
}
