package littlechasiu.ctm

import com.simibubi.create.Create
import com.simibubi.create.content.trains.graph.TrackEdge
import com.simibubi.create.content.trains.graph.TrackGraph
import com.simibubi.create.content.trains.graph.TrackNode
import com.simibubi.create.content.trains.entity.Train
import com.simibubi.create.content.trains.signal.SignalBlock.SignalType
import com.simibubi.create.content.trains.signal.SignalBlockEntity.SignalState
import com.simibubi.create.content.trains.signal.SignalBoundary
import com.simibubi.create.content.trains.signal.SignalEdgeGroup
import com.simibubi.create.content.trains.station.GlobalStation
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import littlechasiu.ctm.model.*
import net.minecraft.world.phys.Vec3
import java.util.*
import kotlin.concurrent.thread
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

class TrackWatcher() {
  var enable: Boolean = true
  var watchInterval: Duration = 0.5.seconds
  private var stopping: Boolean = false
  private var thread: Thread? = null

  companion object {
    val RR = Create.RAILWAYS
  }

  fun start() {
    if (!enable) {
      return
    }

    thread = thread(name = "TrackMap watcher") {
      runBlocking {
        launch {
          watch()
        }
      }
    }
  }

  fun stop() {
    if (!enable) {
      return
    }

    stopping = true
    thread?.join()
    stopping = false
  }

  private suspend fun watch() {
    while (!stopping) {
      try {
        update()
      } catch (e: Exception) {
        TrackMap.LOGGER.warn("Exception during update loop")
        e.printStackTrace()
        continue
      }
      delay(watchInterval)
    }
  }

  val networkChannel = Channel<Network>(Channel.CONFLATED)
  val networkPatchChannel = Channel<NetworkRealtimePatch>(Channel.CONFLATED)
  val signalChannel = Channel<SignalStatus>(Channel.CONFLATED)
  val signalPatchChannel = Channel<SignalRealtimePatch>(Channel.CONFLATED)
  val trainChannel = Channel<TrainStatus>(Channel.CONFLATED)
  val trainPatchChannel = Channel<TrainRealtimePatch>(Channel.CONFLATED)
  val blockChannel = Channel<BlockStatus>(Channel.CONFLATED)
  val blockPatchChannel = Channel<BlockRealtimePatch>(Channel.CONFLATED)

  data class CreateStation(
    val internal: GlobalStation,
    val edge: TrackEdge,
  ) {
    private val id: UUID get() = internal.id
    private val name: String get() = internal.name
    private val dimension get() = edge.node1.location.dimension.string
    private val location get() = internal.locationOn(edge)
    private val angle get() = internal.angleOn(edge)
    private val assembling get() = internal.assembling

    override fun equals(other: Any?) =
      other != null && javaClass == other.javaClass &&
        internal == (other as CreateStation).internal

    override fun hashCode() = internal.hashCode()

    val sendable
      get() =
        Station(
          id = id,
          name = name,
          dimension = dimension,
          location = location.sendable,
          angle = angle,
          assembling = assembling,
        )
  }

  data class CreateSignal(
    private val internal: SignalBoundary,
    private val edge: TrackEdge,
  ) {
    private val id: UUID get() = internal.id
    private val dimension get() = edge.node1.location.dimension.string
    private val location: Vec3 get() = internal.locationOn(edge)
    private val forwardAngle get() = internal.angleOn(edge)
    private val reverseAngle get() = forwardAngle + 180

    private val forwardType: SignalType? get() = internal.types.first
    private val reverseType: SignalType? get() = internal.types.second
    private val forwardState: SignalState? get() = internal.cachedStates.first
    private val reverseState: SignalState? get() = internal.cachedStates.second
    private val forwardGroup: SignalEdgeGroup? get() = RR.signalEdgeGroups[internal.groups.first]
    private val reverseGroup: SignalEdgeGroup? get() = RR.signalEdgeGroups[internal.groups.second]

    private var forwardSegment: Track? = null
    private var reverseSegment: Track? = null

    init {
      val (fwd, rev) = edge.path.divideAt(internal.position / edge.length)
      this.forwardSegment = fwd
      this.reverseSegment = rev
    }

    override fun equals(other: Any?) =
      other != null && javaClass == other.javaClass &&
        internal == (other as CreateSignal).internal

    override fun hashCode() = internal.hashCode()

    val sendable
      get() =
        Signal(
          id = id,
          dimension = dimension,
          location = location.sendable,
          forward = when (forwardState) {
            null -> null
            SignalState.INVALID -> null
            else -> SignalSide(
              type = forwardType!!,
              state = forwardState!!,
              angle = forwardAngle,
              block = forwardGroup?.id,
            )
          },
          reverse = when (reverseState) {
            null -> null
            SignalState.INVALID -> null
            else -> SignalSide(
              type = reverseType!!,
              state = reverseState!!,
              angle = reverseAngle,
              block = reverseGroup?.id,
            )
          },
        )
  }

  data class CreateSignalBlock(
    private val internal: SignalEdgeGroup,
  ) {
    private val id: UUID get() = internal.id
    private val occupied: Boolean get() = RR.trains.values.any { it.occupiedSignalBlocks.containsKey(id) }
    private val reserved: Boolean get() = RR.trains.values.any { it.reservedSignalBlocks.contains(id) }

    val segments = mutableListOf<Track>()
    val portals = mutableSetOf<Portal>()

    override fun equals(other: Any?) =
      other != null && javaClass == other.javaClass &&
        internal == (other as CreateSignalBlock).internal &&
        segments == other.segments

    override fun hashCode() = internal.hashCode()

    val sendable
      get() =
        Block(
          id = id,
          occupied = occupied,
          reserved = reserved,
          segments = segments.map { it.sendable },
        )
  }

  private var nodes = mutableSetOf<TrackNode>()
  private var edges = mutableSetOf<TrackEdge>()
  private var signals = mutableSetOf<CreateSignal>()
  private var stations = mutableSetOf<CreateStation>()
  private var trains = mutableSetOf<Train>()
  private var blocks = mutableMapOf<UUID, CreateSignalBlock>()

  fun portalsInBlock(block: UUID): Collection<Portal> =
    blocks[block]?.portals ?: listOf()

  val network
    get() =
      Network(
        tracks = edges.map { it.sendable }.filterIsInstance<Edge>().toList(),
        portals = edges.map { it.sendable }.filterIsInstance<Portal>().toList(),
        stations = stations.map { it.sendable }.toList(),
      )

  val signalStatus
    get() =
      SignalStatus(
        signals = signals.map { it.sendable }.toList(),
      )

  val blockStatus
    get() =
      BlockStatus(
        blocks = blocks.values.map { it.sendable }.toList()
      )

  private var networkRevision = 0L
  private var blockRevision = 0L
  private var signalRevision = 0L
  private var trainRevision = 0L
  private var lastNetworkTracks = mapOf<UUID, NetworkTrack>()
  private var lastNetworkPortals = mapOf<UUID, NetworkPortal>()
  private var lastNetworkStations = mapOf<UUID, Station>()
  private var lastBlockGeometries = mapOf<UUID, BlockGeometry>()
  private var lastBlockStates = mapOf<UUID, BlockState>()
  private var lastSignals = mapOf<UUID, Signal>()
  private var lastTrains = mapOf<UUID, CreateTrain>()

  private fun stableUUID(type: String, key: String) =
    UUID.nameUUIDFromBytes("$type|$key".toByteArray(Charsets.UTF_8))

  private fun Point.key() = "$x,$y,$z"

  private fun DimensionLocation.key() =
    "$dimension|${location.key()}"

  private fun Edge.networkTrack(): NetworkTrack {
    val key = "$dimension|${path.joinToString(";") { it.key() }}"

    return NetworkTrack(
      id = stableUUID("track", key),
      dimension = dimension,
      path = path,
    )
  }

  private fun Portal.networkPortal(): NetworkPortal {
    val key = "${from.key()}|${to.key()}"

    return NetworkPortal(
      id = stableUUID("portal", key),
      from = from,
      to = to,
    )
  }

  private fun Network.trackMap() =
    tracks.map { it.networkTrack() }.associateBy { it.id }

  private fun Network.portalMap() =
    portals.map { it.networkPortal() }.associateBy { it.id }

  private fun Network.stationMap() =
    stations.associateBy { it.id }

  private fun Block.geometry() =
    BlockGeometry(
      id = id,
      segments = segments,
    )

  private fun Block.state() =
    BlockState(
      id = id,
      occupied = occupied,
      reserved = reserved,
    )

  private fun BlockStatus.geometries() =
    blocks.associate { it.id to it.geometry() }

  private fun BlockStatus.states() =
    blocks.associate { it.id to it.state() }

  val networkRealtimeSnapshot
    get() =
      NetworkRealtimeSnapshot(
        revision = networkRevision,
        tracks = network.trackMap().values.toList(),
        portals = network.portalMap().values.toList(),
        stations = network.stations,
      )

  val blockRealtimeSnapshot
    get() =
      BlockRealtimeSnapshot(
        revision = blockRevision,
        geometries = blockStatus.geometries().values.toList(),
        states = blockStatus.states().values.toList(),
      )

  val signalRealtimeSnapshot
    get() =
      SignalRealtimeSnapshot(
        revision = signalRevision,
        signals = signalStatus.signals,
      )

  val trainStatus
    get() =
      TrainStatus(
        trains = trains.map { it.sendable }.toList(),
      )

  val trainRealtimeSnapshot
    get() =
      TrainRealtimeSnapshot(
        revision = trainRevision,
        trains = trainStatus.trains,
      )

  private suspend fun sendNetworkPatch(status: Network) {
    val nextTracks = status.trackMap()
    val nextPortals = status.portalMap()
    val nextStations = status.stationMap()
    val removedTrackIds = lastNetworkTracks.keys - nextTracks.keys
    val removedPortalIds = lastNetworkPortals.keys - nextPortals.keys
    val removedStationIds = lastNetworkStations.keys - nextStations.keys
    val trackUpsert = nextTracks.values.filter {
      lastNetworkTracks[it.id] != it
    }
    val portalUpsert = nextPortals.values.filter {
      lastNetworkPortals[it.id] != it
    }
    val stationUpsert = nextStations.values.filter {
      lastNetworkStations[it.id] != it
    }
    val patch = NetworkRealtimePatch(
      revision = networkRevision + 1,
      trackUpsert = trackUpsert,
      trackRemove = removedTrackIds.toList(),
      portalUpsert = portalUpsert,
      portalRemove = removedPortalIds.toList(),
      stationUpsert = stationUpsert,
      stationRemove = removedStationIds.toList(),
    )

    lastNetworkTracks = nextTracks
    lastNetworkPortals = nextPortals
    lastNetworkStations = nextStations

    if (!patch.isEmpty()) {
      networkRevision = patch.revision
      networkPatchChannel.send(patch)
    }
  }

  private suspend fun sendBlockPatch(status: BlockStatus) {
    val nextGeometries = status.geometries()
    val nextStates = status.states()
    val removedGeometryIds = lastBlockGeometries.keys - nextGeometries.keys
    val removedStateIds = lastBlockStates.keys - nextStates.keys
    val geometryUpsert = nextGeometries.values.filter {
      lastBlockGeometries[it.id] != it
    }
    val stateUpsert = nextStates.values.filter {
      lastBlockStates[it.id] != it
    }
    val patch = BlockRealtimePatch(
      revision = blockRevision + 1,
      geometryUpsert = geometryUpsert,
      geometryRemove = removedGeometryIds.toList(),
      stateUpsert = stateUpsert,
      stateRemove = removedStateIds.toList(),
    )

    lastBlockGeometries = nextGeometries
    lastBlockStates = nextStates

    if (!patch.isEmpty()) {
      blockRevision = patch.revision
      blockPatchChannel.send(patch)
    }
  }

  private suspend fun sendSignalPatch(status: SignalStatus) {
    val nextSignals = status.signals.associateBy { it.id }
    val removedSignalIds = lastSignals.keys - nextSignals.keys
    val upsert = nextSignals.values.filter {
      lastSignals[it.id] != it
    }
    val patch = SignalRealtimePatch(
      revision = signalRevision + 1,
      upsert = upsert,
      remove = removedSignalIds.toList(),
    )

    lastSignals = nextSignals

    if (!patch.isEmpty()) {
      signalRevision = patch.revision
      signalPatchChannel.send(patch)
    }
  }

  private suspend fun sendTrainPatch(status: TrainStatus) {
    val nextTrains = status.trains.associateBy { it.id }
    val removedTrainIds = lastTrains.keys - nextTrains.keys
    val upsert = nextTrains.values.filter {
      lastTrains[it.id] != it
    }
    val patch = TrainRealtimePatch(
      revision = trainRevision + 1,
      upsert = upsert,
      remove = removedTrainIds.toList(),
    )

    lastTrains = nextTrains

    if (!patch.isEmpty()) {
      trainRevision = patch.revision
      trainPatchChannel.send(patch)
    }
  }

  private suspend fun update() {
    val networkEdges = mutableMapOf<TrackGraph, Set<TrackEdge>>()
    val thisNodes = mutableSetOf<TrackNode>()
    val thisEdges = mutableSetOf<TrackEdge>()
    val thisSignals = mutableSetOf<CreateSignal>()
    val thisStations = mutableSetOf<CreateStation>()

    RR.trackNetworks.forEach { (_, net) ->
      // Track topology
      val netNodes = net.nodes.map { net.locateNode(it) }
      val netEdges = netNodes.map { net.getConnectionsFrom(it) }
        .flatMap { it.values }
      thisNodes.addAll(netNodes)
      thisEdges.addAll(netEdges)

      networkEdges[net] = netEdges.toSet()

      // Signals and stations
      thisEdges.forEach { edge ->
        edge.edgeData.points.forEach { pt ->
          when (pt) {
            is GlobalStation -> thisStations.add(CreateStation(pt, edge))
            is SignalBoundary -> thisSignals.add(CreateSignal(pt, edge))
          }
        }
      }
    }

    nodes.replaceWith(thisNodes)
    edges.replaceWith(thisEdges)
    signals.replaceWith(thisSignals)
    stations.replaceWith(thisStations)

    // Signal blocks / track occupancy
    val thisBlocks = mutableMapOf<UUID, CreateSignalBlock>()
    RR.signalEdgeGroups.forEach { (_, grp) ->
      thisBlocks[grp.id] = CreateSignalBlock(grp)
    }

    RR.trackNetworks.forEach { (_, net) ->
      networkEdges[net]?.forEach { edge ->
        if (edge.isInterDimensional) {
          (edge.sendable as? Portal)?.let { portal ->
            thisBlocks[edge.edgeData.getEffectiveEdgeGroupId(net)]?.portals?.add(portal)
          }
        } else {
          if (edge.edgeData.hasSignalBoundaries()) {
            val signals =
              edge.edgeData.points.filterIsInstance<SignalBoundary>()
                .sortedBy {
                  if (it.isPrimary(edge.node2)) it.position
                  else edge.length - it.position
                }
            if (signals.isEmpty()) {
              return
            }

            val path = edge.path
            val segments = mutableListOf<Track>()

            segments.add(
              path.divideAt(
                (
                  if (signals[0].isPrimary(edge.node2)) signals[0].position
                  else edge.length - signals[0].position
                  ) / edge.length
              ).first
            )

            signals.windowed(2).forEach { sigs ->
              val leftSig = sigs[0]
              val rightSig = sigs[1]
              val (rest, _) = path.divideAt(
                (if (rightSig.isPrimary(edge.node2)) rightSig.position
                else edge.length - rightSig.position) / edge.length
              )
              val (_, seg) = rest.divideAt(
                (if (leftSig.isPrimary(edge.node2)) leftSig.position
                else edge.length - leftSig.position) / edge.length
              )
              segments.add(seg)
            }

            segments.add(
              path.divideAt(
                (
                  if (signals.last()
                      .isPrimary(edge.node2)
                  ) signals.last().position
                  else edge.length - signals.last().position
                  ) / edge.length
              ).second
            )

            segments.windowed(2).zip(signals).forEach { (segs, sig) ->
              val leftSeg = segs[0]
              val rightSeg = segs[1]

              thisBlocks[sig.getGroup(edge.node1)]?.segments?.add(leftSeg)
              thisBlocks[sig.getGroup(edge.node2)]?.segments?.add(rightSeg)
            }
          } else {
            thisBlocks[edge.edgeData.getEffectiveEdgeGroupId(net)]?.segments?.add(
              edge.path
            )
          }
        }
      }
    }
    blocks.clear()
    blocks.putAll(thisBlocks)

    // Trains
    trains.replaceWith(RR.trains.values)

    val currentNetwork = network
    val currentSignalStatus = signalStatus
    val currentBlockStatus = blockStatus
    val currentTrainStatus = trainStatus

    networkChannel.send(currentNetwork)
    sendNetworkPatch(currentNetwork)
    signalChannel.send(currentSignalStatus)
    sendSignalPatch(currentSignalStatus)
    blockChannel.send(currentBlockStatus)
    sendBlockPatch(currentBlockStatus)
    trainChannel.send(currentTrainStatus)
    sendTrainPatch(currentTrainStatus)
  }
}
