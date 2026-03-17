'use client'

import { Source, Layer } from 'react-map-gl/maplibre'
import {
  useMissionStore,
  AFFILIATION_COLORS,
} from '@/store/missionStore'
import { useMemo } from 'react'

export function ZoneLayer() {
  const entities = useMissionStore((s) => s.entities)
  const visible = useMissionStore(
    (s) => s.layerVisibility.zones,
  )

  const geojson = useMemo(() => {
    const features = entities
      .filter(
        (e) => e.type === 'zone' && e.visible,
      )
      .map((e) => ({
        type: 'Feature' as const,
        id: e.id,
        geometry: e.geometry,
        properties: {
          id: e.id,
          name: e.name,
          color:
            e.color ||
            AFFILIATION_COLORS[e.affiliation],
          zoneType:
            (e.properties.zoneType as string) || 'ao',
        },
      }))
    return {
      type: 'FeatureCollection' as const,
      features,
    }
  }, [entities])

  if (!visible) return null

  return (
    <Source
      id="zones-source"
      type="geojson"
      data={geojson}
    >
      {/* Zone fill */}
      <Layer
        id="zones-fill"
        type="fill"
        paint={{
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.12,
        }}
      />
      {/* Zone border */}
      <Layer
        id="zones-border"
        type="line"
        paint={{
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-opacity': 0.6,
          'line-dasharray': [4, 2],
        }}
      />
      {/* Zone label */}
      <Layer
        id="zones-label"
        type="symbol"
        layout={{
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-font': [
            'Open Sans Bold',
            'Arial Unicode MS Bold',
          ],
        }}
        paint={{
          'text-color': ['get', 'color'],
          'text-halo-color': '#0a0c10',
          'text-halo-width': 1.5,
          'text-opacity': 0.7,
        }}
      />
    </Source>
  )
}
