# Fiche de Synthèse Technique - Certification de Diplômes par Blockchain (ERC-721)

## 1. Contexte et Objectif Général du Projet

- **Problématique :** La falsification des diplômes et la lourdeur des démarches de vérification manuelle auprès des universités par les recruteurs.
- **Solution apportée :** Déploiement d'un système décentralisé d'émission et d'authentification de diplômes académiques sous forme de jetons non fongibles (NFT) inscrits de manière immuable sur la blockchain Ethereum (réseau de test Sepolia).
- **Valeur ajoutée principale :** Authentification instantanée, transparence publique, suppression des intermédiaires et garantie de propriété infalsifiable pour l'étudiant.

---

## 2. Comparatif : Projet Initial (Localhost) vs Projet Actuel (Sepolia / Production Web3)

| Critère | Version Initiale (Localhost) | Version Actuelle (Sepolia Testnet) |
| --- | --- | --- |
| **Environnement réseau** | Blockchain locale temporaire (`npx hardhat node`). Données perdues au redémarrage. | Réseau de test public Ethereum Sepolia. Données immuables et accessibles mondialement. |
| **Standard de Contrat** | Registre personnalisé basique (simple mapping de structures de données). | Standard officiel OpenZeppelin ERC-721 (NFT). |
| **Gestion des Droits** | Contrôle basique avec un propriétaire unique (`onlyOwner`). | Contrôle d'accès granulaire multi-rôles (`AccessControl`). |
| **Interaction Wallet** | Simulée localement ou restreinte au compte administrateur. | Interaction temps réel multi-comptes avec MetaMask et détection dynamique des changements de wallet. |
| **Visualisation Étudiant** | Interrogation purement textuelle sur l'interface web. | Visualisation du diplôme sous forme de jeton NFT directement dans l'onglet NFTs de MetaMask. |
| **Émission de masse** | Émission uniquement unitaire, transaction par transaction. | Module d'émission par lot (Import CSV/Excel) gérant le minting groupé. |

---

## 3. Normes ERC et Définitions Techniques Clés

- **Norme ERC-721 (Non-Fungible Token) :** Standard Ethereum pour l'émission de jetons uniques et non interchangeables. Contrairement aux jetons ERC-20 (qui sont divisibles et identiques, comme l'ETH), chaque diplôme ERC-721 possède un identifiant unique (`tokenId`) rattaché à des métadonnées précises (Nom, CNE, Intitulé du diplôme).
- **Soulbound Token (SBT) / Non-transférabilité :** Adaptation du standard ERC-721 où la possibilité de transférer le jeton (`transferFrom`, `safeTransferFrom`) est volontairement bloquée au niveau du Smart Contract. L'étudiant possède le diplôme dans son portefeuille mais ne peut ni le vendre ni le céder à un tiers.
- **AccessControl (OpenZeppelin) :** Module de sécurité permettant d'attribuer des rôles sous forme de clés cryptographiques (`bytes32`). Il remplace le modèle simpliste `onlyOwner` par une hiérarchie de privilèges (`DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`).
- **Minting (Émission) :** Action d'exécuter la fonction du Smart Contract qui crée un nouveau jeton sur la blockchain et l'assigne à l'adresse publique du destinataire.
- **Gas Fee (Frais de réseau) :** Unité de mesure du coût computationnel nécessaire pour exécuter une transaction ou modifier l'état du contrat sur Ethereum (payé en SepoliaETH dans le cadre des tests).
- **Stockage On-Chain vs Off-Chain :**
  - *On-Chain :* Stockage direct des données critiques (Nom, CNE, Date, Statut) dans la mémoire d'état du Smart Contract pour garantir la sécurité et la pérennité sans dépendre d'un serveur externe.
  - *Off-Chain :* Stockage des ressources lourdes (images, fichiers PDF) en dehors de la blockchain (ex: IPFS) pour éviter des coûts de gas prohibitifs.

---

## 4. Architecture de Sécurité et Gestion des Rôles

Le système repose sur une séparation stricte des responsabilités au sein du Smart Contract :

- **Le Doyen (`DEFAULT_ADMIN_ROLE`) :**
  - **Identifiant rôle :** `0x0000000000000000000000000000000000000000000000000000000000000000`
  - **Adresse :** `0x5EaA3...45b24`
  - **Pouvoirs :** Administration globale du contrat, octroi (`grantRole`) ou révocation (`revokeRole`) du rôle d'émission aux agents de la scolarité.
  - **Remarque :** Lors du déploiement du contrat, l'adresse du déployeur reçoit automatiquement ce rôle ainsi que le `MINTER_ROLE`.

- **La Scolarité (`MINTER_ROLE`) :**
  - **Identifiant rôle :** Hash keccak256 de `"MINTER_ROLE"`
  - **Adresse assignée :** `0xb49E34fDe3211919A3e222d06EACd07D18A2a063`
  - **Pouvoirs :** Émission de diplômes unitaires, import par lot (Excel/CSV), révocation administrative de diplômes en cas d'erreur.
  - **Restrictions :** Impossible de modifier la structure des rôles d'administration.

- **Le Compte Public / Étudiant (Sans rôle d'administration) :**
  - **Pouvoirs :** Consultation libre via l'onglet de vérification publique, réception et conservation du diplôme sous forme de NFT dans le portefeuille MetaMask.
  - **Restrictions :** Bloqué par le Smart Contract (`onlyRole`) et par l'interface web (boutons désactivés et message d'erreur d'accès).

---

## 5. Difficultés Rencontrées, Analyses et Solutions Validées

### Difficulté 1 : Erreur de synchronisation des transactions / Nonce dans MetaMask
- **Analyse du problème :** Lors des basculements entre l'environnement de dev local (`Hardhat`) et le réseau Sepolia, la file d'attente des transactions créait des erreurs de blocage.
- **Test d'une solution non concluante :** L'option de réinitialisation des données d'activité de MetaMask (*Clean Activity / Effacer les données d'activité*) a été testée mais **N'A PAS FONCTIONNÉ** pour résoudre le problème.
- **Solution réellement appliquée et validée :** Migration définitive vers le réseau de test officiel Sepolia avec un déploiement propre du Smart Contract (`0x01827B606C5e7f69571E32134A3Cb65efbF624e1`), alimentation des comptes via un Faucet SepoliaETH dédié, et gestion directe de l'état du réseau via l'interface MetaMask.

### Difficulté 2 : Détection en direct du changement de compte sur l'application Web
- **Analyse du problème :** L'interface réactive React continuait d'afficher les privilèges de l'ancien compte même après un changement de compte dans l'extension MetaMask.
- **Solution appliquée et validée :** Intégration de l'écouteur d'événements `window.ethereum.on('accountsChanged')` couplé à un appel direct de la fonction `hasRole()` du Smart Contract. Cela force l'interface à mettre à jour les droits d'accès instantanément sans rechargement manuel de la page.

### Difficulté 3 : Transmission et affichage du diplôme côté Étudiant
- **Analyse du problème :** Confirmer que l'étudiant détient réellement la preuve cryptographique de son diplôme sur son propre portefeuille.
- **Solution appliquée et validée :** Utilisation de la fonction `_safeMint(studentAddress, tokenId)` lors de l'émission. Importation validée du contrat sur MetaMask dans l'onglet **NFTs** avec l'adresse du contrat et le `tokenId` 1. Le jeton s'affiche correctement sur l'adresse de destination.

---

## 6. Environnement Technique et Commandes Utiles

### Commandes Linux / Shell
- `cd /chemin/vers/projet` -> Accéder au répertoire du projet.
- `ls -la` -> Vérifier l'arborescence et les fichiers de configuration cachés (`.env`).
- `grep -rn "MINTER_ROLE" src/` -> Rechercher l'utilisation des constantes de rôles dans le code source React.

### Commandes Node / Hardhat
- `npx hardhat compile` -> Compilation des contrats Solidity (`CertificateRegistry.sol`).
- `npx hardhat run scripts/deploy.js --network sepolia` -> Déploiement du contrat sur le réseau Sepolia.
- `npm run dev` -> Lancement du serveur de développement frontend.

---

## 7. Données Réseau et Scénario de Démonstration en Live

- **Réseau Blockchain :** Ethereum Sepolia Testnet
- **Adresse du Smart Contract :** `0x01827B606C5e7f69571E32134A3Cb65efbF624e1`
- **Exemple de Diplôme Validé :**
  - `tokenId` : 1
  - CNE : `E123456789`
  - Titulaire : AFYLAL Moad
  - Adresse destinataire : `0x5EaA3...45b24` (ou adresse étudiant dédiée)

### Déroulé exact de la démo devant le jury :
1. **Étape 1 : Vérification publique (Mode déconnecté ou Compte Public)**
   - Recherche du diplôme `#1` pour prouver que le contrôle d'authenticité est accessible à tout recruteur sans authentification.
2. **Étape 2 : Démonstration du contrôle d'accès (`AccessControl`)**
   - Connexion avec un compte non autorisé (`0xb49E34...`) : Affichage du message de blocage "Non autorisé".
   - Connexion avec le compte Doyen (`0x5EaA3...`) : Accès au sous-onglet "Gestion des rôles" et exécution de `grantRole` pour accorder `MINTER_ROLE` au compte Scolarité.
   - Re-connexion avec le compte Scolarité : Constat en direct du déblocage des formulaires d'émission.
3. **Étape 3 : Émission et confirmation Wallet**
   - Émission d'un nouveau diplôme vers une adresse étudiant.
   - Ouverture de MetaMask sur le compte de l'étudiant sous l'onglet NFTs pour montrer la réception effective du diplôme.