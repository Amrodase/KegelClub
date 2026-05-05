import React, { useState, useEffect, useCallback, memo } from 'react';
import PollComponent from './components/PollComponent';
import TiptapEditor from './components/TiptapEditor';
import { 
  Users, 
  Calendar, 
  TrendingUp, 
  Wallet, 
  Settings, 
  LogOut, 
  ChevronRight, 
  Plus, 
  Trophy, 
  AlertCircle,
  CheckCircle2,
  Bell,
  Vote,
  Menu,
  X,
  CreditCard,
  Fingerprint,
  Home,
  LayoutGrid,
  Shield,
  MapPin,
  Trash2,
  Send,
  Eye,
  EyeOff,
  MessageSquare,
  Image as ImageIcon,
  Camera,
  Loader2,
  Smile,
  Search,
  Sticker
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io } from 'socket.io-client';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

// --- UTILS ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- TYPES ---
type Role = 'admin' | 'member';
interface User {
  id: number;
  name: string;
  role: Role;
  username: string;
}

// --- COMPONENTS ---

const ChatView = ({ user, token }: { user: User, token: string }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [socket, setSocket] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [giphySearch, setGiphySearch] = useState('');
  const [giphyResults, setGiphyResults] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'emoji' | 'gif' | 'sticker'>('emoji');
  
  const emojis = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','🎃','😺','😸','😻','😼','😽','🙀','😿','😾'];

  useEffect(() => {
    if (giphySearch && (activeTab === 'gif' || activeTab === 'sticker')) {
      const type = activeTab === 'gif' ? 'gifs' : 'stickers';
      const timer = setTimeout(() => {
        fetch(`https://api.giphy.com/v1/${type}/search?api_key=7Pivw5O9k7CsnM1Jtuy7Jy27hY79usZW&q=${giphySearch}&limit=20`)
          .then(res => res.json())
          .then(data => {
            console.log('Giphy Search Results:', data);
            setGiphyResults(data.data || []);
          })
          .catch(err => console.error('Giphy Fetch Error:', err));
      }, 500);
      return () => clearTimeout(timer);
    } else if (activeTab === 'gif' || activeTab === 'sticker') {
      const type = activeTab === 'gif' ? 'gifs' : 'stickers';
      fetch(`https://api.giphy.com/v1/${type}/trending?api_key=7Pivw5O9k7CsnM1Jtuy7Jy27hY79usZW&limit=20`)
        .then(res => res.json())
        .then(data => {
          console.log('Giphy Trending Results:', data);
          setGiphyResults(data.data || []);
        })
        .catch(err => console.error('Giphy Fetch Error:', err));
    }
  }, [giphySearch, activeTab]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const s = io();
    setSocket(s);
    s.emit('join_chat');

    fetch('/api/chat/messages', {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => res.json()).then(data => setMessages(data));

    s.on('receive_message', (msg: any) => {
      setMessages(prev => [...prev, msg]);
    });

    s.on('message_deleted', (msgId: number) => {
      setMessages(prev => prev.filter(m => m.id !== msgId));
    });

    return () => {
      s.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent, imageUrl?: string) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() && !imageUrl) return;
    if (!socket) return;
    
    socket.emit('send_message', {
      member_id: user.id,
      content: newMessage,
      image_url: imageUrl
    });
    setNewMessage('');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/chat/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (data.url) {
        handleSendMessage(null as any, data.url);
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteMessage = async (msgId: number) => {
    if (!confirm('Nachricht wirklich löschen?')) return;
    try {
      const res = await fetch(`/api/chat/messages/${msgId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        socket.emit('delete_message', msgId);
      }
    } catch (err) {
      console.error('Delete message failed', err);
    }
  };

  return (
    <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-[calc(100vh-10rem)]">
      <Card className="h-full flex flex-col p-0 overflow-hidden border-slate-800">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar scroll-smooth">
          {messages.map((m, idx) => (
            <div key={idx} className={cn("flex flex-col group", m.user_id === user.id ? "items-end" : "items-start")}>
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[10px] font-bold text-slate-400">{m.user_name}</span>
                <span className="text-[8px] text-slate-500">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {(m.user_id === user.id || user.role === 'admin') && (
                  <button 
                    onClick={() => handleDeleteMessage(m.id)}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <div className={cn(
                "rounded-2xl max-w-[65%] text-sm shadow-sm relative overflow-hidden",
                m.user_id === user.id 
                  ? "text-white rounded-tr-none shadow-sky-500/10" 
                  : "text-slate-200 rounded-tl-none",
                // Only add background/border if there's text content
                m.content ? (
                  m.user_id === user.id ? "bg-sky-500" : "bg-slate-800 border border-slate-700/50"
                ) : "bg-transparent shadow-none"
              )}>
                {m.image_url && (
                  <div className={cn(m.content ? "p-1" : "p-0")}>
                    <img 
                      src={m.image_url} 
                      alt="Shared" 
                      className="rounded-xl max-w-full h-auto max-h-64 object-contain cursor-pointer"
                      referrerPolicy="no-referrer"
                      onClick={() => window.open(m.image_url, '_blank')}
                    />
                  </div>
                )}
                {m.content && (
                  <div className={cn(
                    "px-4 py-2",
                    // If there's an image, the background and border are handled by the container
                    m.user_id === user.id ? "bg-sky-500" : "bg-slate-800 border-none",
                    m.image_url && "border-t border-white/10"
                  )}>
                    {m.content}
                  </div>
                )}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 opacity-50">
              <MessageSquare size={48} />
              <p className="text-sm">Noch keine Nachrichten...</p>
            </div>
          )}
        </div>

        <form onSubmit={(e) => handleSendMessage(e)} className="p-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur-sm relative">
          <AnimatePresence>
            {showEmojiPicker && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full left-4 mb-2 w-[calc(100%-2rem)] max-w-sm bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden"
              >
                <div className="flex border-b border-slate-700">
                  <button 
                    type="button" 
                    onClick={() => setActiveTab('emoji')}
                    className={cn("flex-1 py-2 text-xs font-bold uppercase transition-all", activeTab === 'emoji' ? "text-sky-400 bg-sky-400/10" : "text-slate-400")}
                  >
                    Emojis
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setActiveTab('gif')}
                    className={cn("flex-1 py-2 text-xs font-bold uppercase transition-all", activeTab === 'gif' ? "text-sky-400 bg-sky-400/10" : "text-slate-400")}
                  >
                    GIPHY
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setActiveTab('sticker')}
                    className={cn("flex-1 py-2 text-xs font-bold uppercase transition-all", activeTab === 'sticker' ? "text-sky-400 bg-sky-400/10" : "text-slate-400")}
                  >
                    Sticker
                  </button>
                </div>
                
                <div className="h-64 overflow-y-auto p-3 no-scrollbar">
                  {activeTab === 'emoji' && (
                    <div className="grid grid-cols-8 gap-2">
                      {emojis.map(emoji => (
                        <button 
                          key={emoji} 
                          type="button" 
                          onClick={() => {
                            setNewMessage(prev => prev + emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="text-xl hover:scale-125 transition-transform"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {(activeTab === 'gif' || activeTab === 'sticker') && (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                        <input 
                          type="text" 
                          placeholder="Suchen..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-50 outline-none focus:border-sky-500/50"
                          value={giphySearch}
                          onChange={(e) => setGiphySearch(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {giphyResults.map(gif => (
                          <img 
                            key={gif.id}
                            src={gif.images.fixed_height_small.url}
                            alt="GIF"
                            className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                            referrerPolicy="no-referrer"
                            onClick={() => {
                              handleSendMessage(null as any, gif.images.original.url);
                              setShowEmojiPicker(false);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <input 
            type="file" 
            accept="image/*,.pdf,.txt,.doc,.docx" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleImageUpload}
          />
          <div className="flex gap-2">
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-slate-50 hover:border-slate-600 transition-all active:scale-95 flex items-center justify-center h-10 w-10"
            >
              {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            </button>
            <button 
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={cn(
                "p-3 bg-slate-800 border border-slate-700 rounded-xl transition-all active:scale-95 flex items-center justify-center h-10 w-10",
                showEmojiPicker ? "text-sky-400 border-sky-500/30" : "text-slate-400 hover:text-slate-50 hover:border-slate-600"
              )}
            >
              <Smile size={16} />
            </button>
          </div>
          <div className="flex flex-1 gap-2">
            <textarea 
              placeholder="Nachricht schreiben..."
              rows={2}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-50 focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 outline-none transition-all resize-none min-h-[44px]"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onFocus={() => setShowEmojiPicker(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e as any);
                }
              }}
            />
            <button 
              type="submit" 
              disabled={isUploading} 
              className="bg-sky-500 p-3 rounded-xl text-white hover:bg-sky-400 active:scale-95 disabled:opacity-50 transition-all shadow-lg shadow-sky-500/20 flex-shrink-0"
            >
              <Send size={20} />
            </button>
          </div>
        </form>
      </Card>
    </motion.div>
  );
};

// --- COMPONENTS ---

const Card = memo(({ children, className, title, subtitle }: any) => (
  <div className={cn("bg-slate-800 border border-slate-700/50 rounded-2xl p-4 md:p-6 shadow-lg shadow-black/40 w-full", className)}>
    {title && (
      <div className="mb-4">
        <h3 className="text-base md:text-lg font-semibold text-slate-50 break-words">{title}</h3>
        {subtitle && <p className="text-[10px] md:text-sm text-slate-400">{subtitle}</p>}
      </div>
    )}
    {children}
  </div>
));

const StatTile = memo(({ label, value, icon: Icon, colorClass }: { label: string, value: string | number, icon: any, colorClass: string }) => (
  <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-3 md:p-4 flex items-center gap-3 md:gap-4 shadow-lg shadow-black/40">
    <div className={cn("p-2 md:p-3 rounded-lg", colorClass)}>
      <Icon size={18} className="text-slate-50 md:w-5 md:h-5" />
    </div>
    <div>
      <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wider font-medium">{label}</p>
      <p className="text-lg md:text-xl font-bold text-slate-50">{value}</p>
    </div>
  </div>
));

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const subscribeToPush = async (token: string) => {
  if ('serviceWorker' in navigator && 'PushManager' in window && Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const swReg = await navigator.serviceWorker.ready;
        let subscription = await swReg.pushManager.getSubscription();
        if (!subscription) {
          const vapidRes = await fetch('/api/push/vapid-public-key');
          if (!vapidRes.ok) return;
          const vapidData = await vapidRes.json();
          const convertedVapidKey = urlBase64ToUint8Array(vapidData.publicKey);
          
          subscription = await swReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
          });
        }
        
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(subscription)
        });
      }
    } catch(err) {
      console.log('Push subscription failed', err);
    }
  }
};

// --- MAIN APP ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'home' | 'stats' | 'appointments' | 'finance' | 'admin' | 'resetPassword' | 'chat'>('home');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [resetData, setResetData] = useState({ username: '', newPassword: '', confirmPassword: '' });
  const [adminTab, setAdminTab] = useState<'verein' | 'mitglieder' | 'content' | 'termine' | 'kasse'>('verein');
  const [passwordResetMemberId, setPasswordResetMemberId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isPollMode, setIsPollMode] = useState(false);
  const [isMultipleChoice, setIsMultipleChoice] = useState(false);
  const [sendPush, setSendPush] = useState(true);
  const [pollOptions, setPollOptions] = useState<string[]>(['Option 1', 'Option 2']);
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [clubSettings, setClubSettings] = useState<any>({ club_name: 'Kegelverein', logo_url: '/icon-192.png', banner_url: '', primary_color: '#fbbf24', secondary_color: '#10b981' });
  const [dbStatus, setDbStatus] = useState<any>(null);
  
  // Admin Forms States
  const [newsForm, setNewsForm] = useState({ title: '', content: '' });
  const [appointmentForm, setAppointmentForm] = useState({ date: '', time: '19:00', location: '', description: '', recurring: false, repetitions: 1 });
  const [cashForm, setCashForm] = useState({ member_id: '', amount: '', description: '', spende: false });
  const [statsForm, setStatsForm] = useState({ member_id: '', pudel: 0, gewonnen: 0, verloren: 0, abwesend: 0, klingeln: 0 });
  const [memberForm, setMemberForm] = useState({ username: '', password: '', name: '', role: 'member' });

  // Real Data States
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [newsData, setNewsData] = useState<any[]>([]);
  const [appointmentsData, setAppointmentsData] = useState<any[]>([]);
  const [token, setToken] = useState<string | null>(localStorage.getItem('kegel_token'));

  // Deep linking support
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/chat') setView('chat');
    else if (path === '/finance') setView('finance');
    else if (path === '/stats') setView('stats');
    else if (path === '/appointments') setView('appointments');
    else if (path === '/admin') setView('admin');
  }, []);

  const fetchData = useCallback(async (authToken: string) => {
    try {
      const headers = { 'Authorization': `Bearer ${authToken}` };
      
      const [statsRes, newsRes, apptsRes, settingsRes] = await Promise.all([
        fetch('/api/dashboard/stats', { headers }),
        fetch('/api/news', { headers }),
        fetch('/api/appointments', { headers }),
        fetch('/api/settings')
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setDashboardData(data);
        setPayAmount(data.personal?.open_amount || 0);
      }
      if (newsRes.ok) setNewsData(await newsRes.json());
      if (apptsRes.ok) setAppointmentsData(await apptsRes.json());
      if (settingsRes.ok) setClubSettings(await settingsRes.json());
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  }, []);

  useEffect(() => {
    fetch('/api/debug/db-status')
      .then(res => res.json())
      .then(data => setDbStatus(data))
      .catch(err => setDbStatus({ status: 'error', error: err.message }));

    const savedToken = localStorage.getItem('kegel_token');
    if (savedToken) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${savedToken}` }
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Token invalid');
      })
      .then(userData => {
        setUser(userData);
        setToken(savedToken);
        fetchData(savedToken);
      })
      .catch(() => {
        localStorage.removeItem('kegel_token');
        setToken(null);
        setUser(null);
      });
    }
  }, [fetchData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('kegel_token', data.token);
        await fetchData(data.token);
      } else {
        console.error('Login failed:', data);
        alert(`Anmeldung fehlgeschlagen: ${data.error || 'Ungültige Zugangsdaten'}`);
      }
    } catch (err) {
      console.error('Login error:', err);
      alert("Verbindungsfehler zum Server");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('kegel_token');
    setDashboardData(null);
  };

  const handleAttendance = async (appointmentId: number, status: 'attending' | 'absent') => {
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/attendance`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchData(token!);
      }
    } catch (err) {
      console.error('Attendance update failed', err);
    }
  };

  const handleRegisterPasskey = async () => {
    try {
      const res = await fetch('/api/auth/webauthn/register-options', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const options = await res.json();
      
      const attestationResponse = await startRegistration({ optionsJSON: options });
      
      const verifyRes = await fetch('/api/auth/webauthn/register-verify', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(attestationResponse)
      });
      
      const result = await verifyRes.json();
      if (result.success) {
        alert('Passkey erfolgreich registriert!');
      } else {
        alert('Registrierung fehlgeschlagen: ' + result.error);
      }
    } catch (err) {
      console.error('Passkey registration error', err);
      alert('Fehler bei der Passkey-Registrierung');
    }
  };

  const handleLoginWithPasskey = async () => {
    if (!loginData.username) {
      alert('Bitte gib zuerst deinen Benutzernamen ein.');
      return;
    }
    try {
      const res = await fetch(`/api/auth/webauthn/login-options?username=${loginData.username}`);
      const options = await res.json();
      if (options.error) throw new Error(options.error);

      const assertionResponse = await startAuthentication({ optionsJSON: options });
      
      const verifyRes = await fetch('/api/auth/webauthn/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginData.username,
          response: assertionResponse
        })
      });
      
      const result = await verifyRes.json();
      if (result.token) {
        localStorage.setItem('kegel_token', result.token);
        setToken(result.token);
        setUser(result.user);
        fetchData(result.token);
      } else {
        alert('Login fehlgeschlagen: ' + result.error);
      }
    } catch (err) {
      console.error('Passkey login error', err);
      alert('Fehler beim Passkey-Login. Hast du bereits einen Passkey registriert?');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center overflow-hidden">
              {clubSettings.logo_url ? (
                <img src={clubSettings.logo_url} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <Shield size={40} className="text-sky-400" />
              )}
            </div>
            <h1 className="text-3xl font-bold text-slate-50">{clubSettings.club_name || 'KegelApp'}</h1>
            <p className="text-slate-400">Mitglieder-Login</p>
            
            {dbStatus && (
              <div className={cn(
                "mt-4 text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full inline-block",
                dbStatus.status === 'ok' ? "bg-green-400/10 text-green-400" : "bg-red-400/10 text-red-400"
              )}>
                DB Status: {dbStatus.status} {dbStatus.memberCount !== undefined && `(${dbStatus.memberCount} User)`}
                {dbStatus.error && ` - ${dbStatus.error}`}
              </div>
            )}
          </div>

          <Card className="shadow-2xl border-slate-700/50">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Benutzername</label>
                <input 
                  type="text" 
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-50 focus:ring-2 focus:ring-sky-400 outline-none transition-all"
                  value={loginData.username}
                  onChange={e => setLoginData({...loginData, username: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Passwort</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 pr-10 text-slate-50 focus:ring-2 focus:ring-sky-400 outline-none transition-all"
                    value={loginData.password}
                    onChange={e => setLoginData({...loginData, password: e.target.value})}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-sky-500 hover:bg-sky-600 text-slate-50 font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? "Wird geladen..." : "Anmelden"}
                {!loading && <ChevronRight size={20} />}
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-900 px-2 text-slate-400">Oder</span>
                </div>
              </div>

              <button 
                type="button"
                onClick={handleLoginWithPasskey}
                className="w-full bg-slate-800/50 hover:bg-slate-800 text-slate-50 border border-slate-700/50 font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Fingerprint size={20} className="text-sky-600" />
                Login mit Passkey
              </button>
            </form>
            <div className="mt-6 text-center">
              <button 
                onClick={() => setView('resetPassword')}
                className="text-sm text-slate-400 hover:text-sky-600 transition-colors"
              >
                Passwort vergessen?
              </button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-[calc(env(safe-area-inset-bottom)+5rem)] max-w-md mx-auto relative shadow-2xl border-x border-slate-800 overflow-x-hidden">
      {/* Mobile Header */}
      <header className="flex items-center justify-between p-4 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50 shadow-lg shadow-black/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center overflow-hidden bg-slate-900 rounded-xl border border-slate-800">
            {clubSettings.logo_url ? (
              <img src={clubSettings.logo_url} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <Shield size={20} className="text-sky-400" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-50 tracking-tight text-base leading-tight">
              {view === 'home' && `Hallo, ${user.name}!`}
              {view === 'chat' && 'Vereins-Chat'}
              {view === 'stats' && 'Statistiken'}
              {view === 'appointments' && 'Termine'}
              {view === 'finance' && 'Kasse'}
              {view === 'admin' && 'Admin-Zentrale'}
              {(!['chat', 'stats', 'appointments', 'finance', 'home', 'admin'].includes(view)) && (clubSettings.club_name || 'KegelApp')}
            </span>
            {view === 'home' && (
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Aktueller Status</span>
            )}
            {view === 'chat' && (
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Live Austausch</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Bottom Navigation (Mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-950/90 backdrop-blur-lg border-t border-slate-800 px-2 py-2 flex justify-between items-center z-50 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <MobileNavBtn active={view === 'home'} icon={Home} label="Home" onClick={() => setView('home')} />
        <MobileNavBtn active={view === 'chat'} icon={MessageSquare} label="Chat" onClick={() => setView('chat')} />
        <MobileNavBtn active={view === 'stats'} icon={LayoutGrid} label="Statistik" onClick={() => setView('stats')} />
        <MobileNavBtn active={view === 'appointments'} icon={Calendar} label="Termine" onClick={() => setView('appointments')} />
        <MobileNavBtn active={view === 'finance'} icon={Wallet} label="Kasse" onClick={() => setView('finance')} />
        {user.role === 'admin' && (
          <MobileNavBtn active={view === 'admin'} icon={Shield} label="Admin" onClick={() => setView('admin')} />
        )}
      </nav>

      {/* Main Content */}
      <main className="p-4">
        {('Notification' in window && Notification.permission === 'default') && view === 'home' && (
          <div className="mb-4 bg-sky-900/40 border border-sky-500/30 rounded-[20px] p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-50">Benachrichtigungen</p>
              <p className="text-xs text-slate-400">Verpasse keine Termine mehr!</p>
            </div>
            <button 
              onClick={() => subscribeToPush(token!)}
              className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
            >
              Aktivieren
            </button>
          </div>
        )}

        {!dashboardData ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {view === 'home' && (
              <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                <div className="flex flex-col justify-between gap-4">
                  {clubSettings.banner_url && (
                    <div className="w-full h-32 rounded-2xl overflow-hidden shadow-lg mb-4">
                      <img src={clubSettings.banner_url} alt="Vereins-Banner" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Pudel Könige Card */}
                  <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 rounded-[24px] p-4 relative overflow-hidden group cursor-pointer" onClick={() => setView('stats')}>
                    <div className="flex items-center gap-1.5 mb-3">
                      <div className="bg-amber-500/20 p-1 rounded-lg border border-amber-500/20">
                        <Trophy size={12} className="text-amber-400" />
                      </div>
                      <span className="text-amber-400 text-[8px] font-bold uppercase tracking-widest">Pudel König</span>
                    </div>
                    
                    {(() => {
                      const homePudelRanking = [...(dashboardData.ranking || [])].sort((a, b) => Number(b.stats_pudel || 0) - Number(a.stats_pudel || 0));
                      const topPudel = homePudelRanking[0];
                      return (
                        <>
                          {topPudel && (
                            <div className="mb-2">
                              <h3 className="text-lg font-black text-slate-50 leading-tight break-words">{topPudel.name}</h3>
                              <p className="text-amber-400/60 text-[8px] font-bold uppercase tracking-[0.2em] mt-0.5">Platz 1</p>
                            </div>
                          )}
                          
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-mono font-black text-amber-400">{topPudel?.stats_pudel || 0}</span>
                            <span className="text-[8px] font-bold text-amber-400/50 uppercase tracking-widest">Pudel</span>
                          </div>
                        </>
                      );
                    })()}

                    <div className="absolute bottom-4 right-4 text-amber-400 text-[8px] font-bold uppercase tracking-widest flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      Stats <ChevronRight size={10} />
                    </div>
                    <Trophy className="absolute -top-4 -right-4 w-20 h-20 text-amber-400/5 rotate-12 pointer-events-none" />
                    <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-colors" />
                  </div>

                  {/* Kassenstand Card */}
                  <div className="bg-gradient-to-br from-[#064e3b]/40 to-[#064e3b]/10 border border-[#064e3b]/30 rounded-[24px] p-4 relative overflow-hidden group cursor-pointer">
                    <div className="flex items-center gap-1.5 mb-3">
                      <div className="bg-[#10b981]/20 p-1 rounded-lg border border-[#10b981]/20">
                        <Wallet size={12} className="text-[#10b981]" />
                      </div>
                      <span className="text-[#10b981] text-[8px] font-bold uppercase tracking-widest">Kassenstand</span>
                    </div>
                    
                    <div className="mb-2">
                      <h3 className="text-xl font-black text-slate-50 leading-tight">{Number(dashboardData.clubTotal || 0).toFixed(2)} €</h3>
                      <p className="text-[#10b981]/60 text-[8px] font-bold uppercase tracking-[0.2em] mt-0.5">Saldo</p>
                    </div>

                    <Wallet className="absolute -bottom-4 -right-4 w-20 h-20 text-[#10b981]/5 -rotate-12 pointer-events-none" />
                  </div>
                </div>

                {/* Nächster Termin Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                      <div className="text-blue-500">
                        <Calendar size={20} />
                      </div>
                      <h3 className="text-lg font-bold text-slate-50">Nächster Termin</h3>
                    </div>
                    <button onClick={() => setView('appointments')} className="text-blue-500 text-xs font-bold flex items-center gap-1 hover:underline">
                      Alle Termine <ChevronRight size={14} />
                    </button>
                  </div>
                  
                  {appointmentsData[0] ? (
                    <div 
                      onClick={() => setView('appointments')}
                      className="bg-slate-800 border border-slate-700/50 rounded-[32px] p-6 flex items-center justify-between group cursor-pointer hover:bg-slate-800 transition-all shadow-lg shadow-black/40"
                    >
                      <div className="flex items-center gap-6">
                        <div className="bg-blue-600 rounded-2xl p-3 text-center min-w-[75px] shadow-lg shadow-blue-600/20">
                          <span className="block text-[10px] text-blue-100 uppercase font-black tracking-wider">
                            {new Date(appointmentsData[0].date).toLocaleString('de-DE', { month: 'short' }).toUpperCase()}
                          </span>
                          <span className="block text-3xl font-black text-slate-50">
                            {new Date(appointmentsData[0].date).getDate()}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-blue-600 font-bold text-lg leading-tight">
                            {new Date(appointmentsData[0].date).toLocaleDateString('de-DE', { weekday: 'long' })} um {appointmentsData[0].time} Uhr
                          </h4>
                          <div className="flex items-center gap-1.5 text-slate-400 text-sm mt-1.5">
                            <MapPin size={14} />
                            <span>{appointmentsData[0].location || 'Kuckeshof'}</span>
                          </div>
                          <div className="mt-4 inline-flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-700/50">
                            <Users size={14} className="text-blue-600" />
                            <span className="text-xs font-bold text-slate-400">
                              <span className="text-blue-600">{appointmentsData[0].attending_count || 0}</span> Teilnehmer
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="text-blue-900 group-hover:text-blue-700 transition-colors" size={28} />
                    </div>
                  ) : (
                    <div className="bg-slate-800 border border-slate-700/50 rounded-[32px] p-8 text-center shadow-lg shadow-black/40">
                      <p className="text-slate-400 text-sm">Keine Termine geplant.</p>
                    </div>
                  )}
                </div>

                {/* Neuigkeiten Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 px-2">
                    <div className="text-blue-500">
                      <Bell size={20} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-50">Neuigkeiten</h3>
                  </div>
                  
                  {newsData.length > 0 ? (
                    <div className="space-y-4">
                      {newsData.map((news) => (
                        <Card key={news.id} title={news.title} subtitle={new Date(news.created_at).toLocaleDateString('de-DE')}>
                          {news.type === 'poll' ? (
                            <PollComponent news={news} user={user} />
                          ) : (
                            <div className="ql-snow">
                              <div className="ql-container ql-snow" style={{ border: 'none' }}>
                                <div 
                                  className="ql-editor text-slate-300 text-sm"
                                  dangerouslySetInnerHTML={{ __html: news.content }}
                                />
                              </div>
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-800 border border-slate-700/50 rounded-[32px] p-10 text-center shadow-lg shadow-black/40">
                      <p className="text-slate-400 text-sm font-medium">Keine Nachrichten vorhanden.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {view === 'stats' && (
              <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                <div className="flex items-center justify-end">
                  <div className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700/50">
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Saison 2026</span>
                  </div>
                </div>
                
                {/* Compact Pudel König Card with Top 3 */}
                {(() => {
                  const pudelRanking = [...(dashboardData.ranking || [])].sort((a, b) => Number(b.stats_pudel || 0) - Number(a.stats_pudel || 0));
                  const top1 = pudelRanking[0];
                  const hasPudels = top1 && Number(top1.stats_pudel) > 0;
                  const top2 = hasPudels ? pudelRanking[1] : null;
                  const top3 = hasPudels ? pudelRanking[2] : null;

                  return (
                    <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 rounded-3xl p-6 relative overflow-hidden">
                      <div className="flex items-start justify-between relative z-10">
                        <div className="flex items-center gap-5">
                          <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
                            <Trophy size={32} className="text-slate-950" />
                          </div>
                          <div>
                            <p className="text-amber-500 font-bold uppercase tracking-widest text-[10px] mb-1">Aktueller Pudelkönig</p>
                            <h3 className="text-2xl font-black text-slate-50 leading-tight">{hasPudels ? top1.name : 'N/A'}</h3>
                            {hasPudels && (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="bg-amber-500/20 text-amber-500 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/20">
                                  {top1.stats_pudel} Pudel
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Top 2 & 3 in the corner */}
                        <div className="hidden sm:flex flex-col items-end gap-2 text-right">
                          {top2 && Number(top2.stats_pudel) > 0 && (
                            <div className="bg-slate-900 backdrop-blur-sm border border-slate-700/50 rounded-xl p-2 min-w-[120px]">
                              <p className="text-[8px] text-slate-400 uppercase font-bold">Platz 2</p>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-bold text-slate-200 truncate max-w-[80px]">{top2.name}</span>
                                <span className="text-xs font-mono text-amber-500">{top2.stats_pudel}</span>
                              </div>
                            </div>
                          )}
                          {top3 && Number(top3.stats_pudel) > 0 && (
                            <div className="bg-slate-900 backdrop-blur-sm border border-slate-700/50 rounded-xl p-2 min-w-[120px]">
                              <p className="text-[8px] text-slate-400 uppercase font-bold">Platz 3</p>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-bold text-slate-200 truncate max-w-[80px]">{top3.name}</span>
                                <span className="text-xs font-mono text-amber-500">{top3.stats_pudel}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Mobile view for Top 2 & 3 */}
                      {hasPudels && (Number(top2?.stats_pudel) > 0 || Number(top3?.stats_pudel) > 0) && (
                        <div className="flex sm:hidden gap-2 mt-5 relative z-10">
                          {top2 && Number(top2.stats_pudel) > 0 && (
                            <div className="flex-1 bg-slate-900 backdrop-blur-sm border border-slate-700/50 rounded-xl p-2">
                              <p className="text-[8px] text-slate-400 uppercase font-bold">#2 {top2.name}</p>
                              <p className="text-xs font-mono text-amber-500">{top2.stats_pudel} Pudel</p>
                            </div>
                          )}
                          {top3 && Number(top3.stats_pudel) > 0 && (
                            <div className="flex-1 bg-slate-900 backdrop-blur-sm border border-slate-700/50 rounded-xl p-2">
                              <p className="text-[8px] text-slate-400 uppercase font-bold">#3 {top3.name}</p>
                              <p className="text-xs font-mono text-amber-500">{top3.stats_pudel} Pudel</p>
                            </div>
                          )}
                        </div>
                      )}

                      <Trophy className="absolute -bottom-6 -right-6 w-32 h-32 text-amber-500/5 -rotate-12 pointer-events-none" />
                    </div>
                  );
                })()}

                <div className="space-y-4">
                  <div className="flex items-center gap-3 px-2">
                    <div className="text-emerald-500">
                      <Users size={20} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-50">Mitglieder-Ranking</h3>
                  </div>
                  
                  <div className="grid grid-cols-1  gap-4">
                    {(dashboardData.ranking || []).map((member: any, index: number) => (
                      <div key={member.id} className="bg-slate-800 border border-slate-700/50 rounded-3xl p-6 hover:bg-slate-800 transition-all group relative overflow-hidden shadow-lg shadow-black/40">
                        <div className="flex items-start justify-between mb-6">
                          <div className="flex items-center gap-3">
                            <div>
                              <h4 className="text-slate-50 font-bold text-lg leading-tight">{member.name}</h4>
                              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-0.5">{member.role}</p>
                            </div>
                          </div>
                          {index === 0 && member.stats_won > 0 && (
                            <div className="bg-sky-500/10 p-2 rounded-xl border border-sky-200">
                              <Trophy size={20} className="text-sky-600" />
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-900 rounded-2xl p-3 border border-slate-700/50 flex flex-col items-center justify-center text-center">
                            <div className="text-sky-600 mb-1">
                              <AlertCircle size={14} />
                            </div>
                            <p className="text-[9px] text-slate-400 uppercase font-black tracking-wider">Pudel</p>
                            <p className="text-xl font-mono text-slate-50 font-black">{member.stats_pudel}</p>
                          </div>
                          
                          <div className="bg-slate-900 rounded-2xl p-3 border border-slate-700/50 flex flex-col items-center justify-center text-center">
                            <div className="text-blue-600 mb-1">
                              <Bell size={14} />
                            </div>
                            <p className="text-[9px] text-slate-400 uppercase font-black tracking-wider">Klingeln</p>
                            <p className="text-xl font-mono text-slate-50 font-black">{member.stats_klingeln || 0}</p>
                          </div>

                          <div className="bg-slate-900 rounded-2xl p-3 border border-slate-700/50 flex flex-col items-center justify-center text-center">
                            <div className="text-[#10b981] mb-1">
                              <CheckCircle2 size={14} />
                            </div>
                            <p className="text-[9px] text-slate-400 uppercase font-black tracking-wider">Siege</p>
                            <p className="text-xl font-mono text-slate-50 font-black">{member.stats_won}</p>
                          </div>

                          <div className="bg-slate-900 rounded-2xl p-3 border border-slate-700/50 flex flex-col items-center justify-center text-center">
                            <div className="text-red-400 mb-1">
                              <X size={14} />
                            </div>
                            <p className="text-[9px] text-slate-400 uppercase font-black tracking-wider">Verloren</p>
                            <p className="text-xl font-mono text-slate-50 font-black">{member.stats_lost}</p>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-800/50 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar size={12} className="text-slate-400" />
                            <span className="text-slate-400 uppercase text-[9px] font-bold tracking-wider">Abwesend:</span>
                            <span className="text-slate-200 font-mono font-bold text-xs">{member.stats_absent}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Wallet size={12} className="text-emerald-500" />
                            <span className="text-emerald-500 font-mono font-bold text-xs">{member.total_donations?.toFixed(2)}€</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'appointments' && (
              <motion.div key="appointments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  {appointmentsData.map(appt => (
                    <div key={appt.id}>
                      <Card title={appt.location || 'Kegelabend'}>
                        <div className="flex items-center gap-3 md:gap-4">
                          <div className="bg-slate-800 p-2 md:p-3 rounded-lg text-center min-w-[50px] md:min-w-[60px]">
                            <span className="block text-[10px] md:text-xs text-slate-400 uppercase">
                              {new Date(appt.date).toLocaleString('de-DE', { month: 'short' })}
                            </span>
                            <span className="block text-lg md:text-xl font-bold text-sky-600">
                              {new Date(appt.date).getDate()}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="text-slate-50 font-bold text-sm md:text-base">{appt.time} Uhr</p>
                            <p className="text-xs md:text-sm text-slate-400">{appt.description || 'Regulärer Kegelabend'}</p>
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <Users size={14} className="text-blue-600" />
                            <span>{appt.attending_count || 0} Teilnehmer</span>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleAttendance(appt.id, appt.user_status === 'attending' ? 'absent' : 'attending')}
                              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                appt.user_status === 'absent' 
                                  ? 'bg-rose-600 text-slate-50' 
                                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                              }`}
                            >
                              {appt.user_status === 'absent' ? 'Wieder anmelden' : 'Abmelden'}
                            </button>
                          </div>
                        </div>
                      </Card>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {view === 'finance' && (
              <motion.div key="finance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                {/* Gesamt Kassenstand */}
                <Card className="bg-gradient-to-br from-[#064e3b]/40 to-[#064e3b]/10 border-[#064e3b]/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[#10b981] uppercase tracking-widest font-bold mb-1">Gesamt Kassenstand</p>
                      <h3 className="text-3xl font-black text-slate-50">{Number(dashboardData?.clubTotal || 0).toFixed(2)} €</h3>
                    </div>
                    <div className="p-4 bg-[#10b981]/20 rounded-2xl">
                      <Wallet size={32} className="text-[#10b981]" />
                    </div>
                  </div>
                </Card>

                {/* Erspielt & Spenden */}
                <div className="grid grid-cols-2 gap-4">
                  <Card title="Erspielt" subtitle="Alle Mitglieder">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/20 rounded-lg">
                        <Trophy size={20} className="text-blue-400" />
                      </div>
                      <p className="text-xl font-bold text-slate-50">{Number(dashboardData?.clubTotal || 0).toFixed(2)} €</p>
                    </div>
                  </Card>
                  <Card title="Spenden" subtitle="Alle Mitglieder">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#10b981]/20 rounded-lg">
                        <CheckCircle2 size={20} className="text-[#10b981]" />
                      </div>
                      <p className="text-xl font-bold text-slate-50">{Number(dashboardData?.clubTotalDonations || 0).toFixed(2)} €</p>
                    </div>
                  </Card>
                </div>

                {/* PayPal Bezahlung */}
                <Card title="Bezahlen" subtitle="Bequem per PayPal begleichen">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400 uppercase tracking-wider font-bold">Betrag (€)</label>
                      <input 
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-50 text-lg font-bold focus:border-blue-500 outline-none transition-colors"
                        value={payAmount}
                        onChange={(e) => setPayAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      />
                    </div>
                    
                    <a 
                      href={`https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=kegelkasse@web.de&amount=${payAmount}&currency_code=EUR&item_name=Kegelkasse%20Beitrag%20von%20${user?.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-[#0070ba] hover:bg-[#005ea6] text-slate-50 font-black py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-900/20"
                    >
                      <CreditCard size={20} />
                      Jetzt mit PayPal bezahlen
                    </a>
                    
                    <p className="text-[10px] text-slate-400 text-center">
                      Du wirst zu PayPal weitergeleitet, um die Zahlung an <strong>kegelkasse@web.de</strong> abzuschließen.
                    </p>
                  </div>
                </Card>

                {/* Mitglieder Übersicht */}
                <Card title="Mitglieder Übersicht" subtitle="Gesamt Bezahlte Beträge und Spenden">
                  <div className="space-y-3">
                    {[...(dashboardData?.ranking || [])]
                      .sort((a, b) => (a.id === user?.id ? -1 : b.id === user?.id ? 1 : 0))
                      .map((member: any) => (
                      <div 
                        key={member.id} 
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border transition-all",
                          member.id === user?.id 
                            ? "bg-sky-900/30 border-sky-500/50 shadow-[0_0_15px_rgba(14,165,233,0.1)]" 
                            : "bg-slate-900 border-slate-700/50"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-bold",
                            member.id === user?.id ? "text-sky-400" : "text-slate-200"
                          )}>
                            {member.name}
                            {member.id === user?.id && " (Du)"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 md:gap-4">
                          <div className="w-16 md:w-20 text-center">
                            <p className="text-[8px] md:text-[10px] text-slate-400 uppercase font-bold mb-0.5">Spenden</p>
                            <p className="text-xs md:text-sm font-bold text-[#10b981]">{Number(member.total_donations || 0).toFixed(2)} €</p>
                          </div>
                          <div className="w-16 md:w-20 text-center">
                            <p className="text-[8px] md:text-[10px] text-slate-400 uppercase font-bold mb-0.5">Bezahlt</p>
                            <p className="text-xs md:text-sm font-bold text-slate-200">{Number(member.total_paid || 0).toFixed(2)} €</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            )}

            {view === 'chat' && (
              <ChatView user={user} token={token!} />
            )}

            {view === 'admin' && user.role === 'admin' && (
              <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                <div className="flex flex-col justify-between gap-4">
                  <div className="flex bg-slate-800/50 p-1 rounded-lg border border-slate-700/50 overflow-x-auto no-scrollbar min-w-0">
                    <div className="flex min-w-max">
                      <AdminTab active={adminTab === 'verein'} label="Verein" onClick={() => setAdminTab('verein')} />
                      <AdminTab active={adminTab === 'mitglieder'} label="Mitglieder" onClick={() => setAdminTab('mitglieder')} />
                      <AdminTab active={adminTab === 'content'} label="Content" onClick={() => setAdminTab('content')} />
                      <AdminTab active={adminTab === 'termine'} label="Termine" onClick={() => setAdminTab('termine')} />
                      <AdminTab active={adminTab === 'kasse'} label="Stats" onClick={() => setAdminTab('kasse')} />
                    </div>
                  </div>
                </div>
                
                {adminTab === 'verein' && (
                  <div className="grid grid-cols-1 gap-6">
                    <Card title="Vereins-Settings" subtitle="Name, Logo und Banner anpassen">
                      <div className="space-y-4">
                        <AdminInput 
                          label="Vereinsname" 
                          placeholder="z.B. Alle Neune e.V." 
                          value={clubSettings.club_name || ''}
                          onChange={(e: any) => setClubSettings({ ...clubSettings, club_name: e.target.value })}
                        />
                        
                        <div className="space-y-2">
                          <label className="block text-xs text-slate-400">Vereins-Logo (Upload)</label>
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-lg border border-slate-700 flex items-center justify-center overflow-hidden">
                              {clubSettings.logo_url ? (
                                <img src={clubSettings.logo_url} alt="Logo" className="w-full h-full object-contain" />
                              ) : (
                                <Plus size={24} className="text-slate-400" />
                              )}
                            </div>
                            <input 
                              type="file" 
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const formData = new FormData();
                                formData.append('logo', file);
                                try {
                                  const res = await fetch('/api/admin/upload-logo', {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${token}` },
                                    body: formData
                                  });
                                  const data = await res.json();
                                  if (data.success) {
                                    setClubSettings({ ...clubSettings, logo_url: data.url });
                                  }
                                } catch (err) {
                                  console.error('Logo upload failed', err);
                                }
                              }}
                              className="text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-sky-400 file:text-slate-950 hover:file:bg-sky-500 cursor-pointer"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs text-slate-400">Vereins-Banner (Upload)</label>
                          <div className="w-full h-24 bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-center overflow-hidden">
                            {clubSettings.banner_url ? (
                              <img src={clubSettings.banner_url} alt="Banner" className="w-full h-full object-cover" />
                            ) : (
                              <Plus size={24} className="text-slate-400" />
                            )}
                          </div>
                          <input 
                            type="file" 
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const formData = new FormData();
                              formData.append('banner', file);
                              try {
                                const res = await fetch('/api/admin/upload-banner', {
                                  method: 'POST',
                                  headers: { 'Authorization': `Bearer ${token}` },
                                  body: formData
                                });
                                const data = await res.json();
                                if (data.success) {
                                  setClubSettings({ ...clubSettings, banner_url: data.url });
                                }
                              } catch (err) {
                                console.error('Banner upload failed', err);
                              }
                            }}
                            className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-sky-400 file:text-slate-950 hover:file:bg-sky-500 cursor-pointer"
                          />
                        </div>

                        <div className="flex gap-4">
                          <div className="flex-1">
                            <label className="block text-xs text-slate-400 mb-1">Primärfarbe</label>
                            <input 
                              type="color" 
                              className="w-full h-10 bg-slate-900 rounded border border-slate-700" 
                              value={clubSettings.primary_color || '#fbbf24'}
                              onChange={(e) => setClubSettings({ ...clubSettings, primary_color: e.target.value })}
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs text-slate-400 mb-1">Sekundärfarbe</label>
                            <input 
                              type="color" 
                              className="w-full h-10 bg-slate-900 rounded border border-slate-700" 
                              value={clubSettings.secondary_color || '#0f172a'}
                              onChange={(e) => setClubSettings({ ...clubSettings, secondary_color: e.target.value })}
                            />
                          </div>
                        </div>
                        <button 
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/admin/settings', {
                                method: 'PUT',
                                headers: { 
                                  'Authorization': `Bearer ${token}`,
                                  'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(clubSettings)
                              });
                              const data = await res.json();
                              if (data.success) {
                                alert('Einstellungen gespeichert!');
                              }
                            } catch (err) {
                              console.error('Settings update failed', err);
                            }
                          }}
                          className="w-full bg-sky-400 text-slate-950 font-bold py-2 rounded-lg"
                        >
                          Speichern
                        </button>
                      </div>
                    </Card>
                  </div>
                )}

                {adminTab === 'mitglieder' && (
                  <div className="space-y-6">
                    <Card title="Neues Mitglied anlegen">
                      <div className="grid grid-cols-1 gap-4">
                        <AdminInput 
                          label="Name" 
                          placeholder="Vollständiger Name" 
                          value={memberForm.name}
                          onChange={(e: any) => setMemberForm({ ...memberForm, name: e.target.value })}
                        />
                        <AdminInput 
                          label="Benutzername" 
                          placeholder="Login-Name" 
                          value={memberForm.username}
                          onChange={(e: any) => setMemberForm({ ...memberForm, username: e.target.value })}
                        />
                        <AdminInput 
                          label="Passwort" 
                          type="password" 
                          placeholder="Initiales Passwort" 
                          value={memberForm.password}
                          onChange={(e: any) => setMemberForm({ ...memberForm, password: e.target.value })}
                        />
                        <div className="space-y-1">
                          <label className="text-xs text-slate-400 uppercase tracking-wider font-bold">Rolle</label>
                          <select 
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-50"
                            value={memberForm.role}
                            onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
                          >
                            <option value="member">Mitglied</option>
                            <option value="admin">Administrator</option>
                          </select>
                        </div>
                      </div>
                      <button 
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/admin/members', {
                              method: 'POST',
                              headers: { 
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                              },
                              body: JSON.stringify(memberForm)
                            });
                            const data = await res.json();
                            if (data.success) {
                              alert('Mitglied angelegt!');
                              setMemberForm({ username: '', password: '', name: '', role: 'member' });
                              fetchData(token!);
                            } else {
                              alert(data.error || 'Fehler beim Anlegen');
                            }
                          } catch (err) {
                            console.error('Member creation failed', err);
                          }
                        }}
                        className="w-full mt-4 bg-green-600 text-slate-50 font-bold py-2 rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Mitglied speichern
                      </button>
                    </Card>

                    <Card title="Mitgliederverwaltung" subtitle="Rollen und Passwörter verwalten">
                    <div className="space-y-4">
                      {(dashboardData.ranking || []).map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between p-4 bg-slate-900 rounded-xl border border-slate-700/50">
                          <div>
                            <p className="font-bold text-slate-50">{m.name}</p>
                            <p className="text-xs text-slate-400">Benutzername: {m.username}</p>
                            <p className="text-xs text-slate-400">Rolle: {m.role || 'Mitglied'}</p>
                          </div>
                          <div className="flex gap-2">
                            {passwordResetMemberId === m.id ? (
                              <div className="flex flex-col gap-2">
                                <input 
                                  type="password" 
                                  value={newPassword} 
                                  onChange={(e) => setNewPassword(e.target.value)}
                                  className="bg-slate-800 border border-slate-700 rounded p-1 text-sm text-slate-50"
                                  placeholder="Neues Passwort"
                                />
                                <div className="flex gap-2">
                                  <button 
                                    onClick={async () => {
                                      try {
                                        const res = await fetch(`/api/admin/members/${m.id}/password-override`, {
                                          method: 'POST',
                                          headers: { 
                                            'Authorization': `Bearer ${token}`,
                                            'Content-Type': 'application/json'
                                          },
                                          body: JSON.stringify({ newPassword: newPassword })
                                        });
                                        const data = await res.json();
                                        if (data.success) {
                                          alert('Passwort geändert!');
                                          setPasswordResetMemberId(null);
                                          setNewPassword('');
                                        }
                                      } catch (err) {
                                        console.error('Password override failed', err);
                                      }
                                    }}
                                    className="text-xs bg-green-600 px-3 py-1 rounded hover:bg-green-700 text-white"
                                  >
                                    Speichern
                                  </button>
                                  <button 
                                    onClick={() => setPasswordResetMemberId(null)}
                                    className="text-xs bg-slate-700 px-3 py-1 rounded hover:bg-slate-600 text-white"
                                  >
                                    Abbrechen
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button 
                                  onClick={() => setPasswordResetMemberId(m.id)}
                                  className="p-2 text-slate-400 hover:bg-slate-700 rounded-lg transition-colors"
                                  title="Passwort zurücksetzen"
                                >
                                  <Settings size={18} />
                                </button>
                                <button 
                                  onClick={async () => {
                                    const newRole = m.role === 'admin' ? 'member' : 'admin';
                                    try {
                                      const res = await fetch(`/api/admin/members/${m.id}/role`, {
                                        method: 'PUT',
                                        headers: { 
                                          'Authorization': `Bearer ${token}`,
                                          'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({ role: newRole })
                                      });
                                      if (res.ok) fetchData(token!);
                                    } catch (err) {
                                      console.error('Role update failed', err);
                                    }
                                  }}
                                  className={`p-2 ${m.role === 'admin' ? 'text-amber-400' : 'text-slate-400'} hover:bg-slate-700 rounded-lg transition-colors`}
                                  title="Rolle ändern"
                                >
                                  <Shield size={18} />
                                </button>
                                <button 
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`/api/admin/members/${m.id}`, {
                                        method: 'DELETE',
                                        headers: { 'Authorization': `Bearer ${token}` }
                                      });
                                      if (res.ok) fetchData(token!);
                                    } catch (err) {
                                      console.error('Member deletion failed', err);
                                    }
                                  }}
                                  className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                  title="Löschen"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

                {adminTab === 'content' && (
                  <div className="space-y-6">
                    <Card title="Content-Editor" subtitle="News und Umfragen erstellen">
                      <div className="space-y-4">
                        <AdminInput 
                          label="Titel" 
                          placeholder="Titel eingeben..." 
                          value={newsForm.title}
                          onChange={(e: any) => setNewsForm({ ...newsForm, title: e.target.value })}
                        />
                        <div className="text-slate-50">
                          <TiptapEditor 
                            content={newsForm.content}
                            onChange={(val) => setNewsForm({ ...newsForm, content: val })}
                          />
                        </div>
                        
                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-700/50 space-y-4">
                          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded border-slate-700 bg-slate-900 accent-sky-400" 
                              checked={isPollMode}
                              onChange={(e) => setIsPollMode(e.target.checked)}
                            />
                            Als Umfrage markieren (Multiple Choice)
                          </label>
                          {isPollMode && (
                            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer pl-6">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 accent-sky-400" 
                                checked={isMultipleChoice}
                                onChange={(e) => setIsMultipleChoice(e.target.checked)}
                              />
                              Mehrfachauswahl erlauben
                            </label>
                          )}

                          <AnimatePresence>
                            {isPollMode && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="space-y-3 pt-2 border-t border-slate-700 overflow-hidden"
                              >
                                <p className="text-xs font-bold text-sky-600 uppercase tracking-wider">Antwortmöglichkeiten</p>
                                {pollOptions.map((opt, idx) => (
                                  <div key={idx} className="flex gap-2">
                                    <input 
                                      type="text" 
                                      value={opt}
                                      onChange={(e) => {
                                        const newOpts = [...pollOptions];
                                        newOpts[idx] = e.target.value;
                                        setPollOptions(newOpts);
                                      }}
                                      placeholder={`Option ${idx + 1}`}
                                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-50"
                                    />
                                    <button 
                                      onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                                      className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                    >
                                      <X size={18} />
                                    </button>
                                  </div>
                                ))}
                                <button 
                                  onClick={() => setPollOptions([...pollOptions, ''])}
                                  className="w-full py-2 border border-dashed border-slate-700 rounded-lg text-xs text-slate-400 hover:text-slate-50 hover:border-slate-600 transition-all flex items-center justify-center gap-2"
                                >
                                  <Plus size={14} />
                                  Option hinzufügen
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {!editingNewsId && (
                          <div className="flex items-center gap-2 pt-2 pb-4">
                            <input 
                              type="checkbox" 
                              id="sendPushToggle" 
                              checked={sendPush} 
                              onChange={(e) => setSendPush(e.target.checked)}
                              className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500"
                            />
                            <label htmlFor="sendPushToggle" className="text-sm text-slate-300">
                              Push-Benachrichtigung an alle Mitglieder senden
                            </label>
                          </div>
                        )}

                        <button 
                          onClick={async () => {
                            try {
                              const url = editingNewsId ? `/api/admin/news/${editingNewsId}` : '/api/admin/news';
                              const method = editingNewsId ? 'PUT' : 'POST';
                              const res = await fetch(url, {
                                method: method,
                                headers: { 
                                  'Authorization': `Bearer ${token}`,
                                  'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                  ...newsForm,
                                  type: isPollMode ? 'poll' : 'news',
                                  poll_options: isPollMode ? pollOptions : [],
                                  multiple_choice: isPollMode ? isMultipleChoice : false,
                                  send_push: sendPush
                                })
                              });
                              const data = await res.json();
                              if (data.success) {
                                alert(editingNewsId ? 'Inhalt aktualisiert!' : 'Inhalt veröffentlicht!');
                                setNewsForm({ title: '', content: '' });
                                setPollOptions(['Ja', 'Nein']);
                                setIsPollMode(false);
                                setEditingNewsId(null);
                                setSendPush(true);
                                fetchData(token!);
                              }
                            } catch (err) {
                              console.error('News operation failed', err);
                            }
                          }}
                          className="w-full bg-blue-600 text-slate-50 font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          {editingNewsId ? 'Aktualisieren' : 'Veröffentlichen'}
                        </button>
                      </div>
                    </Card>

                    <Card title="Vorhandene Inhalte" subtitle="News und Umfragen verwalten">
                      <div className="space-y-3">
                        {newsData.length === 0 ? (
                          <p className="text-slate-400 text-sm italic">Keine Inhalte vorhanden.</p>
                        ) : (
                          newsData.map((news) => (
                            <div key={news.id} className="flex items-center justify-between p-3 bg-slate-900 rounded-xl border border-slate-700/50">
                              <div>
                                <p className="text-sm font-bold text-slate-50">{news.title}</p>
                                <p className="text-xs text-slate-400">{news.type === 'poll' ? 'Umfrage' : 'News'} • {new Date(news.created_at).toLocaleDateString('de-DE')}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => {
                                    setEditingNewsId(news.id);
                                    setNewsForm({ title: news.title, content: news.content });
                                    setIsPollMode(news.type === 'poll');
                                    setPollOptions(news.poll_options || ['Ja', 'Nein']);
                                    setIsMultipleChoice(news.multiple_choice || false);
                                  }}
                                  className="p-2 text-sky-400 hover:bg-sky-400/10 rounded-lg transition-colors"
                                  title="Bearbeiten"
                                >
                                  <Settings size={18} />
                                </button>
                                <button 
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`/api/admin/news/${news.id}/archive`, {
                                        method: 'PUT',
                                        headers: { 'Authorization': `Bearer ${token}` }
                                      });
                                      if (res.ok) {
                                        fetchData(token!);
                                      }
                                    } catch (err) {
                                      console.error('Archive failed', err);
                                    }
                                  }}
                                  className="p-2 text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors"
                                  title="Archivieren"
                                >
                                  <Shield size={18} />
                                </button>
                                <button 
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`/api/admin/news/${news.id}`, {
                                        method: 'DELETE',
                                        headers: { 'Authorization': `Bearer ${token}` }
                                      });
                                      if (res.ok) {
                                        fetchData(token!);
                                      }
                                    } catch (err) {
                                      console.error('Delete failed', err);
                                    }
                                  }}
                                  className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                  title="Löschen"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  </div>
                )}

                {adminTab === 'termine' && (
                  <Card title="Termin-Manager" subtitle="Einzel- oder Serientermine planen">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4">
                        <AdminInput 
                          label="Datum" 
                          type="date" 
                          value={appointmentForm.date}
                          onChange={(e: any) => setAppointmentForm({ ...appointmentForm, date: e.target.value })}
                        />
                        <AdminInput 
                          label="Uhrzeit" 
                          type="time" 
                          value={appointmentForm.time}
                          onChange={(e: any) => setAppointmentForm({ ...appointmentForm, time: e.target.value })}
                        />
                      </div>
                      <AdminInput 
                        label="Ort" 
                        placeholder="z.B. Kegelhalle Süd" 
                        value={appointmentForm.location}
                        onChange={(e: any) => setAppointmentForm({ ...appointmentForm, location: e.target.value })}
                      />
                      <textarea 
                        placeholder="Beschreibung..." 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-50 h-24" 
                        value={appointmentForm.description}
                        onChange={(e) => setAppointmentForm({ ...appointmentForm, description: e.target.value })}
                      />
                      <div className="p-4 bg-slate-900 rounded-xl border border-slate-700/50 space-y-3">
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-slate-700 bg-slate-900" 
                            checked={appointmentForm.recurring}
                            onChange={(e) => setAppointmentForm({ ...appointmentForm, recurring: e.target.checked })}
                          />
                          Serientermin (alle 4 Wochen)
                        </label>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-slate-400">Wiederholungen (max. 12):</span>
                          <input 
                            type="number" 
                            min={1} 
                            max={12} 
                            className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-50" 
                            value={appointmentForm.repetitions}
                            onChange={(e) => setAppointmentForm({ ...appointmentForm, repetitions: parseInt(e.target.value) })}
                          />
                        </div>
                      </div>
                      <button 
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/admin/appointments', {
                              method: 'POST',
                              headers: { 
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                              },
                              body: JSON.stringify(appointmentForm)
                            });
                            const data = await res.json();
                            if (data.success) {
                              alert('Termin(e) angelegt!');
                              setAppointmentForm({ date: '', time: '19:00', location: '', description: '', recurring: false, repetitions: 1 });
                              fetchData(token!);
                            }
                          } catch (err) {
                            console.error('Appointment creation failed', err);
                          }
                        }}
                        className="w-full bg-sky-400 text-slate-950 font-bold py-3 rounded-lg"
                      >
                        Termin(e) anlegen
                      </button>
                    </div>
                  </Card>
                )}

                {adminTab === 'kasse' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-6">
                      <Card title="Zahlung buchen" subtitle="Mitgliedsbeiträge oder Spenden">
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-xs text-slate-400 uppercase tracking-wider font-bold">Mitglied</label>
                            <select 
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-50"
                              value={cashForm.member_id}
                              onChange={(e) => setCashForm({ ...cashForm, member_id: e.target.value })}
                            >
                              <option value="">Wählen...</option>
                              {(dashboardData.ranking || []).map((m: any) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          </div>
                          <AdminInput 
                            label="Betrag (€)" 
                            type="number" 
                            placeholder="0.00" 
                            value={cashForm.amount}
                            onChange={(e: any) => setCashForm({ ...cashForm, amount: e.target.value })}
                          />
                          <AdminInput 
                            label="Zweck" 
                            placeholder="z.B. Monatsbeitrag" 
                            value={cashForm.description}
                            onChange={(e: any) => setCashForm({ ...cashForm, description: e.target.value })}
                          />
                          <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded border-slate-700/50 bg-slate-900" 
                              checked={cashForm.spende}
                              onChange={(e) => setCashForm({ ...cashForm, spende: e.target.checked })}
                            />
                            Als Spende markieren
                          </label>
                          <button 
                            onClick={async () => {
                              if (!cashForm.member_id || !cashForm.amount) return alert('Bitte alle Felder ausfüllen');
                              try {
                                const res = await fetch('/api/admin/cash', {
                                  method: 'POST',
                                  headers: { 
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                  },
                                  body: JSON.stringify(cashForm)
                                });
                                const data = await res.json();
                                if (data.success) {
                                  alert('Zahlung gebucht!');
                                  setCashForm({ member_id: '', amount: '', description: '', spende: false });
                                  fetchData(token!);
                                }
                              } catch (err) {
                                console.error('Cash booking failed', err);
                              }
                            }}
                            className="w-full bg-emerald-600 text-slate-50 font-bold py-2 rounded-lg"
                          >
                            Buchen
                          </button>
                        </div>
                      </Card>
                      <Card title="Statistik-Korrektur" subtitle="Spielergebnisse anpassen">
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-xs text-slate-400 uppercase tracking-wider font-bold">Mitglied</label>
                            <select 
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-50"
                              value={statsForm.member_id}
                              onChange={(e) => {
                                const m = (dashboardData.ranking || []).find((x: any) => x.id == e.target.value);
                                if (m) {
                                  setStatsForm({
                                    member_id: e.target.value,
                                    pudel: m.stats_pudel || 0,
                                    gewonnen: m.stats_won || 0,
                                    verloren: m.stats_lost || 0,
                                    abwesend: m.stats_absent || 0,
                                    klingeln: m.stats_klingeln || 0
                                  });
                                } else {
                                  setStatsForm({ member_id: '', pudel: 0, gewonnen: 0, verloren: 0, abwesend: 0, klingeln: 0 });
                                }
                              }}
                            >
                              <option value="">Wählen...</option>
                              {(dashboardData.ranking || []).map((m: any) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <AdminInput 
                              label="Pudel" 
                              type="number" 
                              value={statsForm.pudel}
                              onChange={(e: any) => setStatsForm({ ...statsForm, pudel: parseInt(e.target.value) })}
                            />
                            <AdminInput 
                              label="Gewonnen" 
                              type="number" 
                              value={statsForm.gewonnen}
                              onChange={(e: any) => setStatsForm({ ...statsForm, gewonnen: parseInt(e.target.value) })}
                            />
                            <AdminInput 
                              label="Verloren" 
                              type="number" 
                              value={statsForm.verloren}
                              onChange={(e: any) => setStatsForm({ ...statsForm, verloren: parseInt(e.target.value) })}
                            />
                            <AdminInput 
                              label="Abwesend" 
                              type="number" 
                              value={statsForm.abwesend}
                              onChange={(e: any) => setStatsForm({ ...statsForm, abwesend: parseInt(e.target.value) })}
                            />
                            <AdminInput 
                              label="Klingeln" 
                              type="number" 
                              value={statsForm.klingeln}
                              onChange={(e: any) => setStatsForm({ ...statsForm, klingeln: parseInt(e.target.value) })}
                            />
                          </div>
                          <button 
                            onClick={async () => {
                              if (!statsForm.member_id) return alert('Bitte Mitglied wählen');
                              try {
                                const res = await fetch(`/api/admin/members/${statsForm.member_id}/stats`, {
                                  method: 'PUT',
                                  headers: { 
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                  },
                                  body: JSON.stringify(statsForm)
                                });
                                const data = await res.json();
                                if (data.success) {
                                  alert('Statistik aktualisiert!');
                                  fetchData(token!);
                                }
                              } catch (err) {
                                console.error('Stats update failed', err);
                              }
                            }}
                            className="w-full bg-blue-600 text-slate-50 font-bold py-2 rounded-lg"
                          >
                            Aktualisieren
                          </button>
                        </div>
                      </Card>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {view === 'resetPassword' && (
              <motion.div key="resetPassword" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-md mx-auto space-y-6">
                <h2 className="text-2xl font-bold text-slate-50">Passwort zurücksetzen</h2>
                <Card title="Neues Passwort festlegen">
                  <form className="space-y-4" onSubmit={async (e) => {
                    e.preventDefault();
                    if (resetData.newPassword !== resetData.confirmPassword) {
                      alert('Passwörter stimmen nicht überein!');
                      return;
                    }
                    try {
                      const res = await fetch('/api/auth/reset-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          username: resetData.username,
                          newPassword: resetData.newPassword
                        })
                      });
                      const data = await res.json();
                      if (data.success) {
                        alert('Passwort erfolgreich geändert! Bitte logge dich neu ein.');
                        setView('home');
                      } else {
                        alert('Fehler: ' + data.error);
                      }
                    } catch (err) {
                      console.error('Password reset failed', err);
                    }
                  }}>
                    <AdminInput 
                      label="Benutzername" 
                      value={resetData.username}
                      onChange={(e: any) => setResetData({ ...resetData, username: e.target.value })}
                    />
                    <AdminInput 
                      label="Neues Passwort" 
                      type="password"
                      value={resetData.newPassword}
                      onChange={(e: any) => setResetData({ ...resetData, newPassword: e.target.value })}
                    />
                    <AdminInput 
                      label="Passwort bestätigen" 
                      type="password"
                      value={resetData.confirmPassword}
                      onChange={(e: any) => setResetData({ ...resetData, confirmPassword: e.target.value })}
                    />
                    <button className="w-full bg-sky-400 text-slate-950 font-bold py-3 rounded-lg">Passwort ändern</button>
                    <button 
                      type="button"
                      onClick={() => setView('home')}
                      className="w-full text-slate-400 text-sm hover:text-slate-200"
                    >
                      Zurück zum Login
                    </button>
                  </form>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}

const NavBtn = memo(({ active, icon: Icon, label, onClick }: { active: boolean, icon: any, label: string, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200",
      active ? "bg-sky-500 text-slate-50 font-bold" : "text-slate-400 hover:bg-slate-800 hover:text-slate-50"
    )}
  >
    <Icon size={20} />
    <span>{label}</span>
  </button>
));

const MobileNavBtn = memo(({ active, icon: Icon, label, onClick }: { active: boolean, icon: any, label: string, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex flex-col items-center gap-1 transition-all duration-300 flex-1",
      active ? "text-sky-600 scale-110" : "text-slate-400"
    )}
  >
    <Icon size={22} className={cn(active && "drop-shadow-[0_0_8px_rgba(2,132,199,0.2)]")} />
    <span className="text-[10px] font-medium uppercase tracking-tighter">{label}</span>
  </button>
));

const AdminTab = memo(({ active, label, onClick }: { active: boolean, label: string, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={cn(
      "px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-md transition-all whitespace-nowrap",
      active ? "bg-sky-500 text-slate-50" : "text-slate-400 hover:text-slate-50"
    )}
  >
    {label}
  </button>
));

const AdminInput = memo(({ label, ...props }: any) => (
  <div>
    <label className="block text-[10px] md:text-xs text-slate-400 mb-1 uppercase tracking-wider font-medium">{label}</label>
    <input 
      {...props} 
      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-50 focus:ring-1 focus:ring-sky-500 outline-none transition-all" 
    />
  </div>
));
