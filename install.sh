#!/usr/bin/env sh

DEST_DIR="${1:-$DEST_DIR}"
RELEASE="${2:-$RELEASE}"
TMP_DIR="/tmp"

if [ -z "${DEST_DIR}" ]; then
  DEST_DIR="/usr/local/bin"
fi

if ! command -v curl 1> /dev/null 2> /dev/null; then
  echo "curl cli not found" >&2
  exit 1
fi

if [ "${RELEASE}" = "beta" ]; then
  if ! command -v jq 1> /dev/null 2> /dev/null; then
    echo "jq cli not found. It is required to get the latest beta release" >&2
    exit 1
  fi

  RELEASE=$(curl -sL "https://api.github.com/repos/cloud-native-toolkit/iascable/releases" | jq -r 'map(select(.prerelease)) | first | .tag_name // empty')

  if [ -z "${RELEASE}" ]; then
    echo "Unable to find beta release" >&2
    exit 1
  fi
elif [ -z "${RELEASE}" ]; then
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
    i386)    ARCH="" ;;
    i686)    ARCH="" ;;
    x86_64)  ARCH="" ;;
    aarch64) ARCH="-arm64" ;;
    arm64)   ARCH="-arm64" ;;
    *)       echo "Unable to determine system architecture" >&2; exit 1 ;;
esac

# If an Apple M1 Mac, use AMD64 architecture with Rosetta
if [[ "${TYPE}" == "macos" ]] && [[ "${ARCH}" == "-arm64" ]]; then
  # Check that Rosetta is installed before continuing (Rosetta is known as oah by macos)
  if [[ ! $(/usr/bin/pgrep oahd) ]]; then
    echo "Rosetta must be installed. Please install and try again."
    exit 2;
  fi

  # Create temporary directory if it does nto exist
  if [[ ! -d "${TMP_DIR}" ]]; then
    mkdir -p "${TMP_DIR}"
  fi

  # Download the binary to a temporary directory (/tmp by default)
  echo "Downloading ${RELEASE} of iascable for ${TYPE} into ${TMP_DIR}"
  curl --progress-bar -Lo "${TMP_DIR}/iascable-${RELEASE}" "https://github.com/cloud-native-toolkit/iascable/releases/download/${RELEASE}/iascable-${TYPE}" 
  chmod +x "${TMP_DIR}/iascable-${RELEASE}"

  # Check if there is an existing version of iascable installed. 
  if [[ -h "${DEST_DIR}/iascable" ]]; then   # Link file
    # Remove link file
    echo "Detected existing linked file ${DEST_DIR}/iascable"
    rm "${DEST_DIR}/iascable"
  elif [[ -x "${DEST_DIR}/iascable" ]]; then
    # Get current version number
    VERSION=$($DEST_DIR/iascable --version)
    echo "Detected existing executable with version ${VERSION}"

    # Copy existing binary to copy with current release
    mv "${DEST_DIR}/iascable" "${DEST_DIR}/iascable-${VERSION}"
  fi

  # Move binary to destination directory and create link
  echo "Moving ${TMP_DIR}/iascable-${RELEASE} to ${DEST_DIR} and creating symbolic link" 
  mv "${TMP_DIR}/iascable-${RELEASE}" "${DEST_DIR}/iascable-${RELEASE}"
  ln -s "${DEST_DIR}/iascable-${RELEASE}" "${DEST_DIR}/iascable"

else  # Non-Mac M1
  echo "Installing version ${RELEASE} of iascable for ${TYPE}${ARCH} into ${DEST_DIR}"
  curl --progress-bar -Lo "${DEST_DIR}/iascable" "https://github.com/cloud-native-toolkit/iascable/releases/download/${RELEASE}/iascable-${TYPE}${ARCH}" && chmod +x "${DEST_DIR}/iascable"
fi

