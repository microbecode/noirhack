#[starknet::contract]
mod Erc20 {
    use openzeppelin::token::erc20::{ERC20Component};
    use starknet::ContractAddress;

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
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
        MyTransfer: MyTransfer
    }

    #[derive(Drop, starknet::Event)]
    pub struct MyTransfer {
        Address: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.erc20.initializer("Token", "TKN");
    }

    #[generate_trait]
    #[abi(per_item)]
    impl ExternalImpl of ExternalTrait {

        // INSECURE: anyone can mint
        #[external(v0)]
        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            self.erc20.mint(recipient, amount);
        }
    }

    impl ERC20HooksImpl of ERC20Component::ERC20HooksTrait<ContractState> {
        fn before_update(
          ref self: ERC20Component::ComponentState<ContractState>,
          from: ContractAddress,
          recipient: ContractAddress,
          amount: u256
        ) {
            let mut contract_state = ERC20Component::HasComponent::get_contract_mut(ref self);
            contract_state.emit(MyTransfer { Address: recipient });
        }
      
        fn after_update(
          ref self: ERC20Component::ComponentState<ContractState>,
          from: ContractAddress,
          recipient: ContractAddress,
          amount: u256
        ) {
          // Some additional behavior after the transfer
        }
      }
}