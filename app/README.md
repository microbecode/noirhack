These instructions help you run the website locally.

The local website will connect to the Starknet Sepolia testnet.

## Requirements

You will need to have the following installed:
- [Bun](https://bun.sh/) as the package manager. You can install it with: `curl -fsSL https://bun.sh/install | bash`
- Vite. You can install it with: `npm install -D vite`.
- A configured Starknet wallet. We recommend to use [Argent](https://www.argent.xyz/argent-x).
- Some STRK tokens in your Starknet wallet, to pay for gas fees. You can use the [faucet](https://starknet-faucet.vercel.app/) to get some tokens.

## Installation

1. Install packages: `npm i`
1. Build the app: `bun run build`
1. Start the app: `bun run dev`

The app should now be running at http://localhost:5173/ . It will use preconfigured contracts.