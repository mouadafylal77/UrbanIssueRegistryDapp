# Registre des diplômes — dApp de certification sur blockchain (Devoir 2)

Application décentralisée (dApp) complète de certification et de vérification de diplômes académiques sous forme de tokens **ERC-721 (NFT)** avec métadonnées décentralisées (**URIStorage**), contrôle d'accès par rôles (**AccessControl**) et sécurité anti-réentrance (**ReentrancyGuard**).

- **Smart Contract :** Solidity `^0.8.24` (Target EVM : `cancun`), OpenZeppelin v5, Hardhat.
- **Frontend :** React + Vite + Ethers.js v6.
- **Réseaux supportés :** Hardhat Local (Chain ID 31337) et Ethereum Sepolia Testnet (Chain ID 11155111).
- **Audit de sécurité :** Consultez le rapport complet dans [AUDIT_REPORT.md](file:///home/mouad/Downloads/diploma-dapp/AUDIT_REPORT.md).

---

## 🌟 Nouveautés du Devoir 2

1. **Standard ERC-721 + URIStorage :** Chaque diplôme émis est un véritable NFT unique transféré au portefeuille de l'étudiant, avec métadonnées décentralisées (`tokenURI`).
2. **Contrôle d'Accès Granulaire (AccessControl) :** Remplacement de `Ownable` par une séparation des privilèges :
   - `MINTER_ROLE` : Émission unitaire et groupée de certificats (réservé au service de scolarité).
   - `DEFAULT_ADMIN_ROLE` : Révocation administrative de certificats et gestion (attribution/révocation) des rôles.
3. **Sécurité Anti-Réentrance (ReentrancyGuard) :** Protection des fonctions mutables contre les attaques de réentrance lors du hook `_safeMint` et validation de non-réentrance par contrat attaquant mock.
4. **Validation stricte & Anti-doublons CNE :** Unicité absolue du CNE (`studentIdExists`), vérification des adresses destinataires non nulles et champs obligatoires.
5. **Support Sepolia optionnel :** Configuration prête pour déploiement sur le testnet Ethereum Sepolia via `.env`.
6. **Interface d'administration enrichie :** Affichage en temps réel des rôles du compte connecté, gestionnaire d'attribution du `MINTER_ROLE`, support de `tokenId` et `tokenURI`.

---

## Prérequis

- Node.js 18 ou plus récent.
- Extension navigateur MetaMask (uniquement nécessaire pour les opérations d'administration et d'émission).

---

## Installation (une seule fois)

```bash
cd contracts && npm install
cd ../frontend && npm install
```

---

## Tests Unitaires & d'Audit (Hardhat)

Pour exécuter la suite complète de 23 tests automatisés (contrôle d'accès, réentrance, anti-doublon CNE, etc.) :

```bash
cd contracts
npx hardhat test
```

Tous les tests doivent passer avec succès :
```
  23 passing (1s)
```

---

## Démarrage en local (3 commandes)

### Terminal 1 : Nœud blockchain local

```bash
cd contracts
npx hardhat node
```

### Terminal 2 : Déploiement du contrat

Compile le smart contract, le déploie sur le nœud local et synchronise l'adresse et l'ABI dans le frontend :

```bash
cd contracts
npm run deploy:local
```

### Terminal 3 : Application Web (Frontend React)

```bash
cd frontend
npm run dev
```

Ouvrez l'application dans votre navigateur : **http://localhost:5173**.

---

## Configuration Réseau Sepolia (Optionnel)

Pour déployer sur le testnet Sepolia :

1. Créez un fichier `.env` dans le dossier `contracts/` (basé sur `contracts/.env.example`) :
```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/VOTRE_CLE_API
PRIVATE_KEY=0xVOTRE_CLE_PRIVEE
ETHERSCAN_API_KEY=VOTRE_CLE_ETHERSCAN
```
2. Déployez avec la commande :
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

---

## Guide d'Utilisation

### 1. Vérification publique (Page d'accueil)
- Aucun portefeuille ni connexion MetaMask n'est requise.
- Saisissez le numéro de **Token ID** (ex : `1`, `2`, `3`) pour vérifier instantanément l'authenticité d'un diplôme, son titulaire, sa mention et son statut (Valide ou Révoqué).
- Cliquez directement sur les derniers certificats émis pour afficher leur vue détaillée.

### 2. Administration & Émission (MetaMask requis)
- Connectez MetaMask avec le compte déployeur (#0 de Hardhat) sur le réseau **Hardhat Local** (31337).
- **Émission unitaire :** Renseignez les informations de l'étudiant, son adresse de réception Ethereum (obligatoire pour ERC-721) et son URI de métadonnées.
- **Import Excel / CSV :** Glissez-déposez le fichier de test `frontend/etudiants_test.csv`. Les diplômes sont vérifiés puis émis par lots de 10 maximum.
- **Gestion & Révocation :** Visualisez les certificats émis avec leur `tokenURI`. Seul un compte `DEFAULT_ADMIN_ROLE` peut révoquer définitivement un diplôme.
- **Gestion des Rôles :** L'administrateur peut accorder ou retirer le rôle `MINTER_ROLE` à n'importe quelle adresse Ethereum directement depuis l'interface.

---

## Résolution des Problèmes Fréquents

### Erreur « Nonce too high » ou « could not coalesce »
Si vous redémarrez `npx hardhat node`, le compteur de transactions d'Hardhat repart à zéro tandis que MetaMask a conservé l'historique :
1. Dans MetaMask : **Paramètres** > **Avancé** > **« Effacer les données de l'onglet d'activité »** (ou « Réinitialiser le compte »).
2. Relancez `npm run deploy:local` dans le dossier `contracts/`.
3. Rafraîchissez la page web.

---

## Structure du Projet

```
diploma-dapp/
├── AUDIT_REPORT.md                  # Rapport d'audit de sécurité complet (Devoir 2)
├── README.md                        # Documentation générale et guide d'installation
├── contracts/                       # Smart contracts et tests Hardhat
│   ├── contracts/
│   │   ├── CertificateRegistry.sol  # Contrat ERC-721 + AccessControl + ReentrancyGuard
│   │   └── mocks/
│   │       └── ReentrancyAttacker.sol # Contrat mock pour test de non-réentrance
│   ├── test/
│   │   └── CertificateRegistry.test.js # Suite de 23 tests automatisés
│   ├── scripts/
│   │   └── deploy.js                # Script de déploiement et synchronisation ABI
│   ├── hardhat.config.js            # Configuration EVM cancun et Sepolia
│   └── .env.example                 # Modèle de configuration d'environnement
└── frontend/                        # Application React Vite
    ├── src/
    │   ├── components/
    │   │   ├── Admin.jsx            # Espace admin et gestion des rôles
    │   │   ├── MintSingle.jsx       # Émission unitaire NFT
    │   │   ├── BatchImport.jsx      # Import CSV/Excel et minage groupé
    │   │   ├── ManageCerts.jsx      # Tableau de bord et révocation
    │   │   ├── PublicVerify.jsx     # Consultation publique sans wallet
    │   │   └── CertificateCard.jsx  # Affichage du diplôme, tokenId et tokenURI
    │   ├── contracts/
    │   │   └── CertificateRegistry.json # Adresse et ABI synchronisées
    │   └── lib/
    │       └── chain.js             # Configuration ethers.js v6 et gestion d'erreurs
    └── etudiants_test.csv           # Données de test pour l'import groupé
```
