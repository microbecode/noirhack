These instructions help you regenerate and redeploy everything needed in the project.

1. **Prerequisites:**
- Node.js (>= 20)
- Python 3.10

1. **Install Noir and Aztec packages:**  
    ```sh
    make install-noir
    make install-barretenberg
    ```

1. **Install Starknet Toolkit:**  
    ```sh
    make install-starknet
    ```

1. **Run a Python virtual environment:**  
    ```sh
    python3.10 -m venv garaga-venv && source garaga-venv/bin/activate
    ```

1. **Install Garaga:**  
    Inside the virtual environment:
    ```sh
    make install-garaga
    ```

1. **Build the Noir Circuit:**  
    Inside the virtual environment:
    ```sh
    make build-circuit
    ```

1. **Generate a Witness (using sample inputs provided in `Prover.toml`):**  
    ```sh
    make exec-circuit
    ```

1. **Generate the Verification Key:**  
   ```sh
   make gen-vk
   ```

1. **Generate the Verifier Contract (Cairo) using Garaga:**  
   ```sh
   make gen-verifier
   ```

1. **Start the Local Development Network (in a separate terminal):**  
   ```sh
   make devnet
   ```

1. **Initialize the Deployment Account:**  
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