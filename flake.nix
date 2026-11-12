{
  description = "dev env";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = [
          pkgs.deno
          pkgs.vscode-css-languageserver
          pkgs.rustc
          pkgs.cargo
          pkgs.rustfmt
          pkgs.clippy
          pkgs.ocamlPackages.ocaml
          pkgs.ocamlPackages.dune_3
          pkgs.ocamlPackages.ocaml-lsp
          pkgs.ocamlPackages.ocamlformat

          pkgs.pkg-config
          pkgs.gmp
          pkgs.libev
          pkgs.openssl
          pkgs.ispell
          pkgs.proselint
          pkgs.harper
          pkgs.pandoc
          pkgs.html-tidy
        ];
      };
    };
}
