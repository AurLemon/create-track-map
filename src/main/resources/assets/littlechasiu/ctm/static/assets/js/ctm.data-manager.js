class DataManager {
  constructor(apiBaseUrl = "") {
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, "")
    this.networkStream = new EventSource(this.apiUrl("network.rt"))
    this.blockStatusStream = new EventSource(this.apiUrl("blocks.rt"))
    this.signalStatusStream = new EventSource(this.apiUrl("signals.rt"))
    this.trainStatusStream = new EventSource(this.apiUrl("trains.rt"))
  }

  apiUrl(path) {
    return this.apiBaseUrl ? `${this.apiBaseUrl}/api/${path}` : `api/${path}`
  }

  onTrackStatus(fn) {
    this.networkStream.onmessage = (e) => fn(JSON.parse(e.data))
  }

  onBlockStatus(fn) {
    this.blockStatusStream.onmessage = (e) => fn(JSON.parse(e.data))
  }

  onSignalStatus(fn) {
    this.signalStatusStream.onmessage = (e) => fn(JSON.parse(e.data))
  }

  onTrainStatus(fn) {
    this.trainStatusStream.onmessage = (e) => fn(JSON.parse(e.data))
  }
}
