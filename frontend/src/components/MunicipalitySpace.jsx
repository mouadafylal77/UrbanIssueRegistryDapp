import { useState, useCallback, useEffect, useMemo } from "react";
import { ethers } from "ethers";
import IssueTimeline from "./IssueTimeline.jsx";
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASSES,
  PRIORITY_BADGE_CLASSES,
  MUNICIPALITY_ROLE,
  DEFAULT_ADMIN_ROLE,
  fetchAllIssues,
  fetchIssueHistory,
  explainError,
  shortAddress,
} from "../lib/chain.js";

export default function MunicipalitySpace({
  contract,
  account,
  isMunicipality,
  isAdmin,
  onConnectWallet,
}) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Filtres
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");

  // Signalement sélectionné pour intervention
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [selectedHistory, setSelectedHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Formulaire d'affectation d'équipe
  const [assignTeamName, setAssignTeamName] = useState("");
  const [assignComment, setAssignComment] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  // Formulaire de mise à jour de statut
  const [statusComment, setStatusComment] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);

  // Administration des rôles (pour DEFAULT_ADMIN_ROLE)
  const [roleTargetAddress, setRoleTargetAddress] = useState("");
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleMessage, setRoleMessage] = useState("");

  // Chargement de tous les signalements
  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAllIssues();
      setIssues([...data].reverse());
    } catch (err) {
      setError(explainError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  // Chargement de l'historique du signalement sélectionné
  const loadHistoryForSelected = useCallback(async (issueId) => {
    if (!issueId) return;
    setLoadingHistory(true);
    try {
      const hist = await fetchIssueHistory(issueId);
      setSelectedHistory(hist);
    } catch {
      setSelectedHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const selectIssue = (issue) => {
    setSelectedIssue(issue);
    setActionSuccess("");
    setError("");
    setAssignTeamName(issue.assignedTo || "");
    setAssignComment("");
    setStatusComment("");
    loadHistoryForSelected(issue.issueId);
  };

  // Filtrage des signalements
  const filteredIssues = useMemo(() => {
    return issues.filter((item) => {
      if (filterStatus !== "all" && item.status !== Number(filterStatus)) return false;
      if (filterPriority !== "all" && item.priority.toLowerCase() !== filterPriority.toLowerCase()) return false;
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        const matches =
          item.issueId.toLowerCase().includes(q) ||
          item.issueType.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.assignedTo.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [issues, filterStatus, filterPriority, filterSearch]);

  // Métriques globales
  const stats = useMemo(() => {
    const total = issues.length;
    const reported = issues.filter((i) => i.status === 0).length;
    const assigned = issues.filter((i) => i.status === 1).length;
    const inProgress = issues.filter((i) => i.status === 2).length;
    const resolved = issues.filter((i) => i.status === 3).length;
    const closed = issues.filter((i) => i.status === 4).length;
    return { total, reported, assigned, inProgress, resolved, closed };
  }, [issues]);

  // Action : Affecter une équipe technique (assignTeam)
  async function handleAssignTeam(e) {
    e.preventDefault();
    setError("");
    setActionSuccess("");

    const team = assignTeamName.trim();
    const comment = assignComment.trim();

    if (!team) return setError("Le nom de l'équipe technique est obligatoire.");
    if (!comment) return setError("Un commentaire d'affectation est obligatoire pour assurer la traçabilité.");

    setAssignBusy(true);
    try {
      const tx = await contract.assignTeam(selectedIssue.issueId, team, comment);
      await tx.wait();

      setActionSuccess(`Équipe « ${team} » affectée avec succès au signalement #${selectedIssue.issueId} !`);
      setAssignComment("");
      await loadIssues();

      // Mettre à jour l'issue sélectionnée
      setSelectedIssue((prev) => ({
        ...prev,
        assignedTo: team,
        status: 1, // Assigned
      }));
      await loadHistoryForSelected(selectedIssue.issueId);
    } catch (err) {
      setError(explainError(err));
    } finally {
      setAssignBusy(false);
    }
  }

  // Action : Mise à jour du statut suivant (updateStatus)
  async function handleUpdateStatus(nextStatus, nextStatusName) {
    setError("");
    setActionSuccess("");

    const comment = statusComment.trim();
    if (!comment) {
      return setError(`Un commentaire explicatif est obligatoire pour passer au statut « ${nextStatusName} ».`);
    }

    setStatusBusy(true);
    try {
      const tx = await contract.updateStatus(selectedIssue.issueId, nextStatus, comment);
      await tx.wait();

      setActionSuccess(`Statut mis à jour vers « ${nextStatusName} » avec succès !`);
      setStatusComment("");
      await loadIssues();

      setSelectedIssue((prev) => ({
        ...prev,
        status: nextStatus,
      }));
      await loadHistoryForSelected(selectedIssue.issueId);
    } catch (err) {
      setError(explainError(err));
    } finally {
      setStatusBusy(false);
    }
  }

  // Action Admin : Gérer les rôles
  async function handleRoleAction(grant) {
    setRoleMessage("");
    setError("");
    const target = roleTargetAddress.trim();
    if (!target || !ethers.isAddress(target)) {
      return setRoleMessage("Adresse Ethereum invalide.");
    }

    setRoleBusy(true);
    try {
      const tx = grant
        ? await contract.grantRole(MUNICIPALITY_ROLE, target)
        : await contract.revokeRole(MUNICIPALITY_ROLE, target);
      await tx.wait();

      setRoleMessage(
        grant
          ? `Rôle MUNICIPALITY_ROLE accordé à ${shortAddress(target)}.`
          : `Rôle MUNICIPALITY_ROLE révoqué pour ${shortAddress(target)}.`
      );
      setRoleTargetAddress("");
    } catch (err) {
      setRoleMessage(explainError(err));
    } finally {
      setRoleBusy(false);
    }
  }

  // Écran d'avertissement si non connecté ou non habilité
  if (!account) {
    return (
      <div className="panel">
        <h2>Espace Municipalité — Connexion Requise</h2>
        <p className="muted">
          Cet espace est réservé aux agents des services techniques municipaux pour affecter des équipes et suivre les interventions sur les signalements urbains.
        </p>
        <button className="btn btn-primary" onClick={onConnectWallet} style={{ marginTop: "1rem" }}>
          🦊 Connecter le portefeuille MetaMask
        </button>
      </div>
    );
  }

  if (!isMunicipality && !isAdmin) {
    return (
      <div className="panel">
        <h2>Accès Restreint — Services Municipaux</h2>
        <p className="notice notice-warn">
          Votre compte connecté (<span className="mono">{shortAddress(account)}</span>) ne dispose pas du rôle{" "}
          <strong className="mono">MUNICIPALITY_ROLE</strong>. Seuls les agents municipaux accrédités peuvent intervenir sur les signalements.
        </p>
        <p className="muted small">
          Si vous êtes un agent municipal, veuillez basculer sur l'adresse correspondante dans MetaMask ou contacter l'administrateur de la plateforme.
        </p>
      </div>
    );
  }

  // Calcul du statut suivant autorisé selon le cycle de vie
  const currentStatus = selectedIssue ? selectedIssue.status : 0;
  const nextStatus = currentStatus + 1;
  const canAdvance = selectedIssue && nextStatus <= 4;
  const nextStatusName = canAdvance ? STATUS_LABELS[nextStatus] : "";

  return (
    <div className="stack">
      {/* 1. Tableau de bord des statistiques */}
      <section className="stats-row">
        <div className="stat-card">
          <span className="stat-num">{stats.total}</span>
          <span className="stat-label">Total Signalements</span>
        </div>
        <div className="stat-card stat-reported">
          <span className="stat-num">{stats.reported}</span>
          <span className="stat-label">Signalés (0)</span>
        </div>
        <div className="stat-card stat-assigned">
          <span className="stat-num">{stats.assigned}</span>
          <span className="stat-label">Affectés (1)</span>
        </div>
        <div className="stat-card stat-inprogress">
          <span className="stat-num">{stats.inProgress}</span>
          <span className="stat-label">En cours (2)</span>
        </div>
        <div className="stat-card stat-resolved">
          <span className="stat-num">{stats.resolved}</span>
          <span className="stat-label">Résolus (3)</span>
        </div>
        <div className="stat-card stat-closed">
          <span className="stat-num">{stats.closed}</span>
          <span className="stat-label">Clôturés (4)</span>
        </div>
      </section>

      {/* 2. Liste des signalements & Filtres */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Gestion des signalements urbains</h2>
            <p className="muted">
              Consultez les signalements des citoyens, affectez les équipes techniques et mettez à jour l'état d'avancement des interventions.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadIssues} disabled={loading}>
            {loading ? "Chargement…" : "🔄 Actualiser"}
          </button>
        </div>

        {/* Barre de filtres */}
        <div className="filters-bar">
          <input
            type="text"
            placeholder="Filtrer par ID, type, rue ou équipe…"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="filter-search-input"
          />

          <div className="filter-group">
            <span className="filter-label">Statut :</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="select-field select-sm"
            >
              <option value="all">Tous les statuts</option>
              <option value="0">Signalé (Reported)</option>
              <option value="1">Affecté (Assigned)</option>
              <option value="2">En cours (InProgress)</option>
              <option value="3">Résolu (Resolved)</option>
              <option value="4">Clôturé (Closed)</option>
            </select>
          </div>

          <div className="filter-group">
            <span className="filter-label">Priorité :</span>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="select-field select-sm"
            >
              <option value="all">Toutes priorités</option>
              <option value="Critical">Critique</option>
              <option value="High">Haute</option>
              <option value="Medium">Moyenne</option>
              <option value="Low">Basse</option>
            </select>
          </div>
        </div>

        {error && <p className="notice notice-error">{error}</p>}
        {actionSuccess && <p className="notice notice-ok">{actionSuccess}</p>}

        {/* Tableau des signalements */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Localisation</th>
                <th>Date</th>
                <th>Priorité</th>
                <th>Statut</th>
                <th>Équipe affectée</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssues.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: "center", padding: "1.5rem" }} className="muted">
                    {loading ? "Chargement des signalements on-chain…" : "Aucun signalement ne correspond aux filtres."}
                  </td>
                </tr>
              ) : (
                filteredIssues.map((item) => {
                  const isSelected = selectedIssue?.issueId === item.issueId;
                  const statusLabel = STATUS_LABELS[item.status] || item.status;
                  const statusBadge = STATUS_BADGE_CLASSES[item.status] || "badge-default";
                  const priorityBadge = PRIORITY_BADGE_CLASSES[item.priority] || "badge-priority-medium";

                  return (
                    <tr
                      key={item.issueId}
                      className={`clickable ${isSelected ? "row-selected" : ""}`}
                      onClick={() => selectIssue(item)}
                    >
                      <td className="mono font-bold">{item.issueId}</td>
                      <td>{item.issueType}</td>
                      <td>{item.location}</td>
                      <td>{item.reportDate}</td>
                      <td>
                        <span className={`badge ${priorityBadge}`}>{item.priority}</span>
                      </td>
                      <td>
                        <span className={`badge ${statusBadge}`}>{statusLabel}</span>
                      </td>
                      <td>
                        {item.assignedTo ? (
                          <span>👷 {item.assignedTo}</span>
                        ) : (
                          <span className="muted small">Non affecté</span>
                        )}
                      </td>
                      <td>
                        <button
                          className={`btn btn-sm ${isSelected ? "btn-primary" : "btn-ghost"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectIssue(item);
                          }}
                        >
                          {isSelected ? "Sélectionné ✓" : "Intervenir"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Volet d'intervention sur le signalement sélectionné */}
      {selectedIssue && (
        <section className="panel manage-panel">
          <div className="panel-head">
            <div>
              <h2>
                Intervention sur le signalement <span className="mono">{selectedIssue.issueId}</span>
              </h2>
              <p className="muted">
                {selectedIssue.issueType} • 📍 {selectedIssue.location}
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIssue(null)}>
              Fermer ✕
            </button>
          </div>

          <div className="manage-grid">
            {/* Action 1 : Affecter l'équipe technique */}
            <div className="manage-box">
              <h3>1. Affectation de l'équipe technique</h3>
              <p className="small muted">
                Réservé aux signalements aux statuts <em>Signalé</em> ou <em>Affecté</em>. Fait passer le statut à <strong>Affecté (Assigned)</strong>.
              </p>

              <form onSubmit={handleAssignTeam} className="stack-sm">
                <label>
                  Équipe d'intervention *
                  <input
                    type="text"
                    placeholder="Ex: Equipe Voirie, UrbanTeam01, Eclairage 1"
                    value={assignTeamName}
                    onChange={(e) => setAssignTeamName(e.target.value)}
                    disabled={assignBusy || selectedIssue.status > 1}
                    required
                  />
                </label>

                <label>
                  Commentaire d'affectation *
                  <textarea
                    rows="2"
                    placeholder="Précisez la date prévue d'intervention ou les consignes…"
                    value={assignComment}
                    onChange={(e) => setAssignComment(e.target.value)}
                    disabled={assignBusy || selectedIssue.status > 1}
                    className="textarea-field"
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={assignBusy || selectedIssue.status > 1}
                >
                  {assignBusy ? "Affectation en cours…" : "Affecter l'équipe"}
                </button>

                {selectedIssue.status > 1 && (
                  <p className="small notice notice-warn">
                    L'équipe ne peut plus être réaffectée car l'intervention est déjà en cours ou terminée (statut &gt; Affecté).
                  </p>
                )}
              </form>
            </div>

            {/* Action 2 : Progression du statut dans le cycle de vie */}
            <div className="manage-box">
              <h3>2. Progression du cycle de vie</h3>
              <p className="small muted">
                Statut actuel : <strong className={`badge ${STATUS_BADGE_CLASSES[selectedIssue.status]}`}>{STATUS_LABELS[selectedIssue.status]}</strong>
              </p>

              {canAdvance ? (
                <div className="stack-sm">
                  <p className="small">
                    Prochaine étape séquentielle : <strong className="badge badge-info">{nextStatusName}</strong>
                  </p>

                  <label>
                    Commentaire d'intervention obligatoire *
                    <textarea
                      rows="2"
                      placeholder={`Détails pour le passage au statut ${nextStatusName}…`}
                      value={statusComment}
                      onChange={(e) => setStatusComment(e.target.value)}
                      disabled={statusBusy}
                      className="textarea-field"
                      required
                    />
                  </label>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleUpdateStatus(nextStatus, nextStatusName)}
                    disabled={statusBusy}
                  >
                    {statusBusy ? "Mise à jour on-chain…" : `➜ Passer au statut : ${nextStatusName}`}
                  </button>
                </div>
              ) : (
                <div className="notice notice-ok">
                  Ce signalement a atteint le statut final <strong>Clôturé (Closed)</strong>. Aucune transition supplémentaire n'est possible.
                </div>
              )}
            </div>
          </div>

          {/* Timeline de traçabilité du signalement */}
          <div style={{ marginTop: "1.5rem" }}>
            {loadingHistory ? (
              <p className="muted small">Chargement de la traçabilité…</p>
            ) : (
              <IssueTimeline history={selectedHistory} />
            )}
          </div>
        </section>
      )}

      {/* 4. Administration des rôles (DEFAULT_ADMIN_ROLE) */}
      {isAdmin && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Administration des Rôles Municipaux</h2>
              <p className="muted">
                Votre compte possède le rôle <span className="mono">DEFAULT_ADMIN_ROLE</span>. Vous pouvez habiliter ou révoquer les agents municipaux (<span className="mono">MUNICIPALITY_ROLE</span>).
              </p>
            </div>
          </div>

          <div className="inline-form">
            <input
              type="text"
              placeholder="Adresse Ethereum de l'agent (0x…)"
              value={roleTargetAddress}
              onChange={(e) => setRoleTargetAddress(e.target.value)}
              disabled={roleBusy}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleRoleAction(true)}
              disabled={roleBusy || !roleTargetAddress}
            >
              Accorder MUNICIPALITY_ROLE
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => handleRoleAction(false)}
              disabled={roleBusy || !roleTargetAddress}
            >
              Révoquer MUNICIPALITY_ROLE
            </button>
          </div>

          {roleMessage && <p className="notice notice-info" style={{ marginTop: "0.8rem" }}>{roleMessage}</p>}
        </section>
      )}
    </div>
  );
}
