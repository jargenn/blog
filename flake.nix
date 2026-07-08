{
  description = "OCaml dev env";

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

        pkgs.ocamlPackages.ocaml
        pkgs.ocamlPackages.ocaml-lsp
        pkgs.ocamlPackages.dune_3
        pkgs.ocamlPackages.findlib
        pkgs.ocamlPackages.ocamlformat

        pkgs.opam
        pkgs.pkg-config
        pkgs.gmp
        pkgs.libev
        pkgs.openssl
      ];

      shellHook = ''
        export OPAMROOT="$PWD/.opam"
        SWITCH_NAME="default"

        if [ ! -f "$OPAMROOT/config" ]; then
          echo "Initializing local opam root at $OPAMROOT..."
          opam init --root="$OPAMROOT" --bare --no-setup --disable-sandboxing
        fi

        if ! opam switch list --root="$OPAMROOT" --short 2>/dev/null | grep -q "^$SWITCH_NAME\$"; then
          echo "Creating local opam switch (using Nix-provided ocaml)..."
          opam switch create "$SWITCH_NAME" --root="$OPAMROOT" --empty
          opam install ocaml-system --root="$OPAMROOT" --switch="$SWITCH_NAME" -y
        fi

        if [ "$OPAM_SWITCH_PREFIX" != "$OPAMROOT/$SWITCH_NAME" ]; then
          eval $(opam env --root="$OPAMROOT" --switch="$SWITCH_NAME" --set-root --set-switch)
        fi

        DEPS_HASH_FILE="$OPAMROOT/.deps-hash"
        CURRENT_HASH=$(cat *.opam 2>/dev/null | sha256sum | cut -d' ' -f1)
        if [ "$CURRENT_HASH" != "$(cat "$DEPS_HASH_FILE" 2>/dev/null)" ]; then
          if [ -f dune-project ] || ls *.opam >/dev/null 2>&1; then
            echo "Dependencies changed, running opam install..."
            opam install . --deps-only --with-test -y --root="$OPAMROOT" --switch="$SWITCH_NAME"
            echo "$CURRENT_HASH" > "$DEPS_HASH_FILE"
          fi
        fi
      '';
    };
  };
}
