import React from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";

export default function WorkloadRoute() {
	const { id } = useLocalSearchParams() as { id: string };
	return (
		<View style={{ flex: 1, padding: 12 }}>
			<Text>Workload for project {id} (coming soon)</Text>
		</View>
	);
}

