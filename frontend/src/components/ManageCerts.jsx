import { useCallback, useEffect, useState } from "react";
import { explainError, fetchLatest } from "../lib/chain.js";

export default function ManageCerts({ contract, canRevoke }) {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLatest(200);
      setList(res.list);
      setTotal(res.total);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(c) {
    const certId = c.tokenId ?? c.id;
    if (
      !window.confirm(
        `Révoquer définitivement le certificat n° ${certId} (${c.studentName}) ?\nCette action est irréversible et sera enregistrée sur la blockchain.`
      )
    )
      return;

    setError("");
    setInfo("");
    setRevoking(certId);
    try {
      const tx = await contract.revokeCertificate(certId);
      await tx.wait();
      setInfo(`✅ Certificat n° ${certId} révoqué avec succès. Transaction : ${tx.hash}`);
      await load();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Gestion et révocation des certificats</h2>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          Actualiser
        </button>
      </div>

      <p className="muted small">
        La révocation d'un diplôme est une action sensible réservée exclusivement au rôle{" "}
        <span className="mono">DEFAULT_ADMIN_ROLE</span>.
      </p>

      {!canRevoke && (
        <p className="notice notice-warn">
          ⚠️ Votre compte ne possède pas le rôle d'administration (<span className="mono">DEFAULT_ADMIN_ROLE</span>). Les boutons de révocation sont désactivés.
        </p>
      )}

      {loading && <p className="muted">Chargement de la liste des certificats…</p>}
      {!loading && list.length === 0 && !error && (
        <p className="muted">Aucun certificat émis pour le moment.</p>
      )}

      {list.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Token ID</th>
                <th>Étudiant</th>
                <th>CNE</th>
                <th>Diplôme</th>
                <th>tokenURI</th>
                <th>Statut</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const certId = c.tokenId ?? c.id;
                const uri = c.tokenURI;
                const webUri = uri && uri.startsWith("ipfs://")
                  ? `https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`
                  : uri;

                return (
                  <tr key={certId}>
                    <td><strong>#{certId}</strong></td>
                    <td>{c.studentName}</td>
                    <td>{c.studentId}</td>
                    <td>{c.diplomaTitle}</td>
                    <td className="mono small">
                      {uri ? (
                        <a href={webUri} target="_blank" rel="noopener noreferrer" title={uri}>
                          {uri.length > 24 ? `${uri.slice(0, 20)}…` : uri}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <span className={`badge ${c.revoked ? "badge-bad" : "badge-ok"}`}>
                        {c.revoked ? "RÉVOQUÉ" : "VALIDE"}
                      </span>
                    </td>
                    <td>
                      {!c.revoked && (
                        <button
                          className="btn btn-danger"
                          onClick={() => revoke(c)}
                          disabled={!canRevoke || revoking !== null}
                          title={!canRevoke ? "DEFAULT_ADMIN_ROLE requis" : "Révoquer ce diplôme"}
                        >
                          {revoking === certId ? "Révocation…" : "Révoquer"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > list.length && (
        <p className="muted small">Affichage des {list.length} derniers certificats sur {total}.</p>
      )}
      {info && <p className="notice notice-ok mono small">{info}</p>}
      {error && <p className="notice notice-error">{error}</p>}
    </div>
  );
}
