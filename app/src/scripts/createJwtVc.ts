// Use static jose imports again
import { SignJWT, importJWK } from 'jose';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { webcrypto } from 'node:crypto'; // Import webcrypto
import type { JWK } from 'jose';

// Polyfill global crypto if needed
if (typeof globalThis.crypto === 'undefined') {
    console.log("Polyfilling globalThis.crypto for createJwtVc script...");
    globalThis.crypto = webcrypto as any;
}

// --- Configuration ---
const CONFIG_DIR = path.resolve(process.cwd(), 'config');
const PRIVATE_KEY_FILE = path.join(CONFIG_DIR, 'issuer.private.jwk');
const OUTPUT_JWT_FILE = path.join(CONFIG_DIR, 'credential.jwt');

const ISSUER_DID = 'did:web:gov.example';
// Placeholder Subject DID - Replace with actual DID if needed
const SUBJECT_DID = 'did:key:z6Mkh...holder'; 
const VC_TYPE = ["VerifiableCredential", "CitizenshipCredential"];
const NATIONALITY = "FI";
const EXPIRATION_SECONDS = 90 * 24 * 60 * 60; // 90 days

// --- Load Issuer Private Key ---
async function loadIssuerPrivateKey(keyPath: string): Promise<CryptoKey> {
    if (!fs.existsSync(keyPath)) {
        throw new Error(`Issuer private key not found at: ${keyPath}. Run 'npm run create-issuer' first.`);
    }
    const privateJwk = JSON.parse(fs.readFileSync(keyPath, 'utf-8')) as JWK;

    if (privateJwk.kty !== 'RSA' || !privateJwk.alg || privateJwk.alg !== 'RS256') {
         console.warn(`Warning: Issuer private key kty is ${privateJwk.kty} and/or alg is ${privateJwk.alg}. Expecting RSA with RS256 alg.`);
         // Potentially throw error if strict check is needed
    }

    // Ensure the key is importable (has necessary components)
    // TODO: Add more robust validation if needed based on JWK structure
    const importedKey = await importJWK(privateJwk, privateJwk.alg || 'RS256'); 

    // The jose library handles the key type internally for SignJWT.
    // The instanceof check fails in Node.js environments where CryptoKey isn't global.
    /*
    if (!(importedKey instanceof CryptoKey)) {
        throw new Error('Imported key is not a CryptoKey, cannot use for signing.');
    }
    */
   // We also need to adjust the return type promise as importJWK can return Uint8Array
    return importedKey as unknown as CryptoKey; // Cast needed because SignJWT expects CryptoKey for RS256
}

// --- Main Logic ---
async function createJwtVC() {
    console.log("--- Generating JWT Verifiable Credential ---");

    try {
        // 1. Ensure config directory and private key exist
        if (!fs.existsSync(CONFIG_DIR)) {
             throw new Error(`Config directory not found at: ${CONFIG_DIR}. Run 'npm run create-issuer' first.`);
        }
        const privateKey = await loadIssuerPrivateKey(PRIVATE_KEY_FILE);
        console.log("Issuer private key loaded.");

        // 2. Define Timestamps
        const now = Math.floor(Date.now() / 1000);
        const exp = now + EXPIRATION_SECONDS;

        // 3. Define JWT Payload
        const payload = {
            iss: ISSUER_DID,
            sub: SUBJECT_DID,
            nbf: now,
            exp: exp,
            nationality: NATIONALITY,
            vc: {
                "@context": ["https://www.w3.org/2018/credentials/v1"],
                type: VC_TYPE,
                credentialSubject: {
                    id: SUBJECT_DID
                }
            }
        };
        console.log("JWT Payload defined:");
        console.log(JSON.stringify(payload, null, 2));


        // 4. Create and Sign JWT
        console.log("\nSigning JWT with RS256...");
        const jwt = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
            // Note: iss, sub, nbf, exp are already in payload, no need for setIssuer, setSubject etc.
            .setIssuedAt(now) // Add iat claim
            .sign(privateKey);

        console.log("JWT Signed successfully.");

        // 5. Save JWT to file
        console.log(`\nSaving JWT VC to: ${OUTPUT_JWT_FILE}`);
        fs.writeFileSync(OUTPUT_JWT_FILE, jwt);

        console.log("\n--- JWT Verifiable Credential Created Successfully ---");
        console.log(`Saved to: ${OUTPUT_JWT_FILE}`);

    } catch (error) {
        console.error("\nError creating JWT VC:", error);
        process.exitCode = 1;
    }
}

createJwtVC(); 