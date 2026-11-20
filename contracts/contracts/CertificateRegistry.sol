// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Registre de certification de diplômes académiques
/// @notice Contrat ERC-721 avec gestion des métadonnées (URIStorage), contrôle d'accès (AccessControl) et protection anti-réentrance (ReentrancyGuard).
contract CertificateRegistry is ERC721URIStorage, AccessControl, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public constant MAX_BATCH = 10;

    struct Certificate {
        uint256 id;
        string studentName;
        string studentId; // CNE, unique
        string diplomaTitle;
        string issueDate;
        string grade; // optionnel
        address recipientAddress;
        bool revoked;
        uint256 issuedAt;
    }

    uint256 private _lastId;
    mapping(uint256 => Certificate) private _certificates;
    mapping(string => bool) public studentIdExists;

    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        string studentId,
        string studentName,
        string diplomaTitle,
        string tokenURI
    );

    event CertificateRevoked(uint256 indexed tokenId);

    constructor() ERC721("AcademicCertificate", "ACERT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    /// @notice Émission d'un certificat unitaire sous forme de token ERC-721
    function mintCertificate(
        address recipient,
        string memory studentName,
        string memory studentId,
        string memory diplomaTitle,
        string memory issueDate,
        string memory grade,
        string memory uri
    ) external onlyRole(MINTER_ROLE) nonReentrant returns (uint256) {
        return _issue(recipient, studentName, studentId, diplomaTitle, issueDate, grade, uri);
    }

    /// @notice Émission par lots de certificats (maximum 10)
    function batchMintCertificates(
        address[] memory recipients,
        string[] memory studentNames,
        string[] memory studentIds,
        string[] memory diplomaTitles,
        string[] memory issueDates,
        string[] memory grades,
        string[] memory uris
    ) public onlyRole(MINTER_ROLE) nonReentrant returns (uint256 firstId, uint256 lastId) {
        return _batchMint(recipients, studentNames, studentIds, diplomaTitles, issueDates, grades, uris);
    }

    /// @notice Alias de compatibilité pour batchMintCertificates
    function mintBatch(
        address[] memory recipients,
        string[] memory studentNames,
        string[] memory studentIds,
        string[] memory diplomaTitles,
        string[] memory issueDates,
        string[] memory grades,
        string[] memory uris
    ) external onlyRole(MINTER_ROLE) nonReentrant returns (uint256 firstId, uint256 lastId) {
        return _batchMint(recipients, studentNames, studentIds, diplomaTitles, issueDates, grades, uris);
    }

    /// @notice Révocation administrative d'un certificat existant
    function revokeCertificate(uint256 tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(tokenId >= 1 && tokenId <= _lastId, "Certificat introuvable");
        Certificate storage c = _certificates[tokenId];
        require(!c.revoked, "Certificat deja revoque");

        c.revoked = true;
        emit CertificateRevoked(tokenId);
    }

    /// @notice Récupération des informations d'un certificat (struct + tokenURI)
    function getCertificate(uint256 tokenId)
        external
        view
        returns (Certificate memory cert, string memory uri)
    {
        require(tokenId >= 1 && tokenId <= _lastId, "Certificat introuvable");
        return (_certificates[tokenId], tokenURI(tokenId));
    }

    /// @notice Nombre total de certificats émis
    function totalCertificates() external view returns (uint256) {
        return _lastId;
    }

    function _batchMint(
        address[] memory recipients,
        string[] memory studentNames,
        string[] memory studentIds,
        string[] memory diplomaTitles,
        string[] memory issueDates,
        string[] memory grades,
        string[] memory uris
    ) internal returns (uint256 firstId, uint256 lastId) {
        uint256 n = recipients.length;
        require(n > 0, "Lot vide");
        require(n <= MAX_BATCH, "Maximum 10 certificats par lot");
        require(
            studentNames.length == n &&
                studentIds.length == n &&
                diplomaTitles.length == n &&
                issueDates.length == n &&
                grades.length == n &&
                uris.length == n,
            "Tableaux de longueurs differentes"
        );

        firstId = _lastId + 1;
        for (uint256 i = 0; i < n; i++) {
            _issue(
                recipients[i],
                studentNames[i],
                studentIds[i],
                diplomaTitles[i],
                issueDates[i],
                grades[i],
                uris[i]
            );
        }
        lastId = _lastId;
    }

    function _issue(
        address recipient,
        string memory studentName,
        string memory studentId,
        string memory diplomaTitle,
        string memory issueDate,
        string memory grade,
        string memory uri
    ) internal returns (uint256 id) {
        require(recipient != address(0), "Adresse invalide");
        require(bytes(studentName).length > 0, "Nom requis");
        require(bytes(studentId).length > 0, "CNE requis");
        require(bytes(diplomaTitle).length > 0, "Intitule requis");
        require(bytes(issueDate).length > 0, "Date requise");
        require(!studentIdExists[studentId], "Ce CNE est deja enregistre");

        studentIdExists[studentId] = true;
        id = ++_lastId;

        _certificates[id] = Certificate({
            id: id,
            studentName: studentName,
            studentId: studentId,
            diplomaTitle: diplomaTitle,
            issueDate: issueDate,
            grade: grade,
            recipientAddress: recipient,
            revoked: false,
            issuedAt: block.timestamp
        });

        _safeMint(recipient, id);

        if (bytes(uri).length > 0) {
            _setTokenURI(id, uri);
        }

        emit CertificateMinted(id, recipient, studentId, studentName, diplomaTitle, uri);
    }

    /// @inheritdoc ERC721URIStorage
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
