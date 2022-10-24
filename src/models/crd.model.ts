
export interface ResourceMetadata {
  name: string;
  labels?: any;
  annotations?: any;
}

export interface CustomResourceDefinition {
  apiVersion?: string;
  kind?: string;
  metadata?: ResourceMetadata
}

export interface KubernetesResource<T = any> extends CustomResourceDefinition {
  spec: T;
}

export const getLabel = (obj: CustomResourceDefinition, labelKey: string): string | undefined => {
  const labels = obj.metadata?.labels || {}

  return labels[labelKey]
}

export const getAnnotation = (obj: CustomResourceDefinition, annotationKey: string): string | undefined => {
  const annotations = obj.metadata?.annotations || {}

  return annotations[annotationKey]
}

export const getAnnotationList = (obj: CustomResourceDefinition, annotationKey: string): string[] => {
  const value: string = getAnnotation(obj, annotationKey) || ''

  return value.split(',').filter(v => !!v)
}

export const getMetadataName = (obj: CustomResourceDefinition, defaultName: string = 'component'): string => {
  return obj.metadata?.name || defaultName
}
