console.log("identityService.ts: Top of file executing.");

import { Resolver, DIDResolver, DIDResolutionResult, DIDDocument, VerificationMethod } from 'did-resolver';
import { SignJWT, exportJWK, JWK, compactVerify, createRemoteJWKSet, importJWK } from 'jose';
import { createHash } from 'node:crypto';
import { webcrypto } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
// Remove ESM-specific imports when targeting CJS
// import { fileURLToPath } from 'node:url';

console.log("identityService.ts: Imports finished.");

// Polyfill global crypto if needed
if (typeof globalThis.crypto === 'undefined') {
    console.log("Polyfilling globalThis.crypto...");
    globalThis.crypto = webcrypto as any; 
}

// --- Static Issuer Configuration ---
console.log("Loading static issuer configuration...");
// CJS doesn't need import.meta.url; __dirname is available globally
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename); // __dirname is global in CJS

// Correct path relative to compiled file (dist/src/identity/identityService.js) 
// needs to go up two levels to find dist/config
// IMPORTANT: When targeting CJS, __dirname refers to the *output* directory (dist/src/identity)
const configDir = path.join(__dirname, '../../config'); 
const privateKeyPath = path.join(configDir, 'issuer.private.jwk');
const didDocumentPath = path.join(configDir, 'issuer.did.json'); // Path to DID document

// Initialize with placeholders, will be overwritten by config
let issuerDid: string | null = null; 
let issuerKid: string | null = null;
let issuerPrivateKeyPromise: Promise<CryptoKey>;

// Load DID Document first to get issuerDid and issuerKid
try {
    console.log(`Reading DID document from: ${didDocumentPath}`);
    const didDocumentString = fs.readFileSync(didDocumentPath, 'utf-8');
    console.log("DID document file read successfully.");
    const didDocument: DIDDocument | null = JSON.parse(didDocumentString);
    console.log("DID document JSON parsed successfully.");

    if (!didDocument || !didDocument.id || !didDocument.verificationMethod || didDocument.verificationMethod.length === 0) {
        throw new Error("Parsed DID document is invalid or missing required fields (id, verificationMethod).");
    }

    issuerDid = didDocument.id;
    // Assume the first verification method contains the key ID we need
    const firstKey = didDocument.verificationMethod[0];
    if (!firstKey || !firstKey.id) {
        throw new Error("First verification method in DID document is missing or invalid.");
    }
    issuerKid = firstKey.id; // Get the kid from the DID document

    console.log(`Successfully loaded Issuer DID: ${issuerDid}`);
    console.log(`Successfully loaded Issuer KID: ${issuerKid}`);

} catch (error) {
    console.error(`Failed to load or parse issuer DID document from ${didDocumentPath}:`, error);
    // If DID doc fails, we can't proceed reliably with key loading matching
    issuerPrivateKeyPromise = Promise.reject(new Error(`DID document loading failed: ${error}`));
    // Rethrow or handle appropriately - perhaps exit if issuer DID is critical
    throw new Error("Cannot proceed without valid issuer DID document.");
}

// Now load the Private Key, using the loaded issuerKid for potential checks
try {
    if (!issuerKid) { // This check helps type inference later
        throw new Error("Cannot load private key without a valid issuerKid from DID document.");
    }
    console.log(`Reading private key from: ${privateKeyPath}`);
    const privateJwkString = fs.readFileSync(privateKeyPath, 'utf-8');
    console.log("Private key file read successfully.");
    const loadedPrivateJwk: JWK | null = JSON.parse(privateJwkString);
    console.log("Private key JSON parsed successfully.");

    if (!loadedPrivateJwk) {
        throw new Error("Parsed Private JWK is null or invalid.");
    }
    
    // Check if JWK kid matches the one from the DID document
    if (loadedPrivateJwk.kid && loadedPrivateJwk.kid !== issuerKid) {
        console.warn(`JWK kid (${loadedPrivateJwk.kid}) does not match kid from DID document (${issuerKid}). Ensure consistency.`);
        // Optionally, you could throw an error here if they MUST match
        // issuerKid = loadedPrivateJwk.kid; // Or decide which one takes precedence
    }
    // If JWK has no kid, assign the one from DID doc.
    if (!loadedPrivateJwk.kid) {
        console.log(`Assigning kid (${issuerKid}) from DID document to loaded JWK.`);
        loadedPrivateJwk.kid = issuerKid; // issuerKid is non-null here due to the check above
    }

    console.log("Attempting to import RSA JWK asynchronously...");
    issuerPrivateKeyPromise = importJWK(loadedPrivateJwk, 'RS256') as Promise<CryptoKey>;
    console.log("importJWK called, promise obtained.");
    
    issuerPrivateKeyPromise.then(
        (resolvedKey) => console.log("Issuer private key import promise RESOLVED.", resolvedKey ? 'Key exists' : 'Key is null/undefined'),
        (rejectReason) => console.error("Issuer private key import promise REJECTED:", rejectReason)
    );
    console.log("Attached .then/.catch handlers to the import promise.");

} catch (error) {
  console.error(`Failed to load or parse issuer private key from ${privateKeyPath}:`, error);
  // Set promise to reject if loading/parsing failed
  issuerPrivateKeyPromise = Promise.reject(new Error(`Private key loading failed: ${error}`)); 
}

// Function to get the loaded private key (awaiting the promise)
async function getPrivateKey(): Promise<CryptoKey> {
    // Check if the promise was successfully initialized
    if (!issuerPrivateKeyPromise) {
        console.error("getPrivateKey: Private key promise was not initialized!");
        throw new Error("Private key promise was not initialized.");
    }
    console.log("getPrivateKey: Awaiting private key promise...");
    try {
        // Await the promise - it will either resolve to the key or reject with an error
        const key = await issuerPrivateKeyPromise;
        console.log("getPrivateKey: Private key promise resolved successfully.");
        if (!key) {
            console.error("getPrivateKey: Resolved key is null or undefined!");
            throw new Error("Loaded private key is invalid after import.");
        }
        console.log("getPrivateKey: Private key ready.");
        return key;
    } catch (err) {
        console.error("getPrivateKey: Error awaiting/resolving private key promise:", err);
        // Re-throw a more specific error if needed, or the original error
        throw new Error(`Failed to load private key: ${err}`); 
    }
}

// --- Standard JWT VC Issuance Setup ---

// Function to issue a new Identity Credential (Standard JWT)
async function issueIdentityCredential(subjectDid: string, nationality: string) {
  console.log("issueIdentityCredential (Standard JWT): Called."); 

  if (typeof issuerDid !== 'string' || typeof issuerKid !== 'string') {
    throw new Error("Issuer DID or KID is not available for credential issuance.");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiration = now + (365 * 24 * 60 * 60); // Expires in 1 year

  // 1. Define Claims 
  const claims = {
    iss: issuerDid, 
    sub: subjectDid,
    iat: now,
    exp: expiration,
    // vct: "IdentityCredential", // Optional standard claim
    nationality: nationality, // Custom claim
    // Simplified VC structure for JWT (SD-JWT structure removed)
    vc: { 
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      "type": ["VerifiableCredential", "IdentityCredential"],
      "issuer": issuerDid, 
      "issuanceDate": new Date(now * 1000).toISOString(),
      "expirationDate": new Date(expiration * 1000).toISOString(),
      "credentialSubject": {
        "id": subjectDid,
        "nationality": nationality // Add claims directly to credentialSubject if desired
      }
    }
  };

  // 2. Define Protected Header (specify RS256)
  const protectedHeader = { alg: 'RS256' as const, kid: issuerKid };

  console.log("Issuing Standard JWT VC with claims:", claims);

  try {
    console.log("Attempting to get private key for signing...");
    const privateKey = await getPrivateKey(); // Get the resolved RSA key
    console.log("Private key obtained.");

    // 3. Issue Credential using jose.SignJWT
    console.log("issueIdentityCredential: BEFORE await new SignJWT(...).sign(...) using RS256");
    const jwt = await new SignJWT(claims)
      .setProtectedHeader(protectedHeader)
      // No setIssuedAt() needed as 'iat' is already in claims
      .sign(privateKey); // Use the loaded RSA private key 
    console.log("issueIdentityCredential: AFTER await new SignJWT(...).sign(...)");

    console.log("\nIssued Standard JWT VC:\n", jwt); 
    return jwt; // Return the compact JWS string

  } catch (error) { // Catch block was missing indentation
    console.error("Error issuing Standard JWT VC:", error);
    throw error;
  }
}

// --- Exports ---
// Export only the needed issuance function and config details
// Ensure issuerDid and issuerKid are potentially string | null if loading can fail
// Or handle errors earlier to guarantee they are strings here.
export { issueIdentityCredential, issuerDid, issuerKid }; 