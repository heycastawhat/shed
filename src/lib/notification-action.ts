export function notificationAction(search: URLSearchParams, action: 'mark' | 'all') {
	const query = new URLSearchParams(search);
	for (const key of query.keys()) if (key.startsWith('/')) query.delete(key);
	return `?/${action}&${query}`;
}
