import Foundation

// MARK: - Décodage tolérant
// Les serveurs Xtream Codes renvoient indifféremment "12", 12, 12.0, null ou "".

struct AnyKey: CodingKey {
    var stringValue: String
    var intValue: Int?
    init(_ string: String) { stringValue = string }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { stringValue = String(intValue); self.intValue = intValue }
}

struct FlexibleString: Decodable {
    let value: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { value = nil }
        else if let s = try? c.decode(String.self) { value = s }
        else if let i = try? c.decode(Int.self) { value = String(i) }
        else if let d = try? c.decode(Double.self) { value = String(d) }
        else if let b = try? c.decode(Bool.self) { value = b ? "1" : "0" }
        else { value = nil }
    }
}

/// Ignore une valeur JSON quelconque dans un tableau.
private struct Skip: Decodable {
    init(from decoder: Decoder) throws {}
}

/// Tableau dont les éléments illisibles sont ignorés ; un objet ou null donne un tableau vide.
struct LossyList<T: Decodable>: Decodable {
    let items: [T]

    init(from decoder: Decoder) throws {
        guard var c = try? decoder.unkeyedContainer() else { items = []; return }
        var out: [T] = []
        while !c.isAtEnd {
            if let value = try? c.decode(T.self) {
                out.append(value)
            } else {
                _ = try? c.decode(Skip.self)
            }
        }
        items = out
    }
}

extension KeyedDecodingContainer where Key == AnyKey {
    func string(_ key: String) -> String? {
        guard let flexible = try? decodeIfPresent(FlexibleString.self, forKey: AnyKey(key)),
              let raw = flexible.value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty else { return nil }
        return raw
    }

    func double(_ key: String) -> Double? {
        string(key).flatMap { Double($0.replacingOccurrences(of: ",", with: ".")) }
    }

    func int(_ key: String) -> Int? {
        guard let s = string(key) else { return nil }
        return Int(s) ?? Double(s).map { Int($0) }
    }

    /// backdrop_path peut être une chaîne ou un tableau de chaînes.
    func firstString(_ key: String) -> String? {
        if let list = try? decodeIfPresent([String].self, forKey: AnyKey(key)) {
            return list.first { !$0.isEmpty }
        }
        return string(key)
    }

    func nested(_ key: String) -> KeyedDecodingContainer<AnyKey>? {
        try? nestedContainer(keyedBy: AnyKey.self, forKey: AnyKey(key))
    }
}

extension URL {
    init?(remote string: String?) {
        guard let string, string.hasPrefix("http") else { return nil }
        self.init(string: string)
    }
}

// MARK: - Compte

struct UserInfo: Decodable, Equatable {
    var username: String
    var status: String
    var expiration: Date?
    var activeConnections: String
    var maxConnections: String
    var isTrial: Bool
    var isAuthenticated: Bool

    init(username: String, status: String, expiration: Date?, activeConnections: String,
         maxConnections: String, isTrial: Bool, isAuthenticated: Bool) {
        self.username = username
        self.status = status
        self.expiration = expiration
        self.activeConnections = activeConnections
        self.maxConnections = maxConnections
        self.isTrial = isTrial
        self.isAuthenticated = isAuthenticated
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        username = c.string("username") ?? ""
        status = c.string("status") ?? "Inconnu"
        if let ts = c.double("exp_date"), ts > 0 {
            expiration = Date(timeIntervalSince1970: ts)
        } else {
            expiration = nil
        }
        activeConnections = c.string("active_cons") ?? "0"
        maxConnections = c.string("max_connections") ?? "1"
        isTrial = c.string("is_trial") == "1"
        isAuthenticated = c.string("auth") == "1"
    }

    var expirationText: String {
        guard let expiration else { return "Illimité" }
        return expiration.formatted(date: .numeric, time: .omitted)
    }
}

struct AuthResponse: Decodable {
    let userInfo: UserInfo?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        userInfo = try? c.decode(UserInfo.self, forKey: AnyKey("user_info"))
    }
}

// MARK: - Catalogue

struct MediaCategory: Decodable, Identifiable, Hashable {
    let id: String
    let name: String

    init(id: String, name: String) {
        self.id = id
        self.name = name
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let id = c.string("category_id") else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "category_id manquant"))
        }
        self.id = id
        name = c.string("category_name") ?? "Sans catégorie"
    }
}

enum MediaKind: String, Codable, Hashable {
    case live, movie, series

    var label: String {
        switch self {
        case .live: return "Chaîne"
        case .movie: return "Film"
        case .series: return "Série"
        }
    }
}

/// Élément de catalogue commun aux chaînes, films et séries (équivalent de StreamItem).
struct MediaItem: Codable, Identifiable, Hashable {
    let kind: MediaKind
    let streamId: String
    let name: String
    let imageURL: URL?
    let categoryId: String?
    let rating: Double?
    let year: String?
    let containerExtension: String
    let added: Double
    let plot: String?
    let genre: String?

    var id: String { "\(kind.rawValue)-\(streamId)" }

    init(kind: MediaKind, streamId: String, name: String, imageURL: URL? = nil, categoryId: String? = nil,
         rating: Double? = nil, year: String? = nil, containerExtension: String = "mp4", added: Double = 0,
         plot: String? = nil, genre: String? = nil) {
        self.kind = kind
        self.streamId = streamId
        self.name = name
        self.imageURL = imageURL
        self.categoryId = categoryId
        self.rating = rating
        self.year = year
        self.containerExtension = containerExtension
        self.added = added
        self.plot = plot
        self.genre = genre
    }

    /// Badge de qualité déduit du nom (4K, FHD, HD), comme dans la vue Direct de bureau.
    var qualityBadge: String? {
        let upper = name.uppercased()
        if upper.contains("4K") || upper.contains("UHD") { return "4K" }
        if upper.contains("FHD") || upper.contains("1080") { return "FHD" }
        if upper.contains(" HD") || upper.hasSuffix("HD") || upper.contains("720") { return "HD" }
        return nil
    }

    var ratingText: String? {
        guard let rating, rating > 0 else { return nil }
        return rating.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(rating)) : String(format: "%.1f", rating)
    }

    var initials: String {
        let words = name.split(separator: " ").prefix(2)
        return words.map { String($0.prefix(1)) }.joined().uppercased()
    }
}

/// Note sur 10 : `rating` si présent, sinon `rating_5based` × 2.
func xtreamRating(in c: KeyedDecodingContainer<AnyKey>) -> Double? {
    if let r = c.double("rating"), r > 0 { return min(r, 10) }
    if let r = c.double("rating_5based"), r > 0 { return min(r * 2, 10) }
    return nil
}

struct LiveStreamDTO: Decodable {
    let item: MediaItem

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let id = c.string("stream_id") else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "stream_id manquant"))
        }
        item = MediaItem(
            kind: .live,
            streamId: id,
            name: c.string("name") ?? "Chaîne inconnue",
            imageURL: URL(remote: c.string("stream_icon")),
            categoryId: c.string("category_id"),
            added: c.double("added") ?? 0
        )
    }
}

struct VodStreamDTO: Decodable {
    let item: MediaItem

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let id = c.string("stream_id") else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "stream_id manquant"))
        }
        item = MediaItem(
            kind: .movie,
            streamId: id,
            name: c.string("name") ?? "Film sans titre",
            imageURL: URL(remote: c.string("stream_icon")),
            categoryId: c.string("category_id"),
            rating: xtreamRating(in: c),
            year: c.string("year"),
            containerExtension: c.string("container_extension") ?? "mp4",
            added: c.double("added") ?? 0
        )
    }
}

struct SeriesDTO: Decodable {
    let item: MediaItem

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let id = c.string("series_id") else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "series_id manquant"))
        }
        let release = c.string("releaseDate") ?? c.string("release_date")
        item = MediaItem(
            kind: .series,
            streamId: id,
            name: c.string("name") ?? "Série sans titre",
            imageURL: URL(remote: c.string("cover")),
            categoryId: c.string("category_id"),
            rating: xtreamRating(in: c),
            year: release.map { String($0.prefix(4)) },
            added: c.double("last_modified") ?? 0,
            plot: c.string("plot"),
            genre: c.string("genre")
        )
    }
}

// MARK: - Fiches détaillées

struct Episode: Decodable, Identifiable, Hashable {
    let id: String
    let number: Int
    let season: Int?
    let title: String
    let containerExtension: String
    let duration: String?
    let plot: String?
    let imageURL: URL?

    init(id: String, number: Int, season: Int?, title: String, containerExtension: String = "mp4",
         duration: String? = nil, plot: String? = nil, imageURL: URL? = nil) {
        self.id = id
        self.number = number
        self.season = season
        self.title = title
        self.containerExtension = containerExtension
        self.duration = duration
        self.plot = plot
        self.imageURL = imageURL
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard let id = c.string("id") else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "id d'épisode manquant"))
        }
        self.id = id
        number = c.int("episode_num") ?? 0
        season = c.int("season")
        title = c.string("title") ?? "Épisode \(number)"
        containerExtension = c.string("container_extension") ?? "mp4"
        let info = c.nested("info")
        duration = info?.string("duration")
        plot = info?.string("plot")
        imageURL = URL(remote: info?.string("movie_image"))
    }

    /// "00:42:10" → "42 min".
    var durationText: String? {
        guard let duration else { return nil }
        let parts = duration.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 3 else { return duration }
        let minutes = parts[0] * 60 + parts[1]
        return minutes > 0 ? "\(minutes) min" : nil
    }
}

struct SeriesDetail: Decodable {
    var name: String?
    var plot: String?
    var cast: String?
    var director: String?
    var genre: String?
    var year: String?
    var rating: Double?
    var coverURL: URL?
    var backdropURL: URL?
    var seasons: [Int: [Episode]]

    init(name: String?, plot: String?, cast: String?, director: String?, genre: String?, year: String?,
         rating: Double?, coverURL: URL?, backdropURL: URL?, seasons: [Int: [Episode]]) {
        self.name = name
        self.plot = plot
        self.cast = cast
        self.director = director
        self.genre = genre
        self.year = year
        self.rating = rating
        self.coverURL = coverURL
        self.backdropURL = backdropURL
        self.seasons = seasons
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        let info = c.nested("info")
        name = info?.string("name")
        plot = info?.string("plot")
        cast = info?.string("cast")
        director = info?.string("director")
        genre = info?.string("genre")
        year = (info?.string("releaseDate") ?? info?.string("release_date")).map { String($0.prefix(4)) }
        rating = info.flatMap { xtreamRating(in: $0) }
        coverURL = URL(remote: info?.string("cover"))
        backdropURL = URL(remote: info?.firstString("backdrop_path"))

        var result: [Int: [Episode]] = [:]
        if let byKey = try? c.decode([String: LossyList<Episode>].self, forKey: AnyKey("episodes")) {
            for (key, list) in byKey {
                for episode in list.items {
                    result[episode.season ?? Int(key) ?? 1, default: []].append(episode)
                }
            }
        } else if let byIndex = try? c.decode([LossyList<Episode>].self, forKey: AnyKey("episodes")) {
            for (index, list) in byIndex.enumerated() {
                for episode in list.items {
                    result[episode.season ?? index + 1, default: []].append(episode)
                }
            }
        }
        seasons = result.mapValues { $0.sorted { $0.number < $1.number } }
    }

    var sortedSeasons: [Int] { seasons.keys.sorted() }
}

struct MovieDetail: Decodable {
    var plot: String?
    var cast: String?
    var director: String?
    var genre: String?
    var duration: String?
    var year: String?
    var rating: Double?
    var backdropURL: URL?
    var posterURL: URL?
    var containerExtension: String?

    init(plot: String? = nil, cast: String? = nil, director: String? = nil, genre: String? = nil,
         duration: String? = nil, year: String? = nil, rating: Double? = nil, backdropURL: URL? = nil,
         posterURL: URL? = nil, containerExtension: String? = nil) {
        self.plot = plot
        self.cast = cast
        self.director = director
        self.genre = genre
        self.duration = duration
        self.year = year
        self.rating = rating
        self.backdropURL = backdropURL
        self.posterURL = posterURL
        self.containerExtension = containerExtension
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        let info = c.nested("info")
        plot = info?.string("plot") ?? info?.string("description")
        cast = info?.string("cast") ?? info?.string("actors")
        director = info?.string("director")
        genre = info?.string("genre")
        duration = info?.string("duration")
        year = (info?.string("releasedate") ?? info?.string("release_date")).map { String($0.prefix(4)) }
        rating = info.flatMap { xtreamRating(in: $0) }
        backdropURL = URL(remote: info?.firstString("backdrop_path"))
        posterURL = URL(remote: info?.string("movie_image") ?? info?.string("cover_big"))
        containerExtension = c.nested("movie_data")?.string("container_extension")
    }
}
