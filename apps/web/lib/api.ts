import axios from "axios";

let _api: ReturnType<typeof axios.create> | null = null;

export function getApi() {
	if (_api) return _api;
	_api = axios.create({
		baseURL: "/api",
		withCredentials: true,
		headers: { "Content-Type": "application/json" },
	});
	return _api;
}
