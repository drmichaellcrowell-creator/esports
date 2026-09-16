// React reads this to decide whether act() applies. Declared here because it is
// a test-environment flag, not part of any shipped global.
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
export {}
