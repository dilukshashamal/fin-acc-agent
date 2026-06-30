import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Users, 
  ClipboardList, 
  Settings, 
  Sparkles, 
  Activity, 
  HelpCircle, 
  UserCheck,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import ChatWindow from './components/chat-window';
import DocumentUploader from './components/document-uploader';

interface Client {
  id: string;
  name: string;
  industry: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  engagement_name: string;
}

interface Tenant {
  id: string;
  name: string;
  jurisdiction_default: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('Initializing environment...');
  
  // Status check for services
  const [saasConnected, setSaasConnected] = useState(false);
  const [aiActive, setAiActive] = useState(false);

  // Auto setup developer profile on first load
  useEffect(() => {
    async function initDevSetup() {
      try {
        setStatusMsg('Seeding workspace data & fetching authentication...');
        const res = await fetch('/api/v1/workspace/auth/dev-setup/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'developer',
            organization: 'Acme Audit Partners'
          })
        });
        
        if (!res.ok) throw new Error('Failed to run dev-setup');
        
        const data = await res.json();
        const accessToken = data.tokens.access;
        localStorage.setItem('token', accessToken);
        setToken(accessToken);
        setTenant(data.tenant);
        setSaasConnected(true);
        setStatusMsg('SaaS workspace active.');
        
        // Fetch clients and tasks using JWT
        await fetchSaaSData(accessToken);
      } catch (err) {
        console.error(err);
        setSaasConnected(false);
        setStatusMsg('Workspace connection offline. Proceeding in sandbox mode.');
      } finally {
        setLoading(false);
      }
    }

    initDevSetup();
    checkAiHealth();
  }, []);

  async function checkAiHealth() {
    try {
      const res = await fetch('/api/v1/agent/health');
      if (res.ok) {
        setAiActive(true);
      }
    } catch (e) {
      setAiActive(false);
    }
  }

  async function fetchSaaSData(jwtToken: string) {
    try {
      // Fetch Clients
      const clientsRes = await fetch('/api/v1/workspace/clients/', {
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      if (clientsRes.ok) {
        const clientsData = await clientsRes.json();
        setClients(clientsData);
      }

      // Fetch Tasks
      const tasksRes = await fetch('/api/v1/workspace/tasks/', {
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setTasks(tasksData);
      }
    } catch (err) {
      console.error("Failed to load SaaS entities", err);
    }
  }

  const handleRefresh = async () => {
    if (token) {
      setLoading(true);
      await fetchSaaSData(token);
      await checkAiHealth();
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden text-slate-100 font-sans">
      
      {/* 1. Left Sidebar */}
      <aside className="w-80 border-r border-border bg-card/60 backdrop-blur-md flex flex-col z-10">
        {/* Workspace Brand / Header */}
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-lg bg-gradient-to-r from-indigo-200 to-fuchsia-200 bg-clip-text text-transparent">Fin Agent</h1>
            <p className="text-xs text-slate-400">AI Finance Orchestrator</p>
          </div>
        </div>

        {/* Sidebar Navigation & SaaS Data */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          <DocumentUploader token={token} onUploadSuccess={handleRefresh} />
          
          {/* Active Client list */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">
              <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Client Portfolios</span>
              <span className="bg-indigo-950/60 text-indigo-400 px-2 py-0.5 rounded-full text-[10px]">{clients.length}</span>
            </div>
            <div className="space-y-1">
              {clients.map((client) => (
                <div 
                  key={client.id}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-900/30 hover:bg-slate-800/40 border border-transparent hover:border-border transition-all duration-200 text-sm group"
                >
                  <span className="font-medium text-slate-300 group-hover:text-slate-100 truncate">{client.name}</span>
                  <span className="text-[10px] text-indigo-400/80 bg-indigo-950/20 px-2 py-0.5 rounded-md border border-indigo-950/60 truncate max-w-[80px]">
                    {client.industry}
                  </span>
                </div>
              ))}
              {clients.length === 0 && (
                <p className="text-xs text-slate-500 italic px-2 py-1">No active clients seeded.</p>
              )}
            </div>
          </div>

          {/* Active Tasks Queue */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">
              <span className="flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Operations Tasks</span>
              <span className="bg-fuchsia-950/60 text-fuchsia-400 px-2 py-0.5 rounded-full text-[10px]">{tasks.length}</span>
            </div>
            <div className="space-y-1.5">
              {tasks.map((task) => (
                <div 
                  key={task.id} 
                  className="p-2.5 rounded-lg bg-slate-900/30 border border-slate-800/50 hover:border-border hover:bg-slate-800/40 transition-all duration-200 flex flex-col gap-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-slate-300 line-clamp-1">{task.title}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md uppercase font-semibold shrink-0 ${
                      task.status === 'done' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50' :
                      task.status === 'in_progress' ? 'bg-amber-950/40 text-amber-400 border border-amber-900/50' :
                      'bg-slate-950/40 text-slate-400 border border-slate-900/50'
                    }`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <FolderOpen className="h-2.5 w-2.5 shrink-0" /> {task.engagement_name}
                  </span>
                </div>
              ))}
              {tasks.length === 0 && (
                <p className="text-xs text-slate-500 italic px-2 py-1">No active tasks.</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Footer with Health Indicators */}
        <div className="p-4 border-t border-border bg-slate-950/40 space-y-3">
          
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-indigo-400" />
              <span>Active Agentic SaaS:</span>
            </span>
            <span className="font-semibold text-slate-300 text-[10px] truncate max-w-[120px]">
              {tenant ? tenant.name : "Local Sandbox"}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${saasConnected ? 'bg-emerald-500 shadow-md shadow-emerald-500/20' : 'bg-rose-500'}`} />
                <span>Django SaaS API</span>
              </span>
              <span className="text-[10px] font-semibold text-slate-500">
                {saasConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${aiActive ? 'bg-emerald-500 shadow-md shadow-emerald-500/20' : 'bg-rose-500'}`} />
                <span>FastAPI AI Engine</span>
              </span>
              <span className="text-[10px] font-semibold text-slate-500">
                {aiActive ? 'Connected' : 'Offline'}
              </span>
            </div>
          </div>

          <button 
            onClick={handleRefresh}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-border hover:bg-slate-800/80 text-xs font-medium text-slate-300 transition-all active:scale-[0.98]"
          >
            <RefreshCw className="h-3 w-3" /> Sync Workspace Data
          </button>
        </div>
      </aside>

      {/* 2. Main Chat / Research Space */}
      <main className="flex-1 flex flex-col relative bg-gradient-to-b from-[#090a0f] via-[#0e101a] to-[#090a0f]">
        
        {/* Top Header */}
        <header className="h-16 border-b border-border px-8 flex items-center justify-between bg-card/10 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Answer Engine Workspace</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-full text-slate-400 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
              <span>RLS Tenant Isolation Active</span>
            </div>
          </div>
        </header>

        {/* Core Chat Workspace */}
        <div className="flex-1 flex overflow-hidden">
          <ChatWindow tenantId={tenant?.id || 'default-tenant'} />
        </div>
      </main>

    </div>
  );
}
