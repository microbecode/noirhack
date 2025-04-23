import { useState, useEffect, useRef } from 'react'
import './App.css'
import { ProofState, ProofStateData } from './types'
import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import { flattenFieldsAsArray } from "./helpers/proof";
import { getHonkCallData, init, poseidonHashBN254 } from 'garaga';
import { bytecode, abi } from "./assets/circuit.json";
import { abi as mainAbi } from "./assets/main.json";
import { abi as erc20Abi } from "./assets/erc20.json";
import { abi as verifierAbi } from "./assets/verifier.json";
import vkUrl from './assets/vk.bin?url';
import { RpcProvider, Contract, WalletAccount, Account } from 'starknet';
import { connect } from "@starknet-io/get-starknet"
import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js";
import acvm from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";

const MAIN_ADDRESS = "0x055d7068c7cca9135655db356daf067c7d50641f495e92d0742955101e92a707";
const ERC20_ADDRESS = "0x052013616c40fe27e0318c87bdaaba8038db2af451c2419c979400f03710d117";
const VERIFIER_ADDRESS = "0x04f9797572084608b678693928e646ae23a95d05af8a2e282e2203e4e14c26c0";
const PRIV_KEY = "0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9"; // First from devnet accounts
const ACC_ADDRESS = "0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691"; // first from devnet accounts
const ACC_ADDRESS_NUM = 2846891009026995430665703316224827616914889274105712248413538305735679628945n;

const PROVIDER_URL = "http://localhost:5050/rpc"; // https://free-rpc.nethermind.io/sepolia-juno/v0_8

function App() {
  const [proofState, setProofState] = useState<ProofStateData>({
    state: ProofState.Initial
  });
  const [vk, setVk] = useState<Uint8Array | null>(null);
  // Use a ref to reliably track the current state across asynchronous operations
  const currentStateRef = useRef<ProofState>(ProofState.Initial);
  const [secretKey, setSecretKey] = useState<bigint>(ACC_ADDRESS_NUM);
  const [inputValue, setInputValue] = useState<number>(10);

  // Initialize WASM on component mount
  useEffect(() => {
    const initWasm = async () => {
      try {
        // This might have already been initialized in main.tsx,
        // but we're adding it here as a fallback
        if (typeof window !== 'undefined') {
          await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);
          console.log('WASM initialization in App component complete');
        }
      } catch (error) {
        console.error('Failed to initialize WASM in App component:', error);
      }
    };

    const loadVk = async () => {
      const response = await fetch(vkUrl);
      const arrayBuffer = await response.arrayBuffer();
      const binaryData = new Uint8Array(arrayBuffer);
      setVk(binaryData);
      console.log('Loaded verifying key:', binaryData);
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
    currentStateRef.current = newState;
    setProofState({ state: newState, error: undefined });
  };

  const transfer = async () => {
    const provider = new RpcProvider({ nodeUrl: PROVIDER_URL });

      
      const account = new Account(provider, ACC_ADDRESS, PRIV_KEY);
      const erc20Contract = new Contract(erc20Abi, ERC20_ADDRESS, provider);
      erc20Contract.connect(account);

      const res = await erc20Contract.mint(VERIFIER_ADDRESS, 5);
      let receipt = await provider.waitForTransaction(res.transaction_hash); 
      
      console.log("invoke res", res, receipt);
  }

  const startProcess = async () => {
    try {
      // Start the process
      updateState(ProofState.GeneratingWitness);
      
      await init();

      // Use input values from state
/*       const inputs = {
        secret_key: secretKey,
        input: inputValue,
        public_key: poseidonHashBN254(BigInt(secretKey), BigInt(secretKey)).toString(),
        nullifier: poseidonHashBN254(BigInt(secretKey), BigInt(inputValue)).toString()
      };

      // Generate witness
      let noir = new Noir({ bytecode, abi: abi as any });
      let execResult = await noir.execute(inputs); */

      const input = { x: 5, y: ACC_ADDRESS };

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
      updateState(ProofState.SendingTransaction);

      const contractAddress = CONTRACT_ADDRESS;*/
//      const verifierContract = new Contract(verifierAbi, VERIFIER_ADDRESS, myWalletAccount);
      const verifierContract = new Contract(verifierAbi, VERIFIER_ADDRESS, provider);
      const mainContract = new Contract(mainAbi, MAIN_ADDRESS, provider);
      mainContract.connect(account);
      console.log("before ver");
      // Check verification
      //const res = await verifierContract.verify_ultra_keccak_honk_proof(callData.slice(1));
      //console.log(res);

      const res = await mainContract.verify_to_whitelist(callData); // keep the number of elements to pass to the verifier library call
      let receipt = await provider.waitForTransaction(res.transaction_hash); 
      
      console.log("invoke res", res, receipt);

      

      updateState(ProofState.ProofVerified);
    } catch (error) {
      handleError(error);
    }
  };

  const renderStateIndicator = (state: ProofState, current: ProofState) => {
    let status = 'pending';
    
    // If this stage is current with an error, show error state
    if (current === state && proofState.error) {
      status = 'error';
    } 
    // If this is the current stage, show active state
    else if (current === state) {
      status = 'active';
    } 
    // If we're past this stage, mark it completed
    else if (getStateIndex(current) > getStateIndex(state)) {
      status = 'completed';
    }
    
    return (
      <div className={`state-indicator ${status}`}>
        <div className="state-dot"></div>
        <div className="state-label">{state}</div>
      </div>
    );
  };

  const getStateIndex = (state: ProofState): number => {
    const states = [
      ProofState.Initial,
      ProofState.GeneratingWitness,
      ProofState.GeneratingProof,
      ProofState.PreparingCalldata,
      ProofState.ConnectingWallet,
      ProofState.SendingTransaction,
      ProofState.ProofVerified
    ];
    
    return states.indexOf(state);
  };

  return (
    <div className="container">
      <h1>Noir Proof Generation & Starknet Verification</h1>
      
      <div className="state-machine">
        <div className="input-section">
          <div className="input-group">
            <label htmlFor="secret-key">Secret Key:</label>
            <input 
              id="secret-key"
              type="text" 
              value={secretKey} 
              onChange={(e) => setSecretKey(parseInt(e.target.value) || 0)} 
              min="0"
              disabled={proofState.state !== ProofState.Initial}
            />
          </div>
          <div className="input-group">
            <label htmlFor="input-value">Input:</label>
            <input 
              id="input-value"
              type="text" 
              value={inputValue} 
              onChange={(e) => setInputValue(parseInt(e.target.value) || 0)} 
              min="0"
/*               value={inputY} 
              onChange={(e) => {
                const value = parseInt(e.target.value);
                setInputY(isNaN(value) ? 0 : value);
              }}  */
              disabled={proofState.state !== ProofState.Initial}
            />
          </div>
        </div>
        
        {renderStateIndicator(ProofState.GeneratingWitness, proofState.state)}
        {renderStateIndicator(ProofState.GeneratingProof, proofState.state)}
        {renderStateIndicator(ProofState.PreparingCalldata, proofState.state)}
        {renderStateIndicator(ProofState.ConnectingWallet, proofState.state)}
        {renderStateIndicator(ProofState.SendingTransaction, proofState.state)}
      </div>
      
      {proofState.error && (
        <div className="error-message">
          Error at stage '{proofState.state}': {proofState.error}
        </div>
      )}
      
      <div className="controls">
        {proofState.state === ProofState.Initial && !proofState.error && (
          <button className="primary-button" onClick={startProcess}>Start</button>
        )}
        
        {(proofState.error || proofState.state === ProofState.ProofVerified) && (
          <button className="reset-button" onClick={resetState}>Reset</button>
        )}
        <button className="reset-button" onClick={transfer}>Transfer</button>
      </div>
    </div>
  )
}

export default App
