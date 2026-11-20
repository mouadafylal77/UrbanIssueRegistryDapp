// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "../CertificateRegistry.sol";

/// @title Contrat simulant une attaque de réentrance lors du callback _safeMint
contract ReentrancyAttacker is IERC721Receiver {
    CertificateRegistry public target;
    bool public attackAttempted;

    constructor(address _target) {
        target = CertificateRegistry(_target);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
        attackAttempted = true;
        // Tentative de rappel réentrant pendant l'exécution de mintCertificate
        target.mintCertificate(
            address(this),
            "Attaque Reentrante",
            "CNE_REENTRANT_002",
            "Diplome Reentrant",
            "2026-01-01",
            "Passable",
            "ipfs://reentrant"
        );
        return this.onERC721Received.selector;
    }
}
