import { useState, useCallback, useEffect } from "react";
import IssueTimeline from "./IssueTimeline.jsx";
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASSES,
  PRIORITY_BADGE_CLASSES,
  fetchIssueHistory,
  explainError,
} from "../lib/chain.js";

export default function IssueCard({ issue, onManage, canManage = false, autoExpandHistory = false }) {
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(autoExpandHistory);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const loadHistory = useCallback(async () => {
    if (!issue?.issueId) return;
    setLoadingHistory(true);
    setHistoryError("");
    try {
      const data = await fetchIssueHistory(issue.issueId);
      setHistory(data);
    } catch (err) {
      setHistoryError(explainError(err));
    } finally {
      setLoadingHistory(false);
    }
  }, [issue?.issueId]);

  useEffect(() => {
    if (autoExpandHistory && !history) {
      loadHistory();
    }
  }, [autoExpandHistory, history, loadHistory]);

  const toggleHistory = () => {
    if (!showHistory && !history) {
      loadHistory();
    }
    setShowHistory((prev) => !prev);
  };

  if (!issue) return null;

  const statusLabel = STATUS_LABELS[issue.status] || `Statut ${issue.status}`;
  const statusBadge = STATUS_BADGE_CLASSES[issue.status] || "badge-default";
  const priorityBadge = PRIORITY_BADGE_CLASSES[issue.priority] || "badge-priority-medium";

  return (
    <article className="issue-card panel">
      <header className="issue-card-header">
        <div className="issue-card-title-group">
          <span className="issue-id-tag mono">{issue.issueId}</span>
          <h3 className="issue-type-name">{issue.issueType}</h3>
        </div>
        <div className="issue-badges-group">
          <span className={`badge ${priorityBadge}`} title="Niveau de priorité">
            {issue.priority || "Non spécifiée"}
          </span>
          <span className={`badge ${statusBadge}`} title="Statut du signalement">
            {statusLabel}
          </span>
        </div>
      </header>

      <div className="issue-card-body">
        <p className="issue-desc">{issue.description || "Aucune description fournie."}</p>

        <div className="issue-meta-grid">
          <div>
            <span className="meta-label">Localisation :</span>
            <span className="meta-value">📍 {issue.location}</span>
          </div>
          <div>
            <span className="meta-label">Date du signalement :</span>
            <span className="meta-value">📅 {issue.reportDate || "Non renseignée"}</span>
          </div>
          <div>
            <span className="meta-label">Déclaré par :</span>
            <span className="meta-value">👤 {issue.reportedBy || "Citoyen"}</span>
          </div>
          <div>
            <span className="meta-label">Équipe affectée :</span>
            <span className="meta-value">
              {issue.assignedTo ? `👷 ${issue.assignedTo}` : <em className="muted">En attente d'affectation</em>}
            </span>
          </div>
        </div>
      </div>

      <footer className="issue-card-footer">
        <button
          className="btn btn-ghost btn-sm"
          onClick={toggleHistory}
          disabled={loadingHistory}
        >
          {loadingHistory ? "Chargement…" : showHistory ? "Masquer la traçabilité ▲" : "Voir l'historique complet ▼"}
        </button>

        {canManage && onManage && (
          <button className="btn btn-primary btn-sm" onClick={() => onManage(issue)}>
            Gérer ce signalement ⚙
          </button>
        )}
      </footer>

      {historyError && <p className="notice notice-error">{historyError}</p>}

      {showHistory && (
        <div className="issue-card-history-section">
          {loadingHistory ? (
            <p className="muted small">Récupération de l'historique on-chain…</p>
          ) : (
            <IssueTimeline history={history || []} />
          )}
        </div>
      )}
    </article>
  );
}
