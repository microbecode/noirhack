install-noir:
	curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash
	noirup --version 1.0.0-beta.3

install-barretenberg:
	curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/master/barretenberg/bbup/install | bash
	bbup --version 0.85.0

install-starknet:
	curl --proto '=https' --tlsv1.2 -sSf https://sh.starkup.dev | sh

install-garaga:
	pip install garaga==0.17.0


build-circuit:
	cd circuit && nargo build

exec-circuit:
	cd circuit && nargo execute witness

prove-circuit:
	bb prove --scheme ultra_honk --oracle_hash keccak -b ./circuit/target/circuit.json -w ./circuit/target/witness.gz -o ./circuit/target

gen-vk:
	bb write_vk --scheme ultra_honk --oracle_hash keccak -b ./circuit/target/circuit.json -o ./circuit/target

gen-verifier:
	cd contracts && garaga gen --system ultra_keccak_honk --vk ../circuit/target/vk --project-name verifier

build-all:
	cd contracts/verifier && scarb build
	cd contracts && scarb build

# Add private key and address with assets. Use either argent or braavos wallet
# The wallet info will be stored in something like ~/.starknet_accounts/starknet_open_zeppelin_accounts.json
import-account-sepolia:
	cd contracts && sncast account import --type argent --silent --name acc-for-noirhack --address 0x1 --private-key 0x2

declare-verifier-sepolia:
	cd contracts && sncast --account acc-for-noirhack declare --contract-name UltraKeccakHonkVerifier --package verifier

declare-main-sepolia:
	cd contracts && sncast --account acc-for-noirhack declare --contract-name Registry --package main
	cd contracts && sncast --account acc-for-noirhack declare --contract-name Erc20 --package main

# Replace class-hash for verifier
deploy-verifier-sepolia:
	cd contracts && sncast --account acc-for-noirhack deploy --class-hash 0x040408b7c73092d7b26770ea4b72cf491234b94ccd9f4bd33545f5fd2f15b3e1

# Replace class-hash for registry and argument: verifier's classhash
deploy-registry-sepolia:
	cd contracts && sncast --account acc-for-noirhack deploy --class-hash 0x050887b8afe7acab53bc80749da765102da7cf264cc85103570f2752ca4fc426 --arguments 0x040408b7c73092d7b26770ea4b72cf491234b94ccd9f4bd33545f5fd2f15b3e1

# Replace class-hash and argument: registry's deployment address
deploy-erc20-sepolia:
	cd contracts && sncast --account acc-for-noirhack deploy --class-hash 0x05d27bcd57ee078bbc623ecc60a87f5e518b53900e0ae4d0e538c1724ea3824c --arguments 0x0540eeb8cff58b6696cfd192f9afbbdb406fcea24825157390d29c9300001f15

artifacts:
	cp ./circuit/target/circuit.json ./app/src/assets/circuit.json
	cp ./circuit/target/vk ./app/src/assets/vk.bin
	cp ./contracts/target/release/verifier_UltraKeccakHonkVerifier.contract_class.json ./app/src/assets/verifier.json
	cp ./contracts/target/release/main_Registry.contract_class.json ./app/src/assets/registry.json
	cp ./contracts/target/release/main_Erc20.contract_class.json ./app/src/assets/erc20.json