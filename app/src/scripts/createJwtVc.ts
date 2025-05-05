// Use static jose imports again
import { SignJWT } from 'jose';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { webcrypto } from 'node:crypto'; // Import webcrypto
// Removed unused import from @sd-jwt/sd-jwt-vc
// import { createVerifiableCredentialJwt } from '@sd-jwt/sd-jwt-vc';
// Add .js extension to identityService import
import { issuerDid, issuerKid, getPrivateKey } from '../identity/identityService.js'; 

// Polyfill global crypto if needed
if (typeof globalThis.crypto === 'undefined') {
    console.log("Polyfilling globalThis.crypto for createJwtVc script...");
    globalThis.crypto = webcrypto as any;
}

// --- Configuration ---
const CONFIG_DIR = path.resolve(process.cwd(), 'config');
// Removed unused PRIVATE_KEY_FILE constant
// const PRIVATE_KEY_FILE = path.join(CONFIG_DIR, 'issuer.private.jwk');
const OUTPUT_JWT_FILE = path.join(CONFIG_DIR, 'credential.jwt');

// Use issuerDid from identityService, but keep local overrides if needed
// const ISSUER_DID = 'did:web:gov.example'; 
// Placeholder Subject DID - Replace with actual DID if needed
const SUBJECT_DID = 'did:key:z6Mkh...holder'; 
const VC_TYPE = ["VerifiableCredential", "CitizenshipCredential"];
const NATIONALITY = "FIN";
const EXPIRATION_SECONDS = 90 * 24 * 60 * 60; // 90 days

// --- Load Issuer Private Key --- (REMOVED UNUSED FUNCTION)
/*
async function loadIssuerPrivateKey(keyPath: string): Promise<KeyObject> { 
    // ... (function body removed)
}
*/

// --- Main Logic ---
async function createJwtVC() {
    console.log("--- Generating JWT Verifiable Credential ---");

    try {
        // 1. Get Issuer DID/KID and Private Key from the identity service
        console.log("[createJwtVc] Getting issuer details and private key...");
        // Use the imported values directly
        const privateKey = await getPrivateKey(); 

        // Check imported values
        if (!issuerDid || typeof issuerDid !== 'string') { 
             throw new Error("Could not retrieve a valid issuer DID string from identity service.");
        }
         if (!issuerKid || typeof issuerKid !== 'string') { 
             throw new Error("Could not retrieve a valid issuer KID string from identity service.");
         }
        if (!privateKey) {
            throw new Error("Could not retrieve private key from identity service.");
        }
        console.log(`[createJwtVc] Using Issuer DID: ${issuerDid}, KID: ${issuerKid}`);

        // 2. Define Timestamps
        const now = Math.floor(Date.now() / 1000);
        const exp = now + EXPIRATION_SECONDS;

        // 3. Define JWT Payload
        const payload = {
            iss: issuerDid, // Use the retrieved issuer DID string
            sub: SUBJECT_DID,
            nbf: now,
            exp: exp,
            // given_name: "Alice",
            // family_name: "Smith",
            // birthdate: "1990-05-15",
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