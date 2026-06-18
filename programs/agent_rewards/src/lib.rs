use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

// Placeholder. Run `anchor keys sync` after the first `anchor build` to replace this
// (and the ids in Anchor.toml) with the real, generated program keypair.
declare_id!("11111111111111111111111111111111");

// ─────────────────────────────────────────────────────────────────────────────
// Reward schedule. USDC has 6 decimals, so 1 USDC = 1_000_000 base units.
// `quantity` in claim_reward is the number of COMPLETED UNITS of that work type.
//   FindLeads:     1 unit = 10 lead fetches            -> 0.001  USDC
//   DraftTemplate: 1 unit = 1 email template/industry  -> 0.0025 USDC
//   SendBatch:     1 unit = 1 batch of 20 + 1 follow-up -> 0.03   USDC
// ─────────────────────────────────────────────────────────────────────────────
const REWARD_FIND_LEADS: u64 = 1_000; // 0.001 USDC
const REWARD_DRAFT_TEMPLATE: u64 = 2_500; // 0.0025 USDC
const REWARD_SEND_BATCH: u64 = 30_000; // 0.03 USDC

#[program]
pub mod agent_rewards {
    use super::*;

    /// Create the per-user vault and its USDC escrow token account.
    /// `oracle` = the trusted attestor (your backend) that co-signs reward claims.
    /// `agent`  = the wallet that receives rewards for proven work.
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        oracle: Pubkey,
        agent: Pubkey,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.owner.key();
        vault.oracle = oracle;
        vault.agent = agent;
        vault.usdc_mint = ctx.accounts.usdc_mint.key();
        vault.total_rewarded = 0;
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    /// User funds the escrow with USDC. Owner signs and pays.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, RewardError::InvalidAmount);
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.owner_token_account.to_account_info(),
                    to: ctx.accounts.vault_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    /// Pay the agent for one batch of proven work.
    ///
    /// TRUST MODEL: the `oracle` is a required Signer. Its signature on this
    /// transaction IS the cryptographic proof that the off-chain work happened
    /// (the program cannot observe lead-fetching / drafting / sending itself).
    /// Replay is prevented by init'ing a `WorkClaim` PDA seeded by `nonce`:
    /// re-submitting the same nonce fails with "account already in use".
    pub fn claim_reward(
        ctx: Context<ClaimReward>,
        work_type: u8,
        quantity: u64,
        nonce: u64,
    ) -> Result<()> {
        require!(quantity > 0, RewardError::InvalidAmount);

        let per_unit = match work_type {
            0 => REWARD_FIND_LEADS,
            1 => REWARD_DRAFT_TEMPLATE,
            2 => REWARD_SEND_BATCH,
            _ => return err!(RewardError::UnknownWorkType),
        };
        let reward = per_unit
            .checked_mul(quantity)
            .ok_or(RewardError::MathOverflow)?;

        require!(
            ctx.accounts.vault_token_account.amount >= reward,
            RewardError::InsufficientVaultFunds
        );

        // Record the claim (also the replay guard, via init on the PDA).
        let claim = &mut ctx.accounts.work_claim;
        claim.nonce = nonce;
        claim.work_type = work_type;
        claim.quantity = quantity;
        claim.reward = reward;

        // Pay the agent, signed by the vault PDA.
        let owner_key = ctx.accounts.vault.owner;
        let bump = ctx.accounts.vault.bump;
        let seeds: &[&[u8]] = &[b"vault", owner_key.as_ref(), &[bump]];
        let signer = &[seeds];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.agent_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            reward,
        )?;

        let vault = &mut ctx.accounts.vault;
        vault.total_rewarded = vault
            .total_rewarded
            .checked_add(reward)
            .ok_or(RewardError::MathOverflow)?;
        Ok(())
    }

    /// Owner reclaims unspent escrow.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, RewardError::InvalidAmount);
        require!(
            ctx.accounts.vault_token_account.amount >= amount,
            RewardError::InsufficientVaultFunds
        );
        let owner_key = ctx.accounts.vault.owner;
        let bump = ctx.accounts.vault.bump;
        let seeds: &[&[u8]] = &[b"vault", owner_key.as_ref(), &[bump]];
        let signer = &[seeds];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = owner,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = vault.usdc_mint,
        associated_token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(work_type: u8, quantity: u64, nonce: u64)]
pub struct ClaimReward<'info> {
    /// The trusted attestor. Its signature authorizes the payout.
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref()],
        bump = vault.bump,
        has_one = oracle,
        has_one = agent
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        associated_token::mint = vault.usdc_mint,
        associated_token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: identity enforced by `has_one = agent` on the vault.
    pub agent: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = vault.usdc_mint,
        associated_token::authority = agent
    )]
    pub agent_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = oracle,
        space = 8 + WorkClaim::INIT_SPACE,
        seeds = [b"claim", vault.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub work_claim: Account<'info, WorkClaim>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        associated_token::mint = vault.usdc_mint,
        associated_token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub owner: Pubkey,
    pub oracle: Pubkey,
    pub agent: Pubkey,
    pub usdc_mint: Pubkey,
    pub total_rewarded: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct WorkClaim {
    pub nonce: u64,
    pub work_type: u8,
    pub quantity: u64,
    pub reward: u64,
}

#[error_code]
pub enum RewardError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Unknown work type")]
    UnknownWorkType,
    #[msg("Vault has insufficient USDC for this reward")]
    InsufficientVaultFunds,
    #[msg("Math overflow")]
    MathOverflow,
}
