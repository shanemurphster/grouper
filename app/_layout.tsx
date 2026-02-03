import React, { useEffect, useState } from "react";
import { Slot, Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, ActivityIndicator } from "react-native";
import { upsertProject, loadProjects } from "../src/storage/repo";
import AuthGate from "../src/components/AuthGate";
import { SessionProvider } from "../src/state/sessionStore";
import AppHeader from "../src/components/AppHeader";

const LOCAL_MEMBER_ID_KEY = "gpai_localMemberId";
const LOCAL_DISPLAY_NAME_KEY = "gpai_localDisplayName";
// const SEED_KEY = "gpai_seeded_v1";

function generateId() {
	return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export default function RootLayout() {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		async function initIdentityAndSeed() {
			let existingId = await AsyncStorage.getItem(LOCAL_MEMBER_ID_KEY);
			if (!existingId) {
				existingId = generateId();
				await AsyncStorage.setItem(LOCAL_MEMBER_ID_KEY, existingId);
			}
			let displayName = await AsyncStorage.getItem(LOCAL_DISPLAY_NAME_KEY);
			if (!displayName) {
				displayName = "Me";
				await AsyncStorage.setItem(LOCAL_DISPLAY_NAME_KEY, displayName);
			}

			// No demo seeding in production/dev: show empty state when unauthenticated.

			setReady(true);
		}
		initIdentityAndSeed();
	}, []);

	if (!ready) {
		return (
			<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
				<ActivityIndicator />
			</View>
		);
	}

	return (
		<SafeAreaProvider>
			<SessionProvider>
				<AuthGate>
					<Stack screenOptions={{ headerShown: true, header: () => <AppHeader /> }}>
						<Slot />
					</Stack>
				</AuthGate>
			</SessionProvider>
		</SafeAreaProvider>
	);
}
