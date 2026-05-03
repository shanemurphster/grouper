import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DARK_MODE_KEY = "gpai_darkMode";

type ThemeCtx = {
	darkMode: boolean;
	toggleDarkMode: () => void;
};

const ThemeContext = createContext<ThemeCtx>({ darkMode: false, toggleDarkMode: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [darkMode, setDarkMode] = useState(false);

	useEffect(() => {
		AsyncStorage.getItem(DARK_MODE_KEY).then((v) => {
			if (v === "true") setDarkMode(true);
		});
	}, []);

	function toggleDarkMode() {
		setDarkMode((prev) => {
			const next = !prev;
			AsyncStorage.setItem(DARK_MODE_KEY, next ? "true" : "false");
			return next;
		});
	}

	return <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	return useContext(ThemeContext);
}
