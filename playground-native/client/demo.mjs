// KZP circle — devnet client/demo. Drives the deployed native program end to end with REAL
// transactions: create a token, open a circle, two members join, both deposit (so the cascade
// redistributes), then member 1 withdraws the down-split they earned. Prints explorer links.
//
//   cd playground-native/client
//   npm install
//   RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY" node demo.mjs
//
// Uses your funded keypair at ~/.config/solana/id.json (override with KEYPAIR=/path).

import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  clusterApiUrl, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, createMint, getOrCreateAssociatedTokenAccount, mintTo,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { readFileSync } from "fs";
import os from "os";

const PROGRAM_ID = new PublicKey("6EvXiKocGuqDGQcNR3jFKJutWoVr5Qiips5hm2AfngpV");
const RPC = process.env.RPC_URL || clusterApiUrl("devnet");
const ex = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

const loadPayer = () => {
  const p = process.env.KEYPAIR || `${os.homedir()}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
};
const u64le = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const IX = {
  open: Buffer.from([0]),
  join: Buffer.from([1]),
  deposit: (n) => Buffer.concat([Buffer.from([2]), u64le(n)]),
  withdraw: Buffer.from([3]),
};

const send = async (conn, signers, keys, data) => {
  const tx = new Transaction().add(new TransactionInstruction({ programId: PROGRAM_ID, keys, data }));
  tx.feePayer = signers[0].publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(...signers);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
};
const meta = (pubkey, s, w) => ({ pubkey, isSigner: s, isWritable: w });

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const payer = loadPayer();
  console.log("payer  :", payer.publicKey.toBase58());
  console.log("balance:", (await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL, "SOL\n");

  // a fresh token for the circle, and a second member funded from the payer
  const mint = await createMint(conn, payer, payer.publicKey, null, 6);
  const payerAta = (await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey)).address;
  await mintTo(conn, payer, mint, payerAta, payer.publicKey, 100_000_000);

  const m2 = Keypair.generate();
  {
    // fund member 2 with a little SOL for its account rent + fees
    const t = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: m2.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }));
    t.feePayer = payer.publicKey; t.recentBlockhash = (await conn.getLatestBlockhash()).blockhash; t.sign(payer);
    await conn.confirmTransaction(await conn.sendRawTransaction(t.serialize()), "confirmed");
  }
  const m2Ata = (await getOrCreateAssociatedTokenAccount(conn, payer, mint, m2.publicKey)).address;
  await mintTo(conn, payer, mint, m2Ata, payer.publicKey, 100_000_000);

  // PDAs (must match the program's seeds)
  const [circle] = PublicKey.findProgramAddressSync([Buffer.from("circle"), payer.publicKey.toBuffer()], PROGRAM_ID);
  const escrow = getAssociatedTokenAddressSync(mint, circle, true); // true = PDA owner (off-curve)
  const [memP] = PublicKey.findProgramAddressSync([Buffer.from("member"), circle.toBuffer(), payer.publicKey.toBuffer()], PROGRAM_ID);
  const [memM2] = PublicKey.findProgramAddressSync([Buffer.from("member"), circle.toBuffer(), m2.publicKey.toBuffer()], PROGRAM_ID);

  const sys = SystemProgram.programId;
  const tok = TOKEN_PROGRAM_ID;
  const out = {};

  out.open = await send(conn, [payer],
    [meta(payer.publicKey, true, true), meta(circle, false, true), meta(mint, false, false), meta(sys, false, false)], IX.open);

  // create the circle's escrow token account (owner = circle PDA)
  {
    const t = new Transaction().add(createAssociatedTokenAccountInstruction(payer.publicKey, escrow, circle, mint));
    t.feePayer = payer.publicKey; t.recentBlockhash = (await conn.getLatestBlockhash()).blockhash; t.sign(payer);
    await conn.confirmTransaction(await conn.sendRawTransaction(t.serialize()), "confirmed");
  }

  out.joinPayer = await send(conn, [payer],
    [meta(payer.publicKey, true, true), meta(circle, false, false), meta(memP, false, true), meta(sys, false, false)], IX.join);
  out.joinMember2 = await send(conn, [payer, m2],
    [meta(m2.publicKey, true, true), meta(circle, false, false), meta(memM2, false, true), meta(sys, false, false)], IX.join);

  out.depositPayer = await send(conn, [payer],
    [meta(payer.publicKey, true, true), meta(circle, false, true), meta(memP, false, true), meta(payerAta, false, true), meta(escrow, false, true), meta(tok, false, false)], IX.deposit(5_000_000));
  out.depositMember2 = await send(conn, [payer, m2],
    [meta(m2.publicKey, true, true), meta(circle, false, true), meta(memM2, false, true), meta(m2Ata, false, true), meta(escrow, false, true), meta(tok, false, false)], IX.deposit(5_000_000));

  // member 1 withdraws the down-split earned from member 2's deposit
  out.withdrawPayer = await send(conn, [payer],
    [meta(payer.publicKey, true, true), meta(circle, false, true), meta(memP, false, true), meta(escrow, false, true), meta(payerAta, false, true), meta(tok, false, false)], IX.withdraw);

  console.log("\n=== REAL DEVNET TRANSACTIONS ===");
  for (const [k, s] of Object.entries(out)) console.log(`${k.padEnd(14)} ${ex(s)}`);
  console.log("\nProgram:", `https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
