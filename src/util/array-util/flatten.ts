
export const flatten = <T>(result: T[], current: T[]): T[] => {
  if (current) {
    result.push(...current)
  }

  return result
}
