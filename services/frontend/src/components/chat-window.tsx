import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Sparkles, 
  HelpCircle, 
  Search, 
  BookOpen, 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  FileText,
  BookmarkCheck,
  ChevronRight,
  ShieldCheck,
  Award
} from 'lucide-react';

interface ChatWindowProps {
  tenantId: string;
}

interface StepLog {
  step: string;
  message: string;
}

interface Citation {
  citation_index: number;
  chunk_id: string;
  source: string;
  text: string;
  confidence: number;
}

interface Chunk {
  id: string;
  source: string;
  text: string;
  relevance_score?: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  chunks?: Chunk[];
}

const SUGGESTED_QUERIES = [
  { label: "IFRS 16 Lease Rules", query: "What are the initial measurement rules for leases under IFRS 16?" },
  { label: "Alpha equipment lease audit", query: "Explain the lease transactions matching Alpha Manufacturing Corp" },
  { label: "EU VAT Place of Supply", query: "What is the place of supply for electronic services under EU VAT Article 58?" }
];

export default function ChatWindow({ tenantId }: ChatWindowProps) {
  const [conversationId, setConversationId] = useState<string>('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Streaming state trackers
  const [currentStep, setCurrentStep] = useState<string>('');
  const [stepsLog, setStepsLog] = useState<StepLog[]>([]);
  const [matchingChunks, setMatchingChunks] = useState<Chunk[]>([]);
  const [streamedResponse, setStreamedResponse] = useState('');
  const [currentCitations, setCurrentCitations] = useState<Citation[]>([]);

  // Right drawer drawer state
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize unique conversation ID on mount
  useEffect(() => {
    // Generate simple UUID-like string
    const convId = 'conv-' + Math.random().toString(36).substring(2, 15);
    setConversationId(convId);
    
    // Seed default assistant greeting
    setMessages([
      {
        id: 'greet',
        role: 'assistant',
        content: "Welcome to your AI Accounting Workspace. Submit a regulatory standard query, lease contract scenario, or tax rule verification to begin researching. Your workspace runs under isolated database rules."
      }
    ]);
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedResponse, stepsLog]);

  const startStream = async (queryText: string) => {
    if (!queryText.trim()) return;

    // Reset streaming state
    setIsLoading(true);
    setQuestion('');
    setCurrentStep('router');
    setStepsLog([{ step: 'router', message: 'Routing query to appropriate agents...' }]);
    setMatchingChunks([]);
    setStreamedResponse('');
    setCurrentCitations([]);
    setActiveCitation(null);

    // Save user message
    const userMsgId = 'msg-' + Date.now();
    const newMessages: Message[] = [
      ...messages,
      { id: userMsgId, role: 'user', content: queryText }
    ];
    setMessages(newMessages);

    try {
      // 1. Kick off Celery run via FastAPI POST view
      const triggerRes = await fetch(`/api/v1/agent/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: queryText,
          tenant_id: tenantId
        })
      });

      if (!triggerRes.ok) throw new Error('Failed to schedule agent execution task.');

      // 2. Bind SSE Stream
      const eventSource = new EventSource(`/api/v1/agent/conversations/${conversationId}/stream`);

      eventSource.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        const { event: eventType, data } = payload;

        if (eventType === 'status') {
          setCurrentStep(data.step);
          setStepsLog(prev => {
            // Deduplicate same steps
            const filtered = prev.filter(x => x.step !== data.step);
            return [...filtered, { step: data.step, message: data.message }];
          });
        } 
        
        else if (eventType === 'chunks') {
          setMatchingChunks(data.chunks);
        } 
        
        else if (eventType === 'token') {
          setStreamedResponse(prev => prev + data.text);
        } 
        
        else if (eventType === 'citations') {
          setCurrentCitations(data.citations);
        } 
        
        else if (eventType === 'done') {
          eventSource.close();
          // Persist the full response to chat history
          setMessages(prev => [
            ...prev,
            {
              id: 'msg-' + Date.now(),
              role: 'assistant',
              content: data.answer,
              citations: data.citations,
              chunks: matchingChunks
            }
          ]);
          setIsLoading(false);
          setStreamedResponse('');
        } 
        
        else if (eventType === 'error') {
          eventSource.close();
          setMessages(prev => [
            ...prev,
            { id: 'err-' + Date.now(), role: 'assistant', content: `Execution Error: ${data.error}` }
          ]);
          setIsLoading(false);
        }
      };

      eventSource.onerror = (e) => {
        console.error("SSE stream connection error", e);
        eventSource.close();
        setIsLoading(false);
      };

    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { id: 'err-' + Date.now(), role: 'assistant', content: `Network Connection Error: ${err.message}` }
      ]);
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startStream(question);
  };

  // Helper to parse citations in assistant message content and render clickable tags
  const renderMessageContent = (msg: Message) => {
    const text = msg.content;
    const citations = msg.citations || currentCitations;

    if (!citations || citations.length === 0) {
      return <p className="whitespace-pre-line leading-relaxed text-[15px]">{text}</p>;
    }

    // Replace [citation:chunk_id] with clickable link pill
    const parts = text.split(/(\[citation:[a-zA-Z0-9_-]+\])/g);
    
    return (
      <p className="whitespace-pre-line leading-relaxed text-[15px]">
        {parts.map((part, index) => {
          const match = part.match(/\[citation:([a-zA-Z0-9_-]+)\]/);
          if (match) {
            const chunkId = match[1];
            const citation = citations.find(c => c.chunk_id === chunkId);
            if (citation) {
              return (
                <button
                  key={index}
                  onClick={() => setActiveCitation(citation)}
                  className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/35 border border-indigo-500/30 transition-all duration-200"
                  title={`View Source: ${citation.source}`}
                >
                  <BookOpen className="h-3 w-3 shrink-0" />
                  <span>{citation.citation_index}</span>
                </button>
              );
            }
          }
          return part;
        })}
      </p>
    );
  };

  // Stepper labels matching LangGraph nodes
  const STEPPER_STAGES = [
    { key: 'router', label: 'Intent Classification' },
    { key: 'planner', label: 'Planning Query Steps' },
    { key: 'retriever', label: 'Knowledge Base Search' },
    { key: 'synthesizer', label: 'Grounded Synthesis' },
    { key: 'validator', label: 'Citation Auditing' }
  ];

  return (
    <div className="flex-1 flex overflow-hidden h-full">
      
      {/* Messages Column */}
      <div className="flex-1 flex flex-col justify-between h-full bg-slate-950/20">
        
        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-10 py-6 space-y-6">
          
          {messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
            >
              <div className={`max-w-[75%] rounded-2xl p-5 border text-slate-200 transition-all ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-br from-indigo-900/60 to-indigo-950/40 border-indigo-700/40 shadow-lg shadow-indigo-950/10'
                  : 'bg-card/40 backdrop-blur-md border-border shadow-md'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold ${
                    msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {msg.role === 'user' ? 'U' : 'AI'}
                  </div>
                  <span className="text-xs font-semibold text-slate-400">
                    {msg.role === 'user' ? 'You' : 'Grounded Analyst'}
                  </span>
                </div>
                
                <div className="space-y-4">
                  {msg.role === 'user' ? (
                    <p className="text-[15px] leading-relaxed">{msg.content}</p>
                  ) : (
                    renderMessageContent(msg)
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Real-time Streaming Response (Puffs while writing) */}
          {isLoading && streamedResponse && (
            <div className="flex gap-4 justify-start animate-fade-in">
              <div className="max-w-[75%] rounded-2xl p-5 border bg-card/40 backdrop-blur-md border-border shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-6 w-6 rounded-md bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] font-bold animate-pulse-slow">
                    AI
                  </div>
                  <span className="text-xs font-semibold text-indigo-400">Grounded Analyst (Streaming...)</span>
                </div>
                {renderMessageContent({
                  id: 'streaming',
                  role: 'assistant',
                  content: streamedResponse
                })}
              </div>
            </div>
          )}

          {/* LangGraph Active Step Stepper */}
          {isLoading && (
            <div className="p-5 border border-border/80 bg-slate-900/20 backdrop-blur-sm rounded-xl max-w-2xl space-y-4 animate-slide-up">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reasoning Graph Active
                </span>
                <span className="text-[10px] text-slate-500">LangGraph Checkpoint Saver Enabled</span>
              </div>
              
              <div className="grid grid-cols-5 gap-2">
                {STEPPER_STAGES.map((stage, idx) => {
                  const isCurrent = currentStep === stage.key || (currentStep === 'writing' && stage.key === 'synthesizer');
                  const logForStage = stepsLog.find(x => x.step === stage.key);
                  const isCompleted = stepsLog.some(x => x.step === stage.key) && !isCurrent;
                  
                  return (
                    <div key={stage.key} className="flex flex-col items-center text-center space-y-1">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-300 ${
                        isCurrent ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-105 border border-indigo-400' :
                        isCompleted ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/60' :
                        'bg-slate-900/40 text-slate-500 border border-slate-950'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <span className="text-xs font-semibold">{idx + 1}</span>
                        )}
                      </div>
                      <span className={`text-[10px] font-medium leading-none ${isCurrent ? 'text-slate-200' : 'text-slate-500'}`}>
                        {stage.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Status detail box */}
              <div className="bg-slate-950/50 border border-slate-900 p-2.5 rounded-lg flex items-start gap-2.5">
                <Search className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-400 italic leading-normal">
                  {stepsLog[stepsLog.length - 1]?.message || "Awaiting step response..."}
                </p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestion & Input Control area */}
        <div className="p-6 border-t border-border bg-card/10 backdrop-blur-md">
          
          {/* Suggested Queries */}
          {messages.length <= 1 && !isLoading && (
            <div className="flex gap-2 mb-4 justify-center">
              {SUGGESTED_QUERIES.map((sq, i) => (
                <button
                  key={i}
                  onClick={() => startStream(sq.query)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-border text-xs text-slate-300 hover:text-slate-100 transition-all duration-200 active:scale-95"
                >
                  <HelpCircle className="h-3 w-3 text-indigo-400" />
                  <span>{sq.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleFormSubmit} className="relative flex items-center max-w-4xl mx-auto group">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about cross-border leases, digital VAT place of supply, client filings..."
              disabled={isLoading}
              className="w-full bg-[#11131e]/50 border border-border focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/40 rounded-2xl py-4 pl-6 pr-14 text-slate-200 placeholder-slate-500 focus:outline-none transition-all duration-200 shadow-inner"
            />
            <button
              type="submit"
              disabled={isLoading || !question.trim()}
              className="absolute right-3.5 p-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-600 hover:to-fuchsia-600 text-white hover:shadow-lg hover:shadow-indigo-500/20 transition-all disabled:opacity-40 disabled:hover:shadow-none active:scale-95"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          
          <p className="text-center text-[10px] text-slate-600 mt-3 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-slate-600" /> Grounded in regulatory databases. Out-of-bounds queries rejected automatically.
          </p>
        </div>

      </div>

      {/* Citations Drawer (Collapsible Right Side Bar) */}
      <div className={`border-l border-border bg-card/30 backdrop-blur-lg flex flex-col transition-all duration-300 ${
        activeCitation ? 'w-96' : 'w-0 overflow-hidden border-l-0'
      }`}>
        {activeCitation && (
          <div className="p-6 flex flex-col h-full space-y-6">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <BookmarkCheck className="h-5 w-5 text-indigo-400" />
                <h3 className="font-semibold text-slate-200">Grounded Citation</h3>
              </div>
              <button 
                onClick={() => setActiveCitation(null)}
                className="text-xs text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 hover:border-border px-2.5 py-1 rounded-md"
              >
                Close
              </button>
            </div>

            {/* Source info card */}
            <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-900/40 space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-semibold uppercase tracking-wider">
                <Award className="h-3.5 w-3.5" /> Source Document
              </div>
              <p className="text-sm font-semibold text-slate-200">{activeCitation.source}</p>
              
              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-indigo-950/60">
                <span>Verification Score:</span>
                <span className="font-bold text-emerald-400">{(activeCitation.confidence * 100).toFixed(0)}% Match</span>
              </div>
            </div>

            {/* Passage text block */}
            <div className="flex-1 space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Verified Extract Passage</label>
              <div className="bg-slate-950/70 border border-slate-900 p-4 rounded-xl text-slate-300 text-sm leading-relaxed whitespace-pre-line max-h-[350px] overflow-y-auto font-sans shadow-inner">
                {activeCitation.text}
              </div>
            </div>

            {/* Bottom alert context */}
            <div className="p-3.5 rounded-lg bg-emerald-950/10 border border-emerald-900/30 flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-slate-400 leading-normal">
                This fact has been audit-graded and verified under the RLS session token policies. Entailment checks confirm no semantic contradictions.
              </p>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
