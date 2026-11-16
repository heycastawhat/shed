package dev.shed.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Which GitHub release counts as newer than the installed build (CI names releases 0.1.x, dev builds 0.0.0-dev.N).
class UpdatesTest {
	@Test fun newerVersions() {
		assertTrue(Updates.isNewer("0.1.10", "0.1.9"))
		assertTrue(Updates.isNewer("0.2.0", "0.1.12"))
		assertTrue(Updates.isNewer("0.1.0", "0.0.0-dev.40"))
		assertTrue(Updates.isNewer("0.1.4", "0.1.4-dev.3"))
		// android-7 and earlier were named after the branch.
		assertTrue(Updates.isNewer("0.1.10", "shed-android-7"))
	}

	@Test fun notNewer() {
		assertFalse(Updates.isNewer("0.1.9", "0.1.9"))
		assertFalse(Updates.isNewer("0.1.9", "0.1.10"))
		assertFalse(Updates.isNewer("0.1.4-dev.3", "0.1.4"))
	}
}
