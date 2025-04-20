import { Resolver } from 'did-resolver';
// Static import for did-method-web removed
// import { getResolver as webResolver } from '@digitalbazaar/did-method-web'; 
import { SDJwtVcInstance } from '@sd-jwt/sd-jwt-vc';
import { Hasher, Signer, SaltGenerator, DisclosureFrame } from '@sd-jwt/types';
import { SignJWT, generateKeyPair, exportJWK, JWK, compactVerify, createRemoteJWKSet } from 'jose';
// Explicitly import Node.js crypto implementations
import { createHash } from 'node:crypto';
import { webcrypto } from 'node:crypto'; // Import webcrypto

// Explicitly polyfill globalThis.crypto for libraries that expect it
// Use type assertion to reconcile Node.js and global type definitions
if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = webcrypto as any; // Using 'as any' for simplicity
}

// --- DID Resolver Setup (Asynchronous) ---

// Promise to hold the initialized resolver
let resolverPromise: Promise<Resolver> | null = null;

async function initializeResolver(): Promise<Resolver> {
  console.log("Initializing DID Resolver asynchronously...");
  // Dynamically import the CJS module
  const { getResolver } = await import('@digitalbazaar/did-method-web');
  const webResolverMap = getResolver(); // Get the resolver configuration
  const resolver = new Resolver({
    ...webResolverMap
  });
  console.log("DID Resolver initialized.");
  return resolver;
}

// Function to get the resolver instance (initializes on first call)
function getResolverInstance(): Promise<Resolver> {
    if (!resolverPromise) {
        resolverPromise = initializeResolver();
    }
    return resolverPromise;
}

// Example usage:
async function resolveDidWeb(didUrl: string) {
  try {
    // Get the resolver, initializing it if needed
    const resolver = await getResolverInstance(); 
    console.log(`Resolving ${didUrl}...`);
    const didResolutionResult = await resolver.resolve(didUrl);
    console.log('DID Resolution Result:', didResolutionResult);

    if (didResolutionResult.didDocument) {
      console.log('Verification Methods:', didResolutionResult.didDocument.verificationMethod);
    }
    return didResolutionResult;
  } catch (error) {
    console.error(`Error resolving ${didUrl}:`, error);
    throw error;
  }
}

// Example call (replace with a real did:web if available, or this will fail)
// For testing, you might use a known public did:web like did:web:digitalbazaar.com
// resolveDidWeb('did:web:issuer.example.com'); 
// resolveDidWeb('did:web:digitalbazaar.com'); 


// --- SD-JWT VC Issuance Setup ---

// Mock Issuer Configuration (Replace with actual key management)
let issuerKeyPair: { publicKey: JWK, privateKey: CryptoKey };
let issuerDid: string = 'did:web:issuer.example.com'; // Example issuer DID

async function initializeIssuerKeys() {
  if (!issuerKeyPair) {
    const { publicKey, privateKey } = await generateKeyPair('ES256'); // Using ES256 for example
    issuerKeyPair = { publicKey: await exportJWK(publicKey), privateKey };
    console.log('Generated Issuer Key Pair (JWK Public):', issuerKeyPair.publicKey);
  }
}

// Simple Sha-256 Hasher Implementation (Handles string or ArrayBuffer, returns Uint8Array)
const hasher: Hasher = async (data: string | ArrayBuffer) => {
  const inputData = typeof data === 'string' ? data : Buffer.from(data);
  const digest = createHash('sha256').update(inputData).digest();
  // Return raw bytes as Buffer/Uint8Array
  return digest; 
};

// Signer Implementation using jose (Returns base64url signature string)
const signer: Signer = async (data: string | Uint8Array) => {
  if (!issuerKeyPair) await initializeIssuerKeys();

  // --- THIS IS STILL A SEMI-MOCK --- 
  // Assuming 'data' is the raw UTF-8 string or bytes of the payload to be signed directly.
  // Standard JWS signing includes protected headers.
  // A real implementation MUST verify exactly what the library passes as 'data'.
  console.warn("Using semi-mock signer - assumes input data is payload, verify library specifics!");
  
  const protectedHeader = { alg: 'ES256' };
  const payloadToSign = { data: (typeof data === 'string' ? data : Buffer.from(data).toString('utf8')).substring(0, 50) }; // Dummy payload

  const jws = await new SignJWT(payloadToSign)
    .setProtectedHeader(protectedHeader)
    .setIssuedAt()
    .sign(issuerKeyPair.privateKey);

  const signature = jws.split('.')[2];
  // Return the base64url signature string directly
  return signature;
  // --- END MOCK --- 
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
  signer: signer,        // Provide the signing function
  signAlg: 'ES256',      // Specify signing algorithm
  hasher: hasher,        // Provide the hashing function
  hashAlg: 'sha-256',
  saltGenerator: saltGenerator, // Provide salt generation
  // verifier: verifier // Add verifier callback if needed later
});

// Function to issue a new Identity Credential
async function issueIdentityCredential(subjectDid: string, nationality: string) {
  await initializeIssuerKeys(); // Ensure keys are generated

  const now = Math.floor(Date.now() / 1000);
  const expiration = now + (365 * 24 * 60 * 60); // Expires in 1 year

  // 1. Define Claims
  const claims = {
    iss: issuerDid,
    sub: subjectDid,
    iat: now,
    exp: expiration,
    vct: "IdentityCredential", // Example type
    nationality: nationality, // The claim we want to make selectively disclosable
    // Add other claims as needed
    // address: {
    //   street_address: "123 Main St",
    //   locality: "Anytown",
    //   region: "Anystate",
    //   country: "US" 
    // },
    vc: { // Include standard VC fields for better interoperability
      "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://w3id.org/sd-jwt-vc/v1" // Specific context for SD-JWT-VC
      ],
      "type": ["VerifiableCredential", "IdentityCredential"],
      "issuer": issuerDid,
      "issuanceDate": new Date(now * 1000).toISOString(),
      "expirationDate": new Date(expiration * 1000).toISOString(),
      "credentialSubject": {
        "id": subjectDid
        // Selectively disclosed claims like nationality are NOT duplicated here
      }
    }
  };

  // 2. Define Disclosure Frame
  const disclosureFrame: DisclosureFrame<typeof claims> = {
    _sd: ['nationality'], // Only 'nationality' is selectively disclosable
    // Example for nested disclosure:
    // address: { _sd: ['street_address', 'locality'] } // country and region would always be disclosed
    vc: { // Also mark claims within the vc structure if needed
        credentialSubject: { _sd: [] } // Assuming nothing inside subject is SD initially
    }

  };

  console.log("Issuing SD-JWT VC with claims:", claims);
  console.log("Disclosure Frame:", disclosureFrame);

  try {
    // 3. Issue Credential
    const sdJwtVc = await sdJwtVcInstance.issue(claims, disclosureFrame);
    console.log("\nIssued SD-JWT VC:\n", sdJwtVc);
    return sdJwtVc;
  } catch (error) {
    console.error("Error issuing SD-JWT VC:", error);
    throw error;
  }
}

// --- Example Call ---
// (This will run when the module is loaded, for demonstration)
// Need to wrap example calls in an async context or handle the promise
async function runExampleIssuance() {
  try {
    // Although issueIdentityCredential doesn't directly use the resolver *yet*,
    // it's good practice to ensure dependent async setup might be complete.
    // We could await getResolverInstance() here if needed in the future.
    await initializeIssuerKeys(); // Ensure keys are ready first
    console.log("Running example issuance...");
    await issueIdentityCredential('did:example:subject456', 'FI');
    console.log("Example issuance function finished.");
  } catch (e) {
    console.error("Example issuance failed:", e);
  }

  // Example of using the resolver after setup
  // try {
  //   console.log("Running example DID resolution...");
  //   await resolveDidWeb('did:web:digitalbazaar.com');
  //   console.log("Example DID resolution finished.");
  // } catch(e) {
  //    console.error("Example resolution failed:", e);
  // }
}

runExampleIssuance(); // Execute the async example function


// --- Exports ---
// Export the functions, resolver access needs to use getResolverInstance()
export { getResolverInstance, resolveDidWeb, issueIdentityCredential, initializeIssuerKeys }; 