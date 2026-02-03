import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { getSupabaseClient, onAuthStateChange, getSession } from "../api/supabase";
import SignInScreen from "./SignIn";
import { useSession } from "../state/sessionStore";

export default function AuthGate({ children }: { children: React.ReactNode }) {
	const [loading, setLoading] = useState(true);
	const [sessionUser, setSessionUser] = useState<any | null>(null);
	const sessionCtx = useSession();

	useEffect(() => {
		let sub: any;
		async function init() {
			const sess = await getSession();
			console.log("AuthGate getSession", sess?.data?.session?.user?.id);
			const u = sess?.data?.session?.user ?? null;
			setSessionUser(u);
			setLoading(false);

			sub = onAuthStateChange((event, session) => {
				console.log("Auth state change", event, !!session?.user);
				const nextUser = session?.user ?? null;
				setSessionUser(nextUser);
				// refresh identity store when a session appears
				if (nextUser && sessionCtx) {
					sessionCtx.refreshIdentity().catch(() => {});
				}
			});
		}
		init();
		return () => {
			if (sub && typeof sub.unsubscribe === "function") sub.unsubscribe();
		};
	}, []);

	if (loading) {
		return (
			<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
				<ActivityIndicator />
			</View>
		);
	}

	if (!sessionUser) {
		return <SignInScreen />;
	}

	return <>{children}</>;
}

