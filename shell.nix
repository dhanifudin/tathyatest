{
  pkgs ? import <nixpkgs> { },
}:
let
  php = pkgs.php84.withExtensions (
    { enabled, all }:
    enabled
    ++ [
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
    ]
  );
  browserLibs = with pkgs; [
    alsa-lib
    atk
    at-spi2-atk
    at-spi2-core
    cairo
    dbus
    enchant
    expat
    flite
    fontconfig
    freetype
    gdk-pixbuf
    glib
    graphene
    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-bad
    gtk3
    gtk4
    harfbuzz
    harfbuzzFull
    hyphen
    icu74
    lcms2
    libavif
    libdrm
    libepoxy
    libevent
    libgbm
    libgcrypt
    libgpg-error
    libjpeg8
    libmanette
    libpng
    libpsl
    libsecret
    libtasn1
    libwebp
    libxkbcommon
    libxml2
    libxslt
    mesa
    nghttp2
    libopus
    pango
    sqlite
    stdenv.cc.cc.lib
    systemd
    vulkan-loader
    wayland
    woff2
    xorg.xorgserver
    xorg.libX11
    xorg.libXScrnSaver
    xorg.libXcomposite
    xorg.libXcursor
    xorg.libXdamage
    xorg.libXext
    xorg.libXfixes
    xorg.libXi
    xorg.libXrandr
    xorg.libXrender
    xorg.libxcb
    xorg.libxshmfence
    zlib
  ];
in
pkgs.mkShell {
  buildInputs = [
    php
    pkgs.php84Packages.composer
  ]
  ++ browserLibs;
  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath browserLibs;
  LIBGL_DRIVERS_PATH = "${pkgs.mesa}/lib/dri";
  __EGL_VENDOR_LIBRARY_DIRS = "${pkgs.mesa}/share/glvnd/egl_vendor.d";
  LIBGL_ALWAYS_SOFTWARE = "1";
  shellHook = ''
    for wrapper in "$HOME"/.cache/ms-playwright/webkit-*/minibrowser-{gtk,wpe}/MiniBrowser; do
      if [ -f "$wrapper" ] && grep -q 'LD_LIBRARY_PATH="''${MYDIR}/lib:''${MYDIR}/sys/lib"' "$wrapper"; then
        sed -i 's|LD_LIBRARY_PATH="''${MYDIR}/lib:''${MYDIR}/sys/lib"|LD_LIBRARY_PATH="''${MYDIR}/lib:''${MYDIR}/sys/lib:''${LD_LIBRARY_PATH:-}"|' "$wrapper"
      fi
    done
  '';
}
