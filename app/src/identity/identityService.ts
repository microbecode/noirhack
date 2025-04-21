console.log("identityService.ts: Top of file executing.");

import { Resolver, DIDResolver, DIDResolutionResult, DIDDocument, VerificationMethod } from 'did-resolver';
import { SDJwtVcInstance } from '@sd-jwt/sd-jwt-vc';
import { Hasher, Signer, SaltGenerator, DisclosureFrame } from '@sd-jwt/types';
import { SignJWT, exportJWK, JWK, compactVerify, createRemoteJWKSet, importJWK } from 'jose';
import { createHash } from 'node:crypto';
import { webcrypto } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

console.log("identityService.ts: Imports finished.");

// Polyfill global crypto if needed
if (typeof globalThis.crypto === 'undefined') {
    console.log("Polyfilling globalThis.crypto...");
    globalThis.crypto = webcrypto as any; 
}

// --- Static Issuer Configuration ---
console.log("Loading static issuer configuration...");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); 
// Correct path relative to compiled file (dist/src/identity/identityService.js) 
// needs to go up two levels to find dist/config
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

    console.log("Attempting to import JWK asynchronously...");
    issuerPrivateKeyPromise = importJWK(loadedPrivateJwk, 'ES256') as Promise<CryptoKey>;
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


// --- SD-JWT VC Issuance Setup ---

// Simple Sha-256 Hasher Implementation
const hasher: Hasher = async (data: string | ArrayBuffer) => {
  const inputData = typeof data === 'string' ? data : Buffer.from(data);
  const digest = createHash('sha256').update(inputData).digest();
  return digest; 
};

// Signer Implementation using loaded key
const signer: Signer = async (data: string | Uint8Array) => {
  console.log("signer: Attempting to get private key...");
  const privateKey = await getPrivateKey(); // Get the resolved key
  console.log("signer: Private key obtained.");

  // Assert issuerKid is a string here, as loading should have thrown otherwise
  if (typeof issuerKid !== 'string') {
    throw new Error("Issuer KID is not available for signing.");
  }

  console.warn("Using semi-mock signer - assumes input data is payload, verify library specifics!");
  
  const protectedHeader = { alg: 'ES256', kid: issuerKid }; // Now issuerKid is known to be string
  const payloadToSign = { data: (typeof data === 'string' ? data : Buffer.from(data).toString('utf8')).substring(0, 50) }; 

  console.log("signer: BEFORE await new SignJWT(...).sign(...)");
  const jws = await new SignJWT(payloadToSign)
    .setProtectedHeader(protectedHeader)
    .setIssuedAt()
    .sign(privateKey); // Use the loaded private key 
  console.log("signer: AFTER await new SignJWT(...).sign(...)");

  const signature = jws.split('.')[2];
  console.log("signer: Returning signature.");
  return signature;
};

// Simple Salt Generator
const saltGenerator: SaltGenerator = (length: number) => {
    const salt = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
        salt[i] = Math.floor(Math.random() * 256);
    }
    return salt.toString('base64url');
};

// Instantiate the SD-JWT VC library
const sdJwtVcInstance = new SDJwtVcInstance({
  signer: signer,        
  signAlg: 'ES256',      
  hasher: hasher,        
  hashAlg: 'sha-256',
  saltGenerator: saltGenerator, 
});

// Function to issue a new Identity Credential
async function issueIdentityCredential(subjectDid: string, nationality: string) {
  console.log("issueIdentityCredential: Called."); 

  // Assert issuerDid is a string here, as loading should have thrown otherwise
  if (typeof issuerDid !== 'string') {
    throw new Error("Issuer DID is not available for credential issuance.");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiration = now + (365 * 24 * 60 * 60); // Expires in 1 year

  // 1. Define Claims (issuerDid is now known to be a string)
  const claims = {
    iss: issuerDid, 
    sub: subjectDid,
    iat: now,
    exp: expiration,
    vct: "IdentityCredential", 
    nationality: nationality, 
    vc: { 
      "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://w3id.org/sd-jwt-vc/v1" 
      ],
      "type": ["VerifiableCredential", "IdentityCredential"],
      "issuer": issuerDid, // Now issuerDid is known to be string
      "issuanceDate": new Date(now * 1000).toISOString(),
      "expirationDate": new Date(expiration * 1000).toISOString(),
      "credentialSubject": {
        "id": subjectDid
      }
    }
  };

  // 2. Define Disclosure Frame 
  const disclosureFrame: DisclosureFrame<typeof claims> = {
    _sd: ['nationality'], 
    vc: { 
        credentialSubject: { _sd: [] } 
    }
  };

  console.log("Issuing SD-JWT VC with claims:", claims);
  console.log("Disclosure Frame:", disclosureFrame);

  try {
    // 3. Issue Credential
    console.log("issueIdentityCredential: BEFORE await sdJwtVcInstance.issue(...)");
    const sdJwtVc = await sdJwtVcInstance.issue(claims, disclosureFrame);
    console.log("issueIdentityCredential: AFTER await sdJwtVcInstance.issue(...)");
    console.log("\nIssued SD-JWT VC (includes kid in header):\n", sdJwtVc); 
    return sdJwtVc;
  } catch (error) {
    console.error("Error issuing SD-JWT VC:", error);
    throw error;
  }
}


// --- Exports ---
// Export only the needed issuance function and config details
// Ensure issuerDid and issuerKid are potentially string | null if loading can fail
// Or handle errors earlier to guarantee they are strings here.
export { issueIdentityCredential, issuerDid, issuerKid }; 