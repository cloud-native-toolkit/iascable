// @ts-ignore
import Optional from 'js-optional'

export const first = <T>(arr: T[] = []): Optional<T> => {
  if (arr.length === 0) {
    return Optional.empty()
  }

  return Optional.ofNullable(arr[0])
}

export const last = <T>(arr: T[] = []): Optional<T> => {
  if (arr.length === 0) {
    return Optional.empty()
  }

  return Optional.ofNullable(arr[arr.length - 1])
}
