# StarkComply

StarkComply combines Noir privacy with a compliant Starknet token.

The project utilizes the following building blocks:
- A Noir circuit for verifying user's country.
- Garaga library for generating a Cairo verifier for the Noir circuit.
- A Cairo registry contract that whitelists addresses that have a valid Noir proof.
- A Cairo ERC20 token that can be transferred only if the recipient is whitelisted in the registry.

This project can be utilized for creating tokens that require privacy-preserving compliance (a CBDC, for example).

This project was created in [NoirHack hackathon](https://www.noirhack.com/).

## Architecture

![Usage Flow](noirhack-flow.png)

## User flow

1. The user provides a [JWT](https://jwt.io/) JSON disclosing the user's country. The signed JWT is received from a trusted source.
1. User signs up with their Starknet wallet, providing a Starknet address.
1. A Noir circuit verifies the JWT, extracts the country information, adds the address and generates a ZK proof for the combination.
1. The user invokes a Cairo registry contract to register the Starknet address with the proof. The registry contract verifies the proof and adds the address in a whitelist.
1. Once the address has been whitelisted, he can receive (and subsequently, send) a special Cairo ERC20 token.

## Installation

The installation instructions depend on which part you want to do yourself and where do you want to use a ready solution.

- For running just the website with predeployed contracts, please check the [README](/app/README) in the `app` folder.
- For rebuilding the circuit, regenerating verifier and redeploying the contracts, please check the instructions [here](INSTALLATION.md).

Unfortunately, running all of the project's components locally is not possible, due to limitations in Starknet wallets. Therefore, all of the instructions guide you to use Starknet Sepolia.

## Acknowledgements

This project was forked from the template repository [scaffold-garaga](https://github.com/m-kus/scaffold-garaga). Thanks to the original authors for laying the foundation that made StarkComply possible.