import { useState, useEffect, useRef } from 'react'
import './App.css'
import { ProofStateData } from './types'
import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import { flattenFieldsAsArray } from "./helpers/proof";
import { getHonkCallData, init, poseidonHashBN254 } from 'garaga';
import { bytecode, abi } from "./assets/circuit.json";
import { abi as registryAbi } from "./assets/registry.json";
import { abi as erc20Abi } from "./assets/erc20.json";
import { abi as verifierAbi } from "./assets/verifier.json";
import vkUrl from './assets/vk.bin?url';
import { RpcProvider, Contract, WalletAccount, Account } from 'starknet';
import { connect } from "@starknet-io/get-starknet"
import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js";
import acvm from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";
import VerificationModal from './VerificationModal';

export enum ProofState {
  Initial = "Initial",
  GeneratingWitness = "GeneratingWitness",
  GeneratingProof = "GeneratingProof",
  PreparingCalldata = "PreparingCalldata",
  SendingTransaction = "SendingTransaction",
  ProofVerified = "ProofVerified",
  ProcessingJWT = "ProcessingJWT",
  ConnectingWallet = "ConnectingWallet",
}


/// Whether to use local devnet or Sepolia
const USE_LOCAL = false;
/// Who should get whitelisted and receive tokens
const RECEIVER_ADDRESS = "0x123";


const SEPOLIA_REGISTRY_ADDRESS = "0x0540eeb8cff58b6696cfd192f9afbbdb406fcea24825157390d29c9300001f15";
const SEPOLIA_ERC20_ADDRESS = "0x0075d9f9be947e74eb96e9db631b54d6593efcd77e355cbda6bf34ab351ed24f";
const SEPOLIA_PROVIDER_URL = "https://free-rpc.nethermind.io/sepolia-juno/v0_8";

const LOCAL_REGISTRY_ADDRESS = "0x0430b385df09d7d23184a009b6fb92ded44f13078576fc4b81eb0c969fa28bfc";
const LOCAL_ERC20_ADDRESS = "0x037e084e7ec576ae0a7696b742d26555bcbc450763648b07091a9e2766638f4e";
const LOCAL_PROVIDER_URL = "http://localhost:5050/rpc";
const LOCAL_PRIV_KEY = "0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9"; // First from devnet accounts
const LOCAL_ACC_ADDRESS = "0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691"; // first from devnet accounts


// --- Mock JWT Parsing ---
// In a real app, use a library like jwt-decode or jose
// This is a simplified placeholder
const parseJwtForNationality = (jwt: string): { countryCode: string, receiverAddress: string } | null => {
  try {
    // Basic check for JWT structure (3 parts separated by dots)
    if (!jwt || jwt.split('.').length !== 3) {
      console.warn("Invalid JWT format");
      return null;
    }
    // WARNING: This does not actually decode or verify the JWT signature!
    // It's just extracting a hardcoded value for demonstration.
    // TODO: Replace with actual JWT decoding and verification logic.
    // For now, let's assume the JWT *contains* the receiver address and country code
    // Example: Simulated decoded payload
    const decodedPayload = { 
      country: "US", // Example country code
      starknet_address: RECEIVER_ADDRESS, // Example: Use the dev account address for now
      // ... other JWT claims
    }; 
    console.log("Simulated JWT Decode:", decodedPayload);
    // TODO: Map country name/code to the number expected by the circuit if necessary
    const countryCodeForCircuit = "840"; // Example: Pretend "US" maps to 840
    return { 
      countryCode: countryCodeForCircuit, 
      receiverAddress: decodedPayload.starknet_address 
    };
  } catch (e) {
    console.error("Failed to parse JWT:", e);
    return null;
  }
};
// --- End Mock JWT Parsing ---

function App() {

  const [proofState, setProofState] = useState<ProofStateData>({
    state: ProofState.Initial,
  });
  const [vk, setVk] = useState<Uint8Array | null>(null);
  const currentStateRef = useRef<ProofState>(ProofState.Initial);

  
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [connectedAddress, setConnectedAddress] = useState<string>();
  const [walletState, setWalletState] = useState<'empty' | 'issuing' | 'has_credential' | 'error_issuing'>('empty');
  const [credentialData, setCredentialData] = useState<{ jwt: string, parsed: { countryCode: string, receiverAddress: string } } | null>(null);
  const [verificationApproved, setVerificationApproved] = useState<boolean>(false);
  const [isWhitelisted, setIsWhitelisted] = useState<boolean>(false); // Track whitelist status


  useEffect(() => {
    const initWasm = async () => {
      try {
        if (typeof window !== "undefined") {
          await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);
          console.log("WASM initialization in App component complete");
        }
      } catch (error) {
        console.error("Failed to initialize WASM in App component:", error);
      }
    };

    const loadVk = async () => {
      const response = await fetch(vkUrl);
      const arrayBuffer = await response.arrayBuffer();
      const binaryData = new Uint8Array(arrayBuffer);
      setVk(binaryData);
      console.log("Loaded verifying key:", binaryData);
    };

    initWasm();
    loadVk();
  }, []);
  

  const resetState = () => {
    currentStateRef.current = ProofState.Initial;
    setProofState({ 
      state: ProofState.Initial,
      error: undefined 
    });
    // Reset wallet/modal specific state
    setWalletState('empty');
    setCredentialData(null);
    setVerificationApproved(false);
  };

  const handleError = (error: unknown) => {
    console.error('Error:', error);
    let errorMessage: string;
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error !== null && error !== undefined) {
      // Try to convert any non-Error object to a string
      try {
        errorMessage = String(error);
      } catch {
        errorMessage = 'Unknown error (non-stringifiable object)';
      }
    } else {
      errorMessage = 'Unknown error occurred';
    }
    
    // Use the ref to get the most recent state
    setProofState({
      state: currentStateRef.current,
      error: errorMessage
    });
  };

  const updateState = (newState: ProofState) => {
    //console.log("Updating state to:", newState);
    currentStateRef.current = newState;
    setProofState((prevState) => ({
      ...prevState,
      state: newState,
    }));
  };


  // --- Modal Handling Functions - Uncomment ---
  
  const openModal = () => {
    resetState(); // Reset state every time modal opens
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    // Optionally reset state again when closing manually
    // resetState(); 
  };

  const handleProcessJwt = () => {
    updateState(ProofState.ProcessingJWT); // Indicate processing
    try {
      const credential = parseJwtForNationality(credentialData?.jwt || "");
      if (credential) {
        setCredentialData({ jwt: credentialData?.jwt || "", parsed: credential });
        updateState(ProofState.Initial); // Ready to accept/verify
      } else {
        handleError("Invalid or unparseable JWT provided.");
        // Keep state as ProcessingJWT or revert to Initial? Reverting seems better.
         currentStateRef.current = ProofState.Initial; 
         setProofState(prev => ({ ...prev, state: ProofState.Initial })); 
      }
    } catch (error) {
       handleError(error);
       currentStateRef.current = ProofState.Initial;
       setProofState(prev => ({ ...prev, state: ProofState.Initial }));
    }
  };
  
  // --- New Wallet Simulation Functions ---
  const issueExampleCredential = async () => {
    setWalletState('issuing');
    console.log("Simulating credential issuance...");
    // Simulate async delay
    await new Promise(resolve => setTimeout(resolve, 1500)); 

    try {
      // Mock data generation (replace with actual JWT generation/parsing if needed)
      const mockJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXhhbXBsZToxMjMiLCJuYXRpb25hbGl0eSI6IkZJIn0.mockSignature";
      const parsedData = {
          countryCode: "246", // Finland
          receiverAddress: connectedAddress!

      };
      
      setCredentialData({ jwt: mockJwt, parsed: parsedData });
      setWalletState('has_credential');
      console.log("Example credential issued and stored.");

    } catch (error) {
      console.error("Error simulating credential issuance:", error);
      setWalletState('error_issuing');
      // Optionally set an error message in proofState for display?
      // handleError("Failed to issue example credential.");
    }
  };

  const transfer = async () => {
    let erc20Contract : Contract;
    let provider : RpcProvider;

      if (USE_LOCAL) {
        provider = new RpcProvider({ nodeUrl: LOCAL_PROVIDER_URL });
        const account = new Account(provider, LOCAL_ACC_ADDRESS, LOCAL_PRIV_KEY);
        erc20Contract = new Contract(erc20Abi, LOCAL_ERC20_ADDRESS, provider);
        erc20Contract.connect(account);
      }
      else {
        provider = new RpcProvider({ nodeUrl: SEPOLIA_PROVIDER_URL });
        const selectedWalletSWO = await connect();
        if (!selectedWalletSWO) {
          throw new Error('No wallet connected');
        }
        const myWalletAccount = await WalletAccount.connect(
          provider,
          selectedWalletSWO
        );
        console.log(myWalletAccount); 
  
        erc20Contract = new Contract(erc20Abi, SEPOLIA_ERC20_ADDRESS, provider);
        erc20Contract.connect(myWalletAccount);
      }

      const res = await erc20Contract.mint(RECEIVER_ADDRESS, 5);
      const receipt = await provider.waitForTransaction(res.transaction_hash); 
      
      console.log("Mint ready", res, receipt);
  }

  const remove = async () => {
    let mainContract : Contract;
    let provider : RpcProvider;

    if (USE_LOCAL) {
      provider = new RpcProvider({ nodeUrl: LOCAL_PROVIDER_URL });

      mainContract = new Contract(registryAbi, LOCAL_REGISTRY_ADDRESS, provider);
      const account = new Account(provider, LOCAL_ACC_ADDRESS, LOCAL_PRIV_KEY);
      mainContract.connect(account);
    }
    else {
      provider = new RpcProvider({ nodeUrl: SEPOLIA_PROVIDER_URL });
      const selectedWalletSWO = await connect();
      if (!selectedWalletSWO) {
        throw new Error('No wallet connected');
      }
      const myWalletAccount = await WalletAccount.connect(
        provider,
        selectedWalletSWO
      );
      console.log(myWalletAccount);

      mainContract = new Contract(registryAbi, SEPOLIA_REGISTRY_ADDRESS, provider);
      mainContract.connect(myWalletAccount);
    }

    const res = await mainContract.remove_from_whitelist(RECEIVER_ADDRESS);
    const receipt = await provider.waitForTransaction(res.transaction_hash); 

    console.log("Remove ready", res, receipt);
  }

  const connectWallet = async () => {
    

    /*  let provider : RpcProvider;
     if (USE_LOCAL) {
        provider = new RpcProvider({ nodeUrl: LOCAL_PROVIDER_URL });
        const account = new Account(provider, LOCAL_ACC_ADDRESS, LOCAL_PRIV_KEY);
        erc20Contract = new Contract(erc20Abi, LOCAL_ERC20_ADDRESS, provider);
        erc20Contract.connect(account);
      }
      else { */
        const provider = new RpcProvider({ nodeUrl: SEPOLIA_PROVIDER_URL });
        const selectedWalletSWO = await connect();
        if (!selectedWalletSWO) {
          throw new Error('No wallet connected');
        }
        const myWalletAccount = await WalletAccount.connect(
          provider,
          selectedWalletSWO
        );
        console.log("Connected wallet", myWalletAccount); 
        setConnectedAddress(myWalletAccount.address);

     // }

  }


  const handleVerificationApproval = () => {
    if (credentialData?.parsed) {
        console.log("User approved verification with credential:", credentialData.parsed);
        setVerificationApproved(true);
        // Trigger the ZK process immediately after approval
        startProcess(credentialData.parsed); 
    } else {
        console.error("Attempted to approve verification without valid credential data.");
        handleError("Cannot start verification: credential data missing.");
    }
  };
  // --- End Wallet Simulation ---  
  
  // Modified startProcess to accept credential data
  // Keep startProcess for now, although it won't be callable via UI
  const startProcess = async (credentialData: { countryCode: string, receiverAddress: string }) => {
    if (!credentialData || !credentialData.countryCode || !credentialData.receiverAddress) {
        handleError("Missing credential data to start verification.");
        return;
    }
    
    try {
      // Start the process
      updateState(ProofState.GeneratingWitness);
      
      await init();

      const input = { 
        x: Number(credentialData.countryCode),
        y: credentialData.receiverAddress
      };

      console.log("Circuit input:", input);
      
      // Generate witness
      let noir = new Noir({ bytecode, abi: abi as any });
      let execResult = await noir.execute(input);

      console.log("Witness generation result:", execResult);
      
      // Generate proof
      updateState(ProofState.GeneratingProof);

      if (!vk) {
        throw new Error("Verification Key not loaded yet.");
      }

      let honk = new UltraHonkBackend(bytecode, { threads: 2 });
      let proof = await honk.generateProof(execResult.witness, { keccak: true });
      honk.destroy();
      console.log("Proof generated:", proof);
      
      // Prepare calldata
      updateState(ProofState.PreparingCalldata);
  
      const callData = getHonkCallData(
        proof.proof,
        flattenFieldsAsArray(proof.publicInputs),
        vk as Uint8Array,
        0
      );
      console.log("Calldata prepared:", callData);
      

      // Connect wallet
      updateState(ProofState.ConnectingWallet);

      let mainContract : Contract;
      let provider : RpcProvider;
      
      if (USE_LOCAL) {
        provider = new RpcProvider({ nodeUrl: LOCAL_PROVIDER_URL });
        

        mainContract = new Contract(registryAbi, LOCAL_REGISTRY_ADDRESS, provider);
        const account = new Account(provider, LOCAL_ACC_ADDRESS, LOCAL_PRIV_KEY);
        mainContract.connect(account);
      }
      else {
        provider = new RpcProvider({ nodeUrl: SEPOLIA_PROVIDER_URL });
        const selectedWalletSWO = await connect();
        if (!selectedWalletSWO) {
          throw new Error('No wallet connected');
        }
        const myWalletAccount = await WalletAccount.connect(
          provider,
          selectedWalletSWO
        );
        console.log(myWalletAccount);

        // Send transaction
        updateState(ProofState.SendingTransaction);

        mainContract = new Contract(registryAbi, SEPOLIA_REGISTRY_ADDRESS, provider);
        mainContract.connect(myWalletAccount);
      }

      const res = await mainContract.verify_to_whitelist(callData); // keep the number of elements to pass to the verifier library call
      const receipt = await provider.waitForTransaction(res.transaction_hash); 
      
      console.log("Proof ready", res, receipt);
      setIsWhitelisted(true);
      updateState(ProofState.Initial);
      closeModal();


    } catch (error) {
      handleError(error);
    }
  };

  return (
    <div className="container">
      <h1 className="title">StarkComply</h1>
      {connectedAddress && (
        <div className="status-indicators">
          <p>Connected Wallet: <span>{connectedAddress}</span></p>
          <p>Whitelist Status: <span>{isWhitelisted ? 'Whitelisted' : 'Not Whitelisted'}</span></p>
        </div>
      )}
      <div className="controls">
        {connectedAddress && (
        <span>
          <button className="primary-button" onClick={openModal} disabled={isModalOpen || (proofState.state !== ProofState.Initial && proofState.state !== ProofState.ProofVerified)}>
            {isWhitelisted ? "Re-Verify" : "Verify Nationality & Whitelist"}
          </button>
          <button className="secondary-button" onClick={remove}>
            Remove Address
          </button>
        </span>)}
        {!connectedAddress && (
        <span>
          <button className="primary-button" onClick={connectWallet}>
            Connect Wallet
          </button>
        </span>)}
      </div>

      <VerificationModal
        isOpen={isModalOpen}
        onClose={closeModal}
        walletState={walletState}
        credentialData={credentialData}
        issueExampleCredential={issueExampleCredential}
        handleVerificationApproval={handleVerificationApproval}
        proofState={proofState}
        verificationApproved={verificationApproved}
      />

      <div>
        <p>Current State: {proofState.state}</p>
        {proofState.error && <p style={{ color: 'red' }}>Error: {proofState.error}</p>}
      </div>

     </div>
  );
}

export default App;
