'use client'

import { Source, Layer } from 'react-map-gl/maplibre'
import { useMissionStore } from '@/store/missionStore'
import { useMemo } from 'react'

const THREAT_COLORS: Record<string, string> = {
  low: '#8890a4',
  medium: '#ff6b3d',
  high: '#ff4444',
  critical: '#ff0040',
}

export function ThreatLayer() {
  const entities = useMissionStore((s) => s.entities)
  const visible = useMissionStore(
    (s) => s.layerVisibility.threats,
  )

  const pointThreats = useMemo(() => {
    const features = entities
      .filter(
        (e) =>
          e.type === 'threat' &&
          e.visible &&
          e.geometry.type === 'Point',
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
            THREAT_COLORS[
              (e.properties.threatLevel as string) ||
                'medium'
            ] ||
            '#ff6b3d',
          threatType:
            (e.properties.threatType as string) || '',
          threatLevel:
            (e.properties.threatLevel as string) ||
            'medium',
          radius:
            (e.properties.radius as number) || 500,
        },
      }))
    return {
      type: 'FeatureCollection' as const,
      features,
    }
  }, [entities])

  const polyThreats = useMemo(() => {
    const features = entities
      .filter(
        (e) =>
          e.type === 'threat' &&
          e.visible &&
          e.geometry.type === 'Polygon',
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
            THREAT_COLORS[
              (e.properties.threatLevel as string) ||
                'medium'
            ] ||
            '#ff6b3d',
        },
      }))
    return {
      type: 'FeatureCollection' as const,
      features,
    }
  }, [entities])

  if (!visible) return null

  return (
    <>
      {/* Point threats */}
      <Source
        id="threats-point-source"
        type="geojson"
        data={pointThreats}
      >
        <Layer
          id="threats-point-glow"
          type="circle"
          paint={{
            'circle-radius': 14,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.15,
            'circle-blur': 0.5,
          }}
        />
        <Layer
          id="threats-point-core"
          type="circle"
          paint={{
            'circle-radius': 6,
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 2,
            'circle-stroke-color': ['get', 'color'],
            'circle-opacity': 0.9,
          }}
        />
        <Layer
          id="threats-point-label"
          type="symbol"
          layout={{
            'text-field': ['get', 'name'],
            'text-size': 9,
            'text-offset': [0, 2],
            'text-anchor': 'top',
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

      {/* Polygon threats */}
      <Source
        id="threats-poly-source"
        type="geojson"
        data={polyThreats}
      >
        <Layer
          id="threats-poly-fill"
          type="fill"
          paint={{
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.1,
          }}
        />
        <Layer
          id="threats-poly-border"
          type="line"
          paint={{
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-dasharray': [2, 1],
            'line-opacity': 0.7,
          }}
        />
      </Source>
    </>
  )
}
