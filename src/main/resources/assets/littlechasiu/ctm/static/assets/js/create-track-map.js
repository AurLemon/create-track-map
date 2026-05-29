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

const lmgr = new LayerManager(map)
const tmgr = new TrainManager(map, lmgr)
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
    const mapBottom = Math.min(window.innerHeight, mapRect.bottom)

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
    const { layers, view, dimensions, satellite_maps } = cfg
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

    startMapUpdates()
  })

function startMapUpdates() {
  const dmgr = new DataManager()

  dmgr.onTrackStatus(({ tracks, portals, stations }) => {
    lmgr.clearTracks()
    lmgr.clearPortals()
    lmgr.clearStations()
    smgr.update(stations)

    tracks.forEach((trk) => {
      const path = trk.path
      if (path.length === 4) {
        L.curve(["M", xz(path[0]), "C", xz(path[1]), xz(path[2]), xz(path[3])], {
          className: "track",
          interactive: false,
          pane: "tracks",
        }).addTo(lmgr.layer(trk.dimension, "tracks"))
      } else if (path.length === 2) {
        L.polyline([xz(path[0]), xz(path[1])], {
          className: "track",
          interactive: false,
          pane: "tracks",
        }).addTo(lmgr.layer(trk.dimension, "tracks"))
      }
    })

    stations.forEach((stn) => {
      L.marker(xz(stn.location), {
        icon: stationIcon,
        rotationAngle: stn.angle,
        pane: "stations",
      })
        .bindTooltip(stn.name, {
          className: "station-name",
          direction: "top",
          offset: L.point(0, -12),
          opacity: 0.7,
        })
        .addTo(lmgr.layer(stn.dimension, "stations"))
    })

    portals.forEach((portal) => {
      L.marker(xz(portal.from.location), {
        icon: portalIcon,
        pane: "stations",
      })
        .on("click", (e) => {
          lmgr.switchDimensions(portal.from.dimension, portal.to.dimension)
          map.panTo(xz(portal.to.location))
        })
        .addTo(lmgr.layer(portal.from.dimension, "portals"))
      L.marker(xz(portal.to.location), {
        icon: portalIcon,
        pane: "stations",
      })
        .on("click", (e) => {
          lmgr.switchDimensions(portal.to.dimension, portal.from.dimension)
          map.panTo(xz(portal.from.location))
        })
        .addTo(lmgr.layer(portal.to.dimension, "portals"))
    })
  })

  dmgr.onBlockStatus(({ blocks }) => {
    lmgr.clearBlocks()

    blocks.forEach((block) => {
      if (!block.reserved && !block.occupied) {
        return
      }
      block.segments.forEach(({ dimension, path }) => {
        if (path.length === 4) {
          L.curve(["M", xz(path[0]), "C", xz(path[1]), xz(path[2]), xz(path[3])], {
            className:
              "track " + (block.reserved ? "reserved" : block.occupied ? "occupied" : ""),
            interactive: false,
            pane: "blocks",
          }).addTo(lmgr.layer(dimension, "blocks"))
        } else if (path.length === 2) {
          L.polyline([xz(path[0]), xz(path[1])], {
            className:
              "track " + (block.reserved ? "reserved" : block.occupied ? "occupied" : ""),
            interactive: false,
            pane: "blocks",
          }).addTo(lmgr.layer(dimension, "blocks"))
        }
      })
    })
  })

  dmgr.onSignalStatus(({ signals }) => {
    lmgr.clearSignals()

    signals.forEach((sig) => {
      if (!!sig.forward) {
        let iconType = sig.forward.type === "CROSS_SIGNAL" ? chainSignalIcon : autoSignalIcon
        let marker = L.marker(xz(sig.location), {
          icon: iconType(sig.forward.state.toLowerCase(), leftSide),
          rotationAngle: sig.forward.angle,
          interactive: false,
          pane: "signals",
        }).addTo(lmgr.layer(sig.dimension, "signals"))
      }
      if (!!sig.reverse) {
        let iconType = sig.reverse.type === "CROSS_SIGNAL" ? chainSignalIcon : autoSignalIcon
        let marker = L.marker(xz(sig.location), {
          icon: iconType(sig.reverse.state.toLowerCase(), leftSide),
          rotationAngle: sig.reverse.angle,
          interactive: false,
          pane: "signals",
        }).addTo(lmgr.layer(sig.dimension, "signals"))
      }
    })
  })

  dmgr.onTrainStatus(({ trains }) => {
    lmgr.clearTrains()
    tmgr.update(trains)

    trains.forEach((train) => {
      let leadCar = null
      if (!train.stopped) {
        if (train.backwards) {
          leadCar = train.cars.length - 1
        } else {
          leadCar = 0
        }
      }

      train.cars.forEach((car, i) => {
        let parts = car.portal
          ? [
              [car.leading.dimension, [xz(car.leading.location), xz(car.portal.from.location)]],
              [car.trailing.dimension, [xz(car.portal.to.location), xz(car.trailing.location)]],
            ]
          : [[car.leading.dimension, [xz(car.leading.location), xz(car.trailing.location)]]]

        parts.map(([dim, part]) =>
          L.polyline(part, {
            weight: 12,
            lineCap: "square",
            className: "train" + (leadCar === i ? " lead-car" : ""),
            pane: "trains",
          })
            .bindTooltip(
              train.cars.length === 1
                ? train.name
                : `${train.name} <span class="car-number">${i + 1}</span>`,
              {
                className: "train-name",
                direction: "right",
                offset: L.point(12, 0),
                opacity: 0.7,
              }
            )
            .addTo(lmgr.layer(dim, "trains"))
        )

        if (leadCar === i) {
          let [dim, edge] = train.backwards ? parts[parts.length - 1] : parts[0]
          let [head, tail] = train.backwards ? [edge[1], edge[0]] : [edge[0], edge[1]]
          let angle = 180 + (Math.atan2(tail[0] - head[0], tail[1] - head[1]) * 180) / Math.PI

          L.marker(head, {
            icon: headIcon,
            rotationAngle: angle,
            pane: "trains",
          }).addTo(lmgr.layer(dim, "trains"))
        }
      })
    })
  })
}
