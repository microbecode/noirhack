#[starknet::interface]
trait IMainContract<TContractState> {
    fn allow_transfer(ref self: TContractState, full_proof_with_hints: Span<felt252>) -> bool;
}

#[starknet::contract]
mod MainContract {
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess, StoragePathEntry, Map,
    };
    use starknet::{syscalls, SyscallResultTrait, ContractAddress};
    
    #[storage]
    struct Storage {
        // Don't do that for a real use case, use merkle tree instead
        // nullifiers: Map<u256, bool>,
        // public_key: u256,
        verifier_classhash: felt252,
        whitelist: Map<ContractAddress, bool>
    }

    #[constructor]
    fn constructor(ref self: ContractState, verifier_classhash: felt252) {
        self.verifier_classhash.write(verifier_classhash);
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        TempEvent: TempEvent
    }

    #[derive(Drop, starknet::Event)]
    pub struct TempEvent {
        Blah: ContractAddress,
    }

    #[abi(embed_v0)]
    impl IMainContractImpl of super::IMainContract<ContractState> {
        fn allow_transfer(ref self: ContractState, full_proof_with_hints: Span<felt252>) -> bool {
            let mut res = syscalls::library_call_syscall(
                self.verifier_classhash.read().try_into().unwrap(),
                selector!("verify_ultra_keccak_honk_proof"),
                full_proof_with_hints
            )
                .unwrap_syscall();
            let public_inputs = Serde::<Option<Span<ContractAddress>>>::deserialize(ref res).unwrap().expect('Proof is invalid');

            let first_input = *public_inputs[0];
            //let nullifier = *public_inputs[1];

            self.emit(TempEvent { Blah: first_input });

            return true;

            //assert(self.public_key.read() == public_key, 'Public key does not match');
            //assert(self.nullifiers.entry(nullifier).read() == false, 'Nullifier already used');

            //self.nullifiers.entry(nullifier).write(true);
        }
    }
}
