import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;

export function getSupabaseClient() {
	if (supabase) return supabase;
	const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
	const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
	// Try to use React Native AsyncStorage only when running in RN (Expo Go / device).
	// Otherwise use a minimal in-memory shim so Node-based tooling (expo CLI/metro) doesn't attempt to use async-storage.
	let storageImpl: any = undefined;
	const shim = {
		_storage: new Map<string, string>(),
		async getItem(key: string) {
			return (this._storage.get(key) as string) ?? null;
		},
		async setItem(key: string, value: string) {
			this._storage.set(key, value);
		},
		async removeItem(key: string) {
			this._storage.delete(key);
		},
	};
	try {
		const isReactNative = typeof navigator !== "undefined" && (navigator as any).product === "ReactNative";
		if (isReactNative) {
			// runtime require so Node-based tooling doesn't load the native module during startup.
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const asyncStorageModule = require("@react-native-async-storage/async-storage");
			storageImpl = asyncStorageModule?.default ?? asyncStorageModule;
			// normalize variations of the API if present
			if (storageImpl && typeof storageImpl.getItem !== "function") {
				// Some environments expose getItemAsync / setItemAsync
				const getFn = storageImpl.getItemAsync ?? storageImpl.getItem;
				const setFn = storageImpl.setItemAsync ?? storageImpl.setItem;
				const removeFn = storageImpl.removeItemAsync ?? storageImpl.removeItem;
				if (typeof getFn === "function") {
					storageImpl = {
						getItem: getFn.bind(storageImpl),
						setItem: typeof setFn === "function" ? setFn.bind(storageImpl) : async (k: string, v: string) => {},
						removeItem: typeof removeFn === "function" ? removeFn.bind(storageImpl) : async (k: string) => {},
					};
				} else {
					storageImpl = shim;
				}
			}
		} else {
			storageImpl = shim;
		}
	} catch (e) {
		storageImpl = shim;
	}

	supabase = createClient(url, anon, {
		auth: {
			storage: storageImpl,
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: false,
		},
	});
	return supabase;
}

export function getSession() {
	const client = getSupabaseClient();
	return client.auth.getSession();
}

export function onAuthStateChange(callback: (event: string, session: any) => void) {
	const client = getSupabaseClient();
	const { data } = client.auth.onAuthStateChange((event, session) => {
		callback(event, session);
	});
	return data.subscription;
}

export default getSupabaseClient();

export async function signOut() {
	const client = getSupabaseClient();
	await client.auth.signOut();
}

export async function getUser() {
	const client = getSupabaseClient();
	const { data } = await client.auth.getUser();
	return data?.user ?? null;
}

