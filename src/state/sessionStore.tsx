import React, { createContext, useContext, useState, useEffect } from "react";
import { getSupabaseClient } from "../api/supabase";
import { getMyProfile } from "../data/identity";
import { getSignedAvatarUrl } from "../data/profile.server";
import { listMyMemberships } from "../data/memberships.server";

const supabase = getSupabaseClient();

type SessionState = {
	session: any | null;
	userId: string | null;
	profile: any | null;
	memberships: Record<string, string>; // projectId -> myMemberId
	refreshIdentity: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
	const [session, setSession] = useState<any | null>(null);
	const [userId, setUserId] = useState<string | null>(null);
	const [profile, setProfile] = useState<any | null>(null);
	const [memberships, setMemberships] = useState<Record<string, string>>({});

	async function refreshIdentity() {
		const { data } = await supabase.auth.getSession();
		const u = data?.session?.user ?? null;
		setSession(data?.session ?? null);
		setUserId(u?.id ?? null);
		if (u?.id) {
			const p = await getMyProfile();
			// if profile has an avatar storage path, generate a signed URL for immediate UI display
			if (p && p.avatar_url) {
				try {
					const signed = await getSignedAvatarUrl(p.avatar_url);
					// attach a UI-friendly signed URL while keeping avatar_url as the storage path (source of truth)
					(p as any).avatar_signed_url = signed;
				} catch (e) {
					console.error("refreshIdentity: failed to get signed avatar url", e);
				}
			}
			setProfile(p);
			const mems = await listMyMemberships();
			const map: Record<string, string> = {};
			mems.forEach((m: any) => {
				map[m.project_id] = m.id;
			});
			setMemberships(map);
		} else {
			setProfile(null);
			setMemberships({});
		}
	}

	useEffect(() => {
		let mounted = true;
		(async () => {
			await refreshIdentity();
			const { data } = supabase.auth.onAuthStateChange((_event, _session) => {
				refreshIdentity();
			});
			return () => {
				try {
					(data as any).subscription?.unsubscribe();
				} catch {}
			};
		})();
		return () => {
			mounted = false;
		};
	}, []);

	return <SessionContext.Provider value={{ session, userId, profile, memberships, refreshIdentity }}>{children}</SessionContext.Provider>;
}

export function useSession() {
	const ctx = useContext(SessionContext);
	if (!ctx) throw new Error("useSession must be used within SessionProvider");
	return ctx;
}

export default SessionProvider;

