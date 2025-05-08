# StarkComply circuit

This folder contains the Noir circuit implementation for the StarkComply project.

## Usage

Check the root folder's [README](/README.md) for details on how to use the circuits.

## Limitations

The circuit enabled in this project is a dummy one. The real circuit is commented out - as are its parameters in the `Prover.toml` file.

Unfortunately, we could not get a Cairo verifier generated from the real circuit. After discussions with the Garaga team, there is a bugfix coming, but it does not make it in time for the NoirHack submission.

The initial approach was to simply generate the Cairo verifier, and that works fine for the dummy circuit. For the real one, it turned out the generated Cairo verifier is too big to fit into Starknet. We tried utilizing a more [Starknet-friendly approach](https://garaga.gitbook.io/garaga/deploy-your-snark-verifier-on-starknet/noir#the-ultrastarknet-flavour) but that had some internal bugs.

