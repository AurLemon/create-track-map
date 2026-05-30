@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package littlechasiu.ctm.model

import com.simibubi.create.content.trains.signal.SignalBlock.SignalType
import com.simibubi.create.content.trains.signal.SignalBlockEntity.SignalState
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import java.util.*

object UUIDSerializer : KSerializer<UUID> {
  override val descriptor =
    PrimitiveSerialDescriptor("UUID", PrimitiveKind.STRING)

  override fun deserialize(decoder: Decoder): UUID {
    return UUID.fromString(decoder.decodeString())
  }

  override fun serialize(encoder: Encoder, value: UUID) {
    encoder.encodeString(value.toString())
  }
}

@Serializable
data class Point(
  val x: Double,
  val y: Double,
  val z: Double,
)

@Serializable
data class Path(
  val start: Point,
  val firstControlPoint: Point,
  val secondControlPoint: Point,
  val end: Point,
)

@Serializable
data class Edge(
  val dimension: String,
  val path: List<Point>,
)

@Serializable
data class DimensionLocation(
  val dimension: String,
  val location: Point
)

@Serializable
data class Portal(
  val from: DimensionLocation,
  val to: DimensionLocation,
)

@Serializable
data class Station(
  @Serializable(with = UUIDSerializer::class)
  val id: UUID,
  val name: String,
  val dimension: String,
  val location: Point,
  val angle: Double,
  val assembling: Boolean,
)

@Serializable
data class SignalSide(
  val type: SignalType,
  val state: SignalState,
  val angle: Double,
  @Serializable(with = UUIDSerializer::class)
  val block: UUID?,
)

@Serializable
data class Network(
  val tracks: List<Edge>,
  val portals: List<Portal>,
  val stations: List<Station>,
)

@Serializable
data class NetworkTrack(
  @Serializable(with = UUIDSerializer::class)
  val id: UUID,
  val dimension: String,
  val path: List<Point>,
)

@Serializable
data class NetworkPortal(
  @Serializable(with = UUIDSerializer::class)
  val id: UUID,
  val from: DimensionLocation,
  val to: DimensionLocation,
)

@Serializable
data class NetworkRealtimeSnapshot(
  @EncodeDefault
  val type: String = "snapshot",
  val revision: Long,
  val tracks: List<NetworkTrack>,
  val portals: List<NetworkPortal>,
  val stations: List<Station>,
)

@Serializable
data class NetworkRealtimePatch(
  @EncodeDefault
  val type: String = "patch",
  val revision: Long,
  val trackUpsert: List<NetworkTrack>,
  val trackRemove: List<@Serializable(with = UUIDSerializer::class) UUID>,
  val portalUpsert: List<NetworkPortal>,
  val portalRemove: List<@Serializable(with = UUIDSerializer::class) UUID>,
  val stationUpsert: List<Station>,
  val stationRemove: List<@Serializable(with = UUIDSerializer::class) UUID>,
) {
  fun isEmpty() =
    trackUpsert.isEmpty() &&
      trackRemove.isEmpty() &&
      portalUpsert.isEmpty() &&
      portalRemove.isEmpty() &&
      stationUpsert.isEmpty() &&
      stationRemove.isEmpty()
}

@Serializable
data class Signal(
  @Serializable(with = UUIDSerializer::class)
  val id: UUID,
  val dimension: String,
  val location: Point,
  val forward: SignalSide?,
  val reverse: SignalSide?,
)

@Serializable
data class SignalStatus(
  val signals: List<Signal>,
)

@Serializable
data class Block(
  @Serializable(with = UUIDSerializer::class)
  val id: UUID,
  val occupied: Boolean,
  val reserved: Boolean,
  val segments: List<Edge>,
)

@Serializable
data class BlockStatus(
  val blocks: List<Block>
)

@Serializable
data class BlockGeometry(
  @Serializable(with = UUIDSerializer::class)
  val id: UUID,
  val segments: List<Edge>,
)

@Serializable
data class BlockState(
  @Serializable(with = UUIDSerializer::class)
  val id: UUID,
  val occupied: Boolean,
  val reserved: Boolean,
)

@Serializable
data class BlockRealtimeSnapshot(
  @EncodeDefault
  val type: String = "snapshot",
  val revision: Long,
  val geometries: List<BlockGeometry>,
  val states: List<BlockState>,
)

@Serializable
data class BlockRealtimePatch(
  @EncodeDefault
  val type: String = "patch",
  val revision: Long,
  val geometryUpsert: List<BlockGeometry>,
  val geometryRemove: List<@Serializable(with = UUIDSerializer::class) UUID>,
  val stateUpsert: List<BlockState>,
  val stateRemove: List<@Serializable(with = UUIDSerializer::class) UUID>,
) {
  fun isEmpty() =
    geometryUpsert.isEmpty() &&
      geometryRemove.isEmpty() &&
      stateUpsert.isEmpty() &&
      stateRemove.isEmpty()
}

@Serializable
data class SignalRealtimeSnapshot(
  @EncodeDefault
  val type: String = "snapshot",
  val revision: Long,
  val signals: List<Signal>,
)

@Serializable
data class SignalRealtimePatch(
  @EncodeDefault
  val type: String = "patch",
  val revision: Long,
  val upsert: List<Signal>,
  val remove: List<@Serializable(with = UUIDSerializer::class) UUID>,
) {
  fun isEmpty() = upsert.isEmpty() && remove.isEmpty()
}

@Serializable
data class TrainCar(
  val id: Int,
  val leading: DimensionLocation? = null,
  val trailing: DimensionLocation? = null,
  val portal: Portal? = null,
)

@Serializable
data class CreateTrain(
  @Serializable(with = UUIDSerializer::class)
  val id: UUID,
  val name: String,
  val owner: String?,
  val cars: List<TrainCar>,
  val backwards: Boolean,
  val stopped: Boolean,
)

@Serializable
data class TrainStatus(
  val trains: List<CreateTrain>,
)

@Serializable
data class TrainRealtimeSnapshot(
  @EncodeDefault
  val type: String = "snapshot",
  val revision: Long,
  val trains: List<CreateTrain>,
)

@Serializable
data class TrainRealtimePatch(
  @EncodeDefault
  val type: String = "patch",
  val revision: Long,
  val upsert: List<CreateTrain>,
  val remove: List<@Serializable(with = UUIDSerializer::class) UUID>,
) {
  fun isEmpty() = upsert.isEmpty() && remove.isEmpty()
}
