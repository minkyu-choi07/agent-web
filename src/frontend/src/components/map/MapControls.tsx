'use client'

import { useMissionStore } from '@/store/missionStore'

export function MapControls() {
  const viewport = useMissionStore(
    (s) => s.viewport,
  )

  return (
    <div
      className="absolute bottom-8 left-3 flex items-center gap-3 px-2.5 py-1 bg-hud-surface/90 border border-hud-border"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span className="text-[10px] text-hud-text-dim tracking-wide">
        {viewport.latitude.toFixed(4)}
        {'\u00B0N'}{' '}
        {viewport.longitude.toFixed(4)}
        {'\u00B0E'}
      </span>
      <span className="w-px h-3 bg-hud-border-accent" />
      <span className="text-[10px] text-hud-text-dim tracking-wide">
        Z{viewport.zoom.toFixed(1)}
      </span>
      {viewport.bearing !== 0 && (
        <>
          <span className="w-px h-3 bg-hud-border-accent" />
          <span className="text-[10px] text-hud-text-dim tracking-wide">
            BRG {viewport.bearing.toFixed(0)}
            {'\u00B0'}
          </span>
        </>
      )}
    </div>
  )
}
