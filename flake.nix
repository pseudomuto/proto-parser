{
  description = "proto-parser - A TypeScript library for parsing Protocol Buffer files";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachSystem
      [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ]
      (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;
          };

          # Pick language/tool versions here (adjust as you like)
          node = pkgs.nodejs_24;

          # Common build utils
          buildUtils = with pkgs; [
            buf
            prettier
          ];
        in
        {
          # `nix develop` drops you into this shell
          devShells.default = pkgs.mkShell {
            packages = [
              node
              buildUtils
            ];

            # Helpful prompt when you enter the shell
            shellHook = ''
              echo "▶ Dev shell ready on ${system}"
            '';
          };
        }
      );
}
