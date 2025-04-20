// testIssuance.ts
// Simple script to test the SD-JWT VC issuance function.

import { issueIdentityCredential } from './identityService';

async function runTest() {
  console.log("--- Starting SD-JWT VC Issuance Test ---");
  try {
    // Example: Issue credential for did:example:subject123 with nationality 'DE'
    const credential = await issueIdentityCredential('did:example:subject123', 'DE');
    
    if (credential) {
      console.log("\n--- Issuance Test Successful ---");
      // Optionally, you could add basic parsing/validation here later
    } else {
      console.error("\n--- Issuance Test Failed: No credential returned ---");
    }
  } catch (error) {
    console.error("\n--- Issuance Test Failed ---");
    console.error(error);
    process.exitCode = 1; // Indicate failure to the shell
  }
  console.log("--- Finished SD-JWT VC Issuance Test ---");
}

runTest(); 