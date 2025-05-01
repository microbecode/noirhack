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


const SEPOLIA_REGISTRY_ADDRESS = "0x02657d649e15748df9fb0ff1c8761653c53c2f51a9a1d2a4a6d7a009a90c5574";
const SEPOLIA_ERC20_ADDRESS = "0x045a059d39c3f40fb593b0e150d15eac18eee07d67b987e23b8f3ceb2000babd";
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
  const [isWhitelisted, setIsWhitelisted] = useState<boolean>(false);
  const [walletTokenBalance, setWalletTokenBalance] = useState<bigint>(0n);

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

  const refreshTokenBalance = async () => {
    if (connectedAddress) {
      const provider = new RpcProvider({ nodeUrl: SEPOLIA_PROVIDER_URL });
      const erc20Contract = new Contract(erc20Abi, SEPOLIA_ERC20_ADDRESS, provider);
      const balance = await erc20Contract.balance_of(connectedAddress);
      console.log("Found token balance: " + balance.toString());
      setWalletTokenBalance(BigInt(balance));
    }
  }

  const refreshWhitelistStatus = async () => {
    if (connectedAddress) {
      const provider = new RpcProvider({ nodeUrl: SEPOLIA_PROVIDER_URL });
      const registryContract = new Contract(registryAbi, SEPOLIA_REGISTRY_ADDRESS, provider);
      const status = await registryContract.is_whitelisted(connectedAddress);
      console.log("Whitelist status: " + status.toString());
      setIsWhitelisted(!!status);
    }
  }

  useEffect(() => {
    const check = async () => {
      await refreshTokenBalance();
      await refreshWhitelistStatus();
    }
    check();
    
  }, [connectedAddress]);
  

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

      const res = await erc20Contract.mint(connectedAddress, 5);
      const receipt = await provider.waitForTransaction(res.transaction_hash); 
      
      console.log("Mint ready", res, receipt);
      await refreshTokenBalance();
  }

  /// Removes:
  /// - the connected address from the whitelist
  /// - token balance for the connected address
  /// Basically resets everything for that address
  const remove = async () => {
    let mainContract : Contract;
    let erc20Contract : Contract;
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
      erc20Contract = new Contract(erc20Abi, SEPOLIA_ERC20_ADDRESS, provider);
      erc20Contract.connect(myWalletAccount);
    }

    let res = await erc20Contract!.reset(connectedAddress);
    await provider.waitForTransaction(res.transaction_hash); 

    res = await mainContract.remove_from_whitelist(connectedAddress);
    const receipt = await provider.waitForTransaction(res.transaction_hash); 

    console.log("Remove ready", res, receipt);
    await refreshWhitelistStatus();
    await refreshTokenBalance();
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

        await refreshTokenBalance();

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
      /*
data_storage = ["0x65", "0x79", "0x4a", "0x68", "0x62", "0x47", "0x63", "0x69", "0x4f", "0x69", "0x4a", "0x53", "0x55", "0x7a", "0x49", "0x31", "0x4e", "0x69", "0x49", "0x73", "0x49", "0x6e", "0x52", "0x35", "0x63", "0x43", "0x49", "0x36", "0x49", "0x6b", "0x70", "0x58", "0x56", "0x43", "0x4a", "0x39", "0x2e", "0x65", "0x79", "0x4a", "0x70", "0x63", "0x33", "0x4d", "0x69", "0x4f", "0x69", "0x4a", "0x6b", "0x61", "0x57", "0x51", "0x36", "0x64", "0x32", "0x56", "0x69", "0x4f", "0x6d", "0x64", "0x76", "0x64", "0x69", "0x35", "0x6c", "0x65", "0x47", "0x46", "0x74", "0x63", "0x47", "0x78", "0x6c", "0x49", "0x69", "0x77", "0x69", "0x63", "0x33", "0x56", "0x69", "0x49", "0x6a", "0x6f", "0x69", "0x5a", "0x47", "0x6c", "0x6b", "0x4f", "0x6d", "0x74", "0x6c", "0x65", "0x54", "0x70", "0x36", "0x4e", "0x6b", "0x31", "0x72", "0x61", "0x43", "0x34", "0x75", "0x4c", "0x6d", "0x68", "0x76", "0x62", "0x47", "0x52", "0x6c", "0x63", "0x69", "0x49", "0x73", "0x49", "0x6d", "0x35", "0x69", "0x5a", "0x69", "0x49", "0x36", "0x4d", "0x54", "0x63", "0x30", "0x4e", "0x54", "0x55", "0x35", "0x4d", "0x6a", "0x41", "0x35", "0x4f", "0x43", "0x77", "0x69", "0x5a", "0x58", "0x68", "0x77", "0x49", "0x6a", "0x6f", "0x78", "0x4e", "0x7a", "0x55", "0x7a", "0x4d", "0x7a", "0x59", "0x34", "0x4d", "0x44", "0x6b", "0x34", "0x4c", "0x43", "0x4a", "0x75", "0x59", "0x58", "0x52", "0x70", "0x62", "0x32", "0x35", "0x68", "0x62", "0x47", "0x6c", "0x30", "0x65", "0x53", "0x49", "0x36", "0x49", "0x6b", "0x5a", "0x4a", "0x49", "0x69", "0x77", "0x69", "0x64", "0x6d", "0x4d", "0x69", "0x4f", "0x6e", "0x73", "0x69", "0x51", "0x47", "0x4e", "0x76", "0x62", "0x6e", "0x52", "0x6c", "0x65", "0x48", "0x51", "0x69", "0x4f", "0x6c", "0x73", "0x69", "0x61", "0x48", "0x52", "0x30", "0x63", "0x48", "0x4d", "0x36", "0x4c", "0x79", "0x39", "0x33", "0x64", "0x33", "0x63", "0x75", "0x64", "0x7a", "0x4d", "0x75", "0x62", "0x33", "0x4a", "0x6e", "0x4c", "0x7a", "0x49", "0x77", "0x4d", "0x54", "0x67", "0x76", "0x59", "0x33", "0x4a", "0x6c", "0x5a", "0x47", "0x56", "0x75", "0x64", "0x47", "0x6c", "0x68", "0x62", "0x48", "0x4d", "0x76", "0x64", "0x6a", "0x45", "0x69", "0x58", "0x53", "0x77", "0x69", "0x64", "0x48", "0x6c", "0x77", "0x5a", "0x53", "0x49", "0x36", "0x57", "0x79", "0x4a", "0x57", "0x5a", "0x58", "0x4a", "0x70", "0x5a", "0x6d", "0x6c", "0x68", "0x59", "0x6d", "0x78", "0x6c", "0x51", "0x33", "0x4a", "0x6c", "0x5a", "0x47", "0x56", "0x75", "0x64", "0x47", "0x6c", "0x68", "0x62", "0x43", "0x49", "0x73", "0x49", "0x6b", "0x4e", "0x70", "0x64", "0x47", "0x6c", "0x36", "0x5a", "0x57", "0x35", "0x7a", "0x61", "0x47", "0x6c", "0x77", "0x51", "0x33", "0x4a", "0x6c", "0x5a", "0x47", "0x56", "0x75", "0x64", "0x47", "0x6c", "0x68", "0x62", "0x43", "0x4a", "0x64", "0x4c", "0x43", "0x4a", "0x6a", "0x63", "0x6d", "0x56", "0x6b", "0x5a", "0x57", "0x35", "0x30", "0x61", "0x57", "0x46", "0x73", "0x55", "0x33", "0x56", "0x69", "0x61", "0x6d", "0x56", "0x6a", "0x64", "0x43", "0x49", "0x36", "0x65", "0x79", "0x4a", "0x70", "0x5a", "0x43", "0x49", "0x36", "0x49", "0x6d", "0x52", "0x70", "0x5a", "0x44", "0x70", "0x72", "0x5a", "0x58", "0x6b", "0x36", "0x65", "0x6a", "0x5a", "0x4e", "0x61", "0x32", "0x67", "0x75", "0x4c", "0x69", "0x35", "0x6f", "0x62", "0x32", "0x78", "0x6b", "0x5a", "0x58", "0x49", "0x69", "0x66", "0x58", "0x30", "0x73", "0x49", "0x6d", "0x6c", "0x68", "0x64", "0x43", "0x49", "0x36", "0x4d", "0x54", "0x63", "0x30", "0x4e", "0x54", "0x55", "0x35", "0x4d", "0x6a", "0x41", "0x35", "0x4f", "0x48", "0x30"]
data_len = 436
signature_limbs = ["0x6ff1434b5cf843b00d738cc330a56c", "0x141aaf2cfa7e5bcde7328ac7465940", "0xa63cb329cfac28823a65a9eae77705", "0x308892c2c0733e3b248ac5574bc57a", "0xb301987b42901228b8c4abe2fb602c", "0xee37c84880c7bd8303d8bc828ee2bd", "0x31877c38042e483472dce402cffd23", "0xfb9cd38f68fc8039101b86b124baad", "0xb55ad65324602c19c65f6d6681b839", "0xcc14a621b4b2fbe3dba7f290811844", "0x912f05e4990947c8f6a8f6599259c", "0x769529f6b3f810f552010a947b9daa", "0x7284743e1a0d5319e0fa1a2263b85f", "0x55ebc3309c652431f18ed160cd4d4a", "0x5a7d76a8375c03e96e91a76a2b5a3c", "0x718c67b5fd5c4a7c9dededb4b16972", "0x2a7af6e6b2e537c34b2e1a1bfea8eb", "0xae"]
pubkey_modulus_limbs = ["0xec35359a6f0d75830890b132ba1995", "0x103926a430d9f422410953736918c0", "0xbbcb5a7215b04432cd7d3a16a72a2a", "0x9c26254f860c28812caa3d0557a7a2", "0x7749fc3c986082743dbf514f582000", "0xe7e39c7723c0898e65465edcdac359", "0x8d5ab01e0733c92e78194ab1d4eb72", "0xb61615b4a92864acd0f60d88860d71", "0xee54dac31956482bf87692c746489c", "0x8aca00fda3d0f1273e01a65d5f5c9a", "0x58ad6f31b613a935411fdca79eee77", "0xda15af91be07568a2ed8e629054aec", "0xa50b3e70b4e5e1082fd44f633f68d9", "0x381ca304fc8e2c789a35459a9c3054", "0x807d8bb28b50f7805b4784fd6d0aa8", "0x9a18ce8eb41be8e250c0d6462ace0d", "0xd612c6c54f23df01820bf59c313f1d", "0xea"]
redc_params_limbs = ["0xeaaabd6f4f3f76a8a04f8006878a84", "0xdb2afd05293b8ca63d8c8528c62be6", "0x4d42e8c39a818a560ef2902cfb246b", "0x5213904f15f2e8bc3c85dd257201fc", "0xf83e24d813380ceeebda0e5f329baa", "0x1aad01fd57ce263650fb6fadf8de65", "0xe690499e2142320cbe614dea305fb7", "0xd1cf0ad1d71fd4b61064996c16388b", "0xe58963ce0ad74965a59c06463a38ab", "0x19db1ca1d78ea417ef76ece1c01a7a", "0xb692905cb7f63d0a0d9522dfd32ef2", "0x3a935256a13118e7ecf7f5abc7380a", "0xe364bc93dc6d6e1fa2b7c08b10176f", "0x1684f5c4ab7b09d36035298719f7b9", "0xb84ff1c19b7e346b5381d36aa8dfaa", "0x1a965346cc66aaae55d9876490da3b", "0x232ac80140f6ad98f80ded62346eb3", "0x1171"]
base64_decode_offset = 37

# Expected claim values (public inputs)
expected_nationality_storage = ["0x46", "0x49"]
expected_nationality_len = 2
      */

      const input = { 
        data_storage: ["0x65", "0x79", "0x4a", "0x68", "0x62", "0x47", "0x63", "0x69", "0x4f", "0x69", "0x4a", "0x53", "0x55", "0x7a", "0x49", "0x31", "0x4e", "0x69", "0x49", "0x73", "0x49", "0x6e", "0x52", "0x35", "0x63", "0x43", "0x49", "0x36", "0x49", "0x6b", "0x70", "0x58", "0x56", "0x43", "0x4a", "0x39", "0x2e", "0x65", "0x79", "0x4a", "0x70", "0x63", "0x33", "0x4d", "0x69", "0x4f", "0x69", "0x4a", "0x6b", "0x61", "0x57", "0x51", "0x36", "0x64", "0x32", "0x56", "0x69", "0x4f", "0x6d", "0x64", "0x76", "0x64", "0x69", "0x35", "0x6c", "0x65", "0x47", "0x46", "0x74", "0x63", "0x47", "0x78", "0x6c", "0x49", "0x69", "0x77", "0x69", "0x63", "0x33", "0x56", "0x69", "0x49", "0x6a", "0x6f", "0x69", "0x5a", "0x47", "0x6c", "0x6b", "0x4f", "0x6d", "0x74", "0x6c", "0x65", "0x54", "0x70", "0x36", "0x4e", "0x6b", "0x31", "0x72", "0x61", "0x43", "0x34", "0x75", "0x4c", "0x6d", "0x68", "0x76", "0x62", "0x47", "0x52", "0x6c", "0x63", "0x69", "0x49", "0x73", "0x49", "0x6d", "0x35", "0x69", "0x5a", "0x69", "0x49", "0x36", "0x4d", "0x54", "0x63", "0x30", "0x4e", "0x54", "0x55", "0x35", "0x4d", "0x6a", "0x41", "0x35", "0x4f", "0x43", "0x77", "0x69", "0x5a", "0x58", "0x68", "0x77", "0x49", "0x6a", "0x6f", "0x78", "0x4e", "0x7a", "0x55", "0x7a", "0x4d", "0x7a", "0x59", "0x34", "0x4d", "0x44", "0x6b", "0x34", "0x4c", "0x43", "0x4a", "0x75", "0x59", "0x58", "0x52", "0x70", "0x62", "0x32", "0x35", "0x68", "0x62", "0x47", "0x6c", "0x30", "0x65", "0x53", "0x49", "0x36", "0x49", "0x6b", "0x5a", "0x4a", "0x49", "0x69", "0x77", "0x69", "0x64", "0x6d", "0x4d", "0x69", "0x4f", "0x6e", "0x73", "0x69", "0x51", "0x47", "0x4e", "0x76", "0x62", "0x6e", "0x52", "0x6c", "0x65", "0x48", "0x51", "0x69", "0x4f", "0x6c", "0x73", "0x69", "0x61", "0x48", "0x52", "0x30", "0x63", "0x48", "0x4d", "0x36", "0x4c", "0x79", "0x39", "0x33", "0x64", "0x33", "0x63", "0x75", "0x64", "0x7a", "0x4d", "0x75", "0x62", "0x33", "0x4a", "0x6e", "0x4c", "0x7a", "0x49", "0x77", "0x4d", "0x54", "0x67", "0x76", "0x59", "0x33", "0x4a", "0x6c", "0x5a", "0x47", "0x56", "0x75", "0x64", "0x47", "0x6c", "0x68", "0x62", "0x48", "0x4d", "0x76", "0x64", "0x6a", "0x45", "0x69", "0x58", "0x53", "0x77", "0x69", "0x64", "0x48", "0x6c", "0x77", "0x5a", "0x53", "0x49", "0x36", "0x57", "0x79", "0x4a", "0x57", "0x5a", "0x58", "0x4a", "0x70", "0x5a", "0x6d", "0x6c", "0x68", "0x59", "0x6d", "0x78", "0x6c", "0x51", "0x33", "0x4a", "0x6c", "0x5a", "0x47", "0x56", "0x75", "0x64", "0x47", "0x6c", "0x68", "0x62", "0x43", "0x49", "0x73", "0x49", "0x6b", "0x4e", "0x70", "0x64", "0x47", "0x6c", "0x36", "0x5a", "0x57", "0x35", "0x7a", "0x61", "0x47", "0x6c", "0x77", "0x51", "0x33", "0x4a", "0x6c", "0x5a", "0x47", "0x56", "0x75", "0x64", "0x47", "0x6c", "0x68", "0x62", "0x43", "0x4a", "0x64", "0x4c", "0x43", "0x4a", "0x6a", "0x63", "0x6d", "0x56", "0x6b", "0x5a", "0x57", "0x35", "0x30", "0x61", "0x57", "0x46", "0x73", "0x55", "0x33", "0x56", "0x69", "0x61", "0x6d", "0x56", "0x6a", "0x64", "0x43", "0x49", "0x36", "0x65", "0x79", "0x4a", "0x70", "0x5a", "0x43", "0x49", "0x36", "0x49", "0x6d", "0x52", "0x70", "0x5a", "0x44", "0x70", "0x72", "0x5a", "0x58", "0x6b", "0x36", "0x65", "0x6a", "0x5a", "0x4e", "0x61", "0x32", "0x67", "0x75", "0x4c", "0x69", "0x35", "0x6f", "0x62", "0x32", "0x78", "0x6b", "0x5a", "0x58", "0x49", "0x69", "0x66", "0x58", "0x30", "0x73", "0x49", "0x6d", "0x6c", "0x68", "0x64", "0x43", "0x49", "0x36", "0x4d", "0x54", "0x63", "0x30", "0x4e", "0x54", "0x55", "0x35", "0x4d", "0x6a", "0x41", "0x35", "0x4f", "0x48", "0x30"],
        data_len: 436,
        signature_limbs: ["0x6ff1434b5cf843b00d738cc330a56c", "0x141aaf2cfa7e5bcde7328ac7465940", "0xa63cb329cfac28823a65a9eae77705", "0x308892c2c0733e3b248ac5574bc57a", "0xb301987b42901228b8c4abe2fb602c", "0xee37c84880c7bd8303d8bc828ee2bd", "0x31877c38042e483472dce402cffd23", "0xfb9cd38f68fc8039101b86b124baad", "0xb55ad65324602c19c65f6d6681b839", "0xcc14a621b4b2fbe3dba7f290811844", "0x912f05e4990947c8f6a8f6599259c", "0x769529f6b3f810f552010a947b9daa", "0x7284743e1a0d5319e0fa1a2263b85f", "0x55ebc3309c652431f18ed160cd4d4a", "0x5a7d76a8375c03e96e91a76a2b5a3c", "0x718c67b5fd5c4a7c9dededb4b16972", "0x2a7af6e6b2e537c34b2e1a1bfea8eb", "0xae"],
        pubkey_modulus_limbs: ["0xec35359a6f0d75830890b132ba1995", "0x103926a430d9f422410953736918c0", "0xbbcb5a7215b04432cd7d3a16a72a2a", "0x9c26254f860c28812caa3d0557a7a2", "0x7749fc3c986082743dbf514f582000", "0xe7e39c7723c0898e65465edcdac359", "0x8d5ab01e0733c92e78194ab1d4eb72", "0xb61615b4a92864acd0f60d88860d71", "0xee54dac31956482bf87692c746489c", "0x8aca00fda3d0f1273e01a65d5f5c9a", "0x58ad6f31b613a935411fdca79eee77", "0xda15af91be07568a2ed8e629054aec", "0xa50b3e70b4e5e1082fd44f633f68d9", "0x381ca304fc8e2c789a35459a9c3054", "0x807d8bb28b50f7805b4784fd6d0aa8", "0x9a18ce8eb41be8e250c0d6462ace0d", "0xd612c6c54f23df01820bf59c313f1d", "0xea"],
        redc_params_limbs: ["0xeaaabd6f4f3f76a8a04f8006878a84", "0xdb2afd05293b8ca63d8c8528c62be6", "0x4d42e8c39a818a560ef2902cfb246b", "0x5213904f15f2e8bc3c85dd257201fc", "0xf83e24d813380ceeebda0e5f329baa", "0x1aad01fd57ce263650fb6fadf8de65", "0xe690499e2142320cbe614dea305fb7", "0xd1cf0ad1d71fd4b61064996c16388b", "0xe58963ce0ad74965a59c06463a38ab", "0x19db1ca1d78ea417ef76ece1c01a7a", "0xb692905cb7f63d0a0d9522dfd32ef2", "0x3a935256a13118e7ecf7f5abc7380a", "0xe364bc93dc6d6e1fa2b7c08b10176f", "0x1684f5c4ab7b09d36035298719f7b9", "0xb84ff1c19b7e346b5381d36aa8dfaa", "0x1a965346cc66aaae55d9876490da3b", "0x232ac80140f6ad98f80ded62346eb3", "0x1171"],
        base64_decode_offset: 37,
        expected_nationality_storage: ["0x46", "0x49"],
        expected_nationality_len: 2,        

/*         x: Number(credentialData.countryCode),
        y: credentialData.receiverAddress */
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

      let honk = new UltraHonkBackend(bytecode, { threads: 8 });
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
      await refreshWhitelistStatus();
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
          <p>Wallet token balance: <span>{walletTokenBalance}</span></p>
          {/* For debug purposes, remove from whitelist */}
          <span onClick={remove}>&nbsp;&nbsp;&nbsp;</span>
        </div>
      )}
      <div className="controls">
        {connectedAddress && (
        <span>
          <button className="primary-button" onClick={openModal} disabled={isModalOpen || (proofState.state !== ProofState.Initial && proofState.state !== ProofState.ProofVerified)}>
            {isWhitelisted ? "Re-Verify" : "Verify Nationality & Whitelist"}
          </button>
          <button className="secondary-button" onClick={transfer}>
            Mint tokens
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
