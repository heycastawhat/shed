const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const units = [
	['year', 31536000],
	['month', 2592000],
	['week', 604800],
	['day', 86400],
	['hour', 3600],
	['minute', 60]
] as const;

export function ago(date: string) {
	const s = (new Date(date).getTime() - Date.now()) / 1000;
	for (const [unit, secs] of units) if (Math.abs(s) >= secs) return rtf.format(Math.round(s / secs), unit);
	return 'just now';
}
