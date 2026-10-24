import SwiftUI

/// Liste des chaînes par catégorie (vue « En direct »).
struct LiveView: View {
    @EnvironmentObject private var model: AppModel
    @State private var category = "all"
    @State private var query = ""

    private var filtered: [MediaItem] {
        model.channels.filter { channel in
            (category == "all" || channel.categoryId == category)
                && (query.isEmpty || channel.name.localizedCaseInsensitiveContains(query))
        }
    }

    private var chipOptions: [ChipOption<String>] {
        [ChipOption(id: "all", label: "Toutes les chaînes")]
            + model.liveCategories.map { ChipOption(id: $0.id, label: $0.name) }
    }

    var body: some View {
        NavigationStack {
            LoadStateContainer(state: model.state(of: .live), retry: { await model.load(.live) }) {
                let channels = filtered
                List {
                    Section {
                        ForEach(channels) { channel in
                            ChannelRow(channel: channel) { model.play(channel, in: channels) }
                                .listRowBackground(Theme.background)
                                .listRowSeparatorTint(Theme.border)
                        }
                    } header: {
                        VStack(alignment: .leading, spacing: 12) {
                            ChipRow(options: chipOptions, selection: $category)
                                .padding(.horizontal, -16)
                            Text("CHAÎNES · \(channels.count)")
                                .font(.caption.weight(.bold))
                                .tracking(1.5)
                                .foregroundStyle(Theme.muted)
                        }
                        .textCase(nil)
                        .padding(.vertical, 8)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .refreshable { await model.load(.live) }
            }
            .screenBackground()
            .navigationTitle("En direct")
            .searchable(text: $query, prompt: "Rechercher une chaîne")
            .task { await model.loadIfNeeded(.live) }
        }
    }
}

struct ChannelRow: View {
    let channel: MediaItem
    var isPlaying = false
    let action: () -> Void

    @EnvironmentObject private var model: AppModel

    var body: some View {
        HStack(spacing: 12) {
            Button(action: action) {
                HStack(spacing: 12) {
                    ChannelLogo(item: channel)
                    Text(channel.name)
                        .font(.subheadline.weight(isPlaying ? .bold : .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    if isPlaying {
                        Image(systemName: "waveform")
                            .foregroundStyle(Theme.accentLight)
                    }
                    if let badge = channel.qualityBadge {
                        QualityBadge(text: badge)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button {
                model.toggleFavorite(channel)
            } label: {
                Image(systemName: model.isFavorite(channel) ? "heart.fill" : "heart")
                    .foregroundStyle(model.isFavorite(channel) ? Theme.cinema : Theme.muted)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
    }
}
