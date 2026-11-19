export function watchNotifications(stream: Pick<EventSource, 'addEventListener' | 'close'>, refresh: () => Promise<void>) {
	const update = () => { void refresh(); };
	let connected = false;
	stream.addEventListener('ready', () => {
		if (connected) update();
		connected = true;
	});
	stream.addEventListener('notification', update);
	return () => stream.close();
}
