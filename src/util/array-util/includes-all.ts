export const includesAll = <T>(arr: T[], contains: T[]): boolean => {
  return contains.every(arr.includes)
}
