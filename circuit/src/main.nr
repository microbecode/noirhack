// Use path relative to the crate root (src/)
// use jwt::{BoundedVec, JWT}; // Uncomment if needed
// use std::println; // For debugging if needed


// Imports using user suggested paths
use rsa::rsa::verify_sha256_pkcs1v15;
use sha256::sha256_var;
// use bignum::{BigNumParams, RuntimeBigNum}; // Removed 
// Assuming U2048Params exists and has get_params()
// use bignum::fields::U2048::U2048Params; // Keep commented for now
// Import Base64 decoder configuration
use base64::BASE64_DECODER; // Direct import
// Import RuntimeBigNum related types
use bignum::params::BigNumParams; // Assuming struct name is still BigNumParams
use bignum::runtime_bignum::RuntimeBigNum;




// Define constants globally with pub
pub global MAX_SIGNED_DATA_LENGTH: u32 = 440; // Max length for header.payload input
pub global MAX_PAYLOAD_B64_LENGTH: u32 = 300; // Estimate max length for payload base64 input
pub global MAX_CLAIM_LENGTH: u32 = 10; 
// Estimate max decoded length (worst case is roughly 3/4 * MAX_DATA_LENGTH)
pub global MAX_DECODED_LENGTH: u32 = 330; // (440 * 3 / 4)

// Constants for RuntimeBigNum type
pub global RSA_NUM_LIMBS: u32 = 18;
pub global RSA_MOD_BITS: u32 = 2048; // Use 2048 based on noir-jwt example

// Type alias for our RSA RuntimeBigNum (uncommented)
pub type RsaInt = RuntimeBigNum<RSA_NUM_LIMBS, RSA_MOD_BITS>;

// Helper function to compare byte arrays (using compile-time loop bound N)
fn bytes_eq<let N: u32>(a: [u8; N], a_len: u32, b: [u8; N], b_len: u32) -> bool {
    let mut equal = true;
    if a_len != b_len {
        equal = false;
    }
    // Loop up to compile-time N
    for i in 0..N {
        // Only perform comparison if index `i` is within the actual runtime length `a_len`
        if i < a_len {
            // Use safe comparison logic: 
            // - If lengths already mismatched (`equal` is false), this AND won't change `equal`.
            // - If lengths matched, this ANDs `equal` with the result of `a[i] == b[i]`.
            // The `(a_len != b_len)` check inside is redundant now because we check it at the start.
            equal = equal & (a[i] == b[i]); 
        }
    }
    equal
}

fn main(
    // Separate inputs for signed data and payload
    signed_data_storage: [u8; MAX_SIGNED_DATA_LENGTH], 
    signed_data_len: u32,   
    payload_b64_storage: [u8; MAX_PAYLOAD_B64_LENGTH], // Payload base64 part only
    decoded_payload_len: u32, // Actual length of the decoded payload
    // base64_decode_offset: u32, // No longer needed if payload passed separately
    
    // RSA Signature Verification Inputs (using u128 for limbs)
    pubkey_modulus_limbs: [u128; RSA_NUM_LIMBS], // N - Modulus
    signature_limbs: [u128; RSA_NUM_LIMBS],     // S - Signature
    redc_params_limbs: [u128; RSA_NUM_LIMBS],   // Montgomery Reduction Parameter
    
    // Claim Verification Inputs
    expected_nationality_storage: [u8; MAX_CLAIM_LENGTH],
    expected_nationality_len: u32, 
    claim_value_indices: [u32; 2], // Indices relative to *decoded* payload
) {
    // 1. Construct BigNumParams (with boolean)
    let rsa_params = BigNumParams::new(true, pubkey_modulus_limbs, redc_params_limbs); 

    // 2. Verify Signature (RSA-SHA256)
    let data_hash: [u8; 32] = sha256_var(signed_data_storage, signed_data_len as u64);
    
    // Construct RuntimeBigNum for signature using struct literal
    let signature = RsaInt { params: rsa_params, limbs: signature_limbs }; 
    
    // Call RSA verification with public exponent e=65537 as u32 (3 arguments)
    let public_exponent: u32 = 65537; 
    let verification_passed = verify_sha256_pkcs1v15(data_hash, signature, public_exponent);
    assert(verification_passed);

    // 3. Decode Payload Segment 
    // Pass the correct payload input to the decoder
    let decoded_payload_full: [u8; MAX_DECODED_LENGTH] = BASE64_DECODER::decode(payload_b64_storage);
    // let decoded_len = MAX_DECODED_LENGTH; // Placeholder! TODO: Address this // <<< REMOVED Placeholder

    // 4. Verify Claim using indices on decoded data
    let claim_start = claim_value_indices[0];
    let claim_end = claim_value_indices[1];
    
    assert(claim_start <= claim_end);
    // Use the provided decoded_payload_len for bounds check
    assert(claim_end <= decoded_payload_len); // <<< UPDATED Bounds check
    
    let actual_claim_len = claim_end - claim_start;
    assert(actual_claim_len == expected_nationality_len); 

    let mut actual_claim_bytes = [0; MAX_CLAIM_LENGTH];
    for i in 0..MAX_CLAIM_LENGTH {
        if i < actual_claim_len {
            actual_claim_bytes[i] = decoded_payload_full[claim_start + i]; 
        }
    }

    let claim_check_passed = bytes_eq::<MAX_CLAIM_LENGTH>(actual_claim_bytes, actual_claim_len, expected_nationality_storage, expected_nationality_len);
    assert(claim_check_passed);

}
