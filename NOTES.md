# Build notes

## Building the on-chain program
Use this, NOT `anchor build`:

    cd programs/open-bounty && cargo build-sbf --arch v1

Reason: Anchor 1.2.0's default `anchor build` targets the sBPF v3
instruction set, but the version of `litesvm` pulled in by the
generated test template (v0.10.0) has a strict ELF parser that
rejects v3-format binaries with a misleading `InvalidAccountData`
error (looks like an account problem, is actually an unsupported
binary format). Building with `--arch v1` produces an older, fully
supported binary format that litesvm parses correctly. This is a
toolchain compatibility issue between Anchor's Solana-version and
litesvm's Solana-version, not a bug in our program logic.

## Running tests
    cargo test -p open-bounty -- --nocapture
