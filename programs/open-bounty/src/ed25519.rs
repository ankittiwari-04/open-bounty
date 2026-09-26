use anchor_lang::prelude::*;

use crate::error::OpenBountyError;

const SIGNATURE_OFFSETS_START: usize = 2;
const SIGNATURE_OFFSETS_SIZE: usize = 14;
const PUBKEY_SIZE: usize = 32;
const SIGNATURE_SIZE: usize = 64;
const CURRENT_INSTRUCTION_SENTINEL: u16 = u16::MAX;

fn read_u16(data: &[u8], offset: usize) -> Result<u16> {
    let bytes = data
        .get(offset..offset + 2)
        .ok_or(OpenBountyError::InvalidEd25519Data)?;
    Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
}

fn checked_slice(data: &[u8], offset: u16, length: usize) -> Result<&[u8]> {
    let start = usize::from(offset);
    let end = start
        .checked_add(length)
        .ok_or(OpenBountyError::InvalidEd25519Data)?;
    require!(end <= data.len(), OpenBountyError::InvalidEd25519Data);
    Ok(&data[start..end])
}

/// Validates the raw instruction data of a native Ed25519 verify
/// instruction and confirms it verified exactly one signature, by
/// `expected_pubkey`, over exactly `expected_message` — with every
/// offset/index field checked to point inside this same instruction's
/// own data. The signature's cryptographic validity is not re-checked
/// here: the runtime already rejected the transaction before our
/// program ran if that signature were invalid. This function only
/// confirms the *contents* the precompile verified are the ones we
/// actually expect, not some other data smuggled in via crafted offsets.
pub fn verify_ed25519_instruction_data(
    data: &[u8],
    expected_pubkey: &Pubkey,
    expected_message: &[u8],
) -> Result<()> {
    require!(data.len() >= SIGNATURE_OFFSETS_START, OpenBountyError::InvalidEd25519Data);

    let num_signatures = data[0];
    require!(num_signatures == 1, OpenBountyError::MultipleSignatures);

    let offsets_start = SIGNATURE_OFFSETS_START;
    require!(
        data.len() >= offsets_start + SIGNATURE_OFFSETS_SIZE,
        OpenBountyError::InvalidEd25519Data
    );

    let signature_offset = read_u16(data, offsets_start)?;
    let signature_instruction_index = read_u16(data, offsets_start + 2)?;
    let public_key_offset = read_u16(data, offsets_start + 4)?;
    let public_key_instruction_index = read_u16(data, offsets_start + 6)?;
    let message_data_offset = read_u16(data, offsets_start + 8)?;
    let message_data_size = read_u16(data, offsets_start + 10)?;
    let message_instruction_index = read_u16(data, offsets_start + 12)?;

    require!(
        signature_instruction_index == CURRENT_INSTRUCTION_SENTINEL,
        OpenBountyError::Ed25519IndexSpoof
    );
    require!(
        public_key_instruction_index == CURRENT_INSTRUCTION_SENTINEL,
        OpenBountyError::Ed25519IndexSpoof
    );
    require!(
        message_instruction_index == CURRENT_INSTRUCTION_SENTINEL,
        OpenBountyError::Ed25519IndexSpoof
    );

    // Bounds-check every offset before slicing (checked_slice guards
    // against both overflow and out-of-range reads).
    let _signature_bytes = checked_slice(data, signature_offset, SIGNATURE_SIZE)?;
    let public_key_bytes = checked_slice(data, public_key_offset, PUBKEY_SIZE)?;
    let message_bytes = checked_slice(
        data,
        message_data_offset,
        usize::from(message_data_size),
    )?;

    require!(
        public_key_bytes == expected_pubkey.as_ref(),
        OpenBountyError::WrongAttestor
    );
    require!(
        message_bytes == expected_message,
        OpenBountyError::AttestationMismatch
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Hand-builds a well-formed single-signature Ed25519 instruction
    /// data buffer, matching the real precompile's layout, for testing
    /// our parser without needing a real signature or transaction.
    fn build_valid_data(pubkey: &Pubkey, message: &[u8]) -> Vec<u8> {
        let mut data = vec![0u8; 16];
        data[0] = 1; // num_signatures
        data[1] = 0; // padding

        let signature_offset: u16 = 16;
        let public_key_offset: u16 = signature_offset + SIGNATURE_SIZE as u16;
        let message_data_offset: u16 = public_key_offset + PUBKEY_SIZE as u16;
        let message_data_size: u16 = message.len() as u16;

        data[2..4].copy_from_slice(&signature_offset.to_le_bytes());
        data[4..6].copy_from_slice(&CURRENT_INSTRUCTION_SENTINEL.to_le_bytes());
        data[6..8].copy_from_slice(&public_key_offset.to_le_bytes());
        data[8..10].copy_from_slice(&CURRENT_INSTRUCTION_SENTINEL.to_le_bytes());
        data[10..12].copy_from_slice(&message_data_offset.to_le_bytes());
        data[12..14].copy_from_slice(&message_data_size.to_le_bytes());
        data[14..16].copy_from_slice(&CURRENT_INSTRUCTION_SENTINEL.to_le_bytes());

        data.extend_from_slice(&[9u8; SIGNATURE_SIZE]); // fake signature bytes
        data.extend_from_slice(pubkey.as_ref());
        data.extend_from_slice(message);

        data
    }

    #[test]
    fn valid_instruction_passes() {
        let pubkey = Pubkey::new_unique();
        let message = b"hello attestation".to_vec();
        let data = build_valid_data(&pubkey, &message);

        assert!(verify_ed25519_instruction_data(&data, &pubkey, &message).is_ok());
    }

    #[test]
    fn wrong_pubkey_fails() {
        let pubkey = Pubkey::new_unique();
        let other_pubkey = Pubkey::new_unique();
        let message = b"hello".to_vec();
        let data = build_valid_data(&pubkey, &message);

        assert!(verify_ed25519_instruction_data(&data, &other_pubkey, &message).is_err());
    }

    #[test]
    fn wrong_message_fails() {
        let pubkey = Pubkey::new_unique();
        let message = b"hello".to_vec();
        let data = build_valid_data(&pubkey, &message);

        assert!(verify_ed25519_instruction_data(&data, &pubkey, b"goodbye").is_err());
    }

    #[test]
    fn multiple_signatures_fails() {
        let pubkey = Pubkey::new_unique();
        let message = b"hello".to_vec();
        let mut data = build_valid_data(&pubkey, &message);
        data[0] = 2; // claim two signatures

        assert!(verify_ed25519_instruction_data(&data, &pubkey, &message).is_err());
    }

    #[test]
    fn signature_index_spoof_fails() {
        let pubkey = Pubkey::new_unique();
        let message = b"hello".to_vec();
        let mut data = build_valid_data(&pubkey, &message);
        data[4..6].copy_from_slice(&0u16.to_le_bytes()); // points at instruction 0, not "current"

        assert!(verify_ed25519_instruction_data(&data, &pubkey, &message).is_err());
    }

    #[test]
    fn public_key_index_spoof_fails() {
        let pubkey = Pubkey::new_unique();
        let message = b"hello".to_vec();
        let mut data = build_valid_data(&pubkey, &message);
        data[8..10].copy_from_slice(&0u16.to_le_bytes());

        assert!(verify_ed25519_instruction_data(&data, &pubkey, &message).is_err());
    }

    #[test]
    fn message_index_spoof_fails() {
        let pubkey = Pubkey::new_unique();
        let message = b"hello".to_vec();
        let mut data = build_valid_data(&pubkey, &message);
        data[14..16].copy_from_slice(&0u16.to_le_bytes());

        assert!(verify_ed25519_instruction_data(&data, &pubkey, &message).is_err());
    }

    #[test]
    fn out_of_bounds_offset_fails() {
        let pubkey = Pubkey::new_unique();
        let message = b"hello".to_vec();
        let mut data = build_valid_data(&pubkey, &message);
        // Claim the public key lives far past the end of the buffer.
        data[6..8].copy_from_slice(&60000u16.to_le_bytes());

        assert!(verify_ed25519_instruction_data(&data, &pubkey, &message).is_err());
    }

    #[test]
    fn malformed_short_data_fails_safely() {
        let pubkey = Pubkey::new_unique();
        let data = vec![1u8, 0u8, 3u8]; // way too short to contain valid offsets

        assert!(verify_ed25519_instruction_data(&data, &pubkey, b"anything").is_err());
    }
}

/// Fetches the instruction immediately preceding the current one and
/// confirms it is the native Ed25519 verify program. Using strict
/// adjacency (current_index - 1), not just "somewhere earlier in the
/// transaction", stops an attacker from placing an unrelated valid
/// Ed25519 instruction anywhere else and pointing our checks at it.
pub fn get_preceding_ed25519_instruction_data(
    instructions_sysvar: &AccountInfo,
) -> Result<Vec<u8>> {
    let current_index = solana_instructions_sysvar::load_current_index_checked(instructions_sysvar)
        .map_err(|_| OpenBountyError::InvalidEd25519Data)?;

    require!(current_index > 0, OpenBountyError::MissingEd25519Instruction);

    let preceding_index = (current_index - 1) as usize;
    let preceding_ix =
        solana_instructions_sysvar::load_instruction_at_checked(preceding_index, instructions_sysvar)
            .map_err(|_| OpenBountyError::InvalidEd25519Data)?;

    require_keys_eq!(
        preceding_ix.program_id,
        solana_sdk_ids::ed25519_program::ID,
        OpenBountyError::MissingEd25519Instruction
    );

    Ok(preceding_ix.data)
}
