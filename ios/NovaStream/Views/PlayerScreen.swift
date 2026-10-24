import AVKit
import SwiftUI

/// Pilote AVPlayer et signale les flux qu'iOS ne sait pas lire.
@MainActor
final class PlayerController: ObservableObject {
    let player = AVPlayer()
    @Published private(set) var failure: String?
    @Published private(set) var currentURL: URL?

    private var statusObservation: NSKeyValueObservation?

    func load(_ url: URL) {
        failure = nil
        currentURL = url
        let asset = AVURLAsset(url: url, options: [
            "AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": XtreamClient.userAgent],
        ])
        let item = AVPlayerItem(asset: asset)
        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard item.status == .failed else { return }
            let message = item.error?.localizedDescription ?? "Lecture impossible."
            Task { @MainActor in self?.failure = message }
        }
        player.replaceCurrentItem(with: item)
        player.play()
    }

    func stop() {
        statusObservation = nil
        player.pause()
        player.replaceCurrentItem(with: nil)
    }
}

/// AVPlayerViewController : commandes natives, AirPlay, Picture in Picture et plein écran.
struct VideoPlayerView: UIViewControllerRepresentable {
    let player: AVPlayer

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.player = player
        controller.allowsPictureInPicturePlayback = true
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        controller.entersFullScreenWhenPlaybackBegins = false
        controller.exitsFullScreenWhenPlaybackEnds = true
        controller.videoGravity = .resizeAspect
        controller.view.backgroundColor = .black
        return controller
    }

    func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {
        if controller.player !== player { controller.player = player }
    }
}

struct PlayerScreen: View {
    let playback: Playback

    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @StateObject private var controller = PlayerController()
    @State private var currentChannel: MediaItem?

    private var isLandscape: Bool { verticalSizeClass == .compact }

    var body: some View {
        VStack(spacing: 0) {
            if !isLandscape { header }

            if playback.isLive && !isLandscape {
                video.aspectRatio(16 / 9, contentMode: .fit)
            } else {
                video
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .ignoresSafeArea(edges: isLandscape ? .all : [])
            }

            if playback.isLive && !isLandscape {
                liveBar
                channelList
            }
        }
        .background(Color.black.ignoresSafeArea())
        .statusBarHidden(isLandscape)
        .onAppear {
            currentChannel = playback.channels.first { $0.id == playback.channelId }
            controller.load(playback.url)
        }
        .onDisappear { controller.stop() }
    }

    private var video: some View {
        ZStack {
            Color.black
            VideoPlayerView(player: controller.player)
            if let failure = controller.failure {
                failureOverlay(failure)
            }
        }
    }

    private var title: String { currentChannel?.name ?? playback.title }

    private var header: some View {
        HStack(spacing: 12) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.down")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Theme.card, in: Circle())
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if let subtitle = playback.subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.background)
    }

    private var liveBar: some View {
        HStack(spacing: 12) {
            LiveBadge()
            Text(title)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
                .lineLimit(1)
            Spacer()
            if let channel = currentChannel {
                Button { model.toggleFavorite(channel) } label: {
                    Image(systemName: model.isFavorite(channel) ? "heart.fill" : "heart")
                        .foregroundStyle(model.isFavorite(channel) ? Theme.cinema : .white)
                }
            }
        }
        .padding(16)
        .background(Theme.panel)
    }

    private var channelList: some View {
        ScrollViewReader { proxy in
            List {
                ForEach(playback.channels) { channel in
                    ChannelRow(channel: channel, isPlaying: channel.id == currentChannel?.id) {
                        switchTo(channel)
                    }
                    .id(channel.id)
                    .listRowBackground(channel.id == currentChannel?.id ? Theme.active : Theme.background)
                    .listRowSeparatorTint(Theme.border)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .onAppear {
                if let id = currentChannel?.id { proxy.scrollTo(id, anchor: .center) }
            }
        }
    }

    private func switchTo(_ channel: MediaItem) {
        guard let url = model.liveURL(for: channel) else { return }
        currentChannel = channel
        controller.load(url)
    }

    /// Message d'erreur avec les solutions de repli (VLC, Infuse, copie du lien).
    private func failureOverlay(_ message: String) -> some View {
        let url = controller.currentURL
        return VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.title)
                .foregroundStyle(Theme.gold)
            Text("Ce flux ne peut pas être lu par le lecteur d'iOS.")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
            Text(message)
                .font(.caption)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            if let url {
                HStack(spacing: 10) {
                    Button("Ouvrir dans VLC") { openExternally(url, scheme: "vlc-x-callback://x-callback-url/stream?url=", appStore: "https://apps.apple.com/app/id650377962") }
                        .buttonStyle(PrimaryButtonStyle())
                    Button("Infuse") { openExternally(url, scheme: "infuse://x-callback-url/play?url=", appStore: "https://apps.apple.com/app/id1136220934") }
                        .buttonStyle(SecondaryButtonStyle())
                }
                Button("Copier le lien du flux") { UIPasteboard.general.string = url.absoluteString }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.accentLight)
            }
        }
        .padding(20)
        .frame(maxWidth: 420)
    }

    private func openExternally(_ url: URL, scheme: String, appStore: String) {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        let encoded = url.absoluteString.addingPercentEncoding(withAllowedCharacters: allowed) ?? url.absoluteString
        guard let target = URL(string: scheme + encoded) else { return }
        UIApplication.shared.open(target) { opened in
            if opened {
                controller.stop()
            } else if let store = URL(string: appStore) {
                // Appli absente : on propose de l'installer.
                UIApplication.shared.open(store)
            }
        }
    }
}
