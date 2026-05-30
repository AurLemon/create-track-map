let map = L.map("map", {
  crs: L.CRS.Minecraft,
  zoomControl: true,
  attributionControl: false,
})

map.createPane("tracks")
map.createPane("blocks")
map.createPane("signals")
map.createPane("trains")
map.createPane("portals")
map.createPane("stations")
map.createPane("satellite")
map.getPane("tracks").style.zIndex = 300
map.getPane("blocks").style.zIndex = 500
map.getPane("signals").style.zIndex = 600
map.getPane("trains").style.zIndex = 700
map.getPane("portals").style.zIndex = 800
map.getPane("stations").style.zIndex = 800
map.getPane("satellite").style.zIndex = 200

map.getPane("tooltipPane").style.zIndex = 1000

L.DynmapLayer = L.TileLayer.extend({
  options: {
    tileSize: 128,
    minZoom: 0,
    maxZoom: 6,
    mapZoomIn: 1,
    mapZoomOut: 5,
    scale: 4,
    tileScale: 0,
    yOriginOffsetBlocks: 32,
    world: "world",
    mapType: "flat",
    baseUrl: "",
    pane: "satellite",
    attribution: "Dynmap",
  },

  initialize(options) {
    L.TileLayer.prototype.initialize.call(this, "", this._buildOptions(options))
  },

  _buildOptions(options) {
    const tileScale = options?.tileScale ?? this.options.tileScale
    const dynmapScale = options?.scale ?? this.options.scale
    const mapZoomIn = options?.mapZoomIn ?? this.options.mapZoomIn
    const mapZoomOut = options?.mapZoomOut ?? this.options.mapZoomOut
    const nativeZoom = Math.log2(dynmapScale)

    return {
      ...options,
      noWrap: true,
      tileSize: 128 << tileScale,
      minZoom: nativeZoom - mapZoomOut,
      maxZoom: nativeZoom + mapZoomIn,
      minNativeZoom: nativeZoom - mapZoomOut,
      maxNativeZoom: nativeZoom,
      nativeZoom,
    }
  },

  setDynmapOptions(options) {
    L.Util.setOptions(this, this._buildOptions(options))
    this.redraw()
    return this
  },

  _getTilePos(coords) {
    const pos = L.TileLayer.prototype._getTilePos.call(this, coords)
    const zoom = this._tileZoom
    const nativeZoom = this.options.nativeZoom

    if (zoom < nativeZoom) {
      const offset = this.options.tileSize - this.options.yOriginOffsetBlocks * (2 ** zoom)
      pos.y += Math.max(0, offset)
    }

    return pos
  },

  getTileUrl(coords) {
    const nativeZoom = this.options.nativeZoom
    const tileZoom = this._tileZoom
    const urlZoom = this._getZoomForUrl()
    const coordScale = 2 ** (urlZoom - tileZoom)
    const tileX = Math.floor(coords.x * coordScale)
    const tileY = Math.floor(coords.y * coordScale)
    const zoomOutLevel = Math.max(0, nativeZoom - urlZoom)
    const scale = 1 << zoomOutLevel
    const scaledX = scale * tileX
    const invertedY = -scale * (tileY + 1)
    const chunkX = scaledX >> 5
    const chunkY = invertedY >> 5
    const prefix = zoomOutLevel === 0 ? "" : `${"z".repeat(zoomOutLevel)}_`
    const fileName = `${prefix}${scaledX}_${invertedY}.jpg`

    return `${this.options.baseUrl}/${this.options.world}/${this.options.mapType}/` +
      `${chunkX}_${chunkY}/${fileName}`
  },
})

L.dynmapLayer = (options) => new L.DynmapLayer(options)

let selectTrain = () => {}

function formatCoord(value) {
  return Number.isFinite(value) ? Math.round(value).toString() : "?"
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function formatTrainPoint(point) {
  if (!point) {
    return "坐标未知"
  }

  return `${formatCoord(point.x)}, ${formatCoord(point.y)}, ${formatCoord(point.z)}`
}

function firstTrainLocation(train) {
  const car = train.cars[0]
  return car?.leading?.location || car?.trailing?.location || null
}

function trainDirectionLabel(train) {
  return train.backwards ? "反向行驶" : "正向行驶"
}

function trainStatusLabel(train) {
  return train.stopped ? "已停车" : "运行中"
}

function trainDetailsHtml(train) {
  const point = firstTrainLocation(train)
  const name = escapeHtml(train.name)
  return [
    `<div>列车名：${name}</div>`,
    `<div>车辆数量：${train.cars.length}</div>`,
    `<div>运行状态：${trainStatusLabel(train)}</div>`,
    `<div>行驶方向：${trainDirectionLabel(train)}</div>`,
    `<div>当前坐标：${formatTrainPoint(point)}</div>`,
  ].join("")
}

function trainTooltipHtml(train, carIndex) {
  const title =
    train.cars.length === 1
      ? escapeHtml(train.name)
      : `${escapeHtml(train.name)} <span class="car-number">${carIndex + 1}</span>`

  return [
    `<div>${title}</div>`,
    `<div class="train-tooltip-meta">${trainDirectionLabel(train)}</div>`,
  ].join("")
}

const lmgr = new LayerManager(map)
const tmgr = new TrainManager(map, lmgr, {
  onSelect: (id) => selectTrain(id, "list"),
  detailsFunction: trainDetailsHtml,
})
const smgr = new StationManager(map, lmgr)

let satelliteLayer = null
let satelliteMaps = {}

setupControlStacking(map, lmgr, tmgr, smgr)

function normalizeSatelliteConfig(config) {
  if (!config) {
    return null
  }

  return {
    baseUrl: config.tiles_url,
    world: config.world,
    mapType: config.map_type,
    mapZoomIn: config.map_zoom_in,
    mapZoomOut: config.map_zoom_out,
    scale: config.scale,
    tileScale: config.tile_scale,
    yOriginOffsetBlocks: config.y_origin_offset_blocks,
  }
}

function getSatelliteConfig(dimension) {
  return normalizeSatelliteConfig(satelliteMaps[dimension] || satelliteMaps["minecraft:overworld"])
}

function setSatelliteDimension(dimension) {
  const options = getSatelliteConfig(dimension)
  if (!options || !satelliteLayer) {
    return
  }

  satelliteLayer.setDynmapOptions(options)
}

function setupControlStacking(mapInstance, layerManager, trainManager, stationManager) {
  const minHeight = 120
  const gap = 8
  const bottomHudOffset = 72
  let isUpdating = false
  let lastOpenedId = null

  const controls = [
    {
      id: "layers",
      isExpanded: () => layerManager.isLayerControlExpanded(),
      collapse: () => layerManager.collapseLayerControl(),
      getContainer: () => layerManager.getLayerControlContainer(),
      getBody: () => layerManager.getLayerControlList(),
      setMaxHeight: (height) => layerManager.setLayerListMaxHeight(height),
    },
    {
      id: "trains",
      isExpanded: () => trainManager.control.isExpanded(),
      collapse: () => trainManager.control.collapse(),
      getContainer: () => trainManager.control.getContainer(),
      getBody: () => trainManager.control.getBody(),
      setMaxHeight: (height) => trainManager.control.setMaxHeight(height),
    },
    {
      id: "stations",
      isExpanded: () => stationManager.control.isExpanded(),
      collapse: () => stationManager.control.collapse(),
      getContainer: () => stationManager.control.getContainer(),
      getBody: () => stationManager.control.getBody(),
      setMaxHeight: (height) => stationManager.control.setMaxHeight(height),
    },
  ]

  const updateStack = (openedId) => {
    if (isUpdating) {
      return
    }
    if (openedId) {
      lastOpenedId = openedId
    }
    isUpdating = true

    const mapRect = mapInstance.getContainer().getBoundingClientRect()
    const mapBottom = Math.min(window.innerHeight, mapRect.bottom) - bottomHudOffset

    const getBodyHeight = (item) => {
      const body = item.getBody()
      if (!body) {
        return 0
      }
      const maxHeight = parseFloat(body.style.maxHeight)
      const limit = Number.isFinite(maxHeight) ? maxHeight : body.scrollHeight
      return Math.min(body.scrollHeight, limit)
    }

    const applyLayout = () => {
      const expanded = controls.filter((item) => item.isExpanded())
      const stackTop = controls
        .map((item) => item.getContainer()?.getBoundingClientRect().top)
        .filter((top) => Number.isFinite(top))
        .reduce((min, top) => Math.min(min, top), mapBottom)
      let prevBottom = null
      let lastBottom = null

      expanded.forEach((item) => {
        const container = item.getContainer()
        const body = item.getBody()
        if (!container || !body) {
          return
        }

        const containerTop = container.getBoundingClientRect().top
        const offset = prevBottom ? Math.max(0, prevBottom - containerTop) : stackTop - containerTop
        const available = Math.max(minHeight, mapBottom - (containerTop + offset) - gap)

        item.setMaxHeight(available)

        const bodyHeight = getBodyHeight(item)
        body.style.transform = offset ? `translateY(${Math.floor(offset)}px)` : ""

        prevBottom = containerTop + offset + bodyHeight + gap
        lastBottom = containerTop + offset + bodyHeight
      })

      controls.forEach((item) => {
        if (item.isExpanded()) {
          return
        }
        const body = item.getBody()
        if (body) {
          body.style.transform = ""
        }
      })

      return { expanded, lastBottom }
    }

    const getOverflow = (lastBottom) => {
      if (!lastBottom) {
        return 0
      }
      return lastBottom - mapBottom
    }

    let layout = applyLayout()
    let expanded = layout.expanded
    let overflow = getOverflow(layout.lastBottom)
    while (overflow > 0 && expanded.length > 1) {
      const target = expanded.find((item) => item.id !== lastOpenedId) || expanded[0]
      if (!target) {
        break
      }
      target.collapse()
      layout = applyLayout()
      expanded = layout.expanded
      overflow = getOverflow(layout.lastBottom)
    }

    isUpdating = false
  }

  layerManager.onLayerControlExpand = () => updateStack("layers")
  layerManager.onLayerControlCollapse = () => updateStack("layers")

  trainManager.control.options.onExpand = () => updateStack("trains")
  trainManager.control.options.onCollapse = () => updateStack("trains")
  trainManager.control.options.onSizeChange = () => updateStack()
  stationManager.control.options.onExpand = () => updateStack("stations")
  stationManager.control.options.onCollapse = () => updateStack("stations")
  stationManager.control.options.onSizeChange = () => updateStack()

  window.addEventListener("resize", () => updateStack())
}

L.Control.ThemeToggle = L.Control.extend({
  options: {
    position: "topright",
  },

  onAdd() {
    const container = document.createElement("div")
    container.classList.add("leaflet-control", "leaflet-control-theme")

    const button = document.createElement("a")
    button.href = "#"
    button.role = "button"
    button.title = "主题: 跟随系统"
    button.classList.add("leaflet-control-toggle", "leaflet-control-theme-toggle")
    button.setAttribute("aria-pressed", "false")
    container.appendChild(button)

    const themeModes = ["system", "light", "dark"]
    const themeLabels = {
      system: "跟随系统",
      light: "日间",
      dark: "夜间",
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)")
    let currentTheme = localStorage.getItem("ctm-theme") || "system"

    const applySystemTheme = () => {
      if (currentTheme !== "system") {
        return
      }
      document.body.classList.toggle("ctm-dark", prefersDark.matches)
    }

    const applyTheme = () => {
      document.body.classList.remove("ctm-dark")

      if (currentTheme === "dark") {
        document.body.classList.add("ctm-dark")
      } else if (currentTheme === "system") {
        applySystemTheme()
      }

      button.dataset.theme = currentTheme
      button.title = `主题: ${themeLabels[currentTheme]}`
      button.setAttribute(
        "aria-pressed",
        currentTheme === "system" ? "mixed" : currentTheme === "dark" ? "true" : "false"
      )
    }

    L.DomEvent.disableClickPropagation(container)

    L.DomEvent.on(button, "click", (e) => {
      L.DomEvent.preventDefault(e)
      const nextIndex = (themeModes.indexOf(currentTheme) + 1) % themeModes.length
      currentTheme = themeModes[nextIndex]
      localStorage.setItem("ctm-theme", currentTheme)
      applyTheme()
    })

    if (prefersDark.addEventListener) {
      prefersDark.addEventListener("change", applySystemTheme)
    } else if (prefersDark.addListener) {
      prefersDark.addListener(applySystemTheme)
    }

    applyTheme()

    return container
  },
})

L.control.themeToggle = (opts) => new L.Control.ThemeToggle(opts)

let leftSide = false

fetch("api/config.json")
  .then((resp) => resp.json())
  .then((cfg) => {
    const { layers, view, dimensions, satellite_maps, api_base_url } = cfg
    const {
      initial_dimension,
      initial_position,
      initial_zoom,
      max_zoom,
      min_zoom,
      title,
      footer_text,
      zoom_controls,
      signals_on,
    } = view
    document.title = title || "Create Track Map"

    satelliteMaps = satellite_maps || {}
    const satelliteOptions = getSatelliteConfig(initial_dimension)
    if (satelliteOptions) {
      satelliteLayer = L.dynmapLayer(satelliteOptions).addTo(map)
      lmgr.control.addOverlay(satelliteLayer, "卫星地图底图")
      map.on("baselayerchange", ({ layer }) => setSatelliteDimension(layer.name))
    }

    const satelliteMaxZoom = satelliteLayer?.options?.maxZoom ?? max_zoom
    const satelliteMinZoom = satelliteLayer?.options?.minZoom ?? min_zoom
    const effectiveMinZoom = Math.min(min_zoom, satelliteMinZoom)
    const effectiveMaxZoom = Math.min(max_zoom, satelliteMaxZoom)

    map.setMinZoom(effectiveMinZoom)
    map.setMaxZoom(effectiveMaxZoom)

    lmgr.setLayerConfig(layers)
    lmgr.setDimensionLabels(dimensions)
    lmgr.switchToDimension(initial_dimension)

    const { x: initialX, z: initialZ } = initial_position
    const safeZoom = Math.min(effectiveMaxZoom, Math.max(effectiveMinZoom, initial_zoom))
    map.setView([initialZ, initialX], safeZoom)

    if (!zoom_controls) {
      map.zoomControl.remove()
    }

    leftSide = signals_on === "LEFT"

    L.control.coords({
      title,
      footerText: footer_text,
    }).addTo(map)
    L.control.themeToggle().addTo(map)

    startMapUpdates(api_base_url)
  })

function startMapUpdates(apiBaseUrl) {
  const dmgr = new DataManager(apiBaseUrl)

  const tracks = new Map()
  const portals = new Map()
  const stations = new Map()
  const blockGeometries = new Map()
  const blockStates = new Map()
  const signals = new Map()
  const trains = new Map()

  const trackLayers = new Map()
  const portalLayers = new Map()
  const stationLayers = new Map()
  const blockLayers = new Map()
  const signalLayers = new Map()
  const trainLayers = new Map()
  let selectedTrain = null
  let temporarySelectTimer = null

  function removeLayerRecords(cache, id) {
    const records = cache.get(id) || []
    records.forEach(({ parent, layer }) => parent.removeLayer(layer))
    cache.delete(id)
  }

  function clearLayerRecords(cache) {
    Array.from(cache.keys()).forEach((id) => removeLayerRecords(cache, id))
  }

  function setLayerRecords(cache, id, records) {
    removeLayerRecords(cache, id)
    records.forEach(({ parent, layer }) => layer.addTo(parent))
    cache.set(id, records)
  }

  function clearTemporarySelectTimer() {
    if (temporarySelectTimer) {
      clearTimeout(temporarySelectTimer)
      temporarySelectTimer = null
    }
  }

  function trainCarAnchor(train, carIndex = 0) {
    const car = train.cars[carIndex] || train.cars[0]
    const leading = car?.leading
    const trailing = car?.trailing
    const dimension = leading?.dimension || trailing?.dimension
    let location = leading?.location || trailing?.location

    if (leading?.location && trailing?.location && leading.dimension === trailing.dimension) {
      location = {
        x: (leading.location.x + trailing.location.x) / 2,
        y: (leading.location.y + trailing.location.y) / 2,
        z: (leading.location.z + trailing.location.z) / 2,
      }
    }

    if (!location || !dimension) {
      return null
    }

    return { dimension, position: xz(location) }
  }

  function panToTrain(id, carIndex = 0) {
    const train = trains.get(id)
    const anchor = train ? trainCarAnchor(train, carIndex) : null
    if (!anchor) {
      return
    }

    lmgr.switchToDimension(anchor.dimension)
    map.panTo(anchor.position, {
      animate: true,
      duration: 0.45,
      easeLinearity: 0.25,
    })
  }

  function syncSelectedTrain() {
    if (!selectedTrain) {
      return
    }

    const records = trainLayers.get(selectedTrain.id) || []
    records.forEach(({ layer, carIndex }) => {
      if (carIndex !== selectedTrain.carIndex) {
        return
      }

      if (layer.getElement) {
        const element = layer.getElement()
        element?.classList.add("selected-train")
      }

      if (layer.openTooltip) {
        layer.openTooltip()
      }
    })
  }

  function rerenderTrain(id) {
    const train = trains.get(id)
    if (train) {
      renderTrain(train)
    }
  }

  function setSelectedTrain(id, carIndex = 0, temporary = false) {
    const previousTrainId = selectedTrain?.id
    clearTemporarySelectTimer()
    selectedTrain = { id, carIndex }

    if (previousTrainId && previousTrainId !== id) {
      rerenderTrain(previousTrainId)
    }

    rerenderTrain(id)

    if (temporary) {
      temporarySelectTimer = setTimeout(() => {
        clearSelectedTrain()
      }, 3000)
    }
  }

  function showTemporaryTrain(id, carIndex = 0, expandList = false) {
    if (expandList) {
      tmgr.control.setExpandedItem(id)
    } else {
      tmgr.control.clearExpandedItem()
      tmgr.control.clearActiveItem()
    }

    setSelectedTrain(id, carIndex, true)
    if (expandList) {
      panToTrain(id, carIndex)
    }
  }

  selectTrain = (id, source = "map", carIndex = 0) => {
    showTemporaryTrain(id, source === "list" ? 0 : carIndex, source === "list")
  }

  function clearSelectedTrain() {
    const previousTrainId = selectedTrain?.id
    clearTemporarySelectTimer()
    selectedTrain = null
    tmgr.control.clearExpandedItem()
    tmgr.control.clearActiveItem()
    if (previousTrainId) {
      rerenderTrain(previousTrainId)
    }
  }

  map.on("click", clearSelectedTrain)

  function trackLayer({ path }) {
    if (path.length === 4) {
      return L.curve(["M", xz(path[0]), "C", xz(path[1]), xz(path[2]), xz(path[3])], {
        className: "track",
        interactive: false,
        pane: "tracks",
      })
    }
    return L.polyline([xz(path[0]), xz(path[1])], {
      className: "track",
      interactive: false,
      pane: "tracks",
    })
  }

  function renderTrack(track) {
    tracks.set(track.id, track)
    setLayerRecords(trackLayers, track.id, [
      { parent: lmgr.layer(track.dimension, "tracks"), layer: trackLayer(track) },
    ])
  }

  function renderPortal(portal) {
    portals.set(portal.id, portal)
    const fromMarker = L.marker(xz(portal.from.location), {
      icon: portalIcon,
      pane: "stations",
    }).on("click", () => {
      lmgr.switchDimensions(portal.from.dimension, portal.to.dimension)
      map.panTo(xz(portal.to.location))
    })
    const toMarker = L.marker(xz(portal.to.location), {
      icon: portalIcon,
      pane: "stations",
    }).on("click", () => {
      lmgr.switchDimensions(portal.to.dimension, portal.from.dimension)
      map.panTo(xz(portal.from.location))
    })

    setLayerRecords(portalLayers, portal.id, [
      { parent: lmgr.layer(portal.from.dimension, "portals"), layer: fromMarker },
      { parent: lmgr.layer(portal.to.dimension, "portals"), layer: toMarker },
    ])
  }

  function renderStation(station) {
    stations.set(station.id, station)
    const marker = L.marker(xz(station.location), {
      icon: stationIcon,
      rotationAngle: station.angle,
      pane: "stations",
    }).bindTooltip(station.name, {
      className: "station-name",
      direction: "top",
      offset: L.point(0, -12),
      opacity: 0.7,
    })

    setLayerRecords(stationLayers, station.id, [
      { parent: lmgr.layer(station.dimension, "stations"), layer: marker },
    ])
  }

  function updateStations() {
    smgr.update(Array.from(stations.values()))
  }

  function blockSegmentLayer(block, { path }) {
    const className = "track " + (block.reserved ? "reserved" : block.occupied ? "occupied" : "")
    if (path.length === 4) {
      return L.curve(["M", xz(path[0]), "C", xz(path[1]), xz(path[2]), xz(path[3])], {
        className,
        interactive: false,
        pane: "blocks",
      })
    }
    return L.polyline([xz(path[0]), xz(path[1])], {
      className,
      interactive: false,
      pane: "blocks",
    })
  }

  function renderBlock(id) {
    const geometry = blockGeometries.get(id)
    const state = blockStates.get(id)
    removeLayerRecords(blockLayers, id)
    if (!geometry || !state || (!state.reserved && !state.occupied)) {
      return
    }

    setLayerRecords(
      blockLayers,
      id,
      geometry.segments.map((segment) => ({
        parent: lmgr.layer(segment.dimension, "blocks"),
        layer: blockSegmentLayer(state, segment),
      }))
    )
  }

  function renderSignal(signal) {
    signals.set(signal.id, signal)
    const records = []
    const signalSides = [signal.forward, signal.reverse]

    signalSides.forEach((side) => {
      if (!side) {
        return
      }
      const iconType = side.type === "CROSS_SIGNAL" ? chainSignalIcon : autoSignalIcon
      records.push({
        parent: lmgr.layer(signal.dimension, "signals"),
        layer: L.marker(xz(signal.location), {
          icon: iconType(side.state.toLowerCase(), leftSide),
          rotationAngle: side.angle,
          interactive: false,
          pane: "signals",
        }),
      })
    })

    setLayerRecords(signalLayers, signal.id, records)
  }

  function trainLayersFor(train) {
    const records = []
    let leadCar = null
    const selected = selectedTrain?.id === train.id
    const selectedCarIndex = selected ? selected.carIndex : null
    if (!train.stopped) {
      leadCar = train.backwards ? train.cars.length - 1 : 0
    }

    train.cars.forEach((car, i) => {
      const parts = car.portal
        ? [
            [car.leading.dimension, [xz(car.leading.location), xz(car.portal.from.location)]],
            [car.trailing.dimension, [xz(car.portal.to.location), xz(car.trailing.location)]],
          ]
        : [[car.leading.dimension, [xz(car.leading.location), xz(car.trailing.location)]]]

      parts.forEach(([dim, part]) => {
        if (selectedCarIndex === i) {
          records.push({
            parent: lmgr.layer(dim, "trains"),
            carIndex: i,
            layer: L.polyline(part, {
              weight: 18,
              lineCap: "square",
              className: "selected-train-frame",
              interactive: false,
              pane: "trains",
            }),
          })
        }

        records.push({
          parent: lmgr.layer(dim, "trains"),
          carIndex: i,
          layer: L.polyline(part, {
            weight: 12,
            lineCap: "square",
            className:
              "train" + (leadCar === i ? " lead-car" : "") + (selectedCarIndex === i ? " selected-train" : ""),
            pane: "trains",
          })
            .bindTooltip(
              trainTooltipHtml(train, i),
              {
                className: "train-name",
                direction: "right",
                offset: L.point(12, 0),
                opacity: 0.7,
              }
            )
            .on("click", (e) => {
              L.DomEvent.stop(e.originalEvent)
              selectTrain(train.id, "map", i)
            }),
        })
      })

      if (leadCar === i) {
        const [dim, edge] = train.backwards ? parts[parts.length - 1] : parts[0]
        const [head, tail] = train.backwards ? [edge[1], edge[0]] : [edge[0], edge[1]]
        const angle = 180 + (Math.atan2(tail[0] - head[0], tail[1] - head[1]) * 180) / Math.PI

        records.push({
          parent: lmgr.layer(dim, "trains"),
          carIndex: i,
          layer: L.marker(head, {
            icon: headIcon,
            rotationAngle: angle,
            pane: "trains",
          }).on("click", (e) => {
            L.DomEvent.stop(e.originalEvent)
            selectTrain(train.id, "map", i)
          }),
        })
      }
    })

    return records
  }

  function renderTrain(train) {
    trains.set(train.id, train)
    setLayerRecords(trainLayers, train.id, trainLayersFor(train))
    if (selectedTrain?.id === train.id) {
      syncSelectedTrain()
    }
  }

  function updateTrains() {
    tmgr.update(Array.from(trains.values()))
  }

  dmgr.onTrackStatus((message) => {
    if (message.type === "snapshot") {
      tracks.clear()
      portals.clear()
      stations.clear()
      clearLayerRecords(trackLayers)
      clearLayerRecords(portalLayers)
      clearLayerRecords(stationLayers)
      message.tracks.forEach(renderTrack)
      message.portals.forEach(renderPortal)
      message.stations.forEach(renderStation)
      updateStations()
      return
    }

    message.trackRemove.forEach((id) => {
      tracks.delete(id)
      removeLayerRecords(trackLayers, id)
    })
    message.portalRemove.forEach((id) => {
      portals.delete(id)
      removeLayerRecords(portalLayers, id)
    })
    message.stationRemove.forEach((id) => {
      stations.delete(id)
      removeLayerRecords(stationLayers, id)
    })
    message.trackUpsert.forEach(renderTrack)
    message.portalUpsert.forEach(renderPortal)
    message.stationUpsert.forEach(renderStation)
    updateStations()
  })

  dmgr.onBlockStatus((message) => {
    if (message.type === "snapshot") {
      blockGeometries.clear()
      blockStates.clear()
      clearLayerRecords(blockLayers)
      message.geometries.forEach((geometry) => blockGeometries.set(geometry.id, geometry))
      message.states.forEach((state) => blockStates.set(state.id, state))
      blockStates.forEach((_, id) => renderBlock(id))
      return
    }

    message.geometryRemove.forEach((id) => {
      blockGeometries.delete(id)
      removeLayerRecords(blockLayers, id)
    })
    message.stateRemove.forEach((id) => {
      blockStates.delete(id)
      removeLayerRecords(blockLayers, id)
    })
    message.geometryUpsert.forEach((geometry) => {
      blockGeometries.set(geometry.id, geometry)
      renderBlock(geometry.id)
    })
    message.stateUpsert.forEach((state) => {
      blockStates.set(state.id, state)
      renderBlock(state.id)
    })
  })

  dmgr.onSignalStatus((message) => {
    if (message.type === "snapshot") {
      signals.clear()
      clearLayerRecords(signalLayers)
      message.signals.forEach(renderSignal)
      return
    }

    message.remove.forEach((id) => {
      signals.delete(id)
      removeLayerRecords(signalLayers, id)
    })
    message.upsert.forEach(renderSignal)
  })

  dmgr.onTrainStatus((message) => {
    if (message.type === "snapshot") {
      trains.clear()
      clearLayerRecords(trainLayers)
      message.trains.forEach(renderTrain)
      if (selectedTrain && !trains.has(selectedTrain.id)) {
        selectedTrain = null
      }
      updateTrains()
      return
    }

    message.remove.forEach((id) => {
      trains.delete(id)
      removeLayerRecords(trainLayers, id)
      if (selectedTrain?.id === id) {
        selectedTrain = null
      }
    })
    message.upsert.forEach(renderTrain)
    updateTrains()
  })
}
