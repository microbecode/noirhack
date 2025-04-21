console.log("Loading testIssuance.ts module...");
// testIssuance.ts
// Simple script to test the SD-JWT VC issuance function.

// Import only issueIdentityCredential now
import { issueIdentityCredential } from './identityService.js';

async function runTest() {
  console.log("--- Starting SD-JWT VC Issuance Test ---");
  
  // REMOVED: initializeIssuerKeys call is no longer needed
  // console.log("Initializing issuer keys first...");
  // console.log("Issuer keys initialized.");

  const subjectDid = 'did:example:subject123';
  const nationality = 'DE';
  console.log(`Attempting to issue credential for Subject DID: ${subjectDid} with Nationality: ${nationality}`);

  try {
    // Example: Issue credential for did:example:subject123 with nationality 'DE'
    const credential = await issueIdentityCredential(subjectDid, nationality);
    
    if (credential) {
      console.log("\nSuccessfully Issued SD-JWT VC:");
      console.log(credential); // Log the actual credential string
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