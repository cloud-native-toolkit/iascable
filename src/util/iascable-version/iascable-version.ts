
export const getIascableVersion = () => {
  try {
    return require('../../../package.json').version
  } catch (err) {
    try {
      return require('../../../package.json').version
    } catch (err) {
      return ''
    }
  }
}
