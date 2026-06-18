use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

// Placeholder. Run `anchor keys sync` after the first `anchor build`.
declare_id!("11111111111111111111111111111111");

// A contribution circle (esusu / ajo, KZP-flavored). Each deposit splits 50% DOWN to earlier
// members (by share of their deposits) and 50% UP, gifted to the next depositor. The first
// member's down-half seeds a locked floor.
//
// DOWN is settled with a reward-per-share index (acc_per_deposit), the standard staking-
// rewards pattern, so a deposit is O(1) — it never iterates members. Each member's claimable
// from down-flows = deposited * (acc_per_deposit - their checkpoint).
//
// Honest constraint (see README): this is contribution-funded — early and ongoing depositors
// are favored, and it unwinds if deposits stop. That is the inherent ajo risk, on-chain.
const ACC_SCALE: u128 = 1_000_000_000_000;

#[program]
pub mod circle {
    use super::*;

    pub fn open_circle(ctx: Context<OpenCircle>) -> Result<()> {
        let c = &mut ctx.accounts.circle;
        c.authority = ctx.accounts.authority.key();
        c.mint = ctx.accounts.mint.key();
        c.pool_total = 0;
        c.acc_per_deposit = 0;
        c.floor = 0;
        c.up_reserve = 0;
        c.bump = ctx.bumps.circle;
        Ok(())
    }

    pub fn join(ctx: Context<Join>) -> Result<()> {
        let m = &mut ctx.accounts.member;
        m.circle = ctx.accounts.circle.key();
        m.owner = ctx.accounts.owner.key();
        m.deposited = 0;
        m.reward_checkpoint = ctx.accounts.circle.acc_per_deposit; // earn only future flows
        m.balance = 0;
        m.bump = ctx.bumps.member;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, CircleError::InvalidAmount);

        // 1. settle the depositor's accrued down-flows up to now
        let acc = ctx.accounts.circle.acc_per_deposit;
        {
            let m = &mut ctx.accounts.member;
            let pending = (m.deposited as u128)
                .checked_mul(acc - m.reward_checkpoint)
                .ok_or(CircleError::MathOverflow)?
                / ACC_SCALE;
            m.balance = m.balance.checked_add(pending as u64).ok_or(CircleError::MathOverflow)?;
            // 2. the UP gift: receive the reserve left by the previous depositor
            m.balance = m.balance.checked_add(ctx.accounts.circle.up_reserve).ok_or(CircleError::MathOverflow)?;
        }

        // pull the deposit into escrow
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor_token_account.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount,
        )?;

        let down = amount / 2;
        let up = amount - down;
        let prior = ctx.accounts.member.deposited;

        let c = &mut ctx.accounts.circle;
        c.up_reserve = 0; // consumed by the gift above
        // 3. DOWN: credit OTHER members (denominator excludes this depositor's own prior stake)
        let other_total = c.pool_total - prior as u128;
        if other_total > 0 {
            c.acc_per_deposit = c
                .acc_per_deposit
                .checked_add((down as u128).checked_mul(ACC_SCALE).ok_or(CircleError::MathOverflow)? / other_total)
                .ok_or(CircleError::MathOverflow)?;
        } else {
            c.floor = c.floor.checked_add(down).ok_or(CircleError::MathOverflow)?;
        }
        // 4. UP: held for the next depositor
        c.up_reserve = up;
        c.pool_total = c.pool_total.checked_add(amount as u128).ok_or(CircleError::MathOverflow)?;

        let new_acc = c.acc_per_deposit;
        let m = &mut ctx.accounts.member;
        m.deposited = m.deposited.checked_add(amount).ok_or(CircleError::MathOverflow)?;
        m.reward_checkpoint = new_acc; // this deposit earns only FUTURE down-flows

        emit!(Deposited { member: m.owner, amount, down, up });
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        // settle then pay out the full claimable balance
        let acc = ctx.accounts.circle.acc_per_deposit;
        let payout;
        {
            let m = &mut ctx.accounts.member;
            let pending = (m.deposited as u128)
                .checked_mul(acc - m.reward_checkpoint)
                .ok_or(CircleError::MathOverflow)?
                / ACC_SCALE;
            m.balance = m.balance.checked_add(pending as u64).ok_or(CircleError::MathOverflow)?;
            m.reward_checkpoint = acc;
            payout = m.balance;
        }
        require!(payout > 0, CircleError::NothingToWithdraw);
        require!(ctx.accounts.escrow.amount >= payout, CircleError::InsufficientEscrow);

        let authority = ctx.accounts.circle.authority;
        let bump = ctx.accounts.circle.bump;
        let seeds: &[&[u8]] = &[b"circle", authority.as_ref(), &[bump]];
        let signer = &[seeds];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: ctx.accounts.circle.to_account_info(),
                },
                signer,
            ),
            payout,
        )?;
        ctx.accounts.member.balance = 0;
        emit!(Withdrawn { member: ctx.accounts.member.owner, amount: payout });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct OpenCircle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(init, payer = authority, space = 8 + Circle::INIT_SPACE, seeds = [b"circle", authority.key().as_ref()], bump)]
    pub circle: Account<'info, Circle>,
    #[account(init, payer = authority, associated_token::mint = mint, associated_token::authority = circle)]
    pub escrow: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Join<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub circle: Account<'info, Circle>,
    #[account(init, payer = owner, space = 8 + Member::INIT_SPACE, seeds = [b"member", circle.key().as_ref(), owner.key().as_ref()], bump)]
    pub member: Account<'info, Member>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(mut, seeds = [b"circle", circle.authority.as_ref()], bump = circle.bump)]
    pub circle: Account<'info, Circle>,
    #[account(mut, seeds = [b"member", circle.key().as_ref(), depositor.key().as_ref()], bump = member.bump)]
    pub member: Account<'info, Member>,
    #[account(mut)]
    pub depositor_token_account: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = circle.mint, associated_token::authority = circle)]
    pub escrow: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"circle", circle.authority.as_ref()], bump = circle.bump)]
    pub circle: Account<'info, Circle>,
    #[account(mut, seeds = [b"member", circle.key().as_ref(), owner.key().as_ref()], bump = member.bump)]
    pub member: Account<'info, Member>,
    #[account(mut, associated_token::mint = circle.mint, associated_token::authority = circle)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Circle {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub pool_total: u128,
    pub acc_per_deposit: u128,
    pub floor: u64,
    pub up_reserve: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Member {
    pub circle: Pubkey,
    pub owner: Pubkey,
    pub deposited: u64,
    pub reward_checkpoint: u128,
    pub balance: u64,
    pub bump: u8,
}

#[event]
pub struct Deposited {
    pub member: Pubkey,
    pub amount: u64,
    pub down: u64,
    pub up: u64,
}

#[event]
pub struct Withdrawn {
    pub member: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum CircleError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Nothing to withdraw")]
    NothingToWithdraw,
    #[msg("Escrow has insufficient funds")]
    InsufficientEscrow,
    #[msg("Math overflow")]
    MathOverflow,
}
