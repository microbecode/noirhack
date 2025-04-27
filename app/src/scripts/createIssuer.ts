// Use static jose imports again
import { generateKeyPair, exportJWK } from 'jose';
import * as fs from 'node:fs';
import * as path from 'node:path';
// Remove ESM-specific imports when targeting CJS
// import { fileURLToPath } from 'node:url'; 
import { webcrypto } from 'node:crypto'; // Import webcrypto

// Polyfill global crypto if needed
if (typeof globalThis.crypto === 'undefined') {
    console.log("Polyfilling globalThis.crypto for createIssuer script...");
    globalThis.crypto = webcrypto as any; 
}

// CJS doesn't need import.meta.url; __dirname is available globally
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename); // __dirname is global in CJS

// Configuration
// Use process.cwd() to ensure the config directory is always created in the project root
const configDir = path.resolve(process.cwd(), 'config'); 
const privateKeyFile = path.join(configDir, 'issuer.private.jwk');
const didDocumentFile = path.join(configDir, 'issuer.did.json');
const issuerDid = 'did:web:gov.example';
const issuerKid = issuerDid + '#key-1';

async function createIssuerConfig() {
  console.log("--- Generating Issuer Keys and DID Document ---");

  try {
    // 1. Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      console.log(`Creating config directory: ${configDir}`);
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 2. Generate Key Pair
    console.log("Generating RS256 key pair...");
    // Use static functions
    const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
    console.log("Key pair generated.");

    // 3. Export Keys as JWK
    const publicJwk = await exportJWK(publicKey);
    const privateJwk = await exportJWK(privateKey);
    // Add kid to both JWKs (optional for private, good practice for public in DID doc)
    publicJwk.kid = issuerKid;
    privateJwk.kid = issuerKid;

    // 4. Save Private Key JWK
    console.log(`Saving private key to: ${privateKeyFile}`);
    fs.writeFileSync(privateKeyFile, JSON.stringify(privateJwk, null, 2));

    // 5. Create DID Document
    console.log("Creating DID Document...");
    const didDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: issuerDid,
      verificationMethod: [
        {
          id: issuerKid,
          type: 'JsonWebKey2020',
          controller: issuerDid,
          publicKeyJwk: publicJwk, // Include the public JWK
        },
      ],
      authentication: [issuerKid],
      assertionMethod: [issuerKid],
    };

    // 6. Save DID Document
    console.log(`Saving DID Document to: ${didDocumentFile}`);
    fs.writeFileSync(didDocumentFile, JSON.stringify(didDocument, null, 2));

    console.log("--- Issuer Configuration Created Successfully ---");
    console.log(`Issuer DID: ${issuerDid}`);
    console.log(`Key ID (kid): ${issuerKid}`);
    console.log(`Private Key saved to: ${privateKeyFile}`);
    console.log(`DID Document saved to: ${didDocumentFile}`);

  } catch (error) {
    console.error("Error creating issuer configuration:", error);
    process.exitCode = 1;
  }
}

createIssuerConfig();
