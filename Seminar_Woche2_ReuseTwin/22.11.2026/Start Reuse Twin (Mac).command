#!/bin/sh
# Double-click to start (macOS): the first start installs what the pages and the core need (a few minutes), then
# the core and the pages run and the browser opens. Close this window (or press Ctrl+C) to stop.
# Node.js and Python 3.13, if missing, are offered for install: with Homebrew if it is there, otherwise with the
# official installers from nodejs.org and python.org (checked against the SHA-256 below; macOS asks for the password).
cd "$(dirname "$0")" || exit 1
fail() { echo; echo "$1"; echo "Press Return to close."; read -r _; exit 1; }

NODE_PKG=https://nodejs.org/dist/v24.22.2/node-v24.22.2.pkg
NODE_SHA256=e975e566b13aaa6b4b10689d0fea6fd8332b43a1474b9f0c970242e0c2b99bf9
PYTHON_PKG=https://www.python.org/ftp/python/3.13.17/python-3.13.17-macos11.pkg
PYTHON_SHA256=3053592af66128269efab37fe7851a4894920b27c442aeec99ce4d34d17c07e3

# A Python 3.13 where its installers put it, also when PATH does not have it (yet).
python313() {
  for p in python3.13 /Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13 /opt/homebrew/bin/python3.13 \
           /usr/local/bin/python3.13; do
    "$p" -c 'import sys; sys.exit(sys.version_info[:2] != (3, 13))' 2>/dev/null && return 0
  done
  return 1
}

# install_pkg <url> <sha256>: download, check the checksum, install with macOS' installer (asks for the password).
install_pkg() {
  tmp=$(mktemp -d) && file="$tmp/$(basename "$1")"
  echo "Downloading $(basename "$1") …"
  curl -fL --progress-bar -o "$file" "$1" || { rm -rf "$tmp"; return 1; }
  if [ "$(shasum -a 256 "$file" | cut -d ' ' -f 1)" != "$2" ]; then
    echo "$(basename "$1") does not match its checksum: not installed."; rm -rf "$tmp"; return 1
  fi
  sudo installer -pkg "$file" -target /; status=$?
  rm -rf "$tmp"
  return $status
}

need_node=; need_python=
command -v npm >/dev/null 2>&1 || need_node=1
[ -d core/.venv ] || python313 || need_python=1
if [ -n "$need_node$need_python" ]; then
  missing="Node.js is"
  [ -n "$need_python" ] && missing="Python 3.13 is"
  [ -n "$need_node" ] && [ -n "$need_python" ] && missing="Node.js and Python 3.13 are"
  brew=$(command -v brew || ls /opt/homebrew/bin/brew /usr/local/bin/brew 2>/dev/null | head -n 1)
  if [ -n "$brew" ]; then how="with Homebrew"; else how="from nodejs.org and python.org (asks for your Mac password)"; fi
  printf '%s not installed. Install now %s? [Y/n] ' "$missing" "$how"
  read -r answer
  case "$answer" in
    [nN]*) ;;
    *)
      if [ -n "$brew" ]; then
        "$brew" install ${need_node:+node} ${need_python:+python@3.13}
        PATH="$(dirname "$brew"):$PATH"
      else
        echo "macOS asks for your password; it does not show while you type."
        [ -n "$need_node" ] && install_pkg "$NODE_PKG" "$NODE_SHA256"
        [ -n "$need_python" ] && install_pkg "$PYTHON_PKG" "$PYTHON_SHA256"
        PATH="/usr/local/bin:$PATH"
      fi
      ;;
  esac
fi
command -v npm >/dev/null 2>&1 || fail "Node.js is not installed: get the LTS version from https://nodejs.org, then double-click again."
# Installs the pages' packages if missing, or if they were installed on another system (e.g. Windows in a shared folder).
node -e "import('vite').then(() => {}, () => process.exit(1))" 2>/dev/null || npm install --no-fund --no-audit \
  || fail "npm install failed (see above)."
[ -d core/.venv ] || npm run setup || fail "The core's setup failed (see above)."
npm start
