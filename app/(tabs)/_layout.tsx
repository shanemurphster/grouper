import React from "react";
import { Tabs } from "expo-router";

export default function TabsLayout() {
	return (
		<Tabs screenOptions={{ headerShown: false }}>
			<Tabs.Screen name="home" options={{ title: "Home" }} />
			<Tabs.Screen name="projects" options={{ title: "Projects" }} />
			<Tabs.Screen name="profile" options={{ title: "Profile" }} />
		</Tabs>
	);
}


