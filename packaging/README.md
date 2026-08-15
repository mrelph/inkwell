# Packaging notes (Arch / AUR)

Inkwell is packaged for Arch Linux (and Omarchy) as a source-based AUR
package that depends on the system `electron` package -- the same model
Obsidian's unofficial AUR packages use. It does **not** ship a bundled
AppImage; the app runs against whatever Electron ABI Arch currently ships
(`extra/electron`, presently electron43).

## Build and install locally

From the `packaging/` directory:

```bash
makepkg -si
```

This builds the app from the working tree (`pnpm install --frozen-lockfile`
+ `pnpm build`), installs it under `/usr/lib/inkwell/`, and installs a
`/usr/bin/inkwell` launcher, the `.desktop` entry, and the icons. `-s`
resolves `makedepends`/`depends` via pacman; `-i` installs the resulting
package after building.

Note: `source=` in the PKGBUILD currently contains a placeholder URL --
there is no git remote for this repository yet. Until one exists and a
`v<version>` tag is cut, `makepkg` can't actually fetch a source tarball.
See the comment block at the top of `PKGBUILD` for what to update.

## Installing once published to the AUR

Once this package is published:

```bash
yay -S inkwell
# or: paru -S inkwell
```

Either helper will pull `electron` from `extra` automatically via
`depends=('electron')`.

## Opting in as the default `.md` handler

Installing Inkwell does **not** automatically make it the default
application for Markdown files. On Omarchy, `omawrite.desktop` already
owns `text/markdown` by default, and silently overriding a user's existing
file-association default on install is bad behavior for a package. If you
want Inkwell to open `.md` files by default, opt in explicitly:

```bash
xdg-mime default inkwell.desktop text/markdown
```

(Repeat with `text/x-markdown` if you also want that MIME type covered.)

## Why the system `electron` package

Inkwell has no bundled Electron runtime and no AppImage build step in this
package. It links against whatever `electron` version Arch currently
provides, so the app's Electron/Chromium/Node ABI always tracks Arch's own
Electron package. This means: no duplicated ~200MB Chromium per app, but
also that Inkwell's compatibility is coupled to Arch's Electron upgrade
cadence -- if Arch moves `extra/electron` to a new major version, Inkwell
needs to be verified (and potentially patched) against it before that
upgrade lands.
