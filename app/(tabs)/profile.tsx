import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Image, ActivityIndicator, Alert, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../../src/theme/colors";
import AppButton from "../../src/components/AppButton";
import * as ImagePicker from "expo-image-picker";
import { getSession, signOut } from "../../src/api/supabase";
import { getProfile, upsertProfile, uploadAvatar, getSignedAvatarUrl } from "../../src/data/profile.server";
import Toast from "../../src/components/Toast";
// AppHeader provided by global Stack header

export default function ProfileRoute() {
	const [email, setEmail] = useState<string | null>(null);
	const [profile, setProfile] = useState<any | null>(null);
	const [loading, setLoading] = useState(false);
	const [name, setName] = useState("");
	const [school, setSchool] = useState("");
	const [avatar, setAvatar] = useState<string | null>(null);
	const [avatarPath, setAvatarPath] = useState<string | null>(null);
	const [toast, setToast] = useState<{ message: string; type?: "info" | "error" | "success" } | null>(null);

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
		return () => {
			mounted = false;
		};
	}, []);

	async function loadProfile(userId: string) {
		try {
			setLoading(true);
			const p = await getProfile(userId);
			if (p) {
				setProfile(p);
				setName(p.full_name ?? "");
				setSchool(p.school ?? "");
				// avatar_url stores storage path; generate signed URL for display
				const path = p.avatar_url ?? null;
				setAvatarPath(path);
				if (path) {
					try {
						const signed = await getSignedAvatarUrl(path);
						setAvatar(signed);
					} catch (e) {
						console.error("getSignedAvatarUrl failed", e);
						setAvatar(null);
					}
				} else {
					setAvatar(null);
				}
			} else {
				setProfile(null);
			}
		} catch (e) {
			console.error("loadProfile error", e);
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
			if (!user) {
				Alert.alert("Not signed in");
				return;
			}
			// Persist the storage path (avatarPath) as the source-of-truth.
			// Previously we were saving `avatar` which is a signed URL; signed URLs expire
			// and are not a stable reference. Saving the storage path (e.g. "userId/avatar.jpg")
			// ensures the avatar persists across sign-ins and we can generate signed URLs on demand.
			const updated = await upsertProfile({ user_id: user.id, full_name: name, school, avatar_url: avatarPath ?? null });
			setProfile(updated);
			Alert.alert("Saved", "Profile updated.");
		} catch (e) {
			console.error("saveProfile error", e);
			Alert.alert("Error", "Failed to save profile");
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
		// handle both legacy `cancelled` and new `canceled` flags
		if ((res as any).cancelled === true || (res as any).canceled === true) return;
		const uri = (res as any).assets?.[0]?.uri ?? (res as any).uri;
		if (!uri) return;
		try {
			setLoading(true);
			const sess = await getSession();
			const user = sess?.data?.session?.user;
			if (!user) throw new Error("Not signed in");
			// upload to storage, returns storage path
			const path = await uploadAvatar(user.id, uri);
			// persist path to profiles.avatar_url
			await upsertProfile({ user_id: user.id, full_name: name, school, avatar_url: path });
			setAvatarPath(path);
			// get signed URL for immediate display
			try {
				const signed = await getSignedAvatarUrl(path);
				setAvatar(signed);
			} catch (e) {
				console.error("getSignedAvatarUrl failed after upload", e);
			}
			setToast({ message: "Photo updated", type: "success" });
		} catch (e) {
			console.error("upload error", e);
			setToast({ message: `Upload failed: ${String(e)}`, type: "error" });
		} finally {
			setLoading(false);
		}
	}

	return (
		<View style={{ flex: 1, padding: 12 }}>
			<Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12, marginTop: 6 }}>Profile</Text>
			{loading ? <ActivityIndicator /> : null}
			{avatar ? <Image source={{ uri: avatar }} style={{ width: 96, height: 96, borderRadius: 48, marginBottom: 12 }} /> : <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: "#eee", marginBottom: 12 }} />}
			<AppButton title="Change photo" onPress={pickAndUpload} variant="secondary" />
			<Text style={{ marginTop: 12, fontWeight: "600" }}>Full name</Text>
			<TextInput value={name} onChangeText={setName} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 12 }} />
			<Text style={{ fontWeight: "600" }}>School</Text>
			<TextInput value={school} onChangeText={setSchool} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 12 }} />
			<Text style={{ fontWeight: "600" }}>Email</Text>
			<Text style={{ marginBottom: 12 }}>{email ?? "No email"}</Text>
			<AppButton title="Save profile" onPress={saveProfile} disabled={loading} variant="primary" />
			<View style={{ height: 12 }} />
			<TouchableOpacity style={styles.signOutBtn} onPress={() => signOut()} activeOpacity={0.7}>
				<Text style={styles.signOutText}>Sign out</Text>
			</TouchableOpacity>
			{toast ? <Toast message={toast.message} type={toast.type} /> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	signOutBtn: {
		height: 36,
		paddingHorizontal: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.pennBlue,
		alignItems: "center",
		justifyContent: "center",
		alignSelf: "stretch",
		backgroundColor: "transparent",
	},
	signOutText: {
		color: colors.pennBlue,
		fontWeight: "700",
	},
});

