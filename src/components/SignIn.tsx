import React, { useState } from "react";
import { View, Text, TextInput, Alert, ActivityIndicator } from "react-native";
import AppButton from "./AppButton";
import { getSupabaseClient } from "../api/supabase";

export default function AuthScreen() {
	const [mode, setMode] = useState<"signin" | "signup">("signin");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	function validateEmail(e: string) {
		return /\S+@\S+\.\S+/.test(e);
	}

	async function signIn() {
		if (!validateEmail(email)) {
			Alert.alert("Invalid email", "Please enter a valid email address.");
			return;
		}
		if (!password) {
			Alert.alert("Missing password", "Please enter your password.");
			return;
		}
		setIsLoading(true);
		setStatusMessage(null);
		setErrorMessage(null);
		const supabase = getSupabaseClient();
		try {
			const { data, error } = await supabase.auth.signInWithPassword({ email, password });
			console.log("signIn result", { user: data?.user?.id, session: !!data?.session, error });
			setIsLoading(false);
			if (error) {
				setErrorMessage(`${error.status ? `[${error.status}] ` : ""}${error.message}`);
				console.error("Sign in failed", error);
				return;
			}
			// if session present AuthGate will show app
			if (data?.session) {
				setStatusMessage("Signed in successfully.");
				return;
			}
			// fallback: check current session
			const sess = await supabase.auth.getSession();
			console.log("signIn fallback session", sess?.data?.session?.user?.id);
			if (sess?.data?.session) {
				setStatusMessage("Signed in successfully.");
				return;
			}
			setStatusMessage("Signed in (no session returned). If you cannot access the app, check Supabase Auth settings.");
		} catch (e: any) {
			setIsLoading(false);
			console.error("signIn exception", e);
			setErrorMessage(e?.message ?? String(e));
		}
	}

	async function signUp() {
		if (!validateEmail(email)) {
			Alert.alert("Invalid email", "Please enter a valid email address.");
			return;
		}
		if (!password) {
			Alert.alert("Missing password", "Please enter a password.");
			return;
		}
		if (password !== confirm) {
			Alert.alert("Password mismatch", "Password and confirmation do not match.");
			return;
		}
		setIsLoading(true);
		setStatusMessage(null);
		setErrorMessage(null);
		const supabase = getSupabaseClient();
		try {
			const { data, error } = await supabase.auth.signUp({ email, password });
			console.log("signUp result", { user: data?.user?.id, session: !!data?.session, error });
			setIsLoading(false);
			if (error) {
				setErrorMessage(`${error.status ? `[${error.status}] ` : ""}${error.message}`);
				console.error("Sign up failed", error);
				return;
			}
			if (data?.user) {
				setStatusMessage("Account created.");
			}
			// If session returned, user is signed in and AuthGate will render app
			if (data?.session) {
				setStatusMessage("Account created and signed in.");
				return;
			}
			// If no session returned, prompt user to sign in (likely email confirmation required)
			setStatusMessage("Account created. Please sign in (email confirmation may be required).");
			setMode("signin");
		} catch (e: any) {
			setIsLoading(false);
			console.error("signUp exception", e);
			setErrorMessage(e?.message ?? String(e));
		}
	}

	function forgotPassword() {
		Alert.alert("Coming soon", "Password reset will be available in a future update.");
	}

	return (
		<View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
			<View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 16 }}>
				<AppButton title="Sign In" onPress={() => setMode("signin")} variant={mode === "signin" ? "primary" : "secondary"} />
				<View style={{ width: 12 }} />
				<AppButton title="Sign Up" onPress={() => setMode("signup")} variant={mode === "signup" ? "primary" : "secondary"} />
			</View>
			<Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 12 }}>{mode === "signin" ? "Sign in" : "Create account"}</Text>
			<TextInput placeholder="you@school.edu" value={email} onChangeText={setEmail} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 12 }} keyboardType="email-address" autoCapitalize="none" />
			<TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 12 }} />
			{mode === "signup" ? <TextInput placeholder="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 12 }} /> : null}
			{/* status and error */}
			{statusMessage ? <Text style={{ color: "#0a0", marginTop: 12, marginBottom: 6 }}>{statusMessage}</Text> : null}
			{errorMessage ? <Text style={{ color: "#a00", marginTop: 12, marginBottom: 6 }}>{errorMessage}</Text> : null}

			<AppButton title={isLoading ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"} onPress={mode === "signin" ? signIn : signUp} disabled={isLoading} variant="primary" />
			{mode === "signin" ? (
				<View style={{ marginTop: 12 }}>
					<AppButton title="Forgot password (coming soon)" onPress={forgotPassword} variant="secondary" disabled />
				</View>
			) : null}
			{isLoading && <ActivityIndicator style={{ marginTop: 12 }} />}
		</View>
	);
}

