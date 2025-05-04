#[starknet::contract]
mod Erc20 {
    use openzeppelin::token::erc20::{ERC20Component};
    use starknet::ContractAddress;
    use starknet::storage::{ StoragePointerReadAccess, StoragePointerWriteAccess };
    use crate::registry::{ IRegistryDispatcher, IRegistryDispatcherTrait };
    use core::num::traits::{Zero};

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);

    // External
    #[abi(embed_v0)]
    impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;

    // Internal
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
        registry: ContractAddress
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
        PassedWhitelist: PassedWhitelist
    }

    #[derive(Drop, starknet::Event)]
    pub struct PassedWhitelist {
        Address: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, registry: ContractAddress) {
        self.erc20.initializer("Token", "TKN");
        self.registry.write(registry);
    }

    #[generate_trait]
    #[abi(per_item)]
    impl ExternalImpl of ExternalTrait {
        // INSECURE: anyone can mint. Temp hack for dev purposes
        #[external(v0)]
        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            self.erc20.mint(recipient, amount);
        }
    }

    // SUPER INSECURE: anyone can reset. Temp hack for dev purposes
    // Resets user balance
    #[external(v0)]
    fn reset(ref self: ContractState, address: ContractAddress) {
        let bal = self.erc20.balance_of(address);
        self.erc20.burn(address, bal);
    }

    impl ERC20HooksImpl of ERC20Component::ERC20HooksTrait<ContractState> {
        fn before_update(
          ref self: ERC20Component::ComponentState<ContractState>,
          from: ContractAddress,
          recipient: ContractAddress,
          amount: u256
        ) {
            let mut contract_state = ERC20Component::HasComponent::get_contract_mut(ref self);
            // Make sure the recipient is whitelisted
            if (recipient != Zero::zero()) {
                let registry_dispatcher = IRegistryDispatcher { contract_address: contract_state.registry.read() };
                assert!(registry_dispatcher.is_whitelisted(recipient), "Recipient is not whitelisted");
            }
            
            contract_state.emit(PassedWhitelist { Address: recipient });
        }
      
        fn after_update(
          ref self: ERC20Component::ComponentState<ContractState>,
          from: ContractAddress,
          recipient: ContractAddress,
          amount: u256
        ) { }
      }
}