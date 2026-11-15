// Five-field cron (minute hour day-of-month month day-of-week), as GitHub's `schedule:` takes it, in UTC.
const NAMES: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

function field(spec: string, [lo, hi]: [number, number]) {
	const out = new Set<number>();
	for (const part of spec.toLowerCase().split(',')) {
		const [range, stepText] = part.split('/');
		const step = stepText ? Number(stepText) : 1;
		const num = (s: string) => (s in NAMES ? NAMES[s] : Number(s));
		let [a, b] = range === '*' ? [lo, hi] : range.includes('-') ? range.split('-').map(num) : [num(range), stepText ? hi : num(range)];
		if (![a, b, step].every(Number.isInteger) || step < 1 || a < lo || b > hi || a > b) throw new Error(`Bad cron field "${spec}"`);
		for (; a <= b; a += step) out.add(a);
	}
	return out;
}

export function parseCron(expr: string) {
	const parts = expr.trim().split(/\s+/);
	if (parts.length !== 5) throw new Error(`Cron needs five fields: "${expr}"`);
	const [min, hour, dom, mon, dow] = parts.map((p, i) => field(p, RANGES[i]));
	if (dow.has(7)) dow.add(0);
	const domAny = parts[2] === '*', dowAny = parts[4] === '*';
	return (d: Date) => {
		if (!min.has(d.getUTCMinutes()) || !hour.has(d.getUTCHours()) || !mon.has(d.getUTCMonth() + 1)) return false;
		// As in cron: when both day fields are restricted, either may match.
		const byDom = dom.has(d.getUTCDate()), byDow = dow.has(d.getUTCDay());
		return domAny && dowAny ? true : domAny ? byDow : dowAny ? byDom : byDom || byDow;
	};
}
