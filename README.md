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

The Bill Of Material (BOM) yaml has been modeled after a Kubernetes Custom Resource Definition. A BOM can be provided as input to the CLI and will also be generated when using the CLI interactively.

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
