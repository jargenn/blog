{
  description = "dev env";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }:
  let
    system = "x86_64-linux";
    pkgs = import nixpkgs { inherit system; };
  in {
    devShells.${system}.default = pkgs.mkShell {
      packages = [
        pkgs.deno
        pkgs.vscode-css-languageserver

        pkgs.pkg-config
        pkgs.gmp
        pkgs.libev
        pkgs.openssl
      ];
    };
  };
}
