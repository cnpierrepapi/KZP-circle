#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing Solana CLI"
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
SOLANA_BIN="$HOME/.local/share/solana/install/active_release/bin"
export PATH="$SOLANA_BIN:$PATH"
grep -q 'solana/install/active_release/bin' ~/.bashrc || \
  echo "export PATH=\"$SOLANA_BIN:\$PATH\"" >> ~/.bashrc

echo "==> Installing Anchor via avm (this compiles from source, give it a few minutes)"
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1
avm use 0.30.1

echo "==> Installing web dependencies"
cd web && npm install

echo "==> Done. Try:  cd web && npm run dev    (or)    anchor test"
