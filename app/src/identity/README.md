# Noirhack - SD-JWT VC Issuer Example

This demonstrates issuing W3C Verifiable Credentials (VCs) using the Selective Disclosure JWT (SD-JWT) format in TypeScript. It focuses on setting up the necessary libraries and providing a basic issuance flow.

## Features

*   Issues a basic `IdentityCredential` VC with a selectively disclosable `nationality` claim.
*   Uses `did:web` for the issuer DID (currently mocked).
*   Uses the `@sd-jwt/sd-jwt-vc` library for SD-JWT handling.
*   Uses `did-resolver` with `@digitalbazaar/did-method-web` for DID resolution (via dynamic import).
*   Uses `jose` for cryptographic key generation and signing (ES256 algorithm).
*   Includes a test script to verify the issuance process.

## Prerequisites

*   **Node.js**: Version 18 or later recommended. (I used v22.1.0).
*   **Bun** (Recommended) or **npm**: For package management. (I used `bun`).

## Setup

1.  **Clone the repository** (if applicable).
2.  **Navigate to the project directory**:
    ```bash
    cd /Users/fairway-01/Desktop/Development_projects/Noirhack
    ```
3.  **Install dependencies**:
    *   Using Bun:
        ```bash
        cd noirhack/app
        bun install
        ```
    *   Using npm:
        ```bash
        cd noirhack/app
        npm install
        ```
    *Note: The test runner `tsx` is installed as a dev dependency.*
4.  **Return to the workspace root**:
    ```bash
    cd ../..
    ```
    *(Or ensure you are in `/Users/fairway-01/Desktop/Development_projects/Noirhack`)*

## Running the Issuance Test

To test the credential issuance flow, run the test script using `tsx`:

```bash
npx tsx noirhack/app/src/identity/testIssuance.ts
```

This command will:
1.  Initialize the issuer keys (generating a new pair if none exists).
2.  Call the `issueIdentityCredential` function defined in `noirhack/app/src/identity/identityService.ts`.
3.  Log the claims, disclosure frame, and the final issued SD-JWT VC string to the console.
4.  Indicate whether the test was successful.

*Expected Output:* The script will print logs including the generated keys, claims, the issued SD-JWT VC string, and a success message.

Like this:

```console
--- Starting SD-JWT VC Issuance Test ---
Generated Issuer Key Pair (JWK Public): {
  kty: 'EC',
  x: 'J_ky5Tgpm1_u1jz_Vb3LOPNKmYF85TzUD2P1kPLAMf8',
  y: 'WqhkZL6atbtD1-4BtPI6l6DLj8Qq9sDzIvOGALMkN5k',
  crv: 'P-256'
}
Running example issuance...
Issuing SD-JWT VC with claims: {
  iss: 'did:web:issuer.example.com',
  sub: 'did:example:subject456',
  iat: 1745145653,
  exp: 1776681653,
  vct: 'IdentityCredential',
  nationality: 'FI',
  vc: {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/sd-jwt-vc/v1'
    ],
    type: [ 'VerifiableCredential', 'IdentityCredential' ],
    issuer: 'did:web:issuer.example.com',
    issuanceDate: '2025-04-20T10:40:53.000Z',
    expirationDate: '2026-04-20T10:40:53.000Z',
    credentialSubject: { id: 'did:example:subject456' }
  }
}
Disclosure Frame: { _sd: [ 'nationality' ], vc: { credentialSubject: { _sd: [] } } }
Using semi-mock signer - assumes input data is payload, verify library specifics!
Generated Issuer Key Pair (JWK Public): {
  kty: 'EC',
  x: 'czCL3IQPkWDe4Xh0LHAYxA5ISSpuqAH1SDdS6xil9fo',
  y: 'i0-Y6HBcBIRzuERF11aSJK3Hm6BXmONxu4ckK8-Ni_M',
  crv: 'P-256'
}
Issuing SD-JWT VC with claims: {
  iss: 'did:web:issuer.example.com',
  sub: 'did:example:subject123',
  iat: 1745145653,
  exp: 1776681653,
  vct: 'IdentityCredential',
  nationality: 'DE',
  vc: {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/sd-jwt-vc/v1'
    ],
    type: [ 'VerifiableCredential', 'IdentityCredential' ],
    issuer: 'did:web:issuer.example.com',
    issuanceDate: '2025-04-20T10:40:53.000Z',
    expirationDate: '2026-04-20T10:40:53.000Z',
    credentialSubject: { id: 'did:example:subject123' }
  }
}
Disclosure Frame: { _sd: [ 'nationality' ], vc: { credentialSubject: { _sd: [] } } }
Using semi-mock signer - assumes input data is payload, verify library specifics!

Issued SD-JWT VC:
 eyJ0eXAiOiJkYytzZC1qd3QiLCJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJkaWQ6d2ViOmlzc3Vlci5leGFtcGxlLmNvbSIsInN1YiI6ImRpZDpleGFtcGxlOnN1YmplY3Q0NTYiLCJpYXQiOjE3NDUxNDU2NTMsImV4cCI6MTc3NjY4MTY1MywidmN0IjoiSWRlbnRpdHlDcmVkZW50aWFsIiwidmMiOnsiQGNvbnRleHQiOlsiaHR0cHM6Ly93d3cudzMub3JnLzIwMTgvY3JlZGVudGlhbHMvdjEiLCJodHRwczovL3czaWQub3JnL3NkLWp3dC12Yy92MSJdLCJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiSWRlbnRpdHlDcmVkZW50aWFsIl0sImlzc3VlciI6ImRpZDp3ZWI6aXNzdWVyLmV4YW1wbGUuY29tIiwiaXNzdWFuY2VEYXRlIjoiMjAyNS0wNC0yMFQxMDo0MDo1My4wMDBaIiwiZXhwaXJhdGlvbkRhdGUiOiIyMDI2LTA0LTIwVDEwOjQwOjUzLjAwMFoiLCJjcmVkZW50aWFsU3ViamVjdCI6eyJpZCI6ImRpZDpleGFtcGxlOnN1YmplY3Q0NTYifX0sIl9zZCI6WyJCQkprN3o5RXI5TG5fdUljWWxUV3hISTgxQjRETk5PTmZZakVEekRXSWZ3Il0sIl9zZF9hbGciOiJzaGEtMjU2In0.-Zawh3hBwsVjtKAe4sZEl1SVE_-6QVQEE6sysKb0a36VSPhJmd8pmSkBIFLS0sdll2hLp-z3ThphVcUFvsqtCw~WyJ6aEM0MUhtaE5rcXk3bkJXMGpLY3J3IiwibmF0aW9uYWxpdHkiLCJGSSJd~
Example issuance function finished.

Issued SD-JWT VC:
 eyJ0eXAiOiJkYytzZC1qd3QiLCJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJkaWQ6d2ViOmlzc3Vlci5leGFtcGxlLmNvbSIsInN1YiI6ImRpZDpleGFtcGxlOnN1YmplY3QxMjMiLCJpYXQiOjE3NDUxNDU2NTMsImV4cCI6MTc3NjY4MTY1MywidmN0IjoiSWRlbnRpdHlDcmVkZW50aWFsIiwidmMiOnsiQGNvbnRleHQiOlsiaHR0cHM6Ly93d3cudzMub3JnLzIwMTgvY3JlZGVudGlhbHMvdjEiLCJodHRwczovL3czaWQub3JnL3NkLWp3dC12Yy92MSJdLCJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiSWRlbnRpdHlDcmVkZW50aWFsIl0sImlzc3VlciI6ImRpZDp3ZWI6aXNzdWVyLmV4YW1wbGUuY29tIiwiaXNzdWFuY2VEYXRlIjoiMjAyNS0wNC0yMFQxMDo0MDo1My4wMDBaIiwiZXhwaXJhdGlvbkRhdGUiOiIyMDI2LTA0LTIwVDEwOjQwOjUzLjAwMFoiLCJjcmVkZW50aWFsU3ViamVjdCI6eyJpZCI6ImRpZDpleGFtcGxlOnN1YmplY3QxMjMifX0sIl9zZCI6WyJNOWtEYklxMlVQS3NqVEVLdXJHb0lxam5tNlYydG1tcjhZeGl5QkdJejhnIl0sIl9zZF9hbGciOiJzaGEtMjU2In0.heEw8xlZ4jR-s0EASELhiUqRF-Bbdtee1sbP0cZ-eDqCwOXcW_5l7FMzT5YRvmxphtZxbRBPt_wAK8PneaP_lA~WyI5djJMc01KR1NQb0ZJSG5DSGVnazFRIiwibmF0aW9uYWxpdHkiLCJERSJd~

--- Issuance Test Successful ---
--- Finished SD-JWT VC Issuance Test ---
```

## Key Files

*   `noirhack/app/src/identity/identityService.ts`: Contains the core logic for DID resolution (async setup) and SD-JWT VC issuance.
*   `noirhack/app/src/identity/testIssuance.ts`: A simple script to trigger and test the `issueIdentityCredential` function.
*   `noirhack/app/package.json`: Lists project dependencies.
*   `noirhack/app/tsconfig.json`: TypeScript configuration.

## Notes

*   The current implementation uses in-memory, dynamically generated keys for the issuer. A real-world application would require proper key management.
*   The issuer DID (`did:web:issuer.example.com`) is currently hardcoded.
*   The signer implementation in `identityService.ts` is marked as a semi-mock and should be reviewed/adapted for production use based on the exact data provided by the `@sd-jwt` library. 