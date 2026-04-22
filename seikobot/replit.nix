{ pkgs }: {
  deps = [
    pkgs.pixman
    pkgs.librsvg
    pkgs.giflib
    pkgs.libjpeg
    pkgs.libpng
    pkgs.pango
    pkgs.cairo
    pkgs.pkg-config
    pkgs.python3
    pkgs.ffmpeg
    pkgs.nodejs-16_x
  ];
}