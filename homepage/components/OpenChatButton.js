'use client';
import { MessageCircle } from 'lucide-react';
import { OPEN_CHAT } from '../lib/site';

export default function OpenChatButton({ className = 'btn-outline', label = 'Chat with us' }) {
  return (
    <button type="button" className={className} aria-haspopup="dialog" aria-controls="chat-panel"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_CHAT))}>
      <MessageCircle aria-hidden="true" size={22} /> {label}
    </button>
  );
}
