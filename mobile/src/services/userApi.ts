import { buildApiUrl } from '../config/api';

export type User = {
	id: number;
	email: string;
	name: string;
	tracking_started_on: string | null;
};

export async function fetchUser(userId: number): Promise<User> {
	const res = await fetch(buildApiUrl(`/users/${userId}`));

	if (!res.ok) {
		let detail = `HTTP ${res.status}`;
		try {
			const body = (await res.json()) as { error?: string };
			if (body.error) detail = body.error;
		} catch {
			// ignore
		}
		throw new Error(detail);
	}

	return (await res.json()) as User;
}
