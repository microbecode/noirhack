# StarkComply

StarkComply combines Noir privacy with a compliant Starknet token.

The project utilizes the following building blocks:
- A Noir circuit for verifying user's country.
- Garaga library for generating a Cairo verifier for the Noir circuit.
- A Cairo registry contract that whitelists addresses that have a valid Noir proof.
- A Cairo ERC20 token that can be transferred only if the recipient is whitelisted in the registry.

This project can be utilized for creating tokens that require privacy-preserving compliance (a CBDC, for example).

This project was created in [NoirHack hackathon](https://www.noirhack.com/).

## Usage flow

A typical flow works like this:

1. The user provides a [JWT](https://jwt.io/) JSON disclosing the user's country. The signed JWT is received from a trusted source.
1. The Noir circuit verifies the JWT, extracts the country information and generates a ZK proof for it.
1. Garaga converts the Noir circuit into a Cairo verifier contract.
1. The user (or any other party with the needed data) invokes a Cairo registry contract to register their address with the proof. The registry contract verifies the proof and adds the user's address in a whitelist.
1. Once the user's address has been whitelisted, he can receive (and subsequently, send) a special Cairo ERC20 token
1. Additionally, whitelist access can be revoked via a separate Noir circuit, further enhancing control over token transfers.

## Installation

**Prerequisites:**
- Node.js (>= 20)
- Python 3.10
- [Bun](https://bun.sh/) as the package manager

1. **Install Bun:**  
   ```sh
   make install-bun
   ```

2. **Install Noir and Aztec packages:**  
   ```sh
   make install-noir
   make install-barretenberg
   ```

3. **Install Starknet Toolkit:**  
   ```sh
   make install-starknet
   ```

4. **Install Devnet (Local Starknet chain):**  
   ```sh
   make install-devnet
   ```

5. **Install Garaga:**  
   (Optional: Set up a Python virtual environment)  
   ```sh
   python3.10 -m venv garaga-venv && source garaga-venv/bin/activate
   make install-garaga
   ```

6. **Install Node Modules:**  
   ```sh
   npm install -D vite
   npm install
   ```

## Building and Running

1. **Build the Noir Circuit:**  
   ```sh
   make build-circuit
   ```

2. **Generate a Witness (using sample inputs provided in `Prover.toml`):**  
   ```sh
   make exec-circuit
   ```

3. **Generate the Verification Key:**  
   ```sh
   make gen-vk
   ```

4. **Generate the Verifier Contract (Cairo) using Garaga:**  
   ```sh
   make gen-verifier
   ```

5. **Start the Local Development Network (in a separate terminal):**  
   ```sh
   make devnet
   ```

6. **Initialize the Deployment Account:**  
   ```sh
   make accounts-file
   ```

7. **Declare the Verifier Contract:**  
   ```sh
   make declare-verifier
   ```

8. **Deploy the Verifier Contract:**  
   ```sh
   make deploy-verifier
   ```

9. **Copy Necessary Artifacts:**  
   ```sh
   make artifacts
   ```

10. **Run the App:**
    - **Update the Contract Address:**  
      Modify `App.tsx` with the correct contract address.
    - **Build the App:**  
      ```sh
      bun run build
      ```
    - **Start the App:**  
      ```sh
      bun run dev
      ```

## Acknowledgements

This project was forked from the template repository [scaffold-garaga](https://github.com/m-kus/scaffold-garaga). Thanks to the original authors for laying the foundation that made StarkComply possible.
