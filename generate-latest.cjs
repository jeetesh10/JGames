const fs = require('fs');

const appTsx = `import React, { useState, useEffect } from 'react';
import { Route, Routes, Link, useNavigate, Navigate } from 'react-router-dom';
import { apiRequest } from './api';
import type { EventRecord, LocationRecord, GameRecord, EventGameRecord, LeaderboardResponse } from './types';

const storageKeys = {
  adminToken: "jgames.adminToken",
  playerToken: "jgames.playerToken",
  lastPlayerId: "jgames.lastPlayerId"
};

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(storageKeys.adminToken) ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [view, setView] = useState('admin');
  const [adminSection, setAdminSection] = useState('dashboard');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [newLocationFormOpen, setNewLocationFormOpen] = useState(false);

  // Data fetching states
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [games, setGames] = useState<GameRecord[]>([]);
  const [eventGames, setEventGames] = useState<EventGameRecord[]>([]);
  const [leaderboards, setLeaderboards] = useState<{ [id: string]: LeaderboardResponse }>({});
  const [loading, setLoading] = useState(false);

  // Forms
  const [selectedEventId, setSelectedEventId] = useState<string>("__new__");
  const [eventForm, setEventForm] = useState({ name: "", eventDate: "", description: "", sponsor: "" });
  const [selectedLocationId, setSelectedLocationId] = useState<string>("__new__");
  const [locationForm, setLocationForm] = useState({ name: "", code: "", venue: "" });
  const [selectedGameId, setSelectedGameId] = useState<string>("__new__");
  const [gameForm, setGameForm] = useState({ name: "", key: "", scoreUnit: "points" });

  // Add loadWorkspace logic here
  async function loadWorkspace(authToken: string) {
    try {
      const [evts, gms] = await Promise.all([
        apiRequest<EventRecord[]>('/api/events', { headers: { Authorization: \`Bearer \${authToken}\` } }),
        apiRequest<GameRecord[]>('/api/games', { headers: { Authorization: \`Bearer \${authToken}\` } })
      ]);
      setEvents(evts);
      setGames(gms);
      
      const firstActiveEvt = evts.find(e => e.status !== 'CLOSED') || evts[0];
      if (firstActiveEvt) {
        setSelectedEventId(firstActiveEvt._id);
        const [locs, evtGms] = await Promise.all([
            apiRequest<LocationRecord[]>(\`/api/events/\${firstActiveEvt._id}/locations\`, { headers: { Authorization: \`Bearer \${authToken}\` } }),
            apiRequest<EventGameRecord[]>(\`/api/event-games?eventId=\${firstActiveEvt._id}\`, { headers: { Authorization: \`Bearer \${authToken}\` } })
        ]);
        setLocations(locs);
        setEventGames(evtGms);
        if (locs.length > 0) setSelectedLocationId(locs[0]._id);
        if (gms.length > 0) setSelectedGameId(gms[0]._id);

        try {
           const lb = await apiRequest<LeaderboardResponse>(\`/api/leaderboards/event/\${firstActiveEvt._id}\`);
           setLeaderboards(prev => ({...prev, [firstActiveEvt._id]: lb}));
        } catch (e) {
           console.log("No leaderboard yet or err", e);
        }
      }
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message.includes('401')) {
          logout();
      }
    }
  }

  useEffect(() => {
    if (token) {
      loadWorkspace(token);
    }
  }, [token]);

  useEffect(() => {
    if ((window as any).lucide) {
      (window as any).lucide.createIcons();
    }
  }, [view, adminSection, wizardOpen, currentStep, newLocationFormOpen, token, events, locations, games, leaderboards]);

  const login = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        const result = await apiRequest<{ token: string; role: string }>("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });
        if (result.role !== "ADMIN") throw new Error("Not an admin");
        localStorage.setItem(storageKeys.adminToken, result.token);
        setToken(result.token);
      } catch (err: any) {
        setLoginError(err.message);
      }
  };

  const logout = () => {
      localStorage.removeItem(storageKeys.adminToken);
      setToken("");
      setEvents([]);
      setLocations([]);
      setGames([]);
      setEventGames([]);
  };

  const handleCreateEvent = async () => {
      try {
        const newEvt = await apiRequest<EventRecord>('/api/events', {
            method: 'POST',
            headers: { Authorization: \`Bearer \${token}\` },
            body: JSON.stringify({
                name: eventForm.name,
                eventDate: eventForm.eventDate || new Date().toISOString().split('T')[0],
                description: eventForm.description,
                status: 'DRAFT'
            })
        });
        setEvents(prev => [newEvt, ...prev]);
        setSelectedEventId(newEvt._id);
        return newEvt;
      } catch (err) { console.error(err); }
  };

  const handleCreateLocation = async (eventId: string) => {
      try {
        const newLoc = await apiRequest<LocationRecord>(\`/api/events/\${eventId}/locations\`, {
            method: 'POST',
            headers: { Authorization: \`Bearer \${token}\` },
            body: JSON.stringify({
                name: locationForm.name || "Main Store",
                code: locationForm.code,
                venue: locationForm.venue
            })
        });
        setLocations(prev => [newLoc, ...prev]);
        setSelectedLocationId(newLoc._id);
        setNewLocationFormOpen(false);
        return newLoc;
      } catch (err) { console.error(err); }
  };

  const handleCreateGame = async () => {
       try {
        const newGm = await apiRequest<GameRecord>('/api/games', {
            method: 'POST',
            headers: { Authorization: \`Bearer \${token}\` },
            body: JSON.stringify({
                name: gameForm.name || "Standard Game",
                key: gameForm.key || "standard_game",
                scoreUnit: gameForm.scoreUnit || "points",
                scoringMode: 'INDIVIDUAL'
            })
        });
        setGames(prev => [newGm, ...prev]);
        setSelectedGameId(newGm._id);
        return newGm;
      } catch (err) { console.error(err); }
  };

  const handleMapGame = async (eventId: string, locationId: string, gameId: string) => {
      try {
         const newEg = await apiRequest<EventGameRecord>('/api/event-games', {
            method: 'POST',
            headers: { Authorization: \`Bearer \${token}\` },
            body: JSON.stringify({ eventId, locationId, gameId })
        });
        setEventGames(prev => [newEg, ...prev]);
      } catch (err) { console.error(err); }
  };

  const moveStep = async (dir: number) => {
    let proceed = true;
    if (dir === 1) {
        if (currentStep === 1) {
            if (selectedEventId === "__new__" && eventForm.name) {
                await handleCreateEvent();
            }
        } else if (currentStep === 2) {
            if (newLocationFormOpen && locationForm.name) {
                await handleCreateLocation(selectedEventId);
            }
        } else if (currentStep === 3) {
            if (selectedEventId !== "__new__" && selectedLocationId !== "__new__" && selectedGameId !== "__new__") {
                await handleMapGame(selectedEventId, selectedLocationId, selectedGameId);
            }
            if (selectedGameId === "__new__" && gameForm.name) {
                const gm = await handleCreateGame();
                if (gm && selectedLocationId !== "__new__") await handleMapGame(selectedEventId, selectedLocationId, gm._id);
            }
        }
    }

    if (!proceed) return;

    const next = currentStep + dir;
    if (next > 4) {
      setWizardOpen(false);
      loadWorkspace(token); // refresh
    } else if (next > 0) {
      setCurrentStep(next);
    }
  };

  if (!token) {
      return (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
              <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-slate-100">
                  <div className="flex items-baseline ps-logo-text justify-center mb-8">
                     <span className="text-[#0064B1] text-3xl">Pet</span><span className="text-[#E51837] text-3xl">Smart</span>
                  </div>
                  <h2 className="text-2xl font-black italic tracking-tighter uppercase text-center mb-6 text-slate-800">Admin Portal Login</h2>
                  <form onSubmit={login} className="space-y-4">
                      {loginError && <p className="text-red-600 text-sm font-bold text-center">{loginError}</p>}
                      <input 
                         type="email" 
                         value={email} 
                         onChange={e => setEmail(e.target.value)}
                         placeholder="Admin Email" 
                         className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 outline-none" 
                         required 
                      />
                      <input 
                         type="password" 
                         value={password} 
                         onChange={e => setPassword(e.target.value)}
                         placeholder="Password" 
                         className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 outline-none" 
                         required 
                      />
                      <button type="submit" className="w-full btn-primary text-white font-black py-4 rounded-xl shadow-lg uppercase tracking-widest mt-4">
                          Secure Login
                      </button>
                  </form>
              </div>
          </div>
      );
  }

  // Active event leaderboard
  const currentLeaderboard = selectedEventId !== "__new__" ? leaderboards[selectedEventId]?.leaderboard || [] : [];
  const totalPoints = currentLeaderboard.reduce((sum, entry) => sum + entry.totalPoints, 0);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 z-50 shadow-sm shrink-0">
          <div className="flex items-center gap-4">
              <div className="flex items-baseline ps-logo-text">
                  <span className="text-[#0064B1] text-2xl">Pet</span><span className="text-[#E51837] text-2xl">Smart</span>
              </div>
              <div className="w-px h-6 bg-gray-200 mx-2"></div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-800 uppercase italic hidden sm:block">Wag More Bark Less</h1>
          </div>
          
          <div className="flex items-center gap-4">
              <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button onClick={() => setView('admin')} className={"px-4 py-1.5 rounded-md text-sm font-medium transition-all " + (view === 'admin' ? "bg-white shadow-sm text-blue-700" : "text-gray-500")}>Admin</button>
                  <button onClick={() => setView('player')} className={"px-4 py-1.5 rounded-md text-sm font-medium transition-all " + (view === 'player' ? "bg-white shadow-sm text-blue-700" : "text-gray-500")}>Player</button>
              </div>
              <div className="flex items-center gap-2 ml-4">
                  <span className="text-sm font-semibold text-gray-700 hidden sm:block uppercase tracking-widest">Admin Portal</span>
                  <button onClick={logout} className="text-xs bg-slate-100 px-3 py-1.5 rounded hover:bg-slate-200 text-slate-600 font-bold ml-2">LOGOUT</button>
              </div>
          </div>
      </header>

      <div className="flex-1 flex overflow-hidden w-full relative">
          
          {/* SIDEBAR */}
          {view === 'admin' && (
          <aside className="w-64 ps-gradient text-white flex flex-col shrink-0">
              <nav className="flex-1 py-6 px-4 space-y-2">
                  <button onClick={() => setAdminSection('dashboard')} className={"w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors " + (adminSection === 'dashboard' ? 'sidebar-link active bg-white/10 border-l-4 border-l-[var(--ps-red)]' : 'hover:bg-white/5')}>
                      <i data-lucide="layout-dashboard" className="w-5 h-5"></i> Roll-up Stats
                  </button>
                  <button onClick={() => { setWizardOpen(true); setCurrentStep(1); }} className="bg-white/10 hover:bg-white/20 w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold border-l-4 border-l-red-500 shadow-lg mb-4 mt-2 transition-all hover:scale-[1.02]">
                      <i data-lucide="sparkles" className="w-5 h-5 text-yellow-400"></i> Setup New Event
                  </button>
                  <button onClick={() => setAdminSection('scoring')} className={"w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors " + (adminSection === 'scoring' ? 'sidebar-link active bg-white/10 border-l-4 border-l-[var(--ps-red)]' : 'hover:bg-white/5')}>
                      <i data-lucide="settings-2" className="w-5 h-5"></i> Point Systems
                  </button>
                  <button onClick={() => setAdminSection('leaderboard')} className={"w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors " + (adminSection === 'leaderboard' ? 'sidebar-link active bg-white/10 border-l-4 border-l-[var(--ps-red)]' : 'hover:bg-white/5')}>
                      <i data-lucide="trophy" className="w-5 h-5"></i> Leaderboard
                  </button>
                  <div className="pt-6 pb-2 text-[10px] uppercase tracking-widest font-bold opacity-50 px-4">Management</div>
                  <button onClick={() => setAdminSection('locations')} className={"w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium " + (adminSection === 'locations' ? 'sidebar-link active bg-white/10 border-l-4 border-l-[var(--ps-red)]' : 'hover:bg-white/5')}>
                      <i data-lucide="map-pin" className="w-5 h-5"></i> Location Manager
                  </button>
              </nav>
          </aside>
          )}

          {/* MAIN CONTENT */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#f8fafc]">
              
              {/* ADMIN DASHBOARD */}
              {view === 'admin' && adminSection === 'dashboard' && (
              <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-200">
                  <div>
                      <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Global Analytics Roll-up</h2>
                      <p className="text-slate-500 font-medium">Points aggregated across all active game instances and PetSmart locations</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-blue-600">
                          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Network Points</h3>
                          <p className="text-4xl font-black text-slate-800 mt-1">{totalPoints.toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-red-600">
                          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Players</h3>
                          <p className="text-4xl font-black text-slate-800 mt-1">{currentLeaderboard.length.toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-blue-400">
                          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Locations</h3>
                          <p className="text-4xl font-black text-slate-800 mt-1">{locations.length}</p>
                      </div>
                      <div className="bg-[#0064B1] p-6 rounded-2xl shadow-lg text-white">
                          <h3 className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Treats Rewards Issued</h3>
                          <p className="text-4xl font-black mt-1">{Math.floor(totalPoints / 50).toLocaleString()}</p>
                      </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                          <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                              <h3 className="font-black text-slate-800 uppercase italic">Location Roll-up</h3>
                              <span className="text-[10px] font-bold text-blue-600 uppercase">Top Performers</span>
                          </div>
                          <table className="w-full text-left">
                              <tbody>
                                  <tr className="text-[10px] uppercase font-bold text-slate-400 tracking-widest border-b">
                                      <th className="px-6 py-4">Store Location</th>
                                      <th className="px-6 py-4">Status</th>
                                  </tr>
                                  {locations.slice(0,5).map(loc => (
                                    <tr key={loc._id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-800">{loc.name} {loc.code ? \`#\${loc.code}\` : ""}</td>
                                        <td className="px-6 py-4 text-green-600 text-xs font-bold uppercase tracking-widest">Active</td>
                                    </tr>
                                  ))}
                                  {locations.length === 0 && (
                                     <tr><td colSpan={2} className="px-6 py-8 text-center text-slate-400">No active locations for this event.</td></tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                          <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                              <h3 className="font-black text-slate-800 uppercase italic">Game Level Roll-up</h3>
                              <span className="text-[10px] font-bold text-red-600 uppercase">Category Engagement</span>
                          </div>
                          <table className="w-full text-left">
                              <tbody>
                                  <tr className="text-[10px] uppercase font-bold text-slate-400 tracking-widest border-b">
                                      <th className="px-6 py-4">Game Template</th>
                                      <th className="px-6 py-4">Scoring Unit</th>
                                  </tr>
                                  {games.map(gm => (
                                    <tr key={gm._id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-800">{gm.name}</td>
                                        <td className="px-6 py-4 text-slate-500 uppercase text-xs font-bold tracking-wider">{gm.scoreUnit}</td>
                                    </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
              )}

              {/* ADMIN SCORING */}
              {view === 'admin' && adminSection === 'scoring' && (
              <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-200">
                  <div>
                      <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Point System Configuration</h2>
                      <p className="text-slate-500 font-medium">Define custom scoring rules and Treats multipliers for each game template</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {games.map(game => (
                      <div key={game._id} className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-slate-100 space-y-6">
                          <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                  <div className="p-3 bg-red-50 text-red-600 rounded-xl"><i data-lucide="zap"></i></div>
                                  <h3 className="font-black text-xl uppercase tracking-tighter">{game.name}</h3>
                              </div>
                              <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase">Standard Rule Set</span>
                          </div>
                          <div className="space-y-6">
                              <div className="space-y-2">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Base Value ({game.scoreUnit})</label>
                                  <div className="flex items-center gap-4">
                                      <input type="range" className="flex-1 accent-red-600" min="100" max="5000" step="100" defaultValue="1000" />
                                      <span className="font-black text-slate-800 text-lg">1,000</span>
                                  </div>
                              </div>
                              <div className="bg-blue-700 p-6 rounded-2xl text-white">
                                  <div className="flex items-center gap-2 mb-4">
                                      <i data-lucide="sparkles" className="w-4 h-4"></i>
                                      <span className="text-xs font-bold uppercase tracking-widest">PetSmart Treats Conversion</span>
                                  </div>
                                  <div className="flex items-end gap-2">
                                      <span className="text-2xl font-black">50 Points</span>
                                      <span className="text-sm font-bold opacity-60 pb-1">= 1 Treats Point</span>
                                  </div>
                                  <p className="text-[10px] mt-4 opacity-70">Points roll up automatically to the player's Treats account after session validation.</p>
                              </div>
                          </div>
                          <button className="w-full btn-primary text-white font-black py-4 rounded-2xl shadow-xl hover:scale-[1.02] transition-all uppercase tracking-widest">Update Global Rules</button>
                      </div>
                      ))}
                  </div>
              </div>
              )}

              {/* ADMIN LEADERBOARD */}
              {view === 'admin' && adminSection === 'leaderboard' && (
              <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center">
                      <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Live Player Rankings</h2>
                      <div className="flex gap-2">
                          <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-bold shadow-sm outline-none">
                              <option value="">All Locations (Select Event)</option>
                              {events.map((e) => (
                                  <option key={e._id} value={e._id}>{e.name}</option>
                              ))}
                          </select>
                      </div>
                  </div>
                  <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                      <table className="w-full text-left">
                          <tbody>
                              <tr className="bg-slate-900 text-white text-[10px] uppercase font-bold tracking-widest">
                                  <th className="px-5 sm:px-8 py-5">Rank</th>
                                  <th className="px-5 sm:px-8 py-5">Player</th>
                                  <th className="px-5 sm:px-8 py-5">Entries</th>
                                  <th className="px-5 sm:px-8 py-5 text-right">Points</th>
                              </tr>
                              {currentLeaderboard.map((entry, idx) => (
                                <tr key={entry.playerId} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                    <td className="px-5 sm:px-8 py-6 font-black text-blue-700 text-xl sm:text-2xl italic">{(idx+1).toString().padStart(2, '0')}</td>
                                    <td className="px-5 sm:px-8 py-6 font-bold text-slate-800">{entry.displayName}</td>
                                    <td className="px-5 sm:px-8 py-6 text-[10px] font-bold uppercase text-blue-600">{entry.entries} Plays</td>
                                    <td className="px-5 sm:px-8 py-6 text-right font-black text-slate-800 text-lg sm:text-xl">{entry.totalPoints.toLocaleString()}</td>
                                </tr>
                              ))}
                              {currentLeaderboard.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-8 py-16 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No entries found for this event.</td>
                                </tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>
              )}

              {/* ADMIN LOCATIONS */}
              {view === 'admin' && adminSection === 'locations' && (
              <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center">
                      <div>
                          <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Location Directory</h2>
                          <p className="text-slate-500 font-medium">Manage the global database of PetSmart store locations</p>
                      </div>
                      <button onClick={() => { setWizardOpen(true); setCurrentStep(2); }} className="bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-blue-800 transition-colors">+ Add New Store</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {locations.map(loc => (
                      <div key={loc._id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start">
                              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><i data-lucide="map-pin"></i></div>
                              <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-1 rounded-full uppercase">Active</span>
                          </div>
                          <div>
                              <h4 className="font-black text-slate-800 uppercase">{loc.name} {loc.code ? \`#\${loc.code}\`: ""}</h4>
                              <p className="text-xs text-slate-400 mt-1">{loc.venue || "No venue listed"}</p>
                          </div>
                          <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                              <span className="text-[10px] font-bold text-slate-400">Linked to 1 Event</span>
                              <button className="text-blue-600 font-bold text-xs uppercase tracking-wider hover:underline">Edit Details</button>
                          </div>
                      </div>
                      ))}
                      {locations.length === 0 && (
                          <div className="col-span-full py-12 text-center text-slate-400 font-bold tracking-widest text-xs uppercase">No Locations Found</div>
                      )}
                  </div>
              </div>
              )}

              {/* PLAYER VIEW */}
              {view === 'player' && (
              <div className="max-w-md mx-auto pt-6 flex-1 flex flex-col justify-center animate-in fade-in zoom-in-95 duration-300">
                  <div className="bg-white rounded-[3.5rem] border-[12px] border-slate-900 overflow-hidden shadow-2xl h-[700px] flex flex-col relative">
                      <div className="bg-slate-900 h-8 flex justify-center items-center shrink-0"><div className="w-12 h-1 bg-slate-800 rounded-full"></div></div>
                      <div className="flex-1 flex flex-col p-8 text-center space-y-8 overflow-y-auto pb-12">
                          <div className="flex items-baseline ps-logo-text justify-center scale-110 mt-4">
                              <span className="text-[#0064B1]">Pet</span><span className="text-[#E51837]">Smart</span>
                          </div>
                          
                          <div className="bg-[#E51837] text-white p-8 rounded-[3rem] shadow-xl relative overflow-hidden shrink-0 mt-8">
                              <div className="absolute -right-4 -bottom-4 opacity-10 rotate-12 text-white"><i data-lucide="dog" className="w-32 h-32 text-white fill-current"></i></div>
                              <h2 className="text-3xl font-black uppercase italic leading-none mb-1 relative z-10">Quest Rank</h2>
                              <div className="text-7xl font-black tracking-tighter italic relative z-10 drop-shadow-md">
                                  #{currentLeaderboard.length ? "01" : "--"}
                              </div>
                              <p className="text-[10px] font-bold uppercase tracking-widest mt-3 opacity-90 relative z-10 bg-black/20 py-1.5 rounded-full inline-block px-4">
                                  {events[0]?.name || "Select an Event"}
                              </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4 shrink-0 mt-4">
                              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-sm">
                                  <p className="text-[10px] font-black text-slate-400 uppercase">Points Roll-up</p>
                                  <p className="text-2xl font-black text-slate-800 mt-1">{currentLeaderboard[0]?.totalPoints.toLocaleString() || "0"}</p>
                              </div>
                              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 shadow-sm">
                                  <p className="text-[10px] font-black text-blue-600 uppercase">Treats Earned</p>
                                  <p className="text-2xl font-black text-blue-700 mt-1">+{Math.floor((currentLeaderboard[0]?.totalPoints || 0) / 50).toLocaleString()}</p>
                              </div>
                          </div>
                          
                          <button className="bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 shrink-0 mt-4 hover:scale-[1.03] transition-transform">
                              <i data-lucide="qr-code" className="w-5 h-5"></i> View Game Pass
                          </button>
                      </div>
                  </div>
              </div>
              )}
          </main>
      </div>

      {/* WIZARD MODAL */}
      {wizardOpen && (
      <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300 max-h-[90vh]">
              
              {/* Header */}
              <div className="ps-gradient p-6 sm:p-8 text-white shrink-0">
                  <div className="flex justify-between items-center mb-6">
                      <div>
                          <h2 className="text-xl sm:text-2xl font-black italic tracking-tighter uppercase leading-none">Event Setup Wizard</h2>
                          <p className="text-blue-100 text-[10px] font-bold uppercase tracking-widest mt-2">Configure Multi-Location Instances</p>
                      </div>
                      <button onClick={() => setWizardOpen(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"><i data-lucide="x"></i></button>
                  </div>

                  <div className="flex items-center gap-4 max-w-2xl mx-auto">
                      <div className={"step-indicator w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm " + (currentStep === 1 ? 'step-active' : (currentStep > 1 ? 'step-complete' : 'border-white/20 text-white/50 bg-white/5'))}>1</div>
                      <div className="flex-1 h-0.5 bg-white/20"></div>
                      <div className={"step-indicator w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm " + (currentStep === 2 ? 'step-active' : (currentStep > 2 ? 'step-complete' : 'border-white/20 text-white/50 bg-white/5'))}>2</div>
                      <div className="flex-1 h-0.5 bg-white/20"></div>
                      <div className={"step-indicator w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm " + (currentStep === 3 ? 'step-active' : (currentStep > 3 ? 'step-complete' : 'border-white/20 text-white/50 bg-white/5'))}>3</div>
                      <div className="flex-1 h-0.5 bg-white/20"></div>
                      <div className={"step-indicator w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm " + (currentStep === 4 ? 'step-active' : (currentStep > 4 ? 'step-complete' : 'border-white/20 text-white/50 bg-white/5'))}>4</div>
                  </div>
              </div>

              {/* Wizard Content */}
              <div className="modal-body flex-1 p-6 sm:p-12 bg-slate-50/30 overflow-y-auto">
                  
                  {/* Step 1 */}
                  {currentStep === 1 && (
                  <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                      <h3 className="text-xl font-black text-slate-800 uppercase italic">Step 1: Event Identity</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                          <div className="space-y-4">
                              <label className="block">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Event Title</span>
                                  <input type="text" value={eventForm.name} onChange={e => setEventForm(prev => ({...prev, name: e.target.value}))} placeholder="Spring Fetch Fest 2026" className="w-full border-2 border-slate-100 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none font-bold placeholder:font-normal" />
                              </label>
                              <div className="grid grid-cols-2 gap-4">
                                  <input type="date" value={eventForm.eventDate} onChange={e => setEventForm(prev => ({...prev, eventDate: e.target.value}))} className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 outline-none text-sm" />
                                  <input type="text" value={eventForm.sponsor} onChange={e => setEventForm(prev => ({...prev, sponsor: e.target.value}))} placeholder="Optional Sponsor" className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 outline-none text-sm" />
                              </div>
                          </div>
                          <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Description</span>
                                <textarea rows={5} value={eventForm.description} onChange={e => setEventForm(prev => ({...prev, description: e.target.value}))} placeholder="Description & Instructions..." className="w-full border-2 border-slate-100 rounded-2xl px-6 py-4 outline-none resize-none text-sm"></textarea>
                          </div>
                      </div>
                  </div>
                  )}

                  {/* Step 2 */}
                  {currentStep === 2 && (
                  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                          <h3 className="text-xl font-black text-slate-800 uppercase italic">Step 2: Select Locations</h3>
                          <button onClick={() => setNewLocationFormOpen(!newLocationFormOpen)} className="text-blue-700 font-bold text-sm flex items-center gap-1 shadow-sm px-4 py-2 bg-white rounded-xl border border-blue-100 hover:bg-slate-50 transition-colors">
                               <i data-lucide="plus-circle" className="w-4 h-4"></i> Create New Location
                          </button>
                      </div>

                      {newLocationFormOpen && (
                      <div className="bg-blue-50 border-2 border-blue-200 rounded-[2rem] p-8 animate-in slide-in-from-top duration-300 space-y-4 mb-6 relative">
                          <button onClick={() => setNewLocationFormOpen(false)} className="absolute top-4 right-4 text-blue-300 hover:text-blue-500"><i data-lucide="x"></i></button>
                          <div className="grid grid-cols-2 gap-4">
                              <input type="text" value={locationForm.name} onChange={e => setLocationForm(prev => ({...prev, name: e.target.value}))} placeholder="Store Name / ID" className="w-full border border-blue-100 rounded-xl px-4 py-3 text-sm outline-none shadow-inner" />
                              <input type="text" value={locationForm.code} onChange={e => setLocationForm(prev => ({...prev, code: e.target.value}))} placeholder="Store Code (e.g. 1042)" className="w-full border border-blue-100 rounded-xl px-4 py-3 text-sm outline-none shadow-inner" />
                              <input type="text" value={locationForm.venue} onChange={e => setLocationForm(prev => ({...prev, venue: e.target.value}))} placeholder="Full Address" className="w-full border border-blue-100 rounded-xl px-4 py-3 text-sm outline-none shadow-inner col-span-2" />
                          </div>
                      </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {locations.map(loc => (
                              <div key={loc._id} onClick={() => setSelectedLocationId(loc._id)} className={"bg-white border-2 rounded-2xl p-6 flex items-center gap-4 cursor-pointer transition-all " + (selectedLocationId === loc._id ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-100 hover:border-slate-300")}>
                                  <div className={"w-6 h-6 rounded-full border-2 flex items-center justify-center " + (selectedLocationId === loc._id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300")}>
                                     {selectedLocationId === loc._id && <i data-lucide="check" className="w-4 h-4"></i>}
                                  </div>
                                  <div>
                                     <p className="font-bold text-slate-800">{loc.name}</p>
                                     <p className="text-[10px] text-slate-400 uppercase font-bold">{loc.venue || "No Address"}</p>
                                  </div>
                              </div>
                          ))}
                          {locations.length === 0 && !newLocationFormOpen && (
                             <div className="col-span-full py-8 text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-2xl">
                                No locations. Create one above to attach to {eventForm.name || "the event"}.
                             </div>
                          )}
                      </div>
                  </div>
                  )}

                  {/* Step 3 */}
                  {currentStep === 3 && (
                  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                      <h3 className="text-xl font-black text-slate-800 uppercase italic">Step 3: Assign Unique Games</h3>
                      <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 space-y-6 shadow-sm">
                          <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                              <i data-lucide="map-pin" className="text-red-600 w-5 h-5"></i>
                              <span className="font-black text-slate-800 uppercase tracking-tighter">{locations.find(l => l._id === selectedLocationId)?.name || "Selected Store"}</span>
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                              {games.map(gm => {
                                  const isSelected = selectedGameId === gm._id;
                                  return (
                                    <div key={gm._id} onClick={() => setSelectedGameId(gm._id)} className={"border-2 rounded-2xl p-6 text-center relative cursor-pointer transition-all " + (isSelected ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50")}>
                                        {isSelected && <div className="absolute top-2 right-2"><i data-lucide="check-circle" className="w-4 h-4 text-blue-600"></i></div>}
                                        <i data-lucide="award" className={"w-10 h-10 mx-auto mb-2 " + (isSelected ? "text-blue-600" : "text-slate-400")}></i>
                                        <p className="text-[10px] font-black uppercase mt-1 text-slate-800">{gm.name}</p>
                                    </div>
                                  );
                              })}
                              {/* Create new game explicitly block */}
                              {selectedGameId === "__new__" && (
                                <div className="col-span-full bg-slate-50 p-6 rounded-2xl border-2 border-slate-200 border-dashed animate-in fade-in mt-4">
                                     <h4 className="font-bold text-slate-800 uppercase text-xs mb-4">Create New Game Type</h4>
                                     <div className="grid grid-cols-3 gap-4">
                                         <input type="text" value={gameForm.name} onChange={e => setGameForm(prev => ({...prev, name: e.target.value}))} placeholder="Game Name (e.g. Agility Pro)" className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none" />
                                         <input type="text" value={gameForm.key} onChange={e => setGameForm(prev => ({...prev, key: e.target.value}))} placeholder="Short Key (e.g. agility_pro)" className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none" />
                                         <input type="text" value={gameForm.scoreUnit} onChange={e => setGameForm(prev => ({...prev, scoreUnit: e.target.value}))} placeholder="Points Unit (e.g. points)" className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none" />
                                     </div>
                                </div>
                              )}
                              {selectedGameId !== "__new__" && (
                                <button onClick={() => setSelectedGameId("__new__")} className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:bg-slate-50 hover:border-slate-400 transition-colors">
                                    <i data-lucide="plus" className="w-10 h-10 text-slate-300 mx-auto mb-2"></i>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Create New Game</p>
                                </button>
                              )}
                          </div>
                      </div>
                  </div>
                  )}

                  {/* Step 4 */}
                  {currentStep === 4 && (
                  <div className="space-y-6 text-center py-10 animate-in zoom-in-95 duration-500">
                      <div className="bg-green-100 text-green-600 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-200">
                          <i data-lucide="check" className="w-12 h-12"></i>
                      </div>
                      <h3 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Configuration Ready</h3>
                      <p className="text-slate-500 max-w-sm mx-auto font-medium">Your event, location, and game configurations have been mapped securely into the system.</p>
                      <button onClick={() => {setWizardOpen(false); loadWorkspace(token);}} className="text-blue-600 font-bold text-sm underline hover:text-blue-800">Go to Dashboard</button>
                  </div>
                  )}
              </div>

              {/* Footer */}
              <div className="bg-white p-6 sm:p-8 border-t border-slate-100 flex justify-between items-center shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] relative z-10">
                  <button onClick={() => setWizardOpen(false)} className="text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:text-slate-600 transition-colors">Cancel Setup</button>
                  <div className="flex gap-4">
                      {currentStep > 1 && currentStep < 4 && (
                        <button onClick={() => moveStep(-1)} disabled={loading} className="border-2 border-slate-200 text-slate-500 font-bold px-6 sm:px-8 py-3 sm:py-4 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all text-xs uppercase tracking-widest">Back</button>
                      )}
                      
                      {currentStep < 4 ? (
                          <button onClick={() => { setLoading(true); moveStep(1).finally(() => setLoading(false)); }} disabled={loading} className="btn-primary text-white font-black px-8 sm:px-10 py-3 sm:py-4 rounded-xl shadow-lg uppercase tracking-widest hover:scale-[1.02] transition-transform text-xs flex items-center gap-2">
                              {loading ? "Processing..." : (currentStep === 1 ? "Next: Locations" : currentStep === 2 ? "Next: Map Games" : "Save & Finalize")}
                              {!loading && <i data-lucide="arrow-right" className="w-4 h-4"></i>}
                          </button>
                      ) : (
                          <button onClick={() => {setWizardOpen(false); loadWorkspace(token);}} className="btn-primary text-white font-black px-8 sm:px-10 py-3 sm:py-4 rounded-xl shadow-lg uppercase tracking-widest hover:scale-[1.02] transition-transform text-xs">
                              Return to Admin
                          </button>
                      )}
                  </div>
              </div>
          </div>
      </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync('web/src/App.tsx', appTsx);
console.log('App.tsx rewritten');
