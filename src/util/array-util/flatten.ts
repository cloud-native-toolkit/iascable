
export const flatten = <T>(result: T[], current: T[]): T[] => {
  result.push(...current)

  return result
}
