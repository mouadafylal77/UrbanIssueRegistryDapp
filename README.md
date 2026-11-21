# UrbanIssueRegistry — Smart City & Blockchain

Plateforme décentralisée (DApp) de gestion des services et incidents urbains basée sur la blockchain Ethereum. Elle permet aux citoyens de signaler des anomalies dans l'espace public et aux services municipaux d'assurer leur prise en charge, leur affectation technique et le suivi traçable et immuable de chaque intervention.

- **Smart Contract :** Solidity `^0.8.24` (Target EVM : `cancun`), OpenZeppelin Contracts v5 (`AccessControl`).
- **Développement & Tests :** Hardhat.
- **Frontend :** React 18, Vite, Ethers.js v6, SheetJS (`xlsx`).
- **Portefeuille :** MetaMask (EIP-1193).
- **Réseaux supportés :** Hardhat Local (Chain ID `31337`) & Ethereum Sepolia Testnet (Chain ID `11155111`).

---

## Architecture & Fonctionnalités

### 1. Cycle de vie des signalements urbains
Chaque signalement suit un cycle de vie séquentiel et contrôlé on-chain :

$$\text{Reported} \xrightarrow{\text{assignTeam}} \text{Assigned} \xrightarrow{\text{updateStatus}} \text{InProgress} \xrightarrow{\text{updateStatus}} \text{Resolved} \xrightarrow{\text{updateStatus}} \text{Closed}$$

1. **Reported (0) :** Signalement créé par le citoyen dans l'espace public (équipe non affectée).
2. **Assigned (1) :** Équipe technique d'intervention affectée par les services municipaux (`MUNICIPALITY_ROLE`).
3. **InProgress (2) :** Équipe sur place, travaux ou réparations en cours.
4. **Resolved (3) :** Problème résolu sur le terrain par l'équipe d'intervention.
5. **Closed (4) :** Dossier vérifié, validé et clôturé par la municipalité (statut final immuable).

### 2. Contrôle d'Accès par Rôles (OpenZeppelin AccessControl)
- **`DEFAULT_ADMIN_ROLE` :** Gestion et attribution des rôles administratifs et municipaux.
- **`MUNICIPALITY_ROLE` :** Réservé aux agents municipaux pour affecter les équipes techniques (`assignTeam`) et valider l'avancement du statut (`updateStatus`).
- **Accès Public (Citoyens) :** Création de signalement (`createIssue`), consultation publique (`getIssue`, `getIssueHistory`, `getAllIssues`) et import par lot sans restriction de rôle.

### 3. Traçabilité On-chain & Historique d'Intervention
Pour chaque signalement, un historique chronologique complet est conservé dans le contrat :
- Horodatage (`timestamp`)
- Statut à ce stade (`status`)
- Équipe affectée (`assignedTeam`)
- Commentaire d'intervention obligatoire (`comment`)
- Adresse Ethereum de l'agent ayant opéré (`updatedBy`)

### 4. Import par Lot Excel / CSV (SheetJS)
- Parsing et validation côté client des 9 colonnes obligatoires : `issueId`, `issueType`, `location`, `description`, `reportDate`, `priority`, `reportedBy`, `assignedTo`, `status`.
- Détection automatique des champs manquants, des doublons dans le fichier et des identifiants déjà enregistrés sur la blockchain (`issueExists`).
- Sélection granulaire des lignes valides et enregistrement atomique en une transaction blockchain via `createIssuesBatch` ou `createIssuesBatchWithTeams`.

---

## Structure du Projet

```text
UrbanIssueRegistryDapp/
├── contracts/
│   ├── contracts/
│   │   └── UrbanIssueRegistry.sol      # Smart contract principal (AccessControl)
│   ├── scripts/
│   │   └── deploy.js                   # Script de déploiement et export ABI/adresse vers frontend
│   ├── test/
│   │   └── UrbanIssueRegistry.test.js  # 33 tests automatisés (couverture complète)
│   ├── hardhat.config.js               # Configuration Hardhat (Solidity 0.8.24 cancun)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CitizenSpace.jsx        # Espace citoyen (déclaration & recherche publique)
│   │   │   ├── MunicipalitySpace.jsx   # Espace municipal (dashboard, filtres, affectation, cycle de vie)
│   │   │   ├── BatchImport.jsx         # Import Excel/CSV SheetJS avec prévisualisation
│   │   │   ├── IssueCard.jsx           # Carte d'affichage d'un signalement
│   │   │   └── IssueTimeline.jsx       # Timeline visuelle de traçabilité
│   │   ├── contracts/
│   │   │   └── UrbanIssueRegistry.json # ABI et adresse déployée générées automatiquement
│   │   ├── lib/
│   │   │   └── chain.js                # Configuration Ethers.js v6, rôles, formats, gestion d'erreurs
│   │   ├── App.jsx                     # Composant racine avec gestion MetaMask
│   │   └── styles.css                  # Thème Smart City moderne et responsive
│   ├── package.json
│   └── vite.config.js
├── urban_issues.xlsx                   # Fichier Excel de test conforme au cahier des charges
├── Mini projet - Urbanisation.pdf      # Cahier des charges du projet
└── README.md
```

---

## Installation & Prérequis

### Prérequis
- [Node.js](https://nodejs.org/) v18 ou plus récent.
- Extension de navigateur [MetaMask](https://metamask.io/).

### Installation des dépendances
```bash
# Installation des dépendances du Smart Contract
cd contracts && npm install

# Installation des dépendances du Frontend (dont xlsx)
cd ../frontend && npm install
```

---

## Tests Automatisés (Hardhat)

Exécutez la suite complète de **33 tests unitaires et d'intégration** :

```bash
cd contracts
npx hardhat test
```

### Couverture des tests :
- **Initialisation & Rôles :** Attribution des rôles `DEFAULT_ADMIN_ROLE` et `MUNICIPALITY_ROLE` au déployeur, gestion des privilèges par l'administrateur, interdiction aux comptes non autorisés.
- **Création unitaire (`createIssue`) :** Enregistrement par un citoyen, validation des champs obligatoires (`issueId`, `issueType`, `location`), rejet des doublons, émission de l'événement `IssueCreated`.
- **Enregistrement par lot (`createIssuesBatch`) :** Import atomique de plusieurs signalements, rejet de lot vide, rejet de tableaux de tailles inégales, rejet si doublon on-chain ou doublon au sein du même lot.
- **Affectation technique (`assignTeam`) :** Réservée à `MUNICIPALITY_ROLE`, passage automatique au statut `Assigned`, enregistrement dans l'historique, interdiction si le statut est déjà en cours ou résolu.
- **Transitions de statut (`updateStatus`) :** Vérification stricte du cycle séquentiel (`Reported -> Assigned -> InProgress -> Resolved -> Closed`), rejet des sauts d'états, rejet des retours en arrière, rejet des modifications après clôture.
- **Consultation & Historique :** `getIssue`, `getIssueHistory`, `getAllIssueIds`, `getAllIssues`.

---

## Démarrage en Environnement Local (3 Étapes)

### Étape 1 : Lancer le nœud blockchain local
```bash
cd contracts
npx hardhat node
```
*Le nœud démarre sur `http://127.0.0.1:8545` avec le Chain ID `31337` et génère 20 comptes pré-financés.*

### Étape 2 : Déployer le Smart Contract
Dans un second terminal :
```bash
cd contracts
npm run deploy:local
```
*Le contrat `UrbanIssueRegistry` est compilé et déployé. L'adresse et l'ABI sont automatiquement synchronisées dans `frontend/src/contracts/UrbanIssueRegistry.json`.*

### Étape 3 : Lancer l'Application Frontend
Dans un troisième terminal :
```bash
cd frontend
npm run dev
```
Ouvrez votre navigateur à l'adresse indiquée : **`http://localhost:5173`**.

---

## Déploiement sur Ethereum Sepolia Testnet (Optionnel)

1. Renseignez vos identifiants dans `contracts/.env` (à partir de `.env.example`) :
```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/VOTRE_CLE_API
PRIVATE_KEY=0xVOTRE_CLE_PRIVEE_METAMASK
ETHERSCAN_API_KEY=VOTRE_CLE_ETHERSCAN
```

2. Déployez sur Sepolia :
```bash
cd contracts
npx hardhat run scripts/deploy.js --network sepolia
```

L'application frontend basculera automatiquement sur Sepolia grâce au fichier de configuration généré.

---

## 📖 Guide d'Utilisation de la DApp

### 1.  Espace Citoyen
- **Déclarer un problème :** Remplissez le formulaire avec le type d'incident (éclairage public, voirie, fuite d'eau, déchets, etc.), la localisation précise, la description et la priorité. Cliquez sur «  Générer » pour obtenir un identifiant unique (ex: `CITY-2026-101`) ou saisissez le vôtre.
- **Consultation publique :** Entrez un identifiant (`issueId`) pour vérifier l'authenticité et l'avancement des réparations sans nécessiter de connexion préalable.
- **Signalements récents :** Parcourez la liste des incidents publics signalés dans la ville.

### 2. Espace Municipalité (Agents municipaux)
- Connectez MetaMask avec une adresse détenant le rôle `MUNICIPALITY_ROLE` (le déployeur local possède ce rôle par défaut).
- **Tableau de bord :** Visualisez les indicateurs clés par statut.
- **Filtres avancés :** Filtrez la liste par statut, niveau de priorité ou mot-clé textuel.
- **Affectation technique :** Sélectionnez un signalement et affectez-lui une équipe d'intervention avec commentaire obligatoire.
- **Avancement du cycle de vie :** Faites progresser l'incident étape par étape jusqu'à sa clôture.
- **Administration :** Pour l'administrateur (`DEFAULT_ADMIN_ROLE`), un volet permet d'habiliter de nouveaux agents municipaux.

### 3. Import Excel / CSV
- Cliquez sur l'onglet **Import Excel / CSV**.
- Déposez un fichier `.xlsx` (comme `urban_issues.xlsx` fourni à la racine) ou téléchargez le modèle via le bouton dédié.
- L'application vérifie la conformité des 9 colonnes et valide chaque ligne contre la blockchain.
- Cochez les lignes souhaitées et cliquez sur **« Enregistrer la sélection sur blockchain »** pour soumettre le lot en une seule transaction.

---

## Données de Test (`urban_issues.xlsx`)

Un jeu de données de test prêt à l'emploi est disponible à la racine du projet (`urban_issues.xlsx`). Il contient 5 signalements urbains fictifs et réalistes :
- `CITY-2026-001` : Panne d'éclairage public sur l'Avenue Mohammed V (Priorité Haute).
- `CITY-2026-002` : Nid-de-poule dangereux sur le Boulevard Zerktouni (Priorité Critique).
- `CITY-2026-003` : Fuite d'eau potable sur la chaussée Rue Ibn Battouta (Priorité Haute).
- `CITY-2026-004` : Conteneur de déchets débordant Place des Nations (Priorité Moyenne).
- `CITY-2026-005` : Panneau stop masqué et endommagé Avenue Hassan II (Priorité Basse).
