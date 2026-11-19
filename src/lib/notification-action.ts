export function notificationAction(search: Pick<URLSearchParams, 'toString'>, action: 'mark' | 'all') {
	const query = new URLSearchParams(search.toString());
	for (const key of [...query.keys()]) if (key.startsWith('/')) query.delete(key);
	return `?/${action}&${query}`;
}
