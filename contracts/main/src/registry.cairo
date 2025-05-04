use starknet::{ContractAddress};

#[starknet::interface]
pub trait IRegistry<TContractState> {
    fn verify_to_whitelist(ref self: TContractState, full_proof_with_hints: Span<felt252>) -> bool;
    fn is_whitelisted(self: @TContractState, address: ContractAddress) -> bool;
    // Remove an address from the whitelist. Temp hack.
    fn remove_from_whitelist(ref self: TContractState, address: ContractAddress);
}

#[starknet::contract]
pub mod Registry {
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, SyscallResultTrait, syscalls};

    #[storage]
    struct Storage {
        // Don't do that for a real use case, use merkle tree instead
        // nullifiers: Map<u256, bool>,
        verifier_classhash: felt252,
        whitelist: Map<ContractAddress, bool>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, verifier_classhash: felt252) {
        self.verifier_classhash.write(verifier_classhash);
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        AddedToWhitelist: AddedToWhitelist,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AddedToWhitelist {
        Address: ContractAddress,
    }

    #[abi(embed_v0)]
    impl IRegistryImpl of super::IRegistry<ContractState> {
        fn verify_to_whitelist(
            ref self: ContractState, full_proof_with_hints: Span<felt252>,
        ) -> bool {
            // Check if the proof is valid and get the address
            let address_option = self.is_valid_proof(full_proof_with_hints);
            if address_option.is_none() {
                return false;
            }
            let address : ContractAddress = address_option.unwrap();
            // Check if the address is already whitelisted
            if self.whitelist.entry(address).read() {
                return true;
            }

            self.whitelist.entry(address).write(true);
            self.emit(AddedToWhitelist { Address: address });

            return true;
        }

        fn is_whitelisted(self: @ContractState, address: ContractAddress) -> bool {
            return self.whitelist.entry(address).read();
        }

        fn remove_from_whitelist(ref self: ContractState, address: ContractAddress) {
            if self.whitelist.entry(address).read() {
                self.whitelist.entry(address).write(false);
            }            
        }
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        fn is_valid_proof(
            ref self: ContractState, full_proof_with_hints: Span<felt252>,
        ) -> Option<ContractAddress> {
            let mut res = syscalls::library_call_syscall(
                self.verifier_classhash.read().try_into().unwrap(),
                selector!("verify_ultra_keccak_honk_proof"),
                full_proof_with_hints,
            )
                .unwrap_syscall();
    
            let result = Serde::<Option<Span<u256>>>::deserialize(ref res);
            match result {
                // Can fail in two phases
                None => { return None; },
                Some(val) => {
                    match val {
                        None => { return None; },
                        Some(val) => { 
                            let first_input: felt252 = (*val[0]).try_into().unwrap();
                            let address: ContractAddress = first_input.try_into().unwrap();
                            
                            return Some(address);
                        },
                    }
                },
            }
        }
    }
}
