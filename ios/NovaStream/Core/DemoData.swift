import Foundation

/// Catalogue fictif pour essayer l'appli sans abonnement (mêmes noms « Nova » que la version Windows).
enum DemoData {
    /// Flux de test publics d'Apple (HLS), lisibles par AVPlayer.
    static let liveStreamURL = URL(string: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8")!
    static let vodStreamURL = URL(string: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8")!

    static let user = UserInfo(
        username: "demo", status: "Active",
        expiration: DateComponents(calendar: .current, year: 2030, month: 1, day: 1).date,
        activeConnections: "0", maxConnections: "1", isTrial: true, isAuthenticated: true
    )

    static let liveCategories = [
        MediaCategory(id: "1", name: "FR | Généralistes"),
        MediaCategory(id: "2", name: "Sport"),
        MediaCategory(id: "3", name: "Info"),
        MediaCategory(id: "4", name: "Jeunesse"),
    ]

    static let channels: [MediaItem] = {
        let themes = [("Sport", "2"), ("Ciné", "1"), ("Kids", "4"), ("Doc", "1"), ("Info", "3")]
        return (1...40).map { n in
            let theme = themes[(n - 1) % themes.count]
            return MediaItem(kind: .live, streamId: "\(n)", name: "Nova \(theme.0) \(n) \(n % 3 == 0 ? "FHD" : "HD")",
                             categoryId: theme.1)
        }
    }()

    static let movieCategories = [
        MediaCategory(id: "10", name: "Science-fiction"),
        MediaCategory(id: "11", name: "Aventure"),
        MediaCategory(id: "12", name: "Drame"),
    ]

    static let movies: [MediaItem] = (0..<24).map { n in
        MediaItem(kind: .movie, streamId: "m\(n)", name: "Nova \(n)", categoryId: ["10", "11", "12"][n % 3],
                  rating: n % 4 == 0 ? nil : Double(50 + (n * 7) % 40) / 10, year: "\(2010 + n % 14)",
                  added: Double(1000 - n))
    }

    static let seriesCategories = [
        MediaCategory(id: "20", name: "Science-fiction"),
        MediaCategory(id: "21", name: "Policier"),
    ]

    static let series: [MediaItem] = (0..<16).map { n in
        MediaItem(kind: .series, streamId: "s\(n)", name: "Série Nébuleuse atlas \(50 + n)",
                  categoryId: n % 2 == 0 ? "20" : "21", rating: 8.2, year: "2012", added: Double(1000 - n),
                  plot: "Dans un futur proche, une équipe d'explorateurs découvre un signal venu des confins du système solaire.",
                  genre: "Science-fiction")
    }

    static func movieDetail(for item: MediaItem) -> MovieDetail {
        MovieDetail(
            plot: "Un film de démonstration pour essayer le lecteur de NovaStream sur iPhone.",
            cast: "Distribution Fictive", director: "Réalisation Fictive", genre: "Science-fiction",
            duration: "01:52:00", year: item.year, rating: item.rating, containerExtension: "m3u8"
        )
    }

    static func seriesDetail(for item: MediaItem) -> SeriesDetail {
        var seasons: [Int: [Episode]] = [:]
        for season in 1...3 {
            seasons[season] = (1...8).map { n in
                Episode(id: "\(item.streamId)-\(season)-\(n)", number: n, season: season, title: "Chapitre \(n)",
                        containerExtension: "m3u8", duration: "00:42:00",
                        plot: "Les explorateurs approchent du signal.")
            }
        }
        return SeriesDetail(
            name: item.name,
            plot: "Dans un futur proche, une équipe d'explorateurs découvre un signal venu des confins du système solaire. Chaque épisode révèle un peu plus du mystère.",
            cast: "Distribution Fictive", director: "Showrunner Fictif", genre: "Science-fiction", year: "2012",
            rating: 8.2, coverURL: nil, backdropURL: nil, seasons: seasons
        )
    }
}
