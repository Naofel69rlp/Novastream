import SwiftUI

enum AppTab: Hashable {
    case home, live, movies, series, myList
}

enum CatalogSection: Hashable {
    case live, movies, series
}

enum LoadState: Equatable {
    case idle, loading, loaded, failed(String)
}

/// Ce que l'écran de lecture doit ouvrir.
struct Playback: Identifiable {
    let id = UUID()
    var title: String
    var subtitle: String?
    var url: URL
    var isLive: Bool
    /// Pour le direct : la liste des chaînes affichée sous le lecteur.
    var channels: [MediaItem] = []
    /// Chaîne lancée, pour la surligner dans la liste.
    var channelId: String? = nil
}

@MainActor
final class AppModel: ObservableObject {
    enum Phase { case launching, loggedOut, ready }

    @Published var phase: Phase = .launching
    @Published private(set) var user: UserInfo?
    @Published private(set) var isDemo = false
    @Published var selectedTab: AppTab = .home
    @Published var playback: Playback?

    @Published private(set) var liveCategories: [MediaCategory] = []
    @Published private(set) var channels: [MediaItem] = []
    @Published private(set) var movieCategories: [MediaCategory] = []
    @Published private(set) var movies: [MediaItem] = []
    @Published private(set) var seriesCategories: [MediaCategory] = []
    @Published private(set) var series: [MediaItem] = []
    @Published private(set) var states: [CatalogSection: LoadState] = [:]

    @Published private(set) var favorites: [MediaItem] = []

    private(set) var client: XtreamClient?

    private static let favoritesKey = "favorites.v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.favoritesKey),
           let saved = try? JSONDecoder().decode([MediaItem].self, from: data) {
            favorites = saved
        }
    }

    var liveFormat: LiveFormat {
        LiveFormat(rawValue: UserDefaults.standard.string(forKey: LiveFormat.storageKey) ?? "") ?? .hls
    }

    var server: String { client?.credentials.server ?? "Mode démo" }

    // MARK: Session

    func restoreSession() async {
        guard phase == .launching else { return }
        guard let saved = Keychain.load() else {
            phase = .loggedOut
            return
        }
        do {
            try await login(saved)
        } catch {
            phase = .loggedOut
        }
    }

    func login(_ credentials: Credentials) async throws {
        let client = XtreamClient(credentials: credentials)
        let user = try await client.authenticate()
        Keychain.save(client.credentials)
        resetCatalog()
        self.client = client
        self.user = user
        isDemo = false
        selectedTab = .home
        phase = .ready
    }

    func startDemo() {
        resetCatalog()
        client = nil
        isDemo = true
        user = DemoData.user
        selectedTab = .home
        phase = .ready
    }

    func logout() {
        Keychain.delete()
        resetCatalog()
        client = nil
        user = nil
        isDemo = false
        phase = .loggedOut
    }

    private func resetCatalog() {
        liveCategories = []; channels = []
        movieCategories = []; movies = []
        seriesCategories = []; series = []
        states = [:]
    }

    // MARK: Catalogue

    func state(of section: CatalogSection) -> LoadState { states[section] ?? .idle }

    func loadIfNeeded(_ section: CatalogSection) async {
        switch state(of: section) {
        case .idle, .failed: await load(section)
        case .loading, .loaded: break
        }
    }

    func reload() async {
        await withTaskGroup(of: Void.self) { group in
            for section in [CatalogSection.live, .movies, .series] {
                group.addTask { await self.load(section) }
            }
        }
    }

    func load(_ section: CatalogSection) async {
        states[section] = .loading
        do {
            if isDemo {
                switch section {
                case .live: (liveCategories, channels) = (DemoData.liveCategories, DemoData.channels)
                case .movies: (movieCategories, movies) = (DemoData.movieCategories, DemoData.movies)
                case .series: (seriesCategories, series) = (DemoData.seriesCategories, DemoData.series)
                }
            } else if let client {
                switch section {
                case .live:
                    async let categories = client.liveCategories()
                    async let streams = client.liveStreams()
                    (liveCategories, channels) = try await (categories, streams)
                case .movies:
                    async let categories = client.vodCategories()
                    async let streams = client.vodStreams()
                    (movieCategories, movies) = try await (categories, streams)
                case .series:
                    async let categories = client.seriesCategories()
                    async let items = client.series()
                    (seriesCategories, series) = try await (categories, items)
                }
            }
            states[section] = .loaded
        } catch is CancellationError {
            states[section] = .idle
        } catch {
            states[section] = .failed(error.localizedDescription)
        }
    }

    var recentMovies: [MediaItem] { Array(movies.sorted { $0.added > $1.added }.prefix(20)) }
    var recentSeries: [MediaItem] { Array(series.sorted { $0.added > $1.added }.prefix(20)) }

    func movieDetail(for item: MediaItem) async throws -> MovieDetail {
        if isDemo { return DemoData.movieDetail(for: item) }
        guard let client else { throw XtreamError.missingFields }
        return try await client.movieDetail(id: item.streamId)
    }

    func seriesDetail(for item: MediaItem) async throws -> SeriesDetail {
        if isDemo { return DemoData.seriesDetail(for: item) }
        guard let client else { throw XtreamError.missingFields }
        return try await client.seriesDetail(id: item.streamId)
    }

    // MARK: Lecture

    func play(_ item: MediaItem, detail: MovieDetail? = nil, in list: [MediaItem]? = nil) {
        let url: URL?
        switch item.kind {
        case .live:
            url = isDemo ? DemoData.liveStreamURL : client?.liveURL(item.streamId, format: liveFormat)
        case .movie:
            let ext = detail?.containerExtension ?? item.containerExtension
            url = isDemo ? DemoData.vodStreamURL : client?.movieURL(item.streamId, ext: ext)
        case .series:
            url = nil
        }
        guard let url else { return }
        playback = Playback(
            title: item.name,
            subtitle: item.kind == .live ? "En direct" : item.year,
            url: url,
            isLive: item.kind == .live,
            channels: item.kind == .live ? (list ?? channels) : [],
            channelId: item.kind == .live ? item.id : nil
        )
    }

    func play(_ episode: Episode, of show: MediaItem, season: Int) {
        let url = isDemo ? DemoData.vodStreamURL : client?.episodeURL(episode.id, ext: episode.containerExtension)
        guard let url else { return }
        playback = Playback(title: show.name, subtitle: "S\(season) É\(episode.number) · \(episode.title)", url: url, isLive: false)
    }

    func liveURL(for channel: MediaItem) -> URL? {
        isDemo ? DemoData.liveStreamURL : client?.liveURL(channel.streamId, format: liveFormat)
    }

    // MARK: Ma liste

    func isFavorite(_ item: MediaItem) -> Bool { favorites.contains { $0.id == item.id } }

    func toggleFavorite(_ item: MediaItem) {
        if let index = favorites.firstIndex(where: { $0.id == item.id }) {
            favorites.remove(at: index)
        } else {
            favorites.insert(item, at: 0)
        }
        if let data = try? JSONEncoder().encode(favorites) {
            UserDefaults.standard.set(data, forKey: Self.favoritesKey)
        }
    }
}
