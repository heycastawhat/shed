import { bodyAgent } from '#lib/sign.js';
import { apiPage, type FoundPull, type Label } from './forgejo.js';

export type Change = {
	repo: string;
	number: number;
	title: string;
	author: string;
	agent?: string;
	avatar: string;
	updated: string;
	comments: number;
	draft: boolean;
	labels: Label[];
	href: string;
};

const shape = (p: FoundPull): Change => ({
	repo: p.repository.full_name,
	number: p.number,
	title: p.title,
	author: p.user.login,
	agent: bodyAgent(p.body ?? ''),
	avatar: p.user.avatar_url,
	updated: p.updated_at,
	comments: p.comments,
	draft: !!p.pull_request?.draft,
	labels: p.labels ?? [],
	href: `/${p.repository.full_name}/pulls/${p.number}`
});

// Open pull requests that match one of Forgejo's per-user filters.
export async function search(token: string, filter: 'created' | 'review_requested' | 'mentioned' | 'assigned') {
	const { items } = await apiPage<FoundPull>(token, `/repos/issues/search?type=pulls&state=open&${filter}=true&limit=50&sort=recentupdate`);
	return items.map(shape);
}
