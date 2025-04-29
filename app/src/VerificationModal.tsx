import React from 'react';
import './VerificationModal.css'; // We'll create this CSS file next
import { ProofStateData } from './types'; // Assuming types.ts exists

type WalletState = 'empty' | 'issuing' | 'has_credential' | 'error_issuing';
type CredentialDataType = { jwt: string, parsed: { countryCode: string, receiverAddress: string } } | null;

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletState: WalletState; // Add wallet state prop
  credentialData: CredentialDataType; // Add credential data prop
  issueExampleCredential: () => Promise<void>; // Add issuer prop
  handleVerificationApproval: () => void; // Add approval prop
  proofState: ProofStateData;
  verificationApproved: boolean; // Add approval status prop
  // Remove old/unused props
  // jwtInput: string;
  // setJwtInput: (jwt: string) => void;
  // verifiedCredential: any | null; 
  // processJwt: () => void; 
  // useExampleCredential: () => void; 
}

const VerificationModal: React.FC<VerificationModalProps> = ({
  isOpen,
  onClose,
  walletState, // Add
  credentialData, // Add
  issueExampleCredential, // Add
  handleVerificationApproval, // Add
  proofState,
  verificationApproved, // Add
  // Remove old/unused props from destructuring
  // jwtInput,
  // setJwtInput,
  // verifiedCredential,
  // processJwt,
  // useExampleCredential,
}) => {
  if (!isOpen) {
    return null;
  }

  const renderContent = () => {
    if (verificationApproved) {
      // --- Stage 5 & 6: Verification in Progress / Complete ---
      return (
        <div className="status-section">
          <h3>Verification Status</h3>
          {proofState.state !== 'Initial' && proofState.state !== 'ProofVerified' && !proofState.error && (
            <p>Status: {proofState.state}...</p> 
            // TODO: Add a more visual loading indicator here? Spinner?
          )}
          {proofState.error && (
            <p className="error-message">Error: {proofState.error}</p>
          )}
          {proofState.state === 'ProofVerified' && (
             <p className="success-message">Verification Successful! Whitelisted.</p>
          )}
        </div>
      );
    }
    
    switch (walletState) {
      case 'empty':
        // --- Stage 1: No Credential ---
        return (
          <div className="wallet-section empty">
            <p>Your Identity Wallet has no Nationality Credential.</p>
            <button className="primary-button" onClick={issueExampleCredential}>
              Issue Example Credential
            </button>
          </div>
        );
      case 'issuing':
        // --- Stage 2: Issuing Credential ---
        return (
          <div className="wallet-section issuing">
            <p>Issuing credential...</p>
            {/* TODO: Add loading spinner */}
          </div>
        );
      case 'has_credential':
        // --- Stage 3: Credential Issued, Awaiting Approval ---
        return (
          <div className="wallet-section has-credential">
            <h3>Credential Ready</h3>
            {credentialData?.parsed && (
              <div className="credential-details">
                <p><strong>Nationality:</strong> Finland (Code: {credentialData.parsed.countryCode})</p>
                <p><strong>Whitelisting Address:</strong> {credentialData.parsed.receiverAddress}</p>
                 {/* Optional: Show raw JWT */}
                {/* <details>
                    <summary>Show Raw JWT</summary>
                    <textarea value={credentialData.jwt} readOnly rows={3}></textarea>
                </details> */}
              </div>
            )}
            <p className="permission-request">
              StarkComply requests permission to use this credential to verify your nationality and whitelist your address.
            </p>
            <div className="controls">
              <span>
                <button onClick={handleVerificationApproval} className="primary-button">
                  Approve
                </button>
                <button onClick={onClose} className="secondary-button">
                  Deny
                </button>
              </span>
            </div>
          </div>
        );
      case 'error_issuing':
        // --- Stage 4: Error Issuing ---
        return (
          <div className="wallet-section error">
            <p className="error-message">Failed to issue example credential.</p>
            {/* Optionally add a retry button */}
             <button onClick={issueExampleCredential}>
              Retry Issuance
            </button> 
          </div>
        );
      default:
        return <p>Invalid wallet state.</p>;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Identity Verification</h2> 
{/*         <button 
           onClick={onClose} 
           className="close-button" 
           disabled={proofState.state !== 'Initial' && proofState.state !== 'ProofVerified'}
        >
          X
        </button> */}

        {renderContent()} 

        {/* Remove old UI sections */}
        {/*
        <div className="jwt-section">
           ... 
        </div>
        {verifiedCredential && ( ... )}
        <div className="status-section">
           ... 
        </div>
        */}
      </div>
    </div>
  );
};

export default VerificationModal; 