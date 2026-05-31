import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import * as THREE from 'three';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { DrinkCountry } from '../data/schema';

export type MapDrinkCountry = Pick<DrinkCountry, 'mapId' | 'iso2' | 'name' | 'region' | 'drink' | 'description' | 'drinkType' | 'madeOf'> & {
  image: Pick<DrinkCountry['image'], 'localPath'>;
};

interface Props {
  countries: MapDrinkCountry[];
}

type Coordinate = [number, number];
type LinearRing = Coordinate[];
type PolygonCoordinates = LinearRing[];
type MultiPolygonCoordinates = PolygonCoordinates[];

interface GeoFeature {
  id?: string | number;
  properties: { name?: string };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: PolygonCoordinates | MultiPolygonCoordinates;
  };
}

interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

interface WorldTopology {
  objects: {
    countries: unknown;
  };
}

const geoUrl = '/maps/countries-110m.json';
const textureWidth = 2048;
const textureHeight = 1024;
const textureProjection = geoEquirectangular()
  .scale(textureWidth / (2 * Math.PI))
  .translate([textureWidth / 2, textureHeight / 2])
  .precision(0.1);

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getGeoMapId(id: unknown, name: string) {
  if (id === undefined || id === null) return `name:${slugify(name)}`;
  return String(id).padStart(3, '0');
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function lonToX(longitude: number) {
  return ((longitude + 180) / 360) * textureWidth;
}

function latToY(latitude: number) {
  return ((90 - latitude) / 180) * textureHeight;
}

function drawFeaturePath(context: CanvasRenderingContext2D, item: GeoFeature) {
  const path = geoPath(textureProjection, context);
  context.beginPath();
  path(item as never);
}

function drawWorldTexture(context: CanvasRenderingContext2D, features: GeoFeature[], countryById: Map<string, MapDrinkCountry>, selectedId: string, hoverId?: string) {
  const ocean = context.createLinearGradient(0, 0, 0, textureHeight);
  ocean.addColorStop(0, '#d7ece8');
  ocean.addColorStop(0.5, '#9ec6c2');
  ocean.addColorStop(1, '#d9ebe4');
  context.fillStyle = ocean;
  context.fillRect(0, 0, textureWidth, textureHeight);

  context.save();
  context.strokeStyle = 'rgba(255, 250, 240, 0.28)';
  context.lineWidth = 1;
  for (let longitude = -150; longitude <= 150; longitude += 30) {
    context.beginPath();
    context.moveTo(lonToX(longitude), 0);
    context.lineTo(lonToX(longitude), textureHeight);
    context.stroke();
  }
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    context.beginPath();
    context.moveTo(0, latToY(latitude));
    context.lineTo(textureWidth, latToY(latitude));
    context.stroke();
  }
  context.restore();

  for (const pass of ['base', 'hover', 'selected'] as const) {
    for (const item of features) {
      const mapId = getGeoMapId(item.id, item.properties.name ?? 'Unknown country');
      const country = countryById.get(mapId);
      const isSelected = mapId === selectedId;
      const isHovered = mapId === hoverId && !isSelected;
      if (pass === 'hover' && !isHovered) continue;
      if (pass === 'selected' && !isSelected) continue;

      drawFeaturePath(context, item);

      context.fillStyle = isSelected ? '#b85c38' : isHovered ? '#d8a23a' : country ? '#5f9b76' : 'rgba(20, 52, 43, 0.2)';
      context.strokeStyle = isSelected || isHovered ? '#fffaf0' : 'rgba(255, 250, 240, 0.7)';
      context.lineWidth = isSelected ? 2.8 : isHovered ? 2.25 : 1.15;
      context.fill('evenodd');
      context.stroke();
    }
  }
}

function colorKey(red: number, green: number, blue: number) {
  return (red << 16) | (green << 8) | blue;
}

function drawHitTexture(context: CanvasRenderingContext2D, features: GeoFeature[], countryById: Map<string, MapDrinkCountry>) {
  const colorToMapId = new Map<number, string>();
  context.clearRect(0, 0, textureWidth, textureHeight);
  context.fillStyle = '#000';
  context.fillRect(0, 0, textureWidth, textureHeight);

  let colorIndex = 1;
  for (const item of features) {
    const mapId = getGeoMapId(item.id, item.properties.name ?? 'Unknown country');
    if (!countryById.has(mapId)) continue;

    const red = (colorIndex >> 16) & 255;
    const green = (colorIndex >> 8) & 255;
    const blue = colorIndex & 255;
    colorToMapId.set(colorKey(red, green, blue), mapId);

    drawFeaturePath(context, item);
    context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    context.fill('evenodd');
    colorIndex += 1;
  }

  return colorToMapId;
}

function normalizeLongitude(longitude: number, reference: number) {
  let value = longitude;
  while (value - reference > 180) value -= 360;
  while (value - reference < -180) value += 360;
  return value;
}

function pointInRing(longitude: number, latitude: number, ring: LinearRing) {
  let inside = false;

  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index++) {
    const [rawXi, yi] = ring[index];
    const [rawXj, yj] = ring[previousIndex];
    const xi = normalizeLongitude(rawXi, longitude);
    const xj = normalizeLongitude(rawXj, longitude);
    const intersects = yi > latitude !== yj > latitude && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(longitude: number, latitude: number, polygon: PolygonCoordinates) {
  if (!polygon[0] || !pointInRing(longitude, latitude, polygon[0])) return false;
  return !polygon.slice(1).some((ring) => pointInRing(longitude, latitude, ring));
}

function featureContainsPoint(featureItem: GeoFeature, longitude: number, latitude: number) {
  if (featureItem.geometry.type === 'Polygon') {
    return pointInPolygon(longitude, latitude, featureItem.geometry.coordinates as PolygonCoordinates);
  }

  return (featureItem.geometry.coordinates as MultiPolygonCoordinates).some((polygon) => pointInPolygon(longitude, latitude, polygon));
}

function findCountryAt(features: GeoFeature[], countryById: Map<string, MapDrinkCountry>, longitude: number, latitude: number) {
  for (const item of features) {
    if (!featureContainsPoint(item, longitude, latitude)) continue;
    const mapId = getGeoMapId(item.id, item.properties.name ?? 'Unknown country');
    if (countryById.has(mapId)) return mapId;
  }

  return undefined;
}

function DrinkImage({ country }: { country: MapDrinkCountry }) {
  if (country.image.localPath) {
    const imageClassName = country.image.localPath.endsWith('.svg') ? 'drink-image is-art' : 'drink-image';
    return <img className={imageClassName} src={country.image.localPath} alt={`${country.drink} from ${country.name}`} loading="eager" />;
  }

  return (
    <div className="image-placeholder" role="img" aria-label={`${country.drink} illustration`}>
      <div>
        <strong>{country.drink}</strong>
        <span>A featured drink from {country.name}.</span>
      </div>
    </div>
  );
}

function FlagImage({ country, compact = false }: { country: MapDrinkCountry; compact?: boolean }) {
  const flagCode = country.iso2.toLowerCase();

  return (
    <img
      key={country.iso2}
      className={compact ? 'flag-image is-compact' : 'flag-image'}
      src={`/flags/${flagCode}.png`}
      alt={`${country.name} flag`}
      loading={compact ? 'lazy' : 'eager'}
      decoding="async"
    />
  );
}

function DrinkCard({ country, panelRef }: { country: MapDrinkCountry; panelRef?: React.RefObject<HTMLElement | null> }) {
  return (
    <aside ref={panelRef} className="detail-panel" aria-live="polite">
      <div className="drink-image-wrap"><DrinkImage country={country} /></div>
      <div className="detail-body">
        <div className="country-kicker">
          <FlagImage country={country} />
          <span>{country.name} · {country.region}</span>
        </div>
        <h2 className="drink-title">{country.drink}</h2>
        <p className="description">{country.description}</p>
        <p className="made-of">{country.madeOf}</p>
      </div>
    </aside>
  );
}

function GlobeCanvas({ countryById, selectedId, onSelect }: { countryById: Map<string, MapDrinkCountry>; selectedId: string; onSelect: (id: string, source?: 'globe-tap') => void }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const featuresRef = useRef<GeoFeature[]>([]);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const selectedIdRef = useRef(selectedId);
  const hoverIdRef = useRef<string | undefined>(undefined);
  const onSelectRef = useRef(onSelect);
  const countryByIdRef = useRef(countryById);
  const pickingRef = useRef<{
    scene: THREE.Scene;
    group: THREE.Group;
    globe: THREE.Mesh;
    texture: THREE.CanvasTexture;
    material: THREE.MeshBasicMaterial;
    renderTarget: THREE.WebGLRenderTarget;
    pixel: Uint8Array;
    colorToMapId: Map<number, string>;
  } | null>(null);

  const redrawTexture = () => {
    const texture = textureRef.current;
    if (!texture) return;
    const context = texture.image.getContext('2d') as CanvasRenderingContext2D | null;
    if (!context) return;
    drawWorldTexture(context, featuresRef.current, countryByIdRef.current, selectedIdRef.current, hoverIdRef.current);
    texture.needsUpdate = true;
  };

  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (canvasRef.current) canvasRef.current.dataset.selectedId = selectedId;
    redrawTexture();
  }, [selectedId]);

  useEffect(() => {
    onSelectRef.current = onSelect;
    countryByIdRef.current = countryById;
  }, [countryById, onSelect]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let isDisposed = false;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 3.15);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'globe-canvas';
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D world globe');
    renderer.domElement.dataset.selectedId = selectedIdRef.current;
    canvasRef.current = renderer.domElement;
    mount.appendChild(renderer.domElement);

    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = textureWidth;
    textureCanvas.height = textureHeight;
    const textureContext = textureCanvas.getContext('2d');
    if (textureContext) drawWorldTexture(textureContext, [], countryByIdRef.current, selectedIdRef.current, hoverIdRef.current);

    const hitCanvas = document.createElement('canvas');
    hitCanvas.width = textureWidth;
    hitCanvas.height = textureHeight;
    const hitContext = hitCanvas.getContext('2d', { willReadFrequently: true });

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textureRef.current = texture;

    const group = new THREE.Group();
    group.rotation.set(-0.22, -0.45, 0);
    scene.add(group);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 64),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.78, metalness: 0.02 })
    );
    group.add(globe);

    const hitTexture = new THREE.CanvasTexture(hitCanvas);
    hitTexture.magFilter = THREE.NearestFilter;
    hitTexture.minFilter = THREE.NearestFilter;
    hitTexture.generateMipmaps = false;
    const pickingScene = new THREE.Scene();
    const pickingGroup = new THREE.Group();
    const pickingMaterial = new THREE.MeshBasicMaterial({ map: hitTexture, toneMapped: false });
    const pickingGlobe = new THREE.Mesh(globe.geometry, pickingMaterial);
    const pickingRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true,
      stencilBuffer: false
    });
    pickingRenderTarget.texture.magFilter = THREE.NearestFilter;
    pickingRenderTarget.texture.minFilter = THREE.NearestFilter;
    pickingGroup.add(pickingGlobe);
    pickingScene.add(pickingGroup);
    pickingRef.current = {
      scene: pickingScene,
      group: pickingGroup,
      globe: pickingGlobe,
      texture: hitTexture,
      material: pickingMaterial,
      renderTarget: pickingRenderTarget,
      pixel: new Uint8Array(4),
      colorToMapId: new Map()
    };

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 128, 64),
      new THREE.MeshBasicMaterial({ color: '#dff4ee', transparent: true, opacity: 0.22, side: THREE.BackSide })
    );
    group.add(atmosphere);

    scene.add(new THREE.AmbientLight('#f7fff9', 1.1));
    const sunlight = new THREE.DirectionalLight('#fff2d6', 2.7);
    sunlight.position.set(2.6, 1.8, 3.5);
    scene.add(sunlight);
    const fill = new THREE.DirectionalLight('#7fb2c6', 1.1);
    fill.position.set(-3.5, -1.2, 2.2);
    scene.add(fill);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const activePointers = new Map<number, { x: number; y: number }>();
    const drag = { pointerId: -1, active: false, moved: false, x: 0, y: 0 };
    const pinch = { active: false, moved: false, distance: 0, cameraZ: camera.position.z };

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(320, rect.width);
      const height = Math.max(320, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const pickCountry = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return undefined;

      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.intersectObject(globe).length === 0) return undefined;

      const picking = pickingRef.current;
      if (!picking) return undefined;
      picking.group.rotation.copy(group.rotation);

      const bufferSize = new THREE.Vector2();
      renderer.getDrawingBufferSize(bufferSize);
      const pixelX = THREE.MathUtils.clamp(Math.floor(((clientX - rect.left) / rect.width) * bufferSize.x), 0, bufferSize.x - 1);
      const pixelY = THREE.MathUtils.clamp(Math.floor(((clientY - rect.top) / rect.height) * bufferSize.y), 0, bufferSize.y - 1);
      const previousRenderTarget = renderer.getRenderTarget();

      camera.setViewOffset(bufferSize.x, bufferSize.y, pixelX, pixelY, 1, 1);
      renderer.setRenderTarget(picking.renderTarget);
      renderer.clear();
      renderer.render(picking.scene, camera);
      camera.clearViewOffset();
      renderer.readRenderTargetPixels(picking.renderTarget, 0, 0, 1, 1, picking.pixel);
      renderer.setRenderTarget(previousRenderTarget);

      const [red, green, blue, alpha] = picking.pixel;
      if (alpha === 0) return undefined;
      return picking.colorToMapId.get(colorKey(red, green, blue));
    };

    const setHover = (mapId: string | undefined) => {
      if (hoverIdRef.current === mapId) return;
      hoverIdRef.current = mapId;
      renderer.domElement.dataset.hoverId = mapId ?? '';
      renderer.domElement.style.cursor = mapId ? 'pointer' : 'grab';
      redrawTexture();
    };

    const selectAt = (clientX: number, clientY: number) => {
      const mapId = pickCountry(clientX, clientY);
      if (mapId) onSelectRef.current(mapId, 'globe-tap');
    };

    const getPointerDistance = () => {
      const points = [...activePointers.values()];
      if (points.length < 2) return 0;
      return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };

    const updatePinch = () => {
      const distance = getPointerDistance();
      if (distance <= 0) return;
      if (!pinch.active) {
        pinch.active = true;
        pinch.moved = false;
        pinch.distance = distance;
        pinch.cameraZ = camera.position.z;
        drag.active = false;
        return;
      }

      if (Math.abs(distance - pinch.distance) > 4) pinch.moved = true;
      camera.position.z = THREE.MathUtils.clamp((pinch.cameraZ * pinch.distance) / distance, 2.05, 4.5);
    };

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // Some browsers and synthetic test events do not expose an active capturable pointer.
      }
      setHover(undefined);

      if (activePointers.size >= 2) {
        updatePinch();
        return;
      }

      pinch.active = false;
      pinch.moved = false;
      drag.pointerId = event.pointerId;
      drag.active = true;
      drag.moved = false;
      drag.x = event.clientX;
      drag.y = event.clientY;
      renderer.domElement.style.cursor = 'grabbing';
    };

    const onPointerMove = (event: PointerEvent) => {
      if (activePointers.has(event.pointerId)) {
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (activePointers.size >= 2) {
        event.preventDefault();
        updatePinch();
        return;
      }

      if (drag.active && event.pointerId === drag.pointerId) {
        event.preventDefault();
        const deltaX = event.clientX - drag.x;
        const deltaY = event.clientY - drag.y;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 3) drag.moved = true;
        group.rotation.y += deltaX * 0.006;
        group.rotation.x = THREE.MathUtils.clamp(group.rotation.x + deltaY * 0.006, -1.12, 1.12);
        drag.x = event.clientX;
        drag.y = event.clientY;
        return;
      }

      setHover(pickCountry(event.clientX, event.clientY));
    };

    const onPointerUp = (event: PointerEvent) => {
      const wasPinching = pinch.active || activePointers.size > 1;
      const shouldSelect = !wasPinching && event.pointerId === drag.pointerId && !drag.moved;
      activePointers.delete(event.pointerId);
      drag.active = false;
      try {
        if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore browsers that reject capture bookkeeping for non-captured pointers.
      }

      if (activePointers.size >= 2) {
        updatePinch();
      } else if (activePointers.size === 1) {
        const [nextPointerId, nextPointer] = [...activePointers.entries()][0];
        pinch.active = false;
        drag.pointerId = nextPointerId;
        drag.active = true;
        drag.moved = true;
        drag.x = nextPointer.x;
        drag.y = nextPointer.y;
      } else {
        pinch.active = false;
        renderer.domElement.style.cursor = 'grab';
      }

      renderer.domElement.style.cursor = 'grab';
      if (shouldSelect) selectAt(event.clientX, event.clientY);
    };

    const onPointerLeave = () => {
      activePointers.clear();
      drag.active = false;
      pinch.active = false;
      setHover(undefined);
      renderer.domElement.style.cursor = 'grab';
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.0015, 2.35, 4.2);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const animate = () => {
      if (isDisposed) return;
      renderer.domElement.dataset.cameraZ = camera.position.z.toFixed(3);
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    fetch(geoUrl)
      .then((response) => response.json())
      .then((topology: WorldTopology) => {
        if (isDisposed) return;
        const collection = feature(topology, topology.objects.countries) as GeoCollection;
        featuresRef.current = collection.features;
        const picking = pickingRef.current;
        if (picking && hitContext) {
          picking.colorToMapId = drawHitTexture(hitContext, collection.features, countryByIdRef.current);
          picking.texture.needsUpdate = true;
        }
        if (textureContext) {
          drawWorldTexture(textureContext, collection.features, countryByIdRef.current, selectedIdRef.current, hoverIdRef.current);
          texture.needsUpdate = true;
        }
      })
      .catch(() => {
        renderer.domElement.dataset.mapLoaded = 'false';
      });

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('wheel', onWheel);
      texture.dispose();
      const picking = pickingRef.current;
      if (picking) {
        picking.texture.dispose();
        picking.material.dispose();
        picking.renderTarget.dispose();
      }
      globe.geometry.dispose();
      atmosphere.geometry.dispose();
      (globe.material as THREE.Material).dispose();
      (atmosphere.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      canvasRef.current = null;
      textureRef.current = null;
      pickingRef.current = null;
    };
  }, []);

  return <div ref={mountRef} className="globe-stage" role="application" aria-label="Interactive 3D world globe" />;
}

export default function DrinkWorldMap({ countries }: Props) {
  const [selectedId, setSelectedId] = useState(countries[0]?.mapId ?? '032');
  const [query, setQuery] = useState('');
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const shouldScrollToDetailRef = useRef(false);
  const hasRandomizedInitialCountryRef = useRef(false);

  const countryById = useMemo(() => new Map(countries.map((country) => [country.mapId, country])), [countries]);

  const filteredCountries = useMemo(() => {
    const normalizedQuery = normalizeSearch(query.trim());
    return countries.filter((country) => {
      const searchText = normalizeSearch(`${country.name} ${country.drink} ${country.drinkType} ${country.region} ${country.madeOf}`);
      return normalizedQuery.length === 0 || searchText.includes(normalizedQuery);
    });
  }, [countries, query]);

  useEffect(() => {
    if (hasRandomizedInitialCountryRef.current || countries.length === 0) return;
    hasRandomizedInitialCountryRef.current = true;
    setSelectedId(countries[Math.floor(Math.random() * countries.length)]?.mapId ?? countries[0].mapId);
  }, [countries]);

  useEffect(() => {
    if (filteredCountries.length > 0 && !filteredCountries.some((country) => country.mapId === selectedId)) {
      setSelectedId(filteredCountries[0].mapId);
    }
  }, [filteredCountries, selectedId]);

  useEffect(() => {
    if (!shouldScrollToDetailRef.current) return;
    shouldScrollToDetailRef.current = false;
    if (typeof window === 'undefined' || window.innerWidth > 900) return;
    detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedId]);

  const selected = countryById.get(selectedId) ?? filteredCountries[0] ?? countries[0];

  const handleSelect = (mapId: string, source?: 'globe-tap' | 'list-click') => {
    shouldScrollToDetailRef.current = source === 'globe-tap' || source === 'list-click';
    setSelectedId(mapId);
  };

  return (
    <section className="app-frame" aria-label="Interactive world drinks map">
      <aside className="sidebar-panel">
        <div className="map-toolbar">
          <label className="field">
            <span className="sr-only">Search countries or drinks</span>
            <Search aria-hidden="true" />
            <input className="search-input" type="search" value={query} placeholder="Search country or drink" onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>

        <div className="country-results" aria-live="polite">
          <div className="country-list" aria-label="Countries matching search">
            {filteredCountries.map((country) => (
              <button key={country.mapId} type="button" className={country.mapId === selected?.mapId ? 'is-active' : ''} onClick={() => handleSelect(country.mapId, 'list-click')}>
                <FlagImage country={country} compact />
                <span className="country-list-copy">
                  <span className="country-list-name">{country.name}</span>
                  <span className="country-list-drink">{country.drink}</span>
                </span>
              </button>
            ))}
            {filteredCountries.length === 0 && <p className="empty-results">No countries match that search.</p>}
          </div>
        </div>
      </aside>

      <div className="map-panel">
        <div className="map-canvas">
          <GlobeCanvas countryById={countryById} selectedId={selected?.mapId ?? selectedId} onSelect={handleSelect} />
        </div>
      </div>

      {selected && <DrinkCard key={selected.mapId} country={selected} panelRef={detailPanelRef} />}
    </section>
  );
}