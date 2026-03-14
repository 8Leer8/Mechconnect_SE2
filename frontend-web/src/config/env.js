const FALLBACK_API_BASE_URL = "http://127.0.0.1:8000/api";

const RAW_API_BASE_URL =
	import.meta.env.PUBLIC_API_URL ||
	import.meta.env.VITE_API_BASE_URL ||
	import.meta.env.VITE_PUBLIC_API_URL ||
	FALLBACK_API_BASE_URL;

export const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, "");
