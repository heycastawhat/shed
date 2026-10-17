export const refPath = (ref: string, path = '') =>
	[encodeURIComponent(ref), ...path.split('/').filter(Boolean).map(encodeURIComponent)].join('/');
