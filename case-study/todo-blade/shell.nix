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
  ]);
in pkgs.mkShell {
  buildInputs = [ php pkgs.php84Packages.composer ];
}
