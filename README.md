# IasCable

Library and CLI used to generate Infrastructure as Code installable components composed from a catalog of 
modules.

### CLI Usage

#### Installation

```shell
npm i -g @cloudnativetoolkit/iascable
```

#### Commands

```shell
iascable build [-u {CATALOG_URL}] [-i {BOM_INPUT}] [--name {COMPONENT_NAME}]
```

### Bill of Material schema

The Bill Of Material (BOM) yaml has been modeled after a Kubernetes Custom Resource Definition. A BOM 
is provided as input to the CLI, either a custom . By default, the module entries for the Bill of Material are pulled
from the Cloud Native Toolkit module catalog - https://modules.cloudnativetoolkit.dev/

In addition to identifying the modules, values can be provided for the variables and dependencies to
configure those modules. The variable names match up with the variable names in the module. The 
dependency `name`/`id` should match the `id` of the dependency in the module metadata. The `ref` value
should match the `name` or `alias` of one of the other modules in the BOM.

#### Example Bill of Material

```yaml
apiVersion: cloud.ibm.com/v1alpha1
kind: BillOfMaterial
metadata:
  name: common-services
spec:
  modules:
    - name: key-protect
    - name: ibm-object-storage
    - name: ibm-activity-tracker
    - name: sysdig
    - name: ibm-resource-group
    - name: logdna
    - name: ibm-access-group
    - name: ibm-vpc
    - name: scc-collector
      dependencies:
        - name: subnets
          ref: scc-subnets
    - name: hpcs
      variables:
        - name: provision
          value: false
    - name: ibm-vpc-subnets
      alias: scc-subnets
      variables:
        - name: subnet_count
          value: 1
        - name: subnet_label
          value: scc
  variables:
    - name: resource_group_name
      value: test
```

### API Usage

### NPM scripts

 - `npm t`: Run test suite
 - `npm start`: Run `npm run build` in watch mode
 - `npm run test:watch`: Run test suite in [interactive watch mode](http://facebook.github.io/jest/docs/cli.html#watch)
 - `npm run test:prod`: Run linting and generate coverage
 - `npm run build`: Generate bundles and typings, create docs
 - `npm run lint`: Lints code
 - `npm run commit`: Commit using conventional commit style ([husky](https://github.com/typicode/husky) will tell you to use it if you haven't :wink:)

### Change Log

- **11/2021** - Updated to use Client-to-site VPN service (beta) instead of a VSI running a VPN server
- **11/2021** - Updated to support the Edge VPC infrastructure in addition to Management and Workload VPCs.

