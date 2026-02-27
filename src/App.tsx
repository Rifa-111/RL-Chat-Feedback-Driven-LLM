import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  ThumbsUp, 
  ThumbsDown, 
  Bot, 
  User, 
  Sparkles, 
  BarChart3, 
  RefreshCw,
  BrainCircuit
} from 'lucide-react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getChatResponse, ChatMessage } from './services/geminiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({ totalResponses: 0, positive: 0, negative: 0 });
  const [showStats, setShowStats] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Save user message to DB
      const userRes = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userMsg)
      });
      const { id: userId } = await userRes.json();

      // Get best examples for "RL" context
      const examplesRes = await fetch('/api/best-examples');
      const examples = await examplesRes.json();

      // Get AI response
      const aiResponse = await getChatResponse([...messages, userMsg], examples);
      
      const modelMsg: ChatMessage = { role: 'model', content: aiResponse };
      
      // Save model message to DB
      const modelRes = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelMsg)
      });
      const { id: modelId } = await modelRes.json();
      
      setMessages(prev => [...prev, { ...modelMsg, id: modelId }]);
      fetchStats();
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { role: 'model', content: "Sorry, I encountered an error. Please check your API key." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (messageId: number, rating: number) => {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, rating })
      });
      
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, feedback: rating } : m
      ));
      fetchStats();
    } catch (err) {
      console.error('Feedback error:', err);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto bg-white shadow-2xl border-x border-zinc-200 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-bottom border-zinc-100 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-zinc-200">
            <BrainCircuit size={24} />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">RL-Chat</h1>
            <p className="text-xs text-zinc-500 font-medium flex items-center gap-1">
              <Sparkles size={12} className="text-amber-500" />
              Learning from your feedback
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowStats(!showStats)}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-600"
            title="Training Stats"
          >
            <BarChart3 size={20} />
          </button>
          <button 
            onClick={() => setMessages([])}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-600"
            title="Clear Chat"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </header>

      {/* Stats Overlay */}
      <AnimatePresence>
        {showStats && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 right-6 z-20 w-64 bg-white border border-zinc-200 rounded-2xl shadow-xl p-4"
          >
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 size={16} /> Training Progress
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Total Responses</span>
                <span className="font-mono font-bold">{stats.totalResponses}</span>
              </div>
              <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-500" 
                  style={{ width: `${stats.totalResponses > 0 ? (stats.positive / stats.totalResponses) * 100 : 0}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                  <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider">Positive</p>
                  <p className="text-lg font-mono font-bold text-emerald-700">{stats.positive}</p>
                </div>
                <div className="bg-rose-50 p-2 rounded-lg border border-rose-100">
                  <p className="text-[10px] text-rose-600 uppercase font-bold tracking-wider">Negative</p>
                  <p className="text-lg font-mono font-bold text-rose-700">{stats.negative}</p>
                </div>
              </div>
              <p className="text-[10px] text-zinc-400 italic">
                * Highly rated responses are used as few-shot examples in future prompts.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Area */}
      <main 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
            <Bot size={48} className="text-zinc-300" />
            <div>
              <p className="text-zinc-500 font-medium">No messages yet</p>
              <p className="text-xs text-zinc-400">Start a conversation to begin the RL training loop</p>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex gap-4 max-w-[85%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                msg.role === 'user' ? "bg-zinc-100 text-zinc-600" : "bg-zinc-900 text-white"
              )}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              
              <div className="space-y-2">
                <div className={cn(
                  "p-4 rounded-2xl shadow-sm",
                  msg.role === 'user' 
                    ? "bg-zinc-100 text-zinc-800 rounded-tr-none" 
                    : "bg-white border border-zinc-100 text-zinc-800 rounded-tl-none"
                )}>
                  <div className="markdown-body">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                </div>

                {msg.role === 'model' && msg.id && (
                  <div className="flex items-center gap-2 px-1">
                    <button 
                      onClick={() => handleFeedback(msg.id!, 1)}
                      disabled={msg.feedback !== undefined}
                      className={cn(
                        "p-1.5 rounded-md transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider",
                        msg.feedback === 1 
                          ? "bg-emerald-100 text-emerald-700" 
                          : "hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"
                      )}
                    >
                      <ThumbsUp size={12} />
                      {msg.feedback === 1 ? 'Helpful' : ''}
                    </button>
                    <button 
                      onClick={() => handleFeedback(msg.id!, -1)}
                      disabled={msg.feedback !== undefined}
                      className={cn(
                        "p-1.5 rounded-md transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider",
                        msg.feedback === -1 
                          ? "bg-rose-100 text-rose-700" 
                          : "hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"
                      )}
                    >
                      <ThumbsDown size={12} />
                      {msg.feedback === -1 ? 'Not Helpful' : ''}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-4 mr-auto"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center shrink-0 animate-pulse">
              <Bot size={16} />
            </div>
            <div className="bg-white border border-zinc-100 p-4 rounded-2xl rounded-tl-none shadow-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* Input Area */}
      <footer className="p-6 bg-white border-t border-zinc-100">
        <form 
          onSubmit={handleSend}
          className="relative flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-zinc-200"
          >
            <Send size={18} />
          </button>
        </form>
        <p className="mt-3 text-[10px] text-center text-zinc-400 font-medium">
          RL-Chat uses a feedback loop to refine its responses. Your ratings directly influence future generations.
        </p>
      </footer>
    </div>
  );
}
