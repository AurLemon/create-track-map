L.Control.Coords = L.Control.extend({
  options: {
    position: "bottomleft",
    title: "Create Track Map",
    footerText: "Forge 1.20.1",
    idleDelay: 3000,
    mobileIdleDelay: 2000,
  },

  initialize(opts) {
    L.Util.setOptions(this, opts)
  },

  _createElement() {
    let el = document.createElement("div")
    el.classList.add("coords-control")

    let titleEl = document.createElement("div")
    titleEl.classList.add("coords-title")
    titleEl.innerHTML = this.options.title
    el.appendChild(titleEl)

    let valuesEl = document.createElement("div")
    valuesEl.classList.add("coords-values")

    let curEl = document.createElement("div")
    curEl.classList.add("cursor-coords")
    let curIcon = document.createElement("object")
    curIcon.classList.add("icon")
    curIcon.data = "assets/icons/cursor.svg"
    let curX = document.createElement("span")
    let curZ = document.createElement("span")
    curX.classList.add("cursor-x")
    curZ.classList.add("cursor-z")
    curEl.appendChild(curIcon)
    curEl.appendChild(curX)
    curEl.appendChild(curZ)
    valuesEl.appendChild(curEl)

    let ctrEl = document.createElement("div")
    ctrEl.classList.add("center-coords")
    let ctrIcon = document.createElement("object")
    ctrIcon.classList.add("icon")
    ctrIcon.data = "assets/icons/center.svg"
    let ctrX = document.createElement("span")
    let ctrZ = document.createElement("span")
    ctrX.classList.add("center-x")
    ctrZ.classList.add("center-z")
    ctrEl.appendChild(ctrIcon)
    ctrEl.appendChild(ctrX)
    ctrEl.appendChild(ctrZ)
    valuesEl.appendChild(ctrEl)
    el.appendChild(valuesEl)

    let mobileRotatorEl = document.createElement("div")
    mobileRotatorEl.classList.add("coords-mobile-rotator")
    el.appendChild(mobileRotatorEl)

    let footerEl = document.createElement("div")
    footerEl.classList.add("coords-footer")
    footerEl.innerHTML = this.options.footerText
    el.appendChild(footerEl)

    return el
  },

  _createBackdrop(map) {
    let backdrop = document.createElement("div")
    backdrop.classList.add("coords-backdrop")
    map.getContainer().appendChild(backdrop)
    this.backdrop = backdrop
  },

  onAdd(map) {
    let el = this._createElement()
    this.container = el
    this._createBackdrop(map)

    this.centerX = el.getElementsByClassName("center-x")[0]
    this.centerZ = el.getElementsByClassName("center-z")[0]
    this.cursorX = el.getElementsByClassName("cursor-x")[0]
    this.cursorZ = el.getElementsByClassName("cursor-z")[0]
    this.values = el.getElementsByClassName("coords-values")[0]
    this.mobileRotator = el.getElementsByClassName("coords-mobile-rotator")[0]

    this.cursor = el.getElementsByClassName("cursor-coords")[0]
    this.isMobileMedia = window.matchMedia("(max-width: 720px)")
    this._wakeValuesBound = this._wakeValues.bind(this)

    map.on("zoom", this._updateCenterCoords, this)
    map.on("move", this._updateCenterCoords, this)
    map.on("mouseover", this._showCursorCoords, this)
    map.on("mousemove", this._updateCursorCoords, this)
    map.on("click", this._wakeValues, this)
    map.on("mouseout", this._clearCursorCoords, this)
    map.getContainer().addEventListener("touchstart", this._wakeValuesBound, { passive: true })

    this._updateCenterCoords()
    this._setRollingNumber(this.cursorX, "--")
    this._setRollingNumber(this.cursorZ, "--")
    this._wakeValues()

    return el
  },

  onRemove(map) {
    document.getElementById("ctm-coords-control").remove()
    this.backdrop?.remove()
    window.clearTimeout(this.valuesIdleTimer)
    this._stopMobileRotator()

    map.off("zoom", this._updateCenterCoords, this)
    map.off("move", this._updateCenterCoords, this)
    map.off("mouseover", this._showCursorCoords, this)
    map.off("mousemove", this._updateCursorCoords, this)
    map.off("click", this._wakeValues, this)
    map.off("mouseout", this._clearCursorCoords, this)
    map.getContainer().removeEventListener("touchstart", this._wakeValuesBound)
  },

  _updateCenterCoords() {
    const coords = map.getCenter()
    const x = Math.round(coords.lng)
    const z = Math.round(coords.lat)

    this._setRollingNumber(this.centerX, x)
    this._setRollingNumber(this.centerZ, z)
  },

  _updateCursorCoords(event) {
    const coords = event.latlng
    const x = Math.round(coords.lng)
    const z = Math.round(coords.lat)

    this._wakeValues()
    this._setRollingNumber(this.cursorX, x)
    this._setRollingNumber(this.cursorZ, z)
  },

  _showCursorCoords() {
    this._wakeValues()
  },

  _clearCursorCoords() {
  },

  _setRollingNumber(el, value) {
    const nextValue = value.toString()
    const previousValue = el.dataset.value

    if (previousValue === nextValue) {
      return
    }

    if (previousValue === undefined) {
      el.dataset.value = nextValue
      this._renderStaticNumber(el, nextValue)
      this._syncNumberWidth(el, nextValue)
      return
    }

    el._rollingVersion = (el._rollingVersion ?? 0) + 1
    const version = el._rollingVersion
    const currentWidth = Math.ceil(el.getBoundingClientRect().width)
    el.dataset.value = nextValue
    el.style.width = `${currentWidth}px`
    el.replaceChildren(...this._createRollingDigits(previousValue, nextValue))
    this._syncNumberWidth(el, nextValue)
    window.setTimeout(() => {
      if (el._rollingVersion !== version) {
        return
      }

      this._renderStaticNumber(el, nextValue)
      this._syncNumberWidth(el, nextValue)
    }, 190)
  },

  _syncNumberWidth(el, value = null) {
    window.cancelAnimationFrame(el._widthRaf)
    el._widthRaf = window.requestAnimationFrame(() => {
      const targetWidth = value === null ? this._measureNumberWidth(el) : this._measureStaticNumberWidth(el, value)
      el.style.width = `${targetWidth}px`
    })
  },

  _measureNumberWidth(el) {
    const clone = el.cloneNode(true)
    clone.style.position = "absolute"
    clone.style.visibility = "hidden"
    clone.style.pointerEvents = "none"
    clone.style.width = "max-content"
    clone.style.transition = "none"
    clone.style.left = "-9999px"
    clone.style.bottom = "0"
    document.body.appendChild(clone)
    const width = Math.ceil(clone.getBoundingClientRect().width)
    clone.remove()

    return width
  },

  _measureStaticNumberWidth(el, value) {
    const clone = el.cloneNode(false)
    clone.style.position = "absolute"
    clone.style.visibility = "hidden"
    clone.style.pointerEvents = "none"
    clone.style.width = "max-content"
    clone.style.transition = "none"
    clone.style.left = "-9999px"
    clone.style.bottom = "0"
    this._renderStaticNumber(clone, value)
    document.body.appendChild(clone)
    const width = Math.ceil(clone.getBoundingClientRect().width)
    clone.remove()

    return width
  },

  _renderStaticNumber(el, value) {
    el.replaceChildren(
      ...Array.from(value, (char) => {
        const digit = document.createElement("span")
        digit.classList.add("coords-digit")
        digit.textContent = char
        return digit
      }),
    )
  },

  _createRollingDigits(previousValue, nextValue) {
    const length = Math.max(previousValue.length, nextValue.length)
    const previous = previousValue.padStart(length, " ")
    const next = nextValue.padStart(length, " ")

    return Array.from(next, (nextChar, index) => {
      const previousChar = previous[index]
      const digit = document.createElement("span")
      digit.classList.add("coords-digit")

      if (previousChar === nextChar) {
        digit.textContent = nextChar
        return digit
      }

      digit.classList.add("coords-digit-rolling")

      const oldDigit = document.createElement("span")
      oldDigit.classList.add("coords-digit-old")
      oldDigit.textContent = previousChar

      const newDigit = document.createElement("span")
      newDigit.classList.add("coords-digit-new")
      newDigit.textContent = nextChar

      digit.appendChild(oldDigit)
      digit.appendChild(newDigit)
      digit.addEventListener(
        "animationend",
        () => {
          digit.classList.remove("coords-digit-rolling")
          digit.textContent = nextChar
        },
        { once: true },
      )

      return digit
    })
  },

  _wakeValues() {
    this._setValuesIdle(false)
    this._scheduleValuesIdle()
  },

  _scheduleValuesIdle() {
    window.clearTimeout(this.valuesIdleTimer)
    this.valuesIdleTimer = window.setTimeout(() => {
      this._setValuesIdle(true)
    }, this._getIdleDelay())
  },

  _setValuesIdle(isIdle) {
    if (!this.values) {
      return
    }

    this.values.classList.toggle("coords-values-idle", isIdle)
    this.container.classList.toggle("coords-mobile-rotator-active", isIdle)

    if (isIdle) {
      this._startMobileRotator()
    } else {
      this._stopMobileRotator()
    }
  },

  _getIdleDelay() {
    return this._isMobile() ? this.options.mobileIdleDelay : this.options.idleDelay
  },

  _isMobile() {
    return this.isMobileMedia?.matches ?? false
  },

  _startMobileRotator() {
    if (!this._isMobile() || !this.mobileRotator) {
      return
    }

    this.mobileRotatorItems = [this.options.title, this.options.footerText].filter(Boolean)
    if (!this.mobileRotatorItems.length) {
      return
    }

    this.mobileRotatorIndex = 0
    this._renderMobileRotator()
    if (this.mobileRotatorItems.length < 2) {
      return
    }

    window.clearInterval(this.mobileRotatorTimer)
    this.mobileRotatorTimer = window.setInterval(() => {
      this.mobileRotatorIndex = (this.mobileRotatorIndex + 1) % this.mobileRotatorItems.length
      this._renderMobileRotator()
    }, 2000)
  },

  _stopMobileRotator() {
    window.clearInterval(this.mobileRotatorTimer)
    this.mobileRotatorTimer = null
  },

  _renderMobileRotator() {
    if (!this.mobileRotator || !this.mobileRotatorItems?.length) {
      return
    }

    this.mobileRotator.classList.remove("coords-mobile-rotator-changing")
    void this.mobileRotator.offsetWidth
    this.mobileRotator.innerHTML = this.mobileRotatorItems[this.mobileRotatorIndex]
    this.mobileRotator.classList.add("coords-mobile-rotator-changing")
  },
})

L.control.coords = (opts) => new L.Control.Coords(opts)
