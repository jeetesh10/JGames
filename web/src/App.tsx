import { type FormEvent, useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import {
	Plus,
	MapPin,
	Gamepad2,
	Trophy,
	QrCode,
	Users,
	ChevronRight,
	ChevronLeft,
	LayoutDashboard,
	Settings,
	Search,
	Filter,
	CheckCircle2,
	Share2,
	X,
	PlusCircle,
	ArrowLeft,
	Target,
	Medal,
	Activity,
	Copy,
	ExternalLink,
	Printer
} from "lucide-react";
import QRCodeLib from "qrcode";

import { apiRequest, ApiError } from "./api";
import type {
	EventRecord,
	GameRecord,
	LocationRecord,
	EventGameRecord,
	JoinLinkResponse,
	JoinResponse,
	JoinTokenMetaResponse,
	LeaderboardEntry,
	LeaderboardResponse,
	DashboardSummaryResponse,
	EventGameParticipantsResponse,
	ScoreEntryRecord,
	StressScenarioRequest,
	StressScenarioResponse
} from "./types";

// ─── Auth helpers ─────────────────────────────────────────────────────────────
const TOKEN_KEY = "jgames.adminToken";
const getToken = () => localStorage.getItem(TOKEN_KEY) ?? "";

function authed<T>(path: string, token: string, init: RequestInit = {}) {
	return apiRequest<T>(path, {
		...init,
		headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
	});
}

function downloadDataUrl(dataUrl: string, fileName: string) {
	const link = document.createElement("a");
	link.href = dataUrl;
	link.download = fileName;
	link.rel = "noopener";
	document.body.appendChild(link);
	link.click();
	link.remove();
}

function toShareableFile(dataUrl: string, fileName: string): File | null {
	const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) return null;

	const mimeType = match[1];
	const binary = atob(match[2]);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}

	return new File([bytes], fileName, { type: mimeType });
}

async function shareQrAsset(params: { title: string; url: string; dataUrl?: string; fileName: string }) {
	const { title, url, dataUrl, fileName } = params;
	if (!dataUrl) {
		void navigator.clipboard.writeText(url).catch(() => undefined);
		return;
	}

	const file = toShareableFile(dataUrl, fileName);
	let shared = false;

	if (file && typeof navigator.share === "function") {
		try {
			if (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] })) {
				await navigator.share({
					title,
					text: url,
					url,
					files: [file]
				});
				shared = true;
			}
		} catch {
			shared = false;
		}
	}

	if (!shared) {
		downloadDataUrl(dataUrl, fileName);
		void navigator.clipboard.writeText(url).catch(() => undefined);
	}
}

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function printQrCards(items: Array<{ label: string; dataUrl?: string; url: string }>) {
	const printable = items.filter((item) => Boolean(item.dataUrl));
	if (printable.length === 0) return;

	const popup = window.open("", "_blank", "noopener,noreferrer,width=920,height=760");
	if (!popup) return;

	const cardsHtml = printable
		.map((item) => {
			const safeLabel = escapeHtml(item.label);
			const safeUrl = escapeHtml(item.url);
			return `<section class="card"><h2>${safeLabel}</h2><img src="${item.dataUrl}" alt="${safeLabel} QR" /><p>${safeUrl}</p></section>`;
		})
		.join("");

	popup.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>JGames QR Codes</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; font-family: Arial, Helvetica, sans-serif; color: #111827; }
    h1 { margin: 0 0 16px 0; font-size: 22px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; page-break-inside: avoid; }
    .card h2 { margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; }
    .card img { width: 100%; max-width: 280px; height: auto; display: block; margin: 0 auto; }
    .card p { margin: 10px 0 0 0; font-size: 12px; word-break: break-all; color: #374151; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>JGames QR Codes</h1>
  <div class="grid">${cardsHtml}</div>
  <script>window.addEventListener('load', function () { window.print(); });</script>
</body>
</html>`);
  popup.document.close();
}

function isLoopbackUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase();
		return host === "localhost" || host === "127.0.0.1" || host === "::1";
	} catch {
		return false;
	}
}

function browserOrigin(): string {
	if (typeof window === "undefined") {
		return "";
	}

	return window.location.origin.replace(/\/$/, "");
}

function buildClientJoinLink(eventGameId: string, joinToken: string): JoinLinkResponse {
	const origin = browserOrigin();
	const playerUrl = `${origin}/join/${joinToken}`;
	const adminUrl = `${origin}/game-admin/${eventGameId}`;

	return {
		eventGameId,
		joinToken,
		joinUrl: playerUrl,
		qrCodeDataUrl: "",
		playerUrl,
		adminUrl
	};
}

async function ensureQrDataUrl(existingDataUrl: string | undefined, value: string): Promise<string | undefined> {
	if (existingDataUrl) {
		return existingDataUrl;
	}

	try {
		return await QRCodeLib.toDataURL(value, {
			errorCorrectionLevel: "M",
			margin: 1,
			width: 720,
			color: {
				dark: "#111827",
				light: "#FFFFFF"
			}
		});
	} catch {
		return undefined;
	}
}

// ─── QR renderer (uses backend data-URL when available) ──────────────────────
function QRDisplay({ dataUrl, value, size = 200 }: { dataUrl?: string; value?: string; size?: number }) {
	const [dataFailed, setDataFailed] = useState(false);
	const [canvasReady, setCanvasReady] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		setDataFailed(false);
	}, [dataUrl, value]);

	useEffect(() => {
		let cancelled = false;

		async function renderFallbackCanvas() {
			if (!value) {
				setCanvasReady(false);
				return;
			}

			if (dataUrl && !dataFailed) {
				setCanvasReady(false);
				return;
			}

			const canvas = canvasRef.current;
			if (!canvas) {
				setCanvasReady(false);
				return;
			}

			try {
				await QRCodeLib.toCanvas(canvas, value, {
					errorCorrectionLevel: "M",
					margin: 1,
					width: Math.max(120, size - 12),
					color: {
						dark: "#111827",
						light: "#FFFFFF"
					}
				});

				if (!cancelled) {
					setCanvasReady(true);
				}
			} catch {
				if (!cancelled) {
					setCanvasReady(false);
				}
			}
		}

		void renderFallbackCanvas();

		return () => {
			cancelled = true;
		};
	}, [value, dataUrl, dataFailed, size]);

	const effectiveDataUrl = !dataFailed && dataUrl ? dataUrl : undefined;

	return (
		<div
			className="relative flex items-center justify-center bg-white p-4 rounded-xl shadow-inner border-2 border-gray-100"
			style={{ width: size, height: size }}
		>
			{effectiveDataUrl ? (
				<img
					src={effectiveDataUrl}
					onError={() => setDataFailed(true)}
					alt="QR code"
					className="object-contain"
					style={{ width: size - 12, height: size - 12, imageRendering: "pixelated" }}
				/>
			) : (
				<>
					<canvas
						ref={canvasRef}
						aria-label="QR code"
						className="object-contain"
						style={{ width: size - 12, height: size - 12, imageRendering: "pixelated", visibility: canvasReady ? "visible" : "hidden" }}
					/>
					{!canvasReady && <QrCode className="absolute text-gray-300" size={48} />}
				</>
			)}
		</div>
	);
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const result = await apiRequest<{ token: string; role: string }>("/api/auth/login", {
				method: "POST",
				body: JSON.stringify({ email, password }),
			});
			if (result.role !== "ADMIN") throw new ApiError("Not an admin account", 403);
			localStorage.setItem(TOKEN_KEY, result.token);
			onLogin(result.token);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Login failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="min-h-screen bg-[#F4F7F9] flex items-center justify-center p-4">
			<div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8">
				<div className="mb-8 text-center">
					<div className="text-[#E31837] text-3xl font-black italic tracking-tighter uppercase">PETSMART</div>
					<div className="text-[#005696] text-xs font-bold uppercase tracking-widest mt-1">Wag More Bark Less Admin</div>
				</div>
				<form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
					<div>
						<label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Email</label>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-[#E31837] outline-none font-bold"
							placeholder="admin@company.com"
						/>
					</div>
					<div>
						<label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Password</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-[#E31837] outline-none font-bold"
							placeholder="••••••••"
						/>
					</div>
					{error && <p className="text-[#E31837] text-sm font-bold">{error}</p>}
					<button
						disabled={busy}
						type="submit"
						className="w-full py-4 bg-[#E31837] text-white rounded-xl font-black uppercase tracking-wide hover:bg-[#c1142f] disabled:opacity-50 transition-colors mt-2"
					>
						{busy ? "Signing in…" : "Sign In"}
					</button>
				</form>
			</div>
		</div>
	);
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export function App() {
	return (
		<Routes>
			<Route path="/" element={<Navigate replace to="/admin" />} />
			<Route path="/admin/*" element={<AdminApp />} />
			<Route path="/join/:joinToken" element={<PlayerJoinPage />} />
			<Route path="/game-admin/:eventGameId" element={<GameAdminPage />} />
			<Route path="*" element={<Navigate replace to="/admin" />} />
		</Routes>
	);
}

function AdminApp() {
	const [token, setToken] = useState(getToken);

	if (!token) {
		return <LoginScreen onLogin={setToken} />;
	}

	return <AdminShell token={token} onLogout={() => { localStorage.removeItem(TOKEN_KEY); setToken(""); }} />;
}

function PlayerJoinPage() {
	const { joinToken = "" } = useParams();
	const [displayName, setDisplayName] = useState("");
	const [email, setEmail] = useState("");
	const [joinMeta, setJoinMeta] = useState<JoinTokenMetaResponse["eventGame"] | null>(null);
	const [metaLoading, setMetaLoading] = useState(false);
	const [metaError, setMetaError] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [eventGameId, setEventGameId] = useState<string | null>(null);
	const [playerId, setPlayerId] = useState<string | null>(null);
	const [selfPoints, setSelfPoints] = useState("0");
	const [selfRoundNumber, setSelfRoundNumber] = useState("1");
	const [selfScoringBusy, setSelfScoringBusy] = useState(false);
	const [selfScoringStatus, setSelfScoringStatus] = useState<string | null>(null);
	const [leaderboardOnlyMode, setLeaderboardOnlyMode] = useState(false);
	const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
	const [loadingBoard, setLoadingBoard] = useState(false);

	useEffect(() => {
		void loadJoinMeta();
		setStatus(null);
		setError(null);
		setMetaError(null);
		setEventGameId(null);
		setPlayerId(null);
		setLeaderboard([]);
		setSelfScoringStatus(null);
		setLeaderboardOnlyMode(false);
	}, [joinToken]);

	async function loadJoinMeta() {
		if (!joinToken.trim()) return;
		setMetaLoading(true);
		setMetaError(null);
		try {
			const result = await apiRequest<JoinTokenMetaResponse>(`/api/join/${joinToken}/meta`);
			setJoinMeta(result.eventGame);
		} catch (caught) {
			setJoinMeta(null);
			setMetaError(caught instanceof Error ? caught.message : "Unable to load game details");
		} finally {
			setMetaLoading(false);
		}
	}

	async function loadLeaderboardForGame(targetEventGameId: string) {
		setLoadingBoard(true);
		try {
			const board = await apiRequest<LeaderboardResponse>(`/api/leaderboards/game/${targetEventGameId}`);
			setLeaderboard(board.leaderboard);
		} catch {
			setLeaderboard([]);
		} finally {
			setLoadingBoard(false);
		}
	}

	async function joinGame(event: FormEvent) {
		event.preventDefault();
		if (!joinToken.trim()) {
			setError("Invalid join link");
			return;
		}

		setSubmitting(true);
		setStatus(null);
		setError(null);
		try {
			const payload = {
				displayName: displayName.trim(),
				email: email.trim() || undefined,
			};
			const result = await apiRequest<JoinResponse>(`/api/join/${joinToken}`, {
				method: "POST",
				body: JSON.stringify(payload),
			});
			setEventGameId(result.eventGameId);
			setPlayerId(result.playerId);
			setStatus(`${result.displayName}, you are successfully registered for this game.`);
			await loadLeaderboardForGame(result.eventGameId);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Unable to register for this game");
		} finally {
			setSubmitting(false);
		}
	}

	async function submitSelfScore(event: FormEvent) {
		event.preventDefault();
		if (!playerId) {
			setError("Register first before submitting score");
			return;
		}

		const points = Number(selfPoints);
		if (!Number.isFinite(points)) {
			setError("Enter a valid points value");
			return;
		}

		const roundsEnabled = Boolean(joinMeta?.settings?.roundsEnabled);
		const roundNumber = Number(selfRoundNumber);
		if (roundsEnabled && (!Number.isInteger(roundNumber) || roundNumber <= 0)) {
			setError("Enter a valid round number");
			return;
		}

		setSelfScoringBusy(true);
		setError(null);
		setSelfScoringStatus(null);
		try {
			await apiRequest<ScoreEntryRecord>(`/api/join/${joinToken}/scores`, {
				method: "POST",
				body: JSON.stringify({
					playerId,
					points,
					roundNumber: roundsEnabled ? roundNumber : undefined
				})
			});

			setSelfScoringStatus("Score submitted successfully");
			if (eventGameId) {
				await loadLeaderboardForGame(eventGameId);
			}
			setLeaderboardOnlyMode(true);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Unable to submit score");
		} finally {
			setSelfScoringBusy(false);
		}
	}

	const canSelfScore = (joinMeta?.scoringAuthority ?? "ADMIN_ONLY") !== "ADMIN_ONLY";
	const isRegistered = Boolean(playerId);

	return (
		<div className="min-h-screen bg-[#F4F7F9] p-3 sm:p-4 md:p-6">
			<div className={`w-full max-w-4xl mx-auto ${leaderboardOnlyMode ? "" : "grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6"}`}>
				{!leaderboardOnlyMode && <section className="bg-white rounded-3xl shadow-xl p-5 sm:p-6 md:p-8">
					<div className="mb-6">
						<div className="text-[#E31837] text-2xl font-black italic tracking-tighter uppercase">PETSMART</div>
						<div className="text-[#005696] text-xs font-bold uppercase tracking-widest mt-1">Wag More Bark Less - Player Join</div>
					</div>
					<h1 className="text-2xl font-black text-[#005696] uppercase italic tracking-tight">Join Your Game</h1>
					<p className="text-sm text-gray-500 mt-2">Register once from your shared link and start playing.</p>
					<div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1">
						<p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Game Context</p>
						{metaLoading ? (
							<p className="text-sm font-bold text-gray-400">Loading event details...</p>
						) : (
							<>
								<p className="text-sm font-bold text-[#005696]">Event: {joinMeta?.event?.name ?? "Unknown"}</p>
								<p className="text-sm font-bold text-[#005696]">Location: {joinMeta?.location?.name ?? "Unknown"}</p>
								<p className="text-sm font-bold text-[#005696]">Game: {joinMeta?.game?.name ?? "Unknown"}</p>
							</>
						)}
						{metaError && <p className="text-[11px] font-bold text-[#E31837]">{metaError}</p>}
					</div>
					{!isRegistered ? (
						<form onSubmit={(event) => { void joinGame(event); }} className="space-y-4 mt-6">
							<div>
								<label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Display Name</label>
								<input
									required
									value={displayName}
									onChange={(event) => setDisplayName(event.target.value)}
									className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-[#E31837] outline-none font-bold"
									placeholder="Enter your name"
								/>
							</div>
							<div>
								<label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Email (optional)</label>
								<input
									type="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-[#E31837] outline-none font-bold"
									placeholder="you@example.com"
								/>
							</div>
							{error && <p className="text-[#E31837] bg-red-50 border border-red-100 rounded-xl p-3 text-sm font-bold">{error}</p>}
							<button
								type="submit"
								disabled={submitting}
								className="w-full py-4 bg-[#E31837] text-white rounded-xl font-black uppercase tracking-widest hover:bg-[#c1142f] disabled:opacity-50 transition-colors"
							>
								{submitting ? "Registering..." : "Register For Game"}
							</button>
						</form>
					) : (
						<div className="mt-6 space-y-3">
							{status && <p className="text-green-700 bg-green-50 border border-green-100 rounded-xl p-3 text-sm font-bold">{status}</p>}
							{error && <p className="text-[#E31837] bg-red-50 border border-red-100 rounded-xl p-3 text-sm font-bold">{error}</p>}
							<p className="text-xs font-bold text-gray-500">Registration complete. You can now submit score (if enabled) and follow the live leaderboard.</p>
						</div>
					)}
					{playerId && !leaderboardOnlyMode && (
						<div className="mt-5 rounded-xl border border-gray-100 p-4 bg-gray-50 space-y-3">
							<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Score Submission</p>
							{canSelfScore ? (
								<form onSubmit={(event) => { void submitSelfScore(event); }} className="space-y-3">
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
										<input
											type="number"
											value={selfPoints}
											onChange={(event) => setSelfPoints(event.target.value)}
											placeholder="Points"
											className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-[#005696] font-bold"
										/>
										{joinMeta?.settings?.roundsEnabled ? (
											<input
												type="number"
												value={selfRoundNumber}
												onChange={(event) => setSelfRoundNumber(event.target.value)}
												min={1}
												max={joinMeta.settings?.totalRounds}
												placeholder="Round"
												className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-[#005696] font-bold"
											/>
										) : null}
									</div>
									<button
										type="submit"
										disabled={selfScoringBusy}
										className="w-full py-3 rounded-xl bg-[#005696] text-white text-xs font-black uppercase tracking-widest hover:bg-[#004477] disabled:opacity-60"
									>
										{selfScoringBusy ? "Submitting..." : "Submit My Score"}
									</button>
									{selfScoringStatus && <p className="text-xs font-bold text-green-700">{selfScoringStatus}</p>}
								</form>
							) : (
								<p className="text-xs font-bold text-gray-500">This event is configured for admin-only scoring.</p>
							)}
						</div>
					)}
					<p className="mt-4 text-[11px] text-gray-400 font-bold">Join token: {joinToken}</p>
				</section>}

				<section className="bg-white rounded-3xl shadow-xl p-5 sm:p-6 md:p-8">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-lg font-black text-[#005696] uppercase tracking-tight">Live Leaderboard</h2>
						{leaderboardOnlyMode
							? <span className="text-[10px] text-green-700 font-bold uppercase">Score submitted</span>
							: eventGameId && <span className="text-[10px] text-gray-400 font-bold uppercase">Game Ready</span>}
					</div>
					<div className="mb-4 rounded-xl border border-gray-100 p-3 bg-gray-50">
						<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Now Playing</p>
						<p className="text-sm font-black text-[#005696]">{joinMeta?.event?.name ?? "Event"}</p>
						<p className="text-xs font-bold text-gray-500">{joinMeta?.location?.name ?? "Location"} • {joinMeta?.game?.name ?? "Game"}</p>
					</div>
					{loadingBoard ? (
						<p className="text-gray-400 font-bold animate-pulse">Loading leaderboard...</p>
					) : leaderboard.length === 0 ? (
						<p className="text-sm text-gray-400 font-bold">Register first to see game standings.</p>
					) : (
						<div className="space-y-3">
							{leaderboard.slice(0, 10).map((entry) => (
								<article key={entry.playerId} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between">
									<div>
										<p className="font-black text-[#005696]">#{entry.rank} {entry.displayName}</p>
										<p className="text-[11px] text-gray-400">{entry.entries} entries</p>
									</div>
									<p className="font-mono font-black text-lg text-[#E31837]">{entry.totalPoints}</p>
								</article>
							))}
						</div>
					)}
				</section>
			</div>
		</div>
	);
}

function GameAdminPage() {
	const { eventGameId = "" } = useParams();
	const [token, setToken] = useState(getToken);
	const adminToken = useMemo(() => {
		if (typeof window === "undefined") return "";
		return new URLSearchParams(window.location.search).get("adminToken")?.trim() ?? "";
	}, []);
	const [data, setData] = useState<EventGameParticipantsResponse | null>(null);
	const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
	const [search, setSearch] = useState("");
	const [draftScores, setDraftScores] = useState<Record<string, string>>({});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);

	useEffect(() => {
		if (!eventGameId) return;
		if (!token && !adminToken) return;
		void loadPageData();
	}, [token, adminToken, eventGameId]);

	const filteredParticipants = useMemo(() => {
		if (!data) return [];
		const term = search.trim().toLowerCase();
		if (!term) return data.participants;
		return data.participants.filter((item) => {
			return item.displayName.toLowerCase().includes(term) || (item.email ?? "").toLowerCase().includes(term);
		});
	}, [data, search]);

	if (!token && !adminToken) {
		return <LoginScreen onLogin={setToken} />;
	}

	async function loadPageData() {
		setLoading(true);
		setError(null);
		try {
			const participantsRequest = adminToken
				? apiRequest<EventGameParticipantsResponse>(`/api/game-admin/${eventGameId}/participants?adminToken=${encodeURIComponent(adminToken)}`)
				: authed<EventGameParticipantsResponse>(`/api/event-games/${eventGameId}/participants`, token);

			const [participants, gameBoard] = await Promise.all([
				participantsRequest,
				apiRequest<LeaderboardResponse>(`/api/leaderboards/game/${eventGameId}`),
			]);
			setData(participants);
			setLeaderboard(gameBoard.leaderboard);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Unable to load game admin view");
		} finally {
			setLoading(false);
		}
	}

	async function submitPoints(playerId: string) {
		if (!(playerId in draftScores)) {
			return;
		}

		const raw = draftScores[playerId] ?? "0";
		const points = Number(raw);
		if (!Number.isFinite(points)) {
			setError("Enter a valid number for points");
			return;
		}

		setError(null);
		setStatus(null);
		try {
			const result = adminToken
				? await apiRequest<ScoreEntryRecord>(`/api/game-admin/scores?adminToken=${encodeURIComponent(adminToken)}`, {
					method: "POST",
					body: JSON.stringify({ eventGameId, playerId, points, source: "MANUAL" }),
				})
				: await authed<ScoreEntryRecord>("/api/scores", token, {
					method: "POST",
					body: JSON.stringify({ eventGameId, playerId, points, source: "MANUAL" }),
				});
			setStatus(`Score submitted: ${result.points} points`);
			setDraftScores((prev) => {
				const next = { ...prev };
				delete next[playerId];
				return next;
			});
			await loadPageData();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Unable to submit score");
		}
	}

	const playerLink = data ? `${window.location.origin}/join/${data.eventGame.joinToken}` : "";

	return (
		<div className="min-h-screen bg-[#F4F7F9] p-3 sm:p-4 md:p-8">
			<div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-3 gap-6">
				<section className="xl:col-span-2 bg-white rounded-3xl shadow-xl p-4 sm:p-6 md:p-8">
					<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
						<div>
							<p className="text-xs font-black text-gray-400 uppercase tracking-widest">Game Admin</p>
							<h1 className="text-2xl font-black text-[#005696] uppercase italic tracking-tight">Field Scoring Console</h1>
						</div>
						<button onClick={() => { void loadPageData(); }} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50">
							Refresh
						</button>
					</div>
					<div className="mb-5 bg-blue-50 border border-blue-100 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
						<div>
							<p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Event</p>
							<p className="text-sm font-black text-[#005696]">{data?.eventGame.event?.name ?? "Unknown"}</p>
						</div>
						<div>
							<p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Location</p>
							<p className="text-sm font-black text-[#005696]">{data?.eventGame.location?.name ?? "Unknown"}</p>
						</div>
						<div>
							<p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Game</p>
							<p className="text-sm font-black text-[#005696]">{data?.eventGame.game?.name ?? "Unknown"}</p>
						</div>
					</div>

					<div className="relative mb-4">
						<Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
						<input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search by player name or email"
							className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm font-bold outline-none focus:border-[#005696]"
						/>
					</div>

					{status && <p className="mb-4 text-green-700 bg-green-50 border border-green-100 rounded-xl p-3 text-sm font-bold">{status}</p>}
					{error && <p className="mb-4 text-[#E31837] bg-red-50 border border-red-100 rounded-xl p-3 text-sm font-bold">{error}</p>}

					{loading ? (
						<p className="py-12 text-center text-gray-400 font-bold animate-pulse">Loading players...</p>
					) : filteredParticipants.length === 0 ? (
						<p className="py-12 text-center text-gray-400 font-bold">No players found for this game yet.</p>
					) : (
						<div className="space-y-3">
							{filteredParticipants.map((participant) => (
								<article key={participant.playerId} className="border border-gray-100 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
									<div>
										<p className="font-black text-[#005696] text-sm uppercase tracking-tight">{participant.displayName}</p>
										<p className="text-[11px] text-gray-400">{participant.email ?? "No email provided"}</p>
										<p className="text-[11px] text-gray-500 mt-1">Current total: <strong>{participant.totalPoints}</strong> ({participant.entries} entries)</p>
									</div>
									<div className="flex items-center gap-2 w-full md:w-auto">
										<input
											type="number"
											value={draftScores[participant.playerId] ?? "0"}
											onChange={(event) => setDraftScores((prev) => ({ ...prev, [participant.playerId]: event.target.value }))}
											onBlur={() => { void submitPoints(participant.playerId); }}
											onKeyDown={(event) => {
												if (event.key === "Enter") {
													event.preventDefault();
													void submitPoints(participant.playerId);
												}
											}}
											className="w-full md:w-24 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-black text-right outline-none focus:border-[#005696]"
										/>
									</div>
								</article>
							))}
						</div>
					)}
				</section>

				<section className="bg-white rounded-3xl shadow-xl p-4 sm:p-6 md:p-8">
					<h2 className="text-lg font-black text-[#005696] uppercase tracking-tight">Game Links</h2>
					<p className="text-sm text-gray-500 mt-1">Use these links for players and field staff.</p>
					<div className="mt-3 rounded-xl border border-gray-100 p-3 bg-gray-50">
						<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Current Assignment</p>
						<p className="text-sm font-black text-[#005696]">{data?.eventGame.event?.name ?? "Event"}</p>
						<p className="text-xs font-bold text-gray-500">{data?.eventGame.location?.name ?? "Location"} • {data?.eventGame.game?.name ?? "Game"}</p>
					</div>

					<div className="mt-4 space-y-3">
						<a href={playerLink} target="_blank" rel="noreferrer" className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#E31837] text-white text-xs font-black uppercase tracking-widest hover:bg-[#c1142f]">
							<ExternalLink size={14} /> Open Player Join Page
						</a>
						<button
							onClick={() => { navigator.clipboard.writeText(playerLink).catch(() => undefined); }}
							className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 text-xs font-black uppercase tracking-widest hover:bg-gray-50"
						>
							<Copy size={14} /> Copy Player Link
						</button>
					</div>

					<div className="mt-8">
						<h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-3">Live Top Scores</h3>
						{leaderboard.length === 0 ? (
							<p className="text-sm text-gray-400 font-bold">No scores yet.</p>
						) : (
							<div className="space-y-2">
								{leaderboard.slice(0, 8).map((entry) => (
									<div key={entry.playerId} className="rounded-xl border border-gray-100 p-3 flex items-center justify-between">
										<p className="font-black text-sm text-[#005696]">#{entry.rank} {entry.displayName}</p>
										<p className="font-mono font-black text-[#E31837]">{entry.totalPoints}</p>
									</div>
								))}
							</div>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}

function AdminShell({ token, onLogout }: { token: string; onLogout: () => void }) {
	const [events, setEvents] = useState<EventRecord[]>([]);
	const [games, setGames] = useState<GameRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [globalError, setGlobalError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<"dashboard" | "events" | "leaderboards">("dashboard");
	const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
	const [showWizard, setShowWizard] = useState(false);
	const [showStressModal, setShowStressModal] = useState(false);

	const loadWorkspace = useCallback(async () => {
		setGlobalError(null);
		try {
			const [evList, gmList] = await Promise.all([
				authed<EventRecord[]>("/api/events", token),
				authed<GameRecord[]>("/api/games", token),
			]);
			setEvents(evList);
			setGames(gmList);
		} catch (err) {
			setGlobalError(err instanceof Error ? err.message : "Failed to load workspace");
		} finally {
			setLoading(false);
		}
	}, [token]);

	useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

	if (loading) {
		return (
			<div className="min-h-screen bg-[#F4F7F9] flex items-center justify-center">
				<p className="font-bold text-gray-400 animate-pulse">Loading workspace…</p>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-[#F4F7F9] text-slate-900 pb-20 lg:pb-0" style={{ fontFamily: "'Inter', sans-serif" }}>
			<aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex-col z-40 hidden lg:flex">
				<div className="p-6">
					<div className="text-[#E31837] text-2xl font-black italic tracking-tighter mb-1 uppercase">PETSMART</div>
					<div className="text-[#005696] text-[10px] font-bold uppercase tracking-widest leading-none">Wag More Bark Less</div>
				</div>
				<nav className="flex-1 px-4 space-y-2 mt-4">
					{(["dashboard", "events", "leaderboards"] as const).map((tab) => (
						<button
							key={tab}
							onClick={() => { setActiveTab(tab); setSelectedEventId(null); }}
							className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === tab ? "bg-red-50 text-[#E31837]" : "text-gray-500 hover:bg-gray-50"}`}
						>
							{tab === "dashboard" && <><LayoutDashboard size={20} /> Dashboard</>}
							{tab === "events" && <><Gamepad2 size={20} /> Event Manager</>}
							{tab === "leaderboards" && <><Trophy size={20} /> Leaderboards</>}
						</button>
					))}
				</nav>
				<div className="p-4 border-t border-gray-100">
					<button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50">
						<Settings size={20} /> Logout
					</button>
				</div>
			</aside>

			<main className="lg:pl-64 min-h-screen">
				<header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-200 z-30 px-6 py-4 flex items-center justify-between">
					<div className="flex items-center gap-4">
						<div className="lg:hidden text-[#E31837] font-black italic text-xl uppercase">PETSMART</div>
						<h1 className="text-xl font-bold text-gray-800 capitalize hidden sm:block">
							{selectedEventId ? "Event Analytics" : activeTab.replace("-", " ")}
						</h1>
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={() => setShowStressModal(true)}
							className="bg-[#005696] hover:bg-[#004477] text-white px-4 py-2 rounded-full flex items-center gap-2 font-bold shadow-md transition-all active:scale-95"
						>
							<Activity size={18} /> <span className="hidden sm:inline">Stress Test</span>
						</button>
						<button
							onClick={() => setShowWizard(true)}
							className="bg-[#E31837] hover:bg-[#c1142f] text-white px-4 py-2 rounded-full flex items-center gap-2 font-bold shadow-md transition-all active:scale-95"
						>
							<PlusCircle size={20} /> <span className="hidden sm:inline">Launch Wizard</span>
						</button>
					</div>
				</header>

				<div className="p-6 max-w-7xl mx-auto">
					{globalError && (
						<div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-[#E31837] font-bold text-sm">{globalError}</div>
					)}
					{activeTab === "dashboard" && <DashboardView token={token} events={events} games={games} />}
					{activeTab === "events" && (
						selectedEventId
							? <EventDetailView token={token} eventId={selectedEventId} events={events} games={games} onBack={() => setSelectedEventId(null)} onReload={loadWorkspace} />
							: <EventListView events={events} onSelect={setSelectedEventId} onLaunchWizard={() => setShowWizard(true)} />
					)}
					{activeTab === "leaderboards" && <LeaderboardsView token={token} events={events} />}
				</div>
			</main>

			<div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-between items-center z-40">
				<button onClick={() => { setActiveTab("dashboard"); setSelectedEventId(null); }} className={activeTab === "dashboard" ? "text-[#E31837]" : "text-gray-400"}><LayoutDashboard size={24} /></button>
				<button onClick={() => { setActiveTab("events"); setSelectedEventId(null); }} className={activeTab === "events" ? "text-[#E31837]" : "text-gray-400"}><Gamepad2 size={24} /></button>
				<button onClick={() => { setActiveTab("leaderboards"); setSelectedEventId(null); }} className={activeTab === "leaderboards" ? "text-[#E31837]" : "text-gray-400"}><Trophy size={24} /></button>
			</div>

			{showWizard && (
				<WizardModal token={token} events={events} games={games} onClose={() => setShowWizard(false)} onComplete={() => { setShowWizard(false); void loadWorkspace(); }} />
			)}

			{showStressModal && (
				<StressScenarioModal
					token={token}
					onClose={() => setShowStressModal(false)}
					onComplete={() => {
						void loadWorkspace();
					}}
				/>
			)}
		</div>
	);
}

function StressScenarioModal({
	token,
	onClose,
	onComplete
}: {
	token: string;
	onClose: () => void;
	onComplete: () => void;
}) {
	const [form, setForm] = useState<StressScenarioRequest>({
		eventCount: 3,
		gamesPerEvent: 5,
		sharedGameCount: 3,
		locationCount: 5,
		playerCount: 200,
		concurrency: 50,
		maxScore: 10
	});
	const [running, setRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<StressScenarioResponse | null>(null);

	function updateNumberField<K extends keyof StressScenarioRequest>(key: K, value: string) {
		const parsed = Number(value);
		setForm((prev) => ({
			...prev,
			[key]: Number.isFinite(parsed) ? parsed : prev[key]
		}));
	}

	async function runScenario() {
		setRunning(true);
		setError(null);
		setResult(null);
		try {
			const response = await authed<StressScenarioResponse>("/api/admin/stress-scenario", token, {
				method: "POST",
				body: JSON.stringify(form)
			});
			setResult(response);
			onComplete();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Unable to run stress scenario");
		} finally {
			setRunning(false);
		}
	}

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
			<div className="bg-white w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl">
				<div className="bg-[#005696] p-5 text-white flex items-center justify-between">
					<h3 className="text-lg font-black uppercase tracking-widest">Run Stress Scenario</h3>
					<button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition-colors"><X size={20} /></button>
				</div>
				<div className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
					<p className="text-sm text-gray-600">
						Creates test data and simulates concurrent joins/scores. Use on staging environments.
					</p>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
						<label className="text-xs font-black text-gray-500 uppercase tracking-widest">Events
							<input type="number" min={1} value={form.eventCount} onChange={(event) => updateNumberField("eventCount", event.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#005696]" />
						</label>
						<label className="text-xs font-black text-gray-500 uppercase tracking-widest">Games/Event
							<input type="number" min={1} value={form.gamesPerEvent} onChange={(event) => updateNumberField("gamesPerEvent", event.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#005696]" />
						</label>
						<label className="text-xs font-black text-gray-500 uppercase tracking-widest">Shared Games
							<input type="number" min={0} value={form.sharedGameCount} onChange={(event) => updateNumberField("sharedGameCount", event.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#005696]" />
						</label>
						<label className="text-xs font-black text-gray-500 uppercase tracking-widest">Locations
							<input type="number" min={1} value={form.locationCount} onChange={(event) => updateNumberField("locationCount", event.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#005696]" />
						</label>
						<label className="text-xs font-black text-gray-500 uppercase tracking-widest">Players
							<input type="number" min={1} value={form.playerCount} onChange={(event) => updateNumberField("playerCount", event.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#005696]" />
						</label>
						<label className="text-xs font-black text-gray-500 uppercase tracking-widest">Concurrency
							<input type="number" min={1} value={form.concurrency} onChange={(event) => updateNumberField("concurrency", event.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#005696]" />
						</label>
						<label className="text-xs font-black text-gray-500 uppercase tracking-widest">Max Score
							<input type="number" min={1} value={form.maxScore} onChange={(event) => updateNumberField("maxScore", event.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#005696]" />
						</label>
					</div>

					<div className="flex items-center gap-2">
						<button
							onClick={() => { void runScenario(); }}
							disabled={running}
							className="px-4 py-2 rounded-xl bg-[#E31837] text-white text-sm font-black uppercase tracking-widest hover:bg-[#c1142f] disabled:opacity-60"
						>
							{running ? "Running..." : "Run Scenario"}
						</button>
						<button
							onClick={onClose}
							className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50"
						>
							Close
						</button>
					</div>

					{error && <p className="text-sm font-bold text-[#E31837] bg-red-50 border border-red-100 rounded-xl p-3">{error}</p>}

					{result && (
						<div className="space-y-3">
							<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
								<div className="bg-gray-50 rounded-xl p-3"><p className="text-[10px] uppercase text-gray-400 font-black">Events</p><p className="text-lg font-black text-[#005696]">{result.summary.eventCount}</p></div>
								<div className="bg-gray-50 rounded-xl p-3"><p className="text-[10px] uppercase text-gray-400 font-black">Event Games</p><p className="text-lg font-black text-[#005696]">{result.summary.eventGameCount}</p></div>
								<div className="bg-gray-50 rounded-xl p-3"><p className="text-[10px] uppercase text-gray-400 font-black">Players</p><p className="text-lg font-black text-[#005696]">{result.summary.playerCount}</p></div>
								<div className="bg-gray-50 rounded-xl p-3"><p className="text-[10px] uppercase text-gray-400 font-black">Total Time</p><p className="text-lg font-black text-[#005696]">{Math.round(result.summary.totalDurationMs)}ms</p></div>
							</div>

							<div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
								<p className="text-[10px] uppercase text-gray-400 font-black mb-2">Execution Log</p>
								<pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-48 overflow-auto">{result.logs.join("\n")}</pre>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardView({ token, events, games }: { token: string; events: EventRecord[]; games: GameRecord[] }) {
	const [totalLocations, setTotalLocations] = useState(0);
	const [totalEventGames, setTotalEventGames] = useState(0);
	const [totalPlayers, setTotalPlayers] = useState(0);
	const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
	const [loadingBoard, setLoadingBoard] = useState(true);
	const activeEvents = useMemo(() => events.filter((event) => event.status === "LIVE").length, [events]);

	useEffect(() => { void loadDashboard(); }, [events, token]);

	async function loadDashboard() {
		if (events.length === 0) {
			setTotalLocations(0);
			setTotalEventGames(0);
			setTotalPlayers(0);
			setLeaderboard([]);
			setLoadingBoard(false);
			return;
		}
		setLoadingBoard(true);
		try {
			const summary = await authed<DashboardSummaryResponse>("/api/dashboard/summary", token);
			setTotalLocations(summary.totalLocations);
			setTotalEventGames(summary.totalEventGames);
			setTotalPlayers(summary.totalPlayers);
			setLeaderboard(summary.leaderboard);
		} finally {
			setLoadingBoard(false);
		}
	}

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
				<div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-[#E31837]">
					<div className="flex justify-between items-start">
						<div><p className="text-gray-500 text-sm font-medium uppercase">Total Players</p><h3 className="text-3xl font-bold mt-1">{totalPlayers.toLocaleString()}</h3></div>
						<Users className="text-[#E31837] w-8 h-8" />
					</div>
					<p className="text-gray-400 text-sm mt-4">Across all events</p>
				</div>
				<div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-[#2F855A]">
					<div className="flex justify-between items-start">
						<div><p className="text-gray-500 text-sm font-medium uppercase">Total Events</p><h3 className="text-3xl font-bold mt-1">{events.length}</h3></div>
						<LayoutDashboard className="text-[#2F855A] w-8 h-8" />
					</div>
					<p className="text-gray-400 text-sm mt-4">Created in workspace</p>
				</div>
				<div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-[#2563EB]">
					<div className="flex justify-between items-start">
						<div><p className="text-gray-500 text-sm font-medium uppercase">Active Events</p><h3 className="text-3xl font-bold mt-1">{activeEvents}</h3></div>
						<Activity className="text-[#2563EB] w-8 h-8" />
					</div>
					<p className="text-gray-400 text-sm mt-4">Status is LIVE</p>
				</div>
				<div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-[#005696]">
					<div className="flex justify-between items-start">
						<div><p className="text-gray-500 text-sm font-medium uppercase">Active Locations</p><h3 className="text-3xl font-bold mt-1">{totalLocations}</h3></div>
						<MapPin className="text-[#005696] w-8 h-8" />
					</div>
					<p className="text-gray-400 text-sm mt-4">Across {events.length} event(s)</p>
				</div>
				<div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-[#FFD200]">
					<div className="flex justify-between items-start">
						<div><p className="text-gray-500 text-sm font-medium uppercase">Games Hosted</p><h3 className="text-3xl font-bold mt-1">{totalEventGames}</h3></div>
						<Gamepad2 className="text-[#FFD200] w-8 h-8" />
					</div>
					<p className="text-gray-400 text-sm mt-4">{games.length} game template(s)</p>
				</div>
			</div>

			<div className="bg-white rounded-2xl shadow-sm overflow-hidden">
				<div className="p-6 border-b border-gray-100 flex justify-between items-center">
					<h3 className="text-xl font-bold flex items-center gap-2"><Trophy className="text-[#FFD200]" /> Global Leaderboard</h3>
					<span className="text-xs font-bold text-gray-400 uppercase">All events</span>
				</div>
				{loadingBoard ? (
					<p className="p-8 text-center text-gray-400 font-bold animate-pulse">Loading…</p>
				) : leaderboard.length === 0 ? (
					<p className="p-8 text-center text-gray-400 font-bold">No scores yet.</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-left">
							<thead><tr className="bg-gray-50 text-gray-500 text-sm uppercase">
								<th className="px-6 py-4 font-semibold">Rank</th>
								<th className="px-6 py-4 font-semibold">Player</th>
								<th className="px-6 py-4 font-semibold">Entries</th>
								<th className="px-6 py-4 font-semibold text-right">Score</th>
							</tr></thead>
							<tbody className="divide-y divide-gray-100">
								{leaderboard.slice(0, 10).map((p, idx) => (
									<tr key={String(p.playerId)} className="hover:bg-gray-50 transition-colors">
										<td className="px-6 py-4">
											<span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${idx === 0 ? "bg-[#FFD200] text-amber-900" : idx === 1 ? "bg-gray-200 text-gray-600" : idx === 2 ? "bg-orange-100 text-orange-700" : "text-gray-400"}`}>{idx + 1}</span>
										</td>
										<td className="px-6 py-4 font-bold text-gray-900">{p.displayName}</td>
										<td className="px-6 py-4 text-sm text-gray-500">{p.entries}</td>
										<td className="px-6 py-4 text-right font-mono font-bold text-[#005696]">{p.totalPoints.toLocaleString()}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Event List ───────────────────────────────────────────────────────────────
function EventListView({ events, onSelect, onLaunchWizard }: { events: EventRecord[]; onSelect: (id: string) => void; onLaunchWizard: () => void }) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{events.map((ev) => (
				<div key={ev._id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 group hover:shadow-lg hover:border-[#005696] transition-all">
					<div className="flex justify-between items-start mb-4">
						<h3 className="font-bold text-lg group-hover:text-[#005696] transition-colors">{ev.name}</h3>
						<span className={`text-[10px] font-black px-2 py-1 rounded uppercase ${ev.status === "LIVE" ? "bg-green-50 text-green-700" : ev.status === "CLOSED" ? "bg-gray-100 text-gray-500" : "bg-blue-50 text-[#005696]"}`}>{ev.status}</span>
					</div>
					<p className="text-sm text-gray-400 mb-4 line-clamp-2">{ev.description}</p>
					<p className="text-xs text-gray-400 mb-4">{ev.eventDate}</p>
					<button onClick={() => onSelect(ev._id)} className="w-full py-3 bg-gray-50 rounded-xl font-bold text-sm text-[#005696] hover:bg-[#005696] hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2">
						View Deep Dive <ChevronRight size={16} />
					</button>
				</div>
			))}
			<button onClick={onLaunchWizard} className="bg-white rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center p-8 text-gray-400 hover:border-[#E31837] hover:text-[#E31837] transition-all min-h-[200px]">
				<Plus size={32} className="mb-2" />
				<span className="font-bold">New Wizard Setup</span>
			</button>
		</div>
	);
}

// ─── Event Detail ─────────────────────────────────────────────────────────────
function EventDetailView({ token, eventId, events, games, onBack, onReload }: {
	token: string; eventId: string; events: EventRecord[]; games: GameRecord[];
	onBack: () => void; onReload: () => void;
}) {
	const selectedEvent = events.find((e) => e._id === eventId);
	const [localGames, setLocalGames] = useState<GameRecord[]>(games);
	const [locations, setLocations] = useState<LocationRecord[]>([]);
	const [eventGames, setEventGames] = useState<EventGameRecord[]>([]);
	const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
	const [filteredLeaders, setFilteredLeaders] = useState<LeaderboardEntry[]>([]);
	const [detailLocFilter, setDetailLocFilter] = useState("all");
	const [detailGameFilter, setDetailGameFilter] = useState("all");
	const [joinLinks, setJoinLinks] = useState<Record<string, JoinLinkResponse>>({});
	const [busy, setBusy] = useState(false);
	const [filterBusy, setFilterBusy] = useState(false);
	const [quickSetupOpen, setQuickSetupOpen] = useState(false);
	const [linkWizardOpen, setLinkWizardOpen] = useState(false);
	const [manageBusy, setManageBusy] = useState(false);
	const [manageError, setManageError] = useState<string | null>(null);
	const [manageMessage, setManageMessage] = useState<string | null>(null);
	const [manageSection, setManageSection] = useState<"locations" | "games" | "deploy">("locations");
	const [newLocationName, setNewLocationName] = useState("");
	const [newLocationVenue, setNewLocationVenue] = useState("");
	const [bulkLocationInput, setBulkLocationInput] = useState("");
	const [allLocations, setAllLocations] = useState<LocationRecord[]>([]);
	const [selectedTemplateLocationIds, setSelectedTemplateLocationIds] = useState<string[]>([]);
	const [newGameName, setNewGameName] = useState("");
	const [newGameScoreUnit, setNewGameScoreUnit] = useState("points");
	const [editGameId, setEditGameId] = useState("");
	const [editGameName, setEditGameName] = useState("");
	const [editGameScoreUnit, setEditGameScoreUnit] = useState("points");
	const [editGameScoringMode, setEditGameScoringMode] = useState<"INDIVIDUAL" | "CUMULATIVE">("INDIVIDUAL");
	const [deployLocationId, setDeployLocationId] = useState("");
	const [selectedDeployGameIds, setSelectedDeployGameIds] = useState<string[]>([]);
	const [deployRoundsEnabled, setDeployRoundsEnabled] = useState(false);
	const [deployScoringAuthority, setDeployScoringAuthority] = useState<"ADMIN_ONLY" | "PLAYER_SELF" | "HYBRID">("ADMIN_ONLY");
	const [deployTotalRounds, setDeployTotalRounds] = useState("3");
	const [deployMaxPointsPerRound, setDeployMaxPointsPerRound] = useState("10");
	const gameNameById = useMemo(() => new Map(localGames.map((game) => [game._id, game.name])), [localGames]);
	const mappedGameOptions = useMemo(() => {
		const seen = new Set<string>();
		const options: Array<{ id: string; name: string }> = [];

		for (const item of eventGames) {
			if (seen.has(item.gameId)) continue;
			seen.add(item.gameId);
			options.push({
				id: item.gameId,
				name: gameNameById.get(item.gameId) ?? "Unknown Game"
			});
		}

		return options.sort((a, b) => a.name.localeCompare(b.name));
	}, [eventGames, gameNameById]);
	const groupedEventGames = useMemo(() => {
		const groups = new Map<string, EventGameRecord[]>();

		for (const eventGame of eventGames) {
			const key = eventGame.locationId;
			const existing = groups.get(key);
			if (existing) {
				existing.push(eventGame);
			} else {
				groups.set(key, [eventGame]);
			}
		}

		return Array.from(groups.entries())
			.map(([locationId, items]) => {
				const location = locations.find((entry) => entry._id === locationId);
				const sortedItems = [...items].sort((a, b) => {
					const aLabel = (a.title ?? gameNameById.get(a.gameId) ?? "Game").toLowerCase();
					const bLabel = (b.title ?? gameNameById.get(b.gameId) ?? "Game").toLowerCase();
					return aLabel.localeCompare(bLabel);
				});

				return {
					locationId,
					locationName: location?.name ?? "Unknown Location",
					items: sortedItems
				};
			})
			.sort((a, b) => a.locationName.localeCompare(b.locationName));
	}, [eventGames, locations, gameNameById]);
	const hasLoopbackQr = useMemo(() => {
		return Object.values(joinLinks).some((link) => {
			const player = link.playerUrl ?? link.joinUrl;
			return isLoopbackUrl(player);
		});
	}, [joinLinks]);

	useEffect(() => {
		setLocalGames(games);
	}, [games]);

	useEffect(() => {
		if (quickSetupOpen) {
			setManageSection("locations");
		}
	}, [quickSetupOpen]);

	useEffect(() => { void loadContext(); }, [eventId]);
	useEffect(() => { void applyFilters(); }, [leaderboard, eventGames, detailLocFilter, detailGameFilter]);

	useEffect(() => {
		if (detailLocFilter !== "all" && !locations.some((entry) => entry._id === detailLocFilter)) {
			setDetailLocFilter("all");
		}
	}, [locations, detailLocFilter]);

	useEffect(() => {
		if (detailGameFilter !== "all" && !mappedGameOptions.some((entry) => entry.id === detailGameFilter)) {
			setDetailGameFilter("all");
		}
	}, [mappedGameOptions, detailGameFilter]);

	useEffect(() => {
		if (!deployLocationId || !locations.some((entry) => entry._id === deployLocationId)) {
			setDeployLocationId(locations[0]?._id ?? "");
		}
	}, [locations, deployLocationId]);

	useEffect(() => {
		setSelectedDeployGameIds((prev) => prev.filter((id) => localGames.some((entry) => entry._id === id)));
	}, [localGames]);

	useEffect(() => {
		if (!editGameId || !localGames.some((entry) => entry._id === editGameId)) {
			const firstGame = localGames[0];
			setEditGameId(firstGame?._id ?? "");
			setEditGameName(firstGame?.name ?? "");
			setEditGameScoreUnit(firstGame?.scoreUnit ?? "points");
			setEditGameScoringMode(firstGame?.scoringMode ?? "INDIVIDUAL");
		}
	}, [localGames, editGameId]);

	async function loadContext() {
		setBusy(true);
		try {
			const [locs, egs] = await Promise.all([
				authed<LocationRecord[]>(`/api/events/${eventId}/locations`, token),
				authed<EventGameRecord[]>(`/api/event-games?eventId=${eventId}`, token),
			]);
			setLocations(locs);
			setEventGames(egs);
			setJoinLinks((prev) => {
				const next: Record<string, JoinLinkResponse> = {};
				for (const entry of egs) {
					next[entry._id] = prev[entry._id] ?? buildClientJoinLink(entry._id, entry.joinToken);
				}
				return next;
			});

			void (async () => {
				const board = await authed<LeaderboardResponse>(`/api/leaderboards/event/${eventId}`, token).catch(() => ({
					scope: "event" as const,
					eventId,
					leaderboard: [],
				}));
				setLeaderboard(board.leaderboard);
			})();
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => {
		if (!quickSetupOpen) return;
		void (async () => {
			try {
				const all = await authed<LocationRecord[]>("/api/locations", token);
				setAllLocations(all);
			} catch {
				setAllLocations([]);
			}
		})();
	}, [quickSetupOpen, token]);

	const resolveJoinLink = useCallback(async (eventGame: EventGameRecord): Promise<JoinLinkResponse> => {
		const fallback = joinLinks[eventGame._id] ?? buildClientJoinLink(eventGame._id, eventGame.joinToken);
		try {
			const link = await authed<JoinLinkResponse>(`/api/event-games/${eventGame._id}/join-link`, token);
			setJoinLinks((prev) => ({ ...prev, [eventGame._id]: link }));
			return link;
		} catch {
			return fallback;
		}
	}, [joinLinks, token]);

	async function addLocation(event: FormEvent) {
		event.preventDefault();
		if (!newLocationName.trim()) {
			setManageError("Location name is required");
			return;
		}

		setManageBusy(true);
		setManageError(null);
		setManageMessage(null);
		try {
			const created = await authed<LocationRecord>(`/api/events/${eventId}/locations`, token, {
				method: "POST",
				body: JSON.stringify({
					name: newLocationName.trim(),
					venue: newLocationVenue.trim() || undefined
				})
			});
			setLocations((prev) => [created, ...prev]);
			setDeployLocationId(created._id);
			setNewLocationName("");
			setNewLocationVenue("");
			setManageMessage(`Location added: ${created.name}`);
		} catch (caught) {
			setManageError(caught instanceof Error ? caught.message : "Unable to create location");
		} finally {
			setManageBusy(false);
		}
	}

	async function addMultipleLocations(event: FormEvent) {
		event.preventDefault();
		const names = bulkLocationInput
			.split("\n")
			.map((entry) => entry.trim())
			.filter(Boolean);

		if (names.length === 0) {
			setManageError("Add at least one location name (one per line)");
			return;
		}

		setManageBusy(true);
		setManageError(null);
		setManageMessage(null);
		try {
			const created = await Promise.all(
				names.map((name) =>
					authed<LocationRecord>(`/api/events/${eventId}/locations`, token, {
						method: "POST",
						body: JSON.stringify({ name })
					})
				)
			);

			setLocations((prev) => [...created, ...prev]);
			setBulkLocationInput("");
			setManageMessage(`${created.length} location(s) added`);
		} catch (caught) {
			setManageError(caught instanceof Error ? caught.message : "Unable to add locations");
		} finally {
			setManageBusy(false);
		}
	}

	async function importTemplateLocations(event: FormEvent) {
		event.preventDefault();
		if (selectedTemplateLocationIds.length === 0) {
			setManageError("Select at least one location template to import");
			return;
		}

		const existingNames = new Set(locations.map((entry) => entry.name.toLowerCase()));
		const templates = allLocations.filter((entry) => selectedTemplateLocationIds.includes(entry._id));
		const toCreate = templates.filter((entry) => !existingNames.has(entry.name.toLowerCase()));

		if (toCreate.length === 0) {
			setManageError("All selected templates already exist in this event");
			return;
		}

		setManageBusy(true);
		setManageError(null);
		setManageMessage(null);
		try {
			const created = await Promise.all(
				toCreate.map((template) =>
					authed<LocationRecord>(`/api/events/${eventId}/locations`, token, {
						method: "POST",
						body: JSON.stringify({
							name: template.name,
							venue: template.venue
						})
					})
				)
			);

			setLocations((prev) => [...created, ...prev]);
			setSelectedTemplateLocationIds([]);
			setManageMessage(`${created.length} location template(s) imported`);
		} catch (caught) {
			setManageError(caught instanceof Error ? caught.message : "Unable to import templates");
		} finally {
			setManageBusy(false);
		}
	}

	async function addGame(event: FormEvent) {
		event.preventDefault();
		if (!newGameName.trim()) {
			setManageError("Game name is required");
			return;
		}

		const key = newGameName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
		if (!key) {
			setManageError("Game name must contain letters or numbers");
			return;
		}

		setManageBusy(true);
		setManageError(null);
		setManageMessage(null);
		try {
			const created = await authed<GameRecord>("/api/games", token, {
				method: "POST",
				body: JSON.stringify({
					name: newGameName.trim(),
					key,
					scoreUnit: newGameScoreUnit.trim() || "points"
				})
			});
			setLocalGames((prev) => [created, ...prev]);
			setSelectedDeployGameIds((prev) => [...new Set([created._id, ...prev])]);
			setNewGameName("");
			setNewGameScoreUnit("points");
			setManageMessage(`Game created: ${created.name}`);
			void onReload();
		} catch (caught) {
			setManageError(caught instanceof Error ? caught.message : "Unable to create game");
		} finally {
			setManageBusy(false);
		}
	}

	async function saveGameEdits(event: FormEvent) {
		event.preventDefault();
		if (!editGameId) {
			setManageError("Select a game to edit");
			return;
		}

		if (!editGameName.trim()) {
			setManageError("Game name is required");
			return;
		}

		setManageBusy(true);
		setManageError(null);
		setManageMessage(null);
		try {
			const key = editGameName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
			const updated = await authed<GameRecord>(`/api/games/${editGameId}`, token, {
				method: "PATCH",
				body: JSON.stringify({
					name: editGameName.trim(),
					key,
					scoringMode: editGameScoringMode,
					scoreUnit: editGameScoreUnit.trim() || "points"
				})
			});

			setLocalGames((prev) => prev.map((entry) => (entry._id === editGameId ? updated : entry)));
			setManageMessage(`Game updated: ${updated.name}`);
			void onReload();
		} catch (caught) {
			setManageError(caught instanceof Error ? caught.message : "Unable to update game");
		} finally {
			setManageBusy(false);
		}
	}

	async function deployGameToLocation(event: FormEvent) {
		event.preventDefault();
		if (!deployLocationId || selectedDeployGameIds.length === 0) {
			setManageError("Choose a location and at least one game to deploy");
			return;
		}

		setManageBusy(true);
		setManageError(null);
		setManageMessage(null);
		try {
			const pendingGameIds = selectedDeployGameIds.filter((gameId) => !eventGames.some((entry) => entry.locationId === deployLocationId && entry.gameId === gameId));

			if (pendingGameIds.length === 0) {
				setManageError("Selected games are already deployed to this location");
				return;
			}

			const created = await Promise.all(
				pendingGameIds.map((gameId) =>
					authed<EventGameRecord>("/api/event-games", token, {
						method: "POST",
						body: JSON.stringify({
							eventId,
							locationId: deployLocationId,
							gameId,
							settings: {
								scoringAuthority: deployScoringAuthority,
								roundsEnabled: deployRoundsEnabled,
								totalRounds: deployRoundsEnabled ? Number(deployTotalRounds) : undefined,
								maxPointsPerRound: Number(deployMaxPointsPerRound) || undefined
							}
						})
					})
				)
			);

			setEventGames((prev) => [...created, ...prev]);
			setJoinLinks((prev) => {
				const next = { ...prev };
				for (const item of created) {
					next[item._id] = buildClientJoinLink(item._id, item.joinToken);
				}
				return next;
			});
			setSelectedDeployGameIds([]);
			setManageMessage(`${created.length} game(s) deployed to location`);
			void onReload();
		} catch (caught) {
			setManageError(caught instanceof Error ? caught.message : "Unable to deploy game");
		} finally {
			setManageBusy(false);
		}
	}

	function aggregateLeaderboards(scopes: LeaderboardEntry[][]): LeaderboardEntry[] {
		const byPlayer = new Map<
			string,
			{ playerId: string; displayName: string; totalPoints: number; entries: number; lastScoredAt?: string }
		>();

		for (const scope of scopes) {
			for (const row of scope) {
				const existing = byPlayer.get(row.playerId);
				if (!existing) {
					byPlayer.set(row.playerId, {
						playerId: row.playerId,
						displayName: row.displayName,
						totalPoints: row.totalPoints,
						entries: row.entries,
						lastScoredAt: row.lastScoredAt,
					});
					continue;
				}

				existing.totalPoints += row.totalPoints;
				existing.entries += row.entries;
				if (row.lastScoredAt && (!existing.lastScoredAt || row.lastScoredAt > existing.lastScoredAt)) {
					existing.lastScoredAt = row.lastScoredAt;
				}
			}
		}

		return Array.from(byPlayer.values())
			.sort((a, b) => {
				if (b.totalPoints !== a.totalPoints) {
					return b.totalPoints - a.totalPoints;
				}
				const aTime = a.lastScoredAt ? Date.parse(a.lastScoredAt) : Number.MAX_SAFE_INTEGER;
				const bTime = b.lastScoredAt ? Date.parse(b.lastScoredAt) : Number.MAX_SAFE_INTEGER;
				return aTime - bTime;
			})
			.map((row, index) => ({ ...row, rank: index + 1 }));
	}

	async function applyFilters() {
		if (detailLocFilter === "all" && detailGameFilter === "all") {
			setFilteredLeaders(leaderboard);
			return;
		}

		const matchingEventGames = eventGames.filter((item) => {
			const matchesLocation = detailLocFilter === "all" || item.locationId === detailLocFilter;
			const matchesGame = detailGameFilter === "all" || item.gameId === detailGameFilter;
			return matchesLocation && matchesGame;
		});

		if (matchingEventGames.length === 0) {
			setFilteredLeaders([]);
			return;
		}

		setFilterBusy(true);
		try {
			const scopedBoards = await Promise.all(
				matchingEventGames.map((item) =>
					apiRequest<LeaderboardResponse>(`/api/leaderboards/game/${item._id}`)
						.then((resp) => resp.leaderboard)
						.catch(() => [])
				)
			);
			setFilteredLeaders(aggregateLeaderboards(scopedBoards));
		} finally {
			setFilterBusy(false);
		}
	}

	if (!selectedEvent) return null;
	const topScore = filteredLeaders[0]?.totalPoints ?? 0;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<button onClick={onBack} className="flex items-center gap-2 text-gray-500 font-bold hover:text-[#E31837] transition-colors">
					<ArrowLeft size={20} /> Back to Event List
				</button>
				<div className="flex items-center gap-2">
					<button
						onClick={() => setLinkWizardOpen(true)}
						className="px-4 py-2 bg-[#005696] text-white rounded-xl text-xs font-bold hover:bg-[#004477]"
					>
						Link And QR Wizard
					</button>
					<button
						onClick={() => {
							setManageError(null);
							setManageMessage(null);
							setQuickSetupOpen(true);
						}}
						className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50"
					>
						Manage Event
					</button>
					<button onClick={() => { void loadContext(); void onReload(); }} className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50">
						Refresh
					</button>
				</div>
			</div>

			<div className="bg-[#005696] p-8 rounded-3xl text-white shadow-xl">
				<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
					<div className="flex-1">
						<div className="flex items-center gap-3 mb-2">
							<span className="text-[10px] font-black uppercase tracking-widest bg-[#FFD200] text-[#005696] px-3 py-1 rounded-full">{selectedEvent.status}</span>
							<span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full">Live Data</span>
						</div>
						<h2 className="text-4xl font-black italic tracking-tighter uppercase">{selectedEvent.name}</h2>
						<p className="mt-2 text-blue-100 opacity-80">{selectedEvent.description}</p>
					</div>
					<div className="flex items-center gap-4 bg-white/10 p-4 rounded-2xl border border-white/10">
						<div className="text-center px-4 border-r border-white/20">
							<div className="text-2xl font-black">{filteredLeaders.length}</div>
							<div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Players</div>
						</div>
						<div className="text-center px-4">
							<div className="text-2xl font-black text-[#FFD200]">{topScore.toLocaleString()}</div>
							<div className="text-[10px] font-bold uppercase tracking-widest opacity-60">High Score</div>
						</div>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
				<aside className="lg:col-span-1 space-y-6">
					<div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
						<h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Filter size={16} /> Filters</h4>
						<div className="space-y-4">
							<div>
								<label className="text-[10px] font-black text-gray-400 uppercase block mb-2">Location</label>
								<select value={detailLocFilter} onChange={(e) => setDetailLocFilter(e.target.value)} className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-[#E31837]">
									<option value="all">All Locations ({locations.length})</option>
									{locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
								</select>
							</div>
							<div>
								<label className="text-[10px] font-black text-gray-400 uppercase block mb-2">Game</label>
								<select value={detailGameFilter} onChange={(e) => setDetailGameFilter(e.target.value)} className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-[#E31837]">
									<option value="all">Mapped Games ({mappedGameOptions.length})</option>
									{mappedGameOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
								</select>
							</div>
						</div>
					</div>

					<div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
						<h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><QrCode size={16} /> Link And QR Center</h4>
						{hasLoopbackQr && (
							<p className="mb-3 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
								Phone scan note: links currently use localhost. Set PUBLIC_BASE_URL to a phone-accessible URL to open on mobile.
							</p>
						)}
						<p className="text-xs text-gray-500 mb-3">Generate one QR at a time from a popup to keep this page compact.</p>
						<button
							onClick={() => setLinkWizardOpen(true)}
							className="w-full mb-3 py-2.5 rounded-xl bg-[#005696] text-white text-xs font-black uppercase tracking-widest hover:bg-[#004477]"
						>
							Open Link And QR Wizard
						</button>
						{eventGames.length === 0 ? (
							<p className="text-xs text-gray-400">No games mapped yet. Use Manage Event button to deploy a game first.</p>
						) : (
							<div className="space-y-3">
								{groupedEventGames.map((group) => (
									<div key={group.locationId} className="border border-gray-100 rounded-xl p-3">
										<div className="mt-2 flex items-center justify-between">
											<p className="text-xs font-black text-gray-700">{group.locationName}</p>
											<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{group.items.length} mapped game{group.items.length === 1 ? "" : "s"}</p>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</aside>

				<div className="lg:col-span-3 space-y-6">
					{filterBusy && <p className="text-center text-gray-400 font-bold animate-pulse py-8">Refreshing leaderboard…</p>}

					<div className="grid grid-cols-3 gap-4 h-64 items-end pb-4 bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
						<PodiumSlot player={filteredLeaders[1]} position={2} />
						<PodiumSlot player={filteredLeaders[0]} position={1} />
						<PodiumSlot player={filteredLeaders[2]} position={3} />
					</div>

					<div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
						<div className="p-6 border-b border-gray-50 flex items-center gap-2 bg-gray-50/50">
							<Activity size={18} className="text-[#005696]" />
							<h4 className="text-sm font-black text-[#005696] uppercase tracking-widest">Leaderboard</h4>
						</div>
						<div className="overflow-x-auto">
							<table className="w-full text-left">
								<thead className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
									<tr>
										<th className="px-6 py-4">Rank</th>
										<th className="px-6 py-4">Player</th>
										<th className="px-6 py-4">Entries</th>
										<th className="px-6 py-4 text-right">Score</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-50">
									{filteredLeaders.length > 0 ? (
										filteredLeaders.slice(0, 20).map((p) => (
											<tr key={String(p.playerId)} className="hover:bg-gray-50 transition-colors">
												<td className="px-6 py-4 font-bold text-gray-400 text-sm">{p.rank}</td>
												<td className="px-6 py-4 font-bold text-gray-800 text-sm">{p.displayName}</td>
												<td className="px-6 py-4 text-sm text-gray-400">{p.entries}</td>
												<td className="px-6 py-4 text-right font-mono font-black text-gray-900">{p.totalPoints.toLocaleString()}</td>
											</tr>
										))
									) : (
										<tr>
											<td colSpan={4} className="px-6 py-12 text-center">
												<div className="flex flex-col items-center text-gray-400">
													<Target size={40} className="mb-2 opacity-20" />
													<p className="font-bold">No scores yet for this event.</p>
												</div>
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>

			{linkWizardOpen && (
				<EventLinkWizardModal
					eventGames={eventGames}
					locations={locations}
					gameNameById={gameNameById}
					onClose={() => setLinkWizardOpen(false)}
					onResolveJoinLink={resolveJoinLink}
				/>
			)}

			{quickSetupOpen && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
					<div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl">
						<div className="bg-[#E31837] p-5 text-white flex items-center justify-between">
							<h3 className="text-lg font-black uppercase tracking-widest">Manage Event</h3>
							<button onClick={() => setQuickSetupOpen(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors"><X size={20} /></button>
						</div>
						<div className="p-6">
							<p className="text-xs text-gray-500 mb-4">Manage this event without reopening the wizard.</p>
							{manageMessage && <p className="mb-3 text-[11px] font-bold text-green-700 bg-green-50 border border-green-100 rounded-lg px-2 py-1.5">{manageMessage}</p>}
							{manageError && <p className="mb-3 text-[11px] font-bold text-[#E31837] bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">{manageError}</p>}

							<div className="space-y-3">
								<div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-100 p-1">
									<button type="button" onClick={() => setManageSection("locations")} className={`py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors ${manageSection === "locations" ? "bg-white text-[#005696] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Locations</button>
									<button type="button" onClick={() => setManageSection("games")} className={`py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors ${manageSection === "games" ? "bg-white text-[#005696] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Games</button>
									<button type="button" onClick={() => setManageSection("deploy")} className={`py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors ${manageSection === "deploy" ? "bg-white text-[#E31837] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Deploy</button>
								</div>

								<div className="max-h-[62vh] overflow-y-auto pr-1">
									{manageSection === "locations" && (
										<div className="space-y-3">
											<form onSubmit={(event) => { void addLocation(event); }} className="space-y-2 border border-gray-100 rounded-xl p-3">
												<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Create Location</p>
												<input value={newLocationName} onChange={(event) => setNewLocationName(event.target.value)} placeholder="Location name" className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]" />
												<input value={newLocationVenue} onChange={(event) => setNewLocationVenue(event.target.value)} placeholder="Venue (optional)" className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]" />
												<button disabled={manageBusy} className="w-full py-2 rounded-xl bg-[#005696] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#004477] disabled:opacity-60">Add Location</button>
											</form>

											<details className="border border-gray-100 rounded-xl p-3">
												<summary className="cursor-pointer list-none flex items-center justify-between text-[10px] font-black text-gray-500 uppercase tracking-widest">
													<span>Advanced Location Tools</span>
													<span>Expand</span>
												</summary>
												<div className="mt-3 space-y-3">
													<form onSubmit={(event) => { void addMultipleLocations(event); }} className="space-y-2">
														<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Bulk Add</p>
														<textarea value={bulkLocationInput} onChange={(event) => setBulkLocationInput(event.target.value)} rows={4} placeholder="One location per line" className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]" />
														<button disabled={manageBusy} className="w-full py-2 rounded-xl bg-[#005696] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#004477] disabled:opacity-60">Add All Locations</button>
													</form>

													<form onSubmit={(event) => { void importTemplateLocations(event); }} className="space-y-2">
														<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Import Templates</p>
														<div className="max-h-36 overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-2">
															{allLocations.filter((entry) => entry.eventId !== eventId).map((entry) => {
																const checked = selectedTemplateLocationIds.includes(entry._id);
																const sourceEvent = events.find((ev) => ev._id === entry.eventId)?.name ?? "Another event";
																return (
																	<label key={entry._id} className="flex items-start gap-2 text-xs font-bold text-gray-600">
																		<input
																			type="checkbox"
																			checked={checked}
																			onChange={(event) => {
																				setSelectedTemplateLocationIds((prev) => event.target.checked ? [...prev, entry._id] : prev.filter((id) => id !== entry._id));
																			}}
																		/>
																		<span>{entry.name} <span className="text-gray-400">({sourceEvent})</span></span>
																	</label>
																);
															})}
														</div>
														<button disabled={manageBusy} className="w-full py-2 rounded-xl bg-[#005696] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#004477] disabled:opacity-60">Import Selected Templates</button>
													</form>
												</div>
											</details>
										</div>
									)}

									{manageSection === "games" && (
										<div className="space-y-3">
											<form onSubmit={(event) => { void addGame(event); }} className="space-y-2 border border-gray-100 rounded-xl p-3">
												<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Create Game</p>
												<input value={newGameName} onChange={(event) => setNewGameName(event.target.value)} placeholder="Game name" className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]" />
												<input value={newGameScoreUnit} onChange={(event) => setNewGameScoreUnit(event.target.value)} placeholder="Score unit (points)" className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]" />
												<button disabled={manageBusy} className="w-full py-2 rounded-xl bg-[#005696] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#004477] disabled:opacity-60">Create Game</button>
											</form>

											<form onSubmit={(event) => { void saveGameEdits(event); }} className="space-y-2 border border-gray-100 rounded-xl p-3">
												<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Edit Existing Game</p>
												<select value={editGameId} onChange={(event) => {
													const target = localGames.find((entry) => entry._id === event.target.value);
													setEditGameId(event.target.value);
													setEditGameName(target?.name ?? "");
													setEditGameScoreUnit(target?.scoreUnit ?? "points");
													setEditGameScoringMode(target?.scoringMode ?? "INDIVIDUAL");
												}} className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]">
													<option value="">Select game</option>
													{localGames.map((game) => <option key={game._id} value={game._id}>{game.name}</option>)}
												</select>
												<input value={editGameName} onChange={(event) => setEditGameName(event.target.value)} placeholder="Game name" className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]" />
												<select value={editGameScoringMode} onChange={(event) => setEditGameScoringMode(event.target.value as "INDIVIDUAL" | "CUMULATIVE")} className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]">
													<option value="INDIVIDUAL">INDIVIDUAL</option>
													<option value="CUMULATIVE">CUMULATIVE</option>
												</select>
												<input value={editGameScoreUnit} onChange={(event) => setEditGameScoreUnit(event.target.value)} placeholder="Score unit" className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]" />
												<button disabled={manageBusy} className="w-full py-2 rounded-xl bg-[#005696] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#004477] disabled:opacity-60">Save Game Changes</button>
											</form>
										</div>
									)}

									{manageSection === "deploy" && (
										<form onSubmit={(event) => { void deployGameToLocation(event); }} className="space-y-2 border border-gray-100 rounded-xl p-3">
											<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Deploy Selected Games To Location</p>
											<select value={deployLocationId} onChange={(event) => setDeployLocationId(event.target.value)} className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]">
												<option value="">Select location</option>
												{locations.map((location) => <option key={location._id} value={location._id}>{location.name}</option>)}
											</select>
											<select value={deployScoringAuthority} onChange={(event) => setDeployScoringAuthority(event.target.value as "ADMIN_ONLY" | "PLAYER_SELF" | "HYBRID")} className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]">
												<option value="ADMIN_ONLY">Scoring: Admin only</option>
												<option value="PLAYER_SELF">Scoring: Player self-scoring</option>
												<option value="HYBRID">Scoring: Hybrid (Admin + Player)</option>
											</select>
											<div className="max-h-36 overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-2">
												{localGames.map((game) => (
													<label key={game._id} className="flex items-center gap-2 text-xs font-bold text-gray-600">
														<input
															type="checkbox"
															checked={selectedDeployGameIds.includes(game._id)}
															onChange={(event) => {
																setSelectedDeployGameIds((prev) => event.target.checked ? [...prev, game._id] : prev.filter((id) => id !== game._id));
															}}
														/>
														<span>{game.name}</span>
													</label>
												))}
											</div>
											<label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
												<input type="checkbox" checked={deployRoundsEnabled} onChange={(event) => setDeployRoundsEnabled(event.target.checked)} />
												Enable rounds
											</label>
											<input type="number" min={1} value={deployTotalRounds} onChange={(event) => setDeployTotalRounds(event.target.value)} disabled={!deployRoundsEnabled} placeholder="Total rounds" className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837] disabled:opacity-50" />
											<input type="number" min={1} value={deployMaxPointsPerRound} onChange={(event) => setDeployMaxPointsPerRound(event.target.value)} placeholder="Max points per round" className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]" />
											<button disabled={manageBusy} className="w-full py-2 rounded-xl bg-[#E31837] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#c1142f] disabled:opacity-60">Deploy Selected Games</button>
										</form>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

type LinkWizardStep = 1 | 2 | 3;
type LinkAudience = "player" | "admin";

function EventLinkWizardModal({
	eventGames,
	locations,
	gameNameById,
	onClose,
	onResolveJoinLink
}: {
	eventGames: EventGameRecord[];
	locations: LocationRecord[];
	gameNameById: Map<string, string>;
	onClose: () => void;
	onResolveJoinLink: (eventGame: EventGameRecord) => Promise<JoinLinkResponse>;
}) {
	const [step, setStep] = useState<LinkWizardStep>(1);
	const [selectedLocationId, setSelectedLocationId] = useState("");
	const [selectedEventGameId, setSelectedEventGameId] = useState("");
	const [audience, setAudience] = useState<LinkAudience>("player");
	const [joinLink, setJoinLink] = useState<JoinLinkResponse | null>(null);
	const [loadingLink, setLoadingLink] = useState(false);
	const [actionBusy, setActionBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const locationNameById = useMemo(() => new Map(locations.map((item) => [item._id, item.name])), [locations]);

	const locationOptions = useMemo(() => {
		const counts = new Map<string, number>();
		for (const item of eventGames) {
			counts.set(item.locationId, (counts.get(item.locationId) ?? 0) + 1);
		}

		return Array.from(counts.entries())
			.map(([locationId, mappedCount]) => ({
				locationId,
				name: locationNameById.get(locationId) ?? "Unknown Location",
				mappedCount
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [eventGames, locationNameById]);

	const gameOptions = useMemo(() => {
		if (!selectedLocationId) return [];
		return eventGames
			.filter((item) => item.locationId === selectedLocationId)
			.map((item) => ({
				eventGame: item,
				label: item.title ?? gameNameById.get(item.gameId) ?? "Unknown Game"
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [eventGames, selectedLocationId, gameNameById]);

	const selectedEventGame = useMemo(
		() => eventGames.find((item) => item._id === selectedEventGameId) ?? null,
		[eventGames, selectedEventGameId]
	);

	const selectedGameLabel = selectedEventGame
		? selectedEventGame.title ?? gameNameById.get(selectedEventGame.gameId) ?? "Game"
		: "Game";

	const selectedLocationLabel = selectedEventGame
		? locationNameById.get(selectedEventGame.locationId) ?? "Location"
		: "Location";

	const effectiveLink = useMemo(() => {
		if (!selectedEventGame) return null;
		if (joinLink) return joinLink;
		return buildClientJoinLink(selectedEventGame._id, selectedEventGame.joinToken);
	}, [selectedEventGame, joinLink]);

	const activeUrl = useMemo(() => {
		if (!effectiveLink || !selectedEventGame) return "";
		if (audience === "admin") {
			return effectiveLink.adminUrl ?? `${browserOrigin()}/game-admin/${selectedEventGame._id}`;
		}
		return effectiveLink.playerUrl ?? effectiveLink.joinUrl;
	}, [effectiveLink, audience, selectedEventGame]);

	const activeQrDataUrl = useMemo(() => {
		if (!effectiveLink) return undefined;
		return audience === "admin"
			? effectiveLink.adminQrCodeDataUrl
			: effectiveLink.playerQrCodeDataUrl ?? effectiveLink.qrCodeDataUrl;
	}, [effectiveLink, audience]);

	const linkLabel = `${selectedGameLabel} ${audience === "player" ? "Player" : "Game Admin"}`;

	function pickLocation(locationId: string) {
		setSelectedLocationId(locationId);
		setSelectedEventGameId("");
		setJoinLink(null);
		setError(null);
		setStep(2);
	}

	async function pickGame(eventGame: EventGameRecord) {
		setSelectedEventGameId(eventGame._id);
		setJoinLink(null);
		setError(null);
		setStep(3);
		setLoadingLink(true);
		try {
			const link = await onResolveJoinLink(eventGame);
			setJoinLink(link);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Unable to load QR link");
		} finally {
			setLoadingLink(false);
		}
	}

	async function copyLink() {
		if (!activeUrl) return;
		await navigator.clipboard.writeText(activeUrl).catch(() => undefined);
	}

	async function shareLinkQr() {
		if (!activeUrl || !selectedEventGame) return;
		setActionBusy(true);
		try {
			const dataUrl = await ensureQrDataUrl(activeQrDataUrl, activeUrl);
			await shareQrAsset({
				title: `${linkLabel} QR`,
				url: activeUrl,
				dataUrl,
				fileName: `${audience}-${selectedEventGame.joinToken}.svg`
			});
		} finally {
			setActionBusy(false);
		}
	}

	async function printLinkQr() {
		if (!activeUrl) return;
		setActionBusy(true);
		try {
			const dataUrl = await ensureQrDataUrl(activeQrDataUrl, activeUrl);
			printQrCards([{ label: linkLabel, dataUrl, url: activeUrl }]);
		} finally {
			setActionBusy(false);
		}
	}

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
			<div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl">
				<div className="bg-[#005696] p-5 text-white">
					<div className="flex items-center justify-between">
						<h3 className="text-lg font-black uppercase tracking-widest">Link And QR Wizard</h3>
						<button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition-colors"><X size={20} /></button>
					</div>
					<div className="mt-3 flex gap-2">
						{([1, 2, 3] as LinkWizardStep[]).map((entry) => (
							<div key={entry} className={`h-1.5 flex-1 rounded-full ${entry <= step ? "bg-white" : "bg-white/30"}`} />
						))}
					</div>
					<p className="mt-2 text-[11px] font-bold uppercase tracking-widest opacity-80">Step {step} of 3</p>
				</div>

				<div className="p-6 min-h-[460px]">
					{error && <p className="mb-3 text-[11px] font-bold text-[#E31837] bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">{error}</p>}

					{step === 1 && (
						<div className="space-y-3">
							<p className="text-sm font-black text-gray-500 uppercase tracking-widest">Select Location</p>
							{locationOptions.length === 0 ? (
								<p className="text-sm text-gray-400 font-bold">No deployed games yet. Deploy game mappings first.</p>
							) : (
								<div className="grid gap-2 max-h-72 overflow-y-auto">
									{locationOptions.map((item) => (
										<button
											key={item.locationId}
											onClick={() => pickLocation(item.locationId)}
											className="w-full p-3 border border-gray-200 rounded-xl text-left hover:bg-gray-50 hover:border-[#005696]"
										>
											<p className="font-black text-sm text-[#005696]">{item.name}</p>
											<p className="text-[11px] text-gray-500 font-bold">{item.mappedCount} mapped game{item.mappedCount === 1 ? "" : "s"}</p>
										</button>
									))}
								</div>
							)}
						</div>
					)}

					{step === 2 && (
						<div className="space-y-3">
							<p className="text-sm font-black text-gray-500 uppercase tracking-widest">Select Game</p>
							<p className="text-xs text-gray-500">Location: <span className="font-black text-[#005696]">{locationNameById.get(selectedLocationId) ?? "Unknown Location"}</span></p>
							{gameOptions.length === 0 ? (
								<p className="text-sm text-gray-400 font-bold">No mapped games for this location.</p>
							) : (
								<div className="grid gap-2 max-h-72 overflow-y-auto">
									{gameOptions.map((item) => (
										<button
											key={item.eventGame._id}
											onClick={() => { void pickGame(item.eventGame); }}
											className="w-full p-3 border border-gray-200 rounded-xl text-left hover:bg-gray-50 hover:border-[#005696]"
										>
											<p className="font-black text-sm text-[#005696]">{item.label}</p>
											<p className="text-[11px] text-gray-500 font-bold uppercase">Join token: {item.eventGame.joinToken}</p>
										</button>
									))}
								</div>
							)}
						</div>
					)}

					{step === 3 && selectedEventGame && (
						<div className="space-y-4">
							<div>
								<p className="text-sm font-black text-gray-500 uppercase tracking-widest">Choose Audience</p>
								<p className="text-xs text-gray-500 mt-1">{selectedLocationLabel} • <span className="font-black text-[#005696]">{selectedGameLabel}</span></p>
							</div>
							<div className="grid grid-cols-2 gap-2">
								<button
									onClick={() => setAudience("player")}
									className={`py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest ${audience === "player" ? "bg-[#E31837] border-[#E31837] text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
								>
									Player
								</button>
								<button
									onClick={() => setAudience("admin")}
									className={`py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest ${audience === "admin" ? "bg-[#005696] border-[#005696] text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
								>
									Game Admin
								</button>
							</div>

							<div className="border border-gray-100 rounded-xl p-3 flex flex-col items-center gap-3">
								{loadingLink ? (
									<p className="py-8 text-sm font-bold text-gray-400 animate-pulse">Preparing link...</p>
								) : (
									<QRDisplay dataUrl={activeQrDataUrl} value={activeUrl} size={220} />
								)}
								<a href={activeUrl} target="_blank" rel="noreferrer" className="text-[11px] text-[#005696] font-bold break-all">
									{activeUrl}
								</a>
								{isLoopbackUrl(activeUrl) && (
									<p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 text-center">
										Phone scan note: links currently use localhost. Set PUBLIC_BASE_URL to a phone-accessible URL.
									</p>
								)}
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
								<button
									disabled={actionBusy || !activeUrl}
									onClick={() => { void copyLink(); }}
									className="py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-black uppercase tracking-widest hover:bg-gray-50 disabled:opacity-50"
								>
									<Copy size={14} className="inline mr-1" /> Copy Link
								</button>
								<button
									disabled={actionBusy || !activeUrl}
									onClick={() => { void shareLinkQr(); }}
									className="py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-black uppercase tracking-widest hover:bg-gray-50 disabled:opacity-50"
								>
									<Share2 size={14} className="inline mr-1" /> Share
								</button>
								<button
									disabled={actionBusy || !activeUrl}
									onClick={() => { void printLinkQr(); }}
									className="py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-black uppercase tracking-widest hover:bg-gray-50 disabled:opacity-50"
								>
									<Printer size={14} className="inline mr-1" /> Print
								</button>
							</div>
						</div>
					)}
				</div>

				{step > 1 && (
					<div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50">
						<button
							onClick={() => {
								setError(null);
								setStep((prev) => (prev - 1) as LinkWizardStep);
							}}
							className="flex items-center gap-1 text-gray-500 font-bold hover:text-gray-700"
						>
							<ChevronLeft size={20} /> Back
						</button>
						<span className="text-xs text-gray-400 font-bold uppercase tracking-tight">Link setup</span>
					</div>
				)}
			</div>
		</div>
	);
}

function PodiumSlot({ player, position }: { player?: LeaderboardEntry; position: 1 | 2 | 3 }) {
	const heights = { 1: "h-32", 2: "h-24", 3: "h-16" } as const;
	const bgColors = { 1: "bg-[#005696] text-white", 2: "bg-gray-200 text-gray-600", 3: "bg-orange-100 text-orange-700" } as const;
	const labels = { 1: "1ST", 2: "2ND", 3: "3RD" } as const;
	return (
		<div className="flex flex-col items-center">
			{player ? (
				<>
					<div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 mb-2 ${position === 1 ? "bg-amber-50 border-[#FFD200]" : position === 2 ? "bg-gray-100 border-gray-200" : "bg-orange-50 border-orange-200"}`}>
						{position === 1 ? <Trophy className="text-[#FFD200]" size={24} /> : <Medal className={position === 2 ? "text-gray-400" : "text-orange-300"} size={20} />}
					</div>
					<div className="text-xs font-black uppercase text-center mb-1 truncate max-w-full">{player.displayName}</div>
					<div className="text-xs font-bold text-gray-400 mb-1">{player.totalPoints.toLocaleString()}</div>
					<div className={`${heights[position]} w-full ${bgColors[position]} rounded-t-xl flex items-end justify-center pb-2 font-black`}>{labels[position]}</div>
				</>
			) : (
				<div className={`${heights[position]} w-full bg-gray-50 rounded-t-xl`} />
			)}
		</div>
	);
}

// ─── Leaderboards Tab ─────────────────────────────────────────────────────────
function LeaderboardsView({ token, events }: { token: string; events: EventRecord[] }) {
	const [selectedEventId, setSelectedEventId] = useState(events[0]?._id ?? "");
	const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => { if (selectedEventId) void loadLeaderboard(selectedEventId); }, [selectedEventId]);

	async function loadLeaderboard(eventId: string) {
		setLoading(true); setError(null);
		try {
			const resp = await authed<LeaderboardResponse>(`/api/leaderboards/event/${eventId}`, token);
			setLeaderboard(resp.leaderboard);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load");
		} finally { setLoading(false); }
	}

	return (
		<div className="space-y-6">
			<div className="bg-white p-4 rounded-2xl shadow-sm flex flex-wrap gap-4 items-center">
				<div className="flex items-center gap-2 text-sm font-bold text-gray-500 mr-2"><Filter size={16} /> EVENT:</div>
				<select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 font-bold outline-none text-sm">
					{events.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
				</select>
			</div>
			<div className="bg-white rounded-2xl shadow-sm overflow-hidden">
				<div className="p-6 border-b border-gray-100 flex items-center gap-2">
					<Trophy className="text-[#FFD200]" />
					<h3 className="text-xl font-bold">Event Leaderboard</h3>
				</div>
				{loading ? (
					<p className="p-8 text-center text-gray-400 font-bold animate-pulse">Loading…</p>
				) : error ? (
					<p className="p-8 text-center text-[#E31837] font-bold">{error}</p>
				) : leaderboard.length === 0 ? (
					<p className="p-8 text-center text-gray-400 font-bold">No scores yet.</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-left">
							<thead><tr className="bg-gray-50 text-gray-500 text-sm uppercase">
								<th className="px-6 py-4 font-semibold">Rank</th>
								<th className="px-6 py-4 font-semibold">Player</th>
								<th className="px-6 py-4 font-semibold">Entries</th>
								<th className="px-6 py-4 font-semibold text-right">Score</th>
							</tr></thead>
							<tbody className="divide-y divide-gray-100">
								{leaderboard.map((p, idx) => (
									<tr key={String(p.playerId)} className="hover:bg-gray-50 transition-colors">
										<td className="px-6 py-4">
											<span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${idx === 0 ? "bg-[#FFD200] text-amber-900" : idx === 1 ? "bg-gray-200 text-gray-600" : idx === 2 ? "bg-orange-100 text-orange-700" : "text-gray-400"}`}>{p.rank}</span>
										</td>
										<td className="px-6 py-4 font-bold text-gray-900">{p.displayName}</td>
										<td className="px-6 py-4 text-sm text-gray-500">{p.entries}</td>
										<td className="px-6 py-4 text-right font-mono font-bold text-[#005696]">{p.totalPoints.toLocaleString()}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Wizard ───────────────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | 4;

function WizardModal({ token, events, games, onClose, onComplete }: {
	token: string; events: EventRecord[]; games: GameRecord[];
	onClose: () => void; onComplete: () => void;
}) {
	const [step, setStep] = useState<WizardStep>(1);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
	const [selectedLocation, setSelectedLocation] = useState<LocationRecord | null>(null);
	const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null);
	const [joinLink, setJoinLink] = useState<JoinLinkResponse | null>(null);
	const [locations, setLocations] = useState<LocationRecord[]>([]);

	const [creatingEvent, setCreatingEvent] = useState(true);
	const [newEventName, setNewEventName] = useState("");
	const [newEventDate, setNewEventDate] = useState(new Date().toISOString().slice(0, 10));

	const [creatingLocation, setCreatingLocation] = useState(true);
	const [newLocationName, setNewLocationName] = useState("");
	const [newLocationVenue, setNewLocationVenue] = useState("");
	const [allLocationTemplates, setAllLocationTemplates] = useState<LocationRecord[]>([]);
	const [selectedLocationTemplateId, setSelectedLocationTemplateId] = useState("");

	const [creatingGame, setCreatingGame] = useState(true);
	const [newGameName, setNewGameName] = useState("");
	const [newGameScoreUnit, setNewGameScoreUnit] = useState("points");
	const [wizardRoundsEnabled, setWizardRoundsEnabled] = useState(false);
	const [wizardScoringAuthority, setWizardScoringAuthority] = useState<"ADMIN_ONLY" | "PLAYER_SELF" | "HYBRID">("ADMIN_ONLY");
	const [wizardTotalRounds, setWizardTotalRounds] = useState("3");
	const [wizardMaxPointsPerRound, setWizardMaxPointsPerRound] = useState("10");

	async function loadLocations(eventId: string) {
		const locs = await authed<LocationRecord[]>(`/api/events/${eventId}/locations`, token);
		setLocations(locs);
	}

	async function pickEvent(ev: EventRecord) {
		setSelectedEvent(ev);
		await loadLocations(ev._id);
		const templates = await authed<LocationRecord[]>("/api/locations", token).catch(() => []);
		setAllLocationTemplates(templates.filter((entry) => entry.eventId !== ev._id));
		setStep(2);
	}

	async function createEvent() {
		if (!newEventName.trim()) return;
		setBusy(true); setError(null);
		try {
			const ev = await authed<EventRecord>("/api/events", token, {
				method: "POST",
				body: JSON.stringify({
					name: newEventName.trim(),
					eventDate: newEventDate
				})
			});
			await pickEvent(ev);
		} catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
		finally { setBusy(false); }
	}

	async function pickLocation(loc: LocationRecord) { setSelectedLocation(loc); setStep(3); }

	async function createLocation() {
		if (!newLocationName.trim() || !selectedEvent) return;
		setBusy(true); setError(null);
		try {
			const loc = await authed<LocationRecord>(`/api/events/${selectedEvent._id}/locations`, token, { method: "POST", body: JSON.stringify({ name: newLocationName.trim(), venue: newLocationVenue.trim() || undefined }) });
			setLocations((prev) => [loc, ...prev]);
			await pickLocation(loc);
		} catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
		finally { setBusy(false); }
	}

	async function importLocationTemplate() {
		if (!selectedEvent || !selectedLocationTemplateId) return;

		const template = allLocationTemplates.find((entry) => entry._id === selectedLocationTemplateId);
		if (!template) return;

		setBusy(true); setError(null);
		try {
			const loc = await authed<LocationRecord>(`/api/events/${selectedEvent._id}/locations`, token, {
				method: "POST",
				body: JSON.stringify({ name: template.name, venue: template.venue })
			});
			setLocations((prev) => [loc, ...prev]);
			await pickLocation(loc);
		} catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
		finally { setBusy(false); }
	}

	async function deploy(gm: GameRecord) {
		if (!selectedEvent || !selectedLocation) return;
		setSelectedGame(gm);
		setBusy(true); setError(null);
		try {
			const eg = await authed<EventGameRecord>("/api/event-games", token, {
				method: "POST",
				body: JSON.stringify({
					eventId: selectedEvent._id,
					locationId: selectedLocation._id,
					gameId: gm._id,
					settings: {
						scoringAuthority: wizardScoringAuthority,
						roundsEnabled: wizardRoundsEnabled,
						totalRounds: wizardRoundsEnabled ? Number(wizardTotalRounds) : undefined,
						maxPointsPerRound: Number(wizardMaxPointsPerRound) || undefined
					}
				})
			});
			const link = await authed<JoinLinkResponse>(`/api/event-games/${eg._id}/join-link`, token);
			setJoinLink(link);
			setStep(4);
		} catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
		finally { setBusy(false); }
	}

	async function createGame() {
		if (!newGameName.trim()) return;
		setBusy(true); setError(null);
		try {
			const key = newGameName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
			const gm = await authed<GameRecord>("/api/games", token, { method: "POST", body: JSON.stringify({ name: newGameName.trim(), key, scoreUnit: newGameScoreUnit }) });
			await deploy(gm);
		} catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
		finally { setBusy(false); }
	}

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
			<div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl">
				<div className="bg-[#E31837] p-6 text-white">
					<div className="flex justify-between items-center mb-4">
						<h2 className="text-2xl font-bold italic tracking-tight uppercase">WAG MORE BARK LESS</h2>
						<button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition-colors"><X size={24} /></button>
					</div>
					<div className="flex gap-2">
						{([1, 2, 3, 4] as WizardStep[]).map((s) => (
							<div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-white" : "bg-white/30"}`} />
						))}
					</div>
					<p className="text-sm font-medium mt-3 uppercase tracking-widest opacity-80">Step {step} of 4</p>
				</div>

				<div className="p-8 min-h-[440px]">
					{error && <p className="mb-4 text-[#E31837] font-bold text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

					{step === 1 && (!creatingEvent ? (
						<div className="space-y-4">
							<label className="block text-sm font-bold text-gray-700 uppercase tracking-tight">Select Event</label>
							<div className="grid gap-3 max-h-64 overflow-y-auto">
								<button onClick={() => setCreatingEvent(true)} className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-bold hover:border-[#E31837] hover:text-[#E31837] transition-all flex items-center justify-center gap-2">
									<Plus size={18} /> Create New Event
								</button>
								{events.map((ev) => (
									<button key={ev._id} onClick={() => { void pickEvent(ev); }} disabled={busy} className="w-full p-4 border-2 border-gray-100 rounded-xl flex items-center justify-between hover:border-[#E31837] hover:bg-red-50 transition-all text-left disabled:opacity-50">
										<div><div className="font-bold">{ev.name}</div><div className="text-xs text-gray-500 uppercase">{ev.status}</div></div>
										<ChevronRight className="text-gray-400" />
									</button>
								))}
							</div>
						</div>
					) : (
						<div className="space-y-4">
							<label className="block text-sm font-bold text-gray-700 uppercase">New Event Name</label>
							<input autoFocus type="text" value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="e.g. Summer Paw-ty 2026" className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-[#E31837] outline-none font-bold" />
							<input type="date" value={newEventDate} onChange={(e) => setNewEventDate(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-[#E31837] outline-none font-bold" />
							<div className="flex gap-3 pt-2">
								<button onClick={() => setCreatingEvent(false)} className="flex-1 py-4 px-6 rounded-xl border-2 border-gray-100 font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
								<button disabled={!newEventName || busy} onClick={() => { void createEvent(); }} className={`flex-1 py-4 px-6 rounded-xl font-bold text-white ${newEventName && !busy ? "bg-[#E31837]" : "bg-gray-300"}`}>{busy ? "Creating…" : "Continue"}</button>
							</div>
						</div>
					))}

					{step === 2 && (!creatingLocation ? (
						<div className="space-y-4">
							<label className="block text-sm font-bold text-gray-700 uppercase tracking-tight">Select Location for <span className="text-[#005696]">{selectedEvent?.name}</span></label>
							<div className="grid gap-3 max-h-64 overflow-y-auto">
								<button onClick={() => setCreatingLocation(true)} className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-bold hover:border-[#E31837] hover:text-[#E31837] transition-all flex items-center justify-center gap-2">
									<Plus size={18} /> Add New Location
								</button>
								{locations.map((loc) => (
									<button key={loc._id} onClick={() => { void pickLocation(loc); }} disabled={busy} className="w-full p-4 border-2 border-gray-100 rounded-xl flex items-center justify-between hover:border-[#E31837] hover:bg-red-50 transition-all text-left disabled:opacity-50">
										<div className="flex gap-4 items-center">
											<MapPin className="text-[#005696]" />
											<div><div className="font-bold">{loc.name}</div><div className="text-xs text-gray-500">{loc.venue ?? "No venue"}</div></div>
										</div>
										<ChevronRight className="text-gray-400" />
									</button>
								))}
							</div>
						</div>
					) : (
						<div className="space-y-4">
							<label className="block text-sm font-bold text-gray-700 uppercase">New Location</label>
							<input autoFocus type="text" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)} placeholder="Location Name" className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-[#E31837] outline-none font-bold" />
							<input type="text" value={newLocationVenue} onChange={(e) => setNewLocationVenue(e.target.value)} placeholder="Venue / Address (optional)" className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-[#E31837] outline-none font-bold" />
							<div className="rounded-xl border border-gray-100 p-3 bg-gray-50 space-y-2">
								<p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Or import existing location template</p>
								<select value={selectedLocationTemplateId} onChange={(e) => setSelectedLocationTemplateId(e.target.value)} className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]">
									<option value="">Select template location</option>
									{allLocationTemplates.map((entry) => (
										<option key={entry._id} value={entry._id}>{entry.name}</option>
									))}
								</select>
								<button type="button" disabled={!selectedLocationTemplateId || busy} onClick={() => { void importLocationTemplate(); }} className="w-full py-2 rounded-xl bg-[#005696] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#004477] disabled:opacity-60">
									Import Template Location
								</button>
							</div>
							<div className="flex gap-3 pt-2">
								<button onClick={() => setCreatingLocation(false)} className="flex-1 py-4 px-6 rounded-xl border-2 border-gray-100 font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
								<button disabled={!newLocationName || busy} onClick={() => { void createLocation(); }} className={`flex-1 py-4 px-6 rounded-xl font-bold text-white ${newLocationName && !busy ? "bg-[#E31837]" : "bg-gray-300"}`}>{busy ? "Creating…" : "Continue"}</button>
							</div>
						</div>
					))}

					{step === 3 && (!creatingGame ? (
						<div className="space-y-4">
							<label className="block text-sm font-bold text-gray-700 uppercase tracking-tight">Select Game for <span className="text-[#005696]">{selectedLocation?.name}</span></label>
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-gray-50 border border-gray-100 rounded-xl">
								<select value={wizardScoringAuthority} onChange={(e) => setWizardScoringAuthority(e.target.value as "ADMIN_ONLY" | "PLAYER_SELF" | "HYBRID")} className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]">
									<option value="ADMIN_ONLY">Scoring: Admin only</option>
									<option value="PLAYER_SELF">Scoring: Player self-scoring</option>
									<option value="HYBRID">Scoring: Hybrid (Admin + Player)</option>
								</select>
								<label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
									<input type="checkbox" checked={wizardRoundsEnabled} onChange={(e) => setWizardRoundsEnabled(e.target.checked)} />
									Enable rounds
								</label>
								<input type="number" min={1} value={wizardTotalRounds} onChange={(e) => setWizardTotalRounds(e.target.value)} disabled={!wizardRoundsEnabled} placeholder="Total rounds" className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-[#E31837] disabled:opacity-50" />
								<input type="number" min={1} value={wizardMaxPointsPerRound} onChange={(e) => setWizardMaxPointsPerRound(e.target.value)} placeholder="Max points/round" className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-[#E31837]" />
							</div>
							<div className="grid gap-3 max-h-64 overflow-y-auto">
								<button onClick={() => setCreatingGame(true)} className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-bold hover:border-[#E31837] hover:text-[#E31837] transition-all flex items-center justify-center gap-2">
									<Plus size={18} /> Create New Game
								</button>
								{games.map((gm) => (
									<button key={gm._id} onClick={() => { void deploy(gm); }} disabled={busy} className="w-full p-4 border-2 border-gray-100 rounded-xl flex items-center justify-between hover:border-[#E31837] hover:bg-red-50 transition-all text-left disabled:opacity-50">
										<div className="flex gap-4 items-center">
											<Gamepad2 className="text-[#E31837]" />
											<div><div className="font-bold">{gm.name}</div><div className="text-xs text-gray-500 uppercase">{gm.scoreUnit}</div></div>
										</div>
										<ChevronRight className="text-gray-400" />
									</button>
								))}
							</div>
						</div>
					) : (
						<div className="space-y-4">
							<label className="block text-sm font-bold text-gray-700 uppercase">New Game</label>
							<input autoFocus type="text" value={newGameName} onChange={(e) => setNewGameName(e.target.value)} placeholder="Game Name" className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-[#E31837] outline-none font-bold" />
							<input type="text" value={newGameScoreUnit} onChange={(e) => setNewGameScoreUnit(e.target.value)} placeholder="Score unit (e.g. points, seconds)" className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-[#E31837] outline-none font-bold" />
							<div className="flex gap-3 pt-2">
								<button onClick={() => setCreatingGame(false)} className="flex-1 py-4 px-6 rounded-xl border-2 border-gray-100 font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
								<button disabled={!newGameName || busy} onClick={() => { void createGame(); }} className={`flex-1 py-4 px-6 rounded-xl font-bold text-white ${newGameName && !busy ? "bg-[#E31837]" : "bg-gray-300"}`}>{busy ? "Creating…" : "Continue"}</button>
							</div>
						</div>
					))}

					{step === 4 && joinLink && (
						<div className="flex flex-col items-center">
							<div className="bg-green-50 text-green-700 px-4 py-2 rounded-full flex items-center gap-2 text-sm font-bold mb-6">
								<CheckCircle2 size={18} /> Game deployed successfully
							</div>
							<div className="w-full border border-gray-100 rounded-xl p-3 flex flex-col items-center gap-2">
								<p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Player QR</p>
								<QRDisplay dataUrl={joinLink.playerQrCodeDataUrl ?? joinLink.qrCodeDataUrl} value={joinLink.playerUrl ?? joinLink.joinUrl} size={220} />
							</div>
							<div className="mt-6 text-center space-y-2">
								<h3 className="font-bold text-lg">{selectedGame?.name ?? "Game"}</h3>
								<p className="text-gray-500 text-sm">{selectedEvent?.name} • {selectedLocation?.name}</p>
								<a
									href={joinLink.playerUrl ?? joinLink.joinUrl}
									target="_blank"
									rel="noreferrer"
									className="text-[11px] text-[#005696] font-bold break-all"
								>
									{joinLink.playerUrl ?? joinLink.joinUrl}
								</a>
								{isLoopbackUrl(joinLink.playerUrl ?? joinLink.joinUrl) && (
									<p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 max-w-sm mx-auto">
										Phone scan note: links currently use localhost. Set PUBLIC_BASE_URL to a phone-accessible URL.
									</p>
								)}
							</div>
							<div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
								<button
									onClick={() => { void shareQrAsset({
										title: `${selectedGame?.name ?? "Game"} Player QR`,
										url: joinLink.playerUrl ?? joinLink.joinUrl,
										dataUrl: joinLink.playerQrCodeDataUrl ?? joinLink.qrCodeDataUrl,
										fileName: `player-${joinLink.joinToken}.svg`
									}); }}
									className="py-3 px-4 rounded-xl border border-gray-200 font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
								>
									<Share2 size={16} /> Share Player QR
								</button>
								<button
									onClick={() => { navigator.clipboard.writeText(joinLink.playerUrl ?? joinLink.joinUrl).catch(() => undefined); }}
									className="py-3 px-4 rounded-xl border border-gray-200 font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
								>
									<Copy size={16} /> Copy Link
								</button>
							</div>
							<div className="mt-3 w-full">
								<button onClick={onComplete} className="w-full py-3 px-6 rounded-xl bg-[#E31837] text-white font-bold hover:bg-[#c1142f] shadow-lg shadow-red-200 transition-all">
									Done
								</button>
							</div>
						</div>
					)}

					{step === 4 && !joinLink && busy && (
						<p className="text-center text-gray-400 font-bold animate-pulse py-12">Deploying…</p>
					)}
				</div>

				{step > 1 && step < 4 && (
					<div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50">
						<button onClick={() => setStep((prev) => (prev - 1) as WizardStep)} className="flex items-center gap-1 text-gray-500 font-bold hover:text-gray-700">
							<ChevronLeft size={20} /> Back
						</button>
						<span className="text-xs text-gray-400 font-bold uppercase tracking-tight">Setup in progress</span>
					</div>
				)}
			</div>
		</div>
	);
}
