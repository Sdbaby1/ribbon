import { expect } from "chai";
import { Contract, ContractTransactionReceipt, Signer } from "ethers";
import { ethers } from "hardhat";
import committedAbi from "../web/src/abi/Ribbon.json";

const ONE = 1_000_000n;

function findEvent(ribbon: Contract, receipt: ContractTransactionReceipt | null, name: string) {
  if (!receipt) throw new Error("missing receipt");
  for (const log of receipt.logs) {
    try {
      const parsed = ribbon.interface.parseLog(log);
      if (parsed?.name === name) return parsed;
    } catch {
      // Another contract emitted this log.
    }
  }
  throw new Error(`missing event ${name}`);
}

async function deployRibbon(usdcName = "MockUSDC") {
  const signers = await ethers.getSigners();
  const usdc = await (await ethers.getContractFactory(usdcName)).deploy();
  const ribbon = await (await ethers.getContractFactory("Ribbon")).deploy(await usdc.getAddress());
  return { signers, usdc, ribbon };
}

async function fundAndApprove(usdc: Contract, ribbon: Contract, signers: Signer[], amount = 1_000n * ONE) {
  const spender = await ribbon.getAddress();
  for (const signer of signers) {
    const address = await signer.getAddress();
    await usdc.mint(address, amount);
    await usdc.connect(signer).approve(spender, ethers.MaxUint256);
  }
}

async function openCircle(ribbon: Contract, creator: Signer, name = "March rent") {
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const receipt = await (await ribbon.connect(creator).createCircle(name, salt)).wait();
  const created = findEvent(ribbon, receipt, "CircleCreated");
  return {
    circleId: created.args.circleId as bigint,
    inviteCode: created.args.inviteCode as string,
  };
}

async function expenseIdOf(ribbon: Contract, receipt: ContractTransactionReceipt | null) {
  return findEvent(ribbon, receipt, "ExpenseAdded").args.expenseId as bigint;
}

describe("Ribbon", function () {
  it("ships the same ABI the app imports", async function () {
    const artifact = require("../artifacts/contracts/Ribbon.sol/Ribbon.json") as { abi: unknown };
    expect(committedAbi).to.deep.equal(artifact.abi);
  });

  it("rejects a zero token address", async function () {
    const Ribbon = await ethers.getContractFactory("Ribbon");
    await expect(Ribbon.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(Ribbon, "ZeroAddress");
  });

  it("opens a circle and admits only the invite code", async function () {
    const { signers, ribbon } = await deployRibbon();
    const [alice, bob] = signers;
    const { circleId, inviteCode } = await openCircle(ribbon, alice, "Studio");
    const circle = await ribbon.getCircle(circleId);
    expect(circle.creator).to.equal(alice.address);
    expect(circle.name).to.equal("Studio");
    expect(circle.memberCount).to.equal(1);
    expect(await ribbon.inviteMatches(circleId, inviteCode)).to.equal(true);
    expect(await ribbon.inviteMatches(circleId, ethers.ZeroHash)).to.equal(false);

    await expect(ribbon.connect(bob).join(circleId, ethers.ZeroHash)).to.be.revertedWithCustomError(
      ribbon,
      "BadInvite",
    );
    await ribbon.connect(bob).join(circleId, inviteCode);
    await expect(ribbon.connect(bob).join(circleId, inviteCode)).to.be.revertedWithCustomError(
      ribbon,
      "AlreadyMember",
    );
    const members = await ribbon.membersOf(circleId);
    expect(members).to.deep.equal([alice.address, bob.address]);
    expect(await ribbon.circlesOf(bob.address)).to.deep.equal([circleId]);
  });

  it("rejects an empty or oversized name and an oversized memo", async function () {
    const { signers, ribbon } = await deployRibbon();
    const [alice, bob] = signers;
    await expect(ribbon.connect(alice).createCircle("", ethers.ZeroHash)).to.be.revertedWithCustomError(
      ribbon,
      "BadName",
    );
    await expect(
      ribbon.connect(alice).createCircle("a".repeat(49), ethers.ZeroHash),
    ).to.be.revertedWithCustomError(ribbon, "BadName");

    const { circleId, inviteCode } = await openCircle(ribbon, alice, "a".repeat(48));
    await ribbon.connect(bob).join(circleId, inviteCode);
    await expect(
      ribbon.connect(alice).addExpense(circleId, 2, [alice.address, bob.address], [], "m".repeat(97)),
    ).to.be.revertedWithCustomError(ribbon, "MemoTooLong");
  });

  it("stops at eight members", async function () {
    const { signers, ribbon } = await deployRibbon();
    const { circleId, inviteCode } = await openCircle(ribbon, signers[0], "Full table");
    for (let i = 1; i < 8; i++) {
      await ribbon.connect(signers[i]).join(circleId, inviteCode);
    }
    await expect(ribbon.connect(signers[8]).join(circleId, inviteCode)).to.be.revertedWithCustomError(
      ribbon,
      "CircleFull",
    );
  });

  it("splits 100 base units three ways as 34, 33, 33 and does nothing until confirmed", async function () {
    const { signers, usdc, ribbon } = await deployRibbon();
    const [alice, bob, cara] = signers;
    await fundAndApprove(usdc, ribbon, [alice, bob, cara]);
    const { circleId, inviteCode } = await openCircle(ribbon, alice);
    await ribbon.connect(bob).join(circleId, inviteCode);
    await ribbon.connect(cara).join(circleId, inviteCode);

    const preview = await ribbon.previewEqualSplit(100, 3);
    expect(preview.map((share: bigint) => share)).to.deep.equal([34n, 33n, 33n]);

    const receipt = await (
      await ribbon.connect(alice).addExpense(circleId, 100, [alice.address, bob.address, cara.address], [], "dinner")
    ).wait();
    const expenseId = await expenseIdOf(ribbon, receipt);
    expect(await ribbon.netOf(circleId, alice.address)).to.equal(0n);
    await expect(ribbon.connect(alice).settle(circleId)).to.be.revertedWithCustomError(ribbon, "EmptySettle");

    await ribbon.connect(bob).confirmExpense(circleId, expenseId);
    expect(await ribbon.netOf(circleId, alice.address)).to.equal(0n);
    await ribbon.connect(cara).confirmExpense(circleId, expenseId);

    expect(await ribbon.netOf(circleId, alice.address)).to.equal(66n);
    expect(await ribbon.netOf(circleId, bob.address)).to.equal(-33n);
    expect(await ribbon.netOf(circleId, cara.address)).to.equal(-33n);

    const page = await ribbon.listExpenses(circleId, 0, 20);
    expect(page).to.have.length(1);
    expect(page[0].memo).to.equal("dinner");
    expect(page[0].applied).to.equal(true);
    expect(page[0].shares.map((share: bigint) => share)).to.deep.equal([34n, 33n, 33n]);
    expect(page[0].confirmedBy).to.deep.equal([alice.address, bob.address, cara.address]);
  });

  it("keeps custom shares exact and rejects a bad split", async function () {
    const { signers, ribbon } = await deployRibbon();
    const [alice, bob, cara] = signers;
    const { circleId, inviteCode } = await openCircle(ribbon, alice);
    await ribbon.connect(bob).join(circleId, inviteCode);
    await ribbon.connect(cara).join(circleId, inviteCode);
    const people = [alice.address, bob.address, cara.address];

    await expect(ribbon.connect(alice).addExpense(circleId, 100, people, [50, 25], "short")).to.be.revertedWithCustomError(
      ribbon,
      "BadSplit",
    );
    await expect(ribbon.connect(alice).addExpense(circleId, 100, people, [50, 25, 24], "off")).to.be.revertedWithCustomError(
      ribbon,
      "BadSplit",
    );
    await expect(ribbon.connect(alice).addExpense(circleId, 100, people, [0, 50, 50], "zero")).to.be.revertedWithCustomError(
      ribbon,
      "BadSplit",
    );
    await expect(
      ribbon.connect(alice).addExpense(circleId, 100, [alice.address, alice.address], [], "dup"),
    ).to.be.revertedWithCustomError(ribbon, "DuplicateParticipant");
    await expect(
      ribbon.connect(alice).addExpense(circleId, 100, [bob.address, cara.address], [], "absent"),
    ).to.be.revertedWithCustomError(ribbon, "PayerNotInSplit");
    await expect(
      ribbon.connect(alice).addExpense(circleId, 2, [alice.address, bob.address, cara.address], [], "dust"),
    ).to.be.revertedWithCustomError(ribbon, "BadSplit");
    await expect(ribbon.connect(cara).addExpense(circleId, 0, people, [], "zero")).to.be.revertedWithCustomError(
      ribbon,
      "ZeroAmount",
    );

    const outsider = signers[3];
    await expect(
      ribbon.connect(outsider).addExpense(circleId, 10, [alice.address, bob.address], [], "nope"),
    ).to.be.revertedWithCustomError(ribbon, "NotMember");

    const receipt = await (
      await ribbon.connect(alice).addExpense(circleId, 100, people, [50, 25, 25], "custom")
    ).wait();
    const expenseId = await expenseIdOf(ribbon, receipt);
    await ribbon.connect(bob).confirmExpense(circleId, expenseId);
    await ribbon.connect(cara).confirmExpense(circleId, expenseId);
    expect(await ribbon.netOf(circleId, alice.address)).to.equal(50n);
    expect(await ribbon.netOf(circleId, bob.address)).to.equal(-25n);
    expect(await ribbon.netOf(circleId, cara.address)).to.equal(-25n);
  });

  it("settles debtor to creditor and leaves the contract holding nothing", async function () {
    const { signers, usdc, ribbon } = await deployRibbon();
    const [alice, bob, cara] = signers;
    await fundAndApprove(usdc, ribbon, [alice, bob, cara]);
    const { circleId, inviteCode } = await openCircle(ribbon, alice, "Trip");
    await ribbon.connect(bob).join(circleId, inviteCode);
    await ribbon.connect(cara).join(circleId, inviteCode);

    const receipt = await (
      await ribbon.connect(alice).addExpense(circleId, 100, [alice.address, bob.address, cara.address], [], "train")
    ).wait();
    const expenseId = await expenseIdOf(ribbon, receipt);
    await ribbon.connect(bob).confirmExpense(circleId, expenseId);
    await ribbon.connect(cara).confirmExpense(circleId, expenseId);

    const [debtors, creditors, amounts] = await ribbon.previewSettle(circleId);
    expect(debtors).to.deep.equal([bob.address, cara.address]);
    expect(creditors).to.deep.equal([alice.address, alice.address]);
    expect(amounts.map((amount: bigint) => amount)).to.deep.equal([33n, 33n]);

    const before = {
      alice: await usdc.balanceOf(alice.address),
      bob: await usdc.balanceOf(bob.address),
      cara: await usdc.balanceOf(cara.address),
    };
    const settled = await (await ribbon.connect(bob).settle(circleId)).wait();
    expect(findEvent(ribbon, settled, "Settled").args.transfers).to.equal(2n);

    expect(await usdc.balanceOf(alice.address)).to.equal(before.alice + 66n);
    expect(await usdc.balanceOf(bob.address)).to.equal(before.bob - 33n);
    expect(await usdc.balanceOf(cara.address)).to.equal(before.cara - 33n);
    expect(await usdc.balanceOf(await ribbon.getAddress())).to.equal(0n);
    expect(await ribbon.netOf(circleId, alice.address)).to.equal(0n);
    expect(await ribbon.netOf(circleId, bob.address)).to.equal(0n);
    expect(await ribbon.netOf(circleId, cara.address)).to.equal(0n);
    await expect(ribbon.settle(circleId)).to.be.revertedWithCustomError(ribbon, "EmptySettle");
  });

  it("lets a debtor pay one creditor without settling the rest", async function () {
    const { signers, usdc, ribbon } = await deployRibbon();
    const [alice, bob, cara] = signers;
    await fundAndApprove(usdc, ribbon, [alice, bob, cara]);
    const { circleId, inviteCode } = await openCircle(ribbon, alice);
    await ribbon.connect(bob).join(circleId, inviteCode);
    await ribbon.connect(cara).join(circleId, inviteCode);
    const receipt = await (
      await ribbon.connect(alice).addExpense(circleId, 100, [alice.address, bob.address, cara.address], [], "rent")
    ).wait();
    const expenseId = await expenseIdOf(ribbon, receipt);
    await ribbon.connect(bob).confirmExpense(circleId, expenseId);
    await ribbon.connect(cara).confirmExpense(circleId, expenseId);

    await expect(ribbon.connect(bob).pay(circleId, alice.address, 34)).to.be.revertedWithCustomError(
      ribbon,
      "AmountTooHigh",
    );
    await ribbon.connect(bob).pay(circleId, alice.address, 10);
    expect(await ribbon.netOf(circleId, bob.address)).to.equal(-23n);
    expect(await ribbon.netOf(circleId, alice.address)).to.equal(56n);
    expect(await usdc.balanceOf(await ribbon.getAddress())).to.equal(0n);
  });

  it("refuses to settle when a debtor has not approved or has no USDC", async function () {
    const { signers, usdc, ribbon } = await deployRibbon();
    const [alice, bob] = signers;
    await usdc.mint(alice.address, 100n);
    await usdc.mint(bob.address, 100n);
    await usdc.connect(alice).approve(await ribbon.getAddress(), 100n);
    const { circleId, inviteCode } = await openCircle(ribbon, alice);
    await ribbon.connect(bob).join(circleId, inviteCode);
    const receipt = await (
      await ribbon.connect(alice).addExpense(circleId, 10, [alice.address, bob.address], [], "coffee")
    ).wait();
    const expenseId = await expenseIdOf(ribbon, receipt);
    await ribbon.connect(bob).confirmExpense(circleId, expenseId);

    await expect(ribbon.settle(circleId)).to.be.revertedWithCustomError(ribbon, "AllowanceTooLow");
    await usdc.connect(bob).approve(await ribbon.getAddress(), 1);
    await expect(ribbon.settle(circleId)).to.be.revertedWithCustomError(ribbon, "AllowanceTooLow");
    await usdc.connect(bob).approve(await ribbon.getAddress(), 100n);
    await usdc.connect(bob).transfer(alice.address, 100n);
    await expect(ribbon.settle(circleId)).to.be.revertedWithCustomError(ribbon, "BalanceTooLow");
    expect(await ribbon.netOf(circleId, bob.address)).to.equal(-5n);
  });

  it("cancels a pending expense and then lets people leave and close", async function () {
    const { signers, ribbon } = await deployRibbon();
    const [alice, bob] = signers;
    const { circleId, inviteCode } = await openCircle(ribbon, alice, "Lease");
    await ribbon.connect(bob).join(circleId, inviteCode);
    const receipt = await (
      await ribbon.connect(alice).addExpense(circleId, 10, [alice.address, bob.address], [], "draft")
    ).wait();
    const expenseId = await expenseIdOf(ribbon, receipt);

    await expect(ribbon.connect(bob).leave(circleId)).to.be.revertedWithCustomError(ribbon, "OpenExpense");
    await expect(ribbon.connect(bob).cancelExpense(circleId, expenseId)).to.be.revertedWithCustomError(
      ribbon,
      "NotCreator",
    );
    await ribbon.connect(alice).cancelExpense(circleId, expenseId);
    await expect(ribbon.connect(bob).confirmExpense(circleId, expenseId)).to.be.revertedWithCustomError(
      ribbon,
      "ExpenseClosed",
    );

    const page = await ribbon.listExpenses(circleId, 0, 20);
    expect(page[0].cancelled).to.equal(true);
    expect(page[0].applied).to.equal(false);

    await ribbon.connect(bob).leave(circleId);
    expect(await ribbon.isMember(circleId, bob.address)).to.equal(false);
    expect(await ribbon.circlesOf(bob.address)).to.deep.equal([]);

    await ribbon.connect(alice).closeCircle(circleId);
    await expect(ribbon.connect(bob).join(circleId, inviteCode)).to.be.revertedWithCustomError(ribbon, "CircleClosed");
    await expect(ribbon.connect(bob).closeCircle(circleId)).to.be.revertedWithCustomError(ribbon, "NotCreator");
  });

  it("blocks close while a balance is open and blocks a second confirmation", async function () {
    const { signers, usdc, ribbon } = await deployRibbon();
    const [alice, bob] = signers;
    await fundAndApprove(usdc, ribbon, [alice, bob]);
    const { circleId, inviteCode } = await openCircle(ribbon, alice);
    await ribbon.connect(bob).join(circleId, inviteCode);
    const receipt = await (
      await ribbon.connect(alice).addExpense(circleId, 10, [alice.address, bob.address], [], "tools")
    ).wait();
    const expenseId = await expenseIdOf(ribbon, receipt);
    await expect(ribbon.connect(alice).confirmExpense(circleId, expenseId)).to.be.revertedWithCustomError(
      ribbon,
      "AlreadyConfirmed",
    );
    await ribbon.connect(bob).confirmExpense(circleId, expenseId);
    await expect(ribbon.connect(bob).confirmExpense(circleId, expenseId)).to.be.revertedWithCustomError(
      ribbon,
      "ExpenseClosed",
    );
    await expect(ribbon.connect(alice).cancelExpense(circleId, expenseId)).to.be.revertedWithCustomError(
      ribbon,
      "ExpenseClosed",
    );
    await expect(ribbon.connect(alice).closeCircle(circleId)).to.be.revertedWithCustomError(ribbon, "OpenBalance");
    await expect(ribbon.connect(bob).leave(circleId)).to.be.revertedWithCustomError(ribbon, "OpenBalance");
  });

  it("pages expenses without mixing their shares", async function () {
    const { signers, ribbon } = await deployRibbon();
    const [alice, bob, cara] = signers;
    const { circleId, inviteCode } = await openCircle(ribbon, alice);
    await ribbon.connect(bob).join(circleId, inviteCode);
    await ribbon.connect(cara).join(circleId, inviteCode);
    await ribbon.connect(alice).addExpense(circleId, 10, [alice.address, bob.address], [], "one");
    await ribbon.connect(bob).addExpense(circleId, 20, [bob.address, cara.address], [12, 8], "two");
    await ribbon.connect(cara).addExpense(circleId, 8, [cara.address, alice.address], [], "three");

    const middle = await ribbon.listExpenses(circleId, 1, 1);
    expect(middle).to.have.length(1);
    expect(middle[0].id).to.equal(1n);
    expect(middle[0].memo).to.equal("two");
    expect(middle[0].shares.map((share: bigint) => share)).to.deep.equal([12n, 8n]);

    const all = await ribbon.listExpenses(circleId, 0, 20);
    expect(all.map((item: { memo: string }) => item.memo)).to.deep.equal(["one", "two", "three"]);
    expect(all[0].shares.map((share: bigint) => share)).to.deep.equal([5n, 5n]);
  });

  it("rejects a token that lies about the transfer", async function () {
    for (const name of ["LyingUSDC", "FalseUSDC"]) {
      const { signers, usdc, ribbon } = await deployRibbon(name);
      const [alice, bob] = signers;
      await fundAndApprove(usdc, ribbon, [alice, bob]);
      const { circleId, inviteCode } = await openCircle(ribbon, alice, name);
      await ribbon.connect(bob).join(circleId, inviteCode);
      const receipt = await (
        await ribbon.connect(alice).addExpense(circleId, 10, [alice.address, bob.address], [], "x")
      ).wait();
      const expenseId = await expenseIdOf(ribbon, receipt);
      await ribbon.connect(bob).confirmExpense(circleId, expenseId);
      await expect(ribbon.settle(circleId)).to.be.revertedWithCustomError(ribbon, "TransferFailed");
      expect(await ribbon.netOf(circleId, bob.address)).to.equal(-5n);
    }
  });

  it("reverts when the token reenters settlement", async function () {
    const { signers, usdc, ribbon } = await deployRibbon("ReenteringUSDC");
    const [alice, bob] = signers;
    await fundAndApprove(usdc, ribbon, [alice, bob]);
    const { circleId, inviteCode } = await openCircle(ribbon, alice, "reenter");
    await ribbon.connect(bob).join(circleId, inviteCode);
    const receipt = await (
      await ribbon.connect(alice).addExpense(circleId, 10, [alice.address, bob.address], [], "x")
    ).wait();
    const expenseId = await expenseIdOf(ribbon, receipt);
    await ribbon.connect(bob).confirmExpense(circleId, expenseId);
    await usdc.arm(await ribbon.getAddress(), circleId, alice.address);
    await expect(ribbon.connect(bob).settle(circleId)).to.be.revertedWithCustomError(ribbon, "Reentered");
    expect(await ribbon.netOf(circleId, alice.address)).to.equal(5n);
    expect(await usdc.balanceOf(await ribbon.getAddress())).to.equal(0n);
  });

  it("conserves USDC across random confirmed expenses and a final settle", async function () {
    const { signers, usdc, ribbon } = await deployRibbon();
    const group = signers.slice(0, 4);
    await fundAndApprove(usdc, ribbon, group);
    const { circleId, inviteCode } = await openCircle(ribbon, group[0], "Random");
    for (const signer of group.slice(1)) {
      await ribbon.connect(signer).join(circleId, inviteCode);
    }

    let seed = 11;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let n = 0; n < 7; n++) {
      const payerIndex = Math.floor(rand() * group.length);
      const payer = group[payerIndex];
      const rest = group.filter((_, index) => index !== payerIndex);
      const width = 1 + Math.floor(rand() * (rest.length - 1));
      const participants = [payer, ...rest.slice(0, width)];
      const amount = BigInt(participants.length + Math.floor(rand() * 40));
      const receipt = await (
        await ribbon
          .connect(payer)
          .addExpense(
            circleId,
            amount,
            participants.map((signer) => signer.address),
            [],
            `n${n}`,
          )
      ).wait();
      const expenseId = await expenseIdOf(ribbon, receipt);
      for (const signer of participants.slice(1)) {
        await ribbon.connect(signer).confirmExpense(circleId, expenseId);
      }
    }

    const addresses = await Promise.all(group.map((signer) => signer.getAddress()));
    let netSum = 0n;
    const nets = new Map<string, bigint>();
    const before = new Map<string, bigint>();
    for (const address of addresses) {
      const net = await ribbon.netOf(circleId, address);
      nets.set(address, net);
      netSum += net;
      before.set(address, await usdc.balanceOf(address));
    }
    expect(netSum).to.equal(0n);

    const unsettled = [...nets.values()].every((net) => net === 0n);
    if (!unsettled) {
      await ribbon.connect(group[0]).settle(circleId);
      for (const address of addresses) {
        const delta = (await usdc.balanceOf(address)) - (before.get(address) ?? 0n);
        expect(delta).to.equal(nets.get(address));
        expect(await ribbon.netOf(circleId, address)).to.equal(0n);
      }
    }
    expect(await usdc.balanceOf(await ribbon.getAddress())).to.equal(0n);
  });
});
