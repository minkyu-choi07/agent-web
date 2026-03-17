'use client'

import { Source, Layer } from 'react-map-gl/maplibre'
import {
  useMissionStore,
  AFFILIATION_COLORS,
} from '@/store/missionStore'
import { useMemo } from 'react'

export function RouteLayer() {
  const entities = useMissionStore((s) => s.entities)
  const visible = useMissionStore(
    (s) => s.layerVisibility.routes,
  )

  const geojson = useMemo(() => {
    const features = entities
      .filter(
        (e) => e.type === 'route' && e.visible,
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
          routeType:
            (e.properties.routeType as string) ||
            'advance',
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
      id="routes-source"
      type="geojson"
      data={geojson}
    >
      {/* Route line */}
      <Layer
        id="routes-line"
        type="line"
        layout={{
          'line-cap': 'round',
          'line-join': 'round',
        }}
        paint={{
          'line-color': ['get', 'color'],
          'line-width': 3,
          'line-dasharray': [2, 2],
          'line-opacity': 0.8,
        }}
      />
      {/* Route label */}
      <Layer
        id="routes-label"
        type="symbol"
        layout={{
          'symbol-placement': 'line-center',
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-font': [
            'Open Sans Bold',
            'Arial Unicode MS Bold',
          ],
        }}
        paint={{
          'text-color': ['get', 'color'],
          'text-halo-color': '#0a0c10',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  )
}
