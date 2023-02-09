
export const flatten = <T>(result: T[], current: T[]): T[] => {
  if (current) {
    return result.concat(...current)
  }

  return result
}

export const flattenReverse = <T>(result: T[], current: T[]): T[] => {
  if (current) {
    return current.concat(...result)
  }

  return result
}
