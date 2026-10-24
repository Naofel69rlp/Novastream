import SwiftUI

/// En-tête commun des fiches film et série (affiche, titre, méta, résumé, boutons).
struct DetailHeader<Actions: View>: View {
    let item: MediaItem
    let backdropURL: URL?
    let posterURL: URL?
    let genre: String?
    let year: String?
    let rating: Double?
    let duration: String?
    let plot: String?
    let director: String?
    let cast: String?
    @ViewBuilder var actions: () -> Actions

    private var meta: [String] {
        var parts: [String] = []
        if let rating, rating > 0 { parts.append("★ \(String(format: "%.1f", rating))") }
        if let year, !year.isEmpty { parts.append(year) }
        if let genre { parts.append(genre) }
        if let duration { parts.append(duration) }
        return parts
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ZStack(alignment: .bottomLeading) {
                RemoteImage(url: backdropURL ?? posterURL ?? item.imageURL) {
                    Theme.gradient(for: item.name)
                }
                .frame(height: 260)
                .frame(maxWidth: .infinity)
                .clipped()
                .blur(radius: backdropURL == nil ? 20 : 0)
                .overlay(
                    LinearGradient(colors: [.clear, Theme.background.opacity(0.6), Theme.background],
                                   startPoint: .top, endPoint: .bottom)
                )

                HStack(alignment: .bottom, spacing: 16) {
                    Color.clear
                        .frame(width: 112, height: 168)
                        .overlay {
                            RemoteImage(url: posterURL ?? item.imageURL) { PosterPlaceholder(title: item.name) }
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border, lineWidth: 1))
                        .shadow(color: .black.opacity(0.6), radius: 12, y: 6)

                    VStack(alignment: .leading, spacing: 6) {
                        Text([item.kind.label, genre].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption.weight(.bold))
                            .tracking(1)
                            .foregroundStyle(Theme.eyebrow)
                            .lineLimit(1)
                        Text(item.name)
                            .font(Theme.display(24))
                            .foregroundStyle(.white)
                            .lineLimit(3)
                            .minimumScaleFactor(0.7)
                    }
                }
                .padding(.horizontal, 16)
                .offset(y: 40)
            }
            .padding(.bottom, 40)

            VStack(alignment: .leading, spacing: 14) {
                if !meta.isEmpty {
                    Text(meta.joined(separator: "  ·  "))
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                }
                HStack(spacing: 10) { actions() }
                if let plot {
                    Text(plot)
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if director != nil || cast != nil {
                    VStack(alignment: .leading, spacing: 3) {
                        if let director { Text("Réalisation : \(director)") }
                        if let cast { Text("Avec : \(cast)").lineLimit(3) }
                    }
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                }
            }
            .padding(.horizontal, 16)
        }
    }
}

struct FavoriteButton: View {
    let item: MediaItem
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Button { model.toggleFavorite(item) } label: {
            Label("Ma liste", systemImage: model.isFavorite(item) ? "checkmark" : "plus")
        }
        .buttonStyle(SecondaryButtonStyle())
    }
}

// MARK: - Film

struct MovieDetailView: View {
    let item: MediaItem
    @EnvironmentObject private var model: AppModel
    @State private var detail: MovieDetail?
    @State private var error: String?

    var body: some View {
        ScrollView {
            DetailHeader(
                item: item,
                backdropURL: detail?.backdropURL,
                posterURL: detail?.posterURL,
                genre: detail?.genre,
                year: detail?.year ?? item.year,
                rating: detail?.rating ?? item.rating,
                duration: detail?.duration.flatMap(formatDuration),
                plot: detail?.plot,
                director: detail?.director,
                cast: detail?.cast
            ) {
                Button { model.play(item, detail: detail) } label: {
                    Label("Lecture", systemImage: "play.fill")
                }
                .buttonStyle(PrimaryButtonStyle())
                FavoriteButton(item: item)
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(Theme.muted).padding(16)
            }
        }
        .screenBackground()
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard detail == nil else { return }
            do { detail = try await model.movieDetail(for: item) } catch { self.error = error.localizedDescription }
        }
    }
}

/// "01:52:00" → "1 h 52".
func formatDuration(_ raw: String) -> String? {
    let parts = raw.split(separator: ":").compactMap { Int($0) }
    guard parts.count == 3 else { return raw.isEmpty ? nil : raw }
    if parts[0] > 0 { return "\(parts[0]) h \(String(format: "%02d", parts[1]))" }
    return parts[1] > 0 ? "\(parts[1]) min" : nil
}

// MARK: - Série

struct SeriesDetailView: View {
    let item: MediaItem
    @EnvironmentObject private var model: AppModel
    @State private var detail: SeriesDetail?
    @State private var error: String?
    @State private var season = 1

    private var episodes: [Episode] { detail?.seasons[season] ?? [] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                DetailHeader(
                    item: item,
                    backdropURL: detail?.backdropURL,
                    posterURL: detail?.coverURL,
                    genre: detail?.genre ?? item.genre,
                    year: detail?.year ?? item.year,
                    rating: detail?.rating ?? item.rating,
                    duration: nil,
                    plot: detail?.plot ?? item.plot,
                    director: detail?.director,
                    cast: detail?.cast
                ) {
                    if let first = firstEpisode {
                        Button { model.play(first.episode, of: item, season: first.season) } label: {
                            Label("Lire S\(first.season) É\(first.episode.number)", systemImage: "play.fill")
                        }
                        .buttonStyle(PrimaryButtonStyle())
                    }
                    FavoriteButton(item: item)
                }

                if let detail {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Épisodes")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                        if detail.sortedSeasons.count > 1 {
                            ChipRow(
                                options: detail.sortedSeasons.map {
                                    ChipOption(id: $0, label: "Saison \($0) · \(detail.seasons[$0]?.count ?? 0)")
                                },
                                selection: $season
                            )
                        }
                        LazyVStack(spacing: 14) {
                            ForEach(episodes) { episode in
                                Button { model.play(episode, of: item, season: season) } label: {
                                    EpisodeRow(episode: episode)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                        if episodes.isEmpty {
                            Text("Aucun épisode disponible.")
                                .foregroundStyle(Theme.muted)
                                .padding(.horizontal, 16)
                        }
                    }
                } else if let error {
                    Text(error).font(.footnote).foregroundStyle(Theme.muted).padding(.horizontal, 16)
                } else {
                    ProgressView().tint(.white).frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 30)
        }
        .screenBackground()
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard detail == nil else { return }
            do {
                let loaded = try await model.seriesDetail(for: item)
                detail = loaded
                season = loaded.sortedSeasons.first ?? 1
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private var firstEpisode: (season: Int, episode: Episode)? {
        guard let detail, let first = detail.sortedSeasons.first,
              let episode = detail.seasons[first]?.first else { return nil }
        return (first, episode)
    }
}

struct EpisodeRow: View {
    let episode: Episode

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Color.clear
                .frame(width: 136, height: 77)
                .overlay {
                    RemoteImage(url: episode.imageURL) {
                        ZStack {
                            Theme.card
                            Text("\(episode.number)")
                                .font(Theme.display(24))
                                .foregroundStyle(Theme.muted)
                        }
                    }
                }
                .overlay {
                    Image(systemName: "play.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.white.opacity(0.85))
                        .shadow(radius: 4)
                }
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text("\(episode.number). \(episode.title)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                if let duration = episode.durationText {
                    Text(duration).font(.caption).foregroundStyle(Theme.muted)
                }
                if let plot = episode.plot {
                    Text(plot)
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }
}
