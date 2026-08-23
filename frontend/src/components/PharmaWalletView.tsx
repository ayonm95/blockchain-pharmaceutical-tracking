"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import styles from "@/app/page.module.css";
import { PHARMA_TREE_ABI, PHARMA_TREE_CONTRACT, unitLevelToName, unitStatusToName } from "@/lib/pharmaTree";

type ViewMode = "overview" | "transfers" | "inventory";

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

  async function connectWallet() {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setStatus("MetaMask is required");
      return;
    }

    try {
      setLoading(true);
      const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await browserProvider.getSigner();
      const walletAddress = await signer.getAddress();
      const signerContract = new ethers.Contract(PHARMA_TREE_CONTRACT, PHARMA_TREE_ABI, signer);

      setContract(signerContract);
      setAccount(walletAddress);
      setConnected(true);
      await loadWalletData(walletAddress, signerContract);
      setStatus(`Connected as ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
    } catch (error) {
      console.error(error);
      setStatus("Wallet connection failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadWalletData(walletAddress: string, signerContract: ethers.Contract) {
    try {
      const [manufacturer, handler] = await Promise.all([
        signerContract.isManufacturer(walletAddress),
        signerContract.isHandler(walletAddress),
      ]);
      setRole({ manufacturer, handler });

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
      }));      setPendingApprovalCount(pendingIncoming.length);

      if (createdByUser.length === 0 && ownedUnits.length === 0 && pendingIncoming.length === 0) {
        setStatus(`Connected. No medicines or transfers found for ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
      }
    } catch (error) {
      console.error(error);
      setStatus("Unable to fetch chain data");
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
        tx = await contract.initiateTransfer(unitId, actionReceiver);
      } else if (action === "accept") {
        tx = await contract.acceptTransfer(unitId);
      } else if (action === "reject") {
        tx = await contract.rejectTransfer(unitId);
      } else {
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

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>PharmaTree</p>
          <h1>Supply-chain Control Centre</h1>
        </div>

        <nav className={styles.nav}>
          <Link className={mode === "overview" ? styles.navActive : ""} href="/">Overview</Link>
          <Link className={mode === "transfers" ? styles.navActive : ""} href="/transfers">Transfers</Link>
          <Link className={mode === "inventory" ? styles.navActive : ""} href="/inventory">Inventory</Link>
        </nav>

        <button className={styles.primaryButton} onClick={connectWallet} disabled={loading}>
          {loading ? "Connecting..." : connected ? "Reconnect wallet" : "Connect MetaMask"}
        </button>
      </header>

      <section className={styles.summaryGrid}>
        <article className={styles.card}> 
          <span>Wallet</span>
          <strong>{account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Not connected"}</strong>
        </article>
        <article className={styles.card}>
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
        <article className={styles.card}>
          <span>Pending approvals</span>
          <strong>{pendingApprovalCount}</strong>
        </article>
        <article className={styles.card}>
          <span>Status</span>
          <strong>{status}</strong>
        </article>
      </section>

      {pendingIncoming.length > 0 && (
        <section className={styles.alertBox}>
          <strong>Action required:</strong> {pendingIncoming.length} transfer(s) await your acceptance.
        </section>
      )}

      {mode === "overview" && (
        <div className={styles.grid}>
          <section className={styles.panel}>
            <h2>Created by this wallet</h2>
            {createdByUser.length === 0 ? (
              <p className={styles.empty}>No medicines created by this wallet yet.</p>
            ) : (
              <div className={styles.listTable}>
                {createdByUser.map((unit) => (
                  <div key={unit.id} className={styles.listRow}>
                    <div>
                      <strong>Unit #{unit.id}</strong>
                      <span>{unitLevelToName(unit.level)}</span>
                    </div>
                    <div>
                      <span>{unitStatusToName(unit.status)}</span>
                    </div>
                    <div>
                      <span>Qty {unit.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <h2>Owned by this wallet</h2>
            {ownedUnits.length === 0 ? (
              <p className={styles.empty}>No active ownership records.</p>
            ) : (
              <div className={styles.listTable}>
                {ownedUnits.map((unit) => (
                  <div key={unit.id} className={styles.listRow}>
                    <div>
                      <strong>Unit #{unit.id}</strong>
                      <span>{unit.metadata}</span>
                    </div>
                    <div>
                      <span>{unitStatusToName(unit.status)}</span>
                    </div>
                    <div>
                      <span>Qty {unit.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {mode === "transfers" && (
        <section className={styles.panel}>
          <h2>Transfer activity</h2>
          <div className={styles.grid} style={{ marginBottom: "1rem" }}>
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
            <button onClick={() => void handleTransferAction("initiate")}>Initiate transfer</button>
            <button onClick={() => void handleTransferAction("accept")}>Accept transfer</button>
            <button onClick={() => void handleTransferAction("reject")}>Reject transfer</button>
            <button onClick={() => void handleTransferAction("sell")}>Mark as sold</button>
          </div>

          {visibleHistory.length === 0 ? (
            <p className={styles.empty}>No transfer transactions for this wallet yet.</p>
          ) : (
            <div className={styles.listTable}>
              {visibleHistory.map((entry, index) => (
                <div className={styles.listRow} key={`${entry.txHash}-${index}`}>
                  <div>
                    <strong>{entry.type}</strong>
                    <span>Unit #{entry.id}</span>
                  </div>
                  <div>
                    <span>{entry.from ? `${entry.from.slice(0, 6)}...${entry.from.slice(-4)}` : "-"}</span>
                    <small>From</small>
                  </div>
                  <div>
                    <span>{entry.to ? `${entry.to.slice(0, 6)}...${entry.to.slice(-4)}` : "No active receiver"}</span>
                    <small>To</small>
                  </div>
                  <div>
                    <span>{entry.blockNumber > 0 ? `Block ${entry.blockNumber}` : "State read"}</span>
                    <small>Source</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {mode === "inventory" && (
        <section className={styles.panel}>
          <h2>Medicine inventory</h2>
          {userUnits.length === 0 ? (
            <p className={styles.empty}>No medicine records for this account.</p>
          ) : (
            <div className={styles.inventoryGrid}>
              {userUnits.map((unit) => (
                <article key={unit.id} className={styles.inventoryCard}>
                  <div className={styles.inventoryHeader}>
                    <span>Unit #{unit.id}</span>
                    <span>{unitLevelToName(unit.level)}</span>
                  </div>
                  <p><strong>Manufacturer:</strong> {unit.manufacturer}</p>
                  <p><strong>Current owner:</strong> {unit.currentOwner}</p>
                  <p><strong>Pending receiver:</strong> {unit.pendingReceiver || "None"}</p>
                  <p><strong>Quantity:</strong> {unit.quantity}</p>
                  <p><strong>Status:</strong> {unitStatusToName(unit.status)}</p>
                  <p><strong>Metadata:</strong> {unit.metadata}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
