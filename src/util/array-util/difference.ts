export const rightDifference = <T>(arr1: T[], arr2: T[]): T[] => {
  return arr2.reduce((result: T[], current: T) => {
    if (!arr1.includes(current)) {
      result.push(current)
    }

    return result
  }, [])
}

export const leftDifference = <T>(arr1: T[], arr2: T[]): T[] => {
  return rightDifference(arr2, arr1)
}
