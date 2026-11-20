import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  CHAIN_ID_HEX,
  RPC_URL,
  DEFAULT_ADMIN_ROLE,
  MINTER_ROLE,
  explainError,
  isDeployed,
} from "../lib/chain.js";
import MintSingle from "./MintSingle.jsx";
import BatchImport from "./BatchImport.jsx";
import ManageCerts from "./ManageCerts.jsx";

const HARDHAT_CHAIN = {
  chainId: CHAIN_ID_HEX,
  chainName: "Hardhat Local",
  rpcUrls: [RPC_URL],
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

async function ensureHardhatNetwork() {
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (e) {
    const unknown =
      e?.code === 4902 || e?.data?.originalError?.code === 4902 || /unrecognized chain/i.test(e?.message || "");
    if (!unknown) throw e;
    await window.ethereum.request({ method: "wallet_addEthereumChain", params: [HARDHAT_CHAIN] });
  }
}

export default function Admin() {
  const [session, setSession] = useState(null); // { address, isAdmin, isMinter, contract }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sub, setSub] = useState("mint");

  // State pour gestion des rôles par l'administrateur
  const [targetAddress, setTargetAddress] = useState("");
  const [roleStatusMsg, setRoleStatusMsg] = useState("");
  const [roleActionBusy, setRoleActionBusy] = useState(false);

  const connect = useCallback(async () => {
    setError("");
    if (!window.ethereum) {
      setError("MetaMask n'est pas détecté dans ce navigateur. Installez l'extension MetaMask puis rechargez la page.");
      return;
    }
    setBusy(true);
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      await ensureHardhatNetwork();
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const [isAdmin, isMinter] = await Promise.all([
        contract.hasRole(DEFAULT_ADMIN_ROLE, address),
        contract.hasRole(MINTER_ROLE, address),
      ]);

      setSession({
        address,
        isAdmin,
        isMinter,
        canMint: isMinter || isAdmin,
        contract,
      });
    } catch (e) {
      setSession(null);
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const connected = !!session;
  useEffect(() => {
    if (!connected || !window.ethereum?.on) return;
    const onAccounts = (accounts) => (accounts.length === 0 ? setSession(null) : connect());
    const onChain = () => connect();
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, [connected, connect]);

  // Actions de gestion des rôles
  async function handleGrantMinter() {
    if (!ethers.isAddress(targetAddress)) {
      return setRoleStatusMsg("Adresse Ethereum invalide.");
    }
    setRoleActionBusy(true);
    setRoleStatusMsg("");
    try {
      const tx = await session.contract.grantRole(MINTER_ROLE, targetAddress);
      await tx.wait();
      setRoleStatusMsg(`✅ Rôle MINTER_ROLE accordé à ${targetAddress}. Tx: ${tx.hash}`);
      setTargetAddress("");
    } catch (err) {
      setRoleStatusMsg(`❌ Erreur : ${explainError(err)}`);
    } finally {
      setRoleActionBusy(false);
    }
  }

  async function handleRevokeMinter() {
    if (!ethers.isAddress(targetAddress)) {
      return setRoleStatusMsg("Adresse Ethereum invalide.");
    }
    setRoleActionBusy(true);
    setRoleStatusMsg("");
    try {
      const tx = await session.contract.revokeRole(MINTER_ROLE, targetAddress);
      await tx.wait();
      setRoleStatusMsg(`✅ Rôle MINTER_ROLE retiré à ${targetAddress}. Tx: ${tx.hash}`);
      setTargetAddress("");
    } catch (err) {
      setRoleStatusMsg(`❌ Erreur : ${explainError(err)}`);
    } finally {
      setRoleActionBusy(false);
    }
  }

  if (!isDeployed()) {
    return (
      <p className="notice notice-warn">
        Aucun contrat déployé. Lancez « npm run deploy:local » dans le dossier contracts, puis rechargez la page.
      </p>
    );
  }

  if (!session) {
    return (
      <div className="panel">
        <h2>Espace d'Administration & Gestion des Rôles</h2>
        <p className="muted">
          L'émission (<strong>MINTER_ROLE</strong>), la révocation (<strong>DEFAULT_ADMIN_ROLE</strong>) et la gestion
          des permissions nécessitent la connexion d'un compte autorisé via MetaMask sur le réseau Hardhat Local (31337).
        </p>
        <button className="btn" onClick={connect} disabled={busy}>
          {busy ? "Connexion en cours…" : "Connecter MetaMask"}
        </button>
        {error && <p className="notice notice-error">{error}</p>}
      </div>
    );
  }

  const { address, isAdmin, isMinter, canMint } = session;

  return (
    <section className="stack">
      <div className="panel panel-row">
        <div>
          <p className="muted small">Compte connecté</p>
          <p className="mono">{address}</p>
        </div>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          {isAdmin && <span className="badge badge-ok">DEFAULT_ADMIN_ROLE</span>}
          {isMinter && <span className="badge badge-info">MINTER_ROLE</span>}
          {!isAdmin && !isMinter && <span className="badge badge-bad">Non autorisé</span>}
        </div>
      </div>

      {!canMint && !isAdmin && (
        <p className="notice notice-error">
          ⚠️ Ce compte ne possède ni le rôle d'émission (MINTER_ROLE) ni le rôle d'administration (DEFAULT_ADMIN_ROLE).
          Pour émettre ou gérer les diplômes, basculez dans MetaMask sur le compte déployeur (#0 de Hardhat) ou demandez à l'administrateur de vous accorder le rôle MINTER_ROLE.
        </p>
      )}

      {error && <p className="notice notice-error">{error}</p>}

      <nav className="subtabs" role="tablist">
        {[
          ["mint", "Émission unitaire"],
          ["batch", "Import Excel et lots"],
          ["manage", "Gestion et révocation"],
          ["roles", "Gestion des rôles (AccessControl)"],
        ].map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={sub === k}
            className={sub === k ? "active" : ""}
            onClick={() => setSub(k)}
          >
            {label}
          </button>
        ))}
      </nav>

      {sub === "mint" && <MintSingle contract={session.contract} canWrite={canMint} />}
      {sub === "batch" && <BatchImport contract={session.contract} canWrite={canMint} />}
      {sub === "manage" && <ManageCerts contract={session.contract} canRevoke={isAdmin} />}

      {sub === "roles" && (
        <div className="panel">
          <h2>Contrôle d'accès & Séparation des pouvoirs (AccessControl)</h2>
          <p className="muted">
            Le contrat <span className="mono">CertificateRegistry</span> implémente le modèle de sécurité OpenZeppelin AccessControl.
            Seul un compte détenteur de <span className="mono">DEFAULT_ADMIN_ROLE</span> peut octroyer ou révoquer le rôle <span className="mono">MINTER_ROLE</span>.
          </p>

          {!isAdmin && (
            <p className="notice notice-warn">
              ⚠️ Seul un administrateur (<span className="mono">DEFAULT_ADMIN_ROLE</span>) peut attribuer ou révoquer des rôles.
            </p>
          )}

          <div style={{ margin: "1rem 0" }}>
            <label>
              Adresse Ethereum du compte cible :
              <input
                className="mono"
                placeholder="0x…"
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value.trim())}
                disabled={!isAdmin || roleActionBusy}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <button
              className="btn"
              onClick={handleGrantMinter}
              disabled={!isAdmin || roleActionBusy || !targetAddress}
            >
              Accorder MINTER_ROLE
            </button>
            <button
              className="btn btn-ghost"
              onClick={handleRevokeMinter}
              disabled={!isAdmin || roleActionBusy || !targetAddress}
            >
              Révoquer MINTER_ROLE
            </button>
          </div>

          {roleStatusMsg && (
            <p className={`notice ${roleStatusMsg.startsWith("✅") ? "notice-ok" : "notice-error"} mono small`}>
              {roleStatusMsg}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
