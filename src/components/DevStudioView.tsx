import React, { useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  Bot,
  Eye,
  Plus,
  RotateCcw,
  Rocket,
  Save,
  Trash2,
} from 'lucide-react';
import type { AppRemoteConfig, SystemPlugin } from '../shared/types';

interface DevStudioViewProps {
  adminToken: string;
  onAuthExpired: () => void;
  onLiveUpdated: () => Promise<void>;
}

interface SnapshotSummary {
  id: string;
  label: string;
  createdAt: string;
  pluginCount: number;
}

interface ArchitectMessage {
  role: 'user' | 'assistant';
  text: string;
  tools?: Array<{ name: string; args: Record<string, unknown> }>;
}

export const DevStudioView: React.FC<DevStudioViewProps> = ({
  adminToken,
  onAuthExpired,
  onLiveUpdated,
}) => {
  const [plugins, setPlugins] = useState<SystemPlugin[]>([]);
  const [selectedPluginId, setSelectedPluginId] = useState<string>('__remote_config__');
  const [editorValue, setEditorValue] = useState<string>('');
  const [remoteConfig, setRemoteConfig] = useState<AppRemoteConfig | null>(null);
  const [sandboxConfig, setSandboxConfig] = useState<AppRemoteConfig | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // New Plugin Form
  const [newPluginKey, setNewPluginKey] = useState('');
  const [newPluginName, setNewPluginName] = useState('');

  // AI Software Engineer Chat
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [messages, setMessages] = useState<ArchitectMessage[]>([
    {
      role: 'assistant',
      text: 'I am your embedded AI Software Engineer (gemini-4-hydrogen) with live tool-calling over ZoRûn’s codebase, system_plugins, and app_remote_config. Ask me to update rates, toggle Sunday Emergency Mode, or author a new plugin.',
    },
  ]);

  const loadWorkspace = useCallback(async () => {
    try {
      const res = await fetch('/api/dev-studio/workspace', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (!res.ok) {
        setStatusMsg('Could not load Dev Studio workspace.');
        return;
      }
      const data = await res.json();
      setPlugins(data.plugins || []);
      setRemoteConfig(data.remoteConfig);
      setSandboxConfig(data.sandboxConfig);
      setSnapshots(data.snapshots || []);

      if (selectedPluginId === '__remote_config__' && data.remoteConfig) {
        setEditorValue(JSON.stringify(data.sandboxConfig || data.remoteConfig, null, 2));
      }
    } catch {
      setStatusMsg('Network error loading Dev Studio workspace.');
    }
  }, [adminToken, onAuthExpired, selectedPluginId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSelectTarget = (id: string) => {
    setSelectedPluginId(id);
    if (id === '__remote_config__') {
      setEditorValue(JSON.stringify(sandboxConfig || remoteConfig || {}, null, 2));
    } else {
      const found = plugins.find((p) => p.id === id);
      if (found) setEditorValue(found.code);
    }
  };

  const handleSaveEditorToSandbox = async () => {
    if (selectedPluginId === '__remote_config__') {
      try {
        const parsed = JSON.parse(editorValue) as Partial<AppRemoteConfig>;
        const res = await fetch('/api/dev-studio/sandbox', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify(parsed),
        });
        if (res.status === 401) {
          onAuthExpired();
          return;
        }
        if (res.ok) {
          setStatusMsg('Staged app_remote_config into Sandbox Preview.');
          await loadWorkspace();
        } else {
          setStatusMsg('Failed to stage sandbox config.');
        }
      } catch {
        setStatusMsg('Invalid JSON syntax in app_remote_config editor.');
      }
      return;
    }

    const found = plugins.find((p) => p.id === selectedPluginId);
    if (!found) return;
    try {
      const res = await fetch('/api/dev-studio/plugins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ id: found.id, code: editorValue }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (res.ok) {
        setStatusMsg(`Saved plugin code for ${found.key}.`);
        await loadWorkspace();
        await onLiveUpdated();
      } else {
        setStatusMsg('Failed to save plugin code.');
      }
    } catch {
      setStatusMsg('Network error saving plugin.');
    }
  };

  const handleTogglePlugin = async (plugin: SystemPlugin) => {
    try {
      const res = await fetch('/api/dev-studio/plugins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ id: plugin.id, enabled: !plugin.enabled }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (res.ok) {
        setStatusMsg(`Plugin ${plugin.key} ${!plugin.enabled ? 'enabled' : 'disabled'}.`);
        await loadWorkspace();
        await onLiveUpdated();
      }
    } catch {
      setStatusMsg('Network error toggling plugin.');
    }
  };

  const handleCreatePlugin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPluginKey.trim() || !newPluginName.trim()) return;
    try {
      const res = await fetch('/api/dev-studio/plugins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          key: newPluginKey.trim(),
          name: newPluginName.trim(),
          module: 'remote-config-sdui',
          code: `// Custom plugin: ${newPluginName.trim()}\nexport function execute(ctx) {\n  return { ok: true, region: ctx.region };\n}`,
        }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setNewPluginKey('');
        setNewPluginName('');
        await loadWorkspace();
        setSelectedPluginId(data.plugin.id);
        setEditorValue(data.plugin.code);
        setStatusMsg(`Created new plugin ${data.plugin.key}.`);
      } else {
        setStatusMsg('Could not create plugin.');
      }
    } catch {
      setStatusMsg('Network error creating plugin.');
    }
  };

  const handleDeletePlugin = async (id: string) => {
    try {
      const res = await fetch(`/api/dev-studio/plugins/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (selectedPluginId === id) {
        handleSelectTarget('__remote_config__');
      }
      await loadWorkspace();
    } catch {
      setStatusMsg('Network error deleting plugin.');
    }
  };

  const handlePublishLive = async () => {
    try {
      const res = await fetch('/api/dev-studio/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ label: `Live Publish ${new Date().toLocaleTimeString()}` }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (res.ok) {
        setStatusMsg('Published live to all Customer & Partner PWAs with zero app reinstall!');
        await loadWorkspace();
        await onLiveUpdated();
      } else {
        setStatusMsg('Failed to publish live.');
      }
    } catch {
      setStatusMsg('Network error publishing live.');
    }
  };

  const handleRollback = async (snapshotId?: string) => {
    try {
      const res = await fetch('/api/dev-studio/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ snapshotId }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      if (res.ok) {
        setStatusMsg('1-Click Snapshot Rollback completed and pushed live.');
        await loadWorkspace();
        await onLiveUpdated();
      } else {
        setStatusMsg('Rollback failed.');
      }
    } catch {
      setStatusMsg('Network error during rollback.');
    }
  };

  const handleSendAiPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    const promptText = aiPrompt.trim();
    setMessages((prev) => [...prev, { role: 'user', text: promptText }]);
    setAiPrompt('');
    setAiLoading(true);
    try {
      const res = await fetch('/api/dev-studio/ai-architect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ prompt: promptText }),
      });
      if (res.status === 401) {
        onAuthExpired();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: `Error: ${data.error || 'AI Engineer request failed'}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.reply,
            tools: data.toolInvocations,
          },
        ]);
        await loadWorkspace();
        await onLiveUpdated();
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Network error communicating with AI Software Engineer.' },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-slate-950 text-slate-100 border border-slate-800 overflow-hidden mb-16 md:mb-4">
      {/* Studio Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div>
          <h1 className="text-sm font-bold text-white">Server Developer Studio (/admin/dev-studio)</h1>
          <p className="text-[11px] text-slate-400">
            Monaco Engine · Zero-Install SDUI · 1-Click Snapshot Rollback
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSaveEditorToSandbox}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
          >
            <Save className="w-3.5 h-3.5" /> Save / Stage Sandbox
          </button>
          <button
            type="button"
            onClick={handlePublishLive}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
          >
            <Rocket className="w-3.5 h-3.5" /> 1-Click Live Publish
          </button>
          <button
            type="button"
            onClick={() => handleRollback(snapshots[0]?.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/50 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-900/50"
          >
            <RotateCcw className="w-3.5 h-3.5" /> 1-Click Rollback
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="border-b border-slate-800 bg-teal-950/60 px-4 py-2 text-xs text-teal-200">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[600px]">
        {/* Left Explorer: Plugins + Snapshots */}
        <aside className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 space-y-5 bg-slate-900/60">
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-slate-400">SDUI &amp; System Plugins</h2>
            <button
              type="button"
              onClick={() => handleSelectTarget('__remote_config__')}
              className={`w-full text-left rounded-lg px-3 py-2 text-xs font-mono ${
                selectedPluginId === '__remote_config__'
                  ? 'bg-teal-600/20 text-teal-300 border border-teal-500/40'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              app_remote_config.json
            </button>

            <div className="space-y-1.5 pt-1">
              {plugins.map((plg) => (
                <div
                  key={plg.id}
                  className={`flex items-center justify-between gap-1 rounded-lg px-2.5 py-2 text-xs ${
                    selectedPluginId === plg.id
                      ? 'bg-teal-600/20 text-teal-200 border border-teal-500/40'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectTarget(plg.id)}
                    className="flex-1 text-left truncate font-mono"
                  >
                    {plg.key}.ts
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTogglePlugin(plg)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      plg.enabled ? 'bg-teal-700 text-white' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {plg.enabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${plg.key}`}
                    onClick={() => handleDeletePlugin(plg.id)}
                    className="text-slate-500 hover:text-red-400 p-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleCreatePlugin} className="space-y-2 border-t border-slate-800 pt-4">
            <h3 className="text-xs font-semibold text-slate-400">Create New Plugin</h3>
            <input
              type="text"
              value={newPluginKey}
              onChange={(e) => setNewPluginKey(e.target.value)}
              placeholder="plugin-slug-key"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-white"
            />
            <input
              type="text"
              value={newPluginName}
              onChange={(e) => setNewPluginName(e.target.value)}
              placeholder="Display Name"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
            />
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-slate-800 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
            >
              <Plus className="w-3.5 h-3.5" /> Add Plugin
            </button>
          </form>

          {/* Sandbox & Snapshots */}
          <div className="space-y-2 border-t border-slate-800 pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold">Sandbox Preview</span>
              <span className="inline-flex items-center gap-1 text-amber-300 font-mono">
                <Eye className="w-3 h-3" /> {sandboxConfig ? 'Staged' : 'Synced'}
              </span>
            </div>
            <div className="space-y-1">
              {snapshots.slice(0, 4).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleRollback(s.id)}
                  className="w-full text-left rounded bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 truncate"
                >
                  ↺ {s.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center: Monaco Editor */}
        <section className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col">
          <div className="border-b border-slate-800 bg-slate-900/40 px-4 py-2 text-xs font-mono text-slate-300 flex items-center justify-between">
            <span>
              {selectedPluginId === '__remote_config__'
                ? 'app_remote_config.json (SDUI Live Schema)'
                : `${plugins.find((p) => p.id === selectedPluginId)?.key || 'plugin'}.ts`}
            </span>
            <span className="text-slate-500">Monaco Engine</span>
          </div>
          <div className="flex-1 min-h-[460px]">
            <Editor
              height="460px"
              theme="vs-dark"
              language={selectedPluginId === '__remote_config__' ? 'json' : 'typescript'}
              value={editorValue}
              onChange={(val) => setEditorValue(val ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </section>

        {/* Right: Autonomous AI Software Engineer (gemini-4-hydrogen) */}
        <section className="lg:col-span-4 flex flex-col bg-slate-900/40">
          <div className="border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-white">
              <Bot className="w-4 h-4 text-teal-400" /> AI Software Engineer
            </span>
            <span className="text-[11px] font-mono text-teal-400">gemini-4-hydrogen</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[460px]">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`rounded-xl p-3 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-teal-900/50 text-teal-100 ml-6'
                    : 'bg-slate-800/90 text-slate-200 mr-4'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.tools && m.tools.length > 0 && (
                  <div className="mt-2 border-t border-slate-700 pt-2 space-y-1 font-mono text-[11px] text-amber-300">
                    {m.tools.map((tool, i) => (
                      <div key={i}>
                        Tool: {tool.name}({JSON.stringify(tool.args)})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {aiLoading && (
              <p className="text-xs text-slate-400 font-mono">AI Engineer executing tools...</p>
            )}
          </div>

          <form onSubmit={handleSendAiPrompt} className="border-t border-slate-800 p-3 space-y-2">
            <label htmlFor="ai-engineer-input" className="sr-only">
              Prompt AI Software Engineer
            </label>
            <textarea
              id="ai-engineer-input"
              rows={2}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g., Set rain surge to 1.25x and add a Mizoram festival discount plugin..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={aiLoading}
              className="w-full min-h-[40px] rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
            >
              Run Autonomous Tool-Calling Prompt
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
