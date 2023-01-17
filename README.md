# IasCable

Library and CLI used to generate Infrastructure as Code installable components composed of available modules from a catalog.

## CLI Usage

### Installation (non-M1 Macbook)

To install the latest version of iascable into `/usr/local/bin`, run the following:

```shell
curl -sL https://iascable.cloudnativetoolkit.dev/install.sh | sh
```

If you would like to install a different version of the CLI and/or put it in a different directory, use the following:

```shell
curl -sL https://iascable.cloudnativetoolkit.dev/install.sh | RELEASE=2.15.1 DEST_DIR=~/bin sh
```

### Installation on M1 Macbook
The M1 Macbook version will install the AMD64 binary and requires Rosetta to be installed. If you do not have Rosetta installed, see [this](https://support.apple.com/en-us/HT211861) link.

To install the latest version of iascable into `/usr/local/bin`, as above for non-M1 Macbooks, however add a sudo to write to /usr/local/bin as follows:

```shell
curl -sL https://iascable.cloudnativetoolkit.dev/install.sh | sudo sh
```

If you would like to install a different version of the CLI and/or put it in a different directory, use the following:

```shell
curl -sL https://iascable.cloudnativetoolkit.dev/install.sh | RELEASE=2.15.1 DEST_DIR=~/bin sh
```

Note that the install script creates a new binary for the downloaded version and creates a symbolic link to it. Over time, you may build up multiple versions in your destination directory which may need to be manually removed if not required. This also allows for using a prior version by updating the symbolic link to point to a different version as follows:

```shell
sudo ln -s /usr/local/bin/iascable-2.25.5 /usr/local/bin/iascable
```

### Install beta version

If you would like to install the latest beta release of the cli, use the following:

```shell
curl -sL https://iascable.cloudnativetoolkit.dev/install.sh | RELEASE=beta sh
```

If you would like to put the beta version of the cli in another directory you can provide a value for the DEST_DIR
argument.

### Commands

To build a Terraform template from a Bill of Materials or Solution Bill of Materials, run the following command:

```shell
iascable build [-c {CATALOG_URL}] [-c {CATALOG_URL}] -i {BOM_INPUT} [-i {BOM_INPUT}] [-o {OUTPUT_DIR}]
```

where:
- `CATALOG_URL` is the url of the module catalog. The default module catalog is  https://modules.cloudnativetoolkit.dev/index.yaml. Multiple module catalogs can be provided. The catalogs are combined, with the last one taking precedence in the case of duplicate modules.
- `BOM_INPUT` is the input file containing the Bill of Material or Solution Bill of Material definition. Multiple bom files can be provided at the same time.
- `OUTPUT_DIR` is the directory where the output terraform template will be generated.

## Library usage

The Iascable cli can be added to any npm application using the normal `npm install` process:

```shell
npm install --save iascable
```

### Install beta

If you want to install the `beta` release of the cli, include the dist-tag with the package name. E.g.:

```shell
npm install --save iascable@beta
```

## Getting started

### First Bill of Materials

1. Copy the following yaml into a file named `firstbom.yaml`

```yaml
apiVersion: cloudnativetoolkit.dev/v1alpha1
kind: BillOfMaterial
metadata:
  name: ibm-vpc
spec:
  modules:
    - name: ibm-vpc
    - name: ibm-vpc-subnets
```

2. Generate the terraform with:

```shell
iascable build -i firstbom.yaml
```

3. The command will look up the modules from the catalog and generate the output in a folder named `output/ibm-vpc/terraform`. Take a look at the `main.tf`. You will see a number of modules defined there. Some of the variables in the `ibm-vpc-subnets` module will come from the output of the `ibm-vpc` module. 
4. Look at the `ibm-roks.auto.tfvars` file. This file will contain a listing of the variables that must be provided. They can either be provided in the `ibm-roks.auto.tfvars` file or the terraform cli will prompt for them when `terraform plan` or `terraform apply` are run.
5. If you have an IBM Cloud account, you can provision the VPC and Subnets by running the following:

```shell
terraform init
terraform apply -auto-approve
```

6. To destroy the provisioned resources, run the following:

```shell
terraform destroy -auto-approve
```

### Provide configuration for the VPCs

One of the common values that will be configured in the VPCs and Subnets are the network IP addresses or CIDR blocks that will be used by the VPC network. We can configure those values in the BOM. 

1. Copy the following yaml into a file named `secondbom.yaml`

```yaml
apiVersion: cloudnativetoolkit.dev/v1alpha1
kind: BillOfMaterial
metadata:
  name: ibm-vpc2
spec:
  modules:
    - name: ibm-vpc
      variables:
        - name: address_prefix_count
          value: 3
        - name: address_prefixes
          value:
            - 10.1.0.0/18
            - 10.2.0.0/18
            - 10.3.0.0/18
    - name: ibm-vpc-subnets
      variables:
        - name: _count
          value: 3
        - name: ipv4_cidr_blocks
          value:
            - 10.1.10.0/24
            - 10.2.10.0/24
            - 10.3.10.0/24
```

2. Generate the terraform with:

```shell
iascable build -i secondbom.yaml
```

3. The generated output will be in a folder named `output/ibm-vpc2/terraform`. The `main.tf` file will look the same. However, you will see that the `variables.tf` file has different values for the `address_prefixes` and `ipv4_cidr_blocks` variables.

4. If you have an IBM Cloud account, you can provision the VPC and Subnets by running the following:

```shell
terraform init
terraform apply -auto-approve
```

5. To destroy the provisioned resources, run the following:

```shell
terraform destroy -auto-approve
```

### IBM ROKS Bill of Materials

The following BOM will provision a VPC, VPC Subnet set, VPC Gateways, and a Red Hat OpenShift cluster.

```yaml
apiVersion: cloudnativetoolkit.dev/v1alpha1
kind: BillOfMaterial
metadata:
  name: ibm-roks
spec:
  modules:
    - name: ibm-vpc
    - name: ibm-vpc-subnets
    - name: ibm-vpc-gateways
    - name: ibm-ocp-vpc
      variables:
        - name: worker_count
          value: 1
```

## Bill of Material structure

The Bill Of Materials (BOM) yaml has been modeled after a Kubernetes Custom Resource Definition. It is used to define the modules from the module catalog that should be included in the generated terraform template. As appropriate the Bill of Materials can also be used to define the relationships between the modules and the default variables that should be supplied to the modules for the architecture.

The terraform template is generated from the BOM using the `iascable build` command. The build process relies on metadata for each of the modules stored in the module catalog to understand each module's dependencies and the relationships between the different modules. By default, the module entries for the Bill of Material are pulled from the Cloud Native Toolkit module catalog - https://modules.cloudnativetoolkit.dev/

### BOM metadata

The first part of the BOM defines the name and other descriptive information about the terraform that will be generated.

```yaml
apiVersion: cloudnativetoolkit.dev/v1alpha1
kind: BillOfMaterial
metadata:
  name: 100-shared-services
  labels:
    platform: ibm
    code: '100'
  annotations:
    displayName: Shared Services
    description: Provisions a set of shared services in the IBM Cloud account
```

**Note:** The `labels` and `annotations` sections can contain any number of values. The common values are shown in the example.

| Field                                 | Description                                                                            |
|---------------------------------------|----------------------------------------------------------------------------------------|
| **apiVersion**                        | the schema version of the BOM (always `cloudnativetoolkit.dev/v1alpha1` at the moment) |
| **kind**                              | the kind of resource (always `BillOfMaterial` for a BOM)                               |
| **name**                              | the name of the architecture that will be built                                        |
| **platform** label                    | the cloud platform targeted by the architecture                                        |
| **code** label                        | the code used to index the BOM                                                         |
| **displayName** annotation            | the user-friendly display name for the BOM                                             |
| **description** annotation            | the description of the provisioned architecture                                        |
| **path** annotation                   | the sub-path that should be appended to the output (e.g. {output}/{path}/{name}        |
| **catalogUrls** annotation            | comma-separated list of urls for the catalogs containing the BOM modules               |
| **deployment-type/gitops** annotation | flag indicating the BOM describes gitops modules                                       |
| **vpn/required** annotation           | flag indicating a VPN connection is required before applying the terraform             |

### BOM spec

The meat of the BOM is defined in the **spec** block. The **spec** can contain the following top level elements:

- **modules** - an array of Bill of Material module definitions
- **variables** - (optional) an array of Bill of Material variables used to define the global variables in the terraform template
- **providers** - (optional) an array of terraform provider configurations

#### BOM module definition

A BOM module is used to define a module that should be added to the generated terraform template. At a minimum, the BOM Module must define `name` of the module from the module catalog. Optionally, the module can also define an `alias` that will be used for the module identifier in the generated terraform and will also be used as the identifier when defining dependencies between modules.

##### BOM Module dependencies

If the module depends on other modules, the relationships can be defined in the `dependencies` block. However, in most cases it is not necessary to explicitly define the dependencies. Through the module metadata, the `iascable` tool knows the required dependencies for each module and can "auto-wire" the modules together. If necessary, `iascable` will automatically add modules to the BOM if they are required to satisfy a required module dependency.

If there are multiple instances of a dependent module defined in the BOM then `iascable` will "auto-wire" the dependency to the "default" dependent module. The "default" dependent module is the one that uses the default alias name OR has the `default: true` attribute added to it. If a default cannot be identified then ANOTHER instance of the module will be automatically added to the BOM. If this behavior is not desired then the desired dependent module can be referenced in the `dependencies` block. 

For example:

```yaml
spec:
  modules:
  - name: ibm-vpc
  - name: ibm-vpc-subnets
    alias: edge_subnets
  - name: ibm-vpc-subnets
    alias: cluster_subnets
  - name: ibm-vpc-subnets
    alias: vpe_subnets
  - name: ibm-vpc-ocp
```

The `ibm-vpc-subnets` module depends on `ibm-vpc`. An explicit declaration of the dependency is not required here though because the `ibm-vpc` module is the default instance and all of the `ibm-vpc-subnets` are auto-wired to that instance. (In fact the `ibm-vpc` module doesn't even need to be explictly listed in the BOM in this case, but it is added for completeness.) The `ibm-vpc-ocp` module depends on `ibm-vpc-subnets` to identify where the cluster should be deployed. In this configuration, a default `ibm-vpc-subnets` instance has not been defined. As a result, `iascable` will automatically pull in 4th `ibm-vpc-subnets` instance to satisfy the dependency. This is probably not the desired result and we will want to explicitly define the dependency in the BOM. The updated BOM would look like the following:

```yaml
spec:
  modules:
  - name: ibm-vpc
  - name: ibm-vpc-subnets
    alias: edge_subnets
  - name: ibm-vpc-subnets
    alias: cluster_subnets
  - name: ibm-vpc-subnets
    alias: vpe_subnets
  - name: ibm-vpc-ocp
    dependencies:
      - id: subnets
        ref: cluster_subnets
```

The `subnets` identifier in the dependencies array refers to the dependency identifier in the module metadata for the `ibm-vpc-ocp` module. The `clsuter_subnets` value refers to the alias of the target `ibm-vpc-subnets` module instance.

**Note:** The only exception to `iascable` automatically pulling dependent modules into the BOM is if there are multiple module options that satisfy the dependency. In this case one of the modules that satisfies dependency must be explicitly added to the BOM. Otherwise the `iasable build` command will give an error that the dependency cannot be resolved. 

##### BOM Module variables

The Bill of Materials also allows the module variables to be configured in a `variables` block. The `variables` block is an array of variable definitions. At a minimum the variable `name` must be provided. The available variable names are defined in the module metadata. For each variable, the following values can be provided:

| Field     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
|-----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **value** | The default value of the variable. This value will override the default in the module.                                                                                                                                                                                                                                                                                                                                                                                           |
| **scope** | The scope of the variable that defines how the variable will be handled in the global variable namespace. Allowed values are `global` or `module`. If the value is `global` the variable will be added as-is to the global namespace. If the value is `module` then the variable name will be prefixed with the module alias (e.g. the `flavor` variable in the `cluster` module would be named `cluster_flavor` with `module` scope and `flavor` with `global` scope).          |
| **alias** | The alias name that should be given to the variable in the global variable namespace. This alias works in conjunction with the `scope` value. For example, if the `name` variable is set to `global` scope and `alias` of `my_name` then a variable named `my_name` will be added to the global variable namespace and the generated module terraform will map the `my_name` global variable to the `name` module variable (`name = var.my_name`)                                |
| **important** | Flag that indicates the variable should be presented to the user in the generated `*.auto.tfvars` file even though it has a default value. By default, only required fields (i.e. fields that don't have a default value) are presented to the user. Selectively, other variables can be exposed using this flag for significant configuration values. The objective is to balance flexibility of configuration options with the simplicity of a small number of required inputs |

**Note:** The module metadata defines how the outputs from the dependent modules should be wired into a module's input variables. It is not necessary to define any of the "wired" variables in the BOM.

#### Example Bill of Material

```yaml
apiVersion: cloudnativetoolkit.dev/v1alpha1
kind: BillOfMaterial
metadata:
  name: 130-management-vpc-openshift
  labels:
    type: infrastructure
    platform: ibm
    code: '130'
  annotations:
    displayName: Management VPC OpenShift
    description: Management VPC and Red Hat OpenShift servers
spec:
  modules:
    - name: ibm-resource-group
      alias: kms_resource_group
      variables:
        - name: provision
          value: false
    - name: ibm-resource-group
      alias: at_resource_group
      variables:
        - name: provision
          value: false
    - name: ibm-kms
      alias: kms
      variables:
        - name: provision
          value: false
        - name: region
          alias: kms_region
        - name: name_prefix
          alias: kms_name_prefix
          scope: global
          value: ""
      dependencies:
        - name: resource_group
          ref: kms_resource_group
    - name: ibm-resource-group
      variables:
        - name: resource_group_name
          alias: mgmt_resource_group_name
          scope: global
        - name: provision
          alias: mgmt_resource_group_provision
          scope: global
    - name: ibm-access-group
    - name: ibm-vpc
      variables:
        - name: address_prefix_count
          value: 3
        - name: address_prefixes
          value:
            - 10.10.0.0/18
            - 10.20.0.0/18
            - 10.30.0.0/18
    - name: ibm-flow-logs
      dependencies:
        - name: target
          ref: ibm-vpc
        - name: cos_bucket
          ref: flow_log_bucket
    - name: ibm-vpc-gateways
    - name: ibm-vpc-subnets
      alias: worker-subnets
      variables:
        - name: _count
          alias: mgmt_worker_subnet_count
          scope: global
          value: 3
        - name: label
          value: worker
        - name: ipv4_cidr_blocks
          value:
            - 10.10.10.0/24
            - 10.20.10.0/24
            - 10.30.10.0/24
      dependencies:
        - name: gateways
          ref: ibm-vpc-gateways
    - name: ibm-ocp-vpc
      alias: cluster
      variables:
        - name: disable_public_endpoint
          value: true
        - name: kms_enabled
          value: true
        - name: worker_count
          alias: mgmt_worker_count
        - name: ocp_version
          value: 4.8
      dependencies:
        - name: subnets
          ref: worker-subnets
        - name: kms_key
          ref: kms_key
    - name: ibm-vpc-subnets
      alias: vpe-subnets
      variables:
        - name: _count
          value: 3
        - name: label
          value: vpe
        - name: ipv4_cidr_blocks
          value:
            - 10.10.20.0/24
            - 10.20.20.0/24
            - 10.30.20.0/24
    - name: ibm-vpc-subnets
      alias: ingress-subnets
      variables:
        - name: _count
          value: 3
        - name: label
          value: ingress
        - name: ipv4_cidr_blocks
          value:
            - 10.10.30.0/24
            - 10.20.30.0/24
            - 10.30.30.0/24
    - name: ibm-vpc-vpn-gateway
      dependencies:
        - name: subnets
          ref: vpn-subnets
    - name: ibm-resource-group
      alias: cs_resource_group
      variables:
        - name: provision
          value: false
    - name: ibm-object-storage
      alias: cos
      variables:
        - name: provision
          value: false
        - name: name_prefix
          alias: cs_name_prefix
          scope: global
      dependencies:
        - name: resource_group
          ref: cs_resource_group
    - name: ibm-kms-key
      variables:
        - name: provision
          value: true
      dependencies:
        - name: kms
          ref: kms
    - name: ibm-activity-tracker
      variables:
        - name: provision
          value: false
      dependencies:
        - name: resource_group
          ref: at_resource_group
    - name: ibm-object-storage-bucket
      alias: flow_log_bucket
      variables:
        - name: label
          value: flow-logs
        - name: allowed_ip
          value:
            - 0.0.0.0/0
    - name: ibm-vpe-gateway
      alias: vpe-cos
      dependencies:
        - name: resource
          ref: cos
        - name: subnets
          ref: vpe-subnets
        - name: sync
          ref: cluster
    - name: ibm-transit-gateway
      variables:
        - name: provision
          value: false
        - name: name_prefix
          alias: cs_name_prefix
          scope: global
      dependencies:
        - name: resource-group
          ref: cs_resource_group
    - name: logdna
      variables:
        - name: provision
          value: false
        - name: name_prefix
          alias: cs_name_prefix
          scope: global
      dependencies:
        - name: resource_group
          ref: cs_resource_group
    - name: sysdig
      variables:
        - name: provision
          value: false
        - name: name_prefix
          alias: cs_name_prefix
          scope: global
      dependencies:
        - name: resource_group
          ref: cs_resource_group
    - name: ibm-logdna-bind
    - name: sysdig-bind
  variables:
    - name: mgmt_resource_group_name
    - name: mgmt_resource_group_provision
    - name: region
    - name: ibmcloud_api_key
    - name: name_prefix
      alias: mgmt_name_prefix
      required: true
    - name: cs_resource_group_name
    - name: cs_name_prefix
    - name: worker_count
    - name: kms_service
```

### API Usage

## Development

### Basic flow

The IasCable application is built with JavaScript/Typescript. The development process follows standard JavaScript development activities with perhaps one small deviation.
To make development updates to IasCable, do the following (all of this assumes you have already cloned the repository):

1. Before starting, make sure you have installed the latest dependencies by running `npm ci`
2. Create a branch for your work by running `git checkout -b {branch_name}`
3. Start the tests by running `npm run tdd`
4. Make updates to the unit tests and the application code. The unit tests should re-run every time the code is changed
5. When you are done with the code changes, press `Ctrl-C` to stop the tdd process
6. Build the application code with `npm run build`
7. To run your local build of IasCable, use the `iascable` script in the repository directory. E.g. `./iascable build -i examples/baseline-ocp2.yaml`
8. Commit and push your branch to the repo
9. Create a pull request for the branch. Add a release tag (`major`, `minor`, or `patch`) to the pull request based on the type/complexity of the change. Add a changelog tag (`enhancement`, `bug`, or `chore`) based on the type of change
10. When the checks pass, the pull request can be squashed and merged to the main branch

### General code structure

All of the source code can be found under the `src/` directory.

- `src/commands` contains the command-line logic based on the Yargs package. This is a thin wrapper to translate command-line arguments into service requests
- `src/errors` contains the different error types
- `src/models` contains the data models
- `src/services` contains the api layer with the business logic for the package. The services are sub-divided into functional areas - `catalog-loader`, `module-selector`, `terraform-builder`, `dependency-graph`, `module-documentation`, etc
- `src/util` contains common utilities

### NPM scripts

 - `npm t`: Run test suite
 - `npm start`: Run `npm run build` in watch mode
 - `npm run test:watch`: Run test suite in [interactive watch mode](http://facebook.github.io/jest/docs/cli.html#watch)
 - `npm run test:prod`: Run linting and generate coverage
 - `npm run build`: Generate bundles and typings, create docs
 - `npm run lint`: Lints code
 - `npm run commit`: Commit using conventional commit style ([husky](https://github.com/typicode/husky) will tell you to use it if you haven't :wink:)

## Creating a beta release

Currently, the process of tagging a beta release is somewhat manual because the release-drafter action doesn't 
handle calculating the version numbers across different branches with different naming schemes. In order to create a beta release,
do the following:

1. Check out the beta branch and pull the latest, if a beta branch does not exist (because we have merged the results) create a new beta branch off of main
2. Create a branch for your changes
3. Create a PR for your branch and set it to merge to `beta`
4. In your branch changes, update the `version` value in package.json. Increment the base version 
   number as appropriate (e.g. `2.5.2` to `2.6.0` or `3.0.0`) and add `-beta.x` to the end. The idea is
   for the `x` in `-beta.x` to increment as updates to your beta changes are made.
5. When your branch is ready, merge the PR into `beta`. (**Note**: this will not trigger an automatic release so you have an opportunity to make updates before the next step)
6. Change to the beta branch and create an annotated tag on the beta branch that matches the version number in package.json.

    ```shell
    git tag -a v{version} -m {message}
    ```

    where:
      - `{version}` is the version number in package.json
      - `{message}` is a message about the release (e.g. the first line of the commit message)

7. Push the tag to the remote

    ```shell
    git push --tags
    ```

8. In the browser, create a new release. Be sure to pick the tag you just created for the release tag and check the "pre-release" box. Provide the tag name as the release title and press the "Generate changelog"
9. Once the release is created, it will trigger a workflow to push the new version to the npm registry and to attach the assets to the release.

