// React only applies act()'s update-flushing guarantees when it believes it is
// in a test environment. Without this flag the warning is not cosmetic: state
// updates can settle outside the act() call a test is awaiting, which makes an
// assertion pass or fail on timing rather than on behaviour.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Unmounts anything a test rendered. Without this each test inherits the
// previous test's DOM, and a query that should match one element matches
// several — which looks like a product bug and is not one.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
