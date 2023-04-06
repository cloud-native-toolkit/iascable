
export interface CapabilityModuleDependencyModel {
  module: string
}

export interface CapabilityInterfaceDependencyModel {
  interface: string
  excludeModule?: string
}

export type CapabilityDependencyModel = CapabilityInterfaceDependencyModel | CapabilityModuleDependencyModel

export const isCapabilityModuleDependencyModel = (val: any): val is CapabilityModuleDependencyModel => {
  return !!val && !!val.module
}

export const isCapabilityInterfaceDependencyModel = (val: any): val is CapabilityInterfaceDependencyModel => {
  return !!val && !!val.interface
}

export interface CapabilityDependencyMappingModel {
  source: string
  destination: string
  destinationGlobal?: boolean
}

export interface CapabilityModel {
  name: string;
  providers: CapabilityDependencyModel[]
  consumers: CapabilityDependencyModel[]
  providerAliasModule?: string
  defaultProviderAlias?: string
  defaultConsumerAlias?: string
  mapping: CapabilityDependencyMappingModel[]
}
