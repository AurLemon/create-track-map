package littlechasiu.ctm

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.*
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromStream
import kotlinx.serialization.json.encodeToStream
import littlechasiu.ctm.model.Config
import net.minecraft.commands.Commands
import net.neoforged.neoforge.event.RegisterCommandsEvent
import net.neoforged.neoforge.event.server.ServerStartedEvent
import net.neoforged.neoforge.event.server.ServerStoppingEvent
import net.neoforged.fml.common.Mod
import net.neoforged.fml.loading.FMLPaths
import org.apache.logging.log4j.LogManager
import org.apache.logging.log4j.Logger
import thedarkcolour.kotlinforforge.neoforge.forge.FORGE_BUS
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import kotlin.time.Duration.Companion.seconds

@Mod(TrackMap.MODID)
object TrackMap {
  const val MODID: String = "createtrackmap"

  private const val configFileName = "create-track-map.json"
  private const val injectionCssFileName = "create-track-map-injection.css"

  @OptIn(ExperimentalSerializationApi::class)
  private val JSON = Json {
    isLenient = true
    ignoreUnknownKeys = true
    prettyPrint = true
    prettyPrintIndent = "  "
  }

  val LOGGER: Logger = LogManager.getLogger(MODID)

  private var config = Config()
  val watcher = TrackWatcher()
  private val server = Server()

  val network get() = watcher.network
  val networkRealtimeSnapshot get() = watcher.networkRealtimeSnapshot
  val signals get() = watcher.signalStatus
  val signalRealtimeSnapshot get() = watcher.signalRealtimeSnapshot
  val blocks get() = watcher.blockStatus
  val blockRealtimeSnapshot get() = watcher.blockRealtimeSnapshot
  val trains get() = watcher.trainStatus
  val trainRealtimeSnapshot get() = watcher.trainRealtimeSnapshot

  private val scope = CoroutineScope(context = Dispatchers.IO)
  private val <T> Channel<T>.flow: SharedFlow<T>
    get() = consumeAsFlow().distinctUntilChanged()
      .shareIn(scope, SharingStarted.Eagerly)
  val networkFlow = watcher.networkChannel.flow
  val networkPatchFlow = watcher.networkPatchChannel.flow
  val signalFlow = watcher.signalChannel.flow
  val signalPatchFlow = watcher.signalPatchChannel.flow
  val blockFlow = watcher.blockChannel.flow
  val blockPatchFlow = watcher.blockPatchChannel.flow
  val trainFlow = watcher.trainChannel.flow
  val trainPatchFlow = watcher.trainPatchChannel.flow

  private fun ensureInjectionCss(configDir: Path): Path {
    val injectionCssFile = configDir.resolve(injectionCssFileName)

    if (!Files.exists(injectionCssFile)) {
      LOGGER.warn("Create Track Map injection CSS does not exist, writing defaults to $injectionCssFileName")
      Files.writeString(
        injectionCssFile,
        "/* Add Create Track Map custom CSS here. */\n",
        StandardOpenOption.CREATE_NEW
      )
    }

    return injectionCssFile
  }

  @OptIn(ExperimentalSerializationApi::class)
  private fun loadConfig() {
    var injectionCssFile: Path? = null
    try {
      val configDir = Path.of(FMLPaths.CONFIGDIR.get().toString())
      val configFile = configDir.resolve(configFileName)
      injectionCssFile = ensureInjectionCss(configDir)

      if (Files.exists(configFile)) {
        config = JSON.decodeFromStream(Files.newInputStream(configFile))
      } else {
        LOGGER.warn("Create Track Map config does not exist, writing defaults to $configFileName")
        config = Config()
        JSON.encodeToStream(
          config,
          Files.newOutputStream(configFile, StandardOpenOption.CREATE)
        )
      }
    } catch (e: Exception) {
      LOGGER.error("Error loading Create Track Map config, using defaults")
      e.printStackTrace()
      config = Config()
    }

    watcher.enable = config.enable
    server.enable = config.enable
    watcher.watchInterval = config.watchIntervalSeconds.seconds
    server.port = config.serverPort
    server.apiBaseUrl = config.apiBaseUrl
    server.mapStyle = config.mapStyle
    server.mapView = config.mapView
    server.dimensions = config.dimensions
    server.layers = config.layers
    server.satelliteMaps = config.satelliteMaps
    server.injectionCssPath = injectionCssFile
  }

  private fun reload() {
    watcher.stop()
    server.stop()

    loadConfig()

    watcher.start()
    server.start()
  }

  fun registerCommands(event: RegisterCommandsEvent) {
    event.dispatcher.register(Commands.literal("ctm")
      .then(Commands.literal("reload")
        .requires { src -> src.hasPermission(4) }.executes { _ ->
          reload()
          1
        })
    )
  }

  fun serverStarted(event: ServerStartedEvent) {
    watcher.start()
    server.start()
  }

  fun serverStopping(event: ServerStoppingEvent) {
    watcher.stop()
    server.stop()
  }
  init {
    loadConfig()
    FORGE_BUS.addListener(::registerCommands)
    FORGE_BUS.addListener(::serverStarted)
    FORGE_BUS.addListener(::serverStopping)
  }
}
