import Foundation

enum XtreamError: LocalizedError {
    case missingFields
    case auth(String)
    case network(String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .missingFields: return "Veuillez renseigner l'URL du serveur, l'utilisateur et le mot de passe."
        case .auth(let message): return message
        case .network(let message): return message
        case .invalidResponse: return "Réponse inattendue du serveur (le contenu retourné n'est pas du JSON valide)."
        }
    }
}

struct Credentials: Codable, Equatable {
    var server: String
    var username: String
    var password: String
}

/// Format des flux en direct. AVPlayer lit le HLS (.m3u8) mais pas le MPEG-TS brut (.ts).
enum LiveFormat: String, CaseIterable, Identifiable {
    case hls = "m3u8"
    case ts = "ts"
    static let storageKey = "liveFormat"
    var id: String { rawValue }
    var label: String { self == .hls ? "HLS (.m3u8) recommandé" : "MPEG-TS (.ts)" }
}

/// Client de l'API player_api.php, équivalent Swift de api/xtream_client.py.
final class XtreamClient {
    static let userAgent = "NovaStream/1.0 (iPhone; iOS) AppleCoreMedia"

    let credentials: Credentials
    private let session: URLSession

    init(credentials: Credentials) {
        self.credentials = Credentials(
            server: Self.normalize(credentials.server),
            username: credentials.username.trimmingCharacters(in: .whitespaces),
            password: credentials.password.trimmingCharacters(in: .whitespaces)
        )
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 25
        config.httpAdditionalHeaders = [
            "User-Agent": Self.userAgent,
            "Accept": "application/json, text/plain, */*",
        ]
        session = URLSession(configuration: config)
    }

    static func normalize(_ url: String) -> String {
        var url = url.trimmingCharacters(in: .whitespacesAndNewlines)
        if !(url.hasPrefix("http://") || url.hasPrefix("https://")) {
            url = "http://\(url)"
        }
        while url.hasSuffix("/") { url.removeLast() }
        return url
    }

    // MARK: Authentification

    func authenticate() async throws -> UserInfo {
        let c = credentials
        guard !c.server.isEmpty, c.server != "http://", !c.username.isEmpty, !c.password.isEmpty else {
            throw XtreamError.missingFields
        }
        let response: AuthResponse
        do {
            response = try await request(action: nil)
        } catch XtreamError.network(let message) where message.contains("401") || message.contains("403") {
            throw XtreamError.auth("Accès refusé. Vérifiez vos identifiants ou le statut de l'abonnement.")
        }
        guard let user = response.userInfo else { throw XtreamError.invalidResponse }
        guard user.isAuthenticated else {
            switch user.status.lowercased() {
            case "expired": throw XtreamError.auth("Votre abonnement IPTV a expiré.")
            case "disabled", "banned": throw XtreamError.auth("Votre compte a été désactivé par le fournisseur.")
            default: throw XtreamError.auth("Nom d'utilisateur ou mot de passe incorrect.")
            }
        }
        return user
    }

    // MARK: Direct

    func liveCategories() async throws -> [MediaCategory] {
        try await request(LossyList<MediaCategory>.self, action: "get_live_categories").items
    }

    func liveStreams() async throws -> [MediaItem] {
        try await request(LossyList<LiveStreamDTO>.self, action: "get_live_streams").items.map(\.item)
    }

    // MARK: Films

    func vodCategories() async throws -> [MediaCategory] {
        try await request(LossyList<MediaCategory>.self, action: "get_vod_categories").items
    }

    func vodStreams() async throws -> [MediaItem] {
        try await request(LossyList<VodStreamDTO>.self, action: "get_vod_streams").items.map(\.item)
    }

    func movieDetail(id: String) async throws -> MovieDetail {
        try await request(action: "get_vod_info", params: ["vod_id": id])
    }

    // MARK: Séries

    func seriesCategories() async throws -> [MediaCategory] {
        try await request(LossyList<MediaCategory>.self, action: "get_series_categories").items
    }

    func series() async throws -> [MediaItem] {
        try await request(LossyList<SeriesDTO>.self, action: "get_series").items.map(\.item)
    }

    func seriesDetail(id: String) async throws -> SeriesDetail {
        try await request(action: "get_series_info", params: ["series_id": id])
    }

    // MARK: URLs de lecture

    func liveURL(_ streamId: String, format: LiveFormat) -> URL? {
        streamURL("live", streamId, ext: format.rawValue)
    }

    func movieURL(_ streamId: String, ext: String) -> URL? {
        streamURL("movie", streamId, ext: ext)
    }

    func episodeURL(_ episodeId: String, ext: String) -> URL? {
        streamURL("series", episodeId, ext: ext)
    }

    private func streamURL(_ kind: String, _ id: String, ext: String) -> URL? {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/")
        let user = credentials.username.addingPercentEncoding(withAllowedCharacters: allowed) ?? credentials.username
        let pass = credentials.password.addingPercentEncoding(withAllowedCharacters: allowed) ?? credentials.password
        let trimmed = ext.trimmingCharacters(in: CharacterSet(charactersIn: ". "))
        let cleanExt = trimmed.isEmpty ? "mp4" : trimmed
        return URL(string: "\(credentials.server)/\(kind)/\(user)/\(pass)/\(id).\(cleanExt)")
    }

    // MARK: Réseau

    private func request<T: Decodable>(_ type: T.Type = T.self, action: String?, params: [String: String] = [:]) async throws -> T {
        guard var components = URLComponents(string: "\(credentials.server)/player_api.php") else {
            throw XtreamError.network("URL du serveur invalide.")
        }
        var items = [
            URLQueryItem(name: "username", value: credentials.username),
            URLQueryItem(name: "password", value: credentials.password),
        ]
        if let action { items.append(URLQueryItem(name: "action", value: action)) }
        items += params.map { URLQueryItem(name: $0.key, value: $0.value) }
        components.queryItems = items
        guard let url = components.url else { throw XtreamError.network("URL du serveur invalide.") }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(from: url)
        } catch let error as URLError {
            switch error.code {
            case .timedOut:
                throw XtreamError.network("Délai de connexion dépassé. Le serveur ne répond pas.")
            case .appTransportSecurityRequiresSecureConnection:
                throw XtreamError.network("Connexion HTTP refusée par iOS (App Transport Security).")
            case .cancelled:
                throw CancellationError()
            default:
                throw XtreamError.network("Impossible de joindre le serveur. Vérifiez l'URL ou votre connexion Internet.")
            }
        }
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw XtreamError.network("Erreur HTTP \(http.statusCode) du serveur.")
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw XtreamError.invalidResponse
        }
    }
}
