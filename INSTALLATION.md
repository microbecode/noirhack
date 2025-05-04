These instructions help you regenerate and redeploy everything needed in the project.

1. **Prerequisites:**
- Node.js (>= 20)
- Python 3.10
- A private key and a public address for a Starknet wallet with some STRK tokens, used for deployments. Check the `app`'s [README](/app/README) for info on how to get these.

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

1. **Build the Noir circuit:**  
    Inside the virtual environment:
    ```sh
    make build-circuit
    ```

1. **Generate a witness (using sample inputs provided in `Prover.toml`):**
    Inside the virtual environment:
    ```sh
    make exec-circuit
    ```

1. **Generate the verification key:**
    Inside the virtual environment:
    ```sh
    make gen-vk
    ```

1. **Generate the verifier contract (Cairo) using Garaga:**
    Inside the virtual environment:
    ```sh
    make gen-verifier
    ```
    After this phase you no longer need to use the virtual environment.

1. **Build all of the Cairo contracts:**
    ```sh
    make build-all
    ```

1. **Import Sepolia account:**
    Extract your Starknet wallet's private key and public address. Add these into the following command and run it:
    ```sh
    sncast account import --type argent --silent --name acc-for-noirhack --address 0x1 --private-key 0x2
    ```
    This will import the wallet to a file that is something similar to this: ~/.starknet_accounts/starknet_open_zeppelin_accounts.json

1. **Declare the verifier contract:**  
    ```sh
    make declare-verifier-sepolia
    ```
    Note the declared class hash, you will need this in a minute. This may give an error if the contract has already been declared earlier.

1. **Declare the Registry and ERC20 Contracts:**  
    ```sh
    make declare-main-sepolia
    ```
    Note the two declared class hashes. The first one is for the registry and the second for the ERC20 contract. This may give an error if the contract has already been declared earlier.

1. **Deploy the verifier contract:**
    Relace the verifier's class hash in the following command and run it:
    ```sh
    sncast --account acc-for-noirhack deploy --class-hash 0x1
    ```
    Note the deployed contract address.

1. **Deploy the registry contract:**
    Relace the registry contract's class hash (0x1) and the argument in the following command. The argument (0x2) should be the verifier's class hash. Then run it:
    ```sh
    sncast --account acc-for-noirhack deploy --class-hash 0x1 --arguments 0x2
    ```
    Note the deployed contract address.

1. **Deploy the ERC20 contract:**
    Relace the ERC20 contract's class hash (0x1) and the argument in the following command. The argument (0x2) should be the registry contract's deployed address. Then run it:
    ```sh
    sncast --account acc-for-noirhack deploy --class-hash 0x1 --arguments 0x2
    ```
    Note the deployed contract address.

1. **Copy Necessary Artifacts:**  
    ```sh
    make artifacts
    ```

1. **Adjust the app's contract addresses:**  
    Open file `app/src/App.tsx` and change the registry address and ERC20 address constants found at the start of the file. Continue running the app by following its [README](/app/README).