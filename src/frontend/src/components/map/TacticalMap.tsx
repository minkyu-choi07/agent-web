'use client'

import { useCallback } from 'react'
import MapGL, {
  NavigationControl,
  type ViewStateChangeEvent,
  type MapLayerMouseEvent,
} from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMissionStore } from '@/store/missionStore'
import { UnitLayer } from './layers/UnitLayer'
import { RouteLayer } from './layers/RouteLayer'
import { ZoneLayer } from './layers/ZoneLayer'
import { ThreatLayer } from './layers/ThreatLayer'

const DARK_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const CLICKABLE_LAYERS = [
  'units-marker',
  'threats-point-core',
  'zones-fill',
  'routes-line',
]

export function TacticalMap() {
  const viewport = useMissionStore(
    (s) => s.viewport,
  )
  const setViewport = useMissionStore(
    (s) => s.setViewport,
  )
  const selectEntity = useMissionStore(
    (s) => s.selectEntity,
  )

  const onMove = useCallback(
    (evt: ViewStateChangeEvent) => {
      setViewport({
        longitude: evt.viewState.longitude,
        latitude: evt.viewState.latitude,
        zoom: evt.viewState.zoom,
        bearing: evt.viewState.bearing,
        pitch: evt.viewState.pitch,
      })
    },
    [setViewport],
  )

  const onClick = useCallback(
    (evt: MapLayerMouseEvent) => {
      const feature = evt.features?.[0]
      if (feature?.properties?.id) {
        selectEntity(
          feature.properties.id as string,
        )
      } else {
        selectEntity(null)
      }
    },
    [selectEntity],
  )

  return (
    <MapGL
      {...viewport}
      onMove={onMove}
      onClick={onClick}
      interactiveLayerIds={CLICKABLE_LAYERS}
      mapStyle={DARK_STYLE}
      style={{ width: '100%', height: '100%' }}
      attributionControl={false}
    >
      <NavigationControl
        position="bottom-right"
        showCompass
        showZoom
      />
      <ZoneLayer />
      <RouteLayer />
      <ThreatLayer />
      <UnitLayer />
    </MapGL>
  )
}
