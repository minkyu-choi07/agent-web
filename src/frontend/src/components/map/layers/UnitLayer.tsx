'use client'

import { Source, Layer } from 'react-map-gl/maplibre'
import {
  useMissionStore,
  AFFILIATION_COLORS,
} from '@/store/missionStore'
import { useMemo } from 'react'

export function UnitLayer() {
  const entities = useMissionStore((s) => s.entities)
  const visible = useMissionStore(
    (s) => s.layerVisibility.units,
  )

  const geojson = useMemo(() => {
    const features = entities
      .filter(
        (e) => e.type === 'unit' && e.visible,
      )
      .map((e) => ({
        type: 'Feature' as const,
        id: e.id,
        geometry: e.geometry,
        properties: {
          id: e.id,
          name: e.name,
          affiliation: e.affiliation,
          color:
            e.color ||
            AFFILIATION_COLORS[e.affiliation],
          designation:
            (e.properties.designation as string) ||
            e.name,
          unitType:
            (e.properties.unitType as string) || '',
          echelon:
            (e.properties.echelon as string) || '',
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
      id="units-source"
      type="geojson"
      data={geojson}
    >
      {/* Unit marker (square) */}
      <Layer
        id="units-marker"
        type="circle"
        paint={{
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': [
            'get',
            'color',
          ],
          'circle-opacity': 0.85,
        }}
      />
      {/* Unit label */}
      <Layer
        id="units-label"
        type="symbol"
        layout={{
          'text-field': ['get', 'designation'],
          'text-size': 10,
          'text-offset': [0, 1.8],
          'text-anchor': 'top',
          'text-allow-overlap': false,
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
