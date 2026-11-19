export function watchNotifications(stream: Pick<EventSource, 'addEventListener' | 'close'>, refresh: () => Promise<void>) {
	const update = () => { void refresh(); };
	stream.addEventListener('ready', update);
	stream.addEventListener('notification', update);
	return () => stream.close();
}
