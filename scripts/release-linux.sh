#!/usr/bin/env bash
# Build the same application payload for the Arch launcher and GitHub Releases.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p 'require("./package.json").version')
runtime=$(sed -n 's/^_electron=//p' packaging/PKGBUILD)
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && $runtime =~ ^electron[0-9]+$ ]]
pnpm build
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp -r dist dist-electron package.json LICENSE "$stage/"
mkdir -p release
pnpm exec asar pack "$stage" "release/inkwell-$version-$runtime.asar"

# Build the bootstrap Arch package from the exact same compiled app. The source
# PKGBUILD normally fetches a published tag, which does not exist at this point.
root=$PWD
mkdir -p "$stage/arch/src"
ln -s "$root" "$stage/arch/src/inkwell-$version"
sed "s/^pkgver=.*/pkgver=$version/" packaging/PKGBUILD > "$stage/arch/PKGBUILD"
(cd "$stage/arch" && PKGDEST="$root/release" PKGEXT=.pkg.tar.zst makepkg --repackage --force --nodeps)
