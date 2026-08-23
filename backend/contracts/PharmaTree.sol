// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract PharmaTree is AccessControl {
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant HANDLER_ROLE = keccak256("HANDLER_ROLE");

    address public admin;

    enum UnitLevel { Container, Shipment, Batch, Box, IndividualItem }
    enum Status { Active, PendingTransfer, Sold, Rejected }

    struct Unit {
        uint256 parentId;
        uint256 rootId;
        UnitLevel level;
        address manufacturer;
        address currentOwner;
        address pendingReceiver;
        Status status;
        uint256 quantity;
        string metadata;
    }

    mapping(uint256 => Unit) public units;
    mapping(uint256 => uint256[]) public children;
    uint256 public unitCounter;

    mapping(address => bool) public isManufacturer;
    mapping(address => bool) public isHandler;

    event UnitCreated(uint256 indexed id, uint256 indexed parentId, UnitLevel level, address indexed owner);
    event TransferInitiated(uint256 indexed id, address indexed from, address indexed to);
    event TransferCompleted(uint256 indexed id, address indexed from, address indexed to);
    event TransferRejected(uint256 indexed id, address indexed from, address indexed rejectedBy);
    event UnitSold(uint256 indexed id, address indexed soldBy);

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not admin");
        _;
    }

    modifier onlyCurrentOwner(uint256 _id) {
        require(units[_id].currentOwner == msg.sender, "Not the current owner");
        _;
    }

    constructor() {
        admin = msg.sender;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MANUFACTURER_ROLE, msg.sender);
        isManufacturer[msg.sender] = true;
    }

    function addManufacturer(address _mfr) external onlyAdmin {
        grantRole(MANUFACTURER_ROLE, _mfr);
        isManufacturer[_mfr] = true;
    }

    function addHandler(address _handler) external onlyAdmin {
        grantRole(HANDLER_ROLE, _handler);
        isHandler[_handler] = true;
    }

    function removeManufacturer(address _mfr) external onlyAdmin {
        revokeRole(MANUFACTURER_ROLE, _mfr);
        isManufacturer[_mfr] = false;
    }

    function removeHandler(address _handler) external onlyAdmin {
        revokeRole(HANDLER_ROLE, _handler);
        isHandler[_handler] = false;
    }

    function createRootUnit(UnitLevel _level, string calldata _metadata) external returns (uint256) {
        require(hasRole(MANUFACTURER_ROLE, msg.sender), "Only manufacturers can create root units");
        return _createUnit(0, 0, _level, msg.sender, msg.sender, _metadata, 1);
    }

    function createChildUnits(uint256 _parentId, UnitLevel _childLevel, string calldata _metadata, uint256 _count) external {
        require(_parentId > 0 && _parentId <= unitCounter, "Parent unit does not exist");
        require(units[_parentId].currentOwner == msg.sender, "Must own the parent to pack children");
        require(units[_parentId].status == Status.Active, "Parent unit cannot be in transit or sold");
        require(_count > 0, "Count must be greater than zero");

        address originalMfr = units[_parentId].manufacturer;
        uint256 rootId = units[_parentId].rootId == 0 ? _parentId : units[_parentId].rootId;

        for (uint256 i = 0; i < _count; i++) {
            uint256 childId = _createUnit(_parentId, rootId, _childLevel, originalMfr, msg.sender, _metadata, 1);
            children[_parentId].push(childId);
        }
    }

    function _createUnit(
        uint256 _parentId,
        uint256 _rootId,
        UnitLevel _level,
        address _manufacturer,
        address _owner,
        string memory _metadata,
        uint256 _quantity
    ) internal returns (uint256) {
        unitCounter++;
        uint256 unitId = unitCounter;

        units[unitId] = Unit({
            parentId: _parentId,
            rootId: _rootId,
            level: _level,
            manufacturer: _manufacturer,
            currentOwner: _owner,
            pendingReceiver: address(0),
            status: Status.Active,
            quantity: _quantity,
            metadata: _metadata
        });

        emit UnitCreated(unitId, _parentId, _level, _owner);
        return unitId;
    }

    function initiateTransfer(uint256 _id, address _receiver) external onlyCurrentOwner(_id) {
        require(units[_id].status == Status.Active, "Unit not active");
        require(hasRole(MANUFACTURER_ROLE, _receiver) || hasRole(HANDLER_ROLE, _receiver), "Receiver is not authorized");

        units[_id].pendingReceiver = _receiver;
        units[_id].status = Status.PendingTransfer;

        emit TransferInitiated(_id, msg.sender, _receiver);
    }

    function acceptTransfer(uint256 _id) external {
        require(units[_id].status == Status.PendingTransfer, "No transfer pending");
        require(units[_id].pendingReceiver == msg.sender, "You are not the pending receiver");

        address previousOwner = units[_id].currentOwner;
        units[_id].currentOwner = msg.sender;
        units[_id].pendingReceiver = address(0);
        units[_id].status = Status.Active;

        emit TransferCompleted(_id, previousOwner, msg.sender);
    }

    function rejectTransfer(uint256 _id) external {
        require(units[_id].status == Status.PendingTransfer, "No transfer pending");
        require(units[_id].pendingReceiver == msg.sender, "You are not the pending receiver");

        units[_id].pendingReceiver = address(0);
        units[_id].status = Status.Rejected;

        emit TransferRejected(_id, units[_id].currentOwner, msg.sender);
    }

    function markAsSold(uint256 _id) external onlyCurrentOwner(_id) {
        require(units[_id].status == Status.Active, "Unit is not active");

        units[_id].status = Status.Sold;
        units[_id].pendingReceiver = address(0);

        emit UnitSold(_id, msg.sender);
    }

    function getChildren(uint256 _parentId) external view returns (uint256[] memory) {
        return children[_parentId];
    }

    function getUnitDetails(uint256 _id) external view returns (Unit memory) {
        require(_id > 0 && _id <= unitCounter, "Unit does not exist");
        return units[_id];
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}