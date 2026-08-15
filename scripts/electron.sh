#!/usr/bin/env bash
# Resolve an Electron binary to run Inkwell during development.
#
# Inkwell targets the system Electron (see packaging/PKGBUILD) rather than a
# bundled copy, so development should run against the same runtime that ships
# the app. Arch names the binary `electron` (meta-package) or `electron<major>`
# (versioned package), and only one of those may be installed. Fall back to the
# local node_modules copy for non-Arch contributors.
set -euo pipefail

for candidate in electron electron43 electron42 electron41 electron40 electron39; do
  if command -v "$candidate" > /dev/null 2>&1; then
    exec "$candidate" "$@"
  fi
done

if [ -x node_modules/.bin/electron ]; then
  exec node_modules/.bin/electron "$@"
fi

echo "inkwell: no Electron binary found." >&2
echo "Install the system package (Arch: 'sudo pacman -S electron') or run 'pnpm install'." >&2
exit 1
