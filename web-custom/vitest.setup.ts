import { configure } from '@testing-library/react'

/**
 * Testing Library's `findBy*` queries wait 1000ms by default. That is comfortable for a
 * file run on its own, but this suite runs ~1700 tests across parallel workers, and under
 * that load a render that normally settles in 150ms can miss the window — producing
 * failures that move between runs and point at whichever test happened to be unlucky.
 *
 * The tests themselves are not slow; the default is simply tight for a suite this size.
 * 5000ms still lost the heaviest pages (the playground renders a streaming transcript and
 * markdown) whenever the workers were busy, so the budget is generous rather than tuned —
 * a passing test never waits this long, and only a genuinely hung one pays the cost.
 */
configure({ asyncUtilTimeout: 15000 })
