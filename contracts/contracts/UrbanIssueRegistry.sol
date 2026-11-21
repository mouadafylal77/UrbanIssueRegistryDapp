// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title UrbanIssueRegistry - Registre décentralisé de gestion des signalements urbains
/// @notice Permet aux citoyens de signaler des problèmes urbains et aux services municipaux d'assurer leur suivi traçable.
contract UrbanIssueRegistry is AccessControl {
    /// @notice Rôle attribué aux agents des services municipaux
    bytes32 public constant MUNICIPALITY_ROLE = keccak256("MUNICIPALITY_ROLE");

    /// @notice Cycle de vie d'un signalement urbain
    enum Status {
        Reported,   // 0: Signalement enregistré par le citoyen
        Assigned,   // 1: Affecté à une équipe technique municipale
        InProgress, // 2: Travaux ou intervention en cours
        Resolved,   // 3: Problème résolu / intervention terminée
        Closed      // 4: Dossier validé et clôturé
    }

    /// @notice Modèle de données d'un signalement urbain (conforme au cahier des charges)
    struct Issue {
        string issueId;      // Identifiant unique (ex: "CITY-2026-001")
        string issueType;    // Type d'incident (ex: "StreetLight", "Pothole", "WaterLeak")
        string location;     // Localisation (ex: "Avenue Mohammed V")
        string description;  // Description détaillée de l'incident
        string reportDate;   // Date de signalement (ex: "2026-11-19")
        string priority;     // Priorité ("Low", "Medium", "High", "Critical")
        string reportedBy;   // Identifiant ou nom du citoyen (ex: "Citizen01")
        string assignedTo;   // Équipe technique affectée (ex: "UrbanTeam01")
        Status status;       // Statut courant dans le cycle de vie
        bool exists;         // Indicateur d'existence
    }

    /// @notice Entrée d'historique pour la traçabilité complète de chaque action
    struct HistoryEntry {
        uint256 timestamp;   // Horodatage de l'opération
        Status status;       // Statut à ce moment
        string assignedTeam; // Équipe affectée au moment de l'opération
        string comment;      // Commentaire relatif à l'intervention
        address updatedBy;   // Adresse blockchain de l'acteur ayant opéré
    }

    // Mappings de stockage
    mapping(string => Issue) private _issues;
    mapping(string => HistoryEntry[]) private _issueHistory;
    string[] private _allIssueIds;

    // Événements pour la traçabilité on-chain
    event IssueCreated(
        string issueId,
        string issueType,
        string location,
        string priority,
        string reportedBy,
        address indexed creator
    );

    event TeamAssigned(
        string issueId,
        string assignedTeam,
        address indexed updatedBy,
        string comment
    );

    event StatusUpdated(
        string issueId,
        Status indexed previousStatus,
        Status indexed newStatus,
        address indexed updatedBy,
        string comment
    );

    /// @notice Initialise le contrat en octroyant les rôles d'administration et municipal au déployeur
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MUNICIPALITY_ROLE, msg.sender);
    }

    // ==========================================
    // Fonctions de Création
    // ==========================================

    /// @notice Enregistre un nouveau signalement urbain (accessible publiquement aux citoyens)
    /// @dev Initialise le statut à Reported et enregistre la première entrée dans l'historique
    function createIssue(
        string memory issueId,
        string memory issueType,
        string memory location,
        string memory description,
        string memory reportDate,
        string memory priority,
        string memory reportedBy
    ) public returns (bool) {
        _createIssue(
            issueId,
            issueType,
            location,
            description,
            reportDate,
            priority,
            reportedBy,
            ""
        );
        return true;
    }

    /// @notice Enregistre un signalement avec une équipe directement spécifiée
    function createIssueWithTeam(
        string memory issueId,
        string memory issueType,
        string memory location,
        string memory description,
        string memory reportDate,
        string memory priority,
        string memory reportedBy,
        string memory assignedTo
    ) public returns (bool) {
        _createIssue(
            issueId,
            issueType,
            location,
            description,
            reportDate,
            priority,
            reportedBy,
            assignedTo
        );
        return true;
    }

    /// @notice Enregistrement par lot de plusieurs signalements (ex: import Excel)
    /// @dev Rejette les doublons et les entrées invalides en annulant la transaction si anomalie
    function createIssuesBatch(
        string[] memory issueIds,
        string[] memory issueTypes,
        string[] memory locations,
        string[] memory descriptions,
        string[] memory reportDates,
        string[] memory priorities,
        string[] memory reportedBys
    ) external returns (uint256) {
        uint256 count = issueIds.length;
        require(count > 0, "Lot vide");
        require(
            issueTypes.length == count &&
            locations.length == count &&
            descriptions.length == count &&
            reportDates.length == count &&
            priorities.length == count &&
            reportedBys.length == count,
            "Tableaux de longueurs differentes"
        );

        for (uint256 i = 0; i < count; i++) {
            _createIssue(
                issueIds[i],
                issueTypes[i],
                locations[i],
                descriptions[i],
                reportDates[i],
                priorities[i],
                reportedBys[i],
                ""
            );
        }
        return count;
    }

    /// @notice Enregistrement par lot avec équipes affectées (ex: import Excel avec colonne assignedTo)
    function createIssuesBatchWithTeams(
        string[] memory issueIds,
        string[] memory issueTypes,
        string[] memory locations,
        string[] memory descriptions,
        string[] memory reportDates,
        string[] memory priorities,
        string[] memory reportedBys,
        string[] memory assignedTos
    ) external returns (uint256) {
        uint256 count = issueIds.length;
        require(count > 0, "Lot vide");
        require(
            issueTypes.length == count &&
            locations.length == count &&
            descriptions.length == count &&
            reportDates.length == count &&
            priorities.length == count &&
            reportedBys.length == count &&
            assignedTos.length == count,
            "Tableaux de longueurs differentes"
        );

        for (uint256 i = 0; i < count; i++) {
            _createIssue(
                issueIds[i],
                issueTypes[i],
                locations[i],
                descriptions[i],
                reportDates[i],
                priorities[i],
                reportedBys[i],
                assignedTos[i]
            );
        }
        return count;
    }

    // ==========================================
    // Gestion Municipale & Cycle de Vie
    // ==========================================

    /// @notice Affecte une équipe technique d'intervention à un signalement
    /// @dev Réservée au rôle MUNICIPALITY_ROLE, fait passer le statut à Assigned
    function assignTeam(
        string memory issueId,
        string memory team,
        string memory comment
    ) external onlyRole(MUNICIPALITY_ROLE) {
        require(bytes(issueId).length > 0, "Identifiant requis");
        require(_issues[issueId].exists, "Signalement introuvable");
        require(bytes(team).length > 0, "Equipe requise");

        Issue storage issue = _issues[issueId];
        require(
            issue.status == Status.Reported || issue.status == Status.Assigned,
            "Statut incompatible pour affectation"
        );

        Status oldStatus = issue.status;
        issue.assignedTo = team;
        issue.status = Status.Assigned;

        string memory entryComment = bytes(comment).length > 0 ? comment : "Equipe affectee";

        _issueHistory[issueId].push(
            HistoryEntry({
                timestamp: block.timestamp,
                status: Status.Assigned,
                assignedTeam: team,
                comment: entryComment,
                updatedBy: msg.sender
            })
        );

        emit TeamAssigned(issueId, team, msg.sender, comment);

        if (oldStatus != Status.Assigned) {
            emit StatusUpdated(issueId, oldStatus, Status.Assigned, msg.sender, entryComment);
        }
    }

    /// @notice Met à jour le statut d'un signalement selon le cycle de vie séquentiel
    /// @dev Réservée à MUNICIPALITY_ROLE, vérifie Reported -> Assigned -> InProgress -> Resolved -> Closed
    function updateStatus(
        string memory issueId,
        Status newStatus,
        string memory comment
    ) external onlyRole(MUNICIPALITY_ROLE) {
        require(bytes(issueId).length > 0, "Identifiant requis");
        require(_issues[issueId].exists, "Signalement introuvable");

        Issue storage issue = _issues[issueId];
        Status currentStatus = issue.status;

        require(
            uint8(newStatus) == uint8(currentStatus) + 1,
            "Transition de statut invalide"
        );

        issue.status = newStatus;

        string memory entryComment = bytes(comment).length > 0 ? comment : "Mise a jour du statut";

        _issueHistory[issueId].push(
            HistoryEntry({
                timestamp: block.timestamp,
                status: newStatus,
                assignedTeam: issue.assignedTo,
                comment: entryComment,
                updatedBy: msg.sender
            })
        );

        emit StatusUpdated(issueId, currentStatus, newStatus, msg.sender, comment);
    }

    // ==========================================
    // Fonctions de Consultation
    // ==========================================

    /// @notice Retourne les détails d'un signalement
    function getIssue(string memory issueId) external view returns (Issue memory) {
        require(_issues[issueId].exists, "Signalement introuvable");
        return _issues[issueId];
    }

    /// @notice Retourne l'historique complet d'un signalement pour traçabilité
    function getIssueHistory(string memory issueId) external view returns (HistoryEntry[] memory) {
        require(_issues[issueId].exists, "Signalement introuvable");
        return _issueHistory[issueId];
    }

    /// @notice Retourne la liste de tous les identifiants de signalements enregistrés
    function getAllIssueIds() external view returns (string[] memory) {
        return _allIssueIds;
    }

    /// @notice Retourne l'ensemble de tous les signalements pour faciliter l'affichage frontend
    function getAllIssues() external view returns (Issue[] memory) {
        uint256 count = _allIssueIds.length;
        Issue[] memory list = new Issue[](count);
        for (uint256 i = 0; i < count; i++) {
            list[i] = _issues[_allIssueIds[i]];
        }
        return list;
    }

    /// @notice Retourne le nombre total de signalements
    function totalIssues() external view returns (uint256) {
        return _allIssueIds.length;
    }

    /// @notice Vérifie si un identifiant de signalement existe déjà
    function issueExists(string memory issueId) external view returns (bool) {
        return _issues[issueId].exists;
    }

    // ==========================================
    // Fonctions Internes
    // ==========================================

    function _createIssue(
        string memory issueId,
        string memory issueType,
        string memory location,
        string memory description,
        string memory reportDate,
        string memory priority,
        string memory reportedBy,
        string memory assignedTo
    ) internal {
        require(bytes(issueId).length > 0, "Identifiant requis");
        require(!_issues[issueId].exists, "Signalement deja existant");
        require(bytes(issueType).length > 0, "Type de probleme requis");
        require(bytes(location).length > 0, "Localisation requise");

        Status initialStatus = bytes(assignedTo).length > 0 ? Status.Assigned : Status.Reported;

        _issues[issueId] = Issue({
            issueId: issueId,
            issueType: issueType,
            location: location,
            description: description,
            reportDate: reportDate,
            priority: priority,
            reportedBy: reportedBy,
            assignedTo: assignedTo,
            status: initialStatus,
            exists: true
        });

        _allIssueIds.push(issueId);

        _issueHistory[issueId].push(
            HistoryEntry({
                timestamp: block.timestamp,
                status: initialStatus,
                assignedTeam: assignedTo,
                comment: bytes(assignedTo).length > 0 ? "Signalement cree et equipe affectee" : "Signalement cree",
                updatedBy: msg.sender
            })
        );

        emit IssueCreated(
            issueId,
            issueType,
            location,
            priority,
            reportedBy,
            msg.sender
        );

        if (bytes(assignedTo).length > 0) {
            emit TeamAssigned(issueId, assignedTo, msg.sender, "Affectation initiale");
        }
    }
}
