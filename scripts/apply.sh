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

if [[ -f "terraform/terraform.tfvars" ]]; then
  cp "terraform/terraform.tfvars" "terraform/terraform.tfvars.backup"
  rm "terraform/terraform.tfvars"
fi

if [[ -f "credentials.properties" ]]; then
  cp "credentials.properties" "credentials.properties.backup"
  rm "credentials.properties"
fi
touch credentials.properties

if [[ ! -f "${VARIABLES_FILE}" ]]; then
  echo "Variables can be provided in a yaml file passed as the first argument"
  echo ""
fi

TMP_VARIABLES_FILE="${VARIABLES_FILE}.tmp"

echo "variables: []" > ${TMP_VARIABLES_FILE}

cat "bom.yaml" | ${YQ} e '.spec.variables[] | .name' - | while read name; do
  variable=$(cat "bom.yaml" | NAME="${name}" ${YQ} e '.spec.variables[] | select(.name == env(NAME))' -)

  default_value=$(echo "${variable}" | ${YQ} e -o json '.defaultValue // ""' - | jq -c -r '.')
  sensitive=$(echo "${variable}" | ${YQ} e '.sensitive // false' -)
  description=$(echo "${variable}" | ${YQ} e '.description // ""' -)

  variable_name="TF_VAR_${name}"

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
    echo "${name} = \"${output_value}\"" >> "terraform/terraform.tfvars"
    NAME="${name}" VALUE="${value}" ${YQ} e -i -P '.variables += [{"name": env(NAME), "value": env(VALUE)}]' "${TMP_VARIABLES_FILE}"
  else
    echo "export ${name}=\"${output_value}\"" >> "credentials.properties"
  fi
done

cp "${TMP_VARIABLES_FILE}" "${VARIABLES_FILE}"
rm "${TMP_VARIABLES_FILE}"

source credentials.properties

cd terraform
terraform init
terraform apply
