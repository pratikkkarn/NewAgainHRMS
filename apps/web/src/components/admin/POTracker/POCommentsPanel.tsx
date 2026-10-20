import React, { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { PurchaseOrder } from '../../../types/domain';
import { useData } from '../../../context/DataContext';
import { getInitials } from '../../../types/roles';
import { Button, Card } from '../../common/UIComponents';
import { EmptyState } from '../../common/StateViews';

const MAX_COMMENT = 1000;

// Discussion thread on a PO (FR7). Anyone who can see the PO can comment.
export const POCommentsPanel: React.FC<{ po: PurchaseOrder }> = ({ po }) => {
  const { addPOComment } = useData();
  const [text, setText] = useState('');
  const comments = [...(po.comments || [])].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    addPOComment(po.id, value.slice(0, MAX_COMMENT));
    setText('');
  };

  const when = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <Card className="space-y-4">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100">
        <MessageSquare className="w-4 h-4 text-indigo-600" /> Comments ({comments.length})
      </h3>

      {comments.length === 0 ? (
        <EmptyState title="No comments yet" message="Use comments for renewal follow-ups, client notes or billing questions." />
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[11px] shrink-0">
                {getInitials(c.userName)}
              </div>
              <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex flex-wrap items-baseline gap-x-2 mb-1">
                  <span className="font-semibold text-slate-900">{c.userName}</span>
                  <span className="text-[10px] text-slate-500">{c.userRole}</span>
                  <span className="text-[10px] text-slate-400 ml-auto">{when(c.createdAt)}</span>
                </div>
                <p className="text-slate-700 whitespace-pre-wrap break-words">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_COMMENT}
          rows={3}
          placeholder="Write a comment…"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
          aria-label="New comment"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-400">
            {text.length}/{MAX_COMMENT}
          </span>
          <Button type="submit" size="sm" variant="primary" icon={<Send className="w-3.5 h-3.5" />} disabled={!text.trim()}>
            Post comment
          </Button>
        </div>
      </form>
    </Card>
  );
};
