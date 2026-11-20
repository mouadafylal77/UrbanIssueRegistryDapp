import { useState } from "react";
import { ethers } from "ethers";
import { explainError } from "../lib/chain.js";

const EMPTY = {
  studentName: "",
  studentId: "",
  diplomaTitle: "",
  issueDate: "",
  grade: "",
  recipientAddress: "",
  tokenURI: "",
};

export default function MintSingle({ contract, canWrite }) {
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ phase: "idle" }); // idle | signing | pending | done | error
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const f = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));

    if (!f.studentName || !f.studentId || !f.diplomaTitle || !f.issueDate) {
      return setState({
        phase: "error",
        message: "Renseignez tous les champs obligatoires : nom, CNE, intitulé du diplôme et date de délivrance.",
      });
    }

    if (!f.recipientAddress || !ethers.isAddress(f.recipientAddress)) {
      return setState({
        phase: "error",
        message: "Une adresse de réception Ethereum valide est obligatoire pour émettre un certificat ERC-721.",
      });
    }

    // Si aucune URI personnalisée n'est fournie, générer une URI standardisée
    const finalURI = f.tokenURI || `ipfs://diploma-metadata/${f.studentId}.json`;

    try {
      setState({ phase: "signing" });
      const tx = await contract.mintCertificate(
        f.recipientAddress,
        f.studentName,
        f.studentId,
        f.diplomaTitle,
        f.issueDate,
        f.grade,
        finalURI
      );

      setState({ phase: "pending", hash: tx.hash });
      const receipt = await tx.wait();

      let tokenId = null;
      let emittedURI = finalURI;

      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === "CertificateMinted") {
            tokenId = (parsed.args.tokenId ?? parsed.args.id).toString();
            emittedURI = parsed.args.tokenURI || emittedURI;
          }
        } catch {
          /* ignore log from other contract */
        }
      }

      setState({
        phase: "done",
        hash: tx.hash,
        tokenId,
        tokenURI: emittedURI,
      });
      setForm(EMPTY);
    } catch (err) {
      setState({ phase: "error", message: explainError(err) });
    }
  }

  const working = state.phase === "signing" || state.phase === "pending";

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Émettre un certificat (NFT ERC-721)</h2>
      <p className="muted small">
        L'émission nécessite le rôle <span className="mono">MINTER_ROLE</span> et transfère la propriété du token ERC-721 à l'étudiant.
      </p>

      {!canWrite && (
        <p className="notice notice-error">
          ⚠️ Votre compte ne possède pas le rôle <span className="mono">MINTER_ROLE</span>. L'émission est désactivée.
        </p>
      )}

      <div className="grid-2">
        <label>
          Nom complet de l'étudiant *
          <input
            placeholder="Ex : Yasmine El Idrissi"
            value={form.studentName}
            onChange={set("studentName")}
            disabled={!canWrite || working}
          />
        </label>
        <label>
          CNE (Identifiant Unique) *
          <input
            placeholder="Ex : D130045671"
            value={form.studentId}
            onChange={set("studentId")}
            disabled={!canWrite || working}
          />
        </label>
        <label className="span-2">
          Intitulé du diplôme *
          <input
            placeholder="Ex : Licence en Sciences Mathématiques et Informatique"
            value={form.diplomaTitle}
            onChange={set("diplomaTitle")}
            disabled={!canWrite || working}
          />
        </label>
        <label>
          Date de délivrance *
          <input
            type="date"
            value={form.issueDate}
            onChange={set("issueDate")}
            disabled={!canWrite || working}
          />
        </label>
        <label>
          Mention (facultatif)
          <input
            placeholder="Ex : Très bien"
            value={form.grade}
            onChange={set("grade")}
            disabled={!canWrite || working}
          />
        </label>
        <label className="span-2">
          Adresse Ethereum du titulaire (propriétaire du NFT) *
          <input
            className="mono"
            placeholder="0x…"
            value={form.recipientAddress}
            onChange={set("recipientAddress")}
            disabled={!canWrite || working}
          />
        </label>
        <label className="span-2">
          URI des métadonnées (tokenURI / IPFS)
          <input
            placeholder="ipfs://bafkrei... ou laisser vide pour génération automatique"
            value={form.tokenURI}
            onChange={set("tokenURI")}
            disabled={!canWrite || working}
          />
        </label>
      </div>

      <button className="btn" type="submit" disabled={!canWrite || working}>
        {state.phase === "signing"
          ? "Confirmez dans MetaMask…"
          : state.phase === "pending"
          ? "Transaction en cours…"
          : "Émettre le certificat NFT"}
      </button>

      {state.phase === "pending" && (
        <p className="notice">
          Transaction envoyée : <span className="mono">{state.hash}</span>
        </p>
      )}
      {state.phase === "done" && (
        <div className="notice notice-ok">
          <p>
            ✅ Certificat émis avec succès sous forme de token ERC-721 !
          </p>
          <p>
            <strong>Token ID :</strong> <span className="mono">#{state.tokenId ?? "?"}</span>
          </p>
          <p>
            <strong>tokenURI :</strong> <span className="mono">{state.tokenURI}</span>
          </p>
          <p className="small">
            Hash de la transaction : <span className="mono">{state.hash}</span>
          </p>
        </div>
      )}
      {state.phase === "error" && <p className="notice notice-error">{state.message}</p>}
    </form>
  );
}
