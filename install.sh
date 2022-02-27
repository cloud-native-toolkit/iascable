#!/usr/bin/env bash

DEST_DIR="${1:-$DEST_DIR}"
RELEASE="${2:-$RELEASE}"

if [[ -z "${DEST_DIR}" ]]; then
  DEST_DIR="/usr/local/bin"
fi

if [[ -z "${RELEASE}" ]]; then
  RELEASE=$(curl -sL "https://api.github.com/repos/cloud-native-toolkit/iascable/releases/latest" | grep tag_name | sed -E 's/.*"tag_name": ?"([^"]+)".*/\1/g')
fi

TYPE="linux"
OS=$(uname)
if [[ "$OS" == "Linux" ]]; then
  TYPE=$(cat /etc/os-release | grep -E "^ID=" | sed "s/ID=//g")
  if [[ "${TYPE}" != "alpine" ]]; then
    TYPE="linux"
  fi
elif [[ "$OS" == "Darwin" ]]; then
  TYPE="macos"
else
  echo "OS not supported"
  exit 1
fi

echo "Installing version ${RELEASE} of iascable for ${TYPE} into ${DEST_DIR}"
curl -sLo "${DEST_DIR}/iascable" "https://github.com/cloud-native-toolkit/iascable/releases/download/${RELEASE}/iascable-${TYPE}" && chmod +x "${DEST_DIR}/iascable"
