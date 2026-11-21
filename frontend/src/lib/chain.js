import { ethers } from "ethers";
import artifact from "../contracts/UrbanIssueRegistry.json";

// Configuration des réseaux supportés
export const LOCAL_CHAIN_ID = 31337;
export const LOCAL_CHAIN_ID_HEX = "0x7a69";
export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

export const LOCAL_RPC_URL = "http://127.0.0.1:8545";
export const SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

export const CONTRACT_ADDRESS = artifact.address;
export const CONTRACT_ABI = artifact.abi;
export const CONTRACT_CHAIN_ID = artifact.chainId || LOCAL_CHAIN_ID;

// Rôles OpenZeppelin AccessControl
export const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
export const MUNICIPALITY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MUNICIPALITY_ROLE"));

// Cycle de vie des signalements
export const STATUS_LIST = ["Reported", "Assigned", "InProgress", "Resolved", "Closed"];

export const STATUS_LABELS = {
  0: "Signalé",
  1: "Affecté",
  2: "En cours",
  3: "Résolu",
  4: "Clôturé",
};

export const STATUS_DESCRIPTIONS = {
  0: "Signalement enregistré sur la blockchain par le citoyen",
  1: "Signalement affecté à une équipe technique d'intervention",
  2: "Intervention technique ou travaux en cours de réalisation",
  3: "Problème résolu sur le terrain par l'équipe",
  4: "Dossier vérifié et clôturé par les services municipaux",
};

export const STATUS_BADGE_CLASSES = {
  0: "badge-reported",
  1: "badge-assigned",
  2: "badge-inprogress",
  3: "badge-resolved",
  4: "badge-closed",
};

export const PRIORITY_BADGE_CLASSES = {
  Low: "badge-priority-low",
  Medium: "badge-priority-medium",
  High: "badge-priority-high",
  Critical: "badge-priority-critical",
  Faible: "badge-priority-low",
  Moyenne: "badge-priority-medium",
  Haute: "badge-priority-high",
  Critique: "badge-priority-critical",
};

export const ISSUE_TYPES = [
  { value: "StreetLight", label: "Éclairage public (StreetLight)" },
  { value: "Pothole", label: "Voirie & Nids-de-poule (Pothole)" },
  { value: "WaterLeak", label: "Fuite d'eau & Assainissement (WaterLeak)" },
  { value: "WasteManagement", label: "Propreté & Déchets (WasteManagement)" },
  { value: "TrafficSign", label: "Signalisation routière (TrafficSign)" },
  { value: "GreenSpace", label: "Parcs & Espaces verts (GreenSpace)" },
  { value: "Other", label: "Autre problème urbain (Other)" },
];

export const isDeployed = () => Boolean(CONTRACT_ADDRESS && ethers.isAddress(CONTRACT_ADDRESS));

// Provider en lecture seule (fallback JsonRpcProvider)
let readProvider = null;
let readContract = null;

export function getReadProvider() {
  if (!readProvider) {
    const isSepolia = CONTRACT_CHAIN_ID === SEPOLIA_CHAIN_ID;
    const rpc = isSepolia ? SEPOLIA_RPC_URL : LOCAL_RPC_URL;
    readProvider = new ethers.JsonRpcProvider(rpc, CONTRACT_CHAIN_ID, { staticNetwork: true });
  }
  return readProvider;
}

export function getReadContract() {
  if (!readContract) {
    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, getReadProvider());
  }
  return readContract;
}

// Configuration réseau MetaMask
export async function ensureNetwork(targetChainId = CONTRACT_CHAIN_ID) {
  if (!window.ethereum) throw new Error("MetaMask n'est pas détecté.");

  const chainIdHex = "0x" + targetChainId.toString(16);
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (err) {
    const isUnrecognized =
      err?.code === 4902 ||
      err?.data?.originalError?.code === 4902 ||
      /unrecognized chain/i.test(err?.message || "");

    if (!isUnrecognized) throw err;

    const chainParams =
      targetChainId === SEPOLIA_CHAIN_ID
        ? {
            chainId: chainIdHex,
            chainName: "Ethereum Sepolia",
            rpcUrls: [SEPOLIA_RPC_URL],
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          }
        : {
            chainId: chainIdHex,
            chainName: "Hardhat Local (31337)",
            rpcUrls: [LOCAL_RPC_URL],
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          };

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [chainParams],
    });
  }
}

// Parsing d'une structure Issue Solidity
export function parseIssue(raw) {
  if (!raw) return null;
  return {
    issueId: raw.issueId || raw[0] || "",
    issueType: raw.issueType || raw[1] || "",
    location: raw.location || raw[2] || "",
    description: raw.description || raw[3] || "",
    reportDate: raw.reportDate || raw[4] || "",
    priority: raw.priority || raw[5] || "",
    reportedBy: raw.reportedBy || raw[6] || "",
    assignedTo: raw.assignedTo || raw[7] || "",
    status: Number(raw.status ?? raw[8] ?? 0),
    exists: Boolean(raw.exists ?? raw[9] ?? false),
  };
}

// Parsing d'une entrée HistoryEntry Solidity
export function parseHistoryEntry(raw) {
  if (!raw) return null;
  return {
    timestamp: Number(raw.timestamp ?? raw[0] ?? 0),
    status: Number(raw.status ?? raw[1] ?? 0),
    assignedTeam: raw.assignedTeam || raw[2] || "",
    comment: raw.comment || raw[3] || "",
    updatedBy: raw.updatedBy || raw[4] || ethers.ZeroAddress,
  };
}

// Requêtes de lecture blockchain
export async function fetchIssue(issueId) {
  const contract = getReadContract();
  const raw = await contract.getIssue(issueId);
  return parseIssue(raw);
}

export async function fetchIssueHistory(issueId) {
  const contract = getReadContract();
  const rawList = await contract.getIssueHistory(issueId);
  return rawList.map(parseHistoryEntry);
}

export async function fetchAllIssues() {
  const contract = getReadContract();
  const rawList = await contract.getAllIssues();
  return rawList.map(parseIssue);
}

export async function checkIssueExists(issueId) {
  try {
    const contract = getReadContract();
    return await contract.issueExists(issueId);
  } catch {
    return false;
  }
}

export const formatTimestamp = (ts) => {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export const shortAddress = (addr) => {
  if (!addr || !ethers.isAddress(addr)) return addr || "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
};

export const NONCE_MESSAGE =
  "Erreur de désynchronisation de nonce : le nœud blockchain a probablement redémarré. " +
  "Dans MetaMask, ouvrez Paramètres > Avancé, puis cliquez sur « Effacer les données d'activité » (ou « Réinitialiser le compte »).";

// Traduction et explication claire des erreurs blockchain
export function explainError(err) {
  const raw = [
    err?.reason,
    err?.shortMessage,
    err?.info?.error?.message,
    err?.error?.message,
    err?.data?.message,
    err?.message,
  ]
    .filter(Boolean)
    .join(" | ");
  const low = raw.toLowerCase();

  if (err?.code === "ACTION_REJECTED" || err?.code === 4001 || low.includes("user rejected") || low.includes("user denied")) {
    return "Action annulée par l'utilisateur dans MetaMask.";
  }
  if (low.includes("nonce too high") || low.includes("could not coalesce") || (low.includes("nonce") && low.includes("expected"))) {
    return NONCE_MESSAGE;
  }
  if (low.includes("accesscontrolunauthorizedaccount") || low.includes("accesscontrol")) {
    return "Accès refusé : votre compte ne dispose pas du rôle MUNICIPALITY_ROLE requis pour effectuer cette opération municipale.";
  }
  if (low.includes("signalement deja existant")) {
    return "Ce numéro de signalement (issueId) existe déjà sur la blockchain.";
  }
  if (low.includes("signalement introuvable")) {
    return "Aucun signalement trouvé avec cet identifiant sur la blockchain.";
  }
  if (low.includes("transition de statut invalide")) {
    return "Transition de statut interdite. Le cycle de vie doit suivre strictement : Reported → Assigned → InProgress → Resolved → Closed.";
  }
  if (low.includes("statut incompatible pour affectation")) {
    return "L'équipe ne peut être affectée que lorsque le signalement est au statut 'Signalé' (Reported) ou 'Affecté' (Assigned).";
  }
  if (low.includes("equipe requise")) {
    return "Le nom de l'équipe technique d'intervention est obligatoire.";
  }
  if (low.includes("identifiant requis")) {
    return "L'identifiant unique du signalement (issueId) est obligatoire.";
  }
  if (low.includes("type de probleme requis")) {
    return "Le type d'incident urbain est obligatoire.";
  }
  if (low.includes("localisation requise")) {
    return "La localisation géographique de l'incident est obligatoire.";
  }
  if (low.includes("lot vide")) {
    return "Le lot soumis à l'enregistrement est vide.";
  }
  if (low.includes("tableaux de longueurs differentes")) {
    return "Incohérence dans les données du lot : les colonnes n'ont pas la même taille.";
  }
  if (
    low.includes("failed to detect network") ||
    low.includes("could not detect network") ||
    low.includes("econnrefused") ||
    low.includes("failed to fetch") ||
    low.includes("network error") ||
    low.includes("bad_data") ||
    (low.includes("call_exception") && low.includes("could not decode"))
  ) {
    return "Impossible de joindre le nœud blockchain (127.0.0.1:8545). Assurez-vous que « npx hardhat node » tourne et que le contrat est déployé.";
  }

  return err?.shortMessage || err?.reason || err?.message || "Une erreur inattendue est survenue.";
}
