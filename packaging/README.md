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

`source=` fetches the `v<version>` tag tarball from GitHub, so cutting a
release means: bump `package.json`, commit, tag `v<x.y.z>`, push the tag,
then update `pkgver` and `sha256sums` here. The checksum can only be taken
once the tag exists, so it necessarily lands in the commit *after* the tag.

## The package name

The package is **`inkwell-omarchy`**, not `inkwell`. The AUR already carries
`inkwell-bin` -- an unrelated proprietary Tauri editor that also calls itself
Inkwell -- and it declares `provides=('inkwell')`, so the bare name is
effectively spoken for.

Only the *package* is renamed. The binary is still `/usr/bin/inkwell`, the app
directory is still `/usr/lib/inkwell/`, and the desktop entry and icons are
still `inkwell.*` -- `StartupWMClass` has to match the Wayland `app_id`
exactly or window and icon association breaks. `$_appname` in the PKGBUILD
holds that name; `$pkgname` is only the package's.

Because both ship `/usr/bin/inkwell`, the PKGBUILD declares
`conflicts=('inkwell')`. pacman then refuses the transaction with a readable
reason instead of dying on a file collision halfway through.

## Installing once published to the AUR

Once this package is published:

```bash
yay -S inkwell-omarchy
# or: paru -S inkwell-omarchy
```

Either helper will pull `electron43` from `extra` automatically via
`depends=()`.

## Submitting to the AUR

The AUR repo holds only `PKGBUILD`, `.SRCINFO` and `.gitignore` -- never the
build output. Regenerate `.SRCINFO` with `makepkg --printsrcinfo > .SRCINFO`
after *every* PKGBUILD change; the AUR rejects a push whose `.SRCINFO` does
not match, and it is what the web interface and the helpers actually read.

```bash
git clone ssh://aur@aur.archlinux.org/inkwell-omarchy.git
# copy in PKGBUILD, regenerate .SRCINFO, commit, push
```

Pushing needs an AUR account with an SSH public key registered at
<https://aur.archlinux.org/account/>. The account is separate from the Arch
Linux forums and wiki accounts.

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
