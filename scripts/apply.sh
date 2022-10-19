#!/usr/bin/env bash

SCRIPT_DIR=$(cd $(dirname $0); pwd -P)

VARIABLES_FILE="${1}"
if [[ -z "${VARIABLES_FILE}" ]]; then
  VARIABLES_FILE="variables.yaml"
fi

YQ=$(command -v yq4 || command -v yq)
if [[ -z "${YQ}" ]] || [[ $(${YQ} --version | sed -E "s/.*version ([34]).*/\1/g") == "3" ]]; then
  echo "yq v4 is required"
  exit 1
fi

if ! command -v jq 1> /dev/null 2> /dev/null; then
  echo "jq is required"
  exit 1
fi

CREDENTIALS_PROPERTIES="../credentials.properties"

TERRAFORM_DIR=$(find . -name "main.tf" | grep -v ".terraform/modules" | sed -E 's~^./~~g' | sed -E 's~/main.tf$~~g')
TERRAFORM_TFVARS="${TERRAFORM_DIR}/terraform.tfvars"

if [[ -f "${TERRAFORM_TFVARS}" ]]; then
  cp "${TERRAFORM_TFVARS}" "${TERRAFORM_TFVARS}.backup"
  rm "${TERRAFORM_TFVARS}"
fi

if [[ -f "${CREDENTIALS_PROPERTIES}" ]]; then
  cp "${CREDENTIALS_PROPERTIES}" "${CREDENTIALS_PROPERTIES}.backup"
  rm "${CREDENTIALS_PROPERTIES}"
fi
touch "${CREDENTIALS_PROPERTIES}"

if [[ ! -f "${VARIABLES_FILE}" ]]; then
  echo "Variables can be provided in a yaml file passed as the first argument"
  echo ""
fi

TMP_VARIABLES_FILE="${VARIABLES_FILE}.tmp"

echo "variables: []" > ${TMP_VARIABLES_FILE}

function process_variable () {
  local name="$1"
  local default_value="$2"
  local sensitive="$3"
  local description="$4"

  local variable_name="TF_VAR_${name}"

  environment_variable=$(env | grep "${variable_name}" | sed -E 's/.*=(.*).*/\1/g')
  value="${environment_variable}"
  if [[ -f "${VARIABLES_FILE}" ]]; then
    value=$(cat "${VARIABLES_FILE}" | NAME="${name}" ${YQ} e -o json '.variables[] | select(.name == env(NAME)) | .value // ""' - | jq -c -r '.')
    if [[ -z "${value}" ]]; then
      value="${environment_variable}"
    fi
  fi

  while [[ -z "${value}" ]]; do
    echo "Provide a value for '${name}':"
    if [[ -n "${description}" ]]; then
      echo "  ${description}"
    fi
    sensitive_flag=""
    if [[ "${sensitive}" == "true" ]]; then
      sensitive_flag="-s"
    fi
    default_prompt=""
    if [[ -n "${default_value}" ]]; then
      default_prompt="(${default_value}) "
    fi
    read -u 1 ${sensitive_flag} -p "> ${default_prompt}" value
    value=${value:-$default_value}
  done

  output_value=$(echo "${value}" | sed 's/"/\\"/g')

  if [[ "${sensitive}" != "true" ]]; then
    echo "${name} = \"${output_value}\"" >> "${TERRAFORM_TFVARS}"
    NAME="${name}" VALUE="${value}" ${YQ} e -i -P '.variables += [{"name": env(NAME), "value": env(VALUE)}]' "${TMP_VARIABLES_FILE}"
  else
    echo "export ${name}=\"${output_value}\"" >> "${CREDENTIALS_PROPERTIES}"
  fi
}

cat "bom.yaml" | ${YQ} e '.spec.variables[] | .name' - | while read name; do
  variable=$(cat "bom.yaml" | NAME="${name}" ${YQ} e '.spec.variables[] | select(.name == env(NAME))' -)

  default_value=$(echo "${variable}" | ${YQ} e -o json '.defaultValue // ""' - | jq -c -r '.')
  sensitive=$(echo "${variable}" | ${YQ} e '.sensitive // false' -)
  description=$(echo "${variable}" | ${YQ} e '.description // ""' -)

  process_variable "${name}" "${default_value}" "${sensitive}" "${description}"
done

cat "${VARIABLES_FILE}" | ${YQ} e '.variables[]' -o json - | jq -c '.' | while read var; do
  name=$(echo "${var}" | jq -r '.name')

  value=$(echo "${var}" | jq -r '.value // empty')
  sensitive=$(echo "${var}" | jq -r '.sensitive')

  bom_var=$(cat bom.yaml | ${YQ} e '.spec.variables[]' -o json - | jq --arg NAME "${name}" -c 'select(.name == $NAME)')

  if [[ -z "${bom_var}" ]]; then
    process_variable "${name}" "${value}" "${sensitive}" ""
  fi
done

cp "${TMP_VARIABLES_FILE}" "${VARIABLES_FILE}"
rm "${TMP_VARIABLES_FILE}"

# shellcheck source=../credentials.properties
source "${CREDENTIALS_PROPERTIES}"

cd "${TERRAFORM_DIR}" || exit 1
terraform init
terraform apply
