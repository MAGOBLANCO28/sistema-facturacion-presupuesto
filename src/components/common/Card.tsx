import React from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  accent?: 'purple' | 'blue' | 'amber' | 'none';
  interactive?: boolean;
}

export default function Card({ children, className = '', onClick, accent = 'none', interactive }: Props) {
  const accentClasses = {
    purple: 'border-purple-500/20 hover:border-purple-500/40 shadow-purple-500/5',
    blue: 'border-blue-500/20 hover:border-blue-500/40 shadow-blue-500/5',
    amber: 'border-amber-500/20 hover:border-amber-500/40 shadow-amber-500/5',
    none: 'border-white/10 hover:border-white/20'
  };

  return (
    <div 
      onClick={onClick}
      className={`
        glass rounded-[2rem] overflow-hidden transition-all duration-500 shadow-2xl
        ${accentClasses[accent]}
        ${interactive ? 'hover:scale-[1.02] cursor-pointer active:scale-95' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
