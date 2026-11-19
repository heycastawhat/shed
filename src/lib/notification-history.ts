export function refreshRestoredNotifications(event: Pick<PageTransitionEvent, 'persisted'>, refresh: () => Promise<void>) {
	if (event.persisted) return refresh();
}
