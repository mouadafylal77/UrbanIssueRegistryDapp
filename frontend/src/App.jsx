import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import CitizenSpace from "./components/CitizenSpace.jsx";
import MunicipalitySpace from "./components/MunicipalitySpace.jsx";
import BatchImport from "./components/BatchImport.jsx";
import {
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  CONTRACT_CHAIN_ID,
  MUNICIPALITY_ROLE,
  DEFAULT_ADMIN_ROLE,
  ensureNetwork,
  shortAddress,
  isDeployed,
} from "./lib/chain.js";

export default function App() {
  const [tab, setTab] = useState("citizen"); // citizen | municipality | batch
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [isMunicipality, setIsMunicipality] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [networkOk, setNetworkOk] = useState(true);

  // Vérifier et configurer le compte connecté
  const setupAccount = useCallback(async (signer, addr) => {
    try {
      const liveContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      setContract(liveContract);
      setAccount(addr);

      // Vérification des rôles on-chain
      const [hasMuni, hasAdm] = await Promise.all([
        liveContract.hasRole(MUNICIPALITY_ROLE, addr).catch(() => false),
        liveContract.hasRole(DEFAULT_ADMIN_ROLE, addr).catch(() => false),
      ]);

      setIsMunicipality(Boolean(hasMuni));
      setIsAdmin(Boolean(hasAdm));
    } catch (err) {
      console.error("Erreur lors de la configuration du compte:", err);
    }
  }, []);

  // Connexion manuelle à MetaMask
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      alert("MetaMask n'est pas détecté. Veuillez installer l'extension MetaMask pour interagir avec la blockchain.");
      return;
    }

    setConnecting(true);
    try {
      await ensureNetwork(CONTRACT_CHAIN_ID);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (accounts && accounts.length > 0) {
        const signer = await provider.getSigner();
        const addr = await signer.getAddress();
        await setupAccount(signer, addr);
        setNetworkOk(true);
      }
    } catch (err) {
      console.error("Erreur de connexion MetaMask:", err);
    } finally {
      setConnecting(false);
    }
  }, [setupAccount]);

  // Détection silencieuse au chargement (si déjà connecté)
  useEffect(() => {
    if (!window.ethereum) return;

    async function checkExistingConnection() {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          const signer = await provider.getSigner();
          const addr = await signer.getAddress();
          await setupAccount(signer, addr);
        }
      } catch (e) {
        console.warn("Connexion silencieuse échouée:", e);
      }
    }

    checkExistingConnection();

    // Écoute des changements de compte et de réseau
    const handleAccountsChanged = (accounts) => {
      if (!accounts || accounts.length === 0) {
        setAccount("");
        setContract(null);
        setIsMunicipality(false);
        setIsAdmin(false);
      } else {
        connectWallet();
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      if (window.ethereum?.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [connectWallet, setupAccount]);

  return (
    <div className="app">
      {/* Barre Supérieure & Navigation */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-header-row">
            <div className="topbar-title-group">
              <h1>🏙️ UrbanIssueRegistry</h1>
              <p>Plateforme décentralisée Smart City & Traçabilité des services urbains</p>
            </div>

            <div className="topbar-wallet-group">
              {account ? (
                <div className="account-badge-pill">
                  <span className="mono">{shortAddress(account)}</span>
                  {isAdmin && <span className="badge badge-info">Admin</span>}
                  {isMunicipality && <span className="badge badge-ok">Agent Municipal</span>}
                  {!isMunicipality && !isAdmin && <span className="badge badge-default">Citoyen</span>}
                </div>
              ) : (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={connectWallet}
                  disabled={connecting}
                >
                  {connecting ? "Connexion…" : "🦊 Connecter MetaMask"}
                </button>
              )}
            </div>
          </div>

          {/* Onglets de navigation */}
          <nav className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "citizen"}
              className={tab === "citizen" ? "active" : ""}
              onClick={() => setTab("citizen")}
            >
              🏛️ Espace Citoyen
            </button>
            <button
              role="tab"
              aria-selected={tab === "municipality"}
              className={tab === "municipality" ? "active" : ""}
              onClick={() => setTab("municipality")}
            >
              🏢 Espace Municipalité {isMunicipality && <span className="badge badge-ok" style={{ marginLeft: "0.4rem" }}>Actif</span>}
            </button>
            <button
              role="tab"
              aria-selected={tab === "batch"}
              className={tab === "batch" ? "active" : ""}
              onClick={() => setTab("batch")}
            >
              📊 Import Excel / CSV
            </button>
          </nav>
        </div>
      </header>

      {/* Contenu principal selon l'onglet actif */}
      <main className="content">
        {!isDeployed() && (
          <div className="panel" style={{ marginBottom: "1.5rem" }}>
            <p className="notice notice-warn">
              ⚠️ Aucun contrat déployé détecté. Veuillez lancer votre nœud avec{" "}
              <span className="mono">npx hardhat node</span> puis déployer le contrat avec{" "}
              <span className="mono">npm run deploy:local</span> dans le dossier <span className="mono">contracts/</span>.
            </p>
          </div>
        )}

        {tab === "citizen" && (
          <CitizenSpace
            contract={contract}
            account={account}
            onConnectWallet={connectWallet}
          />
        )}

        {tab === "municipality" && (
          <MunicipalitySpace
            contract={contract}
            account={account}
            isMunicipality={isMunicipality}
            isAdmin={isAdmin}
            onConnectWallet={connectWallet}
          />
        )}

        {tab === "batch" && (
          <BatchImport
            contract={contract}
            account={account}
            onConnectWallet={connectWallet}
            onBatchSuccess={() => setTab("municipality")}
          />
        )}

        {/* Pied de page */}
        <footer className="app-footer">
          <p>
            <strong>UrbanIssueRegistry</strong> • Smart City & Blockchain • Contrat déployé :{" "}
            <span className="mono">{CONTRACT_ADDRESS || "Non déployé"}</span> (Chain ID: {CONTRACT_CHAIN_ID})
          </p>
          <p className="small muted">
            Architecture sécurisée OpenZeppelin AccessControl • Solidity ^0.8.24 • Ethers.js v6 • React + Vite
          </p>
        </footer>
      </main>
    </div>
  );
}
