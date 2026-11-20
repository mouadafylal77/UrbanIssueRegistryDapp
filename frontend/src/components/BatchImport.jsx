import { useState } from "react";
import { ethers } from "ethers";
import * as XLSX from "xlsx";
import { explainError, getReadContract } from "../lib/chain.js";

const COLUMNS = ["studentName", "studentId", "diplomaTitle", "issueDate", "grade", "recipientAddress", "tokenURI"];
const BATCH_SIZE = 10;

function normalizeRow(raw) {
  const map = {};
  for (const k of Object.keys(raw)) map[k.trim().toLowerCase()] = raw[k];
  const out = {};
  for (const c of COLUMNS) out[c] = String(map[c.toLowerCase()] ?? "").trim();
  return out;
}

export default function BatchImport({ contract, canWrite }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState([]);
  const [error, setError] = useState("");

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setLog([]);
    setRows([]);
    setFileName(file.name);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      const wb = isCsv
        ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string" })
        : XLSX.read(buf, { type: "array" });
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      if (json.length === 0) throw new Error("Le fichier ne contient aucune ligne.");

      const reader = getReadContract();
      const seen = new Set();
      const parsed = [];

      for (let i = 0; i < json.length; i++) {
        const r = normalizeRow(json[i]);
        let problem = "";

        if (!r.studentName || !r.studentId || !r.diplomaTitle || !r.issueDate) {
          problem = "Champs obligatoires manquants";
        } else if (!r.recipientAddress || !ethers.isAddress(r.recipientAddress)) {
          problem = "Adresse de réception manquante ou invalide (requise ERC-721)";
        } else if (seen.has(r.studentId)) {
          problem = "CNE en double dans le fichier";
        } else if (await reader.studentIdExists(r.studentId)) {
          problem = "CNE déjà enregistré sur la blockchain";
        }

        if (r.studentId) seen.add(r.studentId);

        const tokenURI = r.tokenURI || `ipfs://diploma-metadata/${r.studentId}.json`;
        parsed.push({ ...r, tokenURI, key: i, problem, selected: !problem, status: "" });
      }

      setRows(parsed);
    } catch (err) {
      setError(err.message?.startsWith("Le fichier") ? err.message : explainError(err));
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  }

  const toggle = (key) =>
    setRows((rs) =>
      rs.map((r) =>
        r.key === key && !r.problem && r.status !== "done" ? { ...r, selected: !r.selected } : r
      )
    );

  const eligible = rows.filter((r) => !r.problem && r.status !== "done");
  const selected = eligible.filter((r) => r.selected);

  const toggleAll = () => {
    const all = selected.length !== eligible.length;
    setRows((rs) => rs.map((r) => (!r.problem && r.status !== "done" ? { ...r, selected: all } : r)));
  };

  async function emit() {
    setError("");
    setLog([]);
    const chunks = [];
    for (let i = 0; i < selected.length; i += BATCH_SIZE) chunks.push(selected.slice(i, i + BATCH_SIZE));
    setSending(true);

    try {
      for (let c = 0; c < chunks.length; c++) {
        const ch = chunks[c];
        setLog((l) => [
          ...l,
          `Lot ${c + 1}/${chunks.length} : confirmation MetaMask en attente (${ch.length} certificats)…`,
        ]);

        const tx = await contract.batchMintCertificates(
          ch.map((r) => r.recipientAddress),
          ch.map((r) => r.studentName),
          ch.map((r) => r.studentId),
          ch.map((r) => r.diplomaTitle),
          ch.map((r) => r.issueDate),
          ch.map((r) => r.grade),
          ch.map((r) => r.tokenURI)
        );

        await tx.wait();
        const keys = new Set(ch.map((r) => r.key));
        setRows((rs) => rs.map((r) => (keys.has(r.key) ? { ...r, status: "done", selected: false } : r)));
        setLog((l) => [
          ...l.slice(0, -1),
          `✅ Lot ${c + 1}/${chunks.length} émis (${ch.length} certificats). Transaction : ${tx.hash}`,
        ]);
      }
    } catch (err) {
      setError(explainError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="panel">
      <h2>Import Excel / CSV et émission de lots ERC-721</h2>
      <p className="muted">
        Colonnes attendues : <span className="mono">{COLUMNS.join(", ")}</span>. Les certificats sont émis
        par lots de {BATCH_SIZE} au maximum, une transaction par lot avec vérification de réentrance et d'unicité CNE.
      </p>

      {!canWrite && (
        <p className="notice notice-error">
          ⚠️ Votre compte ne possède pas le rôle <span className="mono">MINTER_ROLE</span>. L'émission par lot est désactivée.
        </p>
      )}

      <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={!canWrite || sending} />
      {parsing && <p className="muted">Lecture et contrôle du fichier…</p>}
      {fileName && !parsing && rows.length > 0 && (
        <p className="muted small">
          {fileName} : {rows.length} ligne(s) analysée(s).
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={eligible.length > 0 && selected.length === eligible.length}
                      onChange={toggleAll}
                      disabled={sending || eligible.length === 0}
                      aria-label="Tout sélectionner"
                    />
                  </th>
                  <th>Étudiant</th>
                  <th>CNE</th>
                  <th>Diplôme</th>
                  <th>Date</th>
                  <th>Mention</th>
                  <th>Adresse Destinataire</th>
                  <th>tokenURI</th>
                  <th>Contrôle</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={r.problem ? "row-bad" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={() => toggle(r.key)}
                        disabled={!!r.problem || r.status === "done" || sending}
                      />
                    </td>
                    <td>{r.studentName}</td>
                    <td>{r.studentId}</td>
                    <td>{r.diplomaTitle}</td>
                    <td>{r.issueDate}</td>
                    <td>{r.grade}</td>
                    <td className="mono">
                      {r.recipientAddress ? `${r.recipientAddress.slice(0, 6)}…${r.recipientAddress.slice(-4)}` : "—"}
                    </td>
                    <td className="mono small">
                      {r.tokenURI ? `${r.tokenURI.slice(0, 20)}…` : "auto"}
                    </td>
                    <td>
                      {r.status === "done" ? (
                        <span className="badge badge-ok">Émis</span>
                      ) : r.problem ? (
                        <span className="badge badge-bad">{r.problem}</span>
                      ) : (
                        <span className="badge badge-info">Prêt</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn"
            onClick={emit}
            disabled={!canWrite || sending || selected.length === 0}
          >
            {sending
              ? "Émission en cours…"
              : `Émettre ${selected.length} certificat(s) NFT en ${Math.ceil(selected.length / BATCH_SIZE) || 0} transaction(s)`}
          </button>
        </>
      )}

      {log.map((l, i) => (
        <p key={i} className="notice notice-ok mono small">
          {l}
        </p>
      ))}
      {error && <p className="notice notice-error">{error}</p>}
    </div>
  );
}
