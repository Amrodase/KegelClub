import React, { useState, useEffect } from 'react';

const PollComponent = ({ news, user }: { news: any, user: any }) => {
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  
  // Real votes from the backend
  const votes = news.votes || [];
  const totalVotes = votes.length;
  
  // Find current user's vote
  const currentUserVote = votes.find((v: any) => v.member_id === user?.id);
  const [hasVoted, setHasVoted] = useState(!!currentUserVote);

  useEffect(() => {
    if (currentUserVote && currentUserVote.options) {
      setSelectedOptions(currentUserVote.options);
      setHasVoted(true);
    } else {
      setSelectedOptions([]);
      setHasVoted(false);
    }
  }, [currentUserVote, news.id]);

  const handleVote = async () => {
    if (selectedOptions.length === 0) return;
    
    try {
      const res = await fetch(`/api/news/${news.id}/vote`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('kegel_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ options: selectedOptions })
      });
      if (res.ok) {
        setHasVoted(true);
        window.location.reload(); // Reload to get fresh votes
      } else {
        alert('Fehler bei der Stimmabgabe');
      }
    } catch (err) {
      console.error('Error voting', err);
    }
  };

  const handleEndPoll = async () => {
    if (!confirm('Umfrage wirklich beenden?')) return;
    try {
      const res = await fetch(`/api/admin/news/${news.id}/archive`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('kegel_token')}` }
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (err) {
      console.error('Archive failed', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-slate-300 text-sm p-4 bg-slate-950/50 rounded-lg border border-slate-800" dangerouslySetInnerHTML={{ __html: news.content }} />
      
      {user?.role === 'admin' && (
        <button 
          onClick={handleEndPoll}
          className="w-full text-xs text-red-400 hover:bg-red-400/10 hover:text-red-300 border border-red-900/50 rounded-lg py-2 mt-2 transition-colors"
        >
          Umfrage beenden
        </button>
      )}
      
      {hasVoted ? (
        <div className="space-y-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
          {news.poll_options.map((option: string, idx: number) => {
            // Count how many voters selected this option
            const voteCount = votes.filter((v: any) => v.options.includes(option)).length;
            const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
            const isMyVote = selectedOptions.includes(option);
            
            return (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span className={`font-medium ${isMyVote ? 'text-amber-400' : ''}`}>{option} {isMyVote && '(Du)'}</span>
                  <span className="font-bold text-sky-400">{voteCount} Stimmen ({percentage.toFixed(0)}%)</span>
                </div>
                <div 
                  className="w-full bg-slate-900 rounded-full h-3 border border-slate-700 overflow-hidden"
                >
                  <div 
                    className={`${isMyVote ? 'bg-amber-500' : 'bg-sky-500/70'} h-full rounded-full transition-all duration-1000 ease-out`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-xs text-slate-400 text-center pt-2">Gesamtteilnehmer: {totalVotes}</p>
          <button 
            onClick={() => setHasVoted(false)}
            className="w-full text-xs text-sky-400 hover:text-sky-300 underline mt-2"
          >
            Stimme ändern
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-400 mb-2">{news.multiple_choice ? 'Mehrfachauswahl möglich' : 'Eine Option auswählen'}</p>
          {news.poll_options.map((option: string, idx: number) => (
            <div
              key={idx}
              onClick={() => {
                if (news.multiple_choice) {
                  setSelectedOptions(prev => prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]);
                } else {
                  setSelectedOptions([option]);
                }
              }}
              className={`relative w-full rounded-full h-10 border cursor-pointer overflow-hidden transition-all ${
                selectedOptions.includes(option) 
                  ? 'border-sky-500 bg-sky-600/50' 
                  : 'bg-slate-900 border-slate-700 hover:border-slate-500'
              }`}
            >
              <div className="absolute inset-0 flex items-center px-4 text-sm text-slate-50 z-10 font-medium">
                {option}
              </div>
            </div>
          ))}
          <button 
            onClick={handleVote} 
            disabled={selectedOptions.length === 0}
            className="w-full bg-sky-600 text-white font-bold py-3 rounded-xl mt-4 hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Abstimmen
          </button>
        </div>
      )}
    </div>
  );
};

export default PollComponent;
