// Real on-chain client for the deployed native KZP circle program (devnet).
// Drives the SAME instructions as playground-native/client/demo.mjs, but from the browser
// using a connected Phantom wallet — so the "Make a real deposit" button produces an actual
// devnet transaction with a clickable explorer link.
//
// Native program = no IDL: every account meta and the Circle byte layout are hand-built here,
// mirroring playground-native/src/lib.rs exactly.

import { Buffer } from "buffer";
// spl-token references a global Buffer; Next.js doesn't polyfill it in the browser.
if (typeof (globalThis as { Buffer?: unknown }).Buffer === "undefined") {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export const PROGRAM_ID = new PublicKey("6EvXiKocGuqDGQcNR3jFKJutWoVr5Qiips5hm2AfngpV");
export const DEVNET_RPC =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
export const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

const TOKEN_DECIMALS = 6;
const ONE = 1_000_000; // 1 token at 6 decimals

// A minimal Phantom-style provider (also satisfied by Solflare's window.solana).
export interface WalletProvider {
  publicKey: { toBytes(): Uint8Array; toBase58(): string } | null;
  isPhantom?: boolean;
  connect(): Promise<{ publicKey: { toBytes(): Uint8Array } }>;
  signTransaction(tx: Transaction): Promise<Transaction>;
}

export function getProvider(): WalletProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    phantom?: { solana?: WalletProvider };
    solana?: WalletProvider;
  };
  const p = w.phantom?.solana ?? w.solana;
  return p ?? null;
}

const u64le = (n: number): Buffer => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};
const meta = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean) => ({
  pubkey,
  isSigner,
  isWritable,
});

// Instruction builders — account orders mirror lib.rs / demo.mjs exactly.
const ixOpen = (authority: PublicKey, circle: PublicKey, mint: PublicKey) =>
  new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(authority, true, true),
      meta(circle, false, true),
      meta(mint, false, false),
      meta(SystemProgram.programId, false, false),
    ],
    data: Buffer.from([0]),
  });
const ixJoin = (owner: PublicKey, circle: PublicKey, member: PublicKey) =>
  new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(owner, true, true),
      meta(circle, false, false),
      meta(member, false, true),
      meta(SystemProgram.programId, false, false),
    ],
    data: Buffer.from([1]),
  });
const ixDeposit = (
  depositor: PublicKey,
  circle: PublicKey,
  member: PublicKey,
  depositorToken: PublicKey,
  escrow: PublicKey,
  amount: number,
) =>
  new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(depositor, true, true),
      meta(circle, false, true),
      meta(member, false, true),
      meta(depositorToken, false, true),
      meta(escrow, false, true),
      meta(TOKEN_PROGRAM_ID, false, false),
    ],
    data: Buffer.concat([Buffer.from([2]), u64le(amount)]),
  });

const circlePda = (authority: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("circle"), authority.toBuffer()],
    PROGRAM_ID,
  )[0];
const memberPda = (circle: PublicKey, owner: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("member"), circle.toBuffer(), owner.toBuffer()],
    PROGRAM_ID,
  )[0];

export interface DepositResult {
  depositSig: string;
  setupSigs: { label: string; sig: string }[];
  firstTime: boolean;
}

type Logger = (msg: string) => void;

async function signSend(
  conn: Connection,
  provider: WalletProvider,
  wallet: PublicKey,
  tx: Transaction,
  extraSigners: Keypair[] = [],
): Promise<string> {
  tx.feePayer = wallet;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  if (extraSigners.length) tx.partialSign(...extraSigners);
  const signed = await provider.signTransaction(tx);
  const sig = await conn.sendRawTransaction(signed.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

// Make a REAL deposit on devnet. First time for a wallet: mint a demo token, open the
// wallet's own circle, join, deposit. Subsequent clicks: reuse the existing circle/mint and
// just deposit again (so balances actually move on-chain).
export async function realDeposit(
  amountTokens: number,
  log: Logger = () => {},
): Promise<DepositResult> {
  const provider = getProvider();
  if (!provider) throw new Error("No Solana wallet found — install Phantom.");
  const conn = new Connection(DEVNET_RPC, "confirmed");

  const resp = await provider.connect();
  const wallet = new PublicKey(resp.publicKey.toBytes());
  log(`wallet ${wallet.toBase58().slice(0, 4)}…${wallet.toBase58().slice(-4)} connected`);

  const bal = await conn.getBalance(wallet);
  if (bal < 0.02 * 1e9) {
    log("low devnet SOL — requesting an airdrop…");
    try {
      const a = await conn.requestAirdrop(wallet, 1e9);
      await conn.confirmTransaction(a, "confirmed");
      log("airdrop received");
    } catch {
      throw new Error(
        "Wallet has no devnet SOL and the airdrop faucet is rate-limited. Fund it at https://faucet.solana.com (paste your address, pick Devnet) and click again.",
      );
    }
  }

  const amount = Math.round(amountTokens * ONE);
  const circle = circlePda(wallet);
  const member = memberPda(circle, wallet);
  const setupSigs: { label: string; sig: string }[] = [];

  const circleInfo = await conn.getAccountInfo(circle);
  const firstTime = circleInfo === null;

  if (firstTime) {
    // 1) mint a fresh demo token (wallet is the mint authority) and fund the wallet
    const mint = Keypair.generate();
    const walletAta = getAssociatedTokenAddressSync(mint.publicKey, wallet);
    const rent = await getMinimumBalanceForRentExemptMint(conn);
    log("creating a demo token + minting you 10 of them…");
    const tx1 = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: wallet,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports: rent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(mint.publicKey, TOKEN_DECIMALS, wallet, null),
      createAssociatedTokenAccountInstruction(wallet, walletAta, wallet, mint.publicKey),
      createMintToInstruction(mint.publicKey, walletAta, wallet, 10 * ONE),
    );
    setupSigs.push({ label: "token + mint", sig: await signSend(conn, provider, wallet, tx1, [mint]) });

    // 2) open YOUR circle, create its escrow, join, and make the first deposit
    const escrow = getAssociatedTokenAddressSync(mint.publicKey, circle, true);
    log("opening your circle, joining, and depositing…");
    const tx2 = new Transaction().add(
      ixOpen(wallet, circle, mint.publicKey),
      createAssociatedTokenAccountInstruction(wallet, escrow, circle, mint.publicKey),
      ixJoin(wallet, circle, member),
      ixDeposit(wallet, circle, member, walletAta, escrow, amount),
    );
    const depositSig = await signSend(conn, provider, wallet, tx2);
    return { depositSig, setupSigs, firstTime };
  }

  // Re-deposit into the existing circle: decode its mint (offset 33 in the Circle struct),
  // top up the wallet's tokens, join if needed, deposit.
  const mintPk = new PublicKey(circleInfo!.data.subarray(33, 65));
  const walletAta = getAssociatedTokenAddressSync(mintPk, wallet);
  const escrow = getAssociatedTokenAddressSync(mintPk, circle, true);
  log("depositing again into your existing circle…");

  const tx = new Transaction();
  const ataInfo = await conn.getAccountInfo(walletAta);
  if (!ataInfo)
    tx.add(createAssociatedTokenAccountInstruction(wallet, walletAta, wallet, mintPk));
  tx.add(createMintToInstruction(mintPk, walletAta, wallet, amount));
  const memberInfo = await conn.getAccountInfo(member);
  if (!memberInfo) tx.add(ixJoin(wallet, circle, member));
  tx.add(ixDeposit(wallet, circle, member, walletAta, escrow, amount));

  const depositSig = await signSend(conn, provider, wallet, tx);
  return { depositSig, setupSigs, firstTime };
}
