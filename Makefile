install-bun:
	curl -fsSL https://bun.sh/install | bash

install-noir:
	curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash
	noirup --version 1.0.0-beta.3

install-barretenberg:
	curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/master/barretenberg/bbup/install | bash
	bbup --version 0.85.0

install-starknet:
	curl --proto '=https' --tlsv1.2 -sSf https://sh.starkup.dev | sh

install-devnet:
	asdf plugin add starknet-devnet
	asdf install starknet-devnet 0.4.0

install-garaga:
	pip install garaga==0.17.0

devnet:
	starknet-devnet --accounts=2 --seed=0 --initial-balance=100000000000000000000000

fork:
	starknet-devnet --fork-network https://free-rpc.nethermind.io/sepolia-juno/v0_8 --fork-block 709587

accounts-file:
	curl -s http://localhost:5050/predeployed_accounts | jq '{"alpha-sepolia": {"devnet0": {address: .[0].address, private_key: .[0].private_key, public_key: .[0].public_key, class_hash: "0xe2eb8f5672af4e6a4e8a8f1b44989685e668489b0a25437733756c5a34a1d6", deployed: true, legacy: false, salt: "0x14", type: "open_zeppelin"}}}' > ./contracts/accounts.json

build-circuit:
	cd circuit && nargo build

exec-circuit:
	cd circuit && nargo execute witness

prove-circuit:
	bb prove --scheme ultra_honk --oracle_hash keccak -b ./circuit/target/circuit.json -w ./circuit/target/witness.gz -o ./circuit/target

gen-vk:
	bb write_vk --scheme ultra_honk --oracle_hash keccak -b ./circuit/target/circuit.json -o ./circuit/target

start_venv:
	python3.10 -m venv garaga-venv && source garaga-venv/bin/activate

# Call when changes to the main contract
redo-main: gen-verifier	build-verifier declare-verifier	declare-main

gen-verifier:
	cd contracts && garaga gen --system ultra_keccak_honk --vk ../circuit/target/vk --project-name verifier

build-verifier:
	cd contracts/verifier && scarb build

declare-verifier:
	cd contracts && sncast --accounts-file accounts.json --account devnet0 declare --contract-name UltraKeccakHonkVerifier --url http://localhost:5050 --package verifier

declare-main:
	cd contracts && sncast --accounts-file accounts.json --account devnet0 declare --contract-name MainContract --url http://localhost:5050 --package main

deploy-verifier:
	# TODO: use class hash from the result of the `make declare-verifier` step
	cd contracts && sncast --accounts-file accounts.json --account devnet0 deploy --class-hash 0x040408b7c73092d7b26770ea4b72cf491234b94ccd9f4bd33545f5fd2f15b3e1 --url http://localhost:5050

deploy-main:
	# TODO: use class hash from the result of the `make declare-main` step
	# use verifier address 
	# NOTE: the public key is corresponding to the private key `1`
	cd contracts && sncast --accounts-file accounts.json --account devnet0 deploy --class-hash 0x032156e5a8a6821d5ea32b4b3172f735f357cc19445a47a7345e535f781fdb12 --arguments 0x040408b7c73092d7b26770ea4b72cf491234b94ccd9f4bd33545f5fd2f15b3e1  --url http://localhost:5050

artifacts:
	cp ./circuit/target/circuit.json ./app/src/assets/circuit.json
	cp ./circuit/target/vk ./app/src/assets/vk.bin
	cp ./contracts/target/release/verifier_UltraKeccakHonkVerifier.contract_class.json ./app/src/assets/verifier.json
	cp ./contracts/target/release/main_MainContract.contract_class.json ./app/src/assets/main.json

run-app:
	cd app && bun run dev
