import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Image, ActivityIndicator, Alert, TouchableOpacity, StyleSheet, ScrollView, Switch } from "react-native";
import { colors } from "../../src/theme/colors";
import AppButton from "../../src/components/AppButton";
import * as ImagePicker from "expo-image-picker";
import { getSession, signOut } from "../../src/api/supabase";
import { getProfile, upsertProfile, uploadAvatar, getSignedAvatarUrl } from "../../src/data/profile.server";
import Toast from "../../src/components/Toast";
import { useTheme } from "../../src/state/themeStore";

export default function ProfileRoute() {
	const [email, setEmail] = useState<string | null>(null);
	const [profile, setProfile] = useState<any | null>(null);
	const [loading, setLoading] = useState(false);
	const [name, setName] = useState("");
	const [school, setSchool] = useState("");
	const [avatar, setAvatar] = useState<string | null>(null);
	const [avatarPath, setAvatarPath] = useState<string | null>(null);
	const [toast, setToast] = useState<{ message: string; type?: "info" | "error" | "success" } | null>(null);
	const { darkMode, toggleDarkMode } = useTheme();

	const bg = darkMode ? "#0F172A" : colors.lightBackground;
	const cardBg = darkMode ? "#1E293B" : "#fff";
	const textColor = darkMode ? "#F1F5F9" : colors.textPrimary;
	const mutedColor = darkMode ? "#94A3B8" : colors.textMuted;
	const borderColor = darkMode ? "#334155" : "#E5E7EB";

	useEffect(() => {
		let mounted = true;
		(async () => {
			const sess = await getSession();
			const user = sess?.data?.session?.user;
			if (mounted) {
				setEmail(user?.email ?? null);
				if (user) {
					await loadProfile(user.id);
				}
			}
		})();
		return () => { mounted = false; };
	}, []);

	async function loadProfile(userId: string) {
		try {
			setLoading(true);
			const p = await getProfile(userId);
			if (p) {
				setProfile(p);
				setName(p.full_name ?? "");
				setSchool(p.school ?? "");
				const path = p.avatar_url ?? null;
				setAvatarPath(path);
				if (path) {
					try {
						const signed = await getSignedAvatarUrl(path);
						setAvatar(signed);
					} catch {
						setAvatar(null);
					}
				} else {
					setAvatar(null);
				}
			}
		} catch (e) {
			Alert.alert("Error", "Failed to load profile");
		} finally {
			setLoading(false);
		}
	}

	async function saveProfile() {
		try {
			setLoading(true);
			const sess = await getSession();
			const user = sess?.data?.session?.user;
			if (!user) { Alert.alert("Not signed in"); return; }
			const updated = await upsertProfile({ user_id: user.id, full_name: name, school, avatar_url: avatarPath ?? null });
			setProfile(updated);
			setToast({ message: "Profile saved", type: "success" });
		} catch {
			setToast({ message: "Failed to save", type: "error" });
		} finally {
			setLoading(false);
		}
	}

	async function pickAndUpload() {
		const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (!permission.granted) {
			Alert.alert("Permission needed", "Allow access to photos to set an avatar.");
			return;
		}
		const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
		if ((res as any).cancelled === true || (res as any).canceled === true) return;
		const uri = (res as any).assets?.[0]?.uri ?? (res as any).uri;
		if (!uri) return;
		try {
			setLoading(true);
			const sess = await getSession();
			const user = sess?.data?.session?.user;
			if (!user) throw new Error("Not signed in");
			const path = await uploadAvatar(user.id, uri);
			await upsertProfile({ user_id: user.id, full_name: name, school, avatar_url: path });
			setAvatarPath(path);
			try {
				const signed = await getSignedAvatarUrl(path);
				setAvatar(signed);
			} catch {}
			setToast({ message: "Photo updated", type: "success" });
		} catch (e) {
			setToast({ message: `Upload failed: ${String(e)}`, type: "error" });
		} finally {
			setLoading(false);
		}
	}

	const initials = name ? name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) : "?";

	return (
		<ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ paddingBottom: 40 }}>
			{/* Header bar */}
			<View style={{ backgroundColor: colors.pennBlue, paddingTop: 20, paddingBottom: 28, paddingHorizontal: 20, alignItems: "center" }}>
				{/* Avatar */}
				<TouchableOpacity onPress={pickAndUpload} activeOpacity={0.8} style={{ marginBottom: 12 }}>
					{avatar ? (
						<Image
							source={{ uri: avatar }}
							style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: "#fff" }}
						/>
					) : (
						<View style={{
							width: 120, height: 120, borderRadius: 60,
							backgroundColor: colors.pennRed,
							borderWidth: 3, borderColor: "#fff",
							alignItems: "center", justifyContent: "center",
						}}>
							<Text style={{ color: "#fff", fontSize: 40, fontWeight: "800" }}>{initials}</Text>
						</View>
					)}
					<View style={{
						position: "absolute", bottom: 0, right: 0,
						width: 32, height: 32, borderRadius: 16,
						backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
						shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
					}}>
						<Text style={{ fontSize: 16 }}>📷</Text>
					</View>
				</TouchableOpacity>
				<Text style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>{name || "Your Profile"}</Text>
				{email ? <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 2 }}>{email}</Text> : null}
				{loading ? <ActivityIndicator color="#fff" style={{ marginTop: 8 }} /> : null}
			</View>

			<View style={{ padding: 20, gap: 16 }}>
				{/* Form card */}
				<View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 16, gap: 12 }}>
					<Text style={{ fontWeight: "700", fontSize: 15, color: textColor, marginBottom: 4 }}>Profile Info</Text>

					<View>
						<Text style={[styles.label, { color: mutedColor }]}>Full name</Text>
						<TextInput
							value={name}
							onChangeText={setName}
							placeholderTextColor={mutedColor}
							style={[styles.input, { borderColor, color: textColor, backgroundColor: bg }]}
						/>
					</View>

					<View>
						<Text style={[styles.label, { color: mutedColor }]}>School</Text>
						<TextInput
							value={school}
							onChangeText={setSchool}
							placeholderTextColor={mutedColor}
							style={[styles.input, { borderColor, color: textColor, backgroundColor: bg }]}
						/>
					</View>

					<View>
						<Text style={[styles.label, { color: mutedColor }]}>Email</Text>
						<Text style={{ color: textColor, paddingVertical: 6 }}>{email ?? "No email"}</Text>
					</View>

					<AppButton title="Save profile" onPress={saveProfile} disabled={loading} variant="primary" />
				</View>

				{/* Preferences card */}
				<View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 16 }}>
					<Text style={{ fontWeight: "700", fontSize: 15, color: textColor, marginBottom: 12 }}>Preferences</Text>
					<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
						<View>
							<Text style={{ fontWeight: "600", color: textColor }}>Dark Mode</Text>
							<Text style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}>Applies to Home, Project, and Profile</Text>
						</View>
						<Switch
							value={darkMode}
							onValueChange={toggleDarkMode}
							trackColor={{ false: "#E5E7EB", true: colors.pennBlue }}
							thumbColor={darkMode ? "#fff" : "#fff"}
						/>
					</View>
				</View>

				{/* Sign out */}
				<TouchableOpacity
					style={[styles.signOutBtn, { borderColor: colors.pennRed }]}
					onPress={() => signOut()}
					activeOpacity={0.7}
				>
					<Text style={[styles.signOutText, { color: colors.pennRed }]}>Sign out</Text>
				</TouchableOpacity>
			</View>

			{toast ? <Toast message={toast.message} type={toast.type} /> : null}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	label: {
		fontSize: 12,
		fontWeight: "600",
		marginBottom: 4,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	input: {
		borderWidth: 1,
		borderRadius: 10,
		padding: 10,
	},
	signOutBtn: {
		height: 44,
		paddingHorizontal: 16,
		borderRadius: 12,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
	},
	signOutText: {
		fontWeight: "700",
		fontSize: 14,
	},
});
