{ pkgs ? import <nixpkgs> {} }:

let
  browserLibs = with pkgs; [
    glib
    glib-networking
    nss
    nspr
    atk
    at-spi2-atk
    at-spi2-core
    dbus
    expat
    xorg.libX11
    xorg.libXcomposite
    xorg.libXdamage
    xorg.libXext
    xorg.libXfixes
    xorg.libXi
    xorg.libXrandr
    xorg.libxcb
    xorg.xorgserver
    mesa
    mesa.drivers
    libdrm
    libxkbcommon
    wayland
    alsa-lib
    cups
    cairo
    pango
    gtk3
    gtk4
    gdk-pixbuf
    systemd
    fontconfig
    freetype
    harfbuzz
    harfbuzzFull
    icu74
    libepoxy
    libevent
    libunwind
    libgudev
    libxml2
    libxslt
    libpng
    libjpeg8
    libwebp
    libavif
    libjxl
    libopus
    libpsl
    libtasn1
    libgcrypt
    libgpg-error
    libcap
    libselinux
    sqlite
    lcms
    woff2
    libsoup_3
    libmanette
    enchant2
    hyphen
    libsecret
    vulkan-loader
    graphene
    gcc14.cc.lib
    zlib
    flite
    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-good
    gst_all_1.gst-plugins-bad
    gst_all_1.gst-plugins-ugly
    gst_all_1.gst-libav
  ];
  gstPluginPath = pkgs.lib.concatStringsSep ":" [
    "${pkgs.gst_all_1.gst-plugins-base}/lib/gstreamer-1.0"
    "${pkgs.gst_all_1.gst-plugins-good}/lib/gstreamer-1.0"
    "${pkgs.gst_all_1.gst-plugins-bad}/lib/gstreamer-1.0"
    "${pkgs.gst_all_1.gst-plugins-ugly}/lib/gstreamer-1.0"
    "${pkgs.gst_all_1.gst-libav}/lib/gstreamer-1.0"
  ];
in
pkgs.mkShell {
  buildInputs = browserLibs;
  shellHook = ''
    export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath browserLibs}:''${LD_LIBRARY_PATH:-}"
    export GIO_EXTRA_MODULES="${pkgs.glib-networking}/lib/gio/modules"
    export GST_PLUGIN_SYSTEM_PATH_1_0="${gstPluginPath}"
    export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
    export LIBGL_ALWAYS_SOFTWARE=1
    export LIBGL_DRIVERS_PATH="${pkgs.mesa.drivers}/lib/dri"
    export __EGL_VENDOR_LIBRARY_FILENAMES="${pkgs.mesa.drivers}/share/glvnd/egl_vendor.d/50_mesa.json"
    export VK_ICD_FILENAMES="${pkgs.mesa.drivers}/share/vulkan/icd.d/lvp_icd.x86_64.json"
    export MESA_LOADER_DRIVER_OVERRIDE=llvmpipe
    export WEBKIT_DISABLE_DMABUF_RENDERER=1
    export GSK_RENDERER=cairo
    export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"

    # Playwright's bundled WPE MiniBrowser cannot create an EGL display in this
    # Nix container. Run its GTK MiniBrowser under a private Xvfb display instead.
    if [[ -z "''${DISPLAY:-}" ]]; then
      export TIER4_XVFB_DISPLAY_FILE="$(mktemp)"
      Xvfb -displayfd 3 -screen 0 1280x900x24 -nolisten tcp \
        > /tmp/tier4-xvfb.log 2>&1 3>"$TIER4_XVFB_DISPLAY_FILE" &
      export TIER4_XVFB_PID=$!
      for _ in $(seq 1 100); do
        [[ -s "$TIER4_XVFB_DISPLAY_FILE" ]] && break
        sleep 0.05
      done
      if [[ ! -s "$TIER4_XVFB_DISPLAY_FILE" ]]; then
        echo "Tier 4 audit runtime could not start Xvfb." >&2
        exit 2
      fi
      export DISPLAY=":$(cat "$TIER4_XVFB_DISPLAY_FILE")"
      trap 'kill "$TIER4_XVFB_PID" 2>/dev/null || true; rm -f "$TIER4_XVFB_DISPLAY_FILE"' EXIT
    fi

    WEBKIT_ROOT="$(
      find "$PWD/.cache/ms-playwright" -maxdepth 1 -type d -name 'webkit-*' \
        | sort -V | tail -1
    )/minibrowser-gtk"
    if [[ -x "$WEBKIT_ROOT/bin/MiniBrowser" ]]; then
      export TIER4_WEBKIT_GTK_EXECUTABLE="$WEBKIT_ROOT/bin/MiniBrowser"
    fi
  '';
}