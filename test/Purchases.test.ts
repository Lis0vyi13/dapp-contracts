import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { PurchasesTracking, Token } from "../typechain-types";

describe("PurchasesTracking", function () {
  let purchasesTracking: PurchasesTracking;
  let token: Token;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addr3: SignerWithAddress;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("Token");
    token = await TokenFactory.deploy();
    await token.waitForDeployment();

    const PurchasesTrackingFactory = await ethers.getContractFactory(
      "PurchasesTracking"
    );
    purchasesTracking = await PurchasesTrackingFactory.deploy(
      await token.getAddress()
    );
    await purchasesTracking.waitForDeployment();

    const mintAmount = ethers.parseUnits("1000", 18);
    await token.transfer(addr1.address, mintAmount);
    await token.transfer(addr2.address, mintAmount);
    await token.transfer(addr3.address, mintAmount);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await purchasesTracking.owner()).to.equal(owner.address);
    });

    it("Should set the correct payment token", async function () {
      expect(await purchasesTracking.paymentToken()).to.equal(
        await token.getAddress()
      );
    });
  });

  describe("Adding Purchases", function () {
    it("Should add a single buyer purchase", async function () {
      const amount = ethers.parseUnits("100", 18);
      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);

      await purchasesTracking.connect(addr1).addPurchase(amount, [], []);

      const purchase = await purchasesTracking.purchases(0);
      expect(purchase.amount).to.equal(amount);
      expect(purchase.buyer).to.equal(addr1.address);
      expect(purchase.isSplit).to.be.false;
    });

    it("Should add a split purchase", async function () {
      const amount = ethers.parseUnits("100", 18);
      const contribution1 = ethers.parseUnits("60", 18);
      const contribution2 = ethers.parseUnits("40", 18);

      await token
        .connect(addr1)
        .approve(await purchasesTracking.getAddress(), contribution1);
      await token
        .connect(addr2)
        .approve(await purchasesTracking.getAddress(), contribution2);

      await purchasesTracking
        .connect(addr1)
        .addPurchase(
          amount,
          [addr1.address, addr2.address],
          [contribution1, contribution2]
        );

      const purchase = await purchasesTracking.purchases(0);
      expect(purchase.amount).to.equal(amount);
      expect(purchase.isSplit).to.be.true;

      const buyers = await purchasesTracking.getPurchaseBuyers(0);
      const contributions =
        await purchasesTracking.getPurchaseUserContributions(0);

      expect(buyers.length).to.equal(2);
      expect(contributions.length).to.equal(2);

      expect(buyers[0]).to.equal(addr1.address);
      expect(buyers[1]).to.equal(addr2.address);
      expect(contributions[0]).to.equal(contribution1);
      expect(contributions[1]).to.equal(contribution2);
    });

    it("Should increment purchase count", async function () {
      const amount = ethers.parseUnits("100", 18);
      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);

      await purchasesTracking.connect(addr1).addPurchase(amount, [], []);
      expect(await purchasesTracking.purchaseCount()).to.equal(1);
    });

    it("Should fail if contributions don't match amount", async function () {
      const amount = ethers.parseUnits("100", 18);
      const contribution1 = ethers.parseUnits("60", 18);
      const contribution2 = ethers.parseUnits("20", 18);

      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);

      await expect(
        purchasesTracking
          .connect(addr1)
          .addPurchase(
            amount,
            [addr1.address, addr2.address],
            [contribution1, contribution2]
          )
      ).to.be.revertedWith("Total contributions must match amount");
    });

    it("Should fail if arrays length mismatch", async function () {
      const amount = ethers.parseUnits("100", 18);
      const contribution1 = ethers.parseUnits("60", 18);

      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);

      await expect(
        purchasesTracking
          .connect(addr1)
          .addPurchase(amount, [addr1.address, addr2.address], [contribution1])
      ).to.be.revertedWith("Buyers and contributions arrays must match");
    });

    it("Should fail if buyer address is zero", async function () {
      const amount = ethers.parseUnits("100", 18);
      const contribution1 = ethers.parseUnits("50", 18);
      const contribution2 = ethers.parseUnits("50", 18);

      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);

      await expect(
        purchasesTracking
          .connect(addr1)
          .addPurchase(
            amount,
            [addr1.address, ethers.ZeroAddress],
            [contribution1, contribution2]
          )
      ).to.be.revertedWith("Invalid buyer address");
    });
  });

  it("Should revert when querying buyers for non-existent purchase", async function () {
    await expect(purchasesTracking.getPurchaseBuyers(0)).to.be.revertedWith(
      "Purchase does not exist"
    );
  });

  it("Should revert when querying user contributions for non-existent purchase", async function () {
    await expect(
      purchasesTracking.getPurchaseUserContributions(0)
    ).to.be.revertedWith("Purchase does not exist");
  });

  describe("Removing Purchases", function () {
    it("Should allow owner to remove purchase", async function () {
      const amount = ethers.parseUnits("100", 18);
      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);
      await purchasesTracking.connect(addr1).addPurchase(amount, [], []);

      await purchasesTracking.connect(owner).removePurchase(0);
      const purchase = await purchasesTracking.purchases(0);
      expect(purchase.amount).to.equal(0);
    });

    it("Should fail if non-owner tries to remove purchase", async function () {
      const amount = ethers.parseUnits("100", 18);
      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);
      await purchasesTracking.connect(addr1).addPurchase(amount, [], []);

      await expect(
        purchasesTracking.connect(addr1).removePurchase(0)
      ).to.be.revertedWith("Only owner can execute this");
    });

    it("Should fail if purchase doesn't exist", async function () {
      await expect(
        purchasesTracking.connect(owner).removePurchase(99)
      ).to.be.revertedWith("Purchase does not exist");
    });
  });

  describe("Withdrawing Funds", function () {
    it("Should allow owner to withdraw funds", async function () {
      const amount = ethers.parseUnits("100", 18);
      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);
      await purchasesTracking.connect(addr1).addPurchase(amount, [], []);

      const initialBalance = await token.balanceOf(owner.address);
      await purchasesTracking.connect(owner).withdraw(amount);
      const finalBalance = await token.balanceOf(owner.address);

      expect(finalBalance - initialBalance).to.equal(amount);
    });

    it("Should fail if non-owner tries to withdraw", async function () {
      const amount = ethers.parseUnits("100", 18);
      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);
      await purchasesTracking.connect(addr1).addPurchase(amount, [], []);

      await expect(
        purchasesTracking.connect(addr1).withdraw(amount)
      ).to.be.revertedWith("Only owner can execute this");
    });

    it("Should fail if trying to withdraw more than available", async function () {
      const amount = ethers.parseUnits("100", 18);
      const withdrawAmount = ethers.parseUnits("200", 18);

      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);
      await purchasesTracking.connect(addr1).addPurchase(amount, [], []);

      await expect(
        purchasesTracking.connect(owner).withdraw(withdrawAmount)
      ).to.be.revertedWith("Insufficient token balance in contract");
    });
  });

  describe("Events", function () {
    it("Should emit PurchaseAdded event", async function () {
      const amount = ethers.parseUnits("100", 18);
      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);

      await expect(purchasesTracking.connect(addr1).addPurchase(amount, [], []))
        .to.emit(purchasesTracking, "PurchaseAdded")
        .withArgs(0, amount, [], []);
    });

    it("Should emit PurchaseDeleted event", async function () {
      const amount = ethers.parseUnits("100", 18);
      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);
      await purchasesTracking.connect(addr1).addPurchase(amount, [], []);

      await expect(purchasesTracking.connect(owner).removePurchase(0))
        .to.emit(purchasesTracking, "PurchaseDeleted")
        .withArgs(0);
    });

    it("Should emit FundsWithdrawn event", async function () {
      const amount = ethers.parseUnits("100", 18);
      await token
        .connect(addr1)
        .approve(purchasesTracking.getAddress(), amount);
      await purchasesTracking.connect(addr1).addPurchase(amount, [], []);

      await expect(purchasesTracking.connect(owner).withdraw(amount))
        .to.emit(purchasesTracking, "FundsWithdrawn")
        .withArgs(amount);
    });
  });
});
