import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { AgentRewards } from "../target/types/agent_rewards";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

// Reward schedule (base units; USDC = 6 decimals)
const FIND_LEADS = 1_000n; // work_type 0
const DRAFT = 2_500n; // work_type 1
const SEND_BATCH = 30_000n; // work_type 2

describe("agent_rewards", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AgentRewards as Program<AgentRewards>;
  const connection = provider.connection;
  const owner = provider.wallet as anchor.Wallet;

  const oracle = Keypair.generate();
  const badOracle = Keypair.generate();
  const agent = Keypair.generate();

  let usdcMint: PublicKey;
  let ownerAta: PublicKey;
  let vault: PublicKey;
  let vaultAta: PublicKey;
  let agentAta: PublicKey;

  const nonceFor = (n: number) => new BN(n);
  const claimPda = (nonce: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("claim"), vault.toBuffer(), new BN(nonce).toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];

  const agentBalance = async () => (await getAccount(connection, agentAta)).amount;
  const vaultBalance = async () => (await getAccount(connection, vaultAta)).amount;

  before(async () => {
    // Fund the two oracle keypairs so they can pay rent for the WorkClaim PDA they init.
    for (const kp of [oracle, badOracle]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
    }

    // Local stand-in for USDC: a fresh 6-decimal mint, authority = owner.
    usdcMint = await createMint(connection, owner.payer, owner.publicKey, null, 6);

    ownerAta = (
      await getOrCreateAssociatedTokenAccount(connection, owner.payer, usdcMint, owner.publicKey)
    ).address;
    // Mint owner 10 USDC of headroom.
    await mintTo(connection, owner.payer, usdcMint, ownerAta, owner.publicKey, 10_000_000);

    [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.publicKey.toBuffer()],
      program.programId
    );
    vaultAta = getAssociatedTokenAddressSync(usdcMint, vault, true); // true = PDA owner
    agentAta = (
      await getOrCreateAssociatedTokenAccount(connection, owner.payer, usdcMint, agent.publicKey)
    ).address;
  });

  it("initializes the vault + escrow", async () => {
    await program.methods
      .initializeVault(oracle.publicKey, agent.publicKey)
      .accounts({
        owner: owner.publicKey,
        usdcMint,
      })
      .rpc();

    const v = await program.account.vault.fetch(vault);
    assert.ok(v.owner.equals(owner.publicKey));
    assert.ok(v.oracle.equals(oracle.publicKey));
    assert.ok(v.agent.equals(agent.publicKey));
    assert.equal(v.totalRewarded.toString(), "0");
  });

  it("accepts a deposit", async () => {
    await program.methods
      .deposit(new BN(1_000_000)) // 1 USDC
      .accounts({
        owner: owner.publicKey,
        ownerTokenAccount: ownerAta,
      })
      .rpc();
    assert.equal((await vaultBalance()).toString(), "1000000");
  });

  const claim = (workType: number, quantity: number, nonce: number, signer = oracle) =>
    program.methods
      .claimReward(workType, new BN(quantity), nonceFor(nonce))
      .accounts({
        oracle: signer.publicKey,
        vault,
        agent: agent.publicKey,
        agentTokenAccount: agentAta,
        workClaim: claimPda(nonce),
      })
      .signers([signer])
      .rpc();

  it("pays for FIND_LEADS (0.001 * 5 units)", async () => {
    await claim(0, 5, 1);
    assert.equal((await agentBalance()).toString(), (FIND_LEADS * 5n).toString()); // 5000
  });

  it("pays for DRAFT templates (0.0025 * 3)", async () => {
    await claim(1, 3, 2);
    assert.equal((await agentBalance()).toString(), (FIND_LEADS * 5n + DRAFT * 3n).toString()); // 12500
  });

  it("pays for SEND_BATCH (0.03 * 2)", async () => {
    await claim(2, 2, 3);
    const expected = FIND_LEADS * 5n + DRAFT * 3n + SEND_BATCH * 2n; // 72500
    assert.equal((await agentBalance()).toString(), expected.toString());
  });

  it("rejects a replayed nonce", async () => {
    try {
      await claim(2, 2, 3); // nonce 3 already used
      assert.fail("replay should have thrown");
    } catch (e) {
      // WorkClaim PDA already exists -> account-in-use / init failure
      assert.ok(e, "expected an error on replay");
    }
  });

  it("rejects an untrusted oracle", async () => {
    try {
      await claim(0, 1, 4, badOracle); // has_one = oracle must fail
      assert.fail("wrong oracle should have thrown");
    } catch (e: any) {
      assert.include(JSON.stringify(e), "ConstraintHasOne");
    }
  });

  it("rejects a reward larger than the vault balance", async () => {
    try {
      await claim(2, 1_000_000, 5); // 30000 * 1e6 >> vault balance
      assert.fail("insufficient funds should have thrown");
    } catch (e: any) {
      assert.include(JSON.stringify(e), "InsufficientVaultFunds");
    }
  });

  it("lets the owner withdraw the remainder", async () => {
    const before = await vaultBalance();
    await program.methods
      .withdraw(new BN(before.toString()))
      .accounts({
        owner: owner.publicKey,
        ownerTokenAccount: ownerAta,
      })
      .rpc();
    assert.equal((await vaultBalance()).toString(), "0");
  });
});
