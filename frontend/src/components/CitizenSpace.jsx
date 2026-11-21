import { useState, useCallback, useEffect } from "react";
import IssueCard from "./IssueCard.jsx";
import {
  ISSUE_TYPES,
  explainError,
  fetchIssue,
  fetchAllIssues,
  isDeployed,
  shortAddress,
} from "../lib/chain.js";

const DEFAULT_FORM = {
  issueId: "",
  issueType: "StreetLight",
  location: "",
  description: "",
  reportDate: new Date().toISOString().split("T")[0],
  priority: "High",
  reportedBy: "",
};

export default function CitizenSpace({ contract, account, onConnectWallet }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [createdIssueId, setCreatedIssueId] = useState("");

  // Recherche publique
  const [searchInput, setSearchInput] = useState("");
  const [searchedIssue, setSearchedIssue] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Liste des signalements récents
  const [recentIssues, setRecentIssues] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const loadRecent = useCallback(async () => {
    if (!isDeployed()) return;
    setLoadingRecent(true);
    try {
      const all = await fetchAllIssues();
      // Inverser pour avoir les plus récents en premier
      setRecentIssues([...all].reverse());
    } catch {
      // Ignorer silencieusement si nœud non démarré
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  // Générer un identifiant aléatoire type CITY-2026-XXX
  const generateRandomId = () => {
    const num = Math.floor(100 + Math.random() * 900);
    const newId = `CITY-2026-${num}`;
    setForm((prev) => ({ ...prev, issueId: newId }));
    setFormError("");
  };

  const handleFieldChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setFormError("");
  };

  // Soumission du formulaire de déclaration
  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setSuccessMsg("");
    setCreatedIssueId("");

    const id = form.issueId.trim();
    const type = form.issueType.trim();
    const loc = form.location.trim();
    const desc = form.description.trim();
    const date = form.reportDate.trim();
    const prio = form.priority.trim();
    const reporter = form.reportedBy.trim() || (account ? shortAddress(account) : "Citoyen");

    if (!id) return setFormError("L'identifiant du problème (issueId) est obligatoire.");
    if (!type) return setFormError("Le type de problème est obligatoire.");
    if (!loc) return setFormError("La localisation géographique est obligatoire.");
    if (!desc) return setFormError("La description de l'incident est obligatoire.");
    if (!date) return setFormError("La date de signalement est obligatoire.");

    if (!contract) {
      if (onConnectWallet) {
        onConnectWallet();
      }
      return setFormError("Veuillez connecter votre portefeuille MetaMask pour signer la transaction.");
    }

    setSubmitting(true);
    try {
      const tx = await contract.createIssue(id, type, loc, desc, date, prio, reporter);
      setSuccessMsg(`Transaction envoyée ! En attente de confirmation on-chain… (Hash: ${tx.hash})`);
      await tx.wait();

      setSuccessMsg(`✅ Signalement #${id} enregistré avec succès sur la blockchain !`);
      setCreatedIssueId(id);
      setForm({
        ...DEFAULT_FORM,
        reportDate: new Date().toISOString().split("T")[0],
      });
      await loadRecent();
    } catch (err) {
      setFormError(explainError(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Recherche publique par issueId
  async function handleSearch(e) {
    if (e) e.preventDefault();
    const id = searchInput.trim();
    if (!id) {
      setSearchError("Veuillez saisir un identifiant de signalement (ex: CITY-2026-001).");
      return;
    }

    setSearchError("");
    setSearchedIssue(null);
    setSearchLoading(true);
    try {
      const issue = await fetchIssue(id);
      if (issue && issue.exists) {
        setSearchedIssue(issue);
      } else {
        setSearchError("Aucun signalement trouvé avec cet identifiant.");
      }
    } catch (err) {
      setSearchError(explainError(err));
    } finally {
      setSearchLoading(false);
    }
  }

  return (
    <div className="stack">
      {/* 1. Formulaire de déclaration citoyenne */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Déclarer un problème urbain</h2>
            <p className="muted">
              Signalez une anomalie dans l'espace public. Chaque signalement est inscrit de manière immuable sur la blockchain avec traçabilité complète.
            </p>
          </div>
          {!account && onConnectWallet && (
            <button className="btn btn-secondary btn-sm" onClick={onConnectWallet}>
              🦊 Connecter MetaMask
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="issue-form">
          <div className="grid-2">
            <div>
              <label>
                Identifiant du signalement (issueId) *
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="Ex: CITY-2026-001"
                    value={form.issueId}
                    onChange={handleFieldChange("issueId")}
                    disabled={submitting}
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={generateRandomId}
                    disabled={submitting}
                  >
                    🎲 Générer
                  </button>
                </div>
              </label>
            </div>

            <div>
              <label>
                Type d'incident urbain *
                <select
                  value={form.issueType}
                  onChange={handleFieldChange("issueType")}
                  disabled={submitting}
                  className="select-field"
                  required
                >
                  {ISSUE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="span-2">
              <label>
                Localisation géographique précise *
                <input
                  type="text"
                  placeholder="Ex: Avenue Mohammed V, angle Rue 12, devant la poste"
                  value={form.location}
                  onChange={handleFieldChange("location")}
                  disabled={submitting}
                  required
                />
              </label>
            </div>

            <div className="span-2">
              <label>
                Description détaillée de l'incident *
                <textarea
                  rows="3"
                  placeholder="Décrivez l'incident : gravité, risques pour les usagers, repères visuels…"
                  value={form.description}
                  onChange={handleFieldChange("description")}
                  disabled={submitting}
                  className="textarea-field"
                  required
                />
              </label>
            </div>

            <div>
              <label>
                Date du constat (reportDate) *
                <input
                  type="date"
                  value={form.reportDate}
                  onChange={handleFieldChange("reportDate")}
                  disabled={submitting}
                  required
                />
              </label>
            </div>

            <div>
              <label>
                Niveau de priorité *
                <select
                  value={form.priority}
                  onChange={handleFieldChange("priority")}
                  disabled={submitting}
                  className="select-field"
                  required
                >
                  <option value="Low">Basse (Low)</option>
                  <option value="Medium">Moyenne (Medium)</option>
                  <option value="High">Haute (High)</option>
                  <option value="Critical">Critique (Critical)</option>
                </select>
              </label>
            </div>

            <div className="span-2">
              <label>
                Déclaré par (nom, pseudo ou identifiant citoyen)
                <input
                  type="text"
                  placeholder={account ? `Par défaut : ${shortAddress(account)}` : "Ex: Citizen01"}
                  value={form.reportedBy}
                  onChange={handleFieldChange("reportedBy")}
                  disabled={submitting}
                />
              </label>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Enregistrement sur blockchain en cours…" : "🚀 Enregistrer le signalement"}
            </button>
          </div>

          {formError && <p className="notice notice-error">{formError}</p>}
          {successMsg && (
            <div className="notice notice-ok">
              <p>{successMsg}</p>
              {createdIssueId && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setSearchInput(createdIssueId);
                    fetchIssue(createdIssueId).then(setSearchedIssue);
                  }}
                  style={{ marginTop: "0.5rem" }}
                >
                  🔍 Consulter le signalement #{createdIssueId}
                </button>
              )}
            </div>
          )}
        </form>
      </section>

      {/* 2. Consultation Publique & Traçabilité */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Consultation publique & Suivi d'incident</h2>
            <p className="muted">
              Recherchez n'importe quel signalement pour consulter en temps réel son état d'avancement et son historique d'intervention certifié.
            </p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="inline-form">
          <input
            type="text"
            placeholder="Identifiant du signalement (ex: CITY-2026-001)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            disabled={searchLoading}
          />
          <button type="submit" className="btn btn-secondary" disabled={searchLoading}>
            {searchLoading ? "Recherche…" : "🔍 Vérifier"}
          </button>
        </form>

        {searchError && <p className="notice notice-error">{searchError}</p>}

        {searchedIssue && (
          <div style={{ marginTop: "1.2rem" }}>
            <IssueCard issue={searchedIssue} autoExpandHistory={true} />
          </div>
        )}
      </section>

      {/* 3. Derniers signalements enregistrés */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Derniers signalements urbains (On-chain)</h2>
            <p className="muted">Registre public et ouvert des incidents déclarés dans la ville.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadRecent} disabled={loadingRecent}>
            {loadingRecent ? "Chargement…" : "🔄 Actualiser"}
          </button>
        </div>

        {recentIssues.length === 0 ? (
          <p className="muted">Aucun signalement enregistré pour le moment. Soyez le premier à déclarer un incident !</p>
        ) : (
          <div className="issues-grid">
            {recentIssues.map((issue) => (
              <IssueCard
                key={issue.issueId}
                issue={issue}
                autoExpandHistory={false}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
