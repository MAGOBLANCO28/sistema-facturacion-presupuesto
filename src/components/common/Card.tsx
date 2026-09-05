import React from 'react';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  accent?: 'purple' | 'blue' | 'amber' | 'none';
  interactive?: boolean;
  key?: React.Key;
}

export default function Card({ children, className = '', onClick, accent = 'none', interactive, ...rest }: Props) {
  const accentClasses = {
    purple: 'border-purple-500/30 hover:border-purple-500/50',
    blue: 'border-blue-500/30 hover:border-blue-500/50',
    amber: 'border-amber-500/30 hover:border-amber-500/50',
    none: 'border-white/15 hover:border-white/25',
  };

  return (
    <div
      onClick={onClick}
      className={`
        bg-slate-800/50 rounded-[2rem] border overflow-hidden
        ${accentClasses[accent]}
        ${interactive ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl transition-all duration-300' : ''}
        ${className}
      `}
      {...rest}
    >
      {children}
    </div>
  );
}
