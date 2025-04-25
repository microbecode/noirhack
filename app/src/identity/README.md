# NoirHack App - JWT Identity Credential Setup (`identity` & `scripts`)

## Project Overview

This directory (`src/identity/`) and the related `src/scripts/` directory contain the core logic and helper scripts for setting up the issuer, generating a standard JWT Verifiable Credential (VC), and preparing inputs for a Noir circuit designed to verify this JWT VC.

**Key Components:**

*   `src/identity/identityService.ts`: Contains logic for issuing a standard JWT VC (e.g., for citizenship) using a statically configured issuer key. (Note: This service might be used elsewhere or for testing, but the primary flow for Noir input generation uses the scripts below).
*   `src/scripts/createIssuer.ts`: Generates the issuer's private key (`config/issuer.private.jwk`) and DID document (`config/issuer.did.json`).
*   `src/scripts/createJwtVc.ts`: Uses the issuer's private key to create a sample JWT VC (`config/credential.jwt`) containing specific claims (e.g., nationality).
*   `src/scripts/prepareJwtInputs.ts`: Reads the generated JWT VC and issuer DID document, then uses the `noir-jwt` library to calculate the inputs needed for a Noir circuit. It formats these inputs and writes them directly to `Prover.toml` in the project root (`noirhack/app/`).
*   `../tsconfig.build.json`: Specific TypeScript configuration used by `npm run build:script` to compile these scripts into CommonJS (`.cjs`) files suitable for direct Node.js execution.
*   `../package.json`: Contains the `npm` scripts (`build:script`, `create-issuer`, `create-vc`, `prepare-jwt-inputs`) to orchestrate the process.

## Setup Workflow (Run from `noirhack/app/` directory)

The following steps assume you have Node.js (v18+) and npm installed, and have run `npm install` in the `noirhack/app/` directory.

1.  **Build Scripts:**
    Compile the TypeScript scripts (`src/identity/**/*.ts` and `src/scripts/**/*.ts`) into CommonJS JavaScript files (`.cjs`) located in the `dist/` directory. This step also renames the output files to use the `.cjs` extension to ensure Node.js treats them as CommonJS modules (as our main `package.json` has `"type": "module"`).
    ```bash
    npm run build:script
    ```

2.  **Create Issuer Configuration (One-Time or if regenerating keys):**
    Run the compiled `createIssuer` script. This generates the issuer's key pair and DID document, saving them into the `config/` directory.
    ```bash
    npm run create-issuer
    ```
    *   Output: `config/issuer.private.jwk`, `config/issuer.did.json`

3.  **Create JWT Verifiable Credential:**
    Run the compiled `createJwtVc` script. This uses the private key from the previous step to sign a JWT VC with predefined claims (e.g., `nationality: "FI"`) and saves it.
    ```bash
    npm run create-vc
    ```
    *   Output: `config/credential.jwt`

4.  **Prepare Noir Circuit Inputs:**
    Run the compiled `prepareJwtInputs` script. This reads the JWT VC and the issuer's public key (from the DID document), calculates the necessary cryptographic inputs (signature limbs, public key modulus limbs, hashed data, etc.) using the `noir-jwt` library, formats them into TOML syntax, and writes them to `Prover.toml` in the project root.
    ```bash
    npm run prepare-jwt-inputs
    ```
    *   Output: `Prover.toml` (containing inputs like `data`, `signature_limbs`, `pubkey_modulus_limbs`, `expected_nationality`, etc.)

After completing these steps, the `Prover.toml` file should contain all the public and private inputs required by the corresponding Noir JWT verification circuit.

## Notes

*   **Build Target:** The scripts are built targeting CommonJS (`.cjs`) specifically to handle potential module compatibility issues with dependencies when run directly via Node.js in a project configured with `"type": "module"`.
*   **Configuration:** The issuer details, JWT claims, and output paths are currently hardcoded within the respective scripts.
*   **`Prover.toml`:** The generated `Prover.toml` includes inputs for verifying the JWT signature and the specific `nationality` claim. If the Noir circuit requires verification of other claims, the `prepareJwtInputs.ts` script needs to be updated accordingly.

## Key Files in this Directory

*   `identityService.ts`: Contains the core logic for SD-JWT VC issuance, including loading static configuration.
*   `testIssuance.ts`: A simple script to trigger and test the `issueIdentityCredential` function directly via Node.js.
*   `README.md`: This file.

## Troubleshooting Notes (Specific to Identity Scripts)

*   **Path Sensitivity:** The scripts rely on correctly finding the `config` directory relative to their *compiled location* in `dist`. The `create-issuer` script creates `../config`, `build:script` copies it to `../dist/config`, and `identityService.js` (when run via `start:test`) looks for it in `../dist/config`. Errors like `ENOENT` usually indicate a missing file due to an incorrect path or a failed copy step. Ensure you run the clean/build/create/build sequence correctly from the `noirhack/app/` directory if encountering issues.
*   **Module Loading Hang:** Previously, issues were observed where running the test script would hang indefinitely. This seemed related to the module loading phase of the `@sd-jwt/sd-jwt-vc` library or its dependencies (`ajv`). The current separate build process (`build:script`) and direct Node execution (`start:test`) seems to avoid this specific hang. If the hang reappears, using `NODE_DEBUG=module npm run start:test` from the `noirhack/app/` directory might provide clues.
*   **Crypto Polyfill:** Both `createIssuer.ts` and `identityService.ts` include a polyfill for `globalThis.crypto` using `node:crypto.webcrypto`. This is necessary because the `jose` library expects a Web Crypto API compatible environment. 