#!/usr/bin/env sh

DEST_DIR="${1:-$DEST_DIR}"
RELEASE="${2:-$RELEASE}"

if [ -z "${DEST_DIR}" ]; then
  DEST_DIR="/usr/local/bin"
fi

if ! command -v curl 1> /dev/null 2> /dev/null; then
  echo "curl cli not found" >&2
  exit 1
fi

if [ -z "${RELEASE}" ]; then
  RELEASE=$(curl -sL "https://api.github.com/repos/cloud-native-toolkit/iascable/releases/latest" | grep tag_name | sed 's/"tag_name"//g' | sed 's/ //g' | sed 's/://g' | sed 's/,//g' | sed 's/"//g')
fi

TYPE="linux"
OS=$(uname)
if [ "$OS" = "Linux" ]; then
  TYPE=$(cat /etc/os-release | grep -E "^ID=" | sed "s/ID=//g")
  if [ "${TYPE}" != "alpine" ]; then
    TYPE="linux"
  fi
elif [ "$OS" = "Darwin" ]; then
  TYPE="macos"
else
  echo "OS not supported"
  exit 1
fi

ARCH=""
case $(uname -m) in
    i386)    ARCH="x64" ;;
    i686)    ARCH="x64" ;;
    x86_64)  ARCH="x64" ;;
    aarch64) ARCH="arm64" ;;
    arm64)   ARCH="arm64" ;;
    *)       echo "Unable to determine system architecture" >&2; exit 1 ;;
esac

echo "Installing version ${RELEASE} of iascable for ${TYPE}-${ARCH} into ${DEST_DIR}"
curl --progress-bar -Lo "${DEST_DIR}/iascable" "https://github.com/cloud-native-toolkit/iascable/releases/download/${RELEASE}/iascable-${TYPE}-${ARCH}" && chmod +x "${DEST_DIR}/iascable"
