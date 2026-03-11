import React from 'react'

interface PanelProps {
  title?: string
  children: React.ReactNode
  className?: string
  headerRight?: React.ReactNode
  noPadding?: boolean
}

export function Panel({ title, children, className = '', headerRight, noPadding }: PanelProps) {
  return (
    <div className={`panel ${className}`}>
      {title && (
        <div className="panel-header flex items-center justify-between">
          <h3 className="panel-title">{title}</h3>
          {headerRight}
        </div>
      )}
      <div className={noPadding ? '' : 'p-4'}>{children}</div>
    </div>
  )
}
