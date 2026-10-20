import React, { useState } from 'react';
import { Github, GitFork, Terminal, Code2, CheckCircle2, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

export default function App() {
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [patToken, setPatToken] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleClonePrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-slate-100 text-sm md:text-base leading-none">GitHub Workspace Importer</h1>
              <p className="text-xs text-slate-400 mt-1">Google AI Studio Environment</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Environment Ready
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-10">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-xs font-medium border border-indigo-500/20">
            <Sparkles className="w-3.5 h-3.5" /> Direct Repo Integration Supported
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Yes, you can clone your GitHub repo directly!
          </h2>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Provide your GitHub repository URL below or reply in chat. I will execute the clone, install dependencies, and configure your app to run seamlessly right here.
          </p>
        </div>

        {/* Input Card */}
        <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <form onSubmit={handleClonePrompt} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                GitHub Repository URL
              </label>
              <div className="relative">
                <Github className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="url"
                  placeholder="https://github.com/username/repository.git"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Branch (Optional)
                </label>
                <div className="relative">
                  <GitFork className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="main / master / dev"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Personal Access Token (For Private Repos)
                </label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxx"
                    value={patToken}
                    onChange={(e) => setPatToken(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              <span>Share Repository Details</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {submitted && (
            <div className="mt-6 p-4 bg-indigo-950/50 border border-indigo-500/30 rounded-xl text-xs sm:text-sm text-indigo-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-indigo-300">
                <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                Repository Details Saved!
              </div>
              <p>
                Now simply paste or confirm the repository URL <code className="bg-slate-900 px-1.5 py-0.5 rounded text-indigo-300 font-mono">{repoUrl}</code> directly in the chat window, and I will execute the clone and set up your project automatically.
              </p>
            </div>
          )}
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-5 space-y-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-lg w-fit">
              <Code2 className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-slate-200">Supported Frameworks</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              React, Next.js, Vite, Vue, Angular, Node.js/Express, Python (Flask/FastAPI), HTML/CSS, and standard JavaScript/TypeScript repositories.
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-5 space-y-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-lg w-fit">
              <Terminal className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-slate-200">Automatic Build & Setup</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dependencies will be installed, environment configuration adjusted, and scripts executed to get the preview running instantly.
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-5 space-y-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-lg w-fit">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-slate-200">Public & Private Repos</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Public repos clone instantly. For private repos, pass a Personal Access Token (PAT) or token-authenticated URL.
            </p>
          </div>
        </div>

        {/* Command Cheat Sheet */}
        <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-6 space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">How to share your repo in chat</h3>
          <div className="bg-slate-950 rounded-lg p-4 font-mono text-xs text-slate-300 space-y-2 border border-slate-800/60">
            <p className="text-slate-400"># For public repositories:</p>
            <p className="text-indigo-400">"Clone https://github.com/your-username/your-repo.git"</p>
            <p className="text-slate-400 pt-2"># For private repositories using a Personal Access Token:</p>
            <p className="text-indigo-400">"Clone https://&lt;TOKEN&gt;@github.com/your-username/your-repo.git"</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
        Google AI Studio &bull; GitHub Workspace Migration Tool
      </footer>
    </div>
  );
}

