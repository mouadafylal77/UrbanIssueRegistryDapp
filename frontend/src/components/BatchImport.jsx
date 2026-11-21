import { useState } from "react";
import * as XLSX from "xlsx";
import {
  explainError,
  checkIssueExists,
  STATUS_LABELS,
  PRIORITY_BADGE_CLASSES,
} from "../lib/chain.js";

const REQUIRED_COLUMNS = [
  "issueId",
  "issueType",
  "location",
  "description",
  "reportDate",
  "priority",
  "reportedBy",
  "assignedTo",
  "status",
];

const BATCH_CHUNK_SIZE = 10;

function normalizeRow(raw) {
  const map = {};
  for (const k of Object.keys(raw)) {
    map[k.trim().toLowerCase()] = raw[k];
  }

  const out = {};
  for (const col of REQUIRED_COLUMNS) {
    const val = map[col.toLowerCase()];
    out[col] = val !== undefined && val !== null ? String(val).trim() : "";
  }
  return out;
}

export default function BatchImport({ contract, account, onConnectWallet, onBatchSuccess }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Traitement du fichier Excel ou CSV
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccessMsg("");
    setLogs([]);
    setRows([]);
    setFileName(file.name);
    setParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      const workbook = isCsv
        ? XLSX.read(new TextDecoder("utf-8").decode(buffer), { type: "string" })
        : XLSX.read(buffer, { type: "array" });

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawJson = XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: false });

      if (rawJson.length === 0) {
        throw new Error("Le fichier importé est vide ou ne contient aucune ligne de données.");
      }

      const parsedRows = [];
      const seenIdsInFile = new Set();

      for (let i = 0; i < rawJson.length; i++) {
        const row = normalizeRow(rawJson[i]);
        let problem = "";

        // 1. Validation des champs obligatoires
        if (!row.issueId) {
          problem = "issueId manquant";
        } else if (!row.issueType) {
          problem = "issueType manquant";
        } else if (!row.location) {
          problem = "location manquante";
        } else if (!row.description) {
          problem = "description manquante";
        } else if (!row.reportDate) {
          problem = "reportDate manquante";
        } else if (!row.priority) {
          problem = "priority manquante";
        } else if (!row.reportedBy) {
          problem = "reportedBy manquant";
        }
        // 2. Vérification des doublons dans le fichier
        else if (seenIdsInFile.has(row.issueId)) {
          problem = `Doublon d'ID dans le fichier (${row.issueId})`;
        }
        // 3. Vérification de l'existence on-chain
        else {
          const existsOnChain = await checkIssueExists(row.issueId);
          if (existsOnChain) {
            problem = `ID déjà enregistré sur la blockchain (${row.issueId})`;
          }
        }

        if (row.issueId) seenIdsInFile.add(row.issueId);

        parsedRows.push({
          ...row,
          key: i,
          problem,
          selected: !problem,
          status: "",
        });
      }

      setRows(parsedRows);
    } catch (err) {
      setError(err.message || explainError(err));
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  }

  // Sélection / Désélection individuelle
  const toggleRow = (key) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key && !r.problem && r.status !== "done"
          ? { ...r, selected: !r.selected }
          : r
      )
    );
  };

  // Filtrage des lignes sélectionnables
  const eligibleRows = rows.filter((r) => !r.problem && r.status !== "done");
  const selectedRows = eligibleRows.filter((r) => r.selected);

  // Tout sélectionner / Tout désélectionner
  const toggleAll = () => {
    const shouldSelectAll = selectedRows.length !== eligibleRows.length;
    setRows((prev) =>
      prev.map((r) =>
        !r.problem && r.status !== "done" ? { ...r, selected: shouldSelectAll } : r
      )
    );
  };

  // Envoi du lot sur la blockchain
  async function handleBatchSubmit() {
    setError("");
    setSuccessMsg("");
    setLogs([]);

    if (!contract) {
      if (onConnectWallet) onConnectWallet();
      return setError("Veuillez connecter votre portefeuille MetaMask pour signer l'import.");
    }

    if (selectedRows.length === 0) {
      return setError("Veuillez sélectionner au moins un signalement valide à enregistrer.");
    }

    // Découpage en lots
    const chunks = [];
    for (let i = 0; i < selectedRows.length; i += BATCH_CHUNK_SIZE) {
      chunks.push(selectedRows.slice(i, i + BATCH_CHUNK_SIZE));
    }

    setSending(true);

    try {
      let totalImported = 0;

      for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c];
        setLogs((prev) => [
          ...prev,
          `Préparation du lot ${c + 1}/${chunks.length} (${chunk.length} signalements)…`,
        ]);

        const ids = chunk.map((r) => r.issueId);
        const types = chunk.map((r) => r.issueType);
        const locations = chunk.map((r) => r.location);
        const descriptions = chunk.map((r) => r.description);
        const dates = chunk.map((r) => r.reportDate);
        const priorities = chunk.map((r) => r.priority);
        const reporters = chunk.map((r) => r.reportedBy);
        const teams = chunk.map((r) => r.assignedTo || "");

        // Vérifier si des équipes sont spécifiées pour utiliser la fonction adéquate
        const hasTeams = teams.some((t) => t.length > 0);

        setLogs((prev) => [
          ...prev,
          `Envoi de la transaction MetaMask pour le lot ${c + 1}…`,
        ]);

        const tx = hasTeams
          ? await contract.createIssuesBatchWithTeams(
              ids,
              types,
              locations,
              descriptions,
              dates,
              priorities,
              reporters,
              teams
            )
          : await contract.createIssuesBatch(
              ids,
              types,
              locations,
              descriptions,
              dates,
              priorities,
              reporters
            );

        setLogs((prev) => [
          ...prev,
          `Transaction envoyée : ${tx.hash}. En attente de confirmation…`,
        ]);

        await tx.wait();

        // Mettre à jour le statut des lignes traitées
        const chunkKeys = new Set(chunk.map((r) => r.key));
        setRows((prev) =>
          prev.map((r) =>
            chunkKeys.has(r.key) ? { ...r, status: "done", selected: false } : r
          )
        );

        totalImported += chunk.length;
        setLogs((prev) => [
          ...prev,
          `✓ Lot ${c + 1}/${chunks.length} confirmé on-chain avec succès !`,
        ]);
      }

      setSuccessMsg(`🎉 Succès : ${totalImported} signalements ont été enregistrés sur la blockchain !`);
      if (onBatchSuccess) onBatchSuccess();
    } catch (err) {
      setError(explainError(err));
      setLogs((prev) => [...prev, `Erreur : ${explainError(err)}`]);
    } finally {
      setSending(false);
    }
  }

  // Télécharger un fichier modèle Excel
  function downloadTemplate() {
    const templateData = [
      {
        issueId: "CITY-2026-001",
        issueType: "StreetLight",
        location: "Avenue Mohammed V",
        description: "Streetlight not working near building 45",
        reportDate: "2026-11-19",
        priority: "High",
        reportedBy: "Citizen01",
        assignedTo: "UrbanTeam01",
        status: "Reported",
      },
      {
        issueId: "CITY-2026-002",
        issueType: "Pothole",
        location: "Boulevard Zerktouni",
        description: "Large pothole obstructing right lane",
        reportDate: "2026-11-20",
        priority: "Critical",
        reportedBy: "Citizen02",
        assignedTo: "UrbanTeam02",
        status: "Reported",
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateData, { header: REQUIRED_COLUMNS });
    XLSX.utils.book_append_sheet(wb, ws, "UrbanIssues");
    XLSX.writeFile(wb, "modele_urban_issues.xlsx");
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Import par lot de signalements (Excel & CSV)</h2>
            <p className="muted">
              Importez des données volumineuses depuis un fichier <span className="mono">.xlsx</span> ou{" "}
              <span className="mono">.csv</span> pour enregistrer plusieurs signalements urbains en une seule transaction blockchain.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
            📥 Télécharger le modèle Excel
          </button>
        </div>

        {/* Zone de téléversement */}
        <div className="upload-box">
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileUpload}
            disabled={parsing || sending}
            id="file-upload-input"
          />
          <p className="small muted">
            Le fichier doit contenir les 9 colonnes requises :{" "}
            <span className="mono">
              issueId, issueType, location, description, reportDate, priority, reportedBy, assignedTo, status
            </span>
          </p>
        </div>

        {parsing && <p className="notice notice-info">Lecture, analyse et validation des lignes en cours…</p>}
        {error && <p className="notice notice-error">{error}</p>}
        {successMsg && <p className="notice notice-ok">{successMsg}</p>}

        {/* Aperçu des données importées */}
        {rows.length > 0 && (
          <div className="preview-container">
            <div className="panel-row" style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>
              <div>
                <strong>{fileName}</strong> : {rows.length} ligne(s) détectée(s) •{" "}
                <span className="badge badge-ok">{eligibleRows.length} valide(s)</span>
                {rows.length - eligibleRows.length > 0 && (
                  <span className="badge badge-bad" style={{ marginLeft: "0.5rem" }}>
                    {rows.length - eligibleRows.length} avec anomalie(s)
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={toggleAll}
                  disabled={eligibleRows.length === 0 || sending}
                >
                  {selectedRows.length === eligibleRows.length ? "Tout désélectionner" : "Tout sélectionner"}
                </button>

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleBatchSubmit}
                  disabled={selectedRows.length === 0 || sending}
                >
                  {sending
                    ? "Enregistrement en cours…"
                    : `Enregistrer la sélection (${selectedRows.length})`}
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "40px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={eligibleRows.length > 0 && selectedRows.length === eligibleRows.length}
                        onChange={toggleAll}
                        disabled={eligibleRows.length === 0 || sending}
                      />
                    </th>
                    <th>#</th>
                    <th>issueId</th>
                    <th>Type</th>
                    <th>Localisation</th>
                    <th>Priorité</th>
                    <th>Date</th>
                    <th>Équipe</th>
                    <th>État de validation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const isInvalid = Boolean(r.problem);
                    const isDone = r.status === "done";
                    const priorityBadge = PRIORITY_BADGE_CLASSES[r.priority] || "badge-priority-medium";

                    return (
                      <tr
                        key={r.key}
                        className={isInvalid ? "row-bad" : isDone ? "row-done" : ""}
                        onClick={() => !isInvalid && !isDone && toggleRow(r.key)}
                        style={{ cursor: isInvalid || isDone ? "default" : "pointer" }}
                      >
                        <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={r.selected}
                            disabled={isInvalid || isDone || sending}
                            onChange={() => toggleRow(r.key)}
                          />
                        </td>
                        <td className="muted small">{i + 1}</td>
                        <td className="mono font-bold">{r.issueId || <em>Vide</em>}</td>
                        <td>{r.issueType || <em>Vide</em>}</td>
                        <td>{r.location || <em>Vide</em>}</td>
                        <td>
                          {r.priority ? (
                            <span className={`badge ${priorityBadge}`}>{r.priority}</span>
                          ) : (
                            <em>Vide</em>
                          )}
                        </td>
                        <td>{r.reportDate || <em>Vide</em>}</td>
                        <td>{r.assignedTo || <span className="muted small">-</span>}</td>
                        <td>
                          {isDone ? (
                            <span className="badge badge-ok">✓ Enregistré on-chain</span>
                          ) : isInvalid ? (
                            <span className="badge badge-bad" title={r.problem}>
                              ⚠ {r.problem}
                            </span>
                          ) : (
                            <span className="badge badge-info">Prêt à importer</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Logs de transaction batch */}
        {logs.length > 0 && (
          <div className="batch-logs-panel">
            <h4>Journal d'exécution de la transaction :</h4>
            <div className="batch-logs-terminal">
              {logs.map((line, idx) => (
                <div key={idx} className="mono small">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
