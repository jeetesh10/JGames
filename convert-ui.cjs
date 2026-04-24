const fs = require('fs');

const appTsx = `import React, { useState, useEffect } from 'react';
import { Route, Routes, Link, useNavigate } from 'react-router-dom';

export function App() {
  const [view, setView] = useState('admin');
  const [adminSection, setAdminSection] = useState('dashboard');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [newLocationFormOpen, setNewLocationFormOpen] = useState(false);

  useEffect(() => {
    if ((window as any).lucide) {
      (window as any).lucide.createIcons();
    }
  }, [view, adminSection, wizardOpen, currentStep, newLocationFormOpen]);

  const moveStep = (dir: number) => {
    const next = currentStep + dir;
    if (next > 4) {
      setWizardOpen(false);
    } else if (next > 0) {
      setCurrentStep(next);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 z-50 shadow-sm shrink-0">
          <div className="flex items-center gap-4">
              <div className="flex items-baseline ps-logo-text">
                  <span className="text-[#0064B1] text-2xl">Pet</span><span className="text-[#E51837] text-2xl">Smart</span>
              </div>
              <div className="w-px h-6 bg-gray-200 mx-2"></div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-800 uppercase italic whitespace-nowrap">Wag More Bark Less</h1>
          </div>
          
          <div className="flex items-center gap-4">
              <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button onClick={() => setView('admin')} className={"px-4 py-1.5 rounded-md text-sm font-medium transition-all " + (view === 'admin' ? "bg-white shadow-sm text-blue-700" : "text-gray-500")}>Admin</button>
                  <button onClick={() => setView('player')} className={"px-4 py-1.5 rounded-md text-sm font-medium transition-all " + (view === 'player' ? "bg-white shadow-sm text-blue-700" : "text-gray-500")}>Player</button>
              </div>
              <div className="flex items-center gap-2 ml-4">
                  <img src="https://placehold.co/32x32/0064B1/FFF?text=A" alt="Avatar" className="w-8 h-8 rounded-full border border-gray-200" />
                  <span className="text-sm font-semibold text-gray-700 hidden sm:block">Admin Portal</span>
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
                  <button onClick={() => { setWizardOpen(true); setCurrentStep(1); }} className="bg-white/10 hover:bg-white/20 w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold border-l-4 border-l-red-500 shadow-lg mb-4 mt-2">
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
              <div className="space-y-8 max-w-7xl mx-auto">
                  <div>
                      <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Global Analytics Roll-up</h2>
                      <p className="text-slate-500 font-medium">Points aggregated across all active game instances and PetSmart locations</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-blue-600">
                          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Network Points</h3>
                          <p className="text-4xl font-black text-slate-800 mt-1">24.8M</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-red-600">
                          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Players</h3>
                          <p className="text-4xl font-black text-slate-800 mt-1">128.5K</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-blue-400">
                          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Locations</h3>
                          <p className="text-4xl font-black text-slate-800 mt-1">142</p>
                      </div>
                      <div className="bg-[#0064B1] p-6 rounded-2xl shadow-lg text-white">
                          <h3 className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Treats Rewards Issued</h3>
                          <p className="text-4xl font-black mt-1">496K</p>
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
                                      <th className="px-6 py-4">Avg Game Pts</th>
                                      <th className="px-6 py-4 text-right">Total Points</th>
                                  </tr>
                                  <tr className="border-b border-slate-50 hover:bg-slate-50">
                                      <td className="px-6 py-4 font-bold text-slate-800">Phoenix Central #1024</td>
                                      <td className="px-6 py-4 text-slate-500">4,250</td>
                                      <td className="px-6 py-4 font-black text-blue-700 text-right">5,270,000</td>
                                  </tr>
                                  <tr className="border-b border-slate-50 hover:bg-slate-50">
                                      <td className="px-6 py-4 font-bold text-slate-800">Scottsdale North #088</td>
                                      <td className="px-6 py-4 text-slate-500">3,900</td>
                                      <td className="px-6 py-4 font-black text-blue-700 text-right">3,276,000</td>
                                  </tr>
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
                                      <th className="px-6 py-4">Active Instances</th>
                                      <th className="px-6 py-4 text-right">Total Points</th>
                                  </tr>
                                  <tr className="border-b border-slate-50 hover:bg-slate-50">
                                      <td className="px-6 py-4 font-bold text-slate-800">Agility Master Pro</td>
                                      <td className="px-6 py-4 text-slate-500">142</td>
                                      <td className="px-6 py-4 font-black text-red-600 text-right">12,100,000</td>
                                  </tr>
                                  <tr className="border-b border-slate-50 hover:bg-slate-50">
                                      <td className="px-6 py-4 font-bold text-slate-800">Fetch King Elite</td>
                                      <td className="px-6 py-4 text-slate-500">84</td>
                                      <td className="px-6 py-4 font-black text-red-600 text-right">8,400,000</td>
                                  </tr>
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
              )}

              {/* ADMIN SCORING */}
              {view === 'admin' && adminSection === 'scoring' && (
              <div className="space-y-8 max-w-7xl mx-auto">
                  <div>
                      <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Point System Configuration</h2>
                      <p className="text-slate-500 font-medium">Define custom scoring rules and Treats multipliers for each game template</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-slate-100 space-y-6">
                          <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                  <div className="p-3 bg-red-50 text-red-600 rounded-xl"><i data-lucide="zap"></i></div>
                                  <h3 className="font-black text-xl uppercase tracking-tighter">Agility Master Pro</h3>
                              </div>
                              <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase">Standard Rule Set</span>
                          </div>
                          <div className="space-y-6">
                              <div className="space-y-2">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Base Points (Completion)</label>
                                  <div className="flex items-center gap-4">
                                      <input type="range" className="flex-1 accent-red-600" min="500" max="5000" step="500" defaultValue="1000" />
                                      <span className="font-black text-slate-800 text-lg">1,000</span>
                                  </div>
                              </div>
                              <div className="space-y-2">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Performance Multipliers</label>
                                  <div className="grid grid-cols-2 gap-4">
                                      <div className="border rounded-xl p-3 flex flex-col bg-slate-50">
                                          <span className="text-[8px] font-bold text-slate-400 uppercase">Speed (x/sec)</span>
                                          <input type="text" defaultValue="1.5" className="bg-transparent font-black text-slate-800 outline-none w-full" />
                                      </div>
                                      <div className="border rounded-xl p-3 flex flex-col bg-slate-50">
                                          <span className="text-[8px] font-bold text-slate-400 uppercase">Difficulty</span>
                                          <input type="text" defaultValue="2.0" className="bg-transparent font-black text-slate-800 outline-none w-full" />
                                      </div>
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
                  </div>
              </div>
              )}

              {/* ADMIN LEADERBOARD */}
              {view === 'admin' && adminSection === 'leaderboard' && (
              <div className="space-y-8 max-w-7xl mx-auto">
                  <div className="flex justify-between items-center">
                      <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Live Player Rankings</h2>
                      <div className="flex gap-2">
                          <select className="border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-bold shadow-sm outline-none">
                              <option>All Locations</option>
                              <option>Phoenix Central #1024</option>
                          </select>
                      </div>
                  </div>
                  <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                      <table className="w-full text-left">
                          <tbody>
                              <tr className="bg-slate-900 text-white text-[10px] uppercase font-bold tracking-widest">
                                  <th className="px-8 py-5">Rank</th>
                                  <th className="px-8 py-5">Pet & Player</th>
                                  <th className="px-8 py-5">Game ID / Instance</th>
                                  <th className="px-8 py-5 text-right">Points</th>
                              </tr>
                              <tr className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                  <td className="px-8 py-6 font-black text-blue-700 text-2xl italic">01</td>
                                  <td className="px-8 py-6 font-bold text-slate-800">Sarah & Buddy</td>
                                  <td className="px-8 py-6 text-[10px] font-bold uppercase text-blue-600">AG-PRO-1024-001</td>
                                  <td className="px-8 py-6 text-right font-black text-slate-800 text-xl">14,250</td>
                              </tr>
                              <tr className="border-b hover:bg-slate-50 transition-colors">
                                  <td className="px-8 py-6 font-black text-slate-300 text-2xl italic">02</td>
                                  <td className="px-8 py-6 font-bold text-slate-800">John & Max</td>
                                  <td className="px-8 py-6 text-[10px] font-bold uppercase text-blue-600">AG-PRO-1024-042</td>
                                  <td className="px-8 py-6 text-right font-black text-slate-800 text-xl">12,100</td>
                              </tr>
                          </tbody>
                      </table>
                  </div>
              </div>
              )}

              {/* ADMIN LOCATIONS */}
              {view === 'admin' && adminSection === 'locations' && (
              <div className="space-y-8 max-w-7xl mx-auto">
                  <div className="flex justify-between items-center">
                      <div>
                          <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Location Directory</h2>
                          <p className="text-slate-500 font-medium">Manage the global database of PetSmart store locations</p>
                      </div>
                      <button className="bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg">+ Add New Store</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                          <div className="flex justify-between items-start">
                              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><i data-lucide="map-pin"></i></div>
                              <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-1 rounded-full uppercase">Active</span>
                          </div>
                          <div>
                              <h4 className="font-black text-slate-800 uppercase">Phoenix Central #1024</h4>
                              <p className="text-xs text-slate-400 mt-1">2475 E Camelback Rd, Phoenix, AZ 85016</p>
                          </div>
                          <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                              <span className="text-[10px] font-bold text-slate-400">3 Active Events</span>
                              <button className="text-blue-600 font-bold text-xs">Edit Details</button>
                          </div>
                      </div>
                  </div>
              </div>
              )}

              {/* PLAYER VIEW */}
              {view === 'player' && (
              <div className="max-w-md mx-auto pt-6 flex-1 flex flex-col justify-center">
                  <div className="bg-white rounded-[3.5rem] border-[12px] border-slate-900 overflow-hidden shadow-2xl h-[700px] flex flex-col">
                      <div className="bg-slate-900 h-8 flex justify-center items-center"><div className="w-12 h-1 bg-slate-800 rounded-full"></div></div>
                      <div className="flex-1 flex flex-col p-8 text-center space-y-8 overflow-y-auto">
                          <div className="flex items-baseline ps-logo-text justify-center scale-110">
                              <span className="text-[#0064B1]">Pet</span><span className="text-[#E51837]">Smart</span>
                          </div>
                          
                          <div className="bg-red-600 text-white p-8 rounded-[3rem] shadow-xl relative overflow-hidden shrink-0">
                              <div className="absolute -right-4 -bottom-4 opacity-10 rotate-12"><i data-lucide="dog" className="w-32 h-32"></i></div>
                              <h2 className="text-3xl font-black uppercase italic leading-none mb-1 relative z-10">Quest Rank</h2>
                              <div className="text-7xl font-black tracking-tighter italic relative z-10">#01</div>
                              <p className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-70 relative z-10">Phoenix Central Circuit</p>
                          </div>

                          <div className="grid grid-cols-2 gap-4 shrink-0">
                              <div className="bg-slate-50 p-4 rounded-2xl border">
                                  <p className="text-[10px] font-black text-slate-400 uppercase">Points Roll-up</p>
                                  <p className="text-xl font-black text-slate-800">14,250</p>
                              </div>
                              <div className="bg-slate-50 p-4 rounded-2xl border border-blue-100">
                                  <p className="text-[10px] font-black text-blue-400 uppercase">Treats Earned</p>
                                  <p className="text-xl font-black text-blue-700">+285</p>
                              </div>
                          </div>
                          
                          <button className="bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 shrink-0">
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
              <div className="ps-gradient p-8 text-white shrink-0">
                  <div className="flex justify-between items-center mb-8">
                      <div>
                          <h2 className="text-2xl font-black italic tracking-tighter uppercase leading-none">Event Setup Wizard</h2>
                          <p className="text-blue-100 text-[10px] font-bold uppercase tracking-widest mt-1">Configure Multi-Location Instances</p>
                      </div>
                      <button onClick={() => setWizardOpen(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"><i data-lucide="x"></i></button>
                  </div>

                  <div className="flex items-center gap-4 max-w-2xl mx-auto">
                      <div className={"step-indicator w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold " + (currentStep === 1 ? 'step-active' : (currentStep > 1 ? 'step-complete' : 'border-white/20 text-white/50 bg-white/5'))}>1</div>
                      <div className="flex-1 h-0.5 bg-white/20"></div>
                      <div className={"step-indicator w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold " + (currentStep === 2 ? 'step-active' : (currentStep > 2 ? 'step-complete' : 'border-white/20 text-white/50 bg-white/5'))}>2</div>
                      <div className="flex-1 h-0.5 bg-white/20"></div>
                      <div className={"step-indicator w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold " + (currentStep === 3 ? 'step-active' : (currentStep > 3 ? 'step-complete' : 'border-white/20 text-white/50 bg-white/5'))}>3</div>
                      <div className="flex-1 h-0.5 bg-white/20"></div>
                      <div className={"step-indicator w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold " + (currentStep === 4 ? 'step-active' : (currentStep > 4 ? 'step-complete' : 'border-white/20 text-white/50 bg-white/5'))}>4</div>
                  </div>
              </div>

              {/* Wizard Content */}
              <div className="modal-body flex-1 p-6 sm:p-12 bg-slate-50/30 overflow-y-auto">
                  
                  {/* Step 1 */}
                  {currentStep === 1 && (
                  <div className="space-y-8">
                      <h3 className="text-xl font-black text-slate-800 uppercase italic">Step 1: Event Identity</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                          <div className="space-y-4">
                              <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Event Title</label>
                                  <input type="text" placeholder="Spring Fetch Fest 2026" className="w-full border-2 border-slate-100 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none font-bold placeholder:font-normal" />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <input type="date" className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 outline-none text-sm" />
                                  <input type="date" className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 outline-none text-sm" />
                              </div>
                          </div>
                          <textarea rows={5} placeholder="Description & Instructions..." className="w-full border-2 border-slate-100 rounded-2xl px-6 py-4 outline-none resize-none text-sm"></textarea>
                      </div>
                  </div>
                  )}

                  {/* Step 2 */}
                  {currentStep === 2 && (
                  <div className="space-y-6">
                      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                          <h3 className="text-xl font-black text-slate-800 uppercase italic">Step 2: Select Locations</h3>
                          <button onClick={() => setNewLocationFormOpen(!newLocationFormOpen)} className="text-blue-700 font-bold text-sm flex items-center gap-1 shadow-sm px-4 py-2 bg-white rounded-xl border border-blue-100 hover:bg-slate-50">
                               <i data-lucide="plus-circle" className="w-4 h-4"></i> Create New Location
                          </button>
                      </div>

                      {newLocationFormOpen && (
                      <div className="bg-blue-50 border-2 border-blue-200 rounded-[2rem] p-8 animate-in slide-in-from-top duration-300 space-y-4 mb-6">
                          <div className="grid grid-cols-2 gap-4">
                              <input type="text" placeholder="Store Name / ID" className="w-full border border-blue-100 rounded-xl px-4 py-3 text-sm outline-none" />
                              <input type="text" placeholder="Full Address" className="w-full border border-blue-100 rounded-xl px-4 py-3 text-sm outline-none" />
                          </div>
                          <div className="flex justify-end gap-3 mt-4">
                              <button onClick={() => setNewLocationFormOpen(false)} className="text-slate-400 font-bold text-xs hover:text-slate-600">CANCEL</button>
                              <button onClick={() => setNewLocationFormOpen(false)} className="bg-blue-600 text-white font-bold text-xs px-6 py-2 rounded-full shadow-lg hover:bg-blue-700">SAVE TO LIST</button>
                          </div>
                      </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="bg-white border-2 border-blue-500 rounded-2xl p-6 flex items-center gap-4 ring-2 ring-blue-100 cursor-pointer">
                              <input type="checkbox" defaultChecked className="w-6 h-6 accent-blue-600" />
                              <div><p className="font-bold text-slate-800">Phoenix Central #1024</p><p className="text-[10px] text-slate-400 uppercase font-bold">AZ - Main Circuit</p></div>
                          </div>
                          <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 flex items-center gap-4 cursor-pointer hover:border-slate-300">
                              <input type="checkbox" className="w-6 h-6 accent-blue-600" />
                              <div><p className="font-bold text-slate-800">Scottsdale North #088</p><p className="text-[10px] text-slate-400 uppercase font-bold">AZ - Regional</p></div>
                          </div>
                      </div>
                  </div>
                  )}

                  {/* Step 3 */}
                  {currentStep === 3 && (
                  <div className="space-y-6">
                      <h3 className="text-xl font-black text-slate-800 uppercase italic">Step 3: Assign Unique Games</h3>
                      <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 space-y-6 shadow-sm">
                          <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                              <i data-lucide="map-pin" className="text-red-600 w-5 h-5"></i>
                              <span className="font-black text-slate-800 uppercase tracking-tighter">Phoenix Central #1024</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                              <div className="border-2 border-blue-600 bg-blue-50 p-6 rounded-2xl text-center relative pointer-events-none">
                                  <div className="absolute top-2 right-2"><i data-lucide="check-circle" className="w-4 h-4 text-blue-600"></i></div>
                                  <i data-lucide="award" className="w-10 h-10 text-blue-600 mx-auto mb-2"></i>
                                  <p className="text-[10px] font-black uppercase mt-1">Agility Pro</p>
                              </div>
                              <button className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:bg-slate-50 hover:border-slate-400 transition-colors">
                                  <i data-lucide="plus" className="w-10 h-10 text-slate-300 mx-auto mb-2"></i>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Assign More Games</p>
                              </button>
                          </div>
                      </div>
                  </div>
                  )}

                  {/* Step 4 */}
                  {currentStep === 4 && (
                  <div className="space-y-6 text-center py-10">
                      <div className="bg-green-100 text-green-600 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-200">
                          <i data-lucide="check" className="w-12 h-12"></i>
                      </div>
                      <h3 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Configuration Ready</h3>
                      <p className="text-slate-500 max-w-sm mx-auto font-medium">Validating <span className="text-blue-700 font-bold">1 store</span> and <span className="text-red-600 font-bold">1 game instance</span>.</p>
                  </div>
                  )}
              </div>

              {/* Footer */}
              <div className="bg-white p-6 sm:p-10 border-t border-slate-100 flex justify-between items-center shrink-0">
                  <button onClick={() => setWizardOpen(false)} className="text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:text-slate-600">Cancel</button>
                  <div className="flex gap-4">
                      {currentStep > 1 && (
                        <button onClick={() => moveStep(-1)} className="border-2 border-slate-100 text-slate-500 font-bold px-6 sm:px-10 py-3 sm:py-4 rounded-2xl hover:bg-slate-50">Back</button>
                      )}
                      <button onClick={() => moveStep(1)} className="btn-primary text-white font-black px-8 sm:px-12 py-3 sm:py-4 rounded-2xl shadow-xl uppercase tracking-widest hover:scale-[1.02] transition-transform">
                          {currentStep === 1 ? "Next: Locations" : currentStep === 2 ? "Next: Map Games" : currentStep === 3 ? "Next: Final Review" : "Create & Launch Next"}
                      </button>
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
