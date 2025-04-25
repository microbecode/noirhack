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

export enum ProofState {
  Initial = "Initial",
  GeneratingWitness = "GeneratingWitness",
  GeneratingProof = "GeneratingProof",
  PreparingCalldata = "PreparingCalldata",
  ConnectingWallet = "ConnectingWallet",
  SendingTransaction = "SendingTransaction",
  ProofVerified = "ProofVerified",
}

const REGISTRY_ADDRESS = "0x04f46cf0db60007c365ac1852f6bccada01e537934bf468613304c63bb46d66d";
const ERC20_ADDRESS = "0x024d771c6ea9325b5d50361deafa238873b8e379099a79affe52bf2467b776ae";
/// Who should get whitelisted and receive tokens
const RECEIVER_ADDRESS = "0x123";
const PRIV_KEY = "0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9"; // First from devnet accounts
const ACC_ADDRESS = "0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691"; // first from devnet accounts
const ACC_ADDRESS_NUM = 2846891009026995430665703316224827616914889274105712248413538305735679628945n;

const PROVIDER_URL = "http://localhost:5050/rpc"; // https://free-rpc.nethermind.io/sepolia-juno/v0_8

function App() {
  const [proofState, setProofState] = useState<ProofStateData>({
    state: ProofState.Initial,
  });
  const [vk, setVk] = useState<Uint8Array | null>(null);
  const currentStateRef = useRef<ProofState>(ProofState.Initial);
  const [secretKey, setSecretKey] = useState<bigint>(ACC_ADDRESS_NUM);
  const [inputValue, setInputValue] = useState<number>(10);

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
    console.log("Updating state to:", newState);
    currentStateRef.current = newState;
    setProofState((prevState) => ({
      ...prevState,
      state: newState,
    }));
  };

  const transfer = async () => {
    const provider = new RpcProvider({ nodeUrl: PROVIDER_URL });

      
      const account = new Account(provider, ACC_ADDRESS, PRIV_KEY);
      const erc20Contract = new Contract(erc20Abi, ERC20_ADDRESS, provider);
      erc20Contract.connect(account);

      const res = await erc20Contract.mint(RECEIVER_ADDRESS, 5);
      let receipt = await provider.waitForTransaction(res.transaction_hash); 
      
      console.log("invoke res", res, receipt);
  }

  const startProcess = async () => {
    try {
      // Start the process
      updateState(ProofState.GeneratingWitness);
      
      await init();

      const input = { x: 5, y: RECEIVER_ADDRESS };

      console.log("input", input);
      
      // Generate witness
      let noir = new Noir({ bytecode, abi: abi as any });
      let execResult = await noir.execute(input);

      console.log("exec result", execResult);
      
      // Generate proof
      updateState(ProofState.GeneratingProof);

      let honk = new UltraHonkBackend(bytecode, { threads: 2 });
      let proof = await honk.generateProof(execResult.witness, { keccak: true });
      honk.destroy();
      console.log(proof);
      
      // Prepare calldata
      updateState(ProofState.PreparingCalldata);
  
      await init(); // only in simple
      const callData = getHonkCallData(
        proof.proof,
        flattenFieldsAsArray(proof.publicInputs),
        vk as Uint8Array,
        0 // HonkFlavor.KECCAK
      );
      console.log(callData);
      
      // Connect wallet
      updateState(ProofState.ConnectingWallet);

      const provider = new RpcProvider({ nodeUrl: PROVIDER_URL });

      
      const account = new Account(provider, ACC_ADDRESS, PRIV_KEY);

      /*       const selectedWalletSWO = await connect();
      if (!selectedWalletSWO) {
        throw new Error('No wallet connected');
      }
      const myWalletAccount = await WalletAccount.connect(
        provider,
        selectedWalletSWO
      );
      console.log(myWalletAccount); 
      // Send transaction
      updateState(ProofState.SendingTransaction);*/

      const mainContract = new Contract(registryAbi, REGISTRY_ADDRESS, provider);
      mainContract.connect(account);
      console.log("before ver");

      const res = await mainContract.verify_to_whitelist(callData); // keep the number of elements to pass to the verifier library call
      let receipt = await provider.waitForTransaction(res.transaction_hash); 
      
      console.log("invoke res", res, receipt);

      updateState(ProofState.ProofVerified);
    } catch (error) {
      handleError(error);
    }
  };

  const renderStateIndicator = (current: ProofState) => {
    const states = [
      { id: ProofState.Initial, label: "Start", icon: "🟢" },
      { id: ProofState.GeneratingWitness, label: "Witness", icon: "🔍" },
      { id: ProofState.GeneratingProof, label: "Proof", icon: "📜" },
      { id: ProofState.PreparingCalldata, label: "Calldata", icon: "📦" },
      { id: ProofState.ConnectingWallet, label: "Wallet", icon: "🔗" },
      { id: ProofState.SendingTransaction, label: "Transaction", icon: "🚀" },
      { id: ProofState.ProofVerified, label: "Verified", icon: "✅" },
    ];

    const currentIndex = states.findIndex((state) => state.id === current);

    return (
      <div className="compact-timeline">
        {states.map((state, index) => {
          const isActive = index === currentIndex;
          const isCompleted = index < currentIndex;

          return (
            <div
              key={state.id}
              className={`compact-step ${isActive ? "active" : ""} ${
                isCompleted ? "completed" : ""
              }`}
            >
              <div className="compact-icon">{state.icon}</div>
              <div className="compact-label">{state.label}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="container">
      <h1 className="title">StarkComply</h1>

      <div className="status-indicator">
        {renderStateIndicator(proofState.state)}
      </div>

      <div className="controls">
        <button className="primary-button" onClick={startProcess}>
          Issue Proof
        </button>
        <button className="secondary-button" onClick={transfer}>
          Mint Tokens
        </button>
      </div>
    </div>
  );
}

export default App;
