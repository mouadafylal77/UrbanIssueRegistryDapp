import { ethers } from "ethers";
import artifact from "../contracts/CertificateRegistry.json";

export const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const CHAIN_ID = 11155111;
export const CHAIN_ID_HEX = "0xaa36a7";
export const CONTRACT_ADDRESS = artifact.address;
export const CONTRACT_ABI = artifact.abi;

export const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
export const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));

export const isDeployed = () => ethers.isAddress(CONTRACT_ADDRESS);

// Lecture seule : aucun appel à window.ethereum ici.
let readContract = null;
export function getReadContract() {
  if (!readContract) {
    const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  }
  return readContract;
}

export function parseCertificate(res) {
  if (!res) return null;
  const c = res.cert || (res[0] && typeof res[0] === "object" && "studentName" in res[0] ? res[0] : res);
  const uri = res.uri || res.tokenURI || (typeof res[1] === "string" ? res[1] : (c.tokenURI || ""));
  const tokenId = Number(c.id ?? c.tokenId ?? 0);

  return {
    id: tokenId,
    tokenId,
    studentName: c.studentName || "",
    studentId: c.studentId || "",
    diplomaTitle: c.diplomaTitle || "",
    issueDate: c.issueDate || "",
    grade: c.grade || "",
    recipientAddress: !c.recipientAddress || c.recipientAddress === ethers.ZeroAddress ? "" : c.recipientAddress,
    revoked: Boolean(c.revoked),
    issuedAt: Number(c.issuedAt || 0),
    tokenURI: uri,
  };
}

export async function fetchCertificate(id) {
  const result = await getReadContract().getCertificate(id);
  return parseCertificate(result);
}

export async function fetchLatest(limit = 10) {
  const c = getReadContract();
  const total = Number(await c.totalCertificates());
  const ids = [];
  for (let i = total; i >= 1 && ids.length < limit; i--) ids.push(i);
  const list = await Promise.all(ids.map(fetchCertificate));
  return { total, list };
}

export const formatTimestamp = (ts) => new Date(ts * 1000).toLocaleString("fr-FR");

export const NONCE_MESSAGE =
  "Erreur de nonce : le nœud Hardhat a probablement été redémarré, mais MetaMask conserve l'ancien compteur de transactions de ce compte. " +
  "Dans MetaMask, ouvrez Paramètres > Avancé, puis cliquez sur « Effacer les données de l'onglet d'activité » (ou « Réinitialiser le compte »). " +
  "Revenez ensuite ici et relancez l'opération.";

export function explainError(err) {
  const raw = [err?.reason, err?.shortMessage, err?.info?.error?.message, err?.error?.message, err?.data?.message, err?.message]
    .filter(Boolean)
    .join(" | ");
  const low = raw.toLowerCase();

  if (err?.code === "ACTION_REJECTED" || err?.code === 4001 || low.includes("user rejected") || low.includes("user denied"))
    return "Action refusée dans MetaMask.";
  if (low.includes("nonce too high") || low.includes("could not coalesce") || (low.includes("nonce") && low.includes("expected")))
    return NONCE_MESSAGE;
  if (low.includes("accesscontrolunauthorizedaccount") || low.includes("accesscontrol")) {
    if (low.includes("minter") || low.includes("0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6")) {
      return "Accès refusé : votre compte ne possède pas le rôle MINTER_ROLE requis pour émettre des certificats.";
    }
    return "Accès refusé : votre compte ne dispose pas des permissions d'administration (DEFAULT_ADMIN_ROLE requis pour cette action).";
  }
  if (low.includes("reentrancyguardreentrantcall") || low.includes("reentrancy"))
    return "Opération rejetée : tentative d'appel réentrant bloquée par le ReentrancyGuard.";
  if (low.includes("deja enregistre")) return "Ce CNE est déjà enregistré : un seul certificat par étudiant est autorisé.";
  if (low.includes("deja revoque")) return "Ce certificat est déjà révoqué.";
  if (low.includes("introuvable")) return "Aucun certificat ne correspond à cet identifiant.";
  if (low.includes("maximum 10")) return "Un lot ne peut pas dépasser 10 certificats.";
  if (low.includes("lot vide")) return "Le lot soumis est vide.";
  if (low.includes("tableaux de longueurs differentes")) return "Les données du lot sont incomplètes (tableaux de longueurs différentes).";
  if (low.includes("adresse invalide") || low.includes("invalid receiver") || low.includes("erc721invalidreceiver"))
    return "Adresse destinataire invalide : une adresse Ethereum non nulle est requise pour recevoir le NFT ERC-721.";
  if (low.includes("requis") || low.includes("requise")) return "Un champ obligatoire est vide (nom, CNE, intitulé, date ou adresse).";
  if (
    low.includes("failed to detect network") ||
    low.includes("could not detect network") ||
    low.includes("econnrefused") ||
    low.includes("failed to fetch") ||
    low.includes("network error") ||
    low.includes("bad_data") ||
    (low.includes("call_exception") && low.includes("could not decode"))
  )
    return "Impossible de joindre le nœud Hardhat (127.0.0.1:8545) ou le contrat n'existe plus à cette adresse. Relancez « npx hardhat node » puis « npm run deploy:local ».";
  return err?.shortMessage || err?.reason || err?.message || "Erreur inconnue.";
}
