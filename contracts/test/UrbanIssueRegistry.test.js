const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("UrbanIssueRegistry (AccessControl + Smart City Lifecycle)", function () {
  let UrbanIssueRegistry;
  let registry;
  let admin, municipalAgent, citizen1, citizen2, unauthorizedUser;
  let DEFAULT_ADMIN_ROLE, MUNICIPALITY_ROLE;

  // Enum Status matching contract
  const Status = {
    Reported: 0n,
    Assigned: 1n,
    InProgress: 2n,
    Resolved: 3n,
    Closed: 4n,
  };

  beforeEach(async function () {
    [admin, municipalAgent, citizen1, citizen2, unauthorizedUser] = await ethers.getSigners();

    UrbanIssueRegistry = await ethers.getContractFactory("UrbanIssueRegistry");
    registry = await UrbanIssueRegistry.deploy();
    await registry.waitForDeployment();

    DEFAULT_ADMIN_ROLE = await registry.DEFAULT_ADMIN_ROLE();
    MUNICIPALITY_ROLE = await registry.MUNICIPALITY_ROLE();

    // Attribuer MUNICIPALITY_ROLE à municipalAgent pour les tests
    await registry.connect(admin).grantRole(MUNICIPALITY_ROLE, municipalAgent.address);
  });

  describe("1. Initialisation & Contrôle d'accès (AccessControl)", function () {
    it("doit attribuer DEFAULT_ADMIN_ROLE et MUNICIPALITY_ROLE au déployeur", async function () {
      expect(await registry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await registry.hasRole(MUNICIPALITY_ROLE, admin.address)).to.be.true;
    });

    it("doit confirmer que municipalAgent a MUNICIPALITY_ROLE et pas les citoyens", async function () {
      expect(await registry.hasRole(MUNICIPALITY_ROLE, municipalAgent.address)).to.be.true;
      expect(await registry.hasRole(MUNICIPALITY_ROLE, citizen1.address)).to.be.false;
      expect(await registry.hasRole(MUNICIPALITY_ROLE, unauthorizedUser.address)).to.be.false;
    });

    it("doit permettre à l'admin d'accorder et révoquer MUNICIPALITY_ROLE", async function () {
      await registry.connect(admin).grantRole(MUNICIPALITY_ROLE, citizen2.address);
      expect(await registry.hasRole(MUNICIPALITY_ROLE, citizen2.address)).to.be.true;

      await registry.connect(admin).revokeRole(MUNICIPALITY_ROLE, citizen2.address);
      expect(await registry.hasRole(MUNICIPALITY_ROLE, citizen2.address)).to.be.false;
    });

    it("doit interdire à un non-admin de gérer les rôles", async function () {
      await expect(
        registry.connect(citizen1).grantRole(MUNICIPALITY_ROLE, citizen2.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("doit initialiser le registre avec 0 signalement", async function () {
      expect(await registry.totalIssues()).to.equal(0n);
      const allIds = await registry.getAllIssueIds();
      expect(allIds.length).to.equal(0);
    });
  });

  describe("2. Création unitaire de signalements (createIssue)", function () {
    it("doit permettre à un citoyen de créer un signalement valide et émettre IssueCreated", async function () {
      const tx = await registry.connect(citizen1).createIssue(
        "CITY-2026-001",
        "StreetLight",
        "Avenue Mohammed V",
        "Streetlight not working",
        "2026-11-19",
        "High",
        "Citizen01"
      );

      await expect(tx)
        .to.emit(registry, "IssueCreated")
        .withArgs(
          "CITY-2026-001",
          "StreetLight",
          "Avenue Mohammed V",
          "High",
          "Citizen01",
          citizen1.address
        );

      expect(await registry.totalIssues()).to.equal(1n);
      expect(await registry.issueExists("CITY-2026-001")).to.be.true;

      const issue = await registry.getIssue("CITY-2026-001");
      expect(issue.issueId).to.equal("CITY-2026-001");
      expect(issue.issueType).to.equal("StreetLight");
      expect(issue.location).to.equal("Avenue Mohammed V");
      expect(issue.description).to.equal("Streetlight not working");
      expect(issue.reportDate).to.equal("2026-11-19");
      expect(issue.priority).to.equal("High");
      expect(issue.reportedBy).to.equal("Citizen01");
      expect(issue.assignedTo).to.equal("");
      expect(issue.status).to.equal(Status.Reported);
      expect(issue.exists).to.be.true;

      // Vérification de la première entrée d'historique
      const history = await registry.getIssueHistory("CITY-2026-001");
      expect(history.length).to.equal(1);
      expect(history[0].status).to.equal(Status.Reported);
      expect(history[0].assignedTeam).to.equal("");
      expect(history[0].comment).to.equal("Signalement cree");
      expect(history[0].updatedBy).to.equal(citizen1.address);
      expect(history[0].timestamp).to.be.gt(0n);
    });

    it("doit permettre de créer un signalement avec équipe directement (createIssueWithTeam)", async function () {
      const tx = await registry.connect(municipalAgent).createIssueWithTeam(
        "CITY-2026-002",
        "Pothole",
        "Boulevard Hassan II",
        "Nid de poule dangereux",
        "2026-11-20",
        "Critical",
        "Agent01",
        "Equipe Voirie"
      );

      await expect(tx)
        .to.emit(registry, "IssueCreated")
        .withArgs(
          "CITY-2026-002",
          "Pothole",
          "Boulevard Hassan II",
          "Critical",
          "Agent01",
          municipalAgent.address
        );

      await expect(tx)
        .to.emit(registry, "TeamAssigned")
        .withArgs(
          "CITY-2026-002",
          "Equipe Voirie",
          municipalAgent.address,
          "Affectation initiale"
        );

      const issue = await registry.getIssue("CITY-2026-002");
      expect(issue.assignedTo).to.equal("Equipe Voirie");
      expect(issue.status).to.equal(Status.Assigned);

      const history = await registry.getIssueHistory("CITY-2026-002");
      expect(history.length).to.equal(1);
      expect(history[0].status).to.equal(Status.Assigned);
      expect(history[0].assignedTeam).to.equal("Equipe Voirie");
    });

    it("doit rejeter si issueId est vide", async function () {
      await expect(
        registry.connect(citizen1).createIssue(
          "",
          "StreetLight",
          "Avenue Mohammed V",
          "Description",
          "2026-11-19",
          "Medium",
          "Citizen01"
        )
      ).to.be.revertedWith("Identifiant requis");
    });

    it("doit rejeter si issueType est vide", async function () {
      await expect(
        registry.connect(citizen1).createIssue(
          "CITY-2026-003",
          "",
          "Avenue Mohammed V",
          "Description",
          "2026-11-19",
          "Medium",
          "Citizen01"
        )
      ).to.be.revertedWith("Type de probleme requis");
    });

    it("doit rejeter si location est vide", async function () {
      await expect(
        registry.connect(citizen1).createIssue(
          "CITY-2026-004",
          "StreetLight",
          "",
          "Description",
          "2026-11-19",
          "Medium",
          "Citizen01"
        )
      ).to.be.revertedWith("Localisation requise");
    });

    it("doit rejeter un doublon de signalement avec le même issueId", async function () {
      await registry.connect(citizen1).createIssue(
        "CITY-DUP-001",
        "WaterLeak",
        "Rue Al Qods",
        "Fuite d'eau importante",
        "2026-11-19",
        "High",
        "Citizen01"
      );

      await expect(
        registry.connect(citizen2).createIssue(
          "CITY-DUP-001",
          "WaterLeak",
          "Rue Al Qods",
          "Autre description",
          "2026-11-19",
          "Low",
          "Citizen02"
        )
      ).to.be.revertedWith("Signalement deja existant");
    });
  });

  describe("3. Enregistrement par lots (createIssuesBatch & createIssuesBatchWithTeams)", function () {
    const ids = ["CITY-BATCH-001", "CITY-BATCH-002", "CITY-BATCH-003"];
    const types = ["StreetLight", "Pothole", "WaterLeak"];
    const locations = ["Avenue 1", "Avenue 2", "Avenue 3"];
    const descriptions = ["Panne eclairage", "Route endommagee", "Fuite eau"];
    const dates = ["2026-11-19", "2026-11-19", "2026-11-19"];
    const priorities = ["High", "Medium", "Critical"];
    const reporters = ["CitizenA", "CitizenB", "CitizenC"];
    const teams = ["Equipe Lumieres", "Equipe Voirie", "Equipe Eau"];

    it("doit importer plusieurs signalements en une seule transaction (createIssuesBatch)", async function () {
      const tx = await registry.connect(citizen1).createIssuesBatch(
        ids,
        types,
        locations,
        descriptions,
        dates,
        priorities,
        reporters
      );

      await expect(tx).to.emit(registry, "IssueCreated");

      expect(await registry.totalIssues()).to.equal(3n);

      for (let i = 0; i < ids.length; i++) {
        const issue = await registry.getIssue(ids[i]);
        expect(issue.issueId).to.equal(ids[i]);
        expect(issue.issueType).to.equal(types[i]);
        expect(issue.status).to.equal(Status.Reported);
        expect(issue.assignedTo).to.equal("");
      }
    });

    it("doit importer avec équipes affectées (createIssuesBatchWithTeams)", async function () {
      const batchIds = ["CITY-TEAM-001", "CITY-TEAM-002", "CITY-TEAM-003"];
      await registry.connect(municipalAgent).createIssuesBatchWithTeams(
        batchIds,
        types,
        locations,
        descriptions,
        dates,
        priorities,
        reporters,
        teams
      );

      for (let i = 0; i < batchIds.length; i++) {
        const issue = await registry.getIssue(batchIds[i]);
        expect(issue.issueId).to.equal(batchIds[i]);
        expect(issue.assignedTo).to.equal(teams[i]);
        expect(issue.status).to.equal(Status.Assigned);
      }
    });

    it("doit rejeter un lot vide", async function () {
      await expect(
        registry.connect(citizen1).createIssuesBatch([], [], [], [], [], [], [])
      ).to.be.revertedWith("Lot vide");
    });

    it("doit rejeter si les tableaux ont des longueurs différentes", async function () {
      await expect(
        registry.connect(citizen1).createIssuesBatch(
          ["CITY-ERR-001"],
          ["StreetLight", "Pothole"], // 2 éléments vs 1
          ["Avenue 1"],
          ["Description"],
          ["2026-11-19"],
          ["High"],
          ["Citizen"]
        )
      ).to.be.revertedWith("Tableaux de longueurs differentes");
    });

    it("doit rejeter le lot si un identifiant existe déjà on-chain", async function () {
      await registry.connect(citizen1).createIssue(
        "CITY-EXISTING",
        "StreetLight",
        "Avenue 1",
        "Desc",
        "2026-11-19",
        "High",
        "Citizen"
      );

      await expect(
        registry.connect(citizen1).createIssuesBatch(
          ["CITY-NEW-001", "CITY-EXISTING"],
          ["StreetLight", "Pothole"],
          ["Avenue A", "Avenue B"],
          ["Desc A", "Desc B"],
          ["2026-11-19", "2026-11-19"],
          ["High", "Low"],
          ["Citizen", "Citizen"]
        )
      ).to.be.revertedWith("Signalement deja existant");
    });

    it("doit rejeter le lot si un identifiant est dupliqué au sein du lot", async function () {
      await expect(
        registry.connect(citizen1).createIssuesBatch(
          ["CITY-DUP-BATCH", "CITY-DUP-BATCH"],
          ["StreetLight", "Pothole"],
          ["Avenue A", "Avenue B"],
          ["Desc A", "Desc B"],
          ["2026-11-19", "2026-11-19"],
          ["High", "Low"],
          ["Citizen", "Citizen"]
        )
      ).to.be.revertedWith("Signalement deja existant");
    });
  });

  describe("4. Affectation d'équipe (assignTeam) & Sécurité par rôle", function () {
    const issueId = "CITY-ASSIGN-001";

    beforeEach(async function () {
      await registry.connect(citizen1).createIssue(
        issueId,
        "StreetLight",
        "Avenue Mohammed V",
        "Panne de candélabre",
        "2026-11-19",
        "High",
        "Citizen01"
      );
    });

    it("doit permettre à un agent municipal d'affecter une équipe et mettre à jour le statut à Assigned", async function () {
      const tx = await registry.connect(municipalAgent).assignTeam(
        issueId,
        "Equipe Eclairage Urbain",
        "Intervention planifiée sous 24h"
      );

      await expect(tx)
        .to.emit(registry, "TeamAssigned")
        .withArgs(
          issueId,
          "Equipe Eclairage Urbain",
          municipalAgent.address,
          "Intervention planifiée sous 24h"
        );

      await expect(tx)
        .to.emit(registry, "StatusUpdated")
        .withArgs(
          issueId,
          Status.Reported,
          Status.Assigned,
          municipalAgent.address,
          "Intervention planifiée sous 24h"
        );

      const issue = await registry.getIssue(issueId);
      expect(issue.assignedTo).to.equal("Equipe Eclairage Urbain");
      expect(issue.status).to.equal(Status.Assigned);

      const history = await registry.getIssueHistory(issueId);
      expect(history.length).to.equal(2);
      expect(history[1].status).to.equal(Status.Assigned);
      expect(history[1].assignedTeam).to.equal("Equipe Eclairage Urbain");
      expect(history[1].comment).to.equal("Intervention planifiée sous 24h");
      expect(history[1].updatedBy).to.equal(municipalAgent.address);
    });

    it("doit permettre de réaffecter l'équipe tant que le statut est Assigned", async function () {
      await registry.connect(municipalAgent).assignTeam(issueId, "Equipe A", "Premier choix");
      await registry.connect(municipalAgent).assignTeam(issueId, "Equipe B", "Changement d'équipe");

      const issue = await registry.getIssue(issueId);
      expect(issue.assignedTo).to.equal("Equipe B");
      expect(issue.status).to.equal(Status.Assigned);

      const history = await registry.getIssueHistory(issueId);
      expect(history.length).to.equal(3);
    });

    it("doit interdire l'affectation par un compte non-municipal", async function () {
      await expect(
        registry.connect(unauthorizedUser).assignTeam(issueId, "Equipe Pirate", "Hack")
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("doit rejeter l'affectation sur un signalement inexistant", async function () {
      await expect(
        registry.connect(municipalAgent).assignTeam("CITY-INCONNU", "Equipe A", "Commentaire")
      ).to.be.revertedWith("Signalement introuvable");
    });

    it("doit rejeter si le nom de l'équipe est vide", async function () {
      await expect(
        registry.connect(municipalAgent).assignTeam(issueId, "", "Commentaire")
      ).to.be.revertedWith("Equipe requise");
    });

    it("doit interdire l'affectation si les travaux sont déjà en cours ou terminés", async function () {
      await registry.connect(municipalAgent).assignTeam(issueId, "Equipe A", "Affectation");
      await registry.connect(municipalAgent).updateStatus(issueId, Status.InProgress, "Début travaux");

      await expect(
        registry.connect(municipalAgent).assignTeam(issueId, "Autre Equipe", "Trop tard")
      ).to.be.revertedWith("Statut incompatible pour affectation");
    });
  });

  describe("5. Cycle de vie & Transitions d'état (updateStatus)", function () {
    const issueId = "CITY-FLOW-001";

    beforeEach(async function () {
      await registry.connect(citizen1).createIssue(
        issueId,
        "WaterLeak",
        "Avenue Hassan II",
        "Canalisation percée",
        "2026-11-20",
        "Critical",
        "Citizen01"
      );
    });

    it("doit exécuter le cycle de vie complet séquentiellement (Reported -> Assigned -> InProgress -> Resolved -> Closed)", async function () {
      // 1. Reported -> Assigned
      await registry.connect(municipalAgent).assignTeam(issueId, "Equipe Assainissement", "Affectation");
      let issue = await registry.getIssue(issueId);
      expect(issue.status).to.equal(Status.Assigned);

      // 2. Assigned -> InProgress
      let tx = await registry.connect(municipalAgent).updateStatus(issueId, Status.InProgress, "Equipe sur place");
      await expect(tx)
        .to.emit(registry, "StatusUpdated")
        .withArgs(issueId, Status.Assigned, Status.InProgress, municipalAgent.address, "Equipe sur place");

      issue = await registry.getIssue(issueId);
      expect(issue.status).to.equal(Status.InProgress);

      // 3. InProgress -> Resolved
      tx = await registry.connect(municipalAgent).updateStatus(issueId, Status.Resolved, "Fuite colmatée");
      await expect(tx)
        .to.emit(registry, "StatusUpdated")
        .withArgs(issueId, Status.InProgress, Status.Resolved, municipalAgent.address, "Fuite colmatée");

      issue = await registry.getIssue(issueId);
      expect(issue.status).to.equal(Status.Resolved);

      // 4. Resolved -> Closed
      tx = await registry.connect(municipalAgent).updateStatus(issueId, Status.Closed, "Vérification municipale validée");
      await expect(tx)
        .to.emit(registry, "StatusUpdated")
        .withArgs(issueId, Status.Resolved, Status.Closed, municipalAgent.address, "Vérification municipale validée");

      issue = await registry.getIssue(issueId);
      expect(issue.status).to.equal(Status.Closed);

      // Vérification finale de l'historique : 5 entrées au total (Création + 4 transitions)
      const history = await registry.getIssueHistory(issueId);
      expect(history.length).to.equal(5);
      expect(history[0].status).to.equal(Status.Reported);
      expect(history[1].status).to.equal(Status.Assigned);
      expect(history[2].status).to.equal(Status.InProgress);
      expect(history[3].status).to.equal(Status.Resolved);
      expect(history[4].status).to.equal(Status.Closed);
      expect(history[4].comment).to.equal("Vérification municipale validée");
    });

    it("doit interdire à un citoyen sans MUNICIPALITY_ROLE de mettre à jour le statut", async function () {
      await expect(
        registry.connect(citizen1).updateStatus(issueId, Status.Assigned, "Tentative citoyen")
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("doit interdire les sauts d'états incohérents", async function () {
      // Depuis Reported (0), tenter de sauter directement à InProgress (2)
      await expect(
        registry.connect(municipalAgent).updateStatus(issueId, Status.InProgress, "Saut direct")
      ).to.be.revertedWith("Transition de statut invalide");

      // Tenter de sauter directement à Resolved (3)
      await expect(
        registry.connect(municipalAgent).updateStatus(issueId, Status.Resolved, "Saut direct")
      ).to.be.revertedWith("Transition de statut invalide");

      // Tenter de sauter directement à Closed (4)
      await expect(
        registry.connect(municipalAgent).updateStatus(issueId, Status.Closed, "Saut direct")
      ).to.be.revertedWith("Transition de statut invalide");
    });

    it("doit interdire la rétrogradation de statut (retour en arrière)", async function () {
      await registry.connect(municipalAgent).assignTeam(issueId, "Equipe A", "Affectation");
      await registry.connect(municipalAgent).updateStatus(issueId, Status.InProgress, "En cours");

      // Tenter de revenir à Assigned ou Reported
      await expect(
        registry.connect(municipalAgent).updateStatus(issueId, Status.Assigned, "Retour arriere")
      ).to.be.revertedWith("Transition de statut invalide");

      await expect(
        registry.connect(municipalAgent).updateStatus(issueId, Status.Reported, "Retour arriere")
      ).to.be.revertedWith("Transition de statut invalide");
    });

    it("doit interdire de mettre à jour vers le même statut actuel", async function () {
      await registry.connect(municipalAgent).assignTeam(issueId, "Equipe A", "Affectation");

      await expect(
        registry.connect(municipalAgent).updateStatus(issueId, Status.Assigned, "Meme statut")
      ).to.be.revertedWith("Transition de statut invalide");
    });

    it("doit interdire toute transition une fois le dossier Closed", async function () {
      await registry.connect(municipalAgent).assignTeam(issueId, "Equipe A", "Affectation");
      await registry.connect(municipalAgent).updateStatus(issueId, Status.InProgress, "En cours");
      await registry.connect(municipalAgent).updateStatus(issueId, Status.Resolved, "Résolu");
      await registry.connect(municipalAgent).updateStatus(issueId, Status.Closed, "Clôturé");

      // Tenter de changer après Closed
      await expect(
        registry.connect(municipalAgent).updateStatus(issueId, Status.Resolved, "Reouvrir")
      ).to.be.revertedWith("Transition de statut invalide");
    });
  });

  describe("6. Consultation & Données complètes (getIssue, getIssueHistory, getAllIssues)", function () {
    beforeEach(async function () {
      await registry.connect(citizen1).createIssue(
        "CITY-VIEW-001",
        "StreetLight",
        "Zone 1",
        "Panne 1",
        "2026-11-01",
        "Low",
        "Citoyen 1"
      );

      await registry.connect(citizen2).createIssue(
        "CITY-VIEW-002",
        "Pothole",
        "Zone 2",
        "Panne 2",
        "2026-11-02",
        "Critical",
        "Citoyen 2"
      );
    });

    it("doit retourner la liste complète de tous les identifiants avec getAllIssueIds", async function () {
      const ids = await registry.getAllIssueIds();
      expect(ids.length).to.equal(2);
      expect(ids[0]).to.equal("CITY-VIEW-001");
      expect(ids[1]).to.equal("CITY-VIEW-002");
    });

    it("doit retourner tous les objets signalements avec getAllIssues", async function () {
      const all = await registry.getAllIssues();
      expect(all.length).to.equal(2);
      expect(all[0].issueId).to.equal("CITY-VIEW-001");
      expect(all[1].issueId).to.equal("CITY-VIEW-002");
      expect(all[0].exists).to.be.true;
    });

    it("doit retourner totalIssues correctement", async function () {
      expect(await registry.totalIssues()).to.equal(2n);
    });

    it("doit rejeter getIssue et getIssueHistory pour un identifiant inexistant", async function () {
      await expect(registry.getIssue("INCONNU-999")).to.be.revertedWith("Signalement introuvable");
      await expect(registry.getIssueHistory("INCONNU-999")).to.be.revertedWith("Signalement introuvable");
    });
  });
});
