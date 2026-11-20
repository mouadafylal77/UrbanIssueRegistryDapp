# 🛡️ Rapport d'Audit de Sécurité — CertificateRegistry (Devoir 2)

**Projet :** diploma-dapp (Registre de certification de diplômes académiques)  
**Date de l'audit :** Novembre 2026  
**Auteur :** Équipe de développement & Audit Smart Contracts  
**Version du compilateur :** Solidity `^0.8.24` (Target EVM : `cancun`)  
**Bibliothèques tierces :** OpenZeppelin Contracts `v5.0.2`  

---

## 1. Périmètre de l'Audit (Scope)

Le périmètre de cet audit de sécurité couvre l'ensemble des contrats intelligents et mécanismes cryptographiques introduits lors de la migration vers le **Devoir 2** :

| Composant | Fichier source | Standards & Modules intégrés |
|---|---|---|
| **Contrat Principal** | `contracts/contracts/CertificateRegistry.sol` | `ERC721URIStorage`, `AccessControl`, `ReentrancyGuard` |
| **Simulateur d'Attaque** | `contracts/contracts/mocks/ReentrancyAttacker.sol` | `IERC721Receiver` (Vérification de non-réentrance) |
| **Suite de Tests** | `contracts/test/CertificateRegistry.test.js` | Hardhat, Ethers.js v6, Chai Matchers |
| **Configuration EVM** | `contracts/hardhat.config.js` | EVM Cancun (`viaIR`, Optimizer 200 runs), Sepolia RPC |

---

## 2. Checklist Méthodologique & Matrice de Sécurité

L'évaluation s'appuie sur le référentiel de vulnérabilités **SWC Registry** (Smart Contract Weakness Classification) et les recommandations d'OpenZeppelin :

| ID SWC | Catégorie de Risque | Statut | Mesure de Mitigaton Implémentée |
|---|---|:---:|---|
| **SWC-105 / 106** | Contrôle d'accès & Privilèges non protégés | **CONFORME** | Rôles granulaires `DEFAULT_ADMIN_ROLE` et `MINTER_ROLE` via `AccessControl`. |
| **SWC-107** | Vulnérabilité de Réentrance (Reentrancy) | **CONFORME** | Modificateur `nonReentrant` sur fonctions d'état + respect du pattern CEI. |
| **SWC-128** | Déni de Service (DoS) par épuisement de gaz | **CONFORME** | Plafond strict imposé sur les émissions groupées (`MAX_BATCH = 10`). |
| **SWC-101** | Dépassement d'entiers (Overflow / Underflow) | **CONFORME** | Sécurisé nativement par le compilateur Solidity `^0.8.24`. |
| **SWC-135** | Absence de vérification des adresses nulles | **CONFORME** | Rejet explicite de `address(0)` pour tout destinataire de NFT. |
| **SWC-124** | Écriture arbitraire dans le stockage / Collision | **CONFORME** | Contrôle d'unicité CNE cryptographique via mapping `studentIdExists`. |

---

## 3. Analyse Détaillée des Vulnérabilités & Protections

### 3.1. Séparation des Rôles et Contrôle d'Accès (AccessControl)
- **Problématique :** Dans la version initiale (Devoir 1), le contrat utilisait `Ownable`, conférant tous les pouvoirs (émission, révocation, administration) à une seule clé privée (Single Point of Failure).
- **Solution apportée :** Découplage strict des privilèges :
  - `MINTER_ROLE` : Autorisé exclusivement à appeler `mintCertificate` et `batchMintCertificates`. Ce rôle est destiné au service scolarité.
  - `DEFAULT_ADMIN_ROLE` : Autorisé à attribuer ou révoquer les rôles et à exécuter `revokeCertificate`.
- **Résultat :** Un émetteur malveillant ou compromis ne peut pas révoquer de diplômes ni s'auto-attribuer les droits d'administration.

### 3.2. Protection Anti-Réentrance & Pattern Checks-Effects-Interactions (CEI)
- **Problématique :** L'utilisation de `_safeMint(recipient, id)` invoque le hook externe `onERC721Received` lorsque le destinataire est un contrat intelligent. Un contrat pirate pourrait exploiter cette fenêtre d'exécution pour ré-invoquer `mintCertificate` avant la mise à jour des états.
- **Solution apportée :**
  1. Application du modificateur `nonReentrant` d'OpenZeppelin sur toutes les fonctions mutables.
  2. Respect scrupuleux du pattern CEI : les mappings (`studentIdExists`), le compteur incrémenté (`_lastId`) et la structure du certificat sont écrits en mémoire **avant** l'appel de `_safeMint`.
- **Preuve par le test :** Le contrat d'attaque `ReentrancyAttacker` simule une tentative de réentrance interceptée immédiatement par l'erreur custom `ReentrancyGuardReentrantCall()`.

### 3.3. Intégrité des Données & Anti-Doublon CNE
- **Problématique :** Risque d'usurpation d'identité académique par émission multiple d'un même CNE d'étudiant.
- **Solution apportée :** Validation préalable via `require(!studentIdExists[studentId], "Ce CNE est deja enregistre")`. Toute tentative de recyclage d'un CNE existant entraîne un revert immédiat de la transaction.

### 3.4. Gestion des Adresses Nulles et Tokens Fantômes
- **Problématique :** ERC-721 interdit l'émission vers `address(0)`. Une adresse nulle non filtrée corromprait le registre ou provoquerait un revert non informatif.
- **Solution apportée :** Contrôle explicite `require(recipient != address(0), "Adresse invalide")` avec message d'erreur clair en français remonté vers l'interface utilisateur.

---

## 4. Résultats des Tests Automatisés (Hardhat Test Suite)

La suite de tests unitaires et fonctionnels `contracts/test/CertificateRegistry.test.js` valide l'intégralité des scénarios nominaux et d'attaque :

```
  CertificateRegistry (ERC-721 + AccessControl + ReentrancyGuard)
    1. Initialisation & Configuration ERC-721
      ✔ doit initialiser le nom et le symbole ERC-721
      ✔ doit attribuer DEFAULT_ADMIN_ROLE et MINTER_ROLE au déployeur
      ✔ doit démarrer avec un compteur total de certificats à 0
      ✔ doit supporter les interfaces ERC-721, ERC721URIStorage et AccessControl
    2. Émission unitaire (mintCertificate)
      ✔ doit émettre un certificat valide et émettre l'événement CertificateMinted
      ✔ doit enregistrer le CNE dans le mapping studentIdExists
    3. Émission par lots (batchMintCertificates & mintBatch)
      ✔ doit émettre un lot de plusieurs certificats avec succès
      ✔ doit fonctionner via l'alias de compatibilité mintBatch
      ✔ doit rejeter un lot vide
      ✔ doit rejeter un lot dépassant MAX_BATCH (10)
      ✔ doit rejeter si les tableaux ont des longueurs différentes
    4. Contrôle d'accès (MINTER_ROLE & DEFAULT_ADMIN_ROLE)
      ✔ doit empêcher un compte sans MINTER_ROLE d'émettre (mintCertificate)
      ✔ doit empêcher un compte sans MINTER_ROLE d'émettre par lot (batchMintCertificates)
      ✔ doit empêcher un compte possédant uniquement MINTER_ROLE de révoquer un certificat
      ✔ doit permettre à l'administrateur d'accorder et de retirer MINTER_ROLE
    5. Validation des entrées & Intégrité des données
      ✔ doit bloquer l'émission si l'adresse destinataire est nulle (address(0))
      ✔ doit bloquer les doublons de CNE (anti-doublon CNE)
      ✔ doit bloquer les champs obligatoires vides
      ✔ doit rejeter getCertificate pour un tokenId inexistant
    6. Révocation administrative (revokeCertificate)
      ✔ doit permettre à l'administrateur de révoquer un certificat
      ✔ doit rejeter la révocation d'un certificat déjà révoqué
      ✔ doit rejeter la révocation d'un certificat inexistant
    7. Test de non-réentrance (ReentrancyGuard)
      ✔ doit bloquer toute tentative de réentrance malveillante dans mintCertificate via callback ERC-721

  23 passing (1s)
```

**Couverture :** 100% des exigences fonctionnelles et d'audit satisfaites.

---

## 5. Limites Identifiées & Recommandations d'Amélioration

Bien que le contrat réponde à l'ensemble des standards requis pour le Devoir 2, les améliorations suivantes sont recommandées pour un déploiement institutionnel en production :

1. **Soulbound Tokens (SBT / EIP-5484) :**
   - *Constat :* Dans le standard ERC-721 standard, un étudiant peut transférer son diplôme NFT à une autre adresse via `transferFrom`.
   - *Recommandation :* Surcharger `_update` pour bloquer tout transfert une fois le jeton émis (`require(from == address(0), "Diplome non transferable")`), transformant le certificat en jeton d'âme (Soulbound).

2. **Épinglage Décentralisé Automatisé (IPFS) :**
   - *Constat :* Les métadonnées pointent vers des URIs IPFS formatées (`ipfs://...`).
   - *Recommandation :* Connecter le frontend à une passerelle d'épinglage automatisée (ex. Pinata, Web3.Storage ou Fleek) pour téléverser le JSON et le PDF du diplôme directement depuis le navigateur.

3. **Gouvernance Multi-Signature (Safe / Timelock) :**
   - *Constat :* Le rôle `DEFAULT_ADMIN_ROLE` est détenu par un seul compte lors du déploiement.
   - *Recommandation :* Transférer la propriété du rôle d'administration à un contrat MultiSig (Safe) nécessitant la validation conjointe de plusieurs membres de la direction académique.

---

## 6. Conclusion de l'Audit

Le contrat `CertificateRegistry` démontre un niveau de sécurité robuste. L'implémentation conjointe d'**OpenZeppelin v5**, du contrôle d'accès granulaire **AccessControl**, de la protection contre les réentrances **ReentrancyGuard** et des validations d'entrées strictes garantit l'intégrité, l'immuabilité et la traçabilité des certifications académiques.
