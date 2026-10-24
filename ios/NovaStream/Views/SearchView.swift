import SwiftUI

/// Recherche globale dans le direct, les films et les séries.
struct SearchView: View {
    @EnvironmentObject private var model: AppModel
    @State private var query = ""

    private func matches(_ items: [MediaItem]) -> [MediaItem] {
        guard query.count >= 2 else { return [] }
        return Array(items.lazy.filter { $0.name.localizedCaseInsensitiveContains(query) }.prefix(40))
    }

    var body: some View {
        let channels = matches(model.channels)
        let movies = matches(model.movies)
        let series = matches(model.series)

        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if query.count < 2 {
                    hint("Tapez au moins deux lettres pour chercher une chaîne, un film ou une série.")
                } else if channels.isEmpty && movies.isEmpty && series.isEmpty {
                    hint("Aucun résultat pour « \(query) ».")
                }
                if !channels.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionHeader(title: "Chaînes")
                        ForEach(channels) { channel in
                            ChannelRow(channel: channel) { model.play(channel, in: channels) }
                                .padding(.horizontal, 16)
                        }
                    }
                }
                grid("Films", movies)
                grid("Séries", series)
            }
            .padding(.vertical, 12)
        }
        .screenBackground()
        .navigationTitle("Rechercher")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always),
                    prompt: "Une chaîne, un film, une série…")
        .task {
            await model.loadIfNeeded(.live)
            await model.loadIfNeeded(.movies)
            await model.loadIfNeeded(.series)
        }
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 16)
    }

    @ViewBuilder
    private func grid(_ title: String, _ items: [MediaItem]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: title)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 104, maximum: 180), spacing: 12, alignment: .top)],
                          spacing: 18) {
                    ForEach(items) { item in
                        NavigationLink(value: item) { PosterCard(item: item) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}
