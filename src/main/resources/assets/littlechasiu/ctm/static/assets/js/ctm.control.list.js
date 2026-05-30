L.Control.List = L.Control.extend({
  options: {
    position: "topright",
    toggleClassName: null,
    listClassName: null,
    itemClassName: null,
    tooltip: null,
    coordsFunction: null,
    detailsFunction: null,
    layerManager: null,
    panOnSelect: true,
    onSelect: null,
    onDoubleSelect: null,
    activeDurationMs: 1000,
  },

  initialize(opts) {
    L.Util.setOptions(this, opts)
  },

  onAdd(map) {
    this._map = map

    const container = (this._container = document.createElement("div"))
    container.classList.add("leaflet-control", "leaflet-control-ctm")
    container.setAttribute("aria-haspopup", true)

    L.DomEvent.disableClickPropagation(container)
    L.DomEvent.disableScrollPropagation(container)

    const btn = (this._button = document.createElement("a"))
    btn.classList.add(this.options.toggleClassName, "leaflet-control-toggle")
    btn.href = "#"
    btn.title = this.options.tooltip
    btn.role = "button"
    container.appendChild(btn)

    L.DomEvent.on(
      btn,
      {
        keydown(e) {
          if (e.code === "Enter" || e.code === "Space") {
            L.DomEvent.preventDefault(e)
            this._toggle()
          }
        },
        click(e) {
          L.DomEvent.preventDefault(e)
          this._toggle()
        },
      },
      this
    )

    const list = (this._body = document.createElement("section"))
    list.classList.add("leaflet-control-body")
    container.appendChild(list)

    const filterWrap = (this._filterWrap = document.createElement("div"))
    filterWrap.classList.add("ctm-list-filter")

    const filterInput = (this._filterInput = document.createElement("input"))
    filterInput.type = "search"
    filterInput.placeholder = this.options.filterPlaceholder || "筛选"
    filterInput.autocomplete = "off"
    filterWrap.appendChild(filterInput)
    list.appendChild(filterWrap)

    filterInput.addEventListener("input", (e) => {
      this._filterQuery = e.target.value.trim().toLowerCase()
      this._applyFilter()
    })

    const listDiv = (this._list = document.createElement("div"))
    listDiv.classList.add(this.options.listClassName)
    list.appendChild(listDiv)

    return container
  },

  add(id, info) {
    if (!this._list) {
      return
    }

    const el = document.createElement("div")
    el.classList.add(this.options.itemClassName)
    el.dataset.id = id
    el.dataset.label = info.name
    el.dataset.coords = this.options.coordsFunction(info).join(";")

    const label = document.createElement("div")
    label.classList.add("ctm-list-item-label")
    label.textContent = info.name
    el.appendChild(label)

    if (typeof this.options.detailsFunction === "function") {
      const details = document.createElement("div")
      details.classList.add("ctm-list-item-details")
      details.innerHTML = this.options.detailsFunction(info)
      details.addEventListener("transitionend", () => this._notifySizeChange())
      el.appendChild(details)
    }

    el.addEventListener("click", (e) => {
      this._setActiveItem(e.currentTarget)
      this._setExpandedItem(e.currentTarget)
      if (this.options.panOnSelect) {
        let [dimension, x, _, z] = e.currentTarget.dataset.coords.split(";")
        this.options.layerManager.switchToDimension(dimension)
        this._map.panTo([parseFloat(z), parseFloat(x)])
      }
      if (typeof this.options.onSelect === "function") {
        this.options.onSelect(e.currentTarget.dataset.id)
      }
    })

    el.addEventListener("dblclick", (e) => {
      if (typeof this.options.onDoubleSelect === "function") {
        this._setExpandedItem(e.currentTarget)
        this._setActiveItem(e.currentTarget, true)
        this.options.onDoubleSelect(e.currentTarget.dataset.id)
      }
    })

    this._list.appendChild(el)
    this._applyFilter()
    this._notifySizeChange()
  },

  update(id, info) {
    if (!this._list) {
      return
    }

    let el = Array.from(this._list.children).filter((e) => e.dataset.id === id)[0]
    if (!!el) {
      el.dataset.label = info.name
      el.dataset.coords = this.options.coordsFunction(info).join(";")
      el.querySelector(".ctm-list-item-label").textContent = info.name
      const details = el.querySelector(".ctm-list-item-details")
      if (details && typeof this.options.detailsFunction === "function") {
        details.innerHTML = this.options.detailsFunction(info)
      }
    }
    this._applyFilter()
    this._notifySizeChange()
  },

  remove(id) {
    if (!this._list) {
      return
    }

    let el = Array.from(this._list.children).filter((e) => e.dataset.id === id)[0]
    if (!!el) {
      if (this._activeItem === el) {
        this._activeItem = null
      }
      if (this._expandedItem === el) {
        this._expandedItem = null
      }
      el.remove()
    }
    this._notifySizeChange()
  },

  reorder() {
    Array.from(this._list.children)
      .sort((a, b) => (a.dataset.label > b.dataset.label ? 1 : -1))
      .forEach((node) => this._list.appendChild(node))
    this._applyFilter()
    this._notifySizeChange()
  },

  _expand() {
    L.DomEvent.on(this._body, "click", L.DomEvent.preventDefault)

    this._container.classList.add("leaflet-control-expanded")
    this._button.setAttribute("aria-pressed", "true")

    this._setBodyMaxHeight()

    this._updateScrollbar()

    if (typeof this.options.onExpand === "function") {
      this.options.onExpand(this)
    }

    setTimeout(() => {
      L.DomEvent.off(this._body, "click", L.DomEvent.preventDefault)
    })
  },

  _collapse() {
    this._container.classList.remove("leaflet-control-expanded")
    this._button.setAttribute("aria-pressed", "false")
    this._container.style.marginBottom = ""

    if (typeof this.options.onCollapse === "function") {
      this.options.onCollapse(this)
    }
  },

  _toggle() {
    if (this._container.classList.contains("leaflet-control-expanded")) {
      this._collapse()
    } else {
      this._expand()
    }
  },

  _setBodyMaxHeight() {
    if (!this._map || !this._body || !this._container) {
      return
    }

    const mapRect = this._map.getContainer().getBoundingClientRect()
    const controlRect = this._container.getBoundingClientRect()
    const bottom = Math.min(window.innerHeight, mapRect.bottom) - 72
    const maxHeight = Math.max(120, bottom - controlRect.top - 16)

    this._body.style.maxHeight = `${Math.floor(maxHeight)}px`
  },

  setMaxHeight(height) {
    if (!this._body) {
      return
    }

    const safeHeight = Math.max(120, height)
    this._body.style.maxHeight = `${Math.floor(safeHeight)}px`
    this._updateScrollbar()
  },

  _updateScrollbar() {
    if (!this._body) {
      return
    }

    if (this._body.clientHeight < this._body.scrollHeight) {
      this._body.classList.add("leaflet-control-scrollbar")
    } else {
      this._body.classList.remove("leaflet-control-scrollbar")
    }
  },

  isExpanded() {
    return !!this._container?.classList.contains("leaflet-control-expanded")
  },

  expand() {
    if (!this.isExpanded()) {
      this._expand()
    }
  },

  collapse() {
    if (this.isExpanded()) {
      this._collapse()
    }
  },

  getContainer() {
    return this._container
  },

  getBody() {
    return this._body
  },

  _applyFilter() {
    if (!this._list) {
      return
    }

    const query = (this._filterQuery || "").toLowerCase()
    Array.from(this._list.children).forEach((item) => {
      const text = (item.dataset.label || "").toLowerCase()
      item.style.display = !query || text.includes(query) ? "" : "none"
    })
    this._notifySizeChange()
  },

  _notifySizeChange() {
    if (!this.isExpanded()) {
      return
    }

    if (typeof this.options.onSizeChange === "function") {
      this.options.onSizeChange(this)
    }
  },

  clearActiveItem() {
    if (this._activeTimer) {
      clearTimeout(this._activeTimer)
      this._activeTimer = null
    }

    if (this._activeItem) {
      this._activeItem.classList.remove("ctm-list-item-active")
      this._activeItem = null
    }
  },

  clearExpandedItem() {
    if (this._expandedItem) {
      this._expandedItem.classList.remove("ctm-list-item-expanded")
      this._expandedItem = null
      this._notifySizeChange()
    }
  },

  _setExpandedItem(item) {
    if (!item || !this._list || !item.querySelector(".ctm-list-item-details")) {
      return
    }

    if (this._expandedItem && this._expandedItem !== item) {
      this._expandedItem.classList.remove("ctm-list-item-expanded")
    }

    this._expandedItem = item
    this._expandedItem.classList.add("ctm-list-item-expanded")
    this._notifySizeChange()
  },

  setExpandedItem(id) {
    if (!this._list) {
      return
    }

    const item = Array.from(this._list.children).filter((e) => e.dataset.id === id)[0]
    if (item) {
      this._setExpandedItem(item)
    }
  },

  setPersistentActive(id) {
    if (!this._list) {
      return
    }

    const item = Array.from(this._list.children).filter((e) => e.dataset.id === id)[0]
    if (item) {
      this._setActiveItem(item, true)
    }
  },

  _setActiveItem(item, persistent = false) {
    if (!item || !this._list) {
      return
    }

    if (this._activeTimer) {
      clearTimeout(this._activeTimer)
      this._activeTimer = null
    }

    if (this._activeItem) {
      this._activeItem.classList.remove("ctm-list-item-active")
    }

    this._activeItem = item
    this._activeItem.classList.add("ctm-list-item-active")
    if (persistent) {
      return
    }

    this._activeTimer = setTimeout(() => {
      if (this._activeItem) {
        this._activeItem.classList.remove("ctm-list-item-active")
      }
      this._activeItem = null
      this._activeTimer = null
    }, this.options.activeDurationMs)
  },
})

L.control.list = (opts) => new L.Control.List(opts)

L.control.trainList = (layerManager, opts = {}) =>
  L.control.list({
    toggleClassName: "leaflet-control-train-list-toggle",
    listClassName: "ctm-train-list",
    itemClassName: "train",
    tooltip: "列车",
    filterPlaceholder: "筛选列车",
    coordsFunction: (t) => {
      const c = t.cars[0].leading || t.cars[0].trailing
      return [c.dimension, c.location.x, c.location.y, c.location.z]
    },
    detailsFunction: opts.detailsFunction,
    layerManager,
    panOnSelect: false,
    onSelect: opts.onSelect,
    onDoubleSelect: opts.onDoubleSelect,
    activeDurationMs: 3000,
  })

L.control.stationList = (layerManager) =>
  L.control.list({
    toggleClassName: "leaflet-control-station-list-toggle",
    listClassName: "ctm-station-list",
    itemClassName: "station",
    tooltip: "车站",
    filterPlaceholder: "筛选车站",
    coordsFunction: (s) => [s.dimension, s.location.x, s.location.y, s.location.z],
    layerManager,
  })
