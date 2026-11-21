import { formatTimestamp, shortAddress, STATUS_LABELS, STATUS_BADGE_CLASSES } from "../lib/chain.js";

export default function IssueTimeline({ history = [] }) {
  if (!history || history.length === 0) {
    return (
      <div className="timeline-empty">
        <p className="muted">Aucune entrée d'historique disponible pour ce signalement.</p>
      </div>
    );
  }

  return (
    <div className="timeline-wrap">
      <h3 className="timeline-title">Historique & Traçabilité des Interventions</h3>
      <div className="timeline">
        {history.map((entry, index) => {
          const isLatest = index === history.length - 1;
          const statusLabel = STATUS_LABELS[entry.status] || `Statut #${entry.status}`;
          const badgeClass = STATUS_BADGE_CLASSES[entry.status] || "badge-default";

          return (
            <div key={index} className={`timeline-item ${isLatest ? "is-latest" : ""}`}>
              <div className="timeline-marker">
                <span className="timeline-dot">{index + 1}</span>
                {index < history.length - 1 && <div className="timeline-line" />}
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className={`badge ${badgeClass}`}>{statusLabel}</span>
                  <span className="timeline-date">{formatTimestamp(entry.timestamp)}</span>
                </div>

                {entry.assignedTeam && (
                  <p className="timeline-team">
                    <strong>Équipe affectée :</strong> {entry.assignedTeam}
                  </p>
                )}

                {entry.comment && (
                  <blockquote className="timeline-comment">
                    « {entry.comment} »
                  </blockquote>
                )}

                <div className="timeline-footer">
                  <span className="timeline-actor muted small">
                    Opéré par : <span className="mono" title={entry.updatedBy}>{shortAddress(entry.updatedBy)}</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
