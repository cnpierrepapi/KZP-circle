import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Circle } from "../target/types/circle";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("circle (deposit cascade)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Circle as Program<Circle>;
  const connection = provider.connection;
  const alice = provider.wallet as anchor.Wallet; // authority + member 1
  const bob = Keypair.generate(); // member 2

  const TEN = 10_000_000; // $10
  let mint: PublicKey;
  let circle: PublicKey;
  let escrow: PublicKey;
  let aliceAta: PublicKey;
  let bobAta: PublicKey;
  let memberA: PublicKey;
  let memberB: PublicKey;

  const bal = async (a: PublicKey) => (await getAccount(connection, a)).amount;

  before(async () => {
    const s = await connection.requestAirdrop(bob.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(s, "confirmed");
    mint = await createMint(connection, alice.payer, alice.publicKey, null, 6);
    aliceAta = (await getOrCreateAssociatedTokenAccount(connection, alice.payer, mint, alice.publicKey)).address;
    bobAta = (await getOrCreateAssociatedTokenAccount(connection, alice.payer, mint, bob.publicKey)).address;
    await mintTo(connection, alice.payer, mint, aliceAta, alice.publicKey, 50_000_000);
    await mintTo(connection, alice.payer, mint, bobAta, alice.publicKey, 50_000_000);
    [circle] = PublicKey.findProgramAddressSync([Buffer.from("circle"), alice.publicKey.toBuffer()], program.programId);
    escrow = getAssociatedTokenAddressSync(mint, circle, true);
    [memberA] = PublicKey.findProgramAddressSync([Buffer.from("member"), circle.toBuffer(), alice.publicKey.toBuffer()], program.programId);
    [memberB] = PublicKey.findProgramAddressSync([Buffer.from("member"), circle.toBuffer(), bob.publicKey.toBuffer()], program.programId);
  });

  it("opens and both members join", async () => {
    await program.methods.openCircle().accounts({ authority: alice.publicKey, mint }).rpc();
    await program.methods.join().accounts({ owner: alice.publicKey, circle }).rpc();
    await program.methods.join().accounts({ owner: bob.publicKey, circle }).signers([bob]).rpc();
  });

  it("first deposit seeds the locked floor and the up-reserve", async () => {
    await program.methods.deposit(new BN(TEN)).accounts({ depositor: alice.publicKey, circle, depositorTokenAccount: aliceAta }).rpc();
    const c = await program.account.circle.fetch(circle);
    assert.equal(c.floor.toString(), (TEN / 2).toString(), "first down-half is locked as floor");
    assert.equal(c.upReserve.toString(), (TEN / 2).toString(), "up-half waits for the next depositor");
  });

  it("second deposit: newcomer gets the up-gift, earlier member accrues the down-split", async () => {
    await program.methods.deposit(new BN(TEN)).accounts({ depositor: bob.publicKey, circle, depositorTokenAccount: bobAta }).signers([bob]).rpc();
    const b = await program.account.member.fetch(memberB);
    assert.equal(b.balance.toString(), (TEN / 2).toString(), "Bob receives the $5 up-gift on deposit (never $0)");

    // Alice (earlier) has not been settled yet, but her claimable = deposited * Δacc
    const aliceBefore = await bal(aliceAta);
    await program.methods.withdraw().accounts({ owner: alice.publicKey, circle, ownerTokenAccount: aliceAta }).rpc();
    const got = Number(await bal(aliceAta)) - Number(aliceBefore);
    assert.equal(got.toString(), (TEN / 2).toString(), "Alice withdraws the $5 down-split from Bob's deposit");
  });

  it("escrow retains the floor + up-reserve", async () => {
    // two $10 deposits in, Alice withdrew $5 -> escrow should hold 20 - 5 = 15 (= floor 5 + reserve 5 + Bob's claimable 5)
    assert.equal((await bal(escrow)).toString(), (2 * TEN - TEN / 2).toString());
  });
});
