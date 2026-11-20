const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateRegistry (ERC-721 + AccessControl + ReentrancyGuard)", function () {
  let CertificateRegistry;
  let registry;
  let admin, minter, student1, student2, attacker, otherUser;
  let DEFAULT_ADMIN_ROLE, MINTER_ROLE;

  beforeEach(async function () {
    [admin, minter, student1, student2, attacker, otherUser] = await ethers.getSigners();

    CertificateRegistry = await ethers.getContractFactory("CertificateRegistry");
    registry = await CertificateRegistry.deploy();
    await registry.waitForDeployment();

    DEFAULT_ADMIN_ROLE = await registry.DEFAULT_ADMIN_ROLE();
    MINTER_ROLE = await registry.MINTER_ROLE();

    // Attribuer MINTER_ROLE à minter pour les tests de séparation des rôles
    await registry.connect(admin).grantRole(MINTER_ROLE, minter.address);
  });

  describe("1. Initialisation & Configuration ERC-721", function () {
    it("doit initialiser le nom et le symbole ERC-721", async function () {
      expect(await registry.name()).to.equal("AcademicCertificate");
      expect(await registry.symbol()).to.equal("ACERT");
    });

    it("doit attribuer DEFAULT_ADMIN_ROLE et MINTER_ROLE au déployeur", async function () {
      expect(await registry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await registry.hasRole(MINTER_ROLE, admin.address)).to.be.true;
    });

    it("doit démarrer avec un compteur total de certificats à 0", async function () {
      expect(await registry.totalCertificates()).to.equal(0n);
    });

    it("doit supporter les interfaces ERC-721, ERC721URIStorage et AccessControl", async function () {
      // Interface ID ERC721: 0x80ac58cd
      expect(await registry.supportsInterface("0x80ac58cd")).to.be.true;
      // Interface ID AccessControl: 0x7965db0b
      expect(await registry.supportsInterface("0x7965db0b")).to.be.true;
      // Interface ID ERC721Metadata: 0x5b5e139f
      expect(await registry.supportsInterface("0x5b5e139f")).to.be.true;
    });
  });

  describe("2. Émission unitaire (mintCertificate)", function () {
    it("doit émettre un certificat valide et émettre l'événement CertificateMinted", async function () {
      const uri = "ipfs://bafkreiaa123456789";
      const tx = await registry.connect(minter).mintCertificate(
        student1.address,
        "Yasmine El Idrissi",
        "CNE123456",
        "Licence Informatique",
        "2026-06-30",
        "Très bien",
        uri
      );

      await expect(tx)
        .to.emit(registry, "CertificateMinted")
        .withArgs(
          1n,
          student1.address,
          "CNE123456",
          "Yasmine El Idrissi",
          "Licence Informatique",
          uri
        );

      await expect(tx)
        .to.emit(registry, "Transfer")
        .withArgs(ethers.ZeroAddress, student1.address, 1n);

      expect(await registry.ownerOf(1n)).to.equal(student1.address);
      expect(await registry.totalCertificates()).to.equal(1n);
      expect(await registry.tokenURI(1n)).to.equal(uri);

      const [cert, fetchedUri] = await registry.getCertificate(1n);
      expect(cert.id).to.equal(1n);
      expect(cert.studentName).to.equal("Yasmine El Idrissi");
      expect(cert.studentId).to.equal("CNE123456");
      expect(cert.diplomaTitle).to.equal("Licence Informatique");
      expect(cert.issueDate).to.equal("2026-06-30");
      expect(cert.grade).to.equal("Très bien");
      expect(cert.recipientAddress).to.equal(student1.address);
      expect(cert.revoked).to.be.false;
      expect(fetchedUri).to.equal(uri);
    });

    it("doit enregistrer le CNE dans le mapping studentIdExists", async function () {
      await registry.connect(minter).mintCertificate(
        student1.address,
        "Omar Benkirane",
        "CNE999999",
        "Master GL",
        "2026-06-30",
        "Bien",
        "ipfs://test-uri"
      );
      expect(await registry.studentIdExists("CNE999999")).to.be.true;
      expect(await registry.studentIdExists("CNE_INCONNU")).to.be.false;
    });
  });

  describe("3. Émission par lots (batchMintCertificates & mintBatch)", function () {
    it("doit émettre un lot de plusieurs certificats avec succès", async function () {
      const recipients = [student1.address, student2.address];
      const names = ["Alice Martin", "Bob Dupont"];
      const ids = ["CNE_BATCH_1", "CNE_BATCH_2"];
      const titles = ["Master IA", "Licence Maths"];
      const dates = ["2026-07-01", "2026-07-02"];
      const grades = ["Bien", "Passable"];
      const uris = ["ipfs://uri1", "ipfs://uri2"];

      const tx = await registry.connect(minter).batchMintCertificates(
        recipients,
        names,
        ids,
        titles,
        dates,
        grades,
        uris
      );

      await expect(tx).to.emit(registry, "CertificateMinted");
      expect(await registry.totalCertificates()).to.equal(2n);
      expect(await registry.ownerOf(1n)).to.equal(student1.address);
      expect(await registry.ownerOf(2n)).to.equal(student2.address);
      expect(await registry.tokenURI(1n)).to.equal("ipfs://uri1");
      expect(await registry.tokenURI(2n)).to.equal("ipfs://uri2");
    });

    it("doit fonctionner via l'alias de compatibilité mintBatch", async function () {
      const tx = await registry.connect(minter).mintBatch(
        [student1.address],
        ["Salma Tazi"],
        ["CNE_ALIAS_1"],
        ["Doctorat Bio"],
        ["2026-07-15"],
        ["Très honorable"],
        ["ipfs://alias-uri"]
      );

      await expect(tx).to.emit(registry, "CertificateMinted");
      expect(await registry.totalCertificates()).to.equal(1n);
    });

    it("doit rejeter un lot vide", async function () {
      await expect(
        registry.connect(minter).batchMintCertificates([], [], [], [], [], [], [])
      ).to.be.revertedWith("Lot vide");
    });

    it("doit rejeter un lot dépassant MAX_BATCH (10)", async function () {
      const bigArray = new Array(11).fill("test");
      const addrs = new Array(11).fill(student1.address);

      await expect(
        registry.connect(minter).batchMintCertificates(
          addrs,
          bigArray,
          bigArray.map((_, i) => `CNE_EXCEED_${i}`),
          bigArray,
          bigArray,
          bigArray,
          bigArray
        )
      ).to.be.revertedWith("Maximum 10 certificats par lot");
    });

    it("doit rejeter si les tableaux ont des longueurs différentes", async function () {
      await expect(
        registry.connect(minter).batchMintCertificates(
          [student1.address, student2.address],
          ["Nom 1"], // longueur 1 != 2
          ["CNE1", "CNE2"],
          ["Diplome 1", "Diplome 2"],
          ["2026-01-01", "2026-01-01"],
          ["", ""],
          ["uri1", "uri2"]
        )
      ).to.be.revertedWith("Tableaux de longueurs differentes");
    });
  });

  describe("4. Contrôle d'accès (MINTER_ROLE & DEFAULT_ADMIN_ROLE)", function () {
    it("doit empêcher un compte sans MINTER_ROLE d'émettre (mintCertificate)", async function () {
      await expect(
        registry.connect(otherUser).mintCertificate(
          student1.address,
          "Intrus",
          "CNE_HACK",
          "Faux Diplome",
          "2026-01-01",
          "",
          "ipfs://fake"
        )
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("doit empêcher un compte sans MINTER_ROLE d'émettre par lot (batchMintCertificates)", async function () {
      await expect(
        registry.connect(otherUser).batchMintCertificates(
          [student1.address],
          ["Intrus"],
          ["CNE_HACK_BATCH"],
          ["Faux Diplome"],
          ["2026-01-01"],
          [""],
          ["ipfs://fake"]
        )
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("doit empêcher un compte possédant uniquement MINTER_ROLE de révoquer un certificat", async function () {
      // Émission par minter
      await registry.connect(minter).mintCertificate(
        student1.address,
        "Yasmine",
        "CNE_REVOKE_TEST",
        "Licence",
        "2026-01-01",
        "",
        "ipfs://test"
      );

      // minter tente de révoquer sans DEFAULT_ADMIN_ROLE -> échec
      await expect(
        registry.connect(minter).revokeCertificate(1n)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("doit permettre à l'administrateur d'accorder et de retirer MINTER_ROLE", async function () {
      expect(await registry.hasRole(MINTER_ROLE, otherUser.address)).to.be.false;

      // Attribution
      await registry.connect(admin).grantRole(MINTER_ROLE, otherUser.address);
      expect(await registry.hasRole(MINTER_ROLE, otherUser.address)).to.be.true;

      // now otherUser can mint
      await registry.connect(otherUser).mintCertificate(
        student1.address,
        "Etudiant",
        "CNE_GRANTED",
        "Licence",
        "2026-01-01",
        "",
        "ipfs://test"
      );
      expect(await registry.totalCertificates()).to.equal(1n);

      // Révocation du rôle
      await registry.connect(admin).revokeRole(MINTER_ROLE, otherUser.address);
      expect(await registry.hasRole(MINTER_ROLE, otherUser.address)).to.be.false;

      // otherUser ne peut plus émettre
      await expect(
        registry.connect(otherUser).mintCertificate(
          student1.address,
          "Etudiant 2",
          "CNE_DENIED",
          "Licence",
          "2026-01-01",
          "",
          "ipfs://test"
        )
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("5. Validation des entrées & Intégrité des données", function () {
    it("doit bloquer l'émission si l'adresse destinataire est nulle (address(0))", async function () {
      await expect(
        registry.connect(minter).mintCertificate(
          ethers.ZeroAddress,
          "Etudiant",
          "CNE_ZERO_ADDR",
          "Master",
          "2026-01-01",
          "",
          "ipfs://uri"
        )
      ).to.be.revertedWith("Adresse invalide");
    });

    it("doit bloquer les doublons de CNE (anti-doublon CNE)", async function () {
      await registry.connect(minter).mintCertificate(
        student1.address,
        "Etudiant 1",
        "CNE_UNIQUE_1",
        "Master",
        "2026-01-01",
        "",
        "ipfs://uri1"
      );

      // Deuxième tentative avec le même CNE
      await expect(
        registry.connect(minter).mintCertificate(
          student2.address,
          "Etudiant 2",
          "CNE_UNIQUE_1",
          "Autre Diplome",
          "2026-01-01",
          "",
          "ipfs://uri2"
        )
      ).to.be.revertedWith("Ce CNE est deja enregistre");
    });

    it("doit bloquer les champs obligatoires vides", async function () {
      await expect(
        registry.connect(minter).mintCertificate(
          student1.address,
          "", // nom vide
          "CNE_ERR_1",
          "Master",
          "2026-01-01",
          "",
          "ipfs://uri"
        )
      ).to.be.revertedWith("Nom requis");

      await expect(
        registry.connect(minter).mintCertificate(
          student1.address,
          "Etudiant",
          "", // CNE vide
          "Master",
          "2026-01-01",
          "",
          "ipfs://uri"
        )
      ).to.be.revertedWith("CNE requis");

      await expect(
        registry.connect(minter).mintCertificate(
          student1.address,
          "Etudiant",
          "CNE_ERR_2",
          "", // Intitule vide
          "2026-01-01",
          "",
          "ipfs://uri"
        )
      ).to.be.revertedWith("Intitule requis");

      await expect(
        registry.connect(minter).mintCertificate(
          student1.address,
          "Etudiant",
          "CNE_ERR_3",
          "Master",
          "", // Date vide
          "",
          "ipfs://uri"
        )
      ).to.be.revertedWith("Date requise");
    });

    it("doit rejeter getCertificate pour un tokenId inexistant", async function () {
      await expect(registry.getCertificate(0n)).to.be.revertedWith("Certificat introuvable");
      await expect(registry.getCertificate(999n)).to.be.revertedWith("Certificat introuvable");
    });
  });

  describe("6. Révocation administrative (revokeCertificate)", function () {
    beforeEach(async function () {
      await registry.connect(minter).mintCertificate(
        student1.address,
        "Yasmine",
        "CNE_REVOCABLE",
        "Licence Informatique",
        "2026-06-30",
        "Très bien",
        "ipfs://valid-cert"
      );
    });

    it("doit permettre à l'administrateur de révoquer un certificat", async function () {
      const tx = await registry.connect(admin).revokeCertificate(1n);

      await expect(tx)
        .to.emit(registry, "CertificateRevoked")
        .withArgs(1n);

      const [cert] = await registry.getCertificate(1n);
      expect(cert.revoked).to.be.true;
    });

    it("doit rejeter la révocation d'un certificat déjà révoqué", async function () {
      await registry.connect(admin).revokeCertificate(1n);

      await expect(
        registry.connect(admin).revokeCertificate(1n)
      ).to.be.revertedWith("Certificat deja revoque");
    });

    it("doit rejeter la révocation d'un certificat inexistant", async function () {
      await expect(
        registry.connect(admin).revokeCertificate(999n)
      ).to.be.revertedWith("Certificat introuvable");
    });
  });

  describe("7. Test de non-réentrance (ReentrancyGuard)", function () {
    it("doit bloquer toute tentative de réentrance malveillante dans mintCertificate via callback ERC-721", async function () {
      const AttackerFactory = await ethers.getContractFactory("ReentrancyAttacker");
      const attackerContract = await AttackerFactory.deploy(await registry.getAddress());
      await attackerContract.waitForDeployment();
      const attackerAddress = await attackerContract.getAddress();

      // Accorder MINTER_ROLE au contrat attaquant pour qu'il passe la vérification de rôle
      await registry.connect(admin).grantRole(MINTER_ROLE, attackerAddress);

      // L'attaquant tente une réentrance lors de la réception du token
      await expect(
        registry.connect(minter).mintCertificate(
          attackerAddress,
          "Attaquant",
          "CNE_ATTACK_ROOT",
          "Attaque Reentrante",
          "2026-01-01",
          "",
          "ipfs://attack-root"
        )
      ).to.be.revertedWithCustomError(registry, "ReentrancyGuardReentrantCall");

      // Vérifier que le compteur n'a pas été incrémenté et que l'état reste propre
      expect(await registry.totalCertificates()).to.equal(0n);
      expect(await registry.studentIdExists("CNE_ATTACK_ROOT")).to.be.false;
      expect(await registry.studentIdExists("CNE_REENTRANT_002")).to.be.false;
    });
  });
});
