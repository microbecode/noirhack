use dep::jwt::{JWT}; // Import only JWT struct
// use std::println; // For debugging if needed

// Define constants globally with pub
pub global MAX_DATA_LENGTH: u32 = 900;
pub global MAX_CLAIM_LENGTH: u32 = 100; // Max length for nationality claim (adjust if needed)

// Inputs matching the generated Prover.toml (using storage/len)
fn main(
    // Data inputs
    data_storage: [u8; MAX_DATA_LENGTH], 
    data_len: u32,   
    // Other JWT inputs
    base64_decode_offset: u32,   
    pubkey_modulus_limbs: [u128; 18], 
    redc_params_limbs: [u128; 18],   
    signature_limbs: [u128; 18],     
    // Expected claim inputs (public, using storage/len)
    expected_nationality_storage: [u8; MAX_CLAIM_LENGTH],
    expected_nationality_len: u32, 
) {
    // Construct BoundedVec for data using new() and push() up to MAX length
    let mut data_vec = BoundedVec::<u8, MAX_DATA_LENGTH>::new();
    for i in 0..MAX_DATA_LENGTH {
        // Only push if index is less than actual length
        if i < data_len {
            data_vec.push(data_storage[i]);
        }
    }

    // Construct BoundedVec for expected_nationality using new() and push() up to MAX length
    let mut expected_nationality_vec = BoundedVec::<u8, MAX_CLAIM_LENGTH>::new();
    for i in 0..MAX_CLAIM_LENGTH {
        // Only push if index is less than actual length
        if i < expected_nationality_len {
            expected_nationality_vec.push(expected_nationality_storage[i]);
        }
    }

    // 1. Initialize JWT instance
    let jwt = JWT::init(
        data_vec, // Pass the constructed BoundedVec
        base64_decode_offset, 
        pubkey_modulus_limbs,
        redc_params_limbs,
        signature_limbs
    );

    // 2. Verify JWT Signature
    jwt.verify();

    // 3. Verify Nationality Claim
    // Pass the constructed BoundedVec for the expected value
    jwt.assert_claim_string("nationality".as_bytes(), expected_nationality_vec);
}
