# Debug shell: shell.nix plus Xdebug. Use it only when stepping through PHP from VS Code
# (README, "Developing in VS Code"). Evaluation runs (`tt eval`, COVERAGE=1) must keep using
# shell.nix so timing and PCOV coverage are measured on the same PHP build as the paper.
{ pkgs ? import <nixpkgs> {} }:
let
  php = pkgs.php84.withExtensions ({ enabled, all }: enabled ++ [
    all.pdo_sqlite
    all.sqlite3
    all.dom
    all.fileinfo
    all.curl
    all.mbstring
    all.tokenizer
    all.ctype
    all.openssl
    all.zip
    all.xdebug
  ]);
in pkgs.mkShell {
  buildInputs = [ php pkgs.php84Packages.composer ];
  shellHook = ''
    export XDEBUG_MODE=debug
    export XDEBUG_CONFIG="client_host=127.0.0.1 client_port=9003 start_with_request=yes"
  '';
}
