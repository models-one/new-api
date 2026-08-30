import { configure } from '@testing-library/react'

/**
 * Testing Library's `findBy*` queries wait 1000ms by default. That is comfortable for a
 * file run on its own, but this suite runs ~1700 tests across parallel workers, and under
 * that load a render that normally settles in 150ms can miss the window — producing
 * failures that move between runs and point at whichever test happened to be unlucky.
 *
 * The tests themselves are not slow; the default is simply tight for a suite this size.
 */
configure({ asyncUtilTimeout: 5000 })
