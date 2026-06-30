import React, { useState, useRef } from 'react';
import { UploadCloud, File, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface DocumentUploaderProps {
  token: string | null;
  onUploadSuccess: () => void;
}

export default function DocumentUploader({ token, onUploadSuccess }: DocumentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      setStatus('idle');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatus('idle');
    }
  };

  const handleUpload = async () => {
    if (!file || !token) return;
    
    setUploading(true);
    setStatus('idle');
    
    // We need a client ID to attach the document to.
    // For this MVP, we will fetch the first available client or require it as a prop.
    // To keep it simple, let's fetch the first client for the tenant.
    try {
      const clientsRes = await fetch('/api/v1/workspace/clients/', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const clientsData = await clientsRes.json();
      
      if (!clientsData || clientsData.length === 0) {
        throw new Error("No clients found to attach document to.");
      }
      
      const clientId = clientsData[0].id;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('client', clientId);
      
      const res = await fetch('/api/v1/workspace/documents/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!res.ok) throw new Error("Upload failed.");
      
      setStatus('success');
      setMessage('Document uploaded & sent for AI ingestion.');
      setFile(null);
      onUploadSuccess();
      
      // Reset success message after 3 seconds
      setTimeout(() => {
        setStatus('idle');
        setMessage('');
      }, 3000);

    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || "An error occurred.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-6 mb-2">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">
        <span className="flex items-center gap-1.5"><UploadCloud className="h-3.5 w-3.5" /> Knowledge Ingestion</span>
      </div>
      
      <div 
        className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all duration-200 ${
          isDragging 
            ? 'border-indigo-500 bg-indigo-500/10' 
            : 'border-slate-800 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-800/40'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          accept=".pdf,.txt,.csv"
        />
        
        {!file ? (
          <div className="flex flex-col items-center justify-center space-y-2 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <UploadCloud className="h-6 w-6 text-slate-500" />
            <p className="text-[11px] text-slate-400 font-medium">Drag & drop PDF to ingest</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="flex items-center gap-2 max-w-full bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
              <File className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span className="text-[10px] text-slate-300 truncate font-medium">{file.name}</span>
              <button onClick={() => setFile(null)} className="ml-1 text-slate-500 hover:text-rose-400 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </div>
            
            <button 
              onClick={handleUpload} 
              disabled={uploading}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-all disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Start Ingestion"}
            </button>
          </div>
        )}

        {status === 'success' && (
          <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl border border-emerald-900 animate-fade-in">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 mb-1" />
            <span className="text-[10px] font-semibold text-emerald-400 text-center px-2">{message}</span>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 bg-rose-950/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl border border-rose-900 animate-fade-in">
            <AlertCircle className="h-6 w-6 text-rose-500 mb-1" />
            <span className="text-[10px] font-semibold text-rose-400 text-center px-2">{message}</span>
            <button onClick={() => setStatus('idle')} className="mt-1 text-[9px] underline text-rose-300 hover:text-white">Dismiss</button>
          </div>
        )}
      </div>
    </div>
  );
}
