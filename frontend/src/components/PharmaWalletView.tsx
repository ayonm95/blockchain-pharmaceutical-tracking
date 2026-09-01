"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import styles from "@/app/page.module.css";
import { PHARMA_TREE_ABI, PHARMA_TREE_CONTRACT, unitLevelToName, unitStatusToName } from "@/lib/pharmaTree";

type ViewMode = "overview" | "transfers" | "inventory" | "create" | "admin";

type UnitRecord = {
  id: string;
  parentId: string;
  rootId: string;
  level: number;
  status: number;
  manufacturer: string;
  currentOwner: string;
  pendingReceiver: string;
  metadata: string;
  quantity: string;
  ownerLabel: string;
};

type HistoryEntry = {
  id: string;
  type: string;
  from?: string;
  to?: string;
  txHash: string;
  blockNumber: number;
};

const WALLET_STORAGE_KEY = "pharmatree-wallet-address";

export function PharmaWalletView({ mode }: { mode: ViewMode }) {
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState<{ manufacturer: boolean; handler: boolean }>({ manufacturer: false, handler: false });
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [status, setStatus] = useState("Connect your wallet to review the chain");
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionUnitId, setActionUnitId] = useState("1");
  const [actionReceiver, setActionReceiver] = useState("");
  const [medicineName, setMedicineName] = useState("Paracetamol");
  const [medicineQuantity, setMedicineQuantity] = useState("100");
  const [roleTarget, setRoleTarget] = useState("");
  const [roleType, setRoleType] = useState<"manufacturer" | "handler">("manufacturer");
  const [selectedStockUnitId, setSelectedStockUnitId] = useState("1");
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState<Record<string, boolean>>({});
  const [modalUnit, setModalUnit] = useState<UnitRecord | null>(null);
  const router = useRouter();

  const readonlyContract = useMemo(
    () =>
      new ethers.Contract(
        PHARMA_TREE_CONTRACT,
        PHARMA_TREE_ABI,
        new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545")
      ),
    []
  );

  useEffect(() => {
    void refreshReadonlyState();
  }, [readonlyContract]);

  async function fetchAllUnits(contract: ethers.Contract): Promise<UnitRecord[]> {
    const count = await contract.unitCounter();
    const unitsList: UnitRecord[] = [];

    for (let index = BigInt(1); index <= count; index++) {
      try {
        const detail = await contract.getUnitDetails(index);
        unitsList.push({
          id: String(index),
          parentId: String(detail[0]),
          rootId: String(detail[1]),
          level: Number(detail[2]),
          manufacturer: detail[3],
          currentOwner: detail[4],
          pendingReceiver: detail[5],
          status: Number(detail[6]),
          metadata: detail[8],
          quantity: String(detail[7]),
          ownerLabel: detail[4],
        } as UnitRecord);
      } catch (error) {
        console.warn(`Unable to read unit ${index.toString()}`, error);
      }
    }

    return unitsList;
  }

  async function refreshReadonlyState() {
    try {
      const mapped = await fetchAllUnits(readonlyContract);
      setUnits(mapped);
    } catch (error) {
      console.error(error);
    }
  }

  async function connectWallet({ silent = false }: { silent?: boolean } = {}) {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setStatus("MetaMask is required");
      return;
    }

    try {
      setLoading(true);
      const provider = (window as any).ethereum;
      const accounts = await provider.request({ method: "eth_accounts" });
      const walletAddress = accounts && accounts.length > 0 ? accounts[0] : await provider.request({ method: "eth_requestAccounts" }).then((nextAccounts: string[]) => nextAccounts[0]);

      if (!walletAddress) {
        if (!silent) {
          setStatus("No wallet account available in MetaMask.");
        }
        return;
      }

      const browserProvider = new ethers.BrowserProvider(provider);
      const signer = await browserProvider.getSigner(walletAddress);
      const signerContract = new ethers.Contract(PHARMA_TREE_CONTRACT, PHARMA_TREE_ABI, signer);

      setContract(signerContract);
      setAccount(walletAddress);
      setConnected(true);
      localStorage.setItem(WALLET_STORAGE_KEY, walletAddress);
      await loadWalletData(walletAddress, signerContract);
      setStatus(`Connected as ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
    } catch (error) {
      console.error(error);
      if (!silent) {
        setStatus("Wallet connection failed. Open MetaMask and approve the connection.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const provider = (window as any).ethereum;
    const autoConnect = async () => {
      try {
        const accounts = provider ? await provider.request({ method: "eth_accounts" }) : [];
        if (accounts && accounts.length > 0) {
          await connectWallet({ silent: true });
        } else {
          const savedWallet = window.localStorage.getItem(WALLET_STORAGE_KEY);
          if (savedWallet) {
            await connectWallet({ silent: true });
          }
        }
      } catch (error) {
        console.warn("Auto-connect failed", error);
      }
    };

    void autoConnect();

    if (!provider) {
      return;
    }

    const handleAccountsChanged = (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        setAccount("");
        setConnected(false);
        setRole({ manufacturer: false, handler: false });
        setIsAdmin(false);
        setPendingApprovalCount(0);
        setHistory([]);
        setUnits([]);
        window.localStorage.removeItem(WALLET_STORAGE_KEY);
        setStatus("Wallet disconnected");
        return;
      }

      window.localStorage.setItem(WALLET_STORAGE_KEY, accounts[0]);
      void connectWallet({ silent: true });
    };

    provider.on("accountsChanged", handleAccountsChanged);
    return () => provider.removeListener("accountsChanged", handleAccountsChanged);
  }, []);

  useEffect(() => {
    if (!isAdmin && role.manufacturer && roleType !== "handler") {
      setRoleType("handler");
    }
  }, [isAdmin, role.manufacturer, roleType]);

  function StockDonutChart({ activeCount, pendingCount, soldCount }: { activeCount: number; pendingCount: number; soldCount: number }) {
    const total = activeCount + pendingCount + soldCount;
    const activePct = total > 0 ? (activeCount / total) * 100 : 0;
    const pendingPct = total > 0 ? (pendingCount / total) * 100 : 0;

    // Calculate SVG stroke offset for the pending slice
    const pendingOffset = 100 - activePct;

    return (
      <div style={{ position: 'relative', width: 68, height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          {/* Base Layer: Sold Units (Light Slate) */}
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="4"
          />
          {/* Layer 2: Pending Transfers (Amber / Yellow) */}
          {pendingPct > 0 && (
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="4"
              strokeDasharray={`${pendingPct + activePct}, 100`}
              strokeDashoffset={-activePct}
            />
          )}
          {/* Layer 1: Active Units (Teal / Emerald) */}
          {activePct > 0 && (
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#0d9488"
              strokeWidth="4"
              strokeDasharray={`${activePct}, 100`}
            />
          )}
        </svg>
        {/* Center Percentage Display */}
        <span style={{ position: 'absolute', fontSize: '10px', fontWeight: 700, color: '#0f172a' }}>
          {total > 0 ? `${Math.round(activePct)}%` : '0%'}
        </span>
      </div>
    );
  }

  async function loadWalletData(walletAddress: string, signerContract: ethers.Contract) {
    try {
      const [manufacturer, handler, adminAddress] = await Promise.all([
        signerContract.isManufacturer(walletAddress),
        signerContract.isHandler(walletAddress),
        signerContract.admin(),
      ]);
      setRole({ manufacturer, handler });
      setIsAdmin(adminAddress.toLowerCase() === walletAddress.toLowerCase());

      const allUnits = await fetchAllUnits(signerContract);
      const unitDetails = allUnits.filter((unit) => {
        const lowerWallet = walletAddress.toLowerCase();
        return (
          unit.manufacturer.toLowerCase() === lowerWallet ||
          unit.currentOwner.toLowerCase() === lowerWallet ||
          unit.pendingReceiver.toLowerCase() === lowerWallet
        );
      });

      const createdByUser = unitDetails.filter((unit) => unit.manufacturer.toLowerCase() === walletAddress.toLowerCase());
      const ownedUnits = unitDetails.filter((unit) => unit.currentOwner.toLowerCase() === walletAddress.toLowerCase());
      const pendingIncoming = unitDetails.filter(
        (unit) => unit.pendingReceiver.toLowerCase() === walletAddress.toLowerCase() && unit.status === 1
      );
      const pendingTransfers = allUnits.filter(
        (unit) => unit.status === 1 && (
          unit.currentOwner.toLowerCase() === walletAddress.toLowerCase() ||
          unit.pendingReceiver.toLowerCase() === walletAddress.toLowerCase()
        )
      );

      const syntheticHistory: HistoryEntry[] = unitDetails.map((unit) => {
        const targetAddress =
          unit.pendingReceiver !== "0x0000000000000000000000000000000000000000" ? unit.pendingReceiver : unit.currentOwner;
        const normalizedTarget =
          targetAddress && targetAddress !== "0x0000000000000000000000000000000000000000" ? targetAddress : undefined;

        return {
          id: unit.id,
          type: unit.status === 1 ? "TransferInitiated" : unit.status === 2 ? "UnitSold" : unit.status === 3 ? "TransferRejected" : "CurrentState",
          from: unit.manufacturer,
          to: normalizedTarget,
          txHash: "state-read",
          blockNumber: 0,
        };
      });
      setUnits(allUnits);
      setHistory(syntheticHistory.filter((entry) => {
        const fromIsUser = entry.from?.toLowerCase() === walletAddress.toLowerCase();
        const toIsUser = entry.to?.toLowerCase() === walletAddress.toLowerCase();
        return (fromIsUser || toIsUser) && Boolean(entry.to || entry.from);
      }));
      setPendingApprovalCount(pendingTransfers.length);

      if (createdByUser.length === 0 && ownedUnits.length === 0 && pendingIncoming.length === 0) {
        setStatus(`Connected. No medicines or transfers found for ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
      }
    } catch (error) {
      console.error(error);
      setStatus("Unable to fetch chain data");
    }
  }

  async function handleCreateMedicine() {
    if (!contract || !account) {
      setStatus("Connect a wallet before creating a medicine.");
      return;
    }

    if (!role.manufacturer && !isAdmin) {
      setStatus("Only the manufacturer/admin role can create medicine units.");
      return;
    }

    const name = medicineName.trim();
    const quantity = medicineQuantity.trim();
    if (!name || !quantity) {
      setStatus("Add a medicine name and tablet count before creating a unit.");
      return;
    }

    try {
      setLoading(true);
      const metadata = `${name}, ${quantity} tablets`;
      const tx = await contract.createRootUnit(0, metadata);
      await tx.wait();
      setStatus(`Medicine created successfully: ${name} (${quantity} tablets)`);
      setMedicineName("Paracetamol");
      setMedicineQuantity("100");
      await loadWalletData(account, contract);
    } catch (error) {
      console.error(error);
      setStatus("Unable to create medicine. Check the connected wallet role and contract address.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleAssignment() {
    if (!contract || !account) {
      setStatus("Connect a wallet before assigning roles.");
      return;
    }

    if (!isAdmin && !role.manufacturer) {
      setStatus("Only the admin wallet or manufacturer can assign roles.");
      return;
    }

    if (roleType === "manufacturer" && !isAdmin) {
      setStatus("Only the admin wallet may assign manufacturer roles.");
      return;
    }

    if (!ethers.isAddress(roleTarget)) {
      setStatus("Enter a valid target wallet address.");
      return;
    }

    try {
      setLoading(true);
      const tx = roleType === "manufacturer"
        ? await contract.addManufacturer(roleTarget)
        : await contract.addHandler(roleTarget);
      await tx.wait();
      setStatus(`${roleType === "manufacturer" ? "Manufacturer" : "Handler"} role granted to ${roleTarget}.`);
      setRoleTarget("");
      await loadWalletData(account, contract);
    } catch (error) {
      console.error(error);
      setStatus(`Role assignment failed for ${roleType}.`);
    } finally {
      setLoading(false);
    }
  }

  async function handleTransferAction(action: "initiate" | "accept" | "reject" | "sell") {
    if (!contract || !account) {
      setStatus("Connect a wallet before attempting a transfer action.");
    
      return;
    }
    

    const unitId = Number(actionUnitId);
    if (!Number.isFinite(unitId) || unitId < 0) {
      setStatus("Use a valid medicine ID.");
      return;
    }

    try {
      setLoading(true);
      let tx;

      if (action === "initiate") {
        if (!actionReceiver.trim()) {
          setStatus("Enter a receiver wallet before initiating a transfer.");
          return;
        }
        if (!role.manufacturer && !role.handler) {
          setStatus("Only a manufacturer or handler can initiate transfers.");
          return;
        }
        tx = await contract.initiateTransfer(unitId, actionReceiver);
      } else if (action === "accept") {
        if (!role.manufacturer && !role.handler) {
          setStatus("Only a manufacturer or handler can accept transfers.");
          return;
        }
        tx = await contract.acceptTransfer(unitId);
      } else if (action === "reject") {
        if (!role.manufacturer && !role.handler) {
          setStatus("Only a manufacturer or handler can reject transfers.");
          return;
        }
        tx = await contract.rejectTransfer(unitId);
      } else {
        if (!role.manufacturer && !role.handler) {
          setStatus("Only a manufacturer or handler can mark medicine as sold.");
          return;
        }
        tx = await contract.markAsSold(unitId);
      }

      await tx.wait();
      setStatus(`Transfer action succeeded: ${action}. Reloading data...`);
      setActionReceiver("");
      await loadWalletData(account, contract);
    } catch (error) {
      console.error(error);
      setStatus(`Could not complete ${action}. Confirm the wallet role and action target.`);
    } finally {
      setLoading(false);
    }
  }
  const formatAddress = (addr?: string) => {
    if (!addr || addr === "0x0000000000000000000000000000000000000000") return "-";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const createdByUser = useMemo(
    () => units.filter((unit) => unit.manufacturer.toLowerCase() === account.toLowerCase()),
    [account, units]
  );

  const ownedUnits = useMemo(
    () => units.filter((unit) => unit.currentOwner.toLowerCase() === account.toLowerCase()),
    [account, units]
  );

  const pendingIncoming = useMemo(
    () => units.filter((unit) => unit.pendingReceiver.toLowerCase() === account.toLowerCase() && unit.status === 1),
    [account, units]
  );

  const pendingTransferUnits = useMemo(
    () =>
      units.filter(
        (unit) =>
          unit.status === 1 &&
          (unit.currentOwner.toLowerCase() === account.toLowerCase() || unit.pendingReceiver.toLowerCase() === account.toLowerCase())
      ),
    [account, units]
  );

  const availableStockUnits = useMemo(
    () => units.filter((unit) => unit.status === 0 && unit.currentOwner.toLowerCase() === account.toLowerCase()),
    [account, units]
  );

  const userUnits = useMemo(
    () =>
      units.filter(
        (unit) =>
          unit.manufacturer.toLowerCase() === account.toLowerCase() ||
          unit.currentOwner.toLowerCase() === account.toLowerCase() ||
          unit.pendingReceiver.toLowerCase() === account.toLowerCase()
      ),
    [account, units]
  );

  const visibleHistory = useMemo(
    () => history.filter((entry) => entry.txHash),
    [history]
  );

  const canCreateMedicine = Boolean(account) && (role.manufacturer || isAdmin);

  return (
    <div className={styles.appShell}>
      <header className={styles.topbar}>
        <div className={styles.brandWrap}>
          <div className={styles.brandMark}>✚</div>
          <div className={styles.brandName}>PHARMATREE</div>
        </div>

        <div className={styles.headerCenter}>
          <div className={styles.pageHeading}>Supply-chain Control Centre</div>
        </div>

        <div className={styles.headerActions}>
          <button className={styles.primaryButton} onClick={() => void connectWallet()} disabled={loading}>
            {loading ? "Connecting..." : connected ? "Reconnect wallet" : "Reconnect wallet"}
          </button>
          <button type="button" className={styles.notifyButton} aria-label="Pending transfers" onClick={() => router.push('/transfers')}>
            <span>🔔</span>
            {pendingApprovalCount > 0 && <strong>{pendingApprovalCount}</strong>}
          </button>
          <div className={styles.avatar}>A</div>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <nav className={styles.sideNav}>
            <Link className={`${styles.sideItem} ${mode === "overview" ? styles.sideItemActive : ""}`} href="/">
              <span className={styles.icon}>🏠</span>
              <span>Overview</span>
            </Link>
            {(role.manufacturer || isAdmin) && (
              <Link
                className={`${styles.sideItem} ${mode === "create" ? styles.sideItemActive : ""}`}
                href="/create"
              >
                <span className={styles.icon}>🧴</span>
                <span>Create Unit</span>
              </Link>
            )}
            <Link className={`${styles.sideItem} ${mode === "admin" ? styles.sideItemActive : ""}`} href="/admin">
              <span className={styles.icon}>🛡️</span>
              <span>Admin</span>
            </Link>
            <Link className={`${styles.sideItem} ${mode === "transfers" ? styles.sideItemActive : ""}`} href="/transfers">
              <span className={styles.icon}>🔁</span>
              <span>Transfers</span>
            </Link>
            <Link className={`${styles.sideItem} ${mode === "inventory" ? styles.sideItemActive : ""}`} href="/inventory">
              <span className={styles.icon}>📦</span>
              <span>Inventory</span>
            </Link>
          </nav>
        </aside>

        <main className={styles.mainPanel}>
          <section className={styles.summaryRow}>
            <article className={styles.summaryCard}> 
              <span>Wallet</span>
              <strong>{account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Not connected"}</strong>
            </article>
            <article className={styles.summaryCard}>
              <span>Role</span>
              <strong>
                {role.manufacturer && role.handler
                  ? "Manufacturer + Handler"
                  : role.manufacturer
                    ? "Manufacturer"
                    : role.handler
                      ? "Handler"
                      : "Unassigned"}
              </strong>
            </article>
            <article className={styles.summaryCard} onClick={() => router.push('/transfers')} style={{cursor:'pointer'}}>
              <span>Pending Transfers</span>
              <strong className={styles.healthOk}>{pendingApprovalCount}</strong>
            </article>
          </section>

          {pendingIncoming.length > 0 && (
            <div className={styles.alertBox}>
              <strong>Action required:</strong> {pendingIncoming.length} transfer(s) are awaiting your acceptance.
            </div>
          )}

          {mode === "overview" && (
            <div className={styles.cardGrid}>
              {/* SHOW ONLY IF MANUFACTURER OR ADMIN */}
              {(role.manufacturer || isAdmin) && (
                <section className={`${styles.featurePanel} ${styles.featurePanelAccent}`}>
                  <div className={styles.panelHeader}>
                    <div className={styles.panelIcon}>💊</div>
                    <div>
                      <h2>My Created Medicines</h2>
                      <p>Active production, batch history &amp; quality compliance.</p>
                    </div>
                  </div>

                  {createdByUser.length === 0 ? (
                    <p className={styles.empty}>No medicines created by this wallet yet.</p>
                  ) : (
                    <div className={styles.dataTable}>
                      <div className={styles.tableHead} style={{ color: '#334155' }}>
                        <span>ID</span>
                        <span>Medicine</span>
                        <span>Qty</span>
                        <span>Created</span>
                        <span>Status</span>
                      </div>
                      {createdByUser.map((unit) => {
                        const medName = (unit.metadata || "").split(",")[0] || unit.metadata;
                        return (
                          <div className={styles.tableRow} key={unit.id}>
                            <span>#{unit.id}</span>
                            <span>{medName}</span>
                            <span>{unit.quantity}</span>
                            <span>—</span>
                            <span className={styles.statusBadge}>{unitStatusToName(unit.status)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className={styles.footerRow}>
                    <div>
                      <span>Units Created This Quarter:</span>
                      <strong>{createdByUser.length}</strong>
                    </div>
                    <button
                      className={`${styles.primaryButton} ${!canCreateMedicine ? styles.primaryButtonDisabled : ""}`}
                      onClick={() => window.location.assign("/create")}
                      disabled={!canCreateMedicine}
                    >
                      Create New Unit
                    </button>
                  </div>
                </section>
              )}

              {/* MY OWNED INVENTORY (ALWAYS VISIBLE) */}
              <section className={styles.featurePanel}>
                <div className={styles.panelHeader}>
                  <div className={styles.panelIcon}>📦</div>
                  <div>
                    <h2>My Owned Inventory</h2>
                    <p>On-hand stock, storage locations &amp; asset details.</p>
                  </div>
                </div>

                {ownedUnits.length === 0 ? (
                  <p className={styles.empty}>No active ownership records.</p>
                ) : (
                  <div className={styles.dataTable}>
                    <div className={styles.tableHead} style={{ color: '#334155' }}>
                      <span>ID</span>
                      <span>Medicine</span>
                      <span>Qty</span>
                      <span>Location</span>
                      <span>Received</span>
                    </div>
                    {ownedUnits.map((unit) => {
                      const medName = (unit.metadata || "").split(",")[0] || unit.metadata;
                      return (
                        <div className={styles.tableRow} key={unit.id}>
                          <span>#{unit.id}</span>
                          <span>{medName}</span>
                          <span>{unit.quantity}</span>
                          <span>WARE-H</span>
                          <span>—</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {(() => {
                  const lowerWallet = account.toLowerCase();

                  // Active units in inventory (Status 0)
                  const activeCount = userUnits.filter((u) => u.status === 0 && u.currentOwner.toLowerCase() === lowerWallet).length;

                  // Pending transfers waiting acceptance/rejection (Status 1)
                  const pendingCount = userUnits.filter((u) => u.status === 1 && (u.currentOwner.toLowerCase() === lowerWallet || u.pendingReceiver.toLowerCase() === lowerWallet)).length;

                  // Sold units (Status 2)
                  const soldCount = userUnits.filter((u) => u.status === 2 && u.currentOwner.toLowerCase() === lowerWallet).length;

                  return (
                    <div className={styles.footerRow} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span>Total Stock Volume:</span>
                        <strong style={{ display: 'block' }}>
                          {ownedUnits.reduce((sum, unit) => sum + Number(unit.quantity || 0), 0)} Units
                        </strong>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ color: '#0d9488', fontWeight: 600 }}>● {activeCount} Active</span>
                          <span style={{ color: '#f59e0b', fontWeight: 600 }}>● {pendingCount} Pending</span>
                          <span style={{ color: '#64748b', fontWeight: 600 }}>● {soldCount} Sold</span>
                        </div>
                      </div>
                      <StockDonutChart activeCount={activeCount} pendingCount={pendingCount} soldCount={soldCount} />
                    </div>
                  );
                })()}
              </section>
            </div>
          )}

          {mode === "create" && (
            <section className={styles.panel}>
              <h2>Create medicine unit</h2>
              {!account ? (
                <p className={styles.empty}>Connect a wallet to create a medicine.</p>
              ) : !role.manufacturer && !isAdmin ? (
                <div className={styles.empty} style={{ textAlign: "center", padding: "32px 16px" }}>
                  <h3>Access Denied</h3>
                  <p style={{ marginTop: "8px", color: "#64748b" }}>
                    Only registered Manufacturers or System Admins can create new medicine units.
                  </p>
                </div>
              ) : (
                <>
                  <div className={styles.formGrid}>
                    <div className={styles.fieldGroup}>
                      <label>Product name</label>
                      <input
                        value={medicineName}
                        onChange={(event) => setMedicineName(event.target.value)}
                        placeholder="Paracetamol"
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label>Quantity</label>
                      <input
                        value={medicineQuantity}
                        onChange={(event) => setMedicineQuantity(event.target.value)}
                        placeholder="100"
                      />
                    </div>
                  </div>

                  <div className={styles.sampleList}>
                    {[
                      { name: "Paracetamol", quantity: "100" },
                      { name: "Amoxicillin", quantity: "50" },
                      { name: "Ibuprofen", quantity: "75" },
                      { name: "Vitamin D", quantity: "120" },
                    ].map((item) => (
                      <button
                        key={item.name}
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() => {
                          setMedicineName(item.name);
                          setMedicineQuantity(item.quantity);
                        }}
                      >
                        {item.name} · {item.quantity} tablets
                      </button>
                    ))}
                  </div>

                  <div className={styles.buttonRow}>
                    <button
                      className={`${styles.primaryButton} ${loading || !canCreateMedicine ? styles.primaryButtonDisabled : ""}`}
                      onClick={() => void handleCreateMedicine()}
                      disabled={loading || !canCreateMedicine}
                    >
                      {loading ? "Creating..." : "Create medicine unit"}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {mode === "admin" && (
            <section className={styles.panel}>
              <h2>{(role.handler && !isAdmin && !role.manufacturer) ? 'Add Handler' : 'Role management'}</h2>
              {!account ? (
                <p className={styles.empty}>Connect a wallet to manage roles.</p>
              ) : !isAdmin && !role.manufacturer ? (
                <p className={styles.empty}>Only the admin wallet or manufacturer role can grant access.</p>
              ) : (
                <>
                  <div className={styles.formGrid}>
                    <div className={styles.fieldGroup}>
                      <label>Target wallet</label>
                      <input value={roleTarget} onChange={(event) => setRoleTarget(event.target.value)} placeholder="0x..." />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label>{(role.handler && !isAdmin && !role.manufacturer) ? "Add Handler" : "Assign role"}</label>
                      { (role.handler && !isAdmin && !role.manufacturer) ? (
                        <div style={{paddingTop:6}}>Handler (you can add another handler)</div>
                      ) : (
                        <select value={roleType} onChange={(event) => setRoleType(event.target.value as "manufacturer" | "handler")}>
                          <option value="manufacturer" disabled={!isAdmin}>Manufacturer</option>
                          <option value="handler">Handler</option>
                        </select>
                      )}
                    </div>
                  </div>
                  <div className={styles.buttonRow}>
                    <button
                      className={`${styles.primaryButton} ${loading ? styles.primaryButtonDisabled : ""}`}
                      onClick={() => void handleRoleAssignment()}
                      disabled={loading}
                    >
                      { (role.handler && !isAdmin && !role.manufacturer) ? "Add handler" : "Grant role" }le
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {mode === "transfers" && (
            <div className={styles.transferGrid}>
              <section className={styles.panel}>
                <h2>Pending transfer actions</h2>
                {pendingTransferUnits.length === 0 ? (
                  <p className={styles.empty}>No pending transfers require action for this wallet.</p>
                ) : (
                  <div className={styles.inventoryGrid}>
                    {pendingTransferUnits.map((unit) => {
                      const medName = (unit.metadata || "").split(",")[0] || unit.metadata;
                      return (
                        <article key={unit.id} className={styles.transferTile} onClick={() => setModalUnit(unit)}>
                          <div className={styles.tileHeader}>
                            <div className={styles.tileTitle}>{medName}</div>
                            <div className={styles.tileMeta}>Unit #{unit.id}</div>
                          </div>
                          <div className={styles.tileBody}>
                            <div><strong>From:</strong> {unit.currentOwner}</div>
                            <div><strong>To:</strong> {unit.pendingReceiver || "-"}</div>
                            <div><strong>Status:</strong> {unitStatusToName(unit.status)}</div>
                          </div>
                          <div style={{marginTop:10}}>
                            <button className={styles.secondaryButton} onClick={(e) => { e.stopPropagation(); setModalUnit(unit); }}>View details</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className={styles.panel}>
                <h2>Transfer and sale actions</h2>
                <div className={styles.formGrid}>
                  <div className={styles.fieldGroup}>
                    <label>Medicine ID</label>
                    <input value={actionUnitId} onChange={(event) => setActionUnitId(event.target.value)} placeholder="1" />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label>Receiver wallet</label>
                    <input value={actionReceiver} onChange={(event) => setActionReceiver(event.target.value)} placeholder="0x..." />
                  </div>
                </div>

                <div className={styles.buttonRow}>
                  <button onClick={() => void handleTransferAction("initiate")} disabled={!account || (!role.manufacturer && !role.handler)}>
                    Initiate transfer
                  </button>
                  <button onClick={() => void handleTransferAction("sell")} disabled={!account || (!role.manufacturer && !role.handler)}>
                    Mark as sold
                  </button>
                </div>

                <h3 className={styles.subHeading}>Medicine in stock</h3>
                {availableStockUnits.length === 0 ? (
                  <p className={styles.empty}>No active stock for this wallet yet.</p>
                ) : (
                  <div className={styles.inventoryGrid}>
                    {availableStockUnits.map((unit) => {
                      const medName = (unit.metadata || "").split(",")[0] || unit.metadata;
                      return (
                        <button key={unit.id} type="button" className={styles.stockButton} onClick={() => {
                          setActionUnitId(unit.id);
                          setActionReceiver("");
                        }}>
                          <div>{medName}</div>
                          <div>Unit #{unit.id}</div>
                          <div>Qty {unit.quantity}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* History tiles */}
              <section className={styles.panel} style={{marginTop:16}}>
                <h2>Recent activity</h2>
                {visibleHistory.length === 0 ? (
                  <p className={styles.empty}>No recent activity for this wallet.</p>
                ) : (
                  <div className={styles.inventoryGrid}>
                      {visibleHistory.map((entry) => {
                        const unit = units.find((u) => u.id === entry.id);
                        const medName = unit ? (unit.metadata || "").split(",")[0] : `Unit ${entry.id}`;
                        return (
                          <article key={`${entry.id}-${entry.txHash}`} className={styles.transferTile} onClick={() => setModalUnit(unit || null)}>
                            <div className={styles.tileHeader}>
                              <div className={styles.tileTitle}>{medName}</div>
                              <div className={styles.tileMeta}>{entry.type}</div>
                            </div>
                            <div className={styles.tileBody}>
                              <div><strong>Unit:</strong> {entry.id}</div>
                              <div><strong>From:</strong> <span style={{ fontFamily: 'monospace' }}>{formatAddress(entry.from)}</span></div>
                              <div><strong>To:</strong> <span style={{ fontFamily: 'monospace' }}>{formatAddress(entry.to)}</span></div>
                            </div>
                          </article>
                        );
                      })}
                  </div>
                )}
              </section>

            </div>
          )}

          {mode === "inventory" && (
            <section className={styles.panel}>
              <h2>Medicine inventory</h2>
              {userUnits.length === 0 ? (
                <p className={styles.empty}>No medicine records for this account.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                  {userUnits.map((unit) => {
                    const isExpanded = !!expandedUnits[unit.id];
                    const unitHistoryLogs = history.filter((h) => h.id === unit.id);
                    const medName = (unit.metadata || "").split(",")[0] || unit.metadata;
                    const truncate = (addr: string) =>
                      addr && addr !== "0x0000000000000000000000000000000000000000"
                        ? `${addr.slice(0, 6)}...${addr.slice(-4)}`
                        : "None";

                    return (
                      <article
                        key={unit.id}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          padding: '16px',
                          backgroundColor: '#ffffff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}
                      >
                        {/* Clickable Tile Header */}
                        <div
                          onClick={() => setExpandedUnits((prev) => ({ ...prev, [unit.id]: !prev[unit.id] }))}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>UNIT #{unit.id}</span>
                            <span style={{ fontSize: '14px', color: '#64748b' }}>({medName})</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span className={styles.statusBadge}>{unitStatusToName(unit.status)}</span>
                            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 'bold' }}>
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          </div>
                        </div>

                        {/* Collapsible Content */}
                        {isExpanded && (
                          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <p style={{ margin: 0, color: '#334155' }}>
                              <strong>Manufacturer:</strong> <span style={{ fontFamily: 'monospace' }}>{truncate(unit.manufacturer)}</span>
                            </p>
                            <p style={{ margin: 0, color: '#334155' }}>
                              <strong>Current Owner:</strong> <span style={{ fontFamily: 'monospace' }}>{truncate(unit.currentOwner)}</span>
                            </p>
                            <p style={{ margin: 0, color: '#334155' }}>
                              <strong>Pending Receiver:</strong> <span style={{ fontFamily: 'monospace' }}>{truncate(unit.pendingReceiver)}</span>
                            </p>
                            <p style={{ margin: 0, color: '#334155' }}><strong>Quantity:</strong> {unit.quantity}</p>
                            <p style={{ margin: 0, color: '#334155' }}><strong>Container Level:</strong> {unitLevelToName(unit.level)}</p>
                            <p style={{ margin: 0, color: '#334155' }}><strong>Metadata:</strong> {unit.metadata}</p>

                            {/* Unit History */}
                            <div style={{ marginTop: '12px', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                              <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Transfer History</h4>
                              {unitHistoryLogs.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {unitHistoryLogs.map((log, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'monospace' }}>
                                      <span>{log.type}</span>
                                      <span>{truncate(log.from || "")} ➔ {truncate(log.to || "")}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>No transfer events recorded yet.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {modalUnit && (
        <div className={styles.unitModalBackdrop} onClick={() => setModalUnit(null)}>
          <div className={styles.unitModalContent} onClick={(e) => e.stopPropagation()}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <h3 style={{margin:0}}>{(modalUnit.metadata || "").split(",")[0] || `Unit ${modalUnit.id}`}</h3>
              <button className={styles.modalClose} onClick={() => setModalUnit(null)}>✕</button>
            </div>
            <div style={{marginTop:12}}>
              <p><strong>Unit ID:</strong> {modalUnit.id}</p>
              <p><strong>Manufacturer:</strong> {modalUnit.manufacturer}</p>
              <p><strong>Current owner:</strong> {modalUnit.currentOwner}</p>
              <p><strong>Pending receiver:</strong> {modalUnit.pendingReceiver || 'None'}</p>
              <p><strong>Quantity:</strong> {modalUnit.quantity}</p>
              <p><strong>Status:</strong> {unitStatusToName(modalUnit.status)}</p>
              <p><strong>Metadata:</strong> {modalUnit.metadata}</p>

              {modalUnit.status === 1 && modalUnit.pendingReceiver.toLowerCase() === account.toLowerCase() && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button
                    className={styles.primaryButton}
                    onClick={async () => {
                      if (!modalUnit) return;
                      setActionUnitId(modalUnit.id);
                      setActionReceiver(modalUnit.pendingReceiver);
                      await handleTransferAction('accept');
                      setModalUnit(null);
                    }}
                    disabled={!account || (!role.manufacturer && !role.handler)}
                  >
                    Accept
                  </button>
                  <button
                    className={styles.secondaryButton}
                    onClick={async () => {
                      if (!modalUnit) return;
                      setActionUnitId(modalUnit.id);
                      await handleTransferAction('reject');
                      setModalUnit(null);
                    }}
                    disabled={!account || (!role.manufacturer && !role.handler)}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
