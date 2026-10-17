<script lang="ts" module>
	import Bot from '@lucide/svelte/icons/bot';
	import Branch from '@lucide/svelte/icons/git-branch';
	import Code from '@lucide/svelte/icons/code-xml';
	import Commit from '@lucide/svelte/icons/git-commit-horizontal';
	import File from '@lucide/svelte/icons/file';
	import Diff from '@lucide/svelte/icons/file-diff';
	import Folder from '@lucide/svelte/icons/folder';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Message from '@lucide/svelte/icons/message-square';
	import Lock from '@lucide/svelte/icons/lock';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import PaletteIcon from '@lucide/svelte/icons/palette';
	import Sun from '@lucide/svelte/icons/sun';
	import Pin from '@lucide/svelte/icons/pin';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Clock from '@lucide/svelte/icons/clock';
	import External from '@lucide/svelte/icons/external-link';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import Merge from '@lucide/svelte/icons/git-merge';
	import House from '@lucide/svelte/icons/house';
	import PanelLeft from '@lucide/svelte/icons/panel-left';
	import PinOff from '@lucide/svelte/icons/pin-off';
	import Plus from '@lucide/svelte/icons/plus';
	import Repo from '@lucide/svelte/icons/folder-git-2';
	import Search from '@lucide/svelte/icons/search';
	import Sliders from '@lucide/svelte/icons/sliders-horizontal';
	import X from '@lucide/svelte/icons/x';

	const ICONS = {
		home: House,
		merge: Merge,
		code: Code,
		commit: Commit,
		branch: Branch,
		file: File,
		folder: Folder,
		diff: Diff,
		inbox: Inbox,
		message: Message,
		lock: Lock,
		monitor: Monitor,
		moon: Moon,
		palette: PaletteIcon,
		sun: Sun,
		pin: Pin,
		changes: GitPullRequest,
		repos: Repo,
		agents: Bot,
		search: Search,
		plus: Plus,
		unpin: PinOff,
		left: ChevronLeft,
		right: ChevronRight,
		sliders: Sliders,
		layout: PanelLeft,
		check: Check,
		clock: Clock,
		external: External,
		chevron: ChevronDown,
		x: X
	};
</script>

<script lang="ts">
	let { name, size = 16 }: { name: keyof typeof ICONS | (string & {}); size?: number } = $props();
	const Svg = $derived(ICONS[name as keyof typeof ICONS]);
</script>

<Svg {size} strokeWidth={1.75} aria-hidden="true" style="flex: none" />
