{
  description = "Rook";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    systems.url = "github:nix-systems/default";

    flake-utils = {
      url = "github:numtide/flake-utils";
      inputs.systems.follows = "systems";
    };
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };

        ocamlPackages = pkgs.ocamlPackages;

        buildInputs = with ocamlPackages; [
          ppx_deriving
          ppx_expect
          yojson
          ppx_deriving_yojson
        ];

        nativeBuildInputs = with ocamlPackages; [
          ocaml
          dune_3
          dream
          cmarkit
          findlib
        ];
      in {
        packages.default = ocamlPackages.buildDunePackage {
          pname = "rook";
          version = "0.1.0";

          duneVersion = "3";
          src = ./.;

          strictDeps = true;

          inherit nativeBuildInputs buildInputs;
        };

        devShells.default = pkgs.mkShell {
          nativeBuildInputs =
            nativeBuildInputs
            ++ (with ocamlPackages; [
              ocaml-lsp
              ocamlformat
            ]);

          inherit buildInputs;
        };
      });
}
