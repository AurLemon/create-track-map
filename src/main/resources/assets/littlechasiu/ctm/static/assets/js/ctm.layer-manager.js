class LayerManager {
  constructor(map) {
    this.map = map

    this.layerConfigs = {}
    this.labels = {}
    this.currentDimension = null
    this.dimensionLayers = {}
    this.contentLayers = {
      tracks: L.layerGroup([]).addTo(map),
      blocks: L.layerGroup([]).addTo(map),
      signals: L.layerGroup([]).addTo(map),
      portals: L.layerGroup([]).addTo(map),
      stations: L.layerGroup([]).addTo(map),
      trains: L.layerGroup([]).addTo(map),
    }

    this.actualLayers = {}

    this.control = L.control.layers([], []).addTo(map)
    this._setupLayerControl()

    map.on("baselayerchange", this._onDimensionChange, this)
    map.on("overlayadd", this._onOverlayAdd, this)
    map.on("overlayremove", this._onOverlayRemove, this)
    map.on("zoomend", this._onZoomLevelChange, this)
  }

  setLayerConfig(cfg) {
    Object.keys(cfg).forEach((key) => {
      this.layerConfigs[key] = {
        minZoom: cfg[key].min_zoom,
        maxZoom: cfg[key].max_zoom,
      }
      let typeLayer = this.contentLayers[key]
      typeLayer.name = key
      this.control.addOverlay(typeLayer, this._label(cfg[key].label))
    })
  }

  setDimensionLabels(obj) {
    Object.keys(obj).forEach((dim) => {
      let label = obj[dim].label
      if (!!label) {
        this.labels[dim] = label
      }
    })
  }

  dimension(name) {
    if (!this.dimensionLayers.hasOwnProperty(name)) {
      let layerGroup = {
        tracks: L.layerGroup([]),
        blocks: L.layerGroup([]),
        signals: L.layerGroup([]),
        portals: L.layerGroup([]),
        stations: L.layerGroup([]),
        trains: L.layerGroup([]),
      }
      let layer = (this.dimensionLayers[name] = L.layerGroup([]))
      layer.name = name
      this.control.addBaseLayer(layer, this._label(this.labels[name] || name))
      this.actualLayers[name] = layerGroup
    }
    return this.actualLayers[name]
  }

  _label(label) {
    return (
      {
        Tracks: "轨道",
        Blocks: "区段",
        "Track Occupancy": "区段占用",
        Signals: "信号",
        Portals: "传送门",
        Stations: "车站",
        Trains: "列车",
        Overworld: "主世界",
        Nether: "下界",
        End: "末地",
      }[label] || label
    )
  }

  _setupLayerControl() {
    const container = this.control.getContainer()
    const toggle = container.querySelector(".leaflet-control-layers-toggle")

    toggle.title = "图层"
    toggle.setAttribute("aria-pressed", "false")

    L.DomEvent.off(container)
    L.DomEvent.off(toggle)
    L.DomEvent.disableClickPropagation(container)
    L.DomEvent.disableScrollPropagation(container)
    this.map.off("click", this.control.collapse, this.control)

    L.DomEvent.on(
      toggle,
      {
        click: (e) => {
          L.DomEvent.preventDefault(e)
          L.DomEvent.stopPropagation(e)
          this._toggleLayerControl()
        },
        keydown: (e) => {
          if (e.code === "Enter" || e.code === "Space") {
            L.DomEvent.preventDefault(e)
            L.DomEvent.stopPropagation(e)
            this._toggleLayerControl()
          }
        },
      },
      this
    )
  }

  _toggleLayerControl() {
    const container = this.control.getContainer()
    const toggle = container.querySelector(".leaflet-control-layers-toggle")

    if (container.classList.contains("leaflet-control-layers-expanded")) {
      this.control.collapse()
      toggle.setAttribute("aria-pressed", "false")
      if (typeof this.onLayerControlCollapse === "function") {
        this.onLayerControlCollapse(this)
      }
      return
    }

    this.control.expand()
    this._setLayerListMaxHeight()
    toggle.setAttribute("aria-pressed", "true")
    if (typeof this.onLayerControlExpand === "function") {
      this.onLayerControlExpand(this)
    }
  }

  _setLayerListMaxHeight() {
    const container = this.control.getContainer()
    const list = container.querySelector(".leaflet-control-layers-list")

    if (!list) {
      return
    }

    const mapRect = this.map.getContainer().getBoundingClientRect()
    const controlRect = container.getBoundingClientRect()
    const bottom = Math.min(window.innerHeight, mapRect.bottom)
    const maxHeight = Math.max(120, bottom - controlRect.top - 16)

    list.style.maxHeight = `${Math.floor(maxHeight)}px`
    this._updateLayerListScrollbar(list)
  }

  _updateLayerListScrollbar(list) {
    if (!list) {
      return
    }

    if (list.clientHeight < list.scrollHeight) {
      list.classList.add("leaflet-control-layers-scrollbar")
    } else {
      list.classList.remove("leaflet-control-layers-scrollbar")
    }
  }

  setLayerListMaxHeight(height) {
    const list = this.getLayerControlList()
    if (!list) {
      return
    }

    const safeHeight = Math.max(120, height)
    list.style.maxHeight = `${Math.floor(safeHeight)}px`
    this._updateLayerListScrollbar(list)
  }

  isLayerControlExpanded() {
    const container = this.control.getContainer()
    return !!container?.classList.contains("leaflet-control-layers-expanded")
  }

  expandLayerControl() {
    if (this.isLayerControlExpanded()) {
      return
    }
    this.control.expand()
    this._setLayerListMaxHeight()
    const toggle = this.control.getContainer().querySelector(".leaflet-control-layers-toggle")
    toggle?.setAttribute("aria-pressed", "true")
    if (typeof this.onLayerControlExpand === "function") {
      this.onLayerControlExpand(this)
    }
  }

  collapseLayerControl() {
    if (!this.isLayerControlExpanded()) {
      return
    }
    this.control.collapse()
    const toggle = this.control.getContainer().querySelector(".leaflet-control-layers-toggle")
    toggle?.setAttribute("aria-pressed", "false")
    if (typeof this.onLayerControlCollapse === "function") {
      this.onLayerControlCollapse(this)
    }
  }

  getLayerControlContainer() {
    return this.control.getContainer()
  }

  getLayerControlList() {
    const container = this.control.getContainer()
    return container?.querySelector(".leaflet-control-layers-list")
  }

  layer(dim, type) {
    return this.dimension(dim)[type]
  }

  _hideDimension(dim) {
    let layers = this.dimension(dim)
    this.map.removeLayer(this.dimensionLayers[dim])
    Object.values(layers).forEach((layer) => {
      this.map.removeLayer(layer)
    })
  }

  _showDimension(dim) {
    let layers = this.dimension(dim)
    Object.entries(layers).forEach(([key, layer]) => {
      if (this.map.hasLayer(this.contentLayers[key])) {
        this.map.addLayer(layer)
      }
    })
    this.currentDimension = dim
  }

  switchToDimension(dim) {
    Object.keys(this.dimensionLayers).forEach((l) => this._hideDimension(l))
    this._showDimension(dim)
    this.dimensionLayers[dim].addTo(map)
  }

  switchDimensions(from, to) {
    this._hideDimension(from)
    this._showDimension(to)
    this.dimensionLayers[dim].addTo(map)
  }

  _onDimensionChange({ layer }) {
    Object.keys(this.dimensionLayers).forEach((l) => this._hideDimension(l))
    this._showDimension(layer.name)
  }

  _onOverlayAdd({ layer }) {
    let zoom = this.map.getZoom()
    let layerConfig = this.layerConfigs[layer.name]
    let dimLayer = this.dimension(this.currentDimension)[layer.name]
    if (zoom >= layerConfig.minZoom && zoom <= layerConfig.maxZoom) {
      dimLayer.addTo(this.map)
    }
  }

  _onOverlayRemove({ layer }) {
    this.map.removeLayer(this.dimension(this.currentDimension)[layer.name])
  }

  _onZoomLevelChange() {
    let zoom = this.map.getZoom()

    Object.entries(this.contentLayers).forEach(([name, layer]) => {
      let layerConfig = this.layerConfigs[name]
      let dimLayer = this.dimension(this.currentDimension)[name]

      if (zoom < layerConfig.minZoom || zoom > layerConfig.maxZoom) {
        this.map.removeLayer(dimLayer)
      } else if (this.map.hasLayer(layer) && !this.map.hasLayer(dimLayer)) {
        this.map.addLayer(dimLayer)
      }
    })
  }

  _clearLayers(key) {
    Array.from(Object.values(this.actualLayers)).forEach((obj) => obj[key].clearLayers())
  }

  clearTracks() {
    this._clearLayers("tracks")
  }
  clearBlocks() {
    this._clearLayers("blocks")
  }
  clearSignals() {
    this._clearLayers("signals")
  }
  clearPortals() {
    this._clearLayers("portals")
  }
  clearStations() {
    this._clearLayers("stations")
  }
  clearTrains() {
    this._clearLayers("trains")
  }
}
