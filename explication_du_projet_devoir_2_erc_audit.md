# 📘 Notes de Synthèse : Projet de Diplômes Décentralisés (Devoir 2)

---

## 1. Objectif Général du Projet

L'objectif de ce projet est de faire évoluer le registre de diplômes maison (Devoir 1) vers une application **professionnelle, standardisée et hautement sécurisée** pour la production.

Il s'agit de permettre à une université de **créer, distribuer, vérifier et révoquer** des diplômes numériques sans qu'aucun tricheur ni attaquant ne puisse compromettre le système.

---

## 2. Les 4 Actions Principales du Système

Le système doit gérer quatre fonctionnalités clés :

1. **Créer un diplôme unique (`mintCertificate`)** : Émettre un certificat numérique infalsifiable et l'envoyer directement dans le portefeuille numérique (wallet) d'un étudiant.
2. **Créer en lot (`batchMintCertificates`)** : Générer en une seule transaction l'ensemble des diplômes d'une promotion (ex: 50 ou 100 étudiants d'un coup).
3. **Annuler / Révoquer (`revokeCertificate`)** : Marquer un diplôme comme "révoqué" en cas de fraude ou d'erreur administrative, sans altérer l'historique de la blockchain.
4. **Vérifier / Consulter (`getCertificate`)** : Offrir une consultation publique pour qu'un recruteur ou un étudiant puisse vérifier l'authenticité d'un diplôme et s'assurer qu'il n'a pas été annulé.

---

## 3. Les Concepts Techniques Expliqués Simplement

### A. La Standardisation et l'ERC-721 (NFT)
* **Analogie :** L'ERC-721 est l'équivalent du **câble USB-C** ou du **passeport biométrique** pour la blockchain.
* **Le problème avant :** Le Devoir 1 utilisait un format sur mesure. Seul notre site comprenait le code, alors que MetaMask ou des plateformes externes ne savaient pas lire ces données.
* **La solution :** L'**ERC-721** est la norme officielle sur Ethereum pour créer des objets numériques uniques (des **NFT**). En l'adoptant :
  * Le diplôme devient un NFT avec un numéro de série universel (`tokenId = 1, 2, 3...`).
  * L'étudiant peut voir son diplôme apparaître automatiquement dans l'onglet **NFT** de son portefeuille MetaMask.

### B. Le Format des Métadonnées & le `tokenURI`
* **Le problème :** Stocker le texte complet d'un diplôme, des images ou un PDF directement sur la blockchain coûte extrêmement cher en frais de *gas*.
* **La solution :**
  1. Le fichier détaillé du diplôme (nom, filière, mention, image) est hébergé sur un stockage décentralisé externe appelé **IPFS**.
  2. Sur la blockchain, le contrat enregistre uniquement un lien vers ce fichier, appelé **`tokenURI`**.
* **Le standard JSON :** Pour que MetaMask affiche correctement l'image et le texte, le fichier externe suit une structure universelle JSON :
  ```json
  {
    "name": "Master Ingénierie Web - Étudiant",
    "description": "Diplôme officiel émis par l'Université",
    "image": "ipfs://Qm...",
    "attributes": [
      { "trait_type": "Mention", "value": "Très Bien" }
    ]
  }
  ```

### C. La Séparation des Rôles (`AccessControl`)
* **Principe cyber (Moindre privilège) :** Ne jamais donner tous les pouvoirs à un seul compte. Si ce compte est compromis, tout le système est perdu.
* **Mise en œuvre :**
  * **Badge `MINTER_ROLE` (La Scolarité) :** Peut uniquement fabriquer et distribuer des diplômes (`mintCertificate` et `batchMintCertificates`).
  * **Badge `DEFAULT_ADMIN_ROLE` (Le Doyen) :** Seul autorisé à annuler un diplôme (`revokeCertificate`) et à attribuer ou retirer les rôles aux utilisateurs.

### D. La Démarche d'Audit & Sécurité
Avant de déployer le contrat, on joue le rôle de l'auditeur / hacker pour vérifier la présence de verrous de sécurité :
* **Contrôle d'accès :** Vérifier qu'un utilisateur classique ou un étudiant ne peut pas créer son propre diplôme.
* **Non-duplication :** Bloquer la création de deux diplômes pour un même numéro d'étudiant (`studentId`).
* **Validation des entrées :** Interdire l'envoi vers des adresses nulles (`address(0)`).
* **Anti-Réentrance (Reentrancy) :** Empêcher un contrat malveillant de rappeler en boucle la fonction d'émission avant que la première exécution soit terminée.

---

## 4. Composants et Livrables du Projet

```
┌────────────────────────────────────────────────────────┐
│                   DÉPÔT DU PROJET                      │
├────────────────────────────────────────────────────────┤
│ 1. Smart Contract (Solidity)                           │
│    ├─ Hérite d'ERC721URIStorage & AccessControl         │
│    └─ Intègre les 4 fonctions + verrous de sécurité    │
│                                                        │
│ 2. Tests de Sécurité (Hardhat / JavaScript)            │
│    └─ Valide les cas nominaux et bloque les attaques   │
│                                                        │
│ 3. Frontend Mis à Jour (React)                         │
│    ├─ Affiche le tokenId et le lien tokenURI           │
│    └─ Gère proprement les erreurs de rôle (droits)     │
│                                                        │
│ 4. Rapport d'Audit Simplifié (1 à 2 pages)            │
│    └─ Analyse des risques, checklist et résultats      │
└────────────────────────────────────────────────────────┘
```