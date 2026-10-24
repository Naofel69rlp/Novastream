import SwiftUI

struct FavoritesView: View {
    @EnvironmentObject private var model: AppModel

    private var channels: [MediaItem] { model.favorites.filter { $0.kind == .live } }
    private var titles: [MediaItem] { model.favorites.filter { $0.kind != .live } }

    var body: some View {
        NavigationStack {
            ScrollView {
                if model.favorites.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "heart")
                            .font(.system(size: 44))
                            .foregroundStyle(Theme.muted)
                        Text("Votre liste est vide")
                            .font(.headline)
                            .foregroundStyle(.white)
                        Text("Ajoutez des chaînes, des films ou des séries avec le bouton « Ma liste » ou le cœur.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                            .multilineTextAlignment(.center)
                    }
                    .padding(40)
                    .padding(.top, 60)
                } else {
                    VStack(alignment: .leading, spacing: 24) {
                        if !channels.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                SectionHeader(title: "Chaînes")
                                VStack(spacing: 0) {
                                    ForEach(channels) { channel in
                                        ChannelRow(channel: channel) { model.play(channel, in: channels) }
                                            .padding(.horizontal, 16)
                                        Divider().overlay(Theme.border).padding(.leading, 72)
                                    }
                                }
                            }
                        }
                        if !titles.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                SectionHeader(title: "Films et séries")
                                LazyVGrid(columns: [GridItem(.adaptive(minimum: 104, maximum: 180), spacing: 12, alignment: .top)],
                                          spacing: 18) {
                                    ForEach(titles) { item in
                                        NavigationLink(value: item) { PosterCard(item: item) }
                                            .buttonStyle(.plain)
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                        }
                    }
                    .padding(.vertical, 12)
                }
            }
            .screenBackground()
            .navigationTitle("Ma liste")
            .mediaDestinations()
        }
    }
}
